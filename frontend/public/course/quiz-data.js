window.QUIZ_DATA = [
  // ============ L01 · AI 到底是什么 ============
  {
    id: "L01-1",
    lesson: 1,
    type: "single",
    question: "以下哪一句最准确地概括第 1 讲的核心论点?",
    options: [
      { key: "A", text: "AI 是一种能像人脑一样思考的新型计算机" },
      { key: "B", text: "AI 本质上是一个函数拟合过程,把输入映射到输出" },
      { key: "C", text: "AI 就是规则引擎和决策树的合集" },
      { key: "D", text: "AI 是统计学和数据库技术的结合" }
    ],
    correct: "B",
    explanation: "第 1 讲反复强调:AI 不是魔法,本质就是函数拟合——给一堆 (输入,输出) 对,让模型找一个 f 让 f(输入)≈输出。",
    difficulty: "recall"
  },
  {
    id: "L01-2",
    lesson: 1,
    type: "multi",
    question: "讲稿里说今天的大语言模型是「三派融合的产物」,具体指融合了以下哪几条 AI 流派?",
    options: [
      { key: "A", text: "连接主义(神经网络做底座)" },
      { key: "B", text: "符号主义(Tool Use / RAG 等外挂扩展)" },
      { key: "C", text: "行为主义(用 RLHF 做对齐)" },
      { key: "D", text: "进化主义(用遗传算法搜索结构)" }
    ],
    correct: ["A", "B", "C"],
    explanation: "讲稿明确给出公式:现代 AI = 连接主义底座 + 符号主义扩展 + 行为主义对齐。进化算法不在三大流派之列。",
    difficulty: "recall"
  },

  // ============ L02 · 机器学习三种范式 ============
  {
    id: "L02-1",
    lesson: 2,
    type: "single",
    question: "客户给了几万条标注好「成单/不成单」标签的历史商机数据,要训练一个商机成单预测模型,这属于哪种学习范式?",
    options: [
      { key: "A", text: "监督学习" },
      { key: "B", text: "无监督学习" },
      { key: "C", text: "强化学习" },
      { key: "D", text: "半监督学习" }
    ],
    correct: "A",
    explanation: "有「输入+正确答案」配对,典型监督学习(分类任务)。参见第 2 讲对监督学习的判断方法。",
    difficulty: "recall"
  },
  {
    id: "L02-2",
    lesson: 2,
    type: "multi",
    question: "以下哪些 CRM 场景属于无监督学习的典型应用?",
    options: [
      { key: "A", text: "客户分群(从历史交易自动发现客户类型)" },
      { key: "B", text: "知识库文档向量检索(Embedding)" },
      { key: "C", text: "商机成单概率预测" },
      { key: "D", text: "异常订单识别(找和大多数订单不一样的可疑订单)" }
    ],
    correct: ["A", "B", "D"],
    explanation: "客户分群是聚类、向量检索属于表征学习、异常检测都是典型无监督学习。商机预测有明确标签,属于监督学习。",
    difficulty: "apply"
  },

  // ============ L03 · 神经网络是怎么学的 ============
  {
    id: "L03-1",
    lesson: 3,
    type: "single",
    question: "讲稿说「所有 AI 的知识都存储在 ____ 里」,空格里应该填什么?",
    options: [
      { key: "A", text: "训练数据" },
      { key: "B", text: "激活函数" },
      { key: "C", text: "权重(weights)" },
      { key: "D", text: "loss 函数" }
    ],
    correct: "C",
    explanation: "第 3 讲反复强调:学习一个神经元 = 找到合适的权重和偏置。GPT-4 的 1.7 万亿参数就是 1.7 万亿个权重。",
    difficulty: "recall"
  },
  {
    id: "L03-2",
    lesson: 3,
    type: "multi",
    question: "关于梯度下降和神经网络训练,以下说法哪些是正确的?",
    options: [
      { key: "A", text: "梯度告诉你权重该往哪边调,学习率控制每步走多远" },
      { key: "B", text: "学习率太大可能直接跳过谷底,导致训练发散" },
      { key: "C", text: "权重初始化全部为 0 比随机初始化更稳定" },
      { key: "D", text: "反向传播的思想可以理解为「从损失出发逆着网络一层层倒推每个权重该怎么调」" }
    ],
    correct: ["A", "B", "D"],
    explanation: "权重全 0 会导致所有神经元梯度相同,学不出差异——必须随机初始化打破对称性。其他三项都是讲稿中的核心要点。",
    difficulty: "recall"
  },

  // ============ L04 · 深度学习革命 ============
  {
    id: "L04-1",
    lesson: 4,
    type: "single",
    question: "为什么 Transformer 能取代 RNN/LSTM 成为大模型时代的主导架构?讲稿给的最核心解释是?",
    options: [
      { key: "A", text: "Transformer 参数更少,所以更便宜" },
      { key: "B", text: "Transformer 抛弃了串行循环,所有词的 attention 可以并行计算,GPU 才能吃满" },
      { key: "C", text: "Transformer 第一个引入了注意力机制" },
      { key: "D", text: "Transformer 模仿了人脑的真实结构" }
    ],
    correct: "B",
    explanation: "第 4 讲讲得很清楚:RNN 的死穴是串行计算(GPU 用不起来),Transformer 用 self-attention 把所有位置并行掉了。注意力机制 2014 年就有,不是 Transformer 首创。",
    difficulty: "recall"
  },
  {
    id: "L04-2",
    lesson: 4,
    type: "multi",
    question: "讲稿讲深度学习架构演进时反复强调「架构革命的本质是硬件适配」。以下哪些表述符合这一论点?",
    options: [
      { key: "A", text: "CNN 赢了 CV,是因为卷积运算天然匹配 GPU 的矩阵并行" },
      { key: "B", text: "AlexNet 的核心创新不是结构,而是「用 GPU 训练」" },
      { key: "C", text: "Transformer 比 CNN 更聪明,所以能处理图像也能处理文本" },
      { key: "D", text: "未来挑战 Transformer 的新架构(如 Mamba/SSM)关键也要看和硬件的匹配度" }
    ],
    correct: ["A", "B", "D"],
    explanation: "C 项错——讲稿说 Transformer 不是「更聪明」,是「更适合 GPU,可以无限堆深堆宽」。其他三条都是「算法和硬件相互塑造」这条主线的延伸。",
    difficulty: "apply"
  },

  // ============ L05 · Transformer 架构详解 ============
  {
    id: "L05-1",
    lesson: 5,
    type: "single",
    question: "Transformer 里的 Q、K、V 三件套,讲稿用图书馆找书做了比喻。下面哪个对应关系是对的?",
    options: [
      { key: "A", text: "Q=书脊标签,K=查询请求,V=书的内容" },
      { key: "B", text: "Q=查询请求,K=书脊标签,V=书的内容" },
      { key: "C", text: "Q=书的内容,K=查询请求,V=书脊标签" },
      { key: "D", text: "Q、K、V 是三个完全不同的模型" }
    ],
    correct: "B",
    explanation: "第 5 讲讲得很清楚:Query 是查询发出的问题,Key 是被查者的标签,Value 是真正取走的内容。",
    difficulty: "recall"
  },
  {
    id: "L05-2",
    lesson: 5,
    type: "single",
    question: "我们做 RAG 知识库要给文档切片做向量化,讲稿建议选哪种架构的模型?",
    options: [
      { key: "A", text: "仅 Decoder 架构(如 GPT、Claude、Llama)" },
      { key: "B", text: "仅 Encoder 架构(如 BERT、BGE、Qwen-Embedding)" },
      { key: "C", text: "Encoder-Decoder 双塔架构(如 T5、BART)" },
      { key: "D", text: "随便挑一个聊天大模型,只要参数大就行" }
    ],
    correct: "B",
    explanation: "第 5 讲明确给出对应关系:Encoder = 理解(BERT、Embedding 模型);Decoder = 生成(聊天模型);双塔 = 转换(翻译)。做向量检索属于「理解」,应选 Encoder。",
    difficulty: "recall"
  },

  // ============ L06 · GPT 训练三阶段 ============
  {
    id: "L06-1",
    lesson: 6,
    type: "single",
    question: "讲稿说预训练阶段占 ____ 的训练算力成本,但 SFT + 对齐合计不到 1% 的成本却决定了最终产品体验的 80%。空格填:",
    options: [
      { key: "A", text: "60%" },
      { key: "B", text: "80%" },
      { key: "C", text: "99%" },
      { key: "D", text: "100%" }
    ],
    correct: "C",
    explanation: "第 6 讲明确:99% 的算力花在预训练,但 1% 的 SFT 和不到 1% 的对齐决定了 80% 的产品体验。",
    difficulty: "recall"
  },
  {
    id: "L06-2",
    lesson: 6,
    type: "multi",
    question: "客户问「能不能基于我们公司数据微调出一个专属大模型」,根据第 6 讲应该怎么判断?",
    options: [
      { key: "A", text: "微调风格、格式、领域知识 → SFT 路线可行,成本可控" },
      { key: "B", text: "微调基础能力(让一个 7B 模型变成 GPT-4 级) → 几乎不可能,需要重新预训练" },
      { key: "C", text: "大部分企业场景下,RAG + Prompt Engineering 比微调更实用" },
      { key: "D", text: "应该建议每家客户都自己从头预训练一个" }
    ],
    correct: ["A", "B", "C"],
    explanation: "讲稿对微调的边界给出了清晰判断:风格/格式可微调,基础能力没法微调,大部分场景应该先做 RAG。从头预训练对绝大多数企业不可行。",
    difficulty: "apply"
  },

  // ============ L07 · Scaling Law 与涌现 ============
  {
    id: "L07-1",
    lesson: 7,
    type: "single",
    question: "Chinchilla 定律的核心结论是什么?",
    options: [
      { key: "A", text: "模型参数越多越好,数据是次要的" },
      { key: "B", text: "在固定算力预算下,参数和训练 token 数的最优比例约 1:20(每个参数应该见过约 20 个 token)" },
      { key: "C", text: "训练数据可以无限合成,不需要真实数据" },
      { key: "D", text: "Scaling Law 已经失效" }
    ],
    correct: "B",
    explanation: "第 7 讲讲得很清楚:DeepMind 的 Chinchilla 实验证明最优比例约 1:20,GPT-3 时代的「猛堆参数」(1.7:1)是浪费。Llama 3 进一步推到 1:200。",
    difficulty: "recall"
  },
  {
    id: "L07-2",
    lesson: 7,
    type: "multi",
    question: "对生产环境的「分层调度」(把任务路由到 Frontier / Strong / Efficient 三梯队模型)的描述,哪些是对的?",
    options: [
      { key: "A", text: "意图识别这种简单高频任务可以放 Efficient 梯队(如 Qwen 7B),成本极低" },
      { key: "B", text: "复杂方案设计、多步推理必须放 Frontier 梯队(Claude Opus / GPT-4)" },
      { key: "C", text: "正确选型能让整体成本降 70-80%,但体验仍是 Frontier 水平" },
      { key: "D", text: "应该所有任务都用最强模型,这样质量最好" }
    ],
    correct: ["A", "B", "C"],
    explanation: "讲稿的核心建议正是分层调度。无差别用最强模型既贵又没必要——这是企业 AI 落地的核心工程问题。",
    difficulty: "apply"
  },

  // ============ L08 · 多模态 ============
  {
    id: "L08-1",
    lesson: 8,
    type: "single",
    question: "讲稿用一句话概括所有多模态 AI 的核心思想,是哪一句?",
    options: [
      { key: "A", text: "用更大的 Transformer 同时处理图像和文本" },
      { key: "B", text: "把所有模态都映射到同一个向量空间" },
      { key: "C", text: "图像生成靠 Diffusion,文本生成靠 LLM" },
      { key: "D", text: "用 CLIP 把图像翻译成文字描述再用 LLM 处理" }
    ],
    correct: "B",
    explanation: "第 8 讲反复强调:CLIP / Diffusion / Sora / GPT-4o 不神秘——核心就是「所有模态 → 共享向量空间 → 任意模态间转换」。",
    difficulty: "recall"
  },
  {
    id: "L08-2",
    lesson: 8,
    type: "single",
    question: "关于 Diffusion 模型的工作原理,以下哪一项是错的?",
    options: [
      { key: "A", text: "从一团随机噪声开始,逐步去噪生成清晰图像" },
      { key: "B", text: "训练时用「清晰图加噪声」反向操作,加噪过程免费,可无限造数据" },
      { key: "C", text: "Stable Diffusion = CLIP(文本理解) + Diffusion(图像生成)" },
      { key: "D", text: "Diffusion 是从空白画布开始,一笔一笔添加内容" }
    ],
    correct: "D",
    explanation: "D 项错——这正是讲稿强调的「反直觉」:Diffusion 是从噪声雕刻,不是从空白添加。米开朗基罗的隐喻——「雕像本来就在大理石里」。",
    difficulty: "recall"
  },

  // ============ L09 · Prompt Engineering 本质 ============
  {
    id: "L09-1",
    lesson: 9,
    type: "single",
    question: "讲稿打掉了对 Prompt 的几个错误认知,以下哪一个是讲稿明确指出的错误观念?",
    options: [
      { key: "A", text: "Prompt 是软件工程,要有测试、有版本控制" },
      { key: "B", text: "Prompt 写得越长越详细越好" },
      { key: "C", text: "好 Prompt 能让中等模型表现接近顶级" },
      { key: "D", text: "Prompt 工程的 ROI 始终是最高的" }
    ],
    correct: "B",
    explanation: "第 9 讲明确指出「Prompt 过长会稀释关键指令」是个误区——20 行精准 Prompt 往往胜过 200 行糊涂 Prompt。",
    difficulty: "recall"
  },
  {
    id: "L09-2",
    lesson: 9,
    type: "multi",
    question: "讲稿给的 6 个核心原则里,以下哪些是出现的?",
    options: [
      { key: "A", text: "明确角色(「你是一个 CRM 需求分析师」)" },
      { key: "B", text: "给出范例(Few-shot,2-3 个 input→output 对最佳)" },
      { key: "C", text: "让模型先思考再答(Chain of Thought)" },
      { key: "D", text: "用否定式指令(「不要使用专业术语」)" }
    ],
    correct: ["A", "B", "C"],
    explanation: "讲稿讲的是 6 大原则:角色 / 结构化任务 / Few-shot / 输出格式 / 边界异常 / 让它思考。否定式指令在第五部分被列为生产陷阱——它经常失效,应该改用肯定式。",
    difficulty: "apply"
  },

  // ============ L10 · RAG ============
  {
    id: "L10-1",
    lesson: 10,
    type: "single",
    question: "讲稿把 RAG 拆成「两条流水线」,正确的描述是?",
    options: [
      { key: "A", text: "离线训练 + 在线推理" },
      { key: "B", text: "离线索引(把文档变成向量库) + 在线检索(每次提问实时召回)" },
      { key: "C", text: "数据采集 + 模型微调" },
      { key: "D", text: "前端处理 + 后端处理" }
    ],
    correct: "B",
    explanation: "第 10 讲第二部分:RAG 的本质是「离线一次性建好向量库 + 每次问题时实时检索」两条独立流水线。",
    difficulty: "recall"
  },
  {
    id: "L10-2",
    lesson: 10,
    type: "multi",
    question: "讲稿说「切分是 RAG 质量的最大杠杆」,以下哪些是 CRM 场景下的切分最佳实践?",
    options: [
      { key: "A", text: "结构化切分按章节/标题切,是 99% 生产场景的首选" },
      { key: "B", text: "合同/法律类文档必须按「条/款」切,每个条款一个 Chunk" },
      { key: "C", text: "表格必须单独抽出来用 Markdown/HTML 完整保存,不能切碎" },
      { key: "D", text: "全部统一固定长度 512 token 切,简单可靠" }
    ],
    correct: ["A", "B", "C"],
    explanation: "讲稿明确指出固定长度切是入门方法,生产环境很少这么用——因为会把表格切碎、把语义切断。其他三条都是讲稿强调的最佳实践。",
    difficulty: "apply"
  },

  // ============ L11 · Function Calling ============
  {
    id: "L11-1",
    lesson: 11,
    type: "single",
    question: "讲稿讲 Function Calling 时有一个关键认知:「模型不_____,只_____」。空格填法正确的是?",
    options: [
      { key: "A", text: "执行 / 决定" },
      { key: "B", text: "决定 / 执行" },
      { key: "C", text: "调用 / 回答" },
      { key: "D", text: "回答 / 调用" }
    ],
    correct: "A",
    explanation: "第 11 讲第二部分:模型从来不真的执行函数,它只「决定该调哪个工具+什么参数」(输出 JSON),真正的执行是你的代码做的。",
    difficulty: "recall"
  },
  {
    id: "L11-2",
    lesson: 11,
    type: "multi",
    question: "讲稿把 CRM 工具集合分成 Q/A/W 三类。以下哪些匹配是对的?",
    options: [
      { key: "A", text: "Q 类(查询)如 search_customer / get_order_history,默认开放无需确认" },
      { key: "B", text: "A 类(动作)如 send_email / update_record,写操作必须有审计日志" },
      { key: "C", text: "W 类(工作流)如 trigger_approval / schedule_meeting,跨系统影响多人,必须用户确认" },
      { key: "D", text: "三类工具应该一视同仁,统一不需确认" }
    ],
    correct: ["A", "B", "C"],
    explanation: "讲稿明确的分级是 Q/A/W 三类对应三种安全策略,D 项明显违反。这是「人在回路」设计的核心。",
    difficulty: "apply"
  },

  // ============ L12 · Agent ============
  {
    id: "L12-1",
    lesson: 12,
    type: "single",
    question: "讲稿区分 Function Calling 和 Agent 的本质差异是什么?",
    options: [
      { key: "A", text: "Agent 用更贵的模型,Function Calling 用便宜的" },
      { key: "B", text: "Function Calling 是用户驱动(说一句做一步),Agent 是目标驱动(给目标自己规划执行)" },
      { key: "C", text: "Agent 不需要工具,Function Calling 必须有工具" },
      { key: "D", text: "Agent 必须是多模型协作,Function Calling 是单模型" }
    ],
    correct: "B",
    explanation: "第 12 讲第一部分明确:Function Calling 是用户驱动、有限步骤;Agent 是目标驱动、多步循环、有记忆、会反思、能拆解。",
    difficulty: "recall"
  },
  {
    id: "L12-2",
    lesson: 12,
    type: "single",
    question: "讲稿明确强调,大部分企业级 Agent 应该选哪个能力等级作为生产环境的「最佳位置」?",
    options: [
      { key: "A", text: "L1 · Copilot(辅助但不执行)" },
      { key: "B", text: "L2 · Agent(自主执行 + 人工确认)" },
      { key: "C", text: "L3 · Autonomous(完全自主 + 事后审计)" },
      { key: "D", text: "L4 · Multi-Agent(多 Agent 协作)" }
    ],
    correct: "B",
    explanation: "第 12 讲反复强调:L2 是大部分企业 Agent 的最佳位置——既享受 Agent 的智能,又保留人类控制点。L3 / L4 出问题代价成倍增加。",
    difficulty: "recall"
  },

  // ============ L13 · 多 Agent 系统 ============
  {
    id: "L13-1",
    lesson: 13,
    type: "single",
    question: "讲稿说当一个 Agent 接超过多少个工具时,调用准确率会从 92% 掉到 67%?",
    options: [
      { key: "A", text: "5 个" },
      { key: "B", text: "15 个" },
      { key: "C", text: "50 个" },
      { key: "D", text: "工具数量无所谓,模型够强就行" }
    ],
    correct: "B",
    explanation: "第 13 讲第一部分给了实测数据:超过 15 个工具时,调用准确率从 92% 掉到 67%——这就是单 Agent 的边界。",
    difficulty: "recall"
  },
  {
    id: "L13-2",
    lesson: 13,
    type: "single",
    question: "「合同审查」这种高风险决策场景,讲稿建议用哪种多 Agent 协作模式效果最好(实测能多发现 40% 的潜在风险点)?",
    options: [
      { key: "A", text: "Supervisor(中心化分发)" },
      { key: "B", text: "Pipeline(流水线)" },
      { key: "C", text: "Debate(对抗辩论):Pro Agent 找有利点,Con Agent 找风险点,Judge Agent 裁决" },
      { key: "D", text: "Hierarchical(层级化)" }
    ],
    correct: "C",
    explanation: "第 13 讲明确:Debate 模式强迫系统从对立视角看问题,讲师团队用它做合同审查比单 Agent 多发现 40% 的潜在风险点。",
    difficulty: "recall"
  },

  // ============ L14 · 评估与可观测性 ============
  {
    id: "L14-1",
    lesson: 14,
    type: "single",
    question: "讲稿说 AI 软件需要新的工程范式,叫什么?",
    options: [
      { key: "A", text: "TDD(测试驱动开发)" },
      { key: "B", text: "EDD(Eval-Driven Development,评估驱动开发)" },
      { key: "C", text: "BDD(行为驱动开发)" },
      { key: "D", text: "PDD(Prompt 驱动开发)" }
    ],
    correct: "B",
    explanation: "第 14 讲第一部分讲得很清楚:传统 TDD 对 AI 系统不工作了——因为同输入不同输出。AI 需要 Eval-Driven Development。",
    difficulty: "recall"
  },
  {
    id: "L14-2",
    lesson: 14,
    type: "single",
    question: "讲稿的「评估金字塔」从底到顶 4 层,哪一层评估的是「AI 对业务指标(如人均处理工单数、商机转化率、人力成本节省)的实际影响」?",
    options: [
      { key: "A", text: "L1 单元评估" },
      { key: "B", text: "L2 链路评估" },
      { key: "C", text: "L3 用户评估" },
      { key: "D", text: "L4 业务评估" }
    ],
    correct: "D",
    explanation: "L4 业务评估正是衡量 AI 对真实业务指标的影响,讲稿强调这一层最重要、也最难度量——所有 AI 项目最终都要回到这层证明价值。",
    difficulty: "recall"
  },

  // ============ L15 · Context Engineering ============
  {
    id: "L15-1",
    lesson: 15,
    type: "single",
    question: "Context Engineering 与 Prompt Engineering 的本质区别是什么?",
    options: [
      { key: "A", text: "Context Engineering 用更长的 prompt" },
      { key: "B", text: "Prompt Engineering 关注一条静态 prompt 字符串,Context Engineering 关注整个上下文窗口的动态组装" },
      { key: "C", text: "Context Engineering 只在 Claude 上用" },
      { key: "D", text: "Context Engineering 是 RAG 的新名字" }
    ],
    correct: "B",
    explanation: "第 15 讲核心:Prompt 是静态字符串,Context 是 build_context(task, state) 的动态组装函数。Karpathy 引用「为下一步操作,把窗口填上恰好正确的信息」。",
    difficulty: "recall"
  },
  {
    id: "L15-2",
    lesson: 15,
    type: "multi",
    question: "讲稿讲的 Context 窗口 7 大组成块,以下哪几个是真实存在的?",
    options: [
      { key: "A", text: "System Prompt(系统提示)" },
      { key: "B", text: "Retrieved Knowledge(检索注入)" },
      { key: "C", text: "Scratchpad / CoT(工作记事本)" },
      { key: "D", text: "GPU Buffer(显存缓冲)" }
    ],
    correct: ["A", "B", "C"],
    explanation: "讲稿明确的 7 块是:system / retrieved / few-shot / tools / scratchpad / history / memory。GPU buffer 不在其中——那是硬件层。",
    difficulty: "apply"
  },

  // ============ L16 · Harness Engineering ============
  {
    id: "L16-1",
    lesson: 16,
    type: "single",
    question: "讲稿对 Agent 和 Harness 的区分给了一个核心比喻,以下哪个是讲稿原话?",
    options: [
      { key: "A", text: "Agent 是策略,Harness 是骨架" },
      { key: "B", text: "Agent 是前端,Harness 是后端" },
      { key: "C", text: "Agent 是数据,Harness 是模型" },
      { key: "D", text: "Agent 和 Harness 是一回事,不用区分" }
    ],
    correct: "A",
    explanation: "第 16 讲开篇就反复说:Agent 是策略(Decide what to do),Harness 是骨架(Make sure it keeps running)。Karpathy 类比为「Agent 是大脑,Harness 是骨骼+肌肉+神经系统」。",
    difficulty: "recall"
  },
  {
    id: "L16-2",
    lesson: 16,
    type: "single",
    question: "下面哪一项「不在」讲稿列出的 Harness 6 大核心组件里?",
    options: [
      { key: "A", text: "Loop Control(主循环控制)" },
      { key: "B", text: "Tool Registration & Gating(工具注册与门控)" },
      { key: "C", text: "Embedding Cache(向量召回缓存)" },
      { key: "D", text: "Auto-Compact(Context 自动压缩)" }
    ],
    correct: "C",
    explanation: "讲稿明确的 6 大组件是:Loop Control / Tool Gating / Interruption / Checkpoint / Error Recovery / Auto-Compact。Embedding Cache 不在其中,属于 RAG 层概念。",
    difficulty: "recall"
  },

  // ============ L17 · Claude Code 架构拆解 ============
  {
    id: "L17-1",
    lesson: 17,
    type: "single",
    question: "Claude Code 团队负责人 Boris Cherny 反复强调「CLI 是 ___ 的最小公约数」,所以 Claude Code 选了 CLI 作为一等公民。空格填:",
    options: [
      { key: "A", text: "AI 工程师" },
      { key: "B", text: "工程师工作" },
      { key: "C", text: "操作系统" },
      { key: "D", text: "命令行界面" }
    ],
    correct: "B",
    explanation: "第 17 讲第一部分明确引用:CLI 是工程师工作的最小公约数——本地、SSH、Docker、CI 都能跑同一个 binary。",
    difficulty: "recall"
  },
  {
    id: "L17-2",
    lesson: 17,
    type: "multi",
    question: "讲稿说 Claude Code 的 Skills 系统相比传统 plugin 模式的优势在哪?",
    options: [
      { key: "A", text: "Skills 按需触发,只有 description 匹配时才把完整 SKILL.md 注入 context" },
      { key: "B", text: "50 个 plugin 各 800 token 会让 system prompt 多 40k token,Skills 模式可省 90%+" },
      { key: "C", text: "Skills 本质是「延迟加载 + 语义路由」" },
      { key: "D", text: "Skills 必须用 Anthropic 的 API 才能用" }
    ],
    correct: ["A", "B", "C"],
    explanation: "讲稿明确的三个优势点正是延迟加载 + 语义路由 + 大幅节省 token。D 项错——Skills 是工程思路,LangChain/LlamaIndex 都有对应原语。",
    difficulty: "apply"
  },

  // ============ L18 · AI 在 SaaS 交付的应用全景 ============
  {
    id: "L18-1",
    lesson: 18,
    type: "single",
    question: "讲稿说 6 个交付环节里,ROI 最高的是哪一个?",
    options: [
      { key: "A", text: "售前线索" },
      { key: "B", text: "方案 & 报价" },
      { key: "C", text: "客服支持" },
      { key: "D", text: "内部协同" }
    ],
    correct: "C",
    explanation: "第 18 讲明确:客服环节 ROI 6-12 倍,是 6 个环节里最高的——因为客服是纯成本中心,AI 替代的是直接人力。",
    difficulty: "recall"
  },
  {
    id: "L18-2",
    lesson: 18,
    type: "multi",
    question: "讲稿强调 AI 时代 CRM 厂商的真正护城河是什么?以下哪些是讲稿明确指出的?",
    options: [
      { key: "A", text: "数据飞轮(用户用得越多,AI 越懂这个行业)" },
      { key: "B", text: "行业沉淀(12 年的客户案例、实施手册、续约谈判记录)" },
      { key: "C", text: "比 OpenAI 拥有更强的基础模型" },
      { key: "D", text: "更长的产品功能清单" }
    ],
    correct: ["A", "B"],
    explanation: "讲稿明确:功能可被复制、AI 能力也可被复制——唯独「数据飞轮 + 行业沉淀」是 12 年才能积累的,Salesforce/HubSpot/钉钉都学不到。基础模型反而是公共能力。",
    difficulty: "synthesis"
  },

  // ============ L19 · 知识库工程化 ============
  {
    id: "L19-1",
    lesson: 19,
    type: "single",
    question: "讲稿讲权限隔离的三种方案,其中讲稿明确指为「最危险的方案」的是?",
    options: [
      { key: "A", text: "per-tenant index(多租户物理隔离)" },
      { key: "B", text: "per-row ACL(文档级权限,检索时同时过滤)" },
      { key: "C", text: "检索后过滤(召回 top_k 不带过滤,事后筛权限内的)" },
      { key: "D", text: "完全开放,所有人看所有文档" }
    ],
    correct: "C",
    explanation: "第 19 讲第一部分明确:「检索后过滤是最危险的方案」——召回 100 个全是别人的、过滤完只剩 0 条,用户以为系统没数据。",
    difficulty: "apply"
  },
  {
    id: "L19-2",
    lesson: 19,
    type: "multi",
    question: "讲稿给的「对项目最实用的 4 条建议」里,以下哪些是?",
    options: [
      { key: "A", text: "知识库从第一天就规划权限模型,tenant_id / project_id / acl 三件套从 schema 设计开始就埋进去" },
      { key: "B", text: "CDC 增量同步替代手工上传(Airbyte / LlamaHub / 飞书 webhook)" },
      { key: "C", text: "Embedding 模型明确升级回填策略,元数据带 embedding_model_version" },
      { key: "D", text: "向量库选型上一定要选 Pinecone" }
    ],
    correct: ["A", "B", "C"],
    explanation: "讲稿明确的 4 条是:权限模型从第一天就埋、CDC 替代手工、Embedding 版本治理、查询级 Trace。Pinecone 不在推荐之列——讲稿主推 Qdrant。",
    difficulty: "apply"
  },

  // ============ L20 · AI 安全与合规 ============
  {
    id: "L20-1",
    lesson: 20,
    type: "single",
    question: "OWASP LLM Top 10 (2025) 里被列为最高优先级(LLM01)的是什么?",
    options: [
      { key: "A", text: "训练数据投毒" },
      { key: "B", text: "Prompt 注入(尤其是间接注入)" },
      { key: "C", text: "模型反演" },
      { key: "D", text: "Token 耗尽" }
    ],
    correct: "B",
    explanation: "第 20 讲明确:2025 版 OWASP 把「Prompt 注入」尤其是「间接注入」(如 Microsoft Copilot EchoLeak 事件)升为最高优先级。",
    difficulty: "recall"
  },
  {
    id: "L20-2",
    lesson: 20,
    type: "multi",
    question: "讲稿给的「企业级 AI 必备 8 项控制」,以下哪些是讲稿明确列出的?",
    options: [
      { key: "A", text: "RBAC + 数据隔离 / 全链路审计日志" },
      { key: "B", text: "输入输出双向过滤 / 工具调用沙箱" },
      { key: "C", text: "Human-in-the-loop / Kill Switch / 红队演练 / 事件响应 SOP" },
      { key: "D", text: "禁止任何外部 API 调用" }
    ],
    correct: ["A", "B", "C"],
    explanation: "讲稿明确的 8 项是:RBAC、审计日志、双向过滤、沙箱、HITL、Kill Switch、红队、IR SOP。D 项过于绝对——讲稿强调的是「最小权限+多层防御」而非禁用 API。",
    difficulty: "apply"
  },

  // ============ L21 · 当前 AI 局限 ============
  {
    id: "L21-1",
    lesson: 21,
    type: "single",
    question: "讲稿讲 LLM 幻觉时给出的核心观点是?",
    options: [
      { key: "A", text: "幻觉是工程 bug,加几轮微调就能消除" },
      { key: "B", text: "幻觉是结构性问题,源自「下一 token 概率预测」的训练范式——LLM 优化的是「文本看起来合理」而非「文本是真的」" },
      { key: "C", text: "GPT-5 之后幻觉就会完全消失" },
      { key: "D", text: "幻觉只在小模型里出现,大模型不会" }
    ],
    correct: "B",
    explanation: "第 21 讲核心:幻觉是 transformer + next-token prediction 架构决定的结构性问题,不是 bug。Anthropic 2024 SAE 论文找到了模型内部专门的「虚构特征」,但并不意味着堆参数能消失。",
    difficulty: "recall"
  },
  {
    id: "L21-2",
    lesson: 21,
    type: "multi",
    question: "讲稿讲到 Apple GSM-Symbolic 实验、Lost in the Middle、Demo 99% 生产 60% 鸿沟。以下哪些是讲稿的核心论点?",
    options: [
      { key: "A", text: "模型在 GSM 题目上加无关条款,准确率会大幅下降——说明做的是「近似模式匹配」而非真正推理" },
      { key: "B", text: "长上下文「装得下」不等于「能用上」,信息埋在中间召回率最低(U 型曲线)" },
      { key: "C", text: "Claude 200K / Gemini 2M 的真实有效上下文(RULER 测得)远小于宣传值" },
      { key: "D", text: "只要把模型换成 Frontier 梯队,生产环境的 60% 准确率就能涨到 99%" }
    ],
    correct: ["A", "B", "C"],
    explanation: "D 项错——讲稿强调:生产环境的 60% 鸿沟是七堵墙叠加导致的、长尾密集场景,工程手段在 60-90% 区间能提升效率,但「没有任何工程手段能突破模型本身的能力天花板」。",
    difficulty: "synthesis"
  },

  // ============ L22 · 未来路线 ============
  {
    id: "L22-1",
    lesson: 22,
    type: "single",
    question: "讲稿给的 7 条 AI 演进路线里,赔率最高的(讲师给 55%)是哪一条?",
    options: [
      { key: "A", text: "A · 继续 Scaling" },
      { key: "B", text: "B · 推理时计算(Test-Time Compute)" },
      { key: "C", text: "D · 世界模型 / 具身智能" },
      { key: "D", text: "E · 架构革新(Post-Transformer)" }
    ],
    correct: "B",
    explanation: "第 22 讲明确给路线 B(o1 / o3 / R1 / Claude thinking 这条线)的赔率 55%——是 7 条路线里最高的,是 2026 头部 lab 共同押的「近 2 年主线」。",
    difficulty: "recall"
  },
  {
    id: "L22-2",
    lesson: 22,
    type: "multi",
    question: "讲稿给企业团队的「4 条真正护城河」,以下哪些是?",
    options: [
      { key: "A", text: "数据沉淀(私域业务数据、用户行为日志、领域 Know-how)" },
      { key: "B", text: "工程能力(评估、监控、灰度、降级、合规、成本控制)" },
      { key: "C", text: "场景理解(20 年行业 Know-how)" },
      { key: "D", text: "训练自己的基础大模型" }
    ],
    correct: ["A", "B", "C"],
    explanation: "讲稿明确的 4 条护城河是:数据沉淀 / 工程能力 / 场景理解 / 分发与信任。D 项是企业团队不该做的——基础模型是「会被替换的薄层」。",
    difficulty: "apply"
  },

  // ============ L23 · AGI 之后 ============
  {
    id: "L23-1",
    lesson: 23,
    type: "single",
    question: "讲稿讲工作冲击时反复强调一个核心观点,以下哪个是?",
    options: [
      { key: "A", text: "AI 会按职业整体替代——某个职业要么全消失要么全保留" },
      { key: "B", text: "替代是任务级而非职业级——同一岗位中可结构化的任务先消失,留下「判断+协调+负责」的部分" },
      { key: "C", text: "所有蓝领工作 5 年内都会被替代" },
      { key: "D", text: "管理岗位永远不会被影响" }
    ],
    correct: "B",
    explanation: "第 23 讲核心论点:风险不取决于职业名称,取决于任务粒度。讲稿用医生、销售、工程师三个岗位拆解证明——每个岗位里高风险任务和低风险任务并存。",
    difficulty: "recall"
  },
  {
    id: "L23-2",
    lesson: 23,
    type: "multi",
    question: "讲稿给的「三情境社会推演」,以下哪几条是真实出现的?",
    options: [
      { key: "A", text: "情境 A · 渐进过渡:AI 能力持续提升但未触达通用智能,各行业逐步采纳,每年消失 3-5% 岗位" },
      { key: "B", text: "情境 B · 爆发式跃迁:AGI 在 2-3 年内出现,岗位大规模消失,社会安全网来不及搭建" },
      { key: "C", text: "情境 C · 能力停滞:LLM 路线 2026-2028 触及天花板,AGI 不在 10 年内出现" },
      { key: "D", text: "情境 D · 反 AI 革命:全球禁止 AI 发展" }
    ],
    correct: ["A", "B", "C"],
    explanation: "讲稿明确的是 ABC 三情境对应渐进过渡 / 爆发式跃迁 / 能力停滞。D 是不存在的虚构选项。",
    difficulty: "apply"
  },

  // ============ 综合题 SYN-1 ~ SYN-4 ============
  {
    id: "SYN-1",
    lesson: 0,
    type: "multi",
    question: "Prompt Engineering、Context Engineering、Harness Engineering 三者的关系,以下哪些说法是对的?",
    options: [
      { key: "A", text: "Prompt 是 Context 的子集——system prompt 仍是 Context 的核心一块" },
      { key: "B", text: "Prompt 关注「写好一条指令」,Context 关注「设计每次调用前的整个上下文窗口」,Harness 关注「调用之间的循环怎么持续运行不崩溃」" },
      { key: "C", text: "三者依次是 2023 / 2024 / 2025 不同阶段被业界提出的工程范式" },
      { key: "D", text: "Context Engineering 出现后 Prompt Engineering 就完全过时了" }
    ],
    correct: ["A", "B", "C"],
    explanation: "ABC 都是 L9/L15/L16 三讲的明确论点——Prompt ⊂ Context,Harness 是骨架配套。D 项错:讲稿明确 Prompt 仍是 Context 的核心组成部分,不是替代关系。",
    difficulty: "synthesis"
  },
  {
    id: "SYN-2",
    lesson: 0,
    type: "single",
    question: "讲稿在第 14 讲讲评估金字塔时强调「benchmark 高分 ≠ 生产可用」,在第 21 讲又用 GSM-Symbolic 实验给了实证。结合两讲,以下哪一条是最贴近讲稿主旨的实战建议?",
    options: [
      { key: "A", text: "评估集要覆盖真实用户的「噪音输入」——故意加错别字、无关背景、行业黑话,而不是只跑 benchmark 题" },
      { key: "B", text: "只要 benchmark 分数高就可以直接上线,不需要自己跑评估集" },
      { key: "C", text: "评估集只需要 5-10 个 case 就够了" },
      { key: "D", text: "上线后的真实用户反馈不重要,只看上线前的 benchmark" }
    ],
    correct: "A",
    explanation: "讲稿两处都强调:真实用户输入永远比 benchmark 脏(L21 GSM-Symbolic L4 扰动准确率从 95% 跌到 42%);所以评估集必须覆盖噪音输入(L14)。其他三项都和讲稿主旨相反。",
    difficulty: "synthesis"
  },
  {
    id: "SYN-3",
    lesson: 0,
    type: "multi",
    question: "讲稿在多讲都讨论了「企业 AI 的真正护城河」。综合 L18(SaaS 交付)、L22(未来路线)、L23(AGI 之后),以下哪些是讲稿反复强调的护城河要素?",
    options: [
      { key: "A", text: "数据飞轮(用户用得越多,AI 越懂这个行业的对话、决策、需求模式)" },
      { key: "B", text: "行业 Know-how 沉淀(12-20 年的客户案例、实施手册、续约谈判记录)" },
      { key: "C", text: "工程能力(评估、Trace、灰度、合规、成本治理——任何路线下都复利)" },
      { key: "D", text: "自研一个比 GPT-5 / Claude Opus 更强的基础大模型" }
    ],
    correct: ["A", "B", "C"],
    explanation: "讲稿在多讲反复强调:模型是公共能力、会换;Prompt/Agent 是薄层、会变;真正的护城河是「数据 + 工程 + 场景 + 分发」。D 项是讲稿明确反对的——基础模型对企业团队不是合理战略。",
    difficulty: "synthesis"
  },
  {
    id: "SYN-4",
    lesson: 0,
    type: "multi",
    question: "讲稿在 L21(局限地图)和 L23(AGI 之后)给的「投资 / 行动地图」三分区(GO / CAUTIOUS / WAIT),结合三种未来情境推演(A 渐进 / B 爆发 / C 停滞),以下哪些行动建议是讲稿支持的?",
    options: [
      { key: "A", text: "GO 区(销售辅助、客服、文档摘要、需求提取)立刻推进——这是所有情境下都成立的核心区" },
      { key: "B", text: "CAUTIOUS 区(合同审查、医疗诊断辅助)必须加结构化兜底——规则、二次审核、人工抽样" },
      { key: "C", text: "WAIT 区(无人驾驶、自主交易、医疗自动诊断)长尾密集 + 单次失败代价大,2026 还不到" },
      { key: "D", text: "应该把全部资源 all-in 推理时计算(o1 / R1)路线,因为它赔率 55% 最高" }
    ],
    correct: ["A", "B", "C"],
    explanation: "ABC 都是 L21 投资地图三分区的明确建议。D 项错——L22 反复强调「没有任何路线赔率超过 55%,任何 all-in 单条路线的策略从概率上就是错的」,正确做法是 hedge + 主投护城河。",
    difficulty: "synthesis"
  }
];
