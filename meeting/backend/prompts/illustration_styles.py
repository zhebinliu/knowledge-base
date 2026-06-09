"""cc2image 风格库 — 46 套内容视觉风格 + 8 套 logo/图标风格。

来源: https://github.com/izscc/cc2image (MIT License)
"""

# ── 内容风格 ────────────────────────────────────────────────────────────

CONTENT_STYLES: list[dict] = [
    # A. 知识图解类
    {"id": "handdrawn_knowledge_card", "name": "手绘知识风", "group": "知识图解",
     "best_for": "默认；正文配图、知识图解、方法论、流程图、对比图"},
    {"id": "study_note_card", "name": "学习笔记风", "group": "知识图解",
     "best_for": "学习方法、笔记整理、步骤教程、知识清单"},
    {"id": "pastel_learning_pyramid", "name": "粉彩金字塔风", "group": "知识图解",
     "best_for": "分层模型、学习金字塔、能力进阶、成长路径"},
    {"id": "childlike_cultural_infographic", "name": "童趣科普风", "group": "知识图解",
     "best_for": "传统文化科普、儿童教育、器物拆解"},
    {"id": "quirky_doodle_character_flow", "name": "怪诞小人风", "group": "知识图解",
     "best_for": "AI工作流、系统流程、正文配图、方法论拆解、工具链说明"},
    {"id": "real_object_doodle_composite", "name": "实物涂鸦风", "group": "知识图解",
     "best_for": "幽默封面、创意配图、情绪表达、工作压力"},

    # B. 东方/人文/情绪插画类
    {"id": "oriental_editorial_illustration", "name": "典籍山水风", "group": "东方人文",
     "best_for": "文化、历史、人文、哲学类高级封面"},
    {"id": "minimal_healing_metaphor_comic", "name": "治愈漫画风", "group": "东方人文",
     "best_for": "情绪疗愈、内耗、孤独、亲密关系、自我照顾"},
    {"id": "black_void_glowing_hands", "name": "黑场肢体风", "group": "东方人文",
     "best_for": "心理主题、情绪主题、关系连接、孤独感"},
    {"id": "oriental_floral_minimal_editorial", "name": "花艺留白风", "group": "东方人文",
     "best_for": "女性主题、母亲节、思念、关系、疗愈"},
    {"id": "zen_ink_philosophy_poster", "name": "禅意水墨风", "group": "东方人文",
     "best_for": "哲学、人生路径、自我修炼、东方智慧"},
    {"id": "minimal_line_art", "name": "线条艺术风", "group": "东方人文",
     "best_for": "亲密关系、旅行、学习、城市、灵感、个人成长"},
    {"id": "expressive_3d_quirky_character", "name": "3D怪表情风", "group": "东方人文",
     "best_for": "情绪表达、观点吐槽、文章封面、正文配图、社媒表情图"},
    {"id": "giant_chinese_concept_poster", "name": "大字海报风", "group": "东方人文",
     "best_for": "中文概念海报、文学感封面、情绪关键词、品牌态度海报"},

    # C. 极简设计/材质海报类
    {"id": "frosted_glass_editorial", "name": "磨砂情绪风", "group": "极简设计",
     "best_for": "心理情绪、孤独感、音乐艺术主题"},
    {"id": "translucent_object_editorial", "name": "透明物件风", "group": "极简设计",
     "best_for": "设计主题、品牌设计、作品集封面、工具系统封面"},
    {"id": "glassmorphism_gradient_blob", "name": "玻璃气泡风", "group": "极简设计",
     "best_for": "品牌视觉、创意展览、趋势报告、AI主题"},
    {"id": "soft_neumorphism_ui", "name": "柔光界面风", "group": "极简设计",
     "best_for": "产品功能封面、AI工具界面、智能家居、效率工具"},
    {"id": "minimal_line_shadow_brand", "name": "线性品牌风", "group": "极简设计",
     "best_for": "新品发布、品牌封面、科技产品、数字主题"},
    {"id": "white_mono_texture_editorial", "name": "白色肌理风", "group": "极简设计",
     "best_for": "深度文章封面、设计作品集、哲学主题、个人品牌"},
    {"id": "minimal_architecture_portfolio", "name": "建筑线稿风", "group": "极简设计",
     "best_for": "作品集封面、人生路径、职业路径、空间叙事"},
    {"id": "editorial_line_character", "name": "编辑线稿风", "group": "极简设计",
     "best_for": "品牌视觉、杂志海报、网站首屏、包装、角色系统"},
    {"id": "editorial_object_annotation_card", "name": "具象标注风", "group": "极简设计",
     "best_for": "AI方法论、设计思维、知识卡片、认知模型、工作流原则"},
    {"id": "isometric_modular_system", "name": "轴测模块系统风", "group": "极简设计",
     "best_for": "SaaS架构、服务流程、空间地图、系统关系"},
    {"id": "monochrome_system_editorial", "name": "黑白系统风", "group": "极简设计",
     "best_for": "Skill封面、SOP封面、提示词库、方法论手册、AI工作流"},
    {"id": "premium_product_ad_poster", "name": "产品海报风", "group": "极简设计",
     "best_for": "电商主图、新品发布海报、品牌广告、产品卖点图"},

    # D. 字体材质类
    {"id": "embossed_typography_poster", "name": "纸雕字体风", "group": "字体材质",
     "best_for": "极简封面、品牌口号、深度思考、书封设计"},
    {"id": "acrylic_dimensional_type", "name": "亚克力字风", "group": "字体材质",
     "best_for": "品牌关键词、栏目标题、创意概念、年轻化封面"},
    {"id": "transparent_architectural_type", "name": "透明字境风", "group": "字体材质",
     "best_for": "宏大阶段、未来路径、系统升级、人生转折"},
    {"id": "fluffy_soft_typography", "name": "毛绒字体风", "group": "字体材质",
     "best_for": "好运、发财、治愈、可爱、祝福、轻松社媒图"},
    {"id": "cloud_typography_cover", "name": "云朵字体风", "group": "字体材质",
     "best_for": "希望、成长、新开始、复原力、上升、疗愈"},
    {"id": "foam_bubble_typography", "name": "泡沫字体风", "group": "字体材质",
     "best_for": "清洁、焕新、重启、梦想、生活方式海报"},
    {"id": "luxury_gold_typography", "name": "金属奢华风", "group": "字体材质",
     "best_for": "节日海报、高端品牌、仪式感、成就、庆典"},
    {"id": "semantic_material_typography", "name": "语义字体风", "group": "字体材质",
     "best_for": "关键词封面、品牌标题、栏目标题、概念海报"},

    # E. 拼贴/纸张/手工材质类
    {"id": "retro_minimal_poster_illustration", "name": "复古海报风", "group": "拼贴手工",
     "best_for": "极简主义、生活方式、个人手册、创作宣言"},
    {"id": "editorial_balloon_collage", "name": "气球拼贴风", "group": "拼贴手工",
     "best_for": "团队协作、未来愿景、组织文化、品牌广告"},
    {"id": "paper_cut_profile_silhouette", "name": "纸雕剪影风", "group": "拼贴手工",
     "best_for": "职业人物、行业精神、工程建筑、人物专访"},
    {"id": "torn_paper_note_minimal", "name": "撕纸便签风", "group": "拼贴手工",
     "best_for": "一句话封面、信念提醒、极简语录、每日提醒"},
    {"id": "embroidered_patch_brand", "name": "刺绣徽章风", "group": "拼贴手工",
     "best_for": "品牌徽章、学院风、社群身份、工具包"},

    # F. 微缩场景/品牌广告类
    {"id": "miniature_map_life_scene", "name": "微缩地图风", "group": "微缩场景",
     "best_for": "人生选择、职业路径、城市迁移、成长路线"},
    {"id": "miniature_checklist_scene", "name": "微缩清单风", "group": "微缩场景",
     "best_for": "任务管理、行动清单、习惯养成、目标拆解"},
    {"id": "isometric_timeline_miniature", "name": "时间微缩风", "group": "微缩场景",
     "best_for": "技术演化、行业发展史、工具变迁、产品迭代"},
    {"id": "fabric_micro_scene_ad", "name": "布料微缩风", "group": "微缩场景",
     "best_for": "劳动节、匠心、手工、服饰品牌、工艺精神"},
    {"id": "giant_letter_lifestyle_scene", "name": "巨字生活风", "group": "微缩场景",
     "best_for": "品牌广告、教育、家庭、城市、组织价值"},
    {"id": "crowd_typography_scene", "name": "人群造字风", "group": "微缩场景",
     "best_for": "社会议题、财经封面、就业问题、城市议题、商业趋势"},
]

