/**
 * @author 纷享 - 杨亚兴 (基于社区模板 2022-02-09-075)
 * @codeName fileUploadDownloadTemplate
 * @description 纷享销客文件上传、下载、转换 Base64、生成分享链接等操作的完整示例
 * @createTime 2026-03-04
 */

// ==================== 一、从对象获取文件信息 ====================

/*
 * 文件附件字段的返回格式：
 * [{"ext":"png","path":"N_202201_11_5b61e0a51846419b8d301a4a0f8f66e4",
 *   "filename":"example.png","size":644496}]
 */
List photos = context.data.field_attachment_field__c as List

if(photos == null || photos.isEmpty()){
    log.info("无附件文件")
    return
}

log.info("获取到 ${photos.size()} 个附件文件")

// ==================== 二、方法 1: Fx.file.downloadFile 下载为 byte[] ====================

/*
 * 特点：由纷享服务器处理，传输慢，耗系统内存
 * 限制：文件大小 0M~2M，超过需申请扩容审批 (给 吴俊文、韩统武)
 * 适用：小文件，需要立即在代码中处理的场景
 */

String path = photos[0]["path"] as String
log.info("文件路径：" + path)

def ret = Fx.file.downloadFile(path)
if(ret[0]){  // error flag
    log.error("文件下载失败：" + ret[2])
} else {
    def fileData = ret[1]['fileData'] as byte[]
    
    // 转换为 Base64(可选)
    String base64Data = new String(java.util.Base64.getEncoder().encode(fileData))
    log.info("Base64 数据长度：" + base64Data.length())
    
    // 通过接口传输
    // ...调用外部 API...
}

// ==================== 三、方法 2: 生成临时下载链接 (FileShareToken) ====================

/*
 * 特点：直接生成下载链接，5 分钟有效
 * 优点：不耗服务器内存，客户方自行下载
 * 适用：需要将文件分享给外部的场景
 */

List paths = []
photos.each { photo ->
    paths.add(photo["path"])
}

// 创建分享 Token(5 分钟有效期)
String sharedToken = ""
def(boolean error, Map data, String errorMessage) = Fx.file.createFileShareTokens(5, paths)

if(error){
    log.error("创建分享 Token 失败：" + errorMessage)
} else {
    // 遍历所有文件的 token
    paths.each { path ->
        sharedToken = data[path] as String
        if(sharedToken){
            // 构建完整的下载链接
            String downloadUrl = "https://www.fxiaoke.com/FSC/N/FileShare/DownloadFileBySharedTokenV2?sharedToken=" + sharedToken
            
            log.info("文件 ${path} 的下载链接：" + downloadUrl)
            
            // 可以通过接口传给第三方系统
            // ...调用外部 API 传 downloadUrl...
        }
    }
}

// ==================== 四、方法 3: OpenAPI MediaID 转换 (不推荐) ====================

/*
 * 特点：通过 OpenAPI 鉴权，客户方自行下载
 * 优点：传输快，大小没有限制
 * 缺点：需要额外配置 OpenAPI，客户方要调用下载接口
 * 建议：***不推荐使用***，除非有特殊需求
 */

List photoList = []
if(photos != null && !photos.isEmpty()){
    photos.each { item ->
        Map adds = [:]
        puts.put("ext", item["ext"])
        adds.put("path", item["path"])
        adds.put("filename", item["filename"])
        adds.put("size", item["size"])
        
        // 将 npath 转换为 mediaId(OpenAPI 使用)
        Map headerMap = ["x-peer-name": "customerFunction"]
        Map dataMap = [
            "npathIds": [item["path"]],
            "appId": "FSAID_131a5e7"  // TODO: 替换为你的企业 appId
        ]
        
        def (Boolean error_, HttpResult result_, String errorMessage_) = Fx.proxy.callAPI(
            "openapi.npath2MediaId", headerMap, dataMap
        )
        
        if(!error_){
            String mediaId = result_["content"]["data"][item["path"] as String] as String
            adds.put("mediaId", mediaId)
            
            // 客户方可以调用纷享开放平台下载素材文件
            // 参考文档：https://open.fxiaoke.com/wiki.html#artiId=66
        } else {
            adds.put("mediaId", "")
        }
        
        photoList.add(adds)
    }
}

String requestBody = Fx.json.toJson(photoList, SerializerFeature.WriteMapNullValue)
log.info("请求参数：" + requestBody)

