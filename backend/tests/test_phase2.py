"""
Phase 2 集成测试：LTC 切片分类准确率
运行方式：pytest backend/tests/test_phase2.py -v -s

前提：
  1. Phase 1 通过（切片已入库）
  2. tests/fixtures/golden_labels.json 已准备 100 个人工标注切片
"""

import pytest
import json
import httpx
import asyncio
from pathlib import Path

# ──────────────────────────────────────────────
# 配置
# ──────────────────────────────────────────────

FIXTURES_DIR = Path(__file__).parent / "fixtures"
GOLDEN_LABELS_FILE = FIXTURES_DIR / "golden_labels.json"
API_BASE = "http://localhost:8000"

# 分类准确率阈值
MIN_LTC_ACCURACY_M2_5 = 0.80    # MiniMax M2.5 初始分类
MIN_LTC_ACCURACY_AFTER_REVIEW = 0.88  # 经 GLM-5 复审后
MIN_INDUSTRY_ACCURACY = 0.75
LOW_CONFIDENCE_THRESHOLD = 0.85


# ──────────────────────────────────────────────
# 辅助：加载 golden labels
# ──────────────────────────────────────────────

@pytest.fixture(scope="module")
def golden_labels():
    """加载人工标注数据"""
    if not GOLDEN_LABELS_FILE.exists():
        pytest.skip(
            f"golden_labels.json 不存在，请先在 {GOLDEN_LABELS_FILE} 准备 100 个人工标注切片。\n"
            "格式: [{\"chunk_content\": \"...\", \"ltc_stage\": \"delivery\", \"industry\": \"manufacturing\"}, ...]"
        )
    with open(GOLDEN_LABELS_FILE, encoding="utf-8") as f:
        labels = json.load(f)
    assert len(labels) >= 50, f"golden labels 数量不足，当前 {len(labels)}，建议至少 100 个"
    return labels


# ──────────────────────────────────────────────
# 调用分类接口的辅助
# ──────────────────────────────────────────────

async def classify_chunk_via_agent(content: str, model: str) -> dict:
    """直接调用 slicer_agent 的分类逻辑（绕过上传流程）"""
    from agents.slicer_agent import classify_single_chunk
    return await classify_single_chunk(content=content, model=model)


# ──────────────────────────────────────────────
# 测试：MiniMax M2.5 初始分类
# ──────────────────────────────────────────────

class TestM25Classification:
    """MiniMax M2.5 初始切片分类准确率"""

    @pytest.fixture(scope="class")
    def m25_predictions(self, golden_labels):
        """批量运行 M2.5 分类（class 缓存）"""
        predictions = []
        for item in golden_labels:
            try:
                pred = asyncio.run(
                    classify_chunk_via_agent(item["chunk_content"], model="minimax-m2.5")
                )
                predictions.append({
                    "true_ltc": item["ltc_stage"],
                    "pred_ltc": pred.get("ltc_stage", "unknown"),
                    "confidence": pred.get("ltc_stage_confidence", 0.0),
                    "true_industry": item.get("industry"),
                    "pred_industry": pred.get("industry"),
                })
            except Exception as e:
                predictions.append({
                    "true_ltc": item["ltc_stage"],
                    "pred_ltc": "error",
                    "confidence": 0.0,
                    "error": str(e),
                })
        return predictions

    def test_ltc_accuracy(self, m25_predictions):
        """LTC 阶段分类准确率 >= 80%"""
        total = len(m25_predictions)
        correct = sum(1 for p in m25_predictions if p["pred_ltc"] == p["true_ltc"])
        acc = correct / total
        print(f"\n  M2.5 LTC 分类准确率: {acc:.1%} ({correct}/{total})")
        assert acc >= MIN_LTC_ACCURACY_M2_5, \
            f"准确率 {acc:.1%} 低于目标 {MIN_LTC_ACCURACY_M2_5:.0%}"

    def test_industry_accuracy(self, m25_predictions):
        """行业分类准确率 >= 75%"""
        with_industry = [
            p for p in m25_predictions
            if p.get("true_industry") and p.get("pred_industry")
        ]
        if not with_industry:
            pytest.skip("golden labels 中无行业标注")

        correct = sum(1 for p in with_industry if p["pred_industry"] == p["true_industry"])
        acc = correct / len(with_industry)
        print(f"\n  M2.5 行业分类准确率: {acc:.1%} ({correct}/{len(with_industry)})")
        assert acc >= MIN_INDUSTRY_ACCURACY, \
            f"行业准确率 {acc:.1%} 低于目标 {MIN_INDUSTRY_ACCURACY:.0%}"

    def test_low_confidence_rate(self, m25_predictions):
        """低置信度切片占比（用于审核队列评估）"""
        low_conf = [p for p in m25_predictions if p["confidence"] < LOW_CONFIDENCE_THRESHOLD]
        rate = len(low_conf) / len(m25_predictions)
        print(f"\n  低置信度占比: {rate:.1%} ({len(low_conf)}/{len(m25_predictions)})")
        # 低置信度比例不应超过 40%（太高说明 prompt 效果差）
        assert rate <= 0.40, f"低置信度比例 {rate:.1%} 过高（> 40%），请优化 Prompt"

    def test_confusion_matrix(self, m25_predictions):
        """打印 LTC 混淆矩阵（调试用，始终通过）"""
        from collections import Counter
        errors = Counter()
        for p in m25_predictions:
            if p["pred_ltc"] != p["true_ltc"]:
                errors[f"{p['true_ltc']} → {p['pred_ltc']}"] += 1

        if errors:
            print("\n  LTC 分类错误分布（高频错误优先）:")
            for pattern, count in errors.most_common(10):
                print(f"    {count:3d} 次  {pattern}")
        else:
            print("\n  ✅ 无分类错误")
        assert True


