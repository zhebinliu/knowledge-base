# 技术方案

> 版本：v1.0 | 创建日期：{{DATE}}
> 关联PRD：{{PRD_LINK}}
> 优先级：{{PRIORITY}}
> 端：{{PLATFORM}} _(Web / 移动端小程序 / 双端)_

---

# 一、需求描述

## 1.1 背景

> 产品需求贴出PRD链接即可；技术需求需描述现状和存在的问题。

{{BACKGROUND}}

## 1.2 目标

{{GOALS}}

---

# 二、需求分析

## 2.1 主要功能点

> 拆解需求，列出主要功能点。

| 编号 | 功能点 | 描述 | 端 | 对应TAPD Task |
|------|--------|------|----|---------------|
| 1 | {{FEATURE_1}} | {{FEATURE_1_DESC}} | Web / 小程序 / 双端 | {{TAPD_TASK_1}} |
| 2 | {{FEATURE_2}} | {{FEATURE_2_DESC}} | Web / 小程序 / 双端 | {{TAPD_TASK_2}} |

## 2.2 端差异说明

> 描述 Web 端（Vue2）与移动端小程序之间的功能或交互差异。

| 功能点 | Web 端 | 小程序端 | 说明 |
|--------|--------|----------|------|
| {{FEATURE}} | {{WEB_BEHAVIOR}} | {{MP_BEHAVIOR}} | {{DIFF_NOTE}} |

## 2.3 待确认

| 编号 | 待确认项 | 结论 | 确认人 |
|------|----------|------|--------|
| 1 | {{PENDING_ITEM}} | {{CONCLUSION}} | {{CONFIRMER}} |

---

# 三、系统架构

## 3.1 架构图

{{ARCHITECTURE_DIAGRAM}}

## 3.2 架构说明

{{ARCHITECTURE_DESCRIPTION}}

> **前端架构设计原则**（设计时参考）：
>
> 1. **组件职责单一**：一个组件只负责一类明确的 UI 或逻辑，避免"万能组件"。
> 2. **单向数据流**：数据从父组件向下流动，事件向上冒泡，避免双向耦合。
> 3. **逻辑与视图分离**：业务逻辑抽取到 hooks / composables / service 层，组件只负责渲染。
> 4. **接口隔离**：组件对外暴露最小必要的 props 和 events，减少外部依赖。
> 5. **平台 API 优先**：优先使用 objectApi / appApi / paasApi，不直接发 HTTP；跨端逻辑封装为共享 service，差异化实现各端适配。

## 3.3 方案对比与决策记录

### 决策1：{{DECISION_TITLE}}

| 项目 | 内容 |
|------|------|
| 状态 | 已决策 / 待讨论 |
| 决策日期 | {{DECISION_DATE}} |
| 决策人 | {{DECISION_MAKER}} |

**背景**：{{DECISION_CONTEXT}}

**备选方案**：

| 方案 | 描述 | 优势 | 劣势 |
|------|------|------|------|
| 方案A：{{OPTION_A}} | {{OPTION_A_DESC}} | {{OPTION_A_PROS}} | {{OPTION_A_CONS}} |
| 方案B：{{OPTION_B}} | {{OPTION_B_DESC}} | {{OPTION_B_PROS}} | {{OPTION_B_CONS}} |

**决策**：选择 {{CHOSEN_OPTION}}

**影响**：{{DECISION_IMPACT}}

---

# 四、详细设计

## 4.1 入口场景设计

> PWC 组件/插件由平台加载，不存在独立路由。说明组件出现在哪些平台入口。

| 入口类型 | 说明 | 端 |
|----------|------|----|
| 页面布局 | 嵌入对象详情页 / 列表页 / 自定义页面 | Web / 小程序 |
| 弹出对话框 | 通过 `openCustomComponent` 弹出 | Web / 小程序 |
| 全屏对话框 | 全屏展示自定义组件 | 小程序 |
| 插件（低代码） | 无需独立组件，通过平台插件机制扩展 | Web / 小程序 |

_删除不适用的入口类型，填写触发条件。_

## 4.2 组件设计

> 列出本次新增或改造的核心组件。

| 组件名 | 路径 | 职责 | 状态 |
|--------|------|------|------|
| {{COMPONENT_NAME}} | `src/components/{{PATH}}` | {{RESPONSIBILITY}} | 新增 / 修改 |

## 4.3 接口调用设计

