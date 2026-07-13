"""名词校正词典 CRUD API(2026-07-13)。

每个用户维护自己的名词清单,润色时注入 prompt。
支持:列表 / 增 / 删 / 改 / 批量导入。
"""
from __future__ import annotations

import logging
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import select, delete
from sqlalchemy.ext.asyncio import AsyncSession

from models import get_session
from models.term_correction import TermCorrection
from services.auth import get_current_user
from models.user import User

logger = logging.getLogger(__name__)
router = APIRouter()


# ── Pydantic Schemas ──────────────────────────────────────────────────────

class TermCorrectionCreate(BaseModel):
    wrong_term: str = Field(..., min_length=1, max_length=200)
    correct_term: str = Field(..., min_length=1, max_length=200)
    note: Optional[str] = None


class TermCorrectionUpdate(BaseModel):
    correct_term: Optional[str] = Field(None, min_length=1, max_length=200)
    note: Optional[str] = None


class TermCorrectionBatchImport(BaseModel):
    """批量导入。items 为 [{wrong, correct, note?}] 或 [[wrong, correct], ...]。"""
    items: list[dict] = Field(...)


class TermCorrectionOut(BaseModel):
    id: int
    wrong_term: str
    correct_term: str
    note: Optional[str] = None
    created_at: str
    updated_at: str


# ── Endpoints ────────────────────────────────────────────────────────────

@router.get("", response_model=list[TermCorrectionOut])
async def list_terms(
    db: AsyncSession = Depends(get_session),
    user: User = Depends(get_current_user),
):
    """列出当前用户的所有名词校正记录。"""
    result = await db.execute(
        select(TermCorrection)
        .where(TermCorrection.user_id == user.id)
        .order_by(TermCorrection.updated_at.desc())
    )
    terms = result.scalars().all()
    return [
        TermCorrectionOut(
            id=t.id,
            wrong_term=t.wrong_term,
            correct_term=t.correct_term,
            note=t.note,
            created_at=t.created_at.isoformat() if t.created_at else "",
            updated_at=t.updated_at.isoformat() if t.updated_at else "",
        )
        for t in terms
    ]


@router.post("", response_model=TermCorrectionOut, status_code=201)
async def create_term(
    body: TermCorrectionCreate,
    db: AsyncSession = Depends(get_session),
    user: User = Depends(get_current_user),
):
    """新增一条名词校正。"""
    existing = await db.execute(
        select(TermCorrection).where(
            TermCorrection.user_id == user.id,
            TermCorrection.wrong_term == body.wrong_term,
        )
    )
    if existing.scalar_one_or_none():
        raise HTTPException(409, f"已存在错误词「{body.wrong_term}」的校正记录")

    t = TermCorrection(
        user_id=user.id,
        wrong_term=body.wrong_term,
        correct_term=body.correct_term,
        note=body.note,
    )
    db.add(t)
    await db.commit()
    await db.refresh(t)
    return TermCorrectionOut(
        id=t.id,
        wrong_term=t.wrong_term,
        correct_term=t.correct_term,
        note=t.note,
        created_at=t.created_at.isoformat() if t.created_at else "",
        updated_at=t.updated_at.isoformat() if t.updated_at else "",
    )


@router.put("/{term_id}", response_model=TermCorrectionOut)
async def update_term(
    term_id: int,
    body: TermCorrectionUpdate,
    db: AsyncSession = Depends(get_session),
    user: User = Depends(get_current_user),
):
    """更新一条名词校正。"""
    result = await db.execute(
        select(TermCorrection).where(
            TermCorrection.id == term_id,
            TermCorrection.user_id == user.id,
        )
    )
    t = result.scalar_one_or_none()
    if not t:
        raise HTTPException(404, "记录不存在")
    if body.correct_term is not None:
        t.correct_term = body.correct_term
    if body.note is not None:
        t.note = body.note
    await db.commit()
    await db.refresh(t)
    return TermCorrectionOut(
        id=t.id,
        wrong_term=t.wrong_term,
        correct_term=t.correct_term,
        note=t.note,
        created_at=t.created_at.isoformat() if t.created_at else "",
        updated_at=t.updated_at.isoformat() if t.updated_at else "",
    )


@router.delete("/{term_id}", status_code=200)
async def delete_term(
    term_id: int,
    db: AsyncSession = Depends(get_session),
    user: User = Depends(get_current_user),
):
    """删除一条名词校正。"""
    result = await db.execute(
        select(TermCorrection).where(
            TermCorrection.id == term_id,
            TermCorrection.user_id == user.id,
        )
    )
    t = result.scalar_one_or_none()
    if not t:
        raise HTTPException(404, "记录不存在")
    await db.delete(t)
    await db.commit()
    return {"ok": True}


@router.post("/batch-import", response_model=dict)
async def batch_import_terms(
    body: TermCorrectionBatchImport,
    db: AsyncSession = Depends(get_session),
    user: User = Depends(get_current_user),
):
    """批量导入名词校正。

    items 支持两种格式:
    - [{wrong: "纷享消客", correct: "纷享销客", note: "..."}]
    - [{wrong_term: "...", correct_term: "..."}]
    - [["错误词", "正确词"], ...]
    """
    created = 0
    skipped = 0
    for item in body.items:
        if isinstance(item, list):
            wrong, correct = (item + [""])[:2], None
            if len(item) >= 2:
                wrong, correct = item[0], item[1]
            note = item[2] if len(item) > 2 else None
        else:
            wrong = item.get("wrong") or item.get("wrong_term") or ""
            correct = item.get("correct") or item.get("correct_term") or ""
            note = item.get("note")

        wrong, correct = wrong.strip(), correct.strip()
        if not wrong or not correct:
            skipped += 1
            continue

        existing = await db.execute(
            select(TermCorrection).where(
                TermCorrection.user_id == user.id,
                TermCorrection.wrong_term == wrong,
            )
        )
        if existing.scalar_one_or_none():
            skipped += 1
            continue

        db.add(TermCorrection(
            user_id=user.id,
            wrong_term=wrong,
            correct_term=correct,
            note=note,
        ))
        created += 1

    await db.commit()
    return {"created": created, "skipped": skipped}
