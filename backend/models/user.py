import uuid
from datetime import datetime, timezone
from sqlalchemy import String, Boolean, DateTime, JSON, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column
from models import Base


from services._time import utcnow_naive as _utcnow


class User(Base):
    __tablename__ = "users"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    username: Mapped[str] = mapped_column(String(64), nullable=False, unique=True)
    email: Mapped[str | None] = mapped_column(String(255), nullable=True)
    password_hash: Mapped[str | None] = mapped_column(String(255), nullable=True)
    full_name: Mapped[str | None] = mapped_column(String(128), nullable=True)
    is_admin: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    # 角色（/console 工作台分流）：admin = 后台知识管理；console_user = 对外工作台（实施顾问）
    role: Mapped[str] = mapped_column(String(32), default="console_user", nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    must_change_password: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)

    # 模块访问权限：null = 全部可见；列表 = 仅允许访问指定模块
    # 可用值: dashboard, projects, documents, chunks, qa, review, challenge, settings
    allowed_modules: Mapped[list | None] = mapped_column(JSON, nullable=True, default=None)

    # SSO 预留字段（A12）：当通过 SSO 登录时填充；本地账号留空
    sso_provider: Mapped[str | None] = mapped_column(String(32), nullable=True)
    sso_subject: Mapped[str | None] = mapped_column(String(255), nullable=True)

    # MCP 永久 API Key（不过期，格式 mcp_<uuid_hex>）
    mcp_api_key: Mapped[str | None] = mapped_column(String(64), nullable=True, unique=True)

    # 管理员授权才可调用外部 API / MCP；默认关闭，管理员账号自动开启
    api_enabled: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)

    # 注册时使用的邀请码(审计用,记录是哪个 invite_code 把这个账号引进来的)
    signed_up_via_invite_code: Mapped[str | None] = mapped_column(String(32), nullable=True)

    # 飞书集成(用户级凭证):每个用户配置自己的飞书自建应用
    # secret 明文存(DB 访问控制兜底;Block E 决策不引入 cryptography 依赖,后续可补)
    feishu_app_id: Mapped[str | None] = mapped_column(String(128), nullable=True)
    feishu_app_secret: Mapped[str | None] = mapped_column(String(255), nullable=True)

    # ShareDev / sharedev-cli 集成(用户级凭证):配的是客户租户 PaaS API token
    # certificate 用 Fernet 加密存(跟 feishu 的不加密路径不同,因为 sharedev cert 是
    # PaaS 实施权限,泄露风险高);domain 默认 https://www.fxiaoke.com/ 可改私有部署
    sharedev_domain: Mapped[str | None] = mapped_column(String(255), nullable=True)
    sharedev_certificate: Mapped[str | None] = mapped_column(String(512), nullable=True)

    created_at: Mapped[datetime] = mapped_column(DateTime, default=_utcnow, nullable=False)
    last_login_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)

    __table_args__ = (
        UniqueConstraint("sso_provider", "sso_subject", name="uq_user_sso"),
    )
