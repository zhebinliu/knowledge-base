# 任务:场景 AI 能力自动匹配 + prod 磁盘满事故处理(2026-07-13)

- 新增 services/scene_ai_match(LLM 按域→≤10 小批→重试→权威覆盖)+ POST /scenes/ai-match + 场景库中心「AI 自动匹配」按钮。commit e1e129f。
- **prod 事故**:/opt/data 20G 满(旧镜像)→ postgres No space→崩溃回环 → deploy 失败自动回滚。按记忆 project_prod_disk_full_optdata:docker image prune -a -f 清 2.66GB → 重启 pg/backend/frontend → prod 恢复 → 重部署成功。
- 首版按大域整批(LTC 48)截断失败 → 改小批+重试修复。
- 匹配结果(prod 落库):29 场景 / 123 关联(ITR10/LTC10/MPR9;MCR0/MTL0)。匹配质量高(线索→线索评分、商机→商机画像/决策链/竞争分析、费用→取价/促销/返利);精度优先、召回偏保守,MCR/MTL 空 + LTC 稀疏可后续调 prompt 放宽。
- 场景库中心每个匹配场景显示 AI 能力,可手动改;按钮可重跑。

---

# 任务:场景驱动调研引导(2026-07-14)—— 三块

- **Part1 场景「关键调研问题」字段**:StandardScene 加 research_questions;AI 生成草稿 + 编辑抽屉可编辑;场景库批量生成按钮。
- **Part2 调研议程**:项目 → 应覆盖场景(按域/阶段)+ 每场景关键问题 + 覆盖/缺口状态。✅ 已部署待测
- **Part3 会议 Copilot 接场景**:会中把项目应覆盖场景 + 关键问题作为定向引导上下文。✅ 已部署 + 实测
  - [x] live_advice.py 注入场景引导(scene_guidance_text);两份副本(main + meeting overlay)一起改
  - [x] 只在有活跃域(跑过命中)时注入,否则 147 场景无方向成噪音
  - [x] 实测锐达:议程 66 场景(LTC48+MCR18)/19 已识别;会议引导输出「[待调研] LTC·BD-01…该问:…」定向问题

## 生产事故 + 根因修复(2026-07-14)
- **现象**:用户登录不了。根因 = backend-only 部署(Part3)重建了 backend 容器换了 IP(0.6→0.7),
  但前端 nginx 用静态 `proxy_pass http://backend:8000` 只在启动解析一次 → 一直连旧 IP → /api 全 502。
- **急救**:`docker exec kb-system-frontend-1 nginx -s reload`(+uat)重新解析,登录立即恢复。
- **根治**:deploy-prod.yml 成功/回滚两条路径,DEPLOY_BE=true 时 reload 两个前端 nginx。
- 场景问题已全量生成:147/147 场景 671 问题(glm-5,~17min)。auto_gen_questions 改每域提交防长跑丢进度。

## Part1 清单
- [x] P1-1 StandardScene 加 research_questions(JSON)+ ALTER 迁移;DTO/PATCH 支持。
- [x] P1-2 services/scene_questions:LLM 按域批量生成关键调研问题(问项目现状/痛点/规则)。scene_questions 静态路由 → glm-5(避推理模型截断)。
- [x] P1-3 端点:POST /scenes/{id}/gen-questions(单,不落库)+ POST /scenes/gen-questions(批量按域,落库补空)。
- [x] P1-4 前端:编辑抽屉「关键调研问题」区(可编辑 + AI 生成)+ 场景库「AI 生成调研问题」批量按钮。
- [x] P1-5 py_compile + tsc 通过。→ 部署中,待实测。

---

# 任务:Harness Block6 — AI 能力目录 + 场景 AI 能力匹配 + 回流遵循结构化格式(2026-07-13)

来源《当前AI能力.xlsx》(96 个 Skill / 20 Agent / 7 领域)。需求:场景加「AI 能力匹配」(作为 AI 优化选择,可编辑多选);以后回流优化/新增场景也遵循 Block5 结构化格式。

## 清单
- [x] 6-1 seed:解析 Excel(合并单元格前向填充)→ backend/seeds/ai_capabilities_seed.json(96 条)。
- [x] 6-2 model AiCapability + StandardScene 加 ai_capabilities;SceneChangeProposal 加 content(结构化载荷);main.py import+ALTER+seed。
- [x] 6-3 api/scenes:GET /ai-capabilities;SceneDto/PATCH 支持 ai_capabilities;seed_ai_capabilities_if_empty。
- [x] 6-4 scene_reflow:prompt 扩成结构化输出(说明/业务规则/流程/推荐字段)→ 提案 content;scene_ops approve 落到场景(new 全量、optimize 补空不覆盖)。
- [x] 6-5 前端:SceneEditDrawer 加「AI 能力匹配」搜索多选(按领域/Agent,带状态徽标);api/scenes.ts 加类型+listAiCapabilities。
- [x] 6-6 py_compile + tsc + build 通过;未碰 client.ts。
- [x] 6-7 deploy-uat 门 → deploy-prod;curl + 验证 96 能力导入 + 场景匹配 AI 能力持久化。

## Block6 部署结果
- commit `a491a87` → deploy-uat 门 → deploy-prod run 29237154605 success;version.json sha=a491a87;/ai-capabilities 401(已注册)。
- 实测(测完复原):AI 能力目录 96 条已导入(效率27/客户23/互动16/商机10/联系人7/合同7/开源6);场景 LM-01 匹配能力[1,2]→持久化+留痕「编辑:AI 能力匹配」。
- 回流遵循格式验证:锐达回流 8 提案 8/8 带结构化 content(说明/业务规则/推荐字段);approve 时 new 全量落、optimize 补空不覆盖。

---

# 任务:Harness Block5 — 场景结构化内容 + 标签 + 可编辑 + 修改记录(2026-07-13)

需求:场景内容先留空但搭骨架;标签(通用 / 四级行业,多选,可编辑);说明/业务规则/流程/推荐字段(表格);全部可编辑;保存留修改记录。

## 清单
- [x] 5-1 StandardScene 加 description/business_rules/process/recommended_fields(JSON)/tags(JSON);main.py ALTER 加列(旧表 create_all 不加列)。
- [x] 5-2 api/scenes.py:DTO 扩字段 + PATCH /scenes/{id}(仅管理员)写 SceneChange('edit') + bump version。
- [x] 5-3 前端 api/scenes.ts:Scene 扩字段 + RecommendedField + updateScene;复用 getProjectMeta 拿四级行业树。
- [x] 5-4 SceneEditDrawer:名称/标签(通用+L1-L4 级联多选)/说明/规则/流程 textarea + 推荐字段可编辑表格(增删改行);场景库中心点行打开、列表显示标签。
- [x] 5-5 py_compile + tsc + build 通过;未碰 client.ts,overlay 无关。
- [x] 5-6 deploy-uat 门 → deploy-prod;curl + 编辑一个场景验证内容/标签持久化 + 变更留痕。

