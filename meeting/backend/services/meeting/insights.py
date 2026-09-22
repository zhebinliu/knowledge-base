"""会议洞察服务:词云关键词抽取 / 参会人发言时长归因(2026-09)。

**只建在 `meeting/backend/` 这一份,不要在 `backend/services/meeting/` 建同名副本。**
理由同 module_export.py / module_layouts.py:Dockerfile 是二次 COPY 的 overlay
(`COPY backend/ /app/` 之后 `COPY meeting/backend/ /app/`,后者胜),只在 overlay 建一份
即可正常上线;一旦两处同名,后 COPY 的那份会静默胜出,以后改错文件不生效
—— 这正是名词校正词典(term_hints)在生产失效的原因,见 LEARNING.md。

对外两个入口:
- `extract_keywords()`          → 词云
- `extract_speaker_durations()` → 参会人发言时长(有真说话人表头则精确解析,否则 LLM 归因)
"""
from __future__ import annotations

import asyncio
import math
import re

import structlog

from services._time import iso_utc, utcnow_naive
from services.meeting.pipeline import _json_output_valid, _split_by_lines
from services.model_router import model_router

logger = structlog.get_logger()

# 「无法判断」桶 —— 归因不出来的发言统一落这里,保证各说话人时长之和 + 该桶 = 全场时长
UNKNOWN_SPEAKER = "无法判断"

# ASR 切片时长:与 services/meeting/asr.py 的 CHUNK_SECONDS 一致。
# 仅用于「相邻时间戳差不可信」时兜底估算单行时长,不用于真实计时。
_ASR_CHUNK_SECONDS = 20


def _now_iso() -> str:
    return iso_utc(utcnow_naive()) or ""


# ══════════════════════════════════════════════════════════════════════════
# 一、词云关键词
# ══════════════════════════════════════════════════════════════════════════

MAX_KEYWORDS = 40
# 单窗上限:一次调用喂给模型的字符数,超过就按行边界切块并行(而非头尾截断,保全覆盖)
_KEYWORD_SINGLE_WINDOW = 24000
_KEYWORD_WINDOW_CHARS = 20000
_KEYWORD_MAX_WINDOWS = 4

_EMPTY_KEYWORDS: dict = {"keywords": [], "focus": ""}

_VALID_CATEGORIES = {"业务", "技术", "组织", "风险", "其他"}


async def _extract_keywords_one_window(meeting_title: str, window: str, model: str | None) -> tuple[list[dict], str, str]:
    """单窗抽取。返回 (keywords_raw, focus, model_used)。失败返回空,不抛。"""
    from prompts.meeting import KEYWORD_SYSTEM, KEYWORD_USER
    from services.llm_json import loads_lenient

    messages = [
        {"role": "system", "content": KEYWORD_SYSTEM},
        {"role": "user", "content": KEYWORD_USER.format(meeting_title=meeting_title or "(未命名会议)", transcript=window)},
    ]
    try:
        content, model_used = await model_router.chat_with_routing(
            task="meeting_keywords_extract",
            messages=messages,
            temperature=0.2,
            max_tokens=4000,
            validator=_json_output_valid,
            response_format={"type": "json_object"},
            extra_payload={"thinking": {"type": "disabled"}},
        )
    except Exception as e:
        # 单窗失败不拖垮整体:其余窗照常,最终由调用方按「覆盖了几窗」判断是否可用
        logger.warning("keyword_window_failed", error=str(e)[:200], window_chars=len(window))
        return [], "", model or ""

    data = loads_lenient(content, None)
    if not isinstance(data, dict):
        logger.warning("keyword_window_bad_json", raw=(content or "")[:200])
        return [], "", model_used

    raw_items = data.get("keywords")
    items = [it for it in raw_items if isinstance(it, dict)] if isinstance(raw_items, list) else []
    focus = data.get("focus") if isinstance(data.get("focus"), str) else ""
    return items, focus.strip(), model_used


