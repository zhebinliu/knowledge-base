# 视觉伴侣指南（PRD 场景）

浏览器端可视化伴侣，用于在 PRD 讨论过程中展示界面草图、流程图和交互方案对比。

## 何时使用

按问题决策，而非按会话决策。判断标准：**用户看到比读到更容易理解吗？**

**使用浏览器**（内容本身是视觉的）：

- **界面草图** — 表单布局、列表页结构、导航结构、组件设计
- **交互流程图** — 用户操作路径、状态流转、业务流程
- **方案对比** — 两种布局、两种交互方式的并排对比
- **空间关系** — 功能模块关系图、实体关系图（以可视化形式呈现）

**使用终端**（内容是文字或表格的）：

- **需求和范围问题** — "X 是什么意思？"、"哪些功能在范围内？"
- **概念性 A/B/C 选择** — 用文字描述的方案选择
- **权衡列表** — 优缺点、对比表
- **澄清问题** — 任何答案是文字而非视觉偏好的问题

关于 UI 话题的问题不等于视觉问题。"你想要什么样的表单？"是概念性的——用终端。"这两种表单布局哪个更清晰？"是视觉的——用浏览器。

## 工作原理

服务器监听目录中的 HTML 文件，将最新文件推送到浏览器。你将 HTML 写入 `screen_dir`，用户在浏览器中看到并点击选择。选择结果记录到 `state_dir/events`，下一轮读取。

**内容片段 vs 完整文档：** 默认编写内容片段（不含 `<html>`、`<head>` 等），服务器自动套用框架模板。只有需要完全控制页面时才写完整文档。

## 启动服务器

```bash
# 启动服务器，将文件持久化到当前功能的 deliverables 目录
scripts/start-server.sh --project-dir deliverables/YYYY-MM-DD-<功能名称>

# 返回：{"type":"server-started","port":52341,"url":"http://localhost:52341",
#        "screen_dir":"deliverables/YYYY-MM-DD-<功能名称>/.visual/12345-1706000000/content",
#        "state_dir":"deliverables/YYYY-MM-DD-<功能名称>/.visual/12345-1706000000/state"}
```

同时保存 `screen_dir` 和 `state_dir`，告知用户打开 URL。

**查找连接信息：** 服务器将启动 JSON 写入 `$STATE_DIR/server-info`。若后台启动后未捕获 stdout，读取该文件获取 URL 和端口。

**注意：** 提醒用户将 `deliverables/` 中的 `.visual/` 子目录加入 `.gitignore`（视觉草稿无需提交）。

**按平台启动：**

**Claude Code（macOS / Linux）：**
```bash
scripts/start-server.sh --project-dir deliverables/YYYY-MM-DD-<功能名称>
```

**Claude Code（Windows）：**
```bash
# Windows 自动检测并使用前台模式（会阻塞 tool call）
# 调用 Bash 工具时设置 run_in_background: true
scripts/start-server.sh --project-dir deliverables/YYYY-MM-DD-<功能名称>
```
下一轮读取 `$STATE_DIR/server-info` 获取 URL 和端口。

**Codex：**
```bash
# 脚本自动检测 CODEX_CI 并切换为前台模式，正常运行即可
scripts/start-server.sh --project-dir deliverables/YYYY-MM-DD-<功能名称>
```

**Gemini CLI：**
```bash
# 使用 --foreground，并在 shell tool call 中设置 is_background: true
scripts/start-server.sh --project-dir deliverables/YYYY-MM-DD-<功能名称> --foreground
```

## 工作循环

1. **检查服务器存活，再写 HTML** 到 `screen_dir` 中的新文件：
   - 每次写入前，检查 `$STATE_DIR/server-info` 是否存在。若不存在（或存在 `$STATE_DIR/server-stopped`），服务器已关闭——用 `start-server.sh` 重启后再继续。服务器在 30 分钟无活动后自动退出。
   - 使用语义化文件名：`form-layout.html`、`flow-comparison.html`
   - **不要复用文件名**——每个屏幕用新文件
   - 用 Write 工具写入——**不要用 cat/heredoc**