## Block5 部署结果
- commit `7c5515b` → deploy-uat 门 → deploy-prod run 29233956187 success;version.json sha=7c5515b;后端健康。
- 锐达/LM-01 实测(测完复原):编辑 说明+标签(通用+四级行业路径)+推荐字段表格 → 持久化,version 1→2,SceneChange('edit') 留痕「编辑:说明、推荐字段、标签 by admin」。
- 骨架就绪、内容留空:147 条现仍空内容/空标签,管理员在场景库中心点行即可编辑。

---

# 任务:Harness P3 + P4 — 场景库 / 命中 / PM 角色 / 蓝图回流闭环(2026-07-13)

一整个子系统,分 Block 逐个建→测→部署:
- **Block 1 场景库基座 + 场景库中心(后台菜单)** ← 命中/回流都依赖
- Block 2 PM 角色(项目成员角色分类,默认 owner)
- Block 3 场景命中(LLM 对照标准库,项目详情显示命中/未命中 + 报告)
- Block 4 蓝图回流闭环(蓝图完成→diff→PM 确认→后台审核 tab→回写场景库 + 变更留痕)

## Block 1 清单
- [x] B1-1 seed:解析试点包 Core 场景 → `backend/data/scenes_seed.json`(147 条:LTC48/MPR35/ITR33/MCR18/MTL13)。
- [x] B1-2 model `models/scene.py`:StandardScene + SceneChange(变更历史)。
- [x] B1-3 `api/scenes.py`:domains/list/get/changes/scene-changes + `seed_scenes_if_empty`(空表首启导入)。
- [x] B1-4 main.py:启动块 import model + include_router(/api)+ seed 调用。
- [x] B1-5 前端:`api/scenes.ts`(独立于 client.ts,避 overlay)+ `pages/SceneLibrary.tsx`(场景清单 + 变更历史 tab)+ App 路由 + 两套后台导航(adminOnly)。
- [x] B1-6 py_compile + tsc + build 通过;overlay 安全(无副本)。
- [x] B1-7 deploy-uat 门 → deploy-prod;curl + 后端确认 seed 导入 147 条。

## Block 2/3/4 清单(本批一起提交)
- [x] B2 PM 角色:project_collaborators 加 `project_role` 列(+ ALTER 迁移);projects.py 端点(pm_user_id/owner.is_pm + PATCH project-role);CollaboratorsModal 下拉 + owner「项目经理」徽标。
- [x] B3 场景命中:services/scene_match.py(子代理,LLM 对照 147 库)+ scene_hit_reports 表 + scene_ops 端点;SceneHarnessPanel 命中卡(命中/未命中 + 报告)。
- [x] B4 蓝图回流:services/scene_reflow.py(子代理,LLM diff)+ scene_change_proposals 表 + scene_ops 全流程(reflow/pm-confirm/approve→回写+留痕/reject/admin队列);SceneHarnessPanel design 阶段回流 + PM 确认;场景库中心「待审核回流」第 3 tab(管理员通过/驳回)。
- [x] B-verify py_compile + tsc + build 通过;overlay 安全(client.ts 已同步,其余无副本);ProjectRole 重名 → 改 ProjectMemberRole。
- [x] B-deploy deploy-uat 门 → deploy-prod;curl + 锐达实测命中/回流。

## Block 2/3/4 部署结果
- commit `417091c` → deploy-uat 门 → deploy-prod run 29229009160 success;version.json sha=417091c;新路由全 401;新表 scene_hit_reports/scene_change_proposals 建好,project_collaborators.project_role 列已加。
- 锐达实测(真实 LLM,测完清理):
  - Block2 PM:pm_user_id=owner,owner.is_pm=True。
  - Block3 命中:61/86(qwen3 默认路由),summary 合理。
  - Block4 回流:16 提案(9新增/7优化);合成提案 approve → 写 standard_scenes(TEST-P1)+ scene_changes 留痕;清理后库仍 147 条。
- 备注:scene_match/scene_reflow 任务未在 routing_rules,走 router 默认(qwen3-next-80b),工作正常;如需指定模型可在 agent_configs 补路由。

## Block 1 部署结果
- commit `315e66c` → deploy-uat 门通过 → deploy-prod run 29226962953 success;version.json sha=315e66c;scenes 路由 401。
- DB 验证:standard_scenes 147 条(LTC48/MPR35/ITR33/MCR18/MTL13),seed 首启自动导入成功。
- 场景库中心:后台导航 adminOnly,场景清单 + 变更历史两 tab。
- seed 路径坑:`backend/data/` 被 .gitignore(`data/` 规则)→ 挪到 `backend/seeds/` 才提交进镜像。

---

# 任务:Harness P2 — 软闸(生成时警告 + 产物上持续显示,不阻塞)(2026-07-13)

目标:落地方案 v2 的 P2。软闸不卡控,点生成弹 warning、并把警告随产物持续显示。
两条规则(后端计算,存 bundle.extra.soft_warnings,不阻塞):
- 对客提交软闸:kind ∈ 对客白名单(PUBLIC_SHAREABLE_KINDS)→「对外发送前请确认已内部审核」。
- 就绪软闸:下游 kind(design/implement/test/acceptance)但上一阶段无 done 交付物 →「依据可能不足」。

## 清单
- [x] S1 outputs.py:`_PREV_STAGE_KINDS` + `_soft_warnings_for`;enqueue 写入 `extra.soft_warnings`;`_bundle_dto` 暴露。
- [x] S2 client.ts:CuratedBundle 加 `soft_warnings?`(主仓 + meeting overlay 副本同步)。
- [x] S3 共享组件 `components/console/SoftWarnings.tsx`(SoftWarningChips + toastSoftWarnings),两套项目详情:生成后 toast、action 区常驻黄条。仅内部可见。
- [x] S4 py_compile + tsc + build 通过;deploy-uat overlay 门通过 → deploy-prod success;锐达实测全绿。

