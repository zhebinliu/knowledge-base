"""
文档转化 Agent
1. 用 pymupdf/python-docx/python-pptx 提取原始文本（本地，无模型）
2. 将粗文本发送给 MiniMax M2.5 整理为结构化 Markdown
"""

import io
import re
import structlog
from services.model_router import model_router
from prompts.conversion import build_conversion_prompt

logger = structlog.get_logger()

SUPPORTED_FORMATS = {".doc", ".docx", ".pdf", ".ppt", ".pptx", ".xls", ".xlsx", ".csv", ".md", ".txt"}
# OLE2 二进制旧版 Office 格式 — 上传后先用 libreoffice headless 转成 OOXML 新格式
LEGACY_OFFICE_FORMATS = {".doc": ".docx", ".ppt": ".pptx", ".xls": ".xlsx"}
# 转换分段大小：~10K 字符约对应 5-7K tokens 输入，配合 max_tokens=8000 输出
# 留约 1.2x 膨胀空间和 reasoning model 的 <think> 预算，避免输出被截断。
# 历史值是 50000，配 8000 输出强制 4x 压缩，导致大量文档后半段丢失。
MAX_CHUNK_CHARS = 10000
# 截断检测阈值：单段输出字符数若 ≥ 该值，认为命中 max_tokens 上限被截断
TRUNCATION_WARN_CHARS = 11000


def _docx_zip_fallback(content: bytes) -> str:
    """绕开 python-docx 直接从 zip 抽 word/document.xml 的纯文本。

    用于以下场景:
    - python-docx 报 "There is no item named 'NULL' in the archive"
      (WPS / Pages / LibreOffice 转换出的 docx,Content_Types.xml 里 PartName 异常)
    - 文件 OOXML 结构基本完整但 manifest 不规范
    - 其他 python-docx 严格校验失败但 zip 本身可读

    实现:zip 里找 word/document.xml,解析所有 <w:t> 文本节点拼起来。
    丢失格式 / 表格结构,但保留文字内容(对 LLM 后续理解够用)。
    """
    import zipfile, re
    from xml.etree import ElementTree as ET

    with zipfile.ZipFile(io.BytesIO(content)) as z:
        names = z.namelist()
        # 优先 word/document.xml,兜底任何 word/document*.xml
        target = None
        if "word/document.xml" in names:
            target = "word/document.xml"
        else:
            for n in names:
                if n.startswith("word/document") and n.endswith(".xml"):
                    target = n; break
        if not target:
            raise RuntimeError(f"docx zip 里找不到 word/document.xml (zip entries: {names[:8]}...)")
        xml_bytes = z.read(target)

    # 解析所有 <w:t> 文本(忽略命名空间)
    # 用宽松的正则兜底,避免 XML 解析对损坏文件再次抛错
    try:
        root = ET.fromstring(xml_bytes)
        ns = "{http://schemas.openxmlformats.org/wordprocessingml/2006/main}"
        texts = [t.text for t in root.iter(f"{ns}t") if t.text]
        # <w:p> 段落分隔
        paras = []
        cur = []
        for elem in root.iter():
            tag = elem.tag.replace(ns, "")
            if tag == "p":
                if cur:
                    paras.append("".join(cur).strip())
                    cur = []
            elif tag == "t" and elem.text:
                cur.append(elem.text)
        if cur:
            paras.append("".join(cur).strip())
        return "\n".join(p for p in paras if p)
    except ET.ParseError:
        # XML 也炸了 — 用正则硬抽 <w:t>...</w:t>
        text = xml_bytes.decode("utf-8", errors="replace")
        chunks = re.findall(r'<w:t[^>]*>([^<]*)</w:t>', text)
        return "\n".join(c for c in chunks if c.strip())


