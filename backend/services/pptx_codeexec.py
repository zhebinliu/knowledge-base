"""沙箱执行 LLM 输出的 python-pptx 代码，返回 .pptx 文件字节。

约定：
- 模型输出的 Python 代码必须在 cwd 下生成 `out.pptx`
- 代码在临时目录中以子进程执行，env 裁剪掉所有密钥（仅保留 PATH/HOME/LANG）
- 超时强杀，临时目录无论成败都清理
- stdout/stderr 写到临时文件，便于排错
"""
from __future__ import annotations

import asyncio
import os
import shutil
import tempfile
from pathlib import Path

import structlog

logger = structlog.get_logger()


class PPTXCodeExecError(RuntimeError):
    def __init__(self, message: str, stdout: str = "", stderr: str = "", returncode: int | None = None):
        super().__init__(message)
        self.stdout = stdout
        self.stderr = stderr
        self.returncode = returncode


async def execute_pptx_code(code: str, timeout: float = 180.0) -> bytes:
    """在隔离子进程里执行 python-pptx 代码，返回 out.pptx 字节内容。

    raises PPTXCodeExecError 当代码执行失败 / 超时 / 未生成文件。
    """
    tmpdir = tempfile.mkdtemp(prefix="pptxgen_")
    try:
        script_path = Path(tmpdir) / "gen.py"
        script_path.write_text(code, encoding="utf-8")

        # 关键：env 只保留无敏感信息的最小子集，避免代码读到 DATABASE_URL / API key
        clean_env = {
            "PATH": os.environ.get("PATH", "/usr/local/bin:/usr/bin:/bin"),
            "HOME": tmpdir,
            "LANG": os.environ.get("LANG", "C.UTF-8"),
            "LC_ALL": os.environ.get("LC_ALL", "C.UTF-8"),
            "PYTHONUNBUFFERED": "1",
            "MPLBACKEND": "Agg",  # matplotlib 无 GUI
            "MPLCONFIGDIR": tmpdir,
        }

        proc = await asyncio.create_subprocess_exec(
            "python", str(script_path),
            cwd=tmpdir,
            env=clean_env,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )

        try:
            stdout_b, stderr_b = await asyncio.wait_for(proc.communicate(), timeout=timeout)
        except asyncio.TimeoutError:
            proc.kill()
            await proc.wait()
            raise PPTXCodeExecError(f"pptx code exec timed out after {timeout}s")

        stdout = (stdout_b or b"").decode("utf-8", errors="replace")
        stderr = (stderr_b or b"").decode("utf-8", errors="replace")

        if proc.returncode != 0:
            raise PPTXCodeExecError(
                f"pptx code exec failed (rc={proc.returncode})",
                stdout=stdout, stderr=stderr, returncode=proc.returncode,
            )

        out_path = Path(tmpdir) / "out.pptx"
        if not out_path.exists():
            raise PPTXCodeExecError(
                "pptx code did not produce out.pptx",
                stdout=stdout, stderr=stderr, returncode=proc.returncode,
            )

        data = out_path.read_bytes()
        if len(data) < 1024:
            raise PPTXCodeExecError(
                f"out.pptx too small ({len(data)} bytes), likely broken",
                stdout=stdout, stderr=stderr, returncode=proc.returncode,
            )

        logger.info("pptx_code_exec_ok", size=len(data), stdout_len=len(stdout), stderr_len=len(stderr))
        return data
    finally:
        shutil.rmtree(tmpdir, ignore_errors=True)


def strip_python_fences(raw: str) -> str:
    """剥掉模型可能输出的 ```python / ``` 围栏，返回纯代码。"""
    s = (raw or "").strip()
    if s.startswith("```"):
        first_nl = s.find("\n")
        if first_nl >= 0:
            s = s[first_nl + 1:]
        if s.endswith("```"):
            s = s[:-3]
    return s.strip()