// 发送给第三方系统
Map header2 = ["Content-Type": "application/json"]
def (Boolean error2, HttpResult result2, String errorMessage2) = Fx.http.post(
    "https://your-api.com/upload",  // TODO: 替换为目标地址
    header2, 
    requestBody, 
    30000,  // timeout
    false, 
    0
)

// ==================== 五、文件上传到纷享销客 ====================

/*
 * 场景：从外部接收文件后保存到纷享销客对象的附件字段
 */

// 假设从外部 API 获取到文件的 Base64
String externalBase64 = "data:image/png;base64,iVBORw0KGj..."

// 提取 Base64 内容 (去掉前缀)
if(externalBase64.startsWith("data:")){
    externalBase64 = externalBase64.substring(externalBase64.indexOf(",") + 1)
}

byte[] fileBytes = java.util.Base64.getDecoder().decode(externalBase64)

// 上传到纷享销客
def(uploadError, uploadData, uploadMsg) = Fx.file.uploadFile(
    fileBytes,              // 文件内容
    "example.png",          // 文件名
    "image/png"             // MIME 类型
)

if(uploadError){
    log.error("文件上传失败：" + uploadMsg)
} else {
    String uploadedPath = uploadData["path"] as String
    
    // 更新对象字段
    Fx.object.update("ObjectApiName", recordId, [
        "field_attachment__c": [uploadedPath]
    ])
    
    log.info("文件上传成功：" + uploadedPath)
}

// ==================== 六、批量处理多个文件 ====================

Consumer<List> fileConsumer = { List fileList ->
    fileList.each { fileRecord ->
        String attachmentField = fileRecord["field_photos__c"] as String
        
        if(attachmentField){
            try {
                List attachments = Fx.json.toList(attachmentField)
                
                if(attachments != null && !attachments.isEmpty()){
                    // 为每个文件生成下载链接
                    attachments.each { attachment ->
                        String filePath = attachment["path"] as String
                        
                        List singlePath = [filePath]
                        def(tokenErr, tokenData, tokenMsg) = Fx.file.createFileShareTokens(5, singlePath)
                        
                        if(!tokenErr && tokenData && tokenData[filePath]){
                            String shareToken = tokenData[filePath]
                            String downloadUrl = "https://www.fxiaoke.com/FSC/N/FileShare/DownloadFileBySharedTokenV2?sharedToken=" + shareToken
                            
                            // 保存下载链接到新字段
                            Fx.object.update("ObjectApiName", fileRecord._id, [
                                "field_download_url__c": downloadUrl
                            ])
                        }
                    }
                }
            } catch(Exception e){
                log.error("处理文件异常 ID=${fileRecord._id}: ${e.getMessage()}")
            }
        }
    }
}

// ==================== 七、根据文件后缀判断类型 ====================

static String getFileType(String filename){
    if(filename == null) return "unknown"
    
    int lastDot = filename.lastIndexOf(".")
    if(lastDot < 0) return "unknown"
    
    String ext = filename.substring(lastDot + 1).toLowerCase()
    
    // 图片
    if(["jpg", "jpeg", "png", "gif", "bmp", "webp", "svg"].contains(ext)){
        return "image"
    }
    // Word
    else if(["doc", "docx"].contains(ext)){
        return "word"
    }
    // Excel
    else if(["xls", "xlsx", "csv"].contains(ext)){
        return "excel"
    }
    // PPT
    else if(["ppt", "pptx"].contains(ext)){
        return "ppt"
    }
    // PDF
    else if("pdf" == ext){
        return "pdf"
    }
    // ZIP
    else if(["zip", "rar", "7z"].contains(ext)){
        return "archive"
    }
    
    return "other"
}

// 使用示例
String fileType = getFileType(photos[0]["filename"])
log.info("文件类型：" + fileType)

// ==================== 注意事项 ====================

/*
1. 文件存储路径格式：N_年份月份_日期_hash
   例如：N_202201_11_5b61e0a51846419b8d301a4a0f8f66e4

2. createFileShareTokens 有效期：
   - 参数 5 代表 5 分钟
   - 超过时间链接失效

3. downloadFile 限制：
   - 默认最大 2MB
   - 超过需向纷享申请扩容 (审批人：吴俊文、韩统武)
   
4. 大批量文件处理建议：
   - 使用 Consumer 分批处理
   - 每批不超过 100 个文件
   - 考虑异步队列避免超时

5. 文件安全:
   - 不要硬编码文件路径到日志
   - 对外分享的文件注意权限控制
*/