def _merge_and_ground_keywords(items: list[dict], full_text: str) -> list[dict]:
    """合并各窗结果 + **用 Python 侧计数把模型编的词打掉**。

    反幻觉的核心手段:模型报的 count 一律不信,改成在原文里真的 `str.count(word)`。
    数不到(=0)的词直接丢弃 —— 这类词模型是凭常识编的,不是从这场会里读出来的。
    """
    merged: dict[str, dict] = {}
    for it in items:
        word = str(it.get("word") or "").strip()
        if not word or len(word) < 2:
            continue
        try:
            llm_weight = float(it.get("weight") or 0)
        except (TypeError, ValueError):
            llm_weight = 0.0
        cat = str(it.get("category") or "").strip()
        if cat not in _VALID_CATEGORIES:
            cat = "其他"

        prev = merged.get(word)
        if prev is None:
            merged[word] = {"word": word, "llm_weight": llm_weight, "category": cat}
        else:
            # 跨窗复现:权重取最大(不累加,避免长会议因窗多而虚高)
            prev["llm_weight"] = max(prev["llm_weight"], llm_weight)

    grounded: list[dict] = []
    for word, meta in merged.items():
        count = full_text.count(word)
        if count <= 0:
            # 模型编的词 —— 原文里根本没出现,丢弃
            continue
        grounded.append({"word": word, "llm_weight": meta["llm_weight"], "category": meta["category"], "count": count})

    if not grounded:
        return []

    max_log = math.log1p(max(g["count"] for g in grounded)) or 1.0
    for g in grounded:
        # 0.6 语义权重(模型判断的代表性) + 0.4 客观频次,避免纯高频词霸榜
        score = 0.6 * (max(0.0, min(g["llm_weight"], 100.0)) / 100.0) + 0.4 * (math.log1p(g["count"]) / max_log)
        g["score"] = score
        g["weight"] = max(1, min(100, round(score * 100)))

    grounded.sort(key=lambda g: (-g["score"], -g["count"], g["word"]))

    # 去冗余:短词若只出现在长词内部(计数差 ≤1),说明它没有独立信号,丢掉短的
    kept: list[dict] = []
    for g in grounded:
        redundant = False
        for other in grounded:
            if other is g or len(other["word"]) <= len(g["word"]):
                continue
            if g["word"] in other["word"] and abs(other["count"] - g["count"]) <= 1:
                redundant = True
                break
        if not redundant:
            kept.append(g)
        if len(kept) >= MAX_KEYWORDS:
            break

    for g in kept:
        g.pop("score", None)
        g.pop("llm_weight", None)
    return kept


async def extract_keywords(meeting_title: str, transcript: str) -> dict:
    """从转写抽取词云关键词。返回可直接写进 `Meeting.keywords` 的 dict。

    长转写按行边界分窗并行(最多 _KEYWORD_MAX_WINDOWS 窗),不做头尾截断 ——
    头尾截断会让中间整段会议的议题从词云里消失。
    """
    text = (transcript or "").strip()
    if not text:
        raise ValueError("无可用 transcript")

    if len(text) <= _KEYWORD_SINGLE_WINDOW:
        windows = [text]
    else:
        windows = _split_by_lines(text, _KEYWORD_WINDOW_CHARS)
        if len(windows) > _KEYWORD_MAX_WINDOWS:
            # 极端长稿:只取前 N 窗并在 truncated 里如实标记,不假装看完了全文
            windows = windows[:_KEYWORD_MAX_WINDOWS]

    results = await asyncio.gather(
        *[_extract_keywords_one_window(meeting_title, w, None) for w in windows],
        return_exceptions=True,
    )

    raw_items: list[dict] = []
    focus = ""
    model_used = ""
    failed = 0
    for r in results:
        if isinstance(r, BaseException):
            failed += 1
            continue
        items, win_focus, win_model = r
        raw_items.extend(items)
        focus = focus or win_focus
        model_used = model_used or win_model

    if failed == len(windows):
        raise RuntimeError("全部窗口的关键词抽取均失败")

    keywords = _merge_and_ground_keywords(raw_items, text)
    logger.info(
        "keywords_extracted",
        windows=len(windows), failed_windows=failed,
        raw=len(raw_items), kept=len(keywords), chars=len(text),
    )
    return {
        "keywords": keywords,
        "focus": focus,
        "source_chars": len(text),
        "truncated": len(windows) >= _KEYWORD_MAX_WINDOWS and len(text) > _KEYWORD_SINGLE_WINDOW,
        "model": model_used,
        "generated_at": _now_iso(),
    }


# ══════════════════════════════════════════════════════════════════════════
# 二、参会人发言时长
# ══════════════════════════════════════════════════════════════════════════