# ── 风格 ID → 完整信息快速查找 ──────────────────────────────────────────

STYLE_MAP: dict[str, dict] = {s["id"]: s for s in CONTENT_STYLES}

# ── 按分组组织 ──────────────────────────────────────────────────────────

STYLE_GROUPS: dict[str, list[dict]] = {}
for _s in CONTENT_STYLES:
    STYLE_GROUPS.setdefault(_s["group"], []).append(_s)

# ── 默认风格 ────────────────────────────────────────────────────────────

DEFAULT_STYLE = "handdrawn_knowledge_card"

# ── 风格描述(注入 prompt)──────────────────────────────────────────────

STYLE_DESCRIPTIONS: dict[str, str] = {
    "handdrawn_knowledge_card": (
        "暖白纸感背景，黑灰细线手绘，低饱和浅色块，中文手写字，"
        "极简抽象小人，气泡注释，底部判断句，留白充足，克制精致，轻商业内容资产感。"
        "适合知识图解、方法论、流程图、对比图。"
    ),
    "oriental_editorial_illustration": (
        "典籍山水风格，中国传统水墨意境，留白大气，淡雅色调，"
        "古典构图与现代知识内容结合，高级封面感。"
    ),
    "study_note_card": (
        "学习笔记风格，手写笔记感，便签纸/方格纸背景，荧光笔高亮，"
        "贴纸式标签，清单式排版，轻松学习氛围。"
    ),
    "quirky_doodle_character_flow": (
        "怪诞小人风格，夸张的黑色手绘小人，荒诞幽默的动作，"
        "系统流程用小人操作物件来表达，轻松有趣地解释复杂流程。"
    ),
    "expressive_3d_quirky_character": (
        "3D怪表情风格，圆润3D小人，夸张表情和态度动作，"
        "极简背景，低饱和色，柔和灯光，短句吐槽。"
    ),
    "minimal_healing_metaphor_comic": (
        "治愈漫画风格，温柔的线条和配色，情感隐喻画面，"
        "用具体物件表达抽象情绪，温暖疗愈感。"
    ),
    "monochrome_system_editorial": (
        "黑白系统风格，纯黑白配色，极简几何线条，"
        "系统化排版，方法论手册感，专业严谨。"
    ),
}