def extract_text_from_docx(content: bytes) -> str:
    """优先用 python-docx 严格解析(保留段落 + 表格);
    任何异常(包括 lazy-load 时的 KeyError)→ fallback 到 zip 直读。

    典型 fallback 触发:
      - "There is no item named 'NULL' in the archive" (WPS / Pages 异常 manifest)
      - python-docx 找不到 [Content_Types].xml 里声明的 part
      - zip 损坏但 word/document.xml 仍可读
    """
    from docx import Document
    try:
        doc = Document(io.BytesIO(content))
        parts = []
        for para in doc.paragraphs:
            if para.text.strip():
                parts.append(para.text)
        for table in doc.tables:
            for row in table.rows:
                row_text = " | ".join(cell.text.strip() for cell in row.cells)
                if row_text.strip():
                    parts.append(row_text)
        return "\n".join(parts)
    except Exception as e:
        msg = str(e)[:120]
        logger.warning("docx_strict_parse_failed_fallback", err=msg, exc_type=type(e).__name__)
        try:
            text = _docx_zip_fallback(content)
            if text.strip():
                logger.info("docx_zip_fallback_ok", chars=len(text), prev_err=msg)
                return text
            logger.warning("docx_zip_fallback_empty", prev_err=msg)
        except Exception as fb_err:
            logger.warning("docx_zip_fallback_also_failed", err=str(fb_err)[:120])
        # 兜底也失败 → 抛原异常,让 task retry / 用户看错误
        raise


def extract_text_from_pdf(content: bytes) -> str:
    import fitz
    doc = fitz.open(stream=content, filetype="pdf")
    parts = []
    for page_num, page in enumerate(doc, 1):
        text = page.get_text()
        if text.strip():
            parts.append(f"[第{page_num}页]\n{text}")
    return "\n\n".join(parts)


def extract_text_from_pptx(content: bytes) -> str:
    from pptx import Presentation
    prs = Presentation(io.BytesIO(content))
    parts = []
    for i, slide in enumerate(prs.slides, 1):
        slide_texts = []
        for shape in slide.shapes:
            if hasattr(shape, "text") and shape.text.strip():
                slide_texts.append(shape.text)
        if slide_texts:
            parts.append(f"[幻灯片{i}]\n" + "\n".join(slide_texts))
    return "\n\n".join(parts)


def extract_text_from_xlsx(content: bytes) -> str:
    import openpyxl

    def _extract_openpyxl(read_only: bool) -> str:
        wb = openpyxl.load_workbook(io.BytesIO(content), data_only=True, read_only=read_only)
        parts = []
        for sheet in wb.worksheets:
            parts.append(f"[Sheet: {sheet.title}]")
            for row in sheet.iter_rows(values_only=True):
                row_text = " | ".join(str(v) if v is not None else "" for v in row)
                if row_text.strip(" |"):
                    parts.append(row_text)
        return "\n".join(parts)

    def _extract_zip_fallback() -> str:
        """最后兜底：从 xlsx zip 中直接解析 sharedStrings.xml 提取所有文本。"""
        import zipfile
        import xml.etree.ElementTree as ET
        parts = []
        try:
            with zipfile.ZipFile(io.BytesIO(content)) as z:
                if "xl/sharedStrings.xml" in z.namelist():
                    with z.open("xl/sharedStrings.xml") as f:
                        tree = ET.parse(f)
                        ns = {"x": "http://schemas.openxmlformats.org/spreadsheetml/2006/main"}
                        for si in tree.findall(".//x:si", ns):
                            texts = [t.text for t in si.findall(".//x:t", ns) if t.text]
                            val = "".join(texts).strip()
                            if val:
                                parts.append(val)
        except Exception:
            pass
        return "\n".join(parts) if parts else "[无法解析此xlsx文件]"

    # 1. 普通模式
    try:
        return _extract_openpyxl(read_only=False)
    except Exception:
        pass
    # 2. 流式只读模式（跳过 DataValidation / 样式解析）
    try:
        return _extract_openpyxl(read_only=True)
    except Exception:
        pass
    # 3. 直接从 zip 解析 sharedStrings（兜底，无格式但不丢文本）
    return _extract_zip_fallback()