# 与前端 pages/console/ConsoleMeetingDetail.tsx 的 SPEAKER_HEADER 对齐:
#   1) 录音边录边传:   [MM:SS] 正文      → 由 _TS_AT_START 处理,不是说话人表头
#   2) 妙记/飞书上传:  「说话人 1 00:00:00」/「@张三 00:00:00」/「张三 00:00:00」表头行,正文在后续行
_SPEAKER_HEADER_RE = re.compile(
    r"^\s*(?:(?P<name>说话人\s*\d+|@\S{1,20}|\S{1,16}))?\s*"
    r"(?P<sh>\d{1,2}):(?P<sm>\d{2}):(?P<ss>\d{2})"
    r"(?:\s*[-~–—]\s*(?P<eh>\d{1,2}):(?P<em>\d{2}):(?P<es>\d{2}))?\s*$"
)
# 行首时间戳(录音模式):[MM:SS] 或 [HH:MM:SS] + 同行正文
_TS_AT_START_RE = re.compile(r"^\s*\[(\d{1,2}):(\d{2})(?::(\d{2}))?\]\s*(.*)$")

# 表头校验门槛 —— 防把「会议时间 09:30:00」这类普通文本行误判成说话人表头
_MIN_HEADERS = 5
_MIN_DISTINCT_SPEAKERS = 2
_MIN_OCCURRENCES_PER_SPEAKER = 2

# LLM 归因:每窗行数 / 最大窗数
_ATTR_LINES_PER_WINDOW = 100
_ATTR_MAX_WINDOWS = 8


def _hms_to_seconds(h: str, m: str, s: str) -> int:
    return int(h) * 3600 + int(m) * 60 + int(s)


def _clean_speaker_label(label: str) -> str:
    return (label or "").strip().lstrip("@").strip()


def parse_speaker_segments(raw: str) -> list[dict] | None:
    """路径 A:确定性解析带真实说话人表头的转写。

    命中返回 `[{name, start, end|None}]`(按出现顺序),不命中返回 None。
    """
    lines = (raw or "").split("\n")
    turns: list[dict] = []
    for line in lines:
        m = _SPEAKER_HEADER_RE.match(line)
        if not m:
            continue
        name = _clean_speaker_label(m.group("name") or "") or UNKNOWN_SPEAKER
        start = _hms_to_seconds(m.group("sh"), m.group("sm"), m.group("ss"))
        end = None
        if m.group("eh") is not None:
            end = _hms_to_seconds(m.group("eh"), m.group("em"), m.group("es"))
        turns.append({"name": name, "start": start, "end": end})

    if len(turns) < _MIN_HEADERS:
        return None
    counts: dict[str, int] = {}
    for t in turns:
        counts[t["name"]] = counts.get(t["name"], 0) + 1
    if len(counts) < _MIN_DISTINCT_SPEAKERS:
        return None
    if any(c < _MIN_OCCURRENCES_PER_SPEAKER for c in counts.values()):
        return None
    return turns


def _aggregate_turns(turns: list[dict], total_seconds: float | None) -> dict:
    """把 `[{name, seconds}]` 形式的轮次汇总成 speakers + unknown。"""
    per: dict[str, dict] = {}
    unknown_seconds = 0.0
    for t in turns:
        secs = max(0.0, float(t["seconds"]))
        name = t["name"]
        if name == UNKNOWN_SPEAKER:
            unknown_seconds += secs
            continue
        row = per.setdefault(name, {"name": name, "seconds": 0.0, "turn_count": 0})
        row["seconds"] += secs
        row["turn_count"] += 1

    known = sum(r["seconds"] for r in per.values())
    denom = known + unknown_seconds
    speakers = sorted(per.values(), key=lambda r: -r["seconds"])
    for r in speakers:
        r["seconds"] = round(r["seconds"], 1)
        r["ratio"] = round(r["seconds"] / denom * 100, 1) if denom > 0 else 0.0

    return {
        "speakers": speakers,
        "unknown_seconds": round(unknown_seconds, 1),
        "total_seconds": round(denom, 1) if denom > 0 else (round(total_seconds or 0.0, 1)),
    }


