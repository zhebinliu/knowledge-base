"""需求调研 v1 — LTC 标准流程骨架 + 结构化问卷 + 顾问录入回路。

与已有的 survey_modules.py / outline_modules.py 解耦,本模块作为增量层:
- ltc_dictionary.py — LTC 标准流程字典(8 主流程 + 5 横向支撑域)
- questionnaire_schema.py — 结构化题目数据契约
- sow_mapper.py — SOW 模块名 → LTC 字典 同义词归一
- kb_filter.py — KB 行业 knowhow 二次过滤
- scope_classifier.py — 范围四分类(需新建/数字化/搬迁/不纳入)
"""
