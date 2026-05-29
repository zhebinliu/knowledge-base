# PWC Web 组件代码审查 Checklist

## 规范合规

- [ ] 是否只使用了 `FxUI` 作为全局变量入口，未访问 `CRM`、`Fx` 等其他全局命名空间
- [ ] 是否未直接发起内部 HTTP 请求（`fetch` / `axios` / `FS.util.FHHApi` 等），数据请求全部通过 FxUI API 或 APL 函数
- [ ] 是否只操作了组件自身容器（`this.$el`）内的 DOM，未通过业务 class、全局选择器选取外部元素
- [ ] 是否未通过 `$parent` / `$root` 访问或修改父组件的 DOM
- [ ] 是否未修改 `document.body` 等组件边界之外的全局 DOM 节点
- [ ] 页面跳转是否使用 `FxUI.router.navigate`，未使用 `window.location.href` / `history.pushState`
- [ ] 是否未向 `window` 或原型链挂载全局属性

## 内存泄漏

- [ ] `window.addEventListener` / `document.addEventListener` 是否在 `beforeDestroy` 中对应调用 `removeEventListener`
- [ ] `setInterval` / `setTimeout` 是否保存了引用，并在 `beforeDestroy` 中调用 `clearInterval` / `clearTimeout`
- [ ] 第三方库（图表、编辑器等）是否在 `beforeDestroy` 中调用了其 `destroy()` / `dispose()` 方法
- [ ] 跨组件的事件总线订阅（`$on` / `EventBus.$on`）是否在 `beforeDestroy` 中调用了 `$off`
- [ ] `IntersectionObserver` / `MutationObserver` / `ResizeObserver` 是否在 `beforeDestroy` 中调用了 `disconnect()`
- [ ] 未完成的异步请求（Promise / axios）是否在组件销毁时取消或忽略回调（避免在已销毁组件上 setState）
