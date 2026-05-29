# APL API索引

> 原始文档位置: `<aplApiDocs>`

## 核心业务API

### Fx.object - 对象数据操作
**文档**: [ObjectDataAPI.md](<aplApiDocs>ObjectDataAPI.md)

**主要功能**:
- 数据创建: `create()`, `batchCreate()`, `copyByRule()`
- 数据查询: `find()`, `findOne()`, `findById()`, `select()`
- 数据更新: `update()`, `batchUpdate()`
- 数据删除: `remove()`, `delete()`, `directDelete()`
- 团队管理: `addTeamMember()`, `changeOwner()`
- 其他: `lock()`, `aggregate()`, `duplicateSearch()`

---

### Fx.org - 组织架构
**文档**: [OrganizationAPI.md](<aplApiDocs>OrganizationAPI.md)

**主要功能**:
- 部门管理: `findDepartment()`, `listDepartment()`
- 员工管理: `findEmployee()`, `listEmployee()`
- 角色权限: `findRole()`, `listRole()`

---

### Fx.userGroup - 用户组
**文档**: [UserGroupAPI.md](<aplApiDocs>UserGroupAPI.md)

---

### Fx.auth - 认证授权
**文档**: [AuthAPI.md](<aplApiDocs>AuthAPI.md)

---

### Fx.dataAuth - 数据权限
**文档**: [DataAuthAPI.md](<aplApiDocs>DataAuthAPI.md)

---

## 通信与消息API

### Fx.http - HTTP请求
**文档**: [HttpAPI.md](<aplApiDocs>HttpAPI.md)

**主要功能**:
- `execute()` - 通用HTTP请求(推荐)
- `get()`, `post()`, `put()`, `delete()` - RESTful请求
- `postSoap()` - SOAP请求
- 请求体: StringBody, FormBody, MultipartBody

---

### Fx.message - 消息通知
**文档**: [MessageAPI.md](<aplApiDocs>MessageAPI.md)

**主要功能**:
- `send()` - 发送文本/卡片消息
- `sendNotice()` - 发送CRM通知
- `sendEmail()` - 发送邮件
- `throwException()` - 抛出异常

---

### Fx.mq - 消息队列
**文档**: [MqAPI.md](<aplApiDocs>MqAPI.md)

---

## 业务功能API

### Fx.crm - CRM业务
**文档**: [CRMAPI.md](<aplApiDocs>CRMAPI.md)

---

### Fx.work - 工作流
**文档**: [WorkAPI.md](<aplApiDocs>WorkAPI.md)

---

### Fx.approval - 审批流程
**文档**: [ApprovalAPI.md](<aplApiDocs>ApprovalAPI.md)

---

### Fx.bpm - 业务流程管理
**文档**: [BpmAPI.md](<aplApiDocs>BpmAPI.md)

---

### Fx.sign - 电子签
**文档**: [SignAPI.md](<aplApiDocs>SignAPI.md)

---

### Fx.tag - 标签管理
**文档**: [TagAPI.md](<aplApiDocs>TagAPI.md)

---

## 工具类API

### Fx.log - 日志记录
**文档**: [LogAPI.md](<aplApiDocs>LogAPI.md)

**主要功能**:
- `info()`, `warn()`, `error()`, `debug()` - 日志记录
- `lap()` - 耗时统计

---

### Fx.json - JSON处理
**文档**: [JsonAPI.md](<aplApiDocs>JsonAPI.md)

---

### Fx.crypto - 加密解密
**文档**: [CryptoAPI.md](<aplApiDocs>CryptoAPI.md)

---

### Fx.cache - 缓存管理
**文档**: [CacheAPI.md](<aplApiDocs>CacheAPI.md)

---

### Fx.lock - 锁机制
**文档**: [LockAPI.md](<aplApiDocs>LockAPI.md)

---

### Fx.random - 随机数
**文档**: [RandomAPI.md](<aplApiDocs>RandomAPI.md)

---

### Fx.utils - 工具函数
**文档**: [UtilsAPI.md](<aplApiDocs>UtilsAPI.md)

---

## 文件与存储API

### Fx.file - 文件操作
**文档**: [FileAPI.md](<aplApiDocs>FileAPI.md)

**主要功能**:
- `upload()` - 文件上传
- `download()` - 文件下载
- `delete()` - 文件删除
- `getPreviewUrl()` - 获取预览地址

---

### Fx.netdisk - 网盘操作
**文档**: [NetdiskAPI.md](<aplApiDocs>NetdiskAPI.md)

---

## AI与智能API

### Fx.AI - AI能力
**文档**: [AIAPI.md](<aplApiDocs>AIAPI.md)

---

### Fx.BI - BI分析
**文档**: [BIAPI.md](<aplApiDocs>BIAPI.md)

---

## 其他API

### Fx.function - 函数调用
**文档**: [FunctionAPI.md](<aplApiDocs>FunctionAPI.md)

---

### Fx.template - 模板管理
**文档**: [TemplateAPI.md](<aplApiDocs>TemplateAPI.md)

---

### Fx.global - 全局变量
**文档**: [GlobalVariableAPI.md](<aplApiDocs>GlobalVariableAPI.md)

---

### Fx.location - 位置服务
**文档**: [LocationAPI.md](<aplApiDocs>LocationAPI.md)

---

### Fx.checkins - 签到
**文档**: [CheckinsAPI.md](<aplApiDocs>CheckinsAPI.md)

---

### Fx.stage - 阶段管理
**文档**: [StageAPI.md](<aplApiDocs>StageAPI.md)

---

### Fx.er - ERP集成
**文档**: [ERAPI.md](<aplApiDocs>ERAPI.md)

---

### Fx.industry - 行业解决方案
**文档**: [IndustryAPI.md](<aplApiDocs>IndustryAPI.md)

---

### Fx.hospital - 医疗行业
**文档**: [HospitalAPI.md](<aplApiDocs>HospitalAPI.md)

---

## 辅助文档

### Context上下文
**文档**: [context.md](<aplApiDocs>context.md)

### 代理请求
**文档**: [proxyRequest.md](<aplApiDocs>proxyRequest.md)
