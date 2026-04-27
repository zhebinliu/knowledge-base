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

SUPPORTED_FORMATS = {".docx", ".pdf", ".pptx", ".xlsx", ".csv", ".md", ".txt"}
# 转换分段大小：~10K 字符约对应 5-7K tokens 输入，配合 max_tokens=8000 输出
# 留约 1.2x 膨胀空间和 reasoning model 的 <think> 预算，避免输出被截断。
# 历史值是 50000，配 8000 输出强制 4x 压缩，导致大量文档后半段丢失。
MAX_CHUNK_CHARS = 10000
# 截断检测阈值：单段输出字符数若 ≥ 该值，认为命中 max_tokens 上限被截断
TRUNCATION_WARN_CHARS = 11000


def extract_text_from_docx(content: bytes) -> str:
    from docx import Document
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


def extract_raw_text(filename: str, content: bytes) -> str:
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
