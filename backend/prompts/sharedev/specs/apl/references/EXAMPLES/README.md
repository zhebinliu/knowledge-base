# 真实代码示例库

**用途**: 按场景分类的真实 Groovy 函数代码模板，直接套用！

## 📁 目录结构

```
EXAMPLES/
├── pre-validation/      # 前验证场景（新建/编辑时自动处理）
├── planed-task/         # 计划任务场景（定时批量处理）
├── workflow/            # 工作流场景（审批通过/拒绝后触发）
└── data-sync/           # 数据同步场景（跨对象关联更新）
```

---

## 🎯 快速查找

### 根据触发类型选文件夹

| 你的需求 | 去哪个文件夹找？ | 关键词搜索 |
|---------|----------------|-----------|
| "客户新建时自动..." | `pre-validation/` | `Vld_*` |
| "每天/每周定时处理..." | `planed-task/` | `Pln*` |
| "审批通过后自动..." | `workflow/` | `Proc_*` |
| "把 A 对象的字段同步到 B 对象" | `data-sync/` | `Sync`, `BatchUpdate` |

### 根据业务逻辑选模板

| 业务场景 | 参考文件 | 核心技巧 |
|---------|---------|---------|
| 负责人默认值 | [Vld_AccountCreate_SetOwner.groovy](./pre-validation/Vld_AccountCreate_SetOwner.groovy) | `context.data` 修改后返回成功 |
| 部门层级判断 | [Pln_StoreAreaDepartmentSync.groovy](./data-sync/Pln_StoreAreaDepartmentSync.groovy) | `dept_parent_path.split()` |
| 大数据量处理 | [Pln_BatchUpdateCustomerDepartmentSync.groivy](./data-sync/Pln_BatchUpdateCustomerDepartmentSync.groovy) | `select + Consumer + batchUpdate` |
| 对象关联查询 | [MultiAgent_SalesOrder_UpdateCustomerLastDeal.groovy](./workflow/MultiAgent_SalesOrder_UpdateCustomerLastDeal.groovy) | `findOne` → `findById` → `update` |

---

## 💡 使用建议

1. **不要死记硬背** - 理解模式后，按场景找到对应模板
2. **修改前先 grep** - 看看 ai-function 里有没有类似的实现
3. **参考真实项目** - `./examples/` 有更多生产级代码
4. **遇到报错先看 CORE-RULES** - 80% 的错误都是违反了铁律

---

## 🔄 贡献新案例

写完新的函数后，如果：
- ✅ 是一个典型场景
- ✅ 代码质量高、注释清晰
- ✅ 可以帮到其他开发者

欢迎复制一份到这个目录（去掉敏感信息），让其他人受益！