## 部署结果
- commit `6ecf439` → deploy-uat(overlay 门)success → deploy-prod run 29225887436 success;`version.json` sha=6ecf439;后端 captcha 200 / gates 401。
- 锐达实测(只读,无残留):对客 kind→customer_facing;insight→无警告;有上游 done→不报 not_ready;缺上游(test_plan/acceptance_report)→报 not_ready;`_bundle_dto` 正确透出 + 老 bundle 向后兼容返回 []。

---

# 任务:Harness P1 — 项目闸门状态 + As-Is/To-Be 两道硬闸一键确认(2026-07-13)

目标:落地方案 v2 的 P1。给项目加一层「闸门状态」持久层,并对两道硬闸做强制一键确认:
- As-Is 确认(gate=asis):需求调研(survey)完成 → 才能生成方案设计(design:blueprint_design/object_field_layout/process_setup)。
- To-Be 定稿(gate=tobe):方案设计(design)完成 → 才能生成项目实施(implement:implementation_plan)。
硬闸=未确认时**阻塞下游生成**(409),确认成本=一键。

## 关键落点(recon 结论)
- 真实阶段:insight → survey → design → implement → test → acceptance(无独立 as-is/to-be kind,故用阶段转移闸)。
- 建表:`Base.metadata.create_all`(无 alembic),新表在 main.py 启动块 import 即自动建,零风险。
- 硬闸拦截点:`api/outputs.py::enqueue_generation`(HTTP+MCP 唯一咽喉)。

## 清单
- [x] G1 model `models/project_stage_gate.py`(project_id, gate_key, status, confirmed_by, confirmed_at, note)。
- [x] G2 `api/project_gates.py`:GET 列表 / POST confirm / POST reopen(read/write ACL)+ `is_gate_confirmed` 供拦截用。
- [x] G3 main.py:启动块 import 新 model + include_router(prefix /api/projects)。
- [x] G4 outputs.py::enqueue_generation:`_GATE_FOR_KIND`(design→asis / implement→tobe),未确认 raise 409。
- [x] G5 前端:共享组件 `components/console/GateConfirmBar.tsx`(两套详情页共用,深浅自适应);survey→As-Is、design→To-Be;client.ts 加 listGates/confirmGate/reopenGate。409 由 client 拦截器自动 toast。
- [x] G6 py_compile 通过;前端 tsc + build 通过。后端本地无 3.11/docker → 部署后立即 curl 验证后端启动(gates 路由 401=启动成功);rollback SHA=0bc99d8。

## 部署结果
- **踩 overlay 坑**:首次 deploy-prod(d953a7e)在 CI「Frontend tsc+build」失败(overlay 后 client.ts 无 listGates)→ Build/Deploy 跳过,prod 未受影响。修复:同步导出进 `meeting/frontend/src/api/client.ts`(58ee1f9)。
- deploy-uat(overlay 构建)通过 → deploy-prod run 29224775457 success(含后端,40s)。
- 后端 boot 验证:`/api/projects/x/gates`=401(app 起 + 路由注册)、`/api/auth/captcha`=200(健康);前端 `version.json` sha=58ee1f9。
- DB 验证:SSH psql 确认 `project_stage_gates` 表已建(全字段 + uq(project_id,gate_key) + ix_project + FK→projects CASCADE)。
- 待人工:登录到 survey/design 阶段看闸门条 + 一键确认 + 未确认时生成被 409 拦截 toast。

---

# 任务:管理员放开所有模块(测试)+ 普通用户升级中 + 顶部 banner(2026-07-13)

目标:在「工作台仅保留会议纪要」基础上,让管理员(is_admin)仍可操作所有模块用于测试;普通用户维持升级中;工作台顶部对普通用户加横幅「正在项目管理模块底层升级,敬请期待」。

## 清单
- [x] E1 新建 `components/UpgradeBanner.tsx`(light/dark 两 variant)。
- [x] E2 App.tsx:恢复被删页面 import + `AdminGate` 包装器(管理员真组件 / 普通用户升级页);6 条工作台路由套 AdminGate;/console 首页管理员看真首页、普通用户跳会议。
- [x] E3 legacy `layouts/ConsoleLayout.tsx`:NAV `disabled`→`gated`(gated && !admin 才置灰);header 顶对普通用户挂 banner(light)。
- [x] E4 redesign `console/ConsoleLayout.tsx`:同上;main 顶对普通用户挂 banner(dark)。
- [x] E5 typecheck + build 通过。
- [x] E6 推 prod + 线上验证:commit `0bc99d8` → deploy-prod run 29222739665 success;`version.json` sha=`0bc99d8` 已上线。管理员各模块可进 / 普通用户升级中 + banner 留登录后人工核对。

## 部署结果
- commit `0bc99d8` → `deploy-prod.yml` run 29222739665 success → `kb.tokenwave.cloud/version.json` sha=`0bc99d8`。
- 管理员:AdminGate 放行,工作台全模块可用,导航不置灰,无 banner。
- 普通用户:非会议入口置灰、点击进升级页、工作台顶部显示「项目管理模块底层升级」横幅、登录落地会议纪要。

---

# 任务:工作台仅保留会议纪要,其余功能下线提示「升级改造中」(2026-07-13)

目标:kb-system 主站只对外保留「会议纪要」功能,工作台其余入口(工作台首页 / 知识问答 / 项目管理)与相关页面下线,访问时提示正在升级改造中。知识库后台(/)保留给管理员运维,不下线。

## 边界
- 保留:`/console/meeting*`(会议纪要 4 条路由)、登录/注册、知识库后台 `/`(管理员,靠现有 allowed_modules 模块权限守卫)。
- 下线(工作台内):`/console` 首页、`/console/qa`、`/console/projects`、`projects/:id`、`projects/:id/todos`、`projects/:id/canvas`。
- 呈现:保留顶部导航框架,非会议入口置灰 + 标「升级中」+ 拦截点击;直接敲 URL 也显示升级提示页。
- 公开 demo/设计原型页(/demo /redesign /ds /api /help)无导航入口,保持不动。

## 清单
- [x] D1 新建 `components/UpgradeNotice.tsx` 升级提示组件(深浅两套 UI 自适应),带「前往会议纪要」入口。
- [x] D2 App.tsx:`/console` index 重定向到 `/console/meeting`;非会议工作台路由改渲染 UpgradeNotice;meeting 与后台不动。顺手清理已下线页面的死 import。
- [x] D3 legacy `layouts/ConsoleLayout.tsx`:非会议 3 项 `disabled`,标签文案「即将上线」→「升级中」。
- [x] D4 redesign `console/ConsoleLayout.tsx`:dock 非会议项加置灰 + 拦截 + 「升级中」。
- [x] D5 Login.tsx:普通用户默认落地 `/console` → `/console/meeting`。
- [x] D6 `npx tsc --noEmit` 通过、`npm run build` 通过(9.5s)。overlay 坑已核:`meeting/frontend/` 只含会议组件,本次 5 个文件都不被覆盖。→ 待推 prod + 线上验证。