2. **告知用户并结束本轮：**
   - 每步都提醒 URL（不只第一步）
   - 简要说明屏幕内容
   - 邀请用户在终端回复

3. **下一轮：**
   - 读取 `$STATE_DIR/events`（如存在）——包含用户浏览器点击的 JSON 行
   - 结合用户终端文字获取完整反馈
   - 若 `$STATE_DIR/events` 不存在，用户未与浏览器交互——仅用终端文字

4. **迭代或推进** — 反馈改变当前屏幕时写新文件（如 `form-layout-v2.html`）

5. **返回终端时清屏** — 下一步不需要浏览器时，推送等待屏：

   ```html
   <!-- filename: waiting.html -->
   <div style="display:flex;align-items:center;justify-content:center;min-height:60vh">
     <p class="subtitle">继续在终端中进行...</p>
   </div>
   ```

6. 重复直到完成。

## 内容片段示例

```html
<h2>哪种表单布局更清晰？</h2>
<p class="subtitle">考虑信息密度和用户填写效率</p>

<div class="options">
  <div class="option" data-choice="a" onclick="toggleSelect(this)">
    <div class="letter">A</div>
    <div class="content">
      <h3>单列布局</h3>
      <p>每行一个字段，视觉流线清晰</p>
    </div>
  </div>
  <div class="option" data-choice="b" onclick="toggleSelect(this)">
    <div class="letter">B</div>
    <div class="content">
      <h3>双列布局</h3>
      <p>相关字段并排，减少页面滚动</p>
    </div>
  </div>
</div>
```

## 可用 CSS 类

### 选项（A/B/C 选择）
```html
<div class="options">
  <div class="option" data-choice="a" onclick="toggleSelect(this)">
    <div class="letter">A</div>
    <div class="content"><h3>标题</h3><p>描述</p></div>
  </div>
</div>
```
**多选：** 在容器上加 `data-multiselect`。

### 卡片（视觉设计）
```html
<div class="cards">
  <div class="card" data-choice="design1" onclick="toggleSelect(this)">
    <div class="card-image"><!-- 原型内容 --></div>
    <div class="card-body"><h3>名称</h3><p>描述</p></div>
  </div>
</div>
```

### 原型容器
```html
<div class="mockup">
  <div class="mockup-header">预览：客户列表页</div>
  <div class="mockup-body"><!-- 原型 HTML --></div>
</div>
```

### 并排对比
```html
<div class="split">
  <div class="mockup"><!-- 左侧 --></div>
  <div class="mockup"><!-- 右侧 --></div>
</div>
```

### 优缺点
```html
<div class="pros-cons">
  <div class="pros"><h4>优点</h4><ul><li>好处</li></ul></div>
  <div class="cons"><h4>缺点</h4><ul><li>不足</li></ul></div>
</div>
```

### 线框构建块
```html
<div class="mock-nav">Logo | 首页 | 关于 | 联系</div>
<div style="display: flex;">
  <div class="mock-sidebar">导航</div>
  <div class="mock-content">主内容区</div>
</div>
<button class="mock-button">操作按钮</button>
<input class="mock-input" placeholder="输入字段">
<div class="placeholder">占位区域</div>
```

## 浏览器事件格式

```jsonl
{"type":"click","choice":"a","text":"选项A - 单列布局","timestamp":1706000101}
{"type":"click","choice":"b","text":"选项B - 双列布局","timestamp":1706000115}
```

最后一个 `choice` 事件通常是最终选择，但点击路径可以揭示用户犹豫或偏好。

## 设计建议

- **按问题调整保真度** — 布局问题用线框，外观问题用高保真
- **每页说明问题** — "哪种布局更专业？"而非仅"选一个"
- **迭代后再推进** — 反馈改变当前屏幕时写新版本
- **每屏最多 2-4 个选项**

## 停止服务器

```bash
scripts/stop-server.sh $SESSION_DIR
```

若使用了 `--project-dir`，原型文件持久保存在 `deliverables/YYYY-MM-DD-<功能名称>/` 供后续参考。

## 参考文件

- 框架模板（CSS 参考）：`scripts/frame-template.html`
- 客户端辅助脚本：`scripts/helper.js`
