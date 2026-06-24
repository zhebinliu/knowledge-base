# 会议 Co-pilot:未决建议「完成/删除」+ 详情页转写时间轴对应(2026-06-24)— 已完成

## 任务 1:未决建议加「完成 / 删除」(同步成果)✅
- [x] 后端 live_advice.py:`resolve_advice()` → status='resolved'(抽 `_set_status` 复用 dismiss)
- [x] 后端 live_advice.py:`get_live_advice(include_resolved)` → 附带 `resolved_advice`
- [x] 后端 api/meeting.py:`POST /{id}/live-advice/{aid}/resolve`;GET 加 `?include_resolved`
- [x] backend/ 与 meeting/backend/ 双份同步(AST 校验通过)
- [x] 前端 client.ts:`resolveLiveAdvice()`;`getLiveAdvice(id, includeResolved)`;`resolved_advice?`
- [x] ConsoleMeetingNew renderAdviceCard:✓完成 / 删除(替换单 X)
- [x] ConsoleMeetingDetail AdviceTab:每卡 ✓完成 / 删除;底部「已完成 (N)」可展开区

## 任务 2:详情页转写与建议时间轴对应 ✅
- [x] AdviceTab 改两栏时间轴:左 [MM:SS]+该段转写(可跳转)/ 右 该段建议
- [x] `parseTxSegments` 解析 [MM:SS]/[HH:MM:SS] 行成段;无时间戳续行并入上段
- [x] 建议按 source_ts 落段;null/未匹配 → 底部「未定位到具体时间」组
- [x] 无时间戳会议(text/部分上传)→ 回退原排序卡片列表
- [x] frontend 与 meeting/frontend 同步

## 验证
- 后端:AST 校验两份均通过;无需迁移(status/resolved_at 已存在)
- 前端:`tsc` 对 3 个改动文件零报错
- 沉浸式录音 + 详情页需 mic/后端/数据,headless 无法真跑,靠 tsc + 逻辑核对
