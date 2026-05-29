/**
 * @author 纷享 - 杨亚兴 (基于社区模板 2022-10-18-125)
 * @codeName xmlProcessingTemplate
 * @description 使用 Groovy XmlSlurper 解析和处理 XML 数据的完整示例
 * @createTime 2026-03-04
 */

// ==================== 1. 基础 XML 解析 ====================

final String xml = '''
    <response version-api="2.0">
        <value>
            <books id="1" classification="android">
                <book available="20" id="1">
                    <title>疯狂 Android 讲义</title>
                    <author id="1">李刚</author>
                </book>
                <book available="14" id="2">
                   <title>第一行代码</title>
                   <author id="2">郭林</author>
               </book>
               <book available="13" id="3">
                   <title>Android 开发艺术探索</title>
                   <author id="3">任玉刚</author>
               </book>
           </books>
           
           <books id="2" classification="web">
               <book available="10" id="1">
                   <title>Vue 从入门到精通</title>
                   <author id="4">李刚</author>
               </book>
           </books>
       </value>
    </response>
'''

// 实例化 XmlSlurper，使用 parseText 解析，返回 GPathResult 对象
def xmlSlurper = new XmlSlurper()
def response = xmlSlurper.parseText(xml)

log.info("XML 解析成功")

// ==================== 2. GPathResult 常用 API ====================

/*
 * GPathResult 常用方法：
 * 
 * 1. isEmpty()           - 判断节点是否为空
 * 2. children()          - 返回所有子节点 (GPathResult 类型)
 * 3. list()              - 返回子节点的文本值 (List 类型)
 * 4. text()              - 返回节点中的文本值 (String 类型)
 * 5. getProperty(String) - 返回指定节点的文本值
 * 6. '@' + attrName      - 获取属性值，如 item['@id']
 * 
 * ⚠️ 重要：在 APL 函数中使用 GPathResult API 时，需要强转类型为 GPathResult!
 *    例如：(item["title"] as GPathResult).text() as String
 * 
 * 更多 API: https://docs.groovy-lang.org/latest/html/api/groovy/xml/slurpersupport/GPathResult.html
 */

// ==================== 3. 遍历和提取数据 ====================

// 获取 xml 中的 books 节点
def books = response["value"]["books"] as GPathResult

// 直接 each 遍历
books.each { bookGroup ->
    // 获取当前书籍分类的属性
    String classification = bookGroup['@classification'] as String
    log.info("书籍分类：" + classification)
    
    // 必须转换为 GPathResult，否则无法遍历
    def bookList = bookGroup["book"] as GPathResult
    
    // 方法 1: list() 获取所有文本值集合
    List allTexts = (bookList as GPathResult).list() as List
    log.info("所有文本：" + allTexts)
    
    // 方法 2: each 遍历每个 book 节点
    bookList.each { item2 ->
        def book = item2 as GPathResult
        
        // 获取属性值：<book available="10" id="1"> 的 id
        String bookId = book['@id'] as String
        String available = book['@available'] as String
        
        log.info("Book ID: ${bookId}, Available: ${available}")
        
        // 获取节点文本值：<title>书名</title>
        String title = (book["title"] as GPathResult).text() as String
        
        // 获取嵌套节点文本
        String author = (book as GPathResult).getProperty("author") as String
        String authorId = (book["author"] as GPathResult) ['@id'] as String
        
        log.info("  书名：${title}")
        log.info("  作者：${author} (${authorId})")
    }
    
    log.info("---")
}

// ==================== 4. 查询特定节点 ====================

/*
 * 场景：查找特定条件的节点
 */

// 查找 id=3 的书
def targetBook = response.value.books.book.find { book ->
    (book['@id'] as String) == "3"
}

if(targetBook){
    String targetTitle = (targetBook["title"] as GPathResult).text() as String
    log.info("找到目标书：" + targetTitle)
}

// 筛选所有可用的书籍 (available > 15)
def availableBooks = response.value.books*.book.findAll { book ->
    int avail = (book['@available'] as String) as int
    return avail > 15
}

log.info("可用书籍数量：" + availableBooks.size())
availableBooks.each { book ->
    String title = (book["title"] as GPathResult).text() as String
    int avail = (book['@available'] as String) as int
    log.info("  - ${title}: ${avail} 本")
}

// ==================== 5. 构造 XML 输出 ====================

/*
 * 场景：生成 XML 格式的数据发送给第三方系统
 */

def xmlBuilder = new groovy.xml.StreamingXmlBuilder()

with(xmlBuilder) {
    'root'(name: "dataExport", timestamp: System.currentTimeMillis()) {
        record(id: "1", type: "customer") {
            name "张三"
            phone "13800138000"
            email "zhangsan@example.com"
            address(province: "广东", city: "深圳", district: "南山区") {
                detail "科技园南区"
            }
        }
        record(id: "2", type: "customer") {
            name "李四"
            phone "13900139000"
            email "lisi@example.com"
            address(province: "北京", city: "北京", district: "海淀区") {
                detail "中关村软件园"
            }
        }
    }
}