## 部署结果
- commit `da91892` → push main → `deploy-prod.yml` run 29219586835 success(39s)。
- 线上核验:`kb.tokenwave.cloud/version.json` sha=`da918920…`,新构建已上线(两域名同服务器同 dist)。
- 未登录访问 `/console/qa` 正确跳登录页,应用壳正常加载,无白屏。
- overlay 坑已排除:`meeting/frontend/` 只含会议组件,本次 5 个文件不被覆盖。
- 待人工:登录后核对导航置灰 / 升级页 / 普通用户落地会议纪要。

---

# 任务:独立会议纪要产品本地创建并部署到 sharewb.cloud(2026-06-30)

# 任务:sharewb.cloud HTTPS 录音恢复 + 旧会议全量导入(2026-07-01)

# 任务:用户管理弹窗可用性 + 恢复会议 Co-pilot(2026-07-01)

目标:修复浅色化后用户管理弹窗被页面/Dock 裁切的问题,并恢复新建会议实时录音里的会议 Co-pilot 核心能力。

## 清单
- [x] U1 用户管理新增/编辑/重置密码弹窗改为 portal 到 `document.body`,避免被设置页容器和底部 Dock 裁切。
- [x] U2 移除浅色主题里危险的 `.fixed.inset-0 > div` 全局染白规则,改为只作用于设置弹窗面板。
- [x] U3 `/console/meeting/new` 路由切回完整旧版半实时录音页面,恢复会议 Co-pilot / 会议看板。
- [x] U4 构建、部署、浏览器截图验证。

## 部署结果
- 已部署版本:`restore-copilot-user-modal-portal`。
- 验证:用户管理「新增用户」弹窗在 1238x768 视口完整展示,取消/创建按钮可见,不再被 Dock 压住。
- 验证:新建会议「实时录音」页恢复「会议 Co-pilot」面板和「给建议」入口。

目标:DNS 切到新服务器后,给独立会议工作台启用正式 HTTPS,解决浏览器禁用麦克风导致的录音不可用;同时把旧 KB System 里的历史会议同步到新独立站。

## 边界
- 新站保留当前 `admin` 管理员账号,旧系统 `admin` 的会议映射到新站 `admin`。
- 只导入会议工作台需要的数据:相关用户、项目夹、会议、会议需求、会议实时建议、会议分享。
- 不导入旧完整文档生产/知识库/输出中心数据。
- 历史解释图 base64 缓存不导入,避免把独立站数据库膨胀;可在会议详情里后续重新生成。

## 清单
- [x] H1 确认 `sharewb.cloud` A 记录已指向 `159.75.232.168`;`www.sharewb.cloud` 仍在旧 IP。
- [x] H2 签发 `sharewb.cloud` Let's Encrypt 证书,前端容器开放 443,HTTP 自动跳 HTTPS。
- [x] H3 修改录音不支持提示,明确 HTTPS 安全上下文原因。
- [x] H4 从旧 KB System 导出并导入相关用户 8 个、项目夹 7 个、会议 36 场、需求 427 条、实时建议 1108 条。
- [x] H5 校验会议 owner/project 外键完整,API `/api/meeting` 返回 36 条。
- [x] H6 尝试迁移 11 个历史音频对象;对象总量 619 MB,跨云链路传输过慢,已停止并清理临时 key/半截包。

## 部署结果
- 公网入口:`https://sharewb.cloud`。
- 部署版本:`sharewb-https-recording-import-ready`。
- HTTPS 验证:HTTP 301 到 HTTPS,`/health` 返回 `ok`,Chrome 下 `isSecureContext=true`,`getUserMedia=true`,`MediaRecorder=true`。
- 数据结果:新站正式用户 9 个(含现有 admin),项目夹 7 个,会议 36 场,会议需求 427 条,实时建议 1108 条。
- 音频说明:数据库保留 11 条历史音频引用,但音频对象未迁移;旧源对象存在且总计约 619 MB。后续如需保留历史音频,需要换更快的跨云迁移通道或分批后台传输。

# 任务:会议功能全量冒烟测试(2026-07-01)

目标:设置页和导航瘦身后,验证会议工作台核心功能仍可用,并区分 UI / 接口问题与外部模型、ASR、飞书凭证依赖问题。

## 边界
- 只在独立部署 `http://159.75.232.168` 上测试。
- 测试数据使用明显前缀 `Codex 冒烟测试` 并在结束时清理。
- 不改用户密码、不暴露密钥。
- 对需要外部服务的功能只做可达性和错误归因验证,不强行伪造密钥。

## 清单
- [ ] T1 准备测试 token 和测试项目/会议数据。
- [ ] T2 验证会议 CRUD、列表、详情、项目关联、纪要/需求/干系人/流程编辑。
- [ ] T3 验证模板、导出、分享、实时建议、会议问答、AI 动作的可达性与依赖状态。
- [ ] T4 验证前端会议列表、详情、新建、模板、项目夹页面可打开无白屏。
- [ ] T5 清理测试数据并汇总结果。

---

# 任务:会议工作台全局浅色主题(2026-07-01)

目标:放弃独立会议工作台深色网格/玻璃背景,全局切回浅色工作台,优先保证表格、表单、弹窗、会议列表的可读性。

## 边界
- 只改独立拆分目录 `/Users/zhebin/Documents/纷享销客/AI项目/meeting-kb-extracted` 和远端 `/opt/meeting-kb`。
- 保留会议工作台产品名、橙色品牌点缀、底部 Dock 和顶部品牌栏。
- 移除深色 HUD 网格、深色化老组件的强制翻色效果。

## 清单
- [x] L1 将 redesign 全局 token 切换为浅色背景/深色文字。
- [x] L2 将 LiquidGlass 组件切换为浅底模式。
- [x] L3 用浅色覆盖规则恢复老组件的白底、浅灰底、深色文字和普通输入框。
- [x] L4 禁用 `.rd-root::after` / `.rd-shell::after` 网格背景。
- [x] L5 本地构建、远端部署并截图验证。

## 部署结果
- 已部署版本:`global-light-theme-no-grid`。
- 验证:`/health` 返回 `ok`;`frontend/backend/celery_worker` 容器正常。
- 截图检查会议列表和设置页用户弹窗:全局背景为浅色,网格层关闭,控制台无 error。

