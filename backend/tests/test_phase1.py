"""
Phase 1 集成测试：文档转化 + 基础 RAG 质量
运行方式：pytest backend/tests/test_phase1.py -v -s

前提：
  1. Phase 0 通过
  2. tests/fixtures/sample_docs/ 已放入真实项目文档
  3. tests/fixtures/phase1_questions.json 已准备测试问题
"""

import pytest
import json
import httpx
import asyncio
from pathlib import Path

# ──────────────────────────────────────────────
# 测试配置
# ──────────────────────────────────────────────

FIXTURES_DIR = Path(__file__).parent / "fixtures"
SAMPLE_DOCS_DIR = FIXTURES_DIR / "sample_docs"
QUESTIONS_FILE = FIXTURES_DIR / "phase1_questions.json"
API_BASE = "http://localhost:8000"

# 至少需要的文档数
MIN_DOCS = 5
# 转化成功率阈值
MIN_SUCCESS_RATE = 0.9
# 平均转化质量阈值
MIN_AVG_QUALITY = 0.7
# 每篇文档最少切片数
MIN_CHUNKS_PER_DOC = 5


# ──────────────────────────────────────────────
# 辅助函数
# ──────────────────────────────────────────────

def upload_document(filepath: Path) -> dict:
    """上传单个文档并等待处理完成"""
    with open(filepath, "rb") as f:
        r = httpx.post(
            f"{API_BASE}/api/documents/upload",
            files={"file": (filepath.name, f)},
            timeout=60,
        )
    r.raise_for_status()
    doc_id = r.json()["id"]

    # 轮询状态（最多等 5 分钟）
    for _ in range(60):
        import time
        time.sleep(5)
        status_r = httpx.get(f"{API_BASE}/api/documents/{doc_id}/status", timeout=10)
        status = status_r.json()["conversion_status"]
        if status in ("completed", "failed"):
            break

    return httpx.get(f"{API_BASE}/api/documents/{doc_id}", timeout=10).json()


def ask_question(question: str, filters: dict | None = None) -> dict:
    """向知识库提问"""
    payload = {"question": question}
    if filters:
        payload["filters"] = filters

    r = httpx.post(
        f"{API_BASE}/api/qa/ask",
        json=payload,
        timeout=60,
    )
    r.raise_for_status()
    return r.json()