def _durations_from_parsed_turns(turns: list[dict], total_seconds: float | None) -> dict:
    """路径 A 的时长计算:优先用表头自带的结束时间,否则用相邻表头差分。

    末轮无结束时间时按三级兜底:会议总时长 → 末轮起始 + 一个 ASR 切片 → 标 unknown。
    相邻表头间隔明显不合理(<0 或 > 300s)时按切片时长兜底,避免一次静音把某人时长算爆。
    """
    n = len(turns)
    out: list[dict] = []
    for i, t in enumerate(turns):
        start = t["start"]
        if t["end"] is not None:
            secs = t["end"] - start
        elif i + 1 < n:
            secs = turns[i + 1]["start"] - start
        else:
            # 末轮:用会议总时长收尾;拿不到就退一个切片,再拿不到就别硬算
            if total_seconds and total_seconds > start:
                secs = total_seconds - start
            else:
                secs = _ASR_CHUNK_SECONDS
        if secs <= 0 or secs > 300:
            secs = _ASR_CHUNK_SECONDS
        out.append({"name": t["name"], "seconds": secs})
    return _aggregate_turns(out, total_seconds)


def collect_speaker_candidates(
    minutes: dict | None,
    stakeholder_map: dict | None,
    requirement_speakers: list[str] | None = None,
    extra: list[str] | None = None,
) -> list[str]:
    """汇总候选发言人名单(去重,上限 20)。顺序即优先级:干系人 → 参会人 → 待办负责人 → 需求提出人。

    `meeting_minutes.attendees` 的形态是 `["客户方:张三、李四", "我方:王五"]` 这类**分组字符串**,
    需要拆开并剥掉分组前缀 —— 仓库没有现成 helper,这里自己处理。
    """
    seen: set[str] = set()
    out: list[str] = []

    def add(name: str) -> None:
        name = _clean_speaker_label(name)
        # 过滤空、「说话人 N」(匿名标签映射到真人姓名是纯猜测,不做)、以及明显的分组词
        if not name or len(name) > 20:
            return
        if re.fullmatch(r"说话人\s*\d+", name):
            return
        if name in ("我方", "客户方", "甲方", "乙方", "其他", "全体"):
            return
        if name in seen:
            return
        seen.add(name)
        out.append(name)

    smap = stakeholder_map if isinstance(stakeholder_map, dict) else {}
    for s in (smap.get("stakeholders") or []):
        if not isinstance(s, dict):
            continue
        add(str(s.get("name") or ""))
        for alias in (s.get("aliases") or []):
            add(str(alias or ""))

    mins = minutes if isinstance(minutes, dict) else {}
    attendees = mins.get("attendees")
    if isinstance(attendees, list):
        for a in attendees:
            for part in re.split(r"[、,，;；/|]", str(a or "")):
                # 剥掉「客户方:」这类分组前缀,只留人名
                add(re.sub(r"^[^:：]{0,8}[:：]", "", part))

    for it in (mins.get("action_items") or []):
        if isinstance(it, dict):
            add(str(it.get("owner") or ""))

    for name in (requirement_speakers or []):
        add(str(name or ""))

    for name in (extra or []):
        add(str(name or ""))

    return out[:20]


def _numbered_lines(raw: str) -> list[dict]:
    """把转写切成 `[{no, ts, text}]`。ts 为行首 [MM:SS] 解析出的秒数,无则继承上一行。"""
    out: list[dict] = []
    last_ts: int | None = None
    for raw_line in (raw or "").split("\n"):
        line = raw_line.strip()
        if not line:
            continue
        m = _TS_AT_START_RE.match(line)
        if m:
            ts = (
                _hms_to_seconds(m.group(1), m.group(2), m.group(3))
                if m.group(3) is not None
                else int(m.group(1)) * 60 + int(m.group(2))
            )
            last_ts = ts
            body = (m.group(4) or "").strip()
        else:
            ts = last_ts
            body = line
        out.append({"no": len(out) + 1, "ts": ts, "text": body})
    return out


def _line_windows(lines: list[dict]) -> list[list[dict]]:
    return [lines[i:i + _ATTR_LINES_PER_WINDOW] for i in range(0, len(lines), _ATTR_LINES_PER_WINDOW)]


