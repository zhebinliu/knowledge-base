---
name: sharedev-pwc
description: >
  Use when the task involves ShareDev PWC workspace commands: pulling, pushing,
  deploying, or creating PWC components/plugins. Trigger on requests mentioning
  sharedev pwc / PWC component / PWC plugin / pwc pull / pwc push / pwc deploy / pwc create.
allowed-tools:
  - Bash(sharedev pwc *)
  - Bash(node ./dist/sharedev.js pwc *)
---

# ShareDev PWC Commands

PWC (Page Widget Component) workspace commands for managing components and plugins.

**开始时执行：** `sharedev trace -m skill --str1 sharedev-pwc`

## Subcommands Overview

| Subcommand | Description |
|------------|-------------|
| `pull`     | Pull PWC source from remote to local workspace |
| `push`     | Upload local files and update metadata (no build) |
| `deploy`   | push + build + publish in one step |
| `create`   | Create a new PWC resource and pull it locally |
| `init`     | Placeholder (not yet implemented) |
| `publish`  | Placeholder (not yet implemented) |
| `dev`      | Placeholder (not yet implemented) |

---

## `sharedev pwc pull`

Pull one or all PWC resources from remote.

```bash
# Pull a single resource by apiName
sharedev pwc pull --apiname <apiName> --type <component|plugin>

# Pull all resources of a type
sharedev pwc pull --all --type <component|plugin>
```

### Options

| Option | Required | Description |
|--------|----------|-------------|
| `--type <type>` | **required** | PWC resource type. Values: `component`, `plugin` |
| `--apiname <apiName>` | one of | Pull a single resource by its API name |
| `--all` | one of | Pull all resources of the specified type |

> `--apiname` and `--all` are mutually exclusive. Exactly one must be provided.

---

## `sharedev pwc push`

Upload local source files and update remote metadata. Does **not** trigger a build.

```bash
sharedev pwc push --apiname <apiName> --type <component|plugin>
sharedev pwc push --path <localPath> --type <component|plugin>
```

### Options

| Option | Required | Description |
|--------|----------|-------------|
| `--type <type>` | **required** | PWC resource type. Values: `component`, `plugin` |
| `--apiname <apiName>` | one of | Target resource by API name |
| `--path <path>` | one of | Target resource by local directory path |

> `--apiname` and `--path` are mutually exclusive. Exactly one must be provided.

---

## `sharedev pwc deploy`

Full deploy: push + build + publish in one step.

```bash
sharedev pwc deploy --apiname <apiName> --type <component|plugin>
sharedev pwc deploy --path <localPath> --type <component|plugin>
```

### Options

| Option | Required | Description |
|--------|----------|-------------|
| `--type <type>` | **required** | PWC resource type. Values: `component`, `plugin` |
| `--apiname <apiName>` | one of | Target resource by API name |
| `--path <path>` | one of | Target resource by local directory path |

> `--apiname` and `--path` are mutually exclusive. Exactly one must be provided.

---

## `sharedev pwc create`

Create a new PWC resource on remote and pull it into local workspace. All options are optional in interactive (TTY) mode; required in non-interactive mode.

```bash
# Component (interactive)
sharedev pwc create --type component

# Component (non-interactive)
sharedev pwc create \
  --type component \
  --name "My Component" \
  --apiname mycomponent__c \
  --component-type vue \
  --client-types web,app \
  --scope-page-types detailPage,listPage

# Plugin (non-interactive)
sharedev pwc create \
  --type plugin \
  --name "My Plugin" \
  --apiname myplugin__c \
  --client web \
  --plugin-type <pluginTypeValue>
```

### Options

| Option | Applies to | Description |
|--------|-----------|-------------|
| `--type <type>` | both | PWC resource type. Values: `component`, `plugin` |
| `--name <name>` | both | Display name of the PWC resource |
| `--apiname <apiName>` | both | API name. Format: `[a-zA-Z]\w{0,46}__c` (no double underscores before `__c`) |
| `--description <description>` | both | Optional description |
| `--component-type <componentType>` | component | Component framework type. Common values: `vue`, `applet` (server-configured) |
| `--client-types <clientTypes>` | component | Comma-separated supported clients. Values: `web`, `app`. Default: `web` |
| `--scope-page-types <scopePageTypes>` | component | Comma-separated page type values (server-configured) |
| `--client <client>` | plugin | Plugin client platform. Values: `web`, `app` |
| `--plugin-type <pluginType>` | plugin | Plugin type value (server-configured) |
| `--limit-obj <limitObj>` | both | Whether to restrict to specific objects. Values: `true`, `false` |
| `--scope-objects <scopeObjects>` | both | Comma-separated object API names. Used when `--limit-obj true`. Default: `ALL` |

### API name format

```
^[a-zA-Z](?!.*__.*__c$)\w{0,46}__c$
```

- Must start with a letter
- Must end with `__c`
- No double `__` segments before the trailing `__c`
- Total identifier part: 1–47 characters before `__c`

### `--component-type` values