---

# 任务:会议工作台设置页与 Dock 瘦身(2026-07-01)

目标:独立会议工作台的设置页和后台外壳仍残留旧 KB/交付系统入口,收敛为会议产品需要的管理项。

## 边界
- 只改独立拆分目录 `/Users/zhebin/Documents/纷享销客/AI项目/meeting-kb-extracted` 和远端 `/opt/meeting-kb`。
- 保留管理员配置模型、路由、API Key、用户管理。
- 个人设置只保留飞书配置;隐藏 ShareDev / 企信。
- 后端能力暂不删除,仅从独立产品 UI / 路由入口隐藏。

## 清单
- [x] D1 收敛系统设置 tab 和个人设置内容。
- [x] D2 收敛设置页所在后台外壳 Dock / 侧边栏入口。
- [x] D3 本地构建验证。
- [x] D4 同步远端、重建前端并验证。

## 部署结果
- 系统设置页收敛为 4 个 tab:模型管理、路由与参数、API 密钥、用户管理。
- 旧版设置页同步去掉「嵌入与重排」「调用日志」入口,避免新旧 UI 不一致。
- 个人设置只保留飞书配置,隐藏 ShareDev PaaS 和企信 Bot。
- 设置页所在后台外壳的 Dock / 侧边栏收敛为会议、项目夹、个人设置、系统设置,去掉知识库、问答、审核、挑战、系统配置、邀请码、修订学习记忆库等旧入口。
- `/system-config`、`/bundle-memories` 重定向到 `/settings`;`/invite-codes` 重定向到 `/settings?tab=users`。
- 本地构建通过:`frontend npm run build`。
- 已同步远端并重建 `frontend` 容器。
- 验证:`http://159.75.232.168/version.json` 返回 `settings-dock-slim`,`/health` 返回 `ok`,`frontend` 容器 healthy。

---

# 任务:会议工作台路由规则瘦身(2026-07-01)

目标:独立会议工作台已经去掉知识库问答、工作台首页和完整文档生产,将大模型路由规则同步收敛到会议处理 + 项目资料处理两类。

## 边界
- 只改独立拆分目录 `/Users/zhebin/Documents/纷享销客/AI项目/meeting-kb-extracted` 和远端 `/opt/meeting-kb`。
- 保留会议生成、转写润色、需求/流程/干系人/解释图、会议内问答、模板演化。
- 保留项目资料上传后仍需的文档转写、OCR、切片分类、摘要/类型/金额识别等后台加工规则。
- 移除知识库问答、输出中心、挑战练习等独立产品不再展示的路由规则。

## 清单
- [x] S1 梳理前后端实际使用的 routing task。
- [x] S2 简化设置页路由分组。
- [x] S3 简化后端默认路由和默认任务参数。
- [x] S4 本地构建 / 后端语法验证。
- [x] S5 同步远端、清理旧 task_params、重启并验证。

## 部署结果
- 设置页「路由规则 / 任务参数」已收敛为两组:
  - 会议处理:转写润色、实时建议、纪要、需求、流程、干系人、解释图、会议问答、模板演化。
  - 项目资料处理:资料转写、复核、切片分类、低置信复审、摘要/FAQ、类型识别、金额识别、OCR。
- 后端 `ROUTING_RULES` 和 `DEFAULT_TASK_PARAMS` 同步收敛到 17 项,未知 task 的兜底路由改为 `minimax-m2.7 → glm-5`。
- 远端数据库已删除 9 条旧 `task_params`:知识库问答、输出中心、挑战练习、客户画像相关参数。
- 远端数据库已写入 17 条简化后的 `routing_rules`,当前按现有模型配置统一为 `MiniMax-M3 → GLM-5.2`。
- 本地验证通过:`frontend npm run build`;`python3 -m py_compile backend/services/model_router.py backend/services/config_service.py`。
- 已同步并重建远端 `/opt/meeting-kb` 的 `frontend/backend/celery_worker`。
- 验证:`http://159.75.232.168/version.json` 返回 `simplified-routing`,`/health` 返回 `ok`,容器 healthy,远端配置计数 `routing_rules=17/task_params=17`。

---

# 任务:会议工作台视觉与入口再收敛(2026-07-01)

目标:去掉新版橙色扫描线和企信入口,修复用户菜单浅色面板文字颜色,并给管理员保留清晰的大模型/路由配置入口。

## 边界
- 只改独立拆分目录 `/Users/zhebin/Documents/纷享销客/AI项目/meeting-kb-extracted` 和远端 `/opt/meeting-kb`。
- 不删除后端企信/API/模型配置能力,仅移除独立会议产品前端入口。
- 大模型和路由仍使用既有系统设置页。

## 清单
- [x] V1 移除新版会议工作台扫描线。
- [x] V2 移除企信抽屉入口。
- [x] V3 修复用户菜单颜色并增加「模型与路由」管理员入口。
- [x] V4 本地构建验证。
- [x] V5 同步远端、重启前端并验证。

## 部署结果
- 新版会议工作台主布局已移除橙色扫描线。
- 已移除会议产品与旧后台壳中的企信抽屉挂载入口。
- 用户菜单改为浅色面板固定深色文字,修复截图里文字发白的问题。
- 管理员头像菜单新增「模型与路由」「用户管理」直达入口:
  - 模型与路由:`/settings?tab=models`
  - 用户管理:`/settings?tab=users`
- 本地构建通过:`frontend npm run build`。
- 已同步并重建远端 `/opt/meeting-kb` 的 `frontend` 容器。
- 验证:`http://159.75.232.168/version.json` 返回 `no-scan-no-qixin-menu-settings`,`/health` 返回 `ok`,`frontend` 容器 healthy。

---

# 任务:会议工作台入口继续瘦身(2026-07-01)

目标:去掉独立会议工作台里的问答功能入口和工作台首页,登录后直接进入会议列表。

## 边界
- 只改独立拆分目录 `/Users/zhebin/Documents/纷享销客/AI项目/meeting-kb-extracted` 和远端 `/opt/meeting-kb`。
- 后端 QA 接口先不删,前端路由与导航隐藏/重定向即可。
- 保留会议、模板、项目夹、项目详情等当前核心路径。

## 清单
- [x] E1 梳理当前 console 路由和导航入口。
- [x] E2 去掉工作台首页与问答入口,默认跳转会议列表。
- [x] E3 本地构建验证。
- [x] E4 同步远端、重启前端并验证。

