"""
文档转化 Agent
1. 用 pymupdf/python-docx/python-pptx 提取原始文本（本地，无模型）
2. 将粗文本发送给 MiniMax M2.5 整理为结构化 Markdown
"""

import io
import structlog
from services.model_router import model_router
from prompts.conversion import build_conversion_prompt

logger = structlog.get_logger()

SUPPORTED_FORMATS = {".docx", ".pdf", ".pptx", ".xlsx", ".csv", ".md", ".txt"}
MAX_CHUNK_CHARS = 50000


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


async def convert_to_markdown(filename: str, content: bytes) -> tuple[str, str | None]:
    """Returns (markdown_text, model_name_or_None)."""
    ext = "." + filename.rsplit(".", 1)[-1].lower() if "." in filename else ""

    if ext in (".md", ".txt"):
        return content.decode("utf-8", errors="replace"), None

    raw_text = extract_raw_text(filename, content)
    logger.info("text_extracted", filename=filename, chars=len(raw_text))

    # 分段发送（超过 MAX_CHUNK_CHARS 时）
    if len(raw_text) <= MAX_CHUNK_CHARS:
        segments = [raw_text]
    else:
        segments = [raw_text[i:i + MAX_CHUNK_CHARS] for i in range(0, len(raw_text), MAX_CHUNK_CHARS)]

    markdown_parts = []
    used_model = None
    for i, segment in enumerate(segments):
        prompt = await build_conversion_prompt(segment)
        result, used_model = await model_router.chat_with_routing(
            "conversion",
            [{"role": "user", "content": prompt}],
            max_tokens=8000,
            timeout=180.0,
        )
        markdown_parts.append(result)
        logger.info("segment_converted", filename=filename, segment=i + 1, total=len(segments), model=used_model)

    return "\n\n".join(markdown_parts), used_model