> PWC 通过平台 API 或者 APL 函数获取数据，不直接发 HTTP 请求。

### 4.3.1 平台 API 列表

| 接口描述 | API 类型 | 方法 | 端 |
|----------|----------|------|----|
| {{API_DESC}} | objectApi / appApi / paasApi / fs-hera-api | {{METHOD}} | Web / 小程序 / 双端 |

> **API 类型说明：**
> - `objectApi` — 对象数据读写（fetch_data、fetch_describe、format_field_value 等）
> - `appApi` — 应用级操作（导航、通知、跨应用等）
> - `paasApi` — 平台 UI 操作（openDetail、crmOpenDetail 等）
> - `fs-hera-api` — 平台工具（i18n、媒体、组织等）

### 4.3.2 数据处理

```javascript
// Web 端（Vue2）
import { objectApi } from 'fs-hera-api'
const res = await objectApi.fetch_data({ objectApiName: '{{OBJECT_API_NAME}}' })

// 小程序端
import objectApi from 'fs-hera-api/api/objectapi/index'
objectApi.fetch_data({ objectApiName: '{{OBJECT_API_NAME}}' }).then(res => {
  this.setData({ list: res.data })
})
```

## 4.4 处理流程

> 根据功能复杂度选择合适的图示：
> - 涉及多组件/多接口的数据流转 → **时序图**
> - 单一功能的复杂交互逻辑 → **流程图**
> - 存在多状态（≥3个）变化 → **状态机图**

### {{FEATURE_NAME}} 流程

```
用户操作
  → 组件触发方法
  → 调用接口
  → 更新组件状态
  → 视图响应更新
```

---

# 五、非功能性设计

## 5.1 性能设计

| 项目 | 方案 | 说明 |
|------|------|------|
| {{PERF_ITEM}} | {{PERF_APPROACH}} | {{PERF_NOTE}} |

## 5.2 国际化支持

| 能力项 | 是否需要 | 说明 |
|--------|----------|------|
| 多语言（i18n） | ☐ 是 / ☑ 否 | {{I18N_NOTE}} |
| 多时区 | ☐ 是 / ☑ 否 | {{TIMEZONE_NOTE}} |
| 多区域（数字/货币格式） | ☐ 是 / ☑ 否 | {{LOCALE_NOTE}} |

## 5.3 兼容性设计

| 项目 | 范围 | 说明 |
|------|------|------|
| 小程序基础库版本 | ≥ {{MP_BASE_LIB_VERSION}} | {{MP_COMPAT_NOTE}} |
| PWC 平台版本 | ≥ {{PWC_VERSION}} | {{PWC_COMPAT_NOTE}} |
| FxUI 版本 | ≥ {{FXUI_VERSION}} | {{FXUI_COMPAT_NOTE}} |
| 屏幕适配（小程序） | 750rpx 设计稿 | {{RESPONSIVE_NOTE}} |

---

# 六、业务影响评估

## 6.1 影响范围

{{IMPACT_SCOPE}}

## 6.2 向下兼容性

| 项目 | 说明 |
|------|------|
| 是否向下兼容 | {{BACKWARD_COMPATIBLE}} |
| 不兼容时用户侧感知 | {{USER_IMPACT}} |
| 灰度/降级方案 | {{FALLBACK_PLAN}} |

---

# 七、风险与应对

| 编号 | 风险描述 | 风险等级 | 影响范围 | 应对策略 | 负责人 |
|------|----------|----------|----------|----------|--------|
| 1 | {{RISK_DESC}} | 高 / 中 / 低 | {{RISK_IMPACT}} | {{RISK_MITIGATION}} | {{RISK_OWNER}} |

---

# 八、任务拆解与排期

| 编号 | 任务 | 端 | 负责人 | 预估工时 | 依赖任务 | 状态 |
|------|------|----|--------|----------|----------|------|
| 1 | {{TASK_1}} | Web / 小程序 | {{ASSIGNEE_1}} | {{ESTIMATE_1}} | - | 待开始 |
| 2 | {{TASK_2}} | Web / 小程序 | {{ASSIGNEE_2}} | {{ESTIMATE_2}} | #1 | 待开始 |

---

# 附录

## 附录A：词汇表

| 术语 | 定义 |
|------|------|
| {{TERM}} | {{DEFINITION}} |

## 附录B：关联文档

| 文档名称 | 链接 |
|----------|------|
| {{DOC_NAME}} | {{DOC_LINK}} |