async def _attribute_one_window(candidates: list[str], window: list[dict]) -> tuple[list[dict], str]:
    """单窗 LLM 归因。**行号用窗内局部编号**(1..len),由调用方做偏移 ——
    这样即使模型自己从 1 重编号,窗内语义依然自洽。"""
    from prompts.meeting import SPEAKER_ATTR_SYSTEM, SPEAKER_ATTR_USER
    from services.llm_json import loads_lenient

    body = "\n".join(
        f"{i} [{_fmt_clock(l['ts'])}] {l['text']}" if l["ts"] is not None else f"{i} {l['text']}"
        for i, l in enumerate(window, start=1)
    )
    messages = [
        {"role": "system", "content": SPEAKER_ATTR_SYSTEM},
        {
            "role": "user",
            "content": SPEAKER_ATTR_USER.format(
                candidates=" / ".join(candidates) if candidates else "(无候选名单)",
                transcript=body,
            ),
        },
    ]
    try:
        content, _model = await model_router.chat_with_routing(
            task="meeting_speaker_attribution",
            messages=messages,
            temperature=0.1,
            max_tokens=8000,
            validator=_json_output_valid,
            response_format={"type": "json_object"},
            extra_payload={"thinking": {"type": "disabled"}},
        )
    except Exception as e:
        logger.warning("speaker_window_failed", error=str(e)[:200], lines=len(window))
        return [], ""

    data = loads_lenient(content, None)
    if not isinstance(data, dict):
        logger.warning("speaker_window_bad_json", raw=(content or "")[:200])
        return [], ""
    segs = [s for s in (data.get("segments") or []) if isinstance(s, dict)]
    conf = str(data.get("confidence") or "").strip().lower()
    return segs, conf if conf in ("high", "medium", "low") else ""


def _fmt_clock(seconds: int | None) -> str:
    if seconds is None:
        return "--:--"
    h, rem = divmod(int(seconds), 3600)
    m, s = divmod(rem, 60)
    return f"{h:02d}:{m:02d}:{s:02d}"


def _resolve_owners(
    lines: list[dict],
    windows: list[list[dict]],
    results: list,
    candidates: list[str],
) -> tuple[list[str], str]:
    """把各窗返回的区间摊平成「逐行归属」数组。

    **Python 侧强制归一化**:候选名单外的名字一律改写为「无法判断」(模型编的人名不采信);
    越界/缺失/重叠的行一律补齐,保证每一行恰好属于一个说话人 ——
    这是「各说话人时长之和 + 无法判断 = 全场时长」的前提。
    """
    n = len(lines)
    owners: list[str | None] = [None] * n
    confidence = ""
    allowed = set(candidates)

    offset = 0
    for window, res in zip(windows, results):
        wlen = len(window)
        if isinstance(res, BaseException):
            offset += wlen
            continue
        segs, conf = res
        confidence = confidence or conf
        for s in segs:
            name = _clean_speaker_label(str(s.get("speaker") or ""))
            if name != UNKNOWN_SPEAKER and name not in allowed:
                # 模型输出了候选名单之外的人名 —— 不采信,落「无法判断」
                continue
            try:
                a = int(s.get("start_line"))
                b = int(s.get("end_line"))
            except (TypeError, ValueError):
                continue
            if a > b:
                a, b = b, a
            a = max(1, a)
            b = min(wlen, b)
            if b < 1 or a > wlen:
                continue
            # 先到先得:重叠区间不覆盖已有归属,避免模型返回交叠区间时把前面的人吃掉
            for i in range(a, b + 1):
                gi = offset + i - 1
                if owners[gi] is None:
                    owners[gi] = name
        offset += wlen

    return [o if o is not None else UNKNOWN_SPEAKER for o in owners], confidence


def _segments_from_owners(lines: list[dict], owners: list[str], total_seconds: float | None) -> list[dict]:
    """逐行归属 → 连续区间 → 各区间时长。

    区间时长 = 下一区间首行时间戳 − 本区间首行时间戳;末区间用会议总时长收尾。
    这样各区间首尾相接,总和不重不漏。
    """
    turns: list[dict] = []
    i = 0
    n = len(owners)
    while i < n:
        j = i
        while j + 1 < n and owners[j + 1] == owners[i]:
            j += 1
        line_count = j - i + 1
        start_ts = lines[i]["ts"]
        end_ts = lines[j + 1]["ts"] if j + 1 < n else None

        if start_ts is None:
            secs = _ASR_CHUNK_SECONDS * line_count
        elif end_ts is not None and end_ts > start_ts:
            secs = end_ts - start_ts
        elif total_seconds and total_seconds > start_ts:
            secs = total_seconds - start_ts
        else:
            secs = _ASR_CHUNK_SECONDS * line_count

        # 时间戳跨度明显不合理(为 0、负数、或超过 10 分钟)时按切片兜底,别让静音段算爆某人时长
        if secs <= 0 or secs > 600:
            secs = _ASR_CHUNK_SECONDS * line_count
        turns.append({"name": owners[i], "seconds": secs})
        i = j + 1
    return turns