def save_for_human_review(data: list, filename: str):
    """保存问答结果供人工审核"""
    output_path = FIXTURES_DIR / filename
    with open(output_path, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    print(f"\n📄 已保存到: {output_path}")


# ──────────────────────────────────────────────
# 文档转化测试
# ──────────────────────────────────────────────

class TestDocumentConversion:
    """文档转化流水线测试"""

    @pytest.fixture(scope="class")
    def sample_docs(self):
        """收集测试文档"""
        docs = list(SAMPLE_DOCS_DIR.glob("*.docx")) + \
               list(SAMPLE_DOCS_DIR.glob("*.pdf")) + \
               list(SAMPLE_DOCS_DIR.glob("*.pptx"))
        assert len(docs) >= MIN_DOCS, \
            f"测试文档不足。请在 {SAMPLE_DOCS_DIR} 放入至少 {MIN_DOCS} 份文档"
        return docs

    @pytest.fixture(scope="class")
    def conversion_results(self, sample_docs):
        """批量上传并转化（class 级缓存，避免重复上传）"""
        results = []
        for doc_path in sample_docs:
            print(f"\n  上传: {doc_path.name}")
            try:
                result = upload_document(doc_path)
                results.append(result)
                print(f"  状态: {result['conversion_status']}  |  切片数: {result.get('chunk_count', 0)}")
            except Exception as e:
                results.append({
                    "filename": doc_path.name,
                    "conversion_status": "failed",
                    "error": str(e),
                })
        return results

    def test_conversion_success_rate(self, conversion_results):
        """转化成功率 >= 90%"""
        total = len(conversion_results)
        succeeded = sum(1 for r in conversion_results if r["conversion_status"] == "completed")
        rate = succeeded / total
        print(f"\n转化成功率: {rate:.0%} ({succeeded}/{total})")

        failed = [r for r in conversion_results if r["conversion_status"] != "completed"]
        if failed:
            for r in failed:
                print(f"  ⚠️  失败: {r.get('filename', r.get('original_filename'))}  {r.get('error', '')}")

        assert rate >= MIN_SUCCESS_RATE, f"转化成功率 {rate:.0%} 低于 {MIN_SUCCESS_RATE:.0%}"

    def test_chunk_count_reasonable(self, conversion_results):
        """每篇文档切片数量合理（>= 5 个）"""
        completed = [r for r in conversion_results if r["conversion_status"] == "completed"]
        total_chunks = sum(r.get("chunk_count", 0) for r in completed)

        print(f"\n总切片数: {total_chunks}，平均: {total_chunks/len(completed):.1f}")

        for r in completed:
            count = r.get("chunk_count", 0)
            name = r.get("original_filename", "unknown")
            if count < MIN_CHUNKS_PER_DOC:
                print(f"  ⚠️  切片过少: {name} → {count} 个")

        too_few = [r for r in completed if r.get("chunk_count", 0) < MIN_CHUNKS_PER_DOC]
        assert len(too_few) == 0, \
            f"有 {len(too_few)} 篇文档切片数不足 {MIN_CHUNKS_PER_DOC} 个"

    def test_markdown_not_empty(self, conversion_results):
        """转化后 Markdown 内容不为空"""
        completed = [r for r in conversion_results if r["conversion_status"] == "completed"]
        for r in completed:
            name = r.get("original_filename", "unknown")
            markdown = r.get("markdown_content", "")
            assert markdown and len(markdown) > 100, \
                f"文档 '{name}' 转化后 Markdown 内容过短或为空"


# ──────────────────────────────────────────────
# RAG 问答质量测试
# ──────────────────────────────────────────────

# 内置 20 个测试问题（若 fixtures 文件不存在则使用这里的）
DEFAULT_TEST_QUESTIONS = [
    {
        "question": "制造业客户的 CRM 实施一般分几个阶段？",
        "expected_ltc_stage": "delivery",
        "expected_keywords": ["需求调研", "系统配置", "数据迁移", "培训", "验收"],
    },
    {
        "question": "数据迁移时如何处理历史数据中的重复记录？",
        "expected_ltc_stage": "delivery",
        "expected_keywords": ["去重", "清洗", "匹配规则"],
    },
    {
        "question": "纷享销客 CRM 的主要功能模块有哪些？",
        "expected_ltc_stage": "opportunity",
        "expected_keywords": ["销售", "客户", "商机", "合同"],
    },
    {
        "question": "项目验收标准一般包括哪些方面？",
        "expected_ltc_stage": "delivery",
        "expected_keywords": ["验收", "测试", "用户培训", "上线"],
    },
    {
        "question": "如何制定产品 Demo 演示计划？",
        "expected_ltc_stage": "opportunity",
        "expected_keywords": ["演示", "方案", "场景", "客户需求"],
    },
]


class TestRAGQuality:
    """RAG 问答质量测试"""

    @pytest.fixture(scope="class")
    def test_questions(self):
        """加载测试问题（优先 fixture 文件，否则用内置）"""
        if QUESTIONS_FILE.exists():
            with open(QUESTIONS_FILE, encoding="utf-8") as f:
                return json.load(f)
        print(f"\n  ⚠️  {QUESTIONS_FILE} 不存在，使用内置 {len(DEFAULT_TEST_QUESTIONS)} 个问题")
        return DEFAULT_TEST_QUESTIONS

    @pytest.fixture(scope="class")
    def qa_results(self, test_questions):
        """批量提问（class 级缓存）"""
        results = []
        for q in test_questions:
            print(f"\n  提问: {q['question']}")
            try:
                resp = ask_question(q["question"])
                result = {
                    "question": q["question"],
                    "answer": resp.get("answer", ""),
                    "sources": resp.get("sources", []),
                    "model_used": resp.get("model_used", ""),
                    "expected_keywords": q.get("expected_keywords", []),
                    "has_expected_keywords": any(
                        kw in resp.get("answer", "")
                        for kw in q.get("expected_keywords", [])
                    ),
                }
                print(f"  模型: {result['model_used']}  |  引用: {len(result['sources'])} 条")
                results.append(result)
            except Exception as e:
                results.append({
                    "question": q["question"],
                    "answer": "",
                    "sources": [],
                    "error": str(e),
                    "has_expected_keywords": False,
                })
        return results

    def test_all_questions_answered(self, qa_results):
        """所有问题都有回答（非空）"""
        unanswered = [r for r in qa_results if not r.get("answer")]
        for r in unanswered:
            print(f"  ❌ 未回答: {r['question']}  错误: {r.get('error', '')}")
        assert len(unanswered) == 0, f"有 {len(unanswered)} 个问题未得到回答"

    def test_answers_have_sources(self, qa_results):
        """大部分回答（>= 80%）有引用来源"""
        with_sources = [r for r in qa_results if len(r.get("sources", [])) > 0]
        rate = len(with_sources) / len(qa_results)
        print(f"\n有引用率: {rate:.0%}")
        assert rate >= 0.8, f"有引用率 {rate:.0%} 低于 80%"

    def test_keyword_hit_rate(self, qa_results):
        """关键词命中率 >= 60%（人工评判之前的最低保证）"""
        hits = [r for r in qa_results if r.get("has_expected_keywords")]
        rate = len(hits) / len(qa_results)
        print(f"\n关键词命中率: {rate:.0%} ({len(hits)}/{len(qa_results)})")
        assert rate >= 0.6, f"关键词命中率 {rate:.0%} 低于 60%"

    def test_save_for_human_review(self, qa_results):
        """保存问答结果供人工审核（始终通过）"""
        save_for_human_review(qa_results, "phase1_qa_review.json")
        assert True  # 保存操作本身不应该让测试失败
