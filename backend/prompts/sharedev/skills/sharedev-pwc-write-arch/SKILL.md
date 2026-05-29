---
name: sharedev-pwc-write-arch
description: 在编写实施计划之前使用——为 PWC 功能设计技术方案，定义组件边界、平台 API 调用、接口契约和技术选型
---

# 技术方案设计

## 概述

在动代码之前，先设计清晰的技术方案。明确组件构成、平台 API 调用方式、数据流转、以及关键的技术决策。技术文档为后续的 `write-pwc-plan` 提供蓝图。

**开始时执行：** `sharedev trace -m skill --str1 sharedev-pwc-write-arch`

**开始时宣告：** "我正在使用 write-pwc-arch skill 来设计技术方案。"

**上下文：** 应在需求已明确（`write-prd-spec` 已完成）之后、编写实施计划之前运行。

**文档保存路径：** `/deliverables/YYYY-MM-DD-<功能名称>/arch.md`

## 范围检查

先确认需求边界：
- 是新增组件/插件还是改造现有的？
- 涉及 PC 端、小程序端，还是双端？
- 是否涉及多个独立子系统？如果是，建议拆分为独立的技术文档，每个子系统一份。
- 是否有不可变的外部约束（平台 API 限制、已有组件接口）？提前记录。

## 设计流程

### 第一步：加载设计约束

在阅读代码之前，先读取以下文档作为硬性约束，后续所有设计决策不得违反：

**项目结构（`.sharedev/README.md`）：**
- 读取该文件，了解本地工作区目录结构和配置约定

**规范文档（按端按需读取）：**
- PC 端开发：读取 `./references/spec-web.md`
- 小程序端开发：读取 `./references/spec-mobile.md`
- 双端开发：两份都读取

**功能清单（按端按需读取）：**
- PC 端开发：读取 `./references/feature-web.md`
- 小程序端开发：读取 `./references/feature-mobile.md`
- 双端开发：两份都读取

**对象描述（`/.sharedev/dev-metadata/`）：**
- 按需查阅，不要批量读取
- 当设计涉及某个对象时，读取对应文件 `objects/<ObjectApiName>.md` 了解字段定义
- 文件名即对象 API Name（如 `AccountObj.md`、`ContactsObj.md`）

> 如果上述目录不存在，跳过并在技术文档的"约束"部分注明"暂无团队规范"。

### 第二步：理解上下文

结合已加载的规范和索引，阅读现有代码，了解：
- 当前项目的技术栈（PC 端 Vue2 / 小程序端 Component API）
- 相关组件的边界与接口
- 已使用的平台 API（objectApi / appApi / paasApi / fs-hera-api）
- 代码风格与组织惯例

不要设计脱离现有代码库的"空中楼阁"方案。

### 第三步：定义组件

列出本次涉及的组件/插件：
- 每个组件的**单一职责**
- 组件之间的**依赖方向**（避免循环依赖）
- 哪些是新增的，哪些是修改现有的
- 确认没有与索引中已有组件重复的职责
- 明确入口场景：页面布局 / 弹出对话框 / 全屏对话框 / 插件

新增的组件/插件需在实施计划第一个任务中通过 `sharedev pwc create` 创建，详见 `sharedev-pwc` skill。

### 第四步：设计平台 API 调用

确定本次需要用到的平台 API：
- 使用哪类 API（objectApi / appApi / paasApi / fs-hera-api / APL 函数）
- 关键参数和返回值（objectApiName、字段映射等）
- 端差异：PC 端与小程序端的 API 调用方式是否一致
- 涉及具体对象时，查阅 `object-describe/<ObjectApiName>.md` 确认字段名称和类型

### 第五步：梳理数据流

描述核心业务流程中数据如何流转：
- 数据从哪里来（用户输入、平台 API、APL 函数）
- 经过哪些转换（字段映射、format_field_value 等）
- 最终如何更新组件状态（setData / Vue reactivity）

### 第六步：技术选型与决策

记录关键技术决策及其理由：
- 选择了什么方案，为什么
- 放弃了哪些备选方案，为什么
- 已知的权衡（tradeoffs）
- 决策是否符合 `.sharedev/specs/` 中的规范约定

## 技术文档

**读取模板**：先读取 `.claude/skills/write-pwc-arch/assets/template.md`，以该模板为结构基础编写技术文档。

填写要点：
- 删除模板中与本次功能无关的章节（如无双端差异则删除 2.2，如无方案对比则删除 3.3）
- `{{PLACEHOLDER}}` 全部替换为实际内容，不保留任何占位符
- 4.1 入口场景只保留实际用到的入口类型
- 4.3 平台 API 列表填写实际调用的 API 方法和参数

**保存文档**：写入 `/deliverables/YYYY-MM-DD-<功能名称>/arch.md`。

## 技术文档自我审查

写完后进行内联审查（不 dispatch subagent）：
- **完整性**：所有章节是否都有实质内容，无遗留占位符
- **一致性**：组件表、API 表、流程图中的名称是否一致
- **可行性**：方案是否依赖不存在的平台能力或未确认的 API
- **范围**：是否有遗漏的端差异或入口场景

发现问题直接修复。

## 用户审查

将技术文档发给用户确认。获批后，进入 `write-pwc-plan` 编写实施计划。