## 部署结果
- 已去掉会议工作台导航中的首页和问答入口,只保留「会议」「项目夹」。
- `/console`、`/console/qa`、`/qa` 前端路由均指向会议列表。
- 本地构建通过:`frontend npm run build`。
- 已同步并重建远端 `/opt/meeting-kb` 的 `frontend` 容器。
- 验证:`http://159.75.232.168/version.json` 返回 `meeting-projects-only-no-qa`,`/health` 返回 `ok`,`frontend` 容器 healthy。

---

# 任务:会议工作台项目管理瘦身(2026-07-01)

目标:把独立会议工作台里的项目管理从完整文档生产/实施交付工作台,收敛成“项目用于汇聚会议 + 上传相关文档”的轻量项目夹。

## 边界
- 只改独立拆分目录 `/Users/zhebin/Documents/纷享销客/AI项目/meeting-kb-extracted` 和远端 `/opt/meeting-kb`。
- 后端复杂能力先保留,前端入口和项目详情先隐藏文档生产、调研、蓝图、实施等完整交付能力。
- 保留项目列表、新建/编辑项目、项目关联会议、项目相关文档上传/查看。

## 清单
- [x] P1 梳理当前项目列表和项目详情页面结构,确认会议/文档可复用接口。
- [x] P2 改项目列表/首页文案,把“项目管理”表达成“项目夹/会议项目”。
- [x] P3 改项目详情为轻量视图:会议汇总 + 相关文档,隐藏完整文档生产入口。
- [x] P4 本地构建验证。
- [x] P5 同步远端、重启前端并验证。

## 部署结果
- 本地构建通过:`frontend npm run build`。
- 已同步并重建远端 `/opt/meeting-kb` 的 `frontend` 容器。
- 验证:`http://159.75.232.168/version.json` 返回 `project-folder-lite`,`/health` 返回 `ok`,`frontend` 容器 healthy。
- DNS 注意:`sharewb.cloud` 和 `www.sharewb.cloud` 当前仍解析到 `47.93.236.38`,还没指向新服务器 `159.75.232.168`。

---

# 任务:独立会议纪要产品本地创建并部署到 sharewb.cloud(2026-06-30)

目标:把会议纪要能力轻量独立出来,本地新建目录保存代码,不接 git,直接部署到 `159.75.232.168` 服务器 80 端口。

> 纠偏:该轻量重写版不符合“从 KB System / kb-knowledge 现有会议纪要拆出”的要求,已停止远端容器,仅保留目录备查。当前有效部署见下方“纠偏为从 KB System 拆出现有会议纪要模块”。

## 边界
- 不复用 KB System 的项目工作台 / 知识库 / Qdrant / Celery / MinIO 复杂链路。
- 保留轻量「项目」概念:会议可归集到一个项目下,项目仅作为聚合和筛选。
- 前后端都要部署,服务入口为 `http://sharewb.cloud/` 和服务器 80 端口。
- 暂时不用 git;远端目录独立放置,不影响 `/root/fx-data` 旧项目。

- [x] D1 创建本地独立目录和轻量后端(FastAPI + SQLite + 文件上传)。
- [x] D2 创建前端(React/Vite)并完成会议列表 / 新建 / 详情 / 项目聚合。
- [x] D3 本地构建和后端导入检查。
- [x] D4 同步到服务器 `/opt/meeting-minutes` 并写 Docker Compose/nginx。
- [x] D5 启动 80 端口并验证公网访问。

## 部署结果
- 本地目录:`/Users/zhebin/Documents/纷享销客/AI项目/meeting-minutes-standalone`
- 远端目录:`/opt/meeting-minutes`
- 容器:`meeting-minutes`,已停止,80 端口已交给 KB 会议纪要拆分版。
- 公网 IP 访问:`http://159.75.232.168/` 正常;`/api/health` 正常。
- 冒烟测试:创建会议 → 生成纪要 → 删除测试会议通过。
- DNS 注意:`sharewb.cloud` 和 `www.sharewb.cloud` 当前解析到 `47.93.236.38`,不是新服务器 `159.75.232.168`,域名访问仍是旧站 403;需要 DNS 控制台改 A 记录。

---

# 任务:纠偏为从 KB System 拆出现有会议纪要模块(2026-06-30)

目标:废弃上一版轻量重写实现,改为基于 KB System 现有会议纪要代码抽取并部署,尽量保留既有功能。

## 边界
- 不能重写会议纪要核心功能;必须复用 `meeting/` overlay 与现有 `backend/api/meeting.py`、`services/meeting/*`、`tasks/meeting_tasks.py`、前端会议页面。
- 项目 / KB 交集可以暂时弱化,但会议本身的上传 / 转写 / 生成 / 编辑 / 模板 / 导出 / Co-pilot / 分享能力要保留。
- 替换掉刚才部署在 80 端口的轻量版。

## 清单
- [x] R1 停掉轻量重写版服务,保留目录备查。
- [x] R2 梳理现有会议模块运行依赖并确定独立部署最小 compose。
- [x] R3 创建基于 KB System 代码的独立本地目录。
- [x] R4 配置独立入口和会议优先前端。
- [x] R5 同步远端构建启动并验证。

## 部署结果
- 本地目录:`/Users/zhebin/Documents/纷享销客/AI项目/meeting-kb-extracted`
- 远端目录:`/opt/meeting-kb`
- 运行方式:Docker Compose,包含 `frontend/backend/celery_worker/postgres/qdrant/redis/minio`。
- 前端入口:`/` 默认进入 `/console/meeting`;保留原 KB 会议纪要前后端能力和 `meeting/` overlay。
- 构建调整:后端去掉独立会议部署暂不需要的 LibreOffice 大包,保留 `ffmpeg` 和中文字体;前端改为本地构建 dist 后在远端 nginx 镜像中直接使用,避免小服务器 OOM。
- 验证:`http://159.75.232.168/`、`/console/meeting`、`/health` 均正常;后端 healthy,Celery ready。
- DNS 注意:`sharewb.cloud` 和 `www.sharewb.cloud` 当前仍解析到 `47.93.236.38`,不是 `159.75.232.168`;域名访问仍是旧站 403,需要把 A 记录改到新服务器。

---

# 任务:会议纪要功能独立产品化分析(2026-06-30)

目标:评估从工作台中抽出会议纪要功能,升级 UI 和可用性,并部署到新服务器的可行方案。

## 边界
- 只做现状梳理和实施路线分析,不直接改业务代码。
- 覆盖产品定位 / 技术拆分 / 数据模型 / UI 升级 / 部署迁移 / 风险和里程碑。
- 保留现有 KB System 会议模块稳定性,不影响线上 `kb.liii.in`。