# ──────────────────────────────────────────────
# 测试：GLM-5 复审提升效果
# ──────────────────────────────────────────────

class TestGLM5ReviewImprovement:
    """GLM-5 对低置信度切片的复审提升"""

    def test_review_improves_accuracy(self, golden_labels):
        """复审后整体准确率 >= 88%"""
        total = len(golden_labels)
        correct_after_review = 0
        reviewed_count = 0
        improved_count = 0

        for item in golden_labels:
            # 第一轮：M2.5
            initial = asyncio.run(
                classify_chunk_via_agent(item["chunk_content"], model="minimax-m2.5")
            )
            initial_correct = initial.get("ltc_stage") == item["ltc_stage"]

            if initial.get("ltc_stage_confidence", 1.0) < LOW_CONFIDENCE_THRESHOLD:
                # 低置信度：GLM-5 复审
                reviewed_count += 1
                review = asyncio.run(
                    classify_chunk_via_agent(item["chunk_content"], model="glm-5")
                )
                review_correct = review.get("ltc_stage") == item["ltc_stage"]
                correct_after_review += 1 if review_correct else 0
                if not initial_correct and review_correct:
                    improved_count += 1
            else:
                # 高置信度：直接采纳
                correct_after_review += 1 if initial_correct else 0

        final_acc = correct_after_review / total

        print(f"\n  复审切片数: {reviewed_count}")
        print(f"  复审改正数: {improved_count}")
        print(f"  最终准确率: {final_acc:.1%}")

        assert final_acc >= MIN_LTC_ACCURACY_AFTER_REVIEW, \
            f"复审后准确率 {final_acc:.1%} 低于目标 {MIN_LTC_ACCURACY_AFTER_REVIEW:.0%}"

    def test_review_not_worse(self, golden_labels):
        """GLM-5 复审不会让已正确的分类变错"""
        degraded = 0
        for item in golden_labels:
            initial = asyncio.run(
                classify_chunk_via_agent(item["chunk_content"], model="minimax-m2.5")
            )
            if (initial.get("ltc_stage") == item["ltc_stage"] and
                    initial.get("ltc_stage_confidence", 1.0) < LOW_CONFIDENCE_THRESHOLD):
                # 本来正确但需要复审
                review = asyncio.run(
                    classify_chunk_via_agent(item["chunk_content"], model="glm-5")
                )
                if review.get("ltc_stage") != item["ltc_stage"]:
                    degraded += 1

        print(f"\n  复审导致退步的切片数: {degraded}")
        # 退步率不超过 5%
        assert degraded / len(golden_labels) <= 0.05, \
            f"复审退步率过高: {degraded}/{len(golden_labels)}"


# ──────────────────────────────────────────────
# 测试：审核队列接口
# ──────────────────────────────────────────────

class TestReviewQueueAPI:
    """审核队列 API 功能测试"""

    def test_review_queue_returns_list(self):
        """审核队列接口可正常返回待审核列表"""
        r = httpx.get(f"{API_BASE}/api/review/queue", timeout=10)
        assert r.status_code == 200
        data = r.json()
        assert isinstance(data, list), f"期望列表，实际: {type(data)}"
        print(f"\n  当前审核队列: {len(data)} 条")

    def test_review_queue_items_have_required_fields(self):
        """审核队列条目包含必要字段"""
        r = httpx.get(f"{API_BASE}/api/review/queue", timeout=10)
        assert r.status_code == 200
        items = r.json()
        if not items:
            pytest.skip("审核队列为空，跳过字段检查")

        required_fields = {"id", "chunk_id", "reason", "created_at"}
        for item in items[:5]:  # 只检查前 5 条
            missing = required_fields - set(item.keys())
            assert not missing, f"审核队列条目缺少字段: {missing}"
