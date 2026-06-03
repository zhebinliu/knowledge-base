"""会议纪要 AI pipeline 服务层。

源自 meeting-ai 项目 services/ai/ 的合并(2026-05-11)。
对外暴露 5 个 stage:polish / minutes / requirements / process_flows / stakeholders。
"""
from services.meeting.pipeline import (
    polish_transcript,
    generate_minutes,
    extract_requirements,
    extract_process_flows,
    extract_stakeholders,
    run_full_pipeline,
)

__all__ = [
    "polish_transcript",
    "generate_minutes",
    "extract_requirements",
    "extract_process_flows",
    "extract_stakeholders",
    "run_full_pipeline",
]