## 清单
- [x] A1 梳理会议模块当前后端、前端、任务、模型、存储依赖。
- [x] A2 分析独立产品的拆分方式:轻量独立入口、同仓新应用、独立仓/独立服务。
- [x] A3 提出 UI 和可用性升级方向。
- [x] A4 设计新服务器部署方案、域名、数据迁移和发布流程。
- [x] A5 汇总推荐路线、阶段计划、风险和验收标准。

## 关键发现
- 会议模块当前通过 `meeting/` overlay 注入宿主仓,运行时依赖 `users/projects/project_collaborators/model_router/celery/minio/feishu_crypto` 等宿主能力。
- 产品能力已不止“纪要”:包含上传/半实时录音、ASR、纪要、需求、流程、干系人、解释图、Co-pilot 建议、模板导出、飞书/多维表同步、会议问答和分享。
- 独立产品化推荐先做“同仓独立产品实例”验证,再拆独立仓;直接硬拆会被项目权限、模型路由、配置和 overlay 双份文件拖住。

---

# 任务:会议 Co-pilot / 实时录音 UX 一批(2026-06-30)

- [x] R5 新建会议点录音按钮后置灰 + 显示「正在启动会议」防重复点(starting state)
- [x] R3 建议小卡片加「待定」动作(存着下次调研问)。状态 pending;❓后端加 status + 端点 + 卡片按钮。
       未定:下次调研自动带出(跨会议)放本轮还是后续。
- [x] R2 详情页转写/建议分栏中间竖条可拖动改左右宽度(draggable splitter + 宽度 state)
- [x] R1 详情页「快速定位」横排 chip 改右侧**竖向时间轴**:小圆点按分类着色,hover 展开时间点+问题类型
- [x] R4 实时会议看板:共识 + Copilot 建议,现场对客户对齐;录音中默认向右收起(过渡动画)、可点开;
       过建议时可持续撤销「需明确/遗漏」点。❓「已达成的共识」来源待确认(AI 抽 / 手动确认 / 两者)。

> R1/R2/R4 都重塑 Co-pilot 右侧面板,耦合 → 等 R4 设计定了一起做,避免返工。R3/R5 独立。

---

# 任务:会议流程图 mermaid 定期巡检 + 修复

目标:会议 `meetings.process_flows.flows[].mermaid` 里渲染失败的流程图,定期巡检自动修复。

## 关键发现(基于真实数据 109 块 mermaid,全是 flowchart)
- 80 块正常,**29 块渲染失败**。失败仅 3 个确定性类别:
  1. **保留字 `end` 作节点 id**(`g --> end([结束])` / `e --> end`)——后端 `_normalize_mermaid` 早有修复,但这些会议在该修复(2026-06-06)之前生成,存量没回灌。
  2. **菱形括号错配** `c --> d{风险等级判定]`(`{` 开 `]` 闭)。
  3. **一个字段塞多张图**(`flowchart...---flowchart...`)——meeting 46。
- 修复方案验证:repair(保留字+菱形) + split(按 `---`/多 header 拆图)后,**113/113 子图全部 mermaid.parse 通过**。**纯确定性,无需 LLM / 无需浏览器**。
- 检测可行性:node + jsdom 跑 mermaid.parse 可精确校验(纯 node 会被 DOMPurify 噪声干扰)。但**修复本身是纯字符串变换**,Python 即可,巡检任务不需要 JS。

## 设计(纯 Python,Celery beat)
- 修复=确定性变换,只动「检测到的坏 token」,不会把好图改坏;幂等。
- 校验局限:Python 不跑 mermaid,只按结构信号(保留字/错配括号/多 header)检测+修。未知新类别会漏(诚实记 log,不瞎猜)。

## 清单
- [ ] T1 backend/services/meeting/mermaid_repair.py:repair_mermaid() + split_mermaid_diagrams() + repair_process_flows()。纯函数。
- [ ] T1b 用真实数据交叉验证:Python 产出 → node mermaid.parse 全过。
- [ ] T2 pipeline._normalize_mermaid 委托给 repair_mermaid(生成时就修菱形,新会议不再坏)。
- [ ] T3 Celery 任务 sweep_meeting_mermaid + 注册 beat_schedule(每小时);首跑回灌存量。
- [ ] T4 py_compile + 部署 + 验证(看日志修复计数 / 会议页流程图恢复)。

## 进展
- T0 调研完成。范围限会议 process_flows;design 文档 stateDiagram 暂不纳入,util 后续可复用。
- [x] T1/T1b/T2/T3/T4 全部完成。
- [x] 踩坑:backend overlay clobber —— meeting_tasks.py / pipeline.py 有 meeting/backend 副本,COPY meeting/backend/ /app/ 覆盖,只改 backend/ 那份不上线。两份已同步(commit ce6acc2)。
- [x] 部署 ce6acc2,prod 手动跑一次:scanned=28 fixed=9 repaired=26 split=4;再跑 fixed=0(幂等);beat 已注册 sweep_meeting_mermaid(每小时)。
- 完成。

---

# 任务:每日工作台报告推送到企信群(2026-07-01)

目标:每天早 9 点自动推送 KB 工作台 + 会议昨日纪要 + AI Hub 昨日概况到群 `0:fs:d7de819b547d41d08e066bb3676f36a8:`。

## 边界
- 通道:复用本仓 `send_message_for_user(bot_user, chat_id, text)`,不走 sharecrm CLI。
- Bot:`4eec5298-7f82-48ec-b731-adff610314ee`(@实施工作台,已在群里)。
- 定时:`backend/tasks/convert_task.py:50` beat_schedule 加 crontab(hour=9, minute=0)。
- AI Hub 日志:docker-compose 挂 `/opt/aihub-tap/logs:/aihub-logs:ro` 到 celery_worker。
- 降级:tap.jsonl 无 user_id → TOP N 用 client_ip + UA;无定价表 → 只报 token 数不报 ¥。
- 全局视角报告,不做 per-user 版本(下期)。
- 群/bot 可通过 env 覆盖,不硬编码在代码里。

## 清单
- [x] W1 摸清 Project / Document / ProjectTodo / Meeting model 字段。
- [x] W2 docker-compose 加 aihub 日志挂载(scp 覆盖 + recreate celery_worker)。
- [x] W3 backend/services/daily_report/collector.py(3 个采集函数)。
- [x] W4 backend/services/daily_report/formatter.py(拼纯文本)。
- [x] W5 backend/tasks/daily_report_task.py + 挂 beat crontab(hour=9, minute=0)。
- [x] W6 admin `POST /api/admin/daily-report/{preview,send-now}` 端点。
- [x] W7 部署 + preview + send-now 到群通过。

