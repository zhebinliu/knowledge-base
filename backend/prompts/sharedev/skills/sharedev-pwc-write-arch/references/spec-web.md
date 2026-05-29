# PWC Web 开发规范

## 适用范围

- **通用规范**：所有 PWC 组件和插件必须遵循
- **Component 规范**：仅适用于 `type=component`
- **Plugin 规范**：仅适用于 `type=plugin`

---

## 通用规范

### 1. 全局变量访问限制

组件只允许访问唯一的平台全局变量 `FxUI`，禁止访问任何其他全局变量，包括但不限于 `CRM`、`Fx` 及其他研发内部挂载的全局命名空间对象。此类变量属于平台内部实现细节，不保证稳定性和兼容性。

**Bad**

```js
const userId = CRM.currentUser.id;
const config = Fx.getConfig('module');
```

**Good**

```js
const userId = FxUI.getCurrentUser().id;
const config = FxUI.getConfig('module');
```

---

### 2. 禁止调用内部接口服务

禁止在组件中直接发起对内部后端接口的 HTTP 请求。所有数据请求必须通过 **FxUI API** 或 **APL 函数** 进行。

**Bad**

```js
FS.util.FHHApi({ url: '/api/internal/user/list', success: function(res){} });
fetch('http://internal-service/crm/data');
```

**Good**

```js
// 通过 FxUI API 获取数据
const users = await FxUI.objectApi.fetch_data('AccountObj');

// 通过 APL 函数获取数据
const result = await FxUI.userDefine.call_controller('apl_xxx__c', []);
```

---

### 3. 禁止额外的业务依赖

组件只能操作其可控区域内的 DOM，不得依赖宿主页面的结构、业务 class 或路由机制。

**Bad**

```js
document.querySelector('.crm-main-layout').style.overflow = 'hidden';
window.location.href = '/crm/detail/123';
history.pushState({}, '', '/new-path');
window.addEventListener('popstate', onRouteChange);
```

**Good**

```js
this.container.querySelector('.my-component-btn').style.display = 'none';
FxUI.router.navigate({ objectApiName: 'AccountObj', recordId: '123' });
```

---

### 4. 禁止操作非当前组件的 DOM

组件只能操作其自身容器（`this.$el`）内的 DOM 元素，禁止通过全局选择器、业务 class、`$parent` / `$root` 等方式访问或修改组件边界之外的 DOM。

**Bad**

```js
document.querySelector('.crm-main-layout').style.overflow = 'hidden';
document.body.classList.add('modal-open');
this.$parent.$el.querySelector('.header').style.display = 'none';
```

**Good**

```js
this.$el.querySelector('.my-component-btn').style.display = 'none';
this.$refs.myInput.focus();
```

---

### 5. 避免副作用

禁止向全局环境挂载变量或产生难以追踪的副作用。组件在销毁时必须清理自身产生的所有副作用。

**Bad**

```js
window.myComponentData = { version: '1.0' };
Array.prototype.last = function() { return this[this.length - 1]; };
window.addEventListener('resize', this.onResize);
setInterval(() => this.refresh(), 5000);
```

**Good**

```js
this._data = { version: '1.0' };

mounted() {
  this._onResize = this.onResize.bind(this);
  window.addEventListener('resize', this._onResize);
  this._timer = setInterval(() => this.refresh(), 5000);
},
beforeDestroy() {
  window.removeEventListener('resize', this._onResize);
  clearInterval(this._timer);
}
```

---

## Component 规范

> 待补充

---

## Plugin 规范

> 待补充