async def extract_speaker_durations(
    raw: str,
    polished: str | None,
    total_seconds: float | None,
    candidates: list[str],
) -> dict:
    """参会人发言时长。**混合路径**:

    A. 转写里有真实说话人表头 → 精确解析(mode="parsed", confidence="high")
    B. 否则 → LLM 归因(mode="inferred"),长会议按行分窗并行

    没有声纹分离能力,路径 B 是**推断**不是识别;结果里必须如实带 mode/confidence,
    UI 必须标注出来。宁可标「无法判断」也不要猜。
    """
    raw = raw or ""
    polished = polished or ""

    # ── 路径 A ──
    for src_name, text in (("raw_transcript", raw), ("polished_transcript", polished)):
        turns = parse_speaker_segments(text) if text else None
        if turns:
            agg = _durations_from_parsed_turns(turns, total_seconds)
            logger.info("speaker_durations_parsed", source=src_name, turns=len(turns), speakers=len(agg["speakers"]))
            return {
                "source": "parsed",
                "mode": "parsed",
                "transcript_used": src_name,
                "confidence": "high",
                "coverage": 1.0,
                "candidates": [],
                "note": "转写自带说话人表头,时长为表头时间戳精确推算",
                "model": None,
                "generated_at": _now_iso(),
                **agg,
            }

    # ── 路径 B ──
    base = raw or polished
    if not base.strip():
        return _empty_speaker_stats("该会议没有可用的转写文本,无法计算发言时长")

    lines = _numbered_lines(base)
    if not lines or all(l["ts"] is None for l in lines):
        return _empty_speaker_stats("该转写没有时间标记(行首 [MM:SS]),无法计算发言时长")
    if not candidates:
        return _empty_speaker_stats("未识别到参会人或干系人,请先补充参会人名单后再生成")

    windows = _line_windows(lines)
    truncated = len(windows) > _ATTR_MAX_WINDOWS
    if truncated:
        windows = windows[:_ATTR_MAX_WINDOWS]

    results = await asyncio.gather(
        *[_attribute_one_window(candidates, w) for w in windows],
        return_exceptions=True,
    )

    owners, conf = _resolve_owners(lines, windows, results, candidates)
    covered = sum(1 for o in owners if o != UNKNOWN_SPEAKER)
    coverage = round(covered / len(owners), 3) if owners else 0.0
    turns = _segments_from_owners(lines, owners, total_seconds)
    agg = _aggregate_turns(turns, total_seconds)

    if not conf:
        conf = "high" if coverage >= 0.9 else ("medium" if coverage >= 0.7 else "low")

    note = "转写不带说话人信息,以上时长由 AI 依据对话内容推断,仅供参考"
    if truncated:
        note += f";转写过长,仅归因了前 {_ATTR_MAX_WINDOWS * _ATTR_LINES_PER_WINDOW} 行"
    if agg["unknown_seconds"] > 0:
        note += ";无法判断归属的发言已单列"

    logger.info(
        "speaker_durations_inferred",
        lines=len(lines), windows=len(windows), candidates=len(candidates),
        coverage=coverage, confidence=conf,
    )
    return {
        "source": "llm",
        "mode": "inferred",
        "transcript_used": "raw_transcript" if raw else "polished_transcript",
        "confidence": conf,
        "coverage": coverage,
        "candidates": candidates,
        "note": note,
        "model": None,
        "generated_at": _now_iso(),
        **agg,
    }


def _empty_speaker_stats(note: str) -> dict:
    return {
        "source": "none",
        "mode": "none",
        "transcript_used": None,
        "confidence": None,
        "coverage": 0.0,
        "candidates": [],
        "note": note,
        "model": None,
        "speakers": [],
        "unknown_seconds": 0.0,
        "total_seconds": 0.0,
        "generated_at": _now_iso(),
    }