# 对未列出描述的风格使用通用描述
_DEFAULT_DESC = (
    "现代设计风格，精心选择的配色和构图，"
    "适合对应主题的视觉表达，高品质中文内容资产感。"
)

def get_style_description(style_id: str) -> str:
    """获取风格描述，用于注入 prompt。"""
    return STYLE_DESCRIPTIONS.get(style_id, _DEFAULT_DESC)


def get_style_name(style_id: str) -> str:
    """获取风格中文名。"""
    info = STYLE_MAP.get(style_id)
    return info["name"] if info else style_id


def auto_match_style(text: str) -> str:
    """根据会议内容自动匹配最合适的风格。

    简单关键词匹配，不调用 LLM。默认返回 handdrawn_knowledge_card。
    """
    text_lower = text.lower()
    # AI/系统/工作流 → 怪诞小人风
    if any(kw in text_lower for kw in ["工作流", "系统", "自动化", "pipeline", "流程", "工具链"]):
        return "quirky_doodle_character_flow"
    # 情绪/心理/关系 → 治愈漫画
    if any(kw in text_lower for kw in ["情绪", "心理", "压力", "焦虑", "关系", "疗愈"]):
        return "minimal_healing_metaphor_comic"
    # 产品/品牌/发布 → 线性品牌
    if any(kw in text_lower for kw in ["产品", "品牌", "发布", "上线", "营销"]):
        return "minimal_line_shadow_brand"
    # 学习/培训/教程 → 学习笔记
    if any(kw in text_lower for kw in ["学习", "培训", "教程", "知识", "课程"]):
        return "study_note_card"
    # 方法论/策略/规划 → 黑白系统
    if any(kw in text_lower for kw in ["方法论", "策略", "规划", "框架", "SOP"]):
        return "monochrome_system_editorial"
    return DEFAULT_STYLE