## 部署结果
- 部署 sha:bf7eb43,PROD celery_worker + backend 已切到新镜像;/aihub-logs 只读挂载生效。
- Celery beat 已注册 send-daily-report,crontab=0 9 * * *,timezone=Asia/Shanghai,enable_utc=False。
- 首次校验 2026-07-01 10:47 手动 send-now 推送 2026-06-30 报告成功(message_id=382064460,970 字符),qixin_messages 落库一条 direction=out 记录。
- 明早 9:00 由 beat 自动触发。

## 升级 W8:AI Hub 走 new-api DB(2026-07-01)
- 之前 tap.jsonl 只有 client_ip/UA,TOP N"用户"是降级版。切到 new-api-postgres.logs 表后拿到真实 user_id / username / token_name / prompt_tokens / completion_tokens / quota。
- 费用:quota / 500000 = $,再乘 USDExchangeRate(options 表 = 7.2)得 ¥。免费组(quota=0)不展示。
- 网络:celery_worker external 引入 new-api_new-api-internal,通过 DNS 直连 new-api-postgres:5432。密码放 /opt/kb-system/.env 里 AIHUB_DB_PASSWORD。
- 保底:new-api DB 拿不到时 fallback 到 tap.jsonl。
- 部署 sha:2808cc8;2026-07-01 11:04 send-now 推群成功(message_id=382067955,1051 字符,含 5 个真实用户 + 3 个 API key 分布 + 错误 sample)。

## 踩坑
- 会议 meeting_minutes.decisions[] 元素结构是 dict `{content, owner, start_seconds, end_seconds}`,不是字符串。第一版 formatter 直接 `str(d)` 把 dict repr 打进消息里,已修(bf7eb43)。
- docker-compose.yml 是非镜像文件,GitHub Actions 只更新镜像不同步 compose;新增 volume/network 后要 scp 覆盖 + `docker compose up -d celery_worker` recreate。命中 memory 里 [[project_server_worktree_stale]]。
- 主导思路误判:一开始把 tap.jsonl 当唯一数据源,实际 new-api 自己有完整 DB(user/quota/token 全在),白花了半程精力在正则解析 SSE 流。教训:上下游都有存储时先看结构化的那个。

---

# 任务:边缘代理 edge 拆分 —— 部署不再影响 aihub/skillhub(2026-07-14)

**目标**:80/443 入口从 kb 业务前端容器剥离成独立 `edge` 容器;此后 kb 前/后端日常部署只动自己的容器,aihub / skillhub / kanban / studio / uat 全程无感。edge 内所有内部反代改 `resolver + 变量` 延迟解析,容器重建换 IP 自愈,任一 upstream 缺失不挡 nginx 启动。

## 子任务
- [x] `edge/nginx.conf`:全部 TLS/域名路由(从 nginx.prod.conf 迁出),所有 upstream 改 resolver+变量;kb/uat 502/504 时出维护页
- [x] `edge/entrypoint.sh` + `edge/Dockerfile`(nginx:1.27-alpine,证书裁剪逻辑同 frontend)
- [x] `frontend/nginx.prod.conf` 重写为内网 :80 dist 服务(对齐 nginx.uat.conf 模式,无 302 /console)
- [x] `frontend/nginx.uat.conf`:backend 静态 proxy_pass → resolver+变量(修 backend 重建 502 隐患)
- [x] `docker-compose.yml`:新增 edge 服务(持 80/443 + 证书/certbot/aihub-help/htpasswd 挂载);frontend 撤 ports/证书挂载改 expose:80
- [x] `deploy-prod.yml`:变更检测加 edge 维度;build-edge job;部署顺序 backend/frontend 先、edge 最后(cutover 时先释放端口);edge 对齐 + 健康检查
- [x] `deploy-uat.yml` / `deploy.yml`:paths-ignore 加 edge/**
- [x] `scripts/renew-ssl.sh`:reload 容器改 kb-system-edge-1,域名列表补 studio
- [x] 文档:CLAUDE.md / PROJECT_OVERVIEW.md(容器清单+架构图)/ LEARNING.md 新 §13
- [x] 上线 cutover:服务器脏 worktree 已 reset(落后 254 commit,git pull 恢复正常)→ 真实证书预检 nginx -t 通过 → deploy-prod force_all 成功(67a3f3b)→ 全域名验证通过(kb 双域名/skillhub/aihub/kanban/studio 健康,uat 302,aihub /v1 经 tap 401 正常)

## 边界 / 风险
- 不动 skillhub/aihub/kanban 自身容器与配置,只动入口层
- cutover 有一次 ~10-20s 全站闪断(frontend 撤端口 → edge 接管),是最后一次
- edge 回滚:首次部署无 prev edge 镜像,健康失败走人工处理(部署时盯着)


## cutover 中的额外发现(2026-07-14)
- **uat 已下线**(5fd7890,cutover 前 1 小时):首版 edge 配置误从旧缓存把 uat 反代带回,67a3f3b 修正为 302 到生产;Deploy UAT workflow 已被禁用。
- **证书续期 cron 丢失**(日志止于 6/12,疑似 6/23 服务器事故后未恢复):已重新加回 liu crontab(17 3 * * *)。kb.tokenwave.cloud 手动续期成功(→10/12)并 reload edge。
- **⚠️ kb.liii.in DNS 指向 34.45.112.217(一个 K8s API server,证书 7/13 签发),不是 KB 服务器 34.42.241.99**:主域名对公网用户实际不可用(TLS 报错 + k8s 403),ACME 续期也因此失败(本机证书 7/16 到期)。需要用户在 DNS 解析商把 kb.liii.in A 记录改回 34.42.241.99;服务器端已把续期配置从 standalone 改为 webroot(兼容 nginx 占 80),DNS 修复后次日 3:17 cron 自动续上。备用域名 kb.tokenwave.cloud 一切正常。

## kb.liii.in 弃用(2026-07-15,用户决策"不用管这个域名了")
- edge 移除 kb.liii.in server block;uat 302 目标改 kb.tokenwave.cloud;renew-ssl.sh 名单摘除;文档同步(生产域名 = kb.tokenwave.cloud)
- 服务器:/etc/letsencrypt/renewal/kb.liii.in.conf 移出(停止续期尝试,否则每晚 certbot 失败会连累其它域名续期后的 reload);证书文件暂留