def _soffice_convert(content: bytes, src_ext: str, target_ext: str) -> bytes:
    """用 libreoffice headless 把 .doc/.ppt/.xls 转成 .docx/.pptx/.xlsx。

    target_ext 不含点 (传 'docx' / 'pptx' / 'xlsx')。
    soffice 必须在 PATH 里(Dockerfile 装了 libreoffice 包)。
    """
    import subprocess, tempfile, os
    target_clean = target_ext.lstrip(".")
    with tempfile.TemporaryDirectory() as tmpdir:
        in_path = os.path.join(tmpdir, f"input{src_ext}")
        with open(in_path, "wb") as f:
            f.write(content)
        # soffice --headless --convert-to docx input.doc --outdir /tmp/x
        try:
            proc = subprocess.run(
                ["soffice", "--headless", "--convert-to", target_clean,
                 "--outdir", tmpdir, in_path],
                capture_output=True, timeout=120,
            )
        except FileNotFoundError:
            raise RuntimeError("libreoffice 未安装(需 apt-get install libreoffice)")
        except subprocess.TimeoutExpired:
            raise RuntimeError(f"libreoffice 转换超时 (>120s) — 文件可能损坏或过大")
        if proc.returncode != 0:
            raise RuntimeError(
                f"libreoffice 转换失败 (rc={proc.returncode}): {proc.stderr.decode('utf-8', errors='replace')[:200]}"
            )
        # 找输出文件 (input.docx 等)
        out_name = f"input.{target_clean}"
        out_path = os.path.join(tmpdir, out_name)
        if not os.path.exists(out_path):
            # 兜底:扫目录里第一个匹配后缀的文件
            for fn in os.listdir(tmpdir):
                if fn.endswith(f".{target_clean}"):
                    out_path = os.path.join(tmpdir, fn)
                    break
            else:
                raise RuntimeError(f"libreoffice 没生成 {target_clean} 文件")
        with open(out_path, "rb") as f:
            return f.read()


def _normalize_legacy_office(filename: str, content: bytes) -> tuple[str, bytes]:
    """如果是 .doc/.ppt/.xls,先用 soffice 转成 .docx/.pptx/.xlsx,返回新文件名 + 内容。
    其他格式原样返回。
    """
    ext = "." + filename.rsplit(".", 1)[-1].lower() if "." in filename else ""
    if ext in LEGACY_OFFICE_FORMATS:
        target_ext = LEGACY_OFFICE_FORMATS[ext]
        logger.info("legacy_office_convert", src=ext, target=target_ext, filename=filename)
        new_content = _soffice_convert(content, src_ext=ext, target_ext=target_ext)
        # 替换扩展名
        base = filename.rsplit(".", 1)[0] if "." in filename else filename
        return f"{base}{target_ext}", new_content
    return filename, content


def extract_raw_text(filename: str, content: bytes) -> str:
    # 老 Office 格式先转换成新格式,再走原路径
    filename, content = _normalize_legacy_office(filename, content)
    ext = "." + filename.rsplit(".", 1)[-1].lower() if "." in filename else ""

    if ext == ".docx":
        return extract_text_from_docx(content)
    elif ext == ".pdf":
        return extract_text_from_pdf(content)
    elif ext == ".pptx":
        return extract_text_from_pptx(content)
    elif ext in (".xlsx",):
        return extract_text_from_xlsx(content)
    elif ext in (".csv", ".md", ".txt"):
        return content.decode("utf-8", errors="replace")
    else:
        raise ValueError(f"不支持的格式: {ext}")


