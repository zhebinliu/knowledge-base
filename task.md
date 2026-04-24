# 任务跟踪

## 新迭代：访谈式产出 + 项目模式自动锁定（2026-04-25）

### 背景
- PPT/洞察 产出时项目处于早期，KB 切片少，直接丢模型会瞎编 → 改为向导式"一问一答"，答案沉淀为项目资产，下次生成复用。
- 智能问答 / PM 视角都有"通用 / 项目经理"切换；选项目进去后仍停留通用 → 应自动切 PM 且锁定该项目。

---

## Feature X：交互式访谈（kickoff_pptx / insight）

### X1. 数据模型
- [ ] 新表 `project_interview_answer`
  - columns: id, project_id, output_kind, question_key, question_text, answer, updated_at
  - UNIQUE (project_id, output_kind, question_key)
- [ ] Skill 模型加字段 `questions` (JSONB, default [])
  - 结构: `[{key, stage, question, hint?}]`
- [ ] 把现有两个 skill 的题库从 prompt_snippet 迁到 questions；prompt_snippet 保留风格/方法论
- [ ] alembic migration 或直接 SQL 建表 + 加列

### X2. 后端 API
- [ ] GET `/api/interviews/{kind}?project_id=X` → `{questions, answers, next_key}`
- [ ] PUT `/api/interviews/{kind}/answer` upsert
- [ ] 改造 output_service：prompt = skill.prompt_snippet + 访谈答案 + 极少 KB 佐证（top 10）

### X3. 前端
- [ ] ConsoleOutputs：PPT/洞察 卡片改"开始访谈"
- [ ] InterviewModal 组件：一问一答、进度条、自动保存、完成后"生成文档"
- [ ] 项目资产加"访谈答案"Tab（可编辑）

---

## Feature Y：进入项目自动锁定 PM 模式

- [ ] QA.tsx: useEffect 监听 project_id（URL 或 router state），有项目则强制 persona='pm' + 隐藏"通用"切换
- [ ] PM 视角页面同步
- [ ] 从项目详情跳转 QA 时传 project_id

---

## 部署顺序
1. Feature Y（小改动，快速）
2. Feature X1+X2 后端
3. Feature X3 前端
4. 端到端：新建项目 → 开访谈 → 生成 PPT → 下载验证

## 边界
- survey 保持原逻辑，不走访谈
- 访谈与 bundle 解耦：同项目多次生成共用答案
- 答案可在资产页编辑，重生成用最新版
