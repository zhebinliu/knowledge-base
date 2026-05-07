"""图形验证码服务 — 后端生成 PNG,DB 存 hash 一次性消费。

流程:
1. 前端 GET /api/auth/captcha → 拿 (captcha_id, image_b64)
2. 用户看图填答案
3. 提交注册 / 登录时带上 captcha_id + captcha_answer
4. 后端 verify_captcha 一次性消费;消费后 used=true,即便重放也不通过

依赖 captcha 库(轻量 wrapper Pillow,生成带干扰线的 PNG)。
"""
from __future__ import annotations

import base64
import hashlib
import io
import random
import string
import uuid
from datetime import timedelta
from typing import Tuple

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from models.captcha_challenge import CaptchaChallenge
from services._time import utcnow_naive as _utcnow

CAPTCHA_LENGTH = 5
CAPTCHA_TTL_SECONDS = 300  # 5 分钟
CAPTCHA_CHARSET = string.ascii_uppercase + string.digits  # 大写字母 + 数字,避免易混淆字符
# 易混淆字符过滤:0/O,1/I/l 直接排除
CAPTCHA_CHARSET = CAPTCHA_CHARSET.replace("0", "").replace("O", "").replace("1", "").replace("I", "")


def _hash(answer: str) -> str:
    """对 captcha 答案做 sha256(case-insensitive)。"""
    return hashlib.sha256(answer.upper().strip().encode("utf-8")).hexdigest()


def _generate_random_code() -> str:
    return "".join(random.choices(CAPTCHA_CHARSET, k=CAPTCHA_LENGTH))


def _render_png(code: str) -> bytes:
    """把验证码渲染成 PNG 字节流。优先用 captcha 库;不可用时降级到简单 Pillow。"""
    try:
        from captcha.image import ImageCaptcha
        ic = ImageCaptcha(width=180, height=60, font_sizes=(36, 40, 44))
        return ic.generate(code).getvalue()
    except Exception:
        # 降级:Pillow 自己画一个简陋版本(实际生产容器里 captcha 库装了应该不会走这里)
        from PIL import Image, ImageDraw, ImageFont
        img = Image.new("RGB", (180, 60), (245, 245, 245))
        draw = ImageDraw.Draw(img)
        # 默认字体即可
        try:
            font = ImageFont.truetype("DejaVuSans-Bold.ttf", 36)
        except Exception:
            font = ImageFont.load_default()
        for i, ch in enumerate(code):
            x = 20 + i * 30
            y = 10 + random.randint(-5, 5)
            draw.text((x, y), ch, fill=(50, 50, 50), font=font)
        # 干扰线
        for _ in range(6):
            x1, y1 = random.randint(0, 180), random.randint(0, 60)
            x2, y2 = random.randint(0, 180), random.randint(0, 60)
            draw.line([(x1, y1), (x2, y2)], fill=(180, 180, 180), width=1)
        buf = io.BytesIO()
        img.save(buf, format="PNG")
        return buf.getvalue()


async def generate_captcha(s: AsyncSession) -> Tuple[str, str]:
    """生成新的 captcha 挑战。返回 (captcha_id, image_b64_data_url)。"""
    code = _generate_random_code()
    challenge = CaptchaChallenge(
        id=str(uuid.uuid4()),
        code_hash=_hash(code),
        expires_at=_utcnow() + timedelta(seconds=CAPTCHA_TTL_SECONDS),
        used=False,
    )
    s.add(challenge)
    await s.commit()
    png_bytes = _render_png(code)
    b64 = base64.b64encode(png_bytes).decode("ascii")
    return challenge.id, f"data:image/png;base64,{b64}"


async def verify_captcha(s: AsyncSession, captcha_id: str, answer: str) -> tuple[bool, str]:
    """一次性消费验证。返回 (ok, error_msg)。
    - 不论对错,消费后立即 used=true,防重放
    - 若 captcha_id 不存在 / 过期 / 已用 → 失败
    """
    if not captcha_id or not answer:
        return False, "请输入验证码"
    challenge = await s.get(CaptchaChallenge, captcha_id)
    if not challenge:
        return False, "验证码无效或已过期"
    if challenge.used:
        return False, "验证码已被使用,请刷新重试"
    if challenge.expires_at < _utcnow():
        challenge.used = True
        await s.commit()
        return False, "验证码已过期,请刷新"

    # 一律标 used(防重放)
    challenge.used = True
    expected = challenge.code_hash
    actual = _hash(answer)
    await s.commit()

    if expected != actual:
        return False, "验证码错误"
    return True, ""


async def cleanup_expired_captchas(s: AsyncSession) -> int:
    """清理过期 / 已用的 captcha 记录(可由定时任务调,这里先提供函数)。"""
    from sqlalchemy import delete
    result = await s.execute(
        delete(CaptchaChallenge).where(
            (CaptchaChallenge.expires_at < _utcnow()) | (CaptchaChallenge.used == True)
        )
    )
    await s.commit()
    return result.rowcount or 0