`vue`, `applet`

### `--scope-page-types` values (`--component-type vue`)

| Value | Label |
|-------|-------|
| `ObjectDetailPage` | 对象详情页 |
| `ObjectListPage` | 对象列表页 |
| `ObjectEditPage` | 对象新建编辑页 |
| `PortalPage` | 自定义页面 |
| `CRMHomePage` | CRM首页 |
| `call_center_phone_bar` | 呼叫中心电话条 |
| `LoginPage` | 自定义登录组件 |
| `OnlineDoc` | 在线文档 |
| `DashboardPage` | 数据驾驶舱页 |
| `Website` | 互联站点 |
| `flow_todo_list_comp` | 待办列表-批处理定制 |
| `custom_form_comp` | 自定义表单组件 |

### `--scope-page-types` values (`--component-type applet`)

| Value | Label |
|-------|-------|
| `ObjectDetailPage` | 对象详情页 |
| `ObjectListPage` | 对象列表页 |
| `ObjectEditPage` | 对象新建编辑页 |
| `PortalPage` | 自定义页面 |
| `Website` | 互联站点 |
| `flow_todo_list_comp` | 待办列表-批处理定制 |
| `custom_form_comp` | 自定义表单组件 |

### `--plugin-type` values (`--client web`)

| Value | Label |
|-------|-------|
| `list_plugin` | 列表页JS插件 |
| `edit_plugin` | 新建编辑页JS插件 |
| `detail_plugin` | 详情页JS插件 |
| `approval_detail_plugin` | 审批流详情页JS插件 |
| `approval_todo_list_plugin` | 审批待办列表JS插件 |
| `bpm_detail_plugin` | 业务流JS插件 |
| `bpm_todo_list_plugin` | 业务流待办列表JS插件 |
| `stage_detail_plugin` | 阶段推进器JS插件 |
| `step_view_plugin` | 阶段视图JS插件 |
| `eservice_sop_plugin` | 服务通现场标准作业JS插件 |
| `eservice_callcenter_plugin` | 客服工作台JS插件 |
| `eservice_checkgroup_plugin` | 服务通检查组JS插件 |
| `eservice_terminal_user_task_plugin` | 服务通终端用户任务JS插件 |
| `eservice_engineer_map_plugin` | 服务通工程师分布JS插件 |
| `dht_product_detail_plugin` | 订货通商品详情JS插件 |
| `dht_website_plugin` | 商城站点JS插件 |
| `dashboard_plugin` | 数据驾驶舱JS插件 |
| `paasapp_plugin` | 平台应用JS插件 |
| `selected_list_plugin` | 选数据列表页插件 |

### `--plugin-type` values (`--client app`)

| Value | Label |
|-------|-------|
| `list_card_plugin` | 列表页卡片替换插件 |
| `list_plugin` | 列表页JS插件 |
| `edit_plugin` | 新建编辑页JS插件 |
| `detail_plugin` | 详情页JS插件 |
| `custom_page_plugin` | 自定义页面JS插件 |
| `third_app_plugin` | 第三方app集成插件 |
| `approval_detail_plugin` | 审批详情页JS插件 |
| `approval_todo_list_plugin` | 审批待办列表JS插件 |
| `bpm_detail_plugin` | 业务流JS插件 |
| `stage_detail_plugin` | 阶段推进器JS插件 |
| `step_view_plugin` | 阶段视图JS插件 |
| `eservice_sop_plugin` | 服务通现场标准作业JS插件 |
| `eservice_checkgroup_plugin` | 服务通检查组JS插件 |
| `eservice_terminal_user_task_plugin` | 服务通终端用户任务JS插件 |
| `eservice_engineer_map_plugin` | 服务通工程师分布JS插件 |
| `paasapp_plugin` | 平台应用JS插件 |
| `selected_list_plugin` | 选数据列表页插件 |
| `dht_appsite_plugin` | 商城站点JS插件 |
| `dht_app_cart_plugin` | 订货通购物车JS插件 |

---

## Quick reference

```bash
# Pull single component
sharedev pwc pull --apiname MyComponent__c --type component

# Pull all plugins
sharedev pwc pull --all --type plugin

# Push component by path
sharedev pwc push --path ./pwc/components/MyComponent__c --type component

# Full deploy plugin
sharedev pwc deploy --apiname MyPlugin__c --type plugin

# Create component (interactive)
sharedev pwc create --type component

# Create plugin (non-interactive)
sharedev pwc create --type plugin --name "My Plugin" --apiname myplugin__c \
  --client web --plugin-type <value> --limit-obj false
```

---

## Troubleshooting

### `--apiname` and `--path` both provided
Only one is allowed. Remove one of them.

### `--apiname` and `--all` both provided (pull)
Only one is allowed. Remove one of them.

### API name validation error
Ensure the name matches `^[a-zA-Z]\w{0,46}__c$` with no double-underscore segments before `__c`.

### Component/plugin type values unknown
Run the command interactively (in a TTY terminal) to see server-provided options via the selection prompt.