String xmlOutput = xmlBuilder.toString()
log.info("生成的 XML:\n" + xmlOutput)

// ==================== 6. 批量处理外部 API 返回的 XML ====================

/*
 * 场景：接收第三方系统返回的 XML 响应并解析
 */

// 假设从 HTTP 请求获取 XML 响应
Map headers = ["Content-Type": "application/xml"]
def (boolean err, HttpResult result, String msg) = Fx.http.post(
    "https://api.example.com/query",
    headers,
    requestBody,
    30000,
    false,
    0
)

if(!err && result.content){
    try {
        String xmlResponse = result.content as String
        def xmlData = new XmlSlurper().parseText(xmlResponse)
        
        // 解析响应结构
        def success = (xmlData["status"] as GPathResult).text() as String
        if(success == "success"){
            List dataList = []
            
            // 遍历返回的数据列表
            (xmlData["result"]["item"] as GPathResult).each { item ->
                Map record = [
                    "id": (item['@id'] as String),
                    "name": (item["name"] as GPathResult).text() as String,
                    "amount": (item["amount"] as GPathResult).text() as BigDecimal,
                    "status": (item["status"] as GPathResult).text() as String
                ]
                dataList.add(record)
            }
            
            log.info("解析到 ${dataList.size()} 条记录")
            
            // 进一步处理...
        }
        
    } catch(Exception e){
        log.error("XML 解析失败：" + e.getMessage())
    }
}

// ==================== 7. XML 与 JSON 互转 ====================

/*
 * XML → JSON
 */
def jsonFromXml(node) {
    if(node == null) return null
    
    // 如果是一个文本节点
    if(node instanceof groovy.xml.slurpersupport.GPathResult){
        def textVal = (node as GPathResult).text() as String
        return textVal ?: ""
    }
    
    // 如果是元素节点
    def result = [:]
    node.properties().each { key, value ->
        if(key.startsWith('@')){  // 属性
            String attrName = key.substring(1)
            result.put("@${attrName}", value as String)
        } else {
            // 子元素
            if(value.class.isArray()){
                result[key] = value.collect { jsonFromXml(it) }
            } else {
                result[key] = jsonFromXml(value)
            }
        }
    }
    
    return result
}

// 使用示例
def booksData = jsonFromXml(response.value.books)
String jsonString = Fx.json.toJson(booksData)
log.info("转换为 JSON：" + jsonString)

// JSON → XML
def xmlFromJson(Map jsonData, String rootName){
    def builder = new groovy.xml.MarkupBuilder(new StringWriter())
    
    builder.node(rootName) {
        jsonData.each { key, value ->
            if(value instanceof Map){
                node(key) {
                    xmlFromJsonInner(value, builder)
                }
            } else if(value instanceof List){
                value.each { item ->
                    if(item instanceof Map){
                        node(key) {
                            xmlFromJsonInner(item, builder)
                        }
                    } else {
                        node(key, item)
                    }
                }
            } else {
                node(key, value)
            }
        }
    }
    
    return builder.toString()
}

private void xmlFromJsonInner(Map data, MarkupBuilder builder){
    data.each { key, value ->
        if(value instanceof Map){
            builder.node(key) {
                xmlFromJsonInner(value, builder)
            }
        } else if(value instanceof List){
            value.each { item ->
                if(item instanceof Map){
                    builder.node(key) {
                        xmlFromJsonInner(item, builder)
                    }
                } else {
                    builder.node(key, item)
                }
            }
        } else {
            builder.node(key, value)
        }
    }
}

// ==================== 8. 处理带命名空间的 XML ====================

/*
 * 场景：处理带有 XML 命名空间的复杂文档
 */

def namespaceAwareXml = '''
<?xml version="1.0" encoding="UTF-8"?>
<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
    <soap:Body>
        <ns:GetCustomerResponse xmlns:ns="http://example.com/ns">
            <customer id="123">
                <name>张三</name>
            </customer>
        </ns:GetCustomerResponse>
    </soap:Body>
</soap:Envelope>
'''

// 禁用命名空间验证 (简化处理)
def nsParser = new XmlSlurper(false, false)
def nsDoc = nsParser.parseText(namespaceAwareXml)

// 忽略命名空间直接访问
def customer = nsDoc.Envelope.Body.'GetCustomerResponse'.customer
String customerName = (customer.name as GPathResult).text() as String
log.info("客户名：" + customerName)

// ==================== 注意事项 ====================

/*
1. 强制类型转换：
   - 所有 GPathResult 操作都需要 as GPathResult
   - 然后才能调用 .text()、.list() 等方法

2. 属性访问：
   - @符号：element['@attrName']
   - 文本：(element["child"] as GPathResult).text()

3. 空值处理:
   - 先检查节点是否存在
   - 使用 ?: 提供默认值

4. 异常处理:
   - XML 解析可能抛出 SAXException
   - 需要 try-catch 保护

5. 性能优化:
   - 大 XML 文件建议使用 StAX 或 SAX 流式解析
   - XmlSlurper 适合中小型文档 (<10MB)
*/
