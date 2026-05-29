---
name: sharedev-pwc-review-code
description: 当完成任务、实现主要功能或合并前，使用此 skill 验证工作是否符合需求
---

# 请求代码审查

派发 `code-reviewer` 子智能体，在问题扩散前捕获缺陷。reviewer 获得精确构建的上下文进行评估——而非你的会话历史。这使 reviewer 专注于工作产物本身，而非你的思考过程，同时也保留了你自己的上下文用于后续工作。

**开始时执行：** `sharedev trace -m skill --str1 sharedev-pwc-review-code`

**核心原则：** 早审查，多审查。

## 何时请求审查

**必须：**
- 子智能体驱动开发中的每个任务完成后
- 完成主要功能后
- 合并到主分支前

**可选但有价值：**
- 陷入困境时（获取新视角）
- 重构前（建立基线检查）
- 修复复杂 bug 后

## 如何请求

**1. 读取 PWC 检查清单：**

在派发 reviewer 之前，根据涉及的端读取对应检查清单：
- PC 端：读取 `./references/checklist-web.md`
- 小程序端：读取 `./references/checklist-mobile.md`
- 双端：两份都读取

将检查清单内容逐条作为审查维度传入 reviewer 的 prompt，reviewer 必须对每一项明确标注通过 / 不通过 / 不适用。

**2. 获取 git SHA：**

```bash
BASE_SHA=$(git rev-parse HEAD~1)  # 或 origin/main
HEAD_SHA=$(git rev-parse HEAD)
```

**3. 派发 code-reviewer 子智能体：**

使用 Task 工具，类型为 `code-reviewer`，填写以下占位符：

- `{WHAT_WAS_IMPLEMENTED}` - 你刚构建的内容
- `{PLAN_OR_REQUIREMENTS}` - 它应该做什么
- `{BASE_SHA}` - 起始提交
- `{HEAD_SHA}` - 结束提交
- `{DESCRIPTION}` - 简要说明
- `{ADDITIONAL_CHECKLIST}` - 从 `./references/checklist-web.md` / `checklist-mobile.md` 读取的检查项（按端）

**4. 根据反馈行动：**

- **Critical** 问题：立即修复
- **Important** 问题：在继续前修复
- **Minor** 问题：记录留待后续处理
- 如果 reviewer 判断有误：提供技术理由反驳

## 示例

```
[刚完成任务 2：添加客户表单验证]

你：在继续前先请求代码审查。

BASE_SHA=$(git log --oneline | grep "任务 1" | head -1 | awk '{print $1}')
HEAD_SHA=$(git rev-parse HEAD)

# 读取 PWC 检查清单（按端）
cat ./references/checklist-web.md        # PC 端
# cat ./references/checklist-mobile.md  # 小程序端（双端时两份都读）

[派发 code-reviewer 子智能体]
  WHAT_WAS_IMPLEMENTED: 客户表单字段验证和错误提示
  PLAN_OR_REQUIREMENTS: deliverables/2026-04-01-customer-form/plan.md 中的任务 2
  BASE_SHA: a7981ec
  HEAD_SHA: 3df7661
  DESCRIPTION: 新增必填字段校验、手机号格式检查、提交前验证拦截
  ADDITIONAL_CHECKLIST: [来自 ./references/checklist-web.md 的检查项]

[子智能体返回]:
  优点：校验逻辑清晰，错误提示友好
  问题：
    Important: 缺少异步校验（手机号唯一性）
    Minor: 错误提示文案未走国际化
  评估：修复后可继续

你：[修复异步校验问题]
[继续任务 3]
```

## 与工作流的集成

**子智能体驱动开发：**
- 每个任务后审查
- 在问题累积前捕获
- 修复后再进入下一任务

**执行计划：**
- 每批次（3个任务）后审查
- 获取反馈，应用修复，继续

**临时开发：**
- 合并前审查
- 陷入困境时审查

## 红线（绝不触犯）

**绝不：**
- 因为"太简单了"就跳过审查
- 忽视 Critical 问题
- 在 Important 问题未修复的情况下继续
- 与有效的技术反馈争辩

**如果 reviewer 判断有误：**
- 用技术理由反驳
- 展示证明其正常工作的代码/测试
- 请求澄清
