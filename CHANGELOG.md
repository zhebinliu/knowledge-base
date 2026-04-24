# 更新亮点

面向内部 PM / 实施顾问，按主题归类。最新更新在上。

---

## 2026-04-24 — 知识质量治理 Block 2（反馈飞轮）

**影响**：用户 👎、Challenge 失败题不再只停在日志里 —— 会回溯到被引用的切片与 (LTC 阶段 × 行业) 覆盖图，告诉 PM 该补哪些内容。

- 点踩（👎）→ 引用到的切片 `down_votes += 1`；累计 ≥2 自动入 `review_queue`，reason 写"用户反馈负面 ×N"
- Challenge 失败或自评 <0.8 → 按 (ltc_stage, industry) 聚合进新表 `coverage_gaps`，累加 fail_count、合并关键词、保留最近样题
- 新 API `GET /api/coverage/gaps` 按失败次数降序返回 Top N 缺口
- Dashboard 新增"知识覆盖缺口"卡：展示缺口阶段 / 行业 / 关键词 / 样题，点击跳 `/challenge?stage=XXX` 预填阶段
- 挑战历史抽屉新增"重跑此批"按钮，一键带回相同阶段去验证 gap 是否关闭
- 迁移：`chunks.down_votes` 列通过 startup `ALTER TABLE IF NOT EXISTS` 幂等添加，不动现有数据

## 2026-04-24 — 知识质量治理 Block 1（检索闸门 + 引用热度）

**影响**：从今天起 `ask_kb` / `search_kb` 默认只回召"已批准 / 自动批准"切片，待复审与驳回的不再污染答案；高频被引用的切片在 rerank 里更靠前。

- Qdrant payload 写入 `review_status` + `ltc_stage_confidence`；`vector_store.search()` 默认 filter，调试时可传 `include_unreviewed=True`
- rerank 得分叠加 `log(1+引用数) × 0.05`，30 天内被引 +0.03
- 审核端：approve / reject 会立刻把 `review_status` 同步写回 Qdrant，审核结果实时生效
- 审核页：>7 天积压红色"积压 N 天"徽标 + "全部通过"批量动作
- 迁移：`scripts/backfill_qdrant_payload.py` 幂等回填现存点，不重算向量、不删点

## 问答体验升级

- **多轮对话**：history 改传真实 messages 数组，上下文不再错位；提示词版本哨兵强制升级
- **👍 / 👎 反馈**：可在答案气泡上直接打分；负反馈连回 AnswerLog
- **未解决队列**：系统拒答或用户点👎的问题单独入队，可集中处理
- **PM persona**：MCP `ask_kb` 支持 `persona=pm` + `project=<ID或名称>`，以项目经理视角回答"状态 / 下一步 / 风险"
- **自由提问模式**：Challenge 页现在可以直接提问而不必用自动考题
- **拒答策略**：原先过严的判断已放宽，少答错与多拒答之间取更实用的平衡
- UI 细节：长回答截断修复；等待时双气泡不再重叠

## 数据看板

- 首页新增**行业分布** + **文档类型分布**面板
- **文档处理进度卡**：上传 / 转写 / 切片 / 重试中实时计数，全部处理完后自动隐藏
- 统计卡紧凑化（不再铺满整行）
- 所有时间戳强制北京时区，消解 naive UTC 被当本地的 8 小时误差
- 各阶段耗时打点（转写 / 切片 / 向量化）

## 文档摄取 & 稳定性

- 切片并发 4→8，转写分段并发化；Celery worker 并发 1→2→4
- 复审模型 glm-5→minimax-m2.7，单条不再拖到 150s+
- 复审阈值 0.85→0.7，并增加"JSON 缺前导 `{`"的兜底解析
- 自动推断文档类型（产品手册 / 方案 / 案例等）
- 文档和项目支持行业标签，向量元数据携带文档行业
- Celery 启动时自动恢复卡死任务
- xlsx 处理：DataValidation / sharedStrings 多处兜底，避免小文件炸队列
- 上传 nginx `client_max_body_size` 放大到 100m

## 对外 API & 权限

- **永久 MCP API Key**：每用户一把，可在 /api 页查看 / 复制 / 下载
- MCP ask_kb 默认同步返回（不再走 SSE，修复 Claude Code 调用挂起）
- 管理员可逐用户控制 API / MCP 权限 + 新建用户 + 模块访问粒度
- JWT 刷新：端点 + 前端自动续期拦截器 + UI

## UI & 设计系统

- `/ds` 设计系统页 + 7 个新组件类 + token CSS/JSON 下载
- `/api` 文档页对齐设计系统
- 知识库（Chunks）& 文档列表分页
- 项目 / 文档类型可在列表页内联编辑
- 中文化全面补齐（含枚举、行业标签 real_estate / energy / government 等）

## 知识加工

- 转写 / 切片输出统一剥离 `<think>` 推理块（前端不再看到思考内容）
- 文档摘要 / FAQ 自动生成
- Challenge：答题评判并行化 + 各阶段打点