def _xlsx_raw_to_markdown(raw_text: str, doc_title: str) -> str:
    """xlsx/csv 抽取出来的原始文本本身已结构化（[Sheet:xx] + " | " 分隔的行），
    转 markdown 不需要 LLM 重新理解，纯本地处理：
      - [Sheet: xx] -> ## xx
      - 每个 sheet 第一行作为表头，紧跟 | --- | 分隔行
      - 数据行用 markdown table 格式 | a | b | c |
      - cell 内换行替换为 <br>
    """
    out: list[str] = [f"# {doc_title}", ""]
    lines = [ln for ln in raw_text.split("\n") if ln.strip()]
    in_table = False
    is_first_row = True
    col_count = 0

    def _normalize_row(line: str) -> tuple[str, int]:
        cells = [c.strip().replace("\n", "<br>") for c in line.split(" | ")]
        return "| " + " | ".join(cells) + " |", len(cells)

    for ln in lines:
        if ln.startswith("[Sheet: ") and ln.endswith("]"):
            sheet_name = ln[len("[Sheet: "):-1].strip()
            out.append("")
            out.append(f"## Sheet：{sheet_name}")
            out.append("")
            in_table = False
            is_first_row = True
            continue

        # 普通文本行（无 ` | `）
        if " | " not in ln:
            # 收尾上一段表格
            if in_table:
                out.append("")
                in_table = False
                is_first_row = True
            out.append(ln)
            continue

        # 表格行
        row_md, cnt = _normalize_row(ln)
        if is_first_row or cnt != col_count:
            # 起新表 / 列数变化时另起一表
            if in_table and not is_first_row:
                out.append("")
            out.append(row_md)
            out.append("| " + " | ".join(["---"] * cnt) + " |")
            col_count = cnt
            in_table = True
            is_first_row = False
        else:
            out.append(row_md)

    return "\n".join(out).strip() + "\n"


async def convert_to_markdown(filename: str, content: bytes) -> tuple[str, str | None]:
    """Returns (markdown_text, model_name_or_None)."""
    # 老 Office 格式 (.doc/.ppt/.xls) 先用 soffice 转成新格式,后续 ext 判断按新格式走
    filename, content = _normalize_legacy_office(filename, content)
    ext = "." + filename.rsplit(".", 1)[-1].lower() if "." in filename else ""

    if ext in (".md", ".txt"):
        return content.decode("utf-8", errors="replace"), None

    raw_text = extract_raw_text(filename, content)
    logger.info("text_extracted", filename=filename, chars=len(raw_text))

    # xlsx / csv 走本地 fast path：原始抽取已是结构化表格，LLM 能加的价值有限，
    # 直接构造 markdown 既零 token 消耗，也不会被 max_tokens 截断。
    if ext in (".xlsx", ".csv"):
        if not raw_text.strip():
            return "", None
        doc_title = filename.rsplit(".", 1)[0]
        md = _xlsx_raw_to_markdown(raw_text, doc_title)
        logger.info("converted_local_fast_path", filename=filename, ext=ext, chars=len(md))
        return md, None

    # 分段发送（超过 MAX_CHUNK_CHARS 时）
    if len(raw_text) <= MAX_CHUNK_CHARS:
        segments = [raw_text]
    else:
        segments = [raw_text[i:i + MAX_CHUNK_CHARS] for i in range(0, len(raw_text), MAX_CHUNK_CHARS)]

    # 分段并发调 LLM —— Semaphore=3 限流，避免 provider 限速
    import asyncio
    sem = asyncio.Semaphore(3)

    async def _convert_one(idx: int, segment: str) -> tuple[int, str, str | None]:
        async with sem:
            prompt = await build_conversion_prompt(segment)
            result, model = await model_router.chat_with_routing(
                "conversion",
                [{"role": "user", "content": prompt}],
                max_tokens=8000,
                timeout=180.0,
            )
            result = re.sub(r"<think>[\s\S]*?</think>", "", result, flags=re.IGNORECASE).strip()
            # 截断检测：输出字符数贴近 max_tokens 对应字符上限就 warn
            if len(result) >= TRUNCATION_WARN_CHARS:
                logger.warning(
                    "segment_likely_truncated",
                    filename=filename, segment=idx + 1, total=len(segments),
                    output_chars=len(result), input_chars=len(segment), model=model,
                )
            logger.info("segment_converted", filename=filename, segment=idx + 1, total=len(segments), model=model)
            return idx, result, model

    outputs = await asyncio.gather(*[_convert_one(i, s) for i, s in enumerate(segments)])
    outputs.sort(key=lambda x: x[0])
    markdown_parts = [o[1] for o in outputs]
    used_model = next((o[2] for o in outputs if o[2]), None)

    return "\n\n".join(markdown_parts), used_model
