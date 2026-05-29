---
name: sharedev-pwc-finish-development
description: 当实现完成、准备结束开发时使用——验证测试通过，确保代码可交付
---

# 完成 PWC 开发

## 概述

通过验证测试确保开发工作达到可交付状态，发布后输出配置说明文档。

**核心原则：** 先验证测试，再宣布完成。

**开始时执行：** `sharedev trace -m skill --str1 sharedev-pwc-finish-development`

**开始时声明：** "我正在使用 finish-pwc-development skill 来完成这项工作。"

## 流程

### 第 1 步：人工测试

**在发布之前，先根据 PRD 和技术方案生成配置说明文档，连同测试请求一起输出，让用户在测试的同时拿到配置信息：**

```
请对以下内容进行人工测试：
- 组件/插件名称：<name>
- 类型：<component | plugin>

测试通过后请告知，以便继续发布流程。

---

<在此处直接输出配置说明文档，见下方模板>
```

**停止等待用户确认测试通过。** 未经确认不得进入下一步。

### 第 2 步：发布

**人工测试通过后，执行发布命令：**

```bash
# 发布组件
sharedev pwc deploy <ComponentName> --type component

# 发布插件
sharedev pwc deploy <PluginName> --type plugin
```

**发布失败时：**
```
发布失败，错误信息：

[显示错误详情]

请检查后重试。
```

**发布成功后宣布完成。**

---

## 配置说明文档

### 配置文档模板

```
## 配置说明：<功能名称>

### 一、组件/插件信息

| 项目 | 内容 |
|------|------|
| 名称 | `<ComponentName 或 PluginName>` |
| 类型 | 组件 / 插件 |
| 适用场景 | <场景名称> |

### 二、配置步骤

**步骤 1：进入后台配置页面**

<管理台链接>

**步骤 2：完成配置**

参考文档：<配置文档链接>

- 插件：在「功能增强」中挂载 `<PluginName>`
- 组件：在「布局增强」中将 `<ComponentName>` 拖入目标区域
- 配置参数（如有）：
  - `<参数名>`：`<参数说明>`

**步骤 3：保存并发布**

### 三、前台预览

<前台预览链接>

> <预览说明>

### 四、注意事项

<根据需求和技术方案填写>
```

#### 场景参数表

根据需求上下文，从下表中选择对应场景，将参数回填到模板中：

| 场景 | 配置文档链接 | 管理台链接 | 前台预览链接 | 预览说明 |
|------|------------|-----------|------------|---------|
| 对象表单 / 对象详情 / 对象列表（插件） | https://www.fxiaoke.com/mob/guide/pwc/dist/guide/scenes/object/feature-enhance.html | 系统对象：https://www.fxiaoke.com/XV/UI/manage#crmmanage/=/module-sysobject<br>自定义对象：https://www.fxiaoke.com/XV/UI/manage#crmmanage/=/module-myobject | 新版：https://www.fxiaoke.com/XV/UI/Home#paasapp/list/=/appId_CRM/`<objectApiName>`?debug=1<br>老版：https://www.fxiaoke.com/XV/UI/Home#crm/list/=/<objectApiName>?debug=1 | 详情页：点击列表中任意一条数据；表单页：点击「新建」按钮 |
| 对象表单 / 对象详情 / 对象列表（组件） | https://www.fxiaoke.com/mob/guide/pwc/dist/guide/scenes/object/layout-enhance.html | 同上 | 同上 | 同上 |
| 自定义页面 | https://www.fxiaoke.com/mob/guide/pwc/dist/guide/scenes/app/layout-enhance.html | — | https://www.fxiaoke.com/XV/UI/Home#crm/custompage/=/<pageApiName>?debug=1 | — |
| 应用首页 | https://www.fxiaoke.com/mob/guide/pwc/dist/guide/scenes/app/layout-enhance.html | — | https://www.fxiaoke.com/XV/UI/Home#paasapp/index/=/appId_CRM?debug=1 | — |

**生成要求：**
- 将表中 `<objectApiName>`、`<pageApiName>` 替换为实际值
- 对象场景同时输出新版和老版两个预览地址
- 系统对象 / 自定义对象根据实际情况选择对应管理台链接
- 注意事项必须结合实际需求填写，不得保留占位符

## 常见错误

**跳过人工测试直接发布**
- **问题：** 发布了未经验证的代码
- **修复：** 始终等待用户确认人工测试通过后再发布

**发布命令类型错误**
- **问题：** `--type` 参数与实际类型不符
- **修复：** 确认是 `component` 还是 `plugin`，再执行命令

**配置说明与测试请求分开输出**
- **问题：** 先让用户测试，发布后才输出配置说明，用户无法边测试边配置
- **修复：** 配置说明文档与测试请求一起在第 1 步输出

## 红线（绝不触犯）

**绝不：**
- 未经人工测试确认直接发布
- 发布失败时宣布完成
- 配置说明中保留未填写的占位符（URL 除外）
- 配置说明与测试请求分开输出（必须在第 1 步一起给出）

**始终：**
- 配置说明文档与测试请求一起在第 1 步输出
- 等待用户确认人工测试通过后再发布
- 验证发布成功后再宣布完成
- 配置说明结合实际需求输出具体内容

## 集成

**由以下 skill 调用：**
- **sharedev-pwc-subagent-driven-development**（所有任务完成后）
- **sharedev-pwc-execute-plans**（所有批次完成后）
