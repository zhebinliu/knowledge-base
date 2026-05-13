#!/usr/bin/env python3
"""演示视频 seed 脚本

在生产 kb.liii.in (或任意指定 base url) 上一键造出演示项目:
  1. 登录拿 JWT
  2. (可选) 删除已存在的同名演示项目
  3. 创建项目 "友发钢管 (Demo)"
  4. 上传 3 份样例 .md 文档 (SOW / 调研 / 方案)
  5. 轮询文档切片完成
  6. 触发 insight 生成
  7. 轮询 insight 完成
  8. 输出 project_id + bundle_id (供后续 Playwright 录屏脚本使用)

环境变量:
  KB_BASE_URL    默认 https://kb.liii.in
  KB_USERNAME    必填
  KB_PASSWORD    必填

用法:
  pip install requests
  KB_USERNAME=demo KB_PASSWORD='xxx' python seed-demo-project.py --dry-run
  KB_USERNAME=demo KB_PASSWORD='xxx' python seed-demo-project.py
  KB_USERNAME=demo KB_PASSWORD='xxx' python seed-demo-project.py --reuse  # 项目已存在则复用
  KB_USERNAME=demo KB_PASSWORD='xxx' python seed-demo-project.py --skip-insight  # 只造项目+文档不跑 insight
"""

from __future__ import annotations

import argparse
import json
import os
import sys
import time
from pathlib import Path

try:
    import requests
except ImportError:
    sys.stderr.write("缺少依赖, 请先: pip install requests\n")
    sys.exit(1)


PROJECT_NAME = "友发钢管 (Demo)"
PROJECT_CUSTOMER = "友发钢管股份有限公司"
PROJECT_INDUSTRY = "manufacturing"  # 智能制造行业 pack
PROJECT_DESCRIPTION = "演示视频专用项目, 焊接钢管制造企业 CRM 一期实施"

# 样例文档配置: (相对路径, doc_type)
SAMPLE_DOCS = [
    ("01-sow-立项书.md", "sow"),
    ("02-业务现状调研纪要.md", "requirement_research"),
    ("03-解决方案建议书.md", "presales_solution"),
]

# 轮询参数
DOC_POLL_INTERVAL = 5          # 秒
DOC_POLL_TIMEOUT = 600         # 10 分钟
INSIGHT_POLL_INTERVAL = 15     # 秒
INSIGHT_POLL_TIMEOUT = 60 * 60 # 1 小时上限


# ────────────────────────────────── CLI ──────────────────────────────────

def parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(description="演示视频 seed 脚本")
    p.add_argument("--dry-run", action="store_true",
                   help="只打印将要执行的步骤, 不发任何写请求")
    p.add_argument("--reuse", action="store_true",
                   help="项目已存在则复用, 不重建; 默认是先删再建")
    p.add_argument("--skip-insight", action="store_true",
                   help="只造项目 + 上传文档, 不跑 insight (省 LLM 配额)")
    p.add_argument("--base-url", default=os.environ.get("KB_BASE_URL", "https://kb.liii.in"))
    p.add_argument("--username", default=os.environ.get("KB_USERNAME"))
    p.add_argument("--password", default=os.environ.get("KB_PASSWORD"))
    p.add_argument("--wait-bundle", metavar="BUNDLE_ID",
                   help="跳过所有步骤, 只接续轮询指定 bundle_id 到完成 (用于网络中断后恢复)")
    args = p.parse_args()
    if not args.dry_run and (not args.username or not args.password):
        sys.stderr.write("必须设置 KB_USERNAME / KB_PASSWORD 环境变量, 或用 --dry-run\n")
        sys.exit(1)
    return args


# ───────────────────────────── 输出 helpers ─────────────────────────────

def step(msg: str) -> None:
    print(f"\n→ {msg}", flush=True)


def info(msg: str) -> None:
    print(f"  {msg}", flush=True)


def warn(msg: str) -> None:
    print(f"  ⚠ {msg}", flush=True)


def die(msg: str) -> None:
    sys.stderr.write(f"\n✗ {msg}\n")
    sys.exit(1)


# ───────────────────────────── API 客户端 ─────────────────────────────

class KBClient:
    def __init__(self, base_url: str, dry_run: bool):
        self.base_url = base_url.rstrip("/")
        self.dry_run = dry_run
        self.session = requests.Session()
        self.token: str | None = None

    def _url(self, path: str) -> str:
        return f"{self.base_url}{path}"

    def _headers(self) -> dict:
        return {"Authorization": f"Bearer {self.token}"} if self.token else {}

    def _request_with_retry(self, method: str, path: str, *, max_retries: int = 5, **kwargs):
        """对 SSL / Connection / Timeout 错误自动重试 (指数退避)"""
        last_exc = None
        for attempt in range(max_retries):
            try:
                return self.session.request(method, self._url(path), timeout=30, **kwargs)
            except (requests.exceptions.SSLError,
                    requests.exceptions.ConnectionError,
                    requests.exceptions.Timeout) as e:
                last_exc = e
                wait = min(2 ** attempt, 30)
                warn(f"{method} {path} 失败 ({type(e).__name__}), {wait}s 后重试 ({attempt+1}/{max_retries})")
                time.sleep(wait)
        raise last_exc  # type: ignore

    # —— auth —— #
    def login(self, username: str, password: str) -> None:
        if self.dry_run:
            info(f"[dry-run] POST /api/auth/login username={username}")
            self.token = "dry-run-token"
            return
        r = self.session.post(
            self._url("/api/auth/login"),
            json={"username": username, "password": password},
            timeout=30,
        )
        if r.status_code != 200:
            die(f"登录失败 {r.status_code}: {r.text[:200]}")
        self.token = r.json()["access_token"]
        info(f"登录成功, token = {self.token[:16]}...")

    # —— projects —— #
    def list_projects(self) -> list[dict]:
        if self.dry_run:
            info("[dry-run] GET /api/projects")
            return []
        r = self.session.get(
            self._url("/api/projects"),
            headers=self._headers(),
            params={"limit": 200},
            timeout=30,
        )
        if r.status_code != 200:
            die(f"列项目失败 {r.status_code}: {r.text[:200]}")
        body = r.json()
        # 兼容 {items: [...]} 或直接 [...]
        return body.get("items", body) if isinstance(body, dict) else body

    def delete_project(self, project_id: str) -> None:
        if self.dry_run:
            info(f"[dry-run] DELETE /api/projects/{project_id}")
            return
        r = self.session.delete(
            self._url(f"/api/projects/{project_id}"),
            headers=self._headers(),
            timeout=30,
        )
        if r.status_code not in (200, 204):
            warn(f"删除项目失败 {r.status_code}: {r.text[:200]} (忽略, 继续)")

    def create_project(self) -> str:
        body = {
            "name": PROJECT_NAME,
            "customer": PROJECT_CUSTOMER,
            "industry": PROJECT_INDUSTRY,
            "description": PROJECT_DESCRIPTION,
        }
        if self.dry_run:
            info(f"[dry-run] POST /api/projects body={json.dumps(body, ensure_ascii=False)}")
            return "dry-run-project-id"
        r = self.session.post(
            self._url("/api/projects"),
            headers=self._headers(),
            json=body,
            timeout=30,
        )
        if r.status_code != 201:
            die(f"创建项目失败 {r.status_code}: {r.text[:200]}")
        pid = r.json()["id"]
        info(f"项目已创建 id={pid}")
        return pid

    # —— documents —— #
    def upload_document(self, project_id: str, file_path: Path, doc_type: str) -> str:
        if self.dry_run:
            info(f"[dry-run] POST /api/documents/upload "
                 f"file={file_path.name} project_id={project_id} doc_type={doc_type}")
            return f"dry-run-doc-{file_path.stem}"
        with open(file_path, "rb") as f:
            r = self.session.post(
                self._url("/api/documents/upload"),
                headers=self._headers(),
                files={"file": (file_path.name, f, "text/markdown")},
                data={"project_id": project_id, "doc_type": doc_type},
                timeout=60,
            )
        if r.status_code != 200:
            die(f"上传 {file_path.name} 失败 {r.status_code}: {r.text[:200]}")
        doc_id = r.json()["id"]
        info(f"上传 {file_path.name} doc_id={doc_id}")
        return doc_id

    def get_doc_status(self, doc_id: str) -> dict:
        if self.dry_run:
            return {"id": doc_id, "conversion_status": "completed"}
        r = self._request_with_retry("GET", f"/api/documents/{doc_id}/status",
                                     headers=self._headers())
        if r.status_code != 200:
            die(f"查文档状态失败 {r.status_code}: {r.text[:200]}")
        return r.json()

    def wait_documents_ready(self, doc_ids: list[str]) -> None:
        deadline = time.time() + DOC_POLL_TIMEOUT
        pending = set(doc_ids)
        while pending and time.time() < deadline:
            done_this_round = set()
            for did in pending:
                s = self.get_doc_status(did)
                status = s.get("conversion_status") or s.get("status")
                if status == "completed":
                    info(f"  doc {did[:8]}.. 切片完成")
                    done_this_round.add(did)
                elif status == "failed":
                    warn(f"  doc {did[:8]}.. 切片失败: {s.get('error_message') or '未知'}")
                    done_this_round.add(did)  # 失败也不再等
            pending -= done_this_round
            if pending:
                info(f"  仍在切片: {len(pending)} / {len(doc_ids)} (等 {DOC_POLL_INTERVAL}s)")
                time.sleep(DOC_POLL_INTERVAL)
        if pending:
            die(f"切片超时, 未完成: {pending}")

    # —— outputs (insight) —— #
    def generate_insight(self, project_id: str) -> str:
        body = {"kind": "insight", "project_id": project_id}
        if self.dry_run:
            info(f"[dry-run] POST /api/outputs/generate body={json.dumps(body)}")
            return "dry-run-bundle-id"
        r = self.session.post(
            self._url("/api/outputs/generate"),
            headers=self._headers(),
            json=body,
            timeout=30,
        )
        if r.status_code != 202:
            die(f"触发 insight 失败 {r.status_code}: {r.text[:200]}")
        bid = r.json()["id"]
        info(f"insight 任务已入队 bundle_id={bid}")
        return bid

    def wait_bundle_done(self, bundle_id: str) -> dict:
        deadline = time.time() + INSIGHT_POLL_TIMEOUT
        last_status = None
        while time.time() < deadline:
            if self.dry_run:
                info("[dry-run] 跳过 insight 轮询")
                return {"id": bundle_id, "status": "done"}
            try:
                r = self._request_with_retry("GET", f"/api/outputs/{bundle_id}",
                                             headers=self._headers())
            except Exception as e:
                warn(f"查 bundle 异常 {type(e).__name__}, 继续轮询: {e}")
                time.sleep(INSIGHT_POLL_INTERVAL)
                continue
            if r.status_code != 200:
                warn(f"查 bundle 失败 {r.status_code}, 继续轮询")
                time.sleep(INSIGHT_POLL_INTERVAL)
                continue
            data = r.json()
            status = data.get("status")
            if status != last_status:
                info(f"  bundle 状态: {status}")
                last_status = status
            if status == "done":
                return data
            if status == "failed":
                die(f"insight 生成失败: {data.get('error') or '未知'}")
            time.sleep(INSIGHT_POLL_INTERVAL)
        die("insight 生成超时 (1 小时)")
        return {}  # unreachable


# ────────────────────────────────── 主流程 ──────────────────────────────────

def find_existing_project(client: KBClient) -> str | None:
    projs = client.list_projects()
    for p in projs:
        if p.get("name") == PROJECT_NAME:
            return p.get("id")
    return None


def main() -> int:
    args = parse_args()
    sample_dir = Path(__file__).parent / "sample-docs"
    for fname, _ in SAMPLE_DOCS:
        if not (sample_dir / fname).exists():
            die(f"样例文档缺失: {sample_dir / fname}")

    print(f"\n=== KB System 演示项目 seed ===")
    print(f"  base_url   = {args.base_url}")
    print(f"  username   = {args.username or '(dry-run)'}")
    print(f"  dry_run    = {args.dry_run}")
    print(f"  reuse      = {args.reuse}")
    print(f"  skip_insight = {args.skip_insight}")
    if args.wait_bundle:
        print(f"  wait_bundle = {args.wait_bundle}")
    print(f"  sample_dir = {sample_dir}")

    client = KBClient(args.base_url, args.dry_run)

    step("1/6 登录")
    client.login(args.username or "", args.password or "")

    # —— 恢复模式: 跳过所有创建步骤, 只接续轮询已知 bundle ——
    if args.wait_bundle:
        step(f"接续轮询 bundle {args.wait_bundle}")
        result = client.wait_bundle_done(args.wait_bundle)
        print(f"\n✓ 完成")
        print(f"  bundle_id = {result.get('id')}")
        print(f"  project_id = {result.get('project_id')}")
        print(f"  status     = {result.get('status')}")
        return 0

    step("2/6 检查并准备项目")
    existing_id = find_existing_project(client)
    if existing_id and args.reuse:
        info(f"复用已有项目 id={existing_id}")
        project_id = existing_id
        skip_upload = True
    else:
        if existing_id:
            info(f"已存在同名项目 id={existing_id}, 先删除")
            client.delete_project(existing_id)
        project_id = client.create_project()
        skip_upload = False

    if not skip_upload:
        step("3/6 上传 3 份样例文档")
        doc_ids = []
        for fname, doc_type in SAMPLE_DOCS:
            did = client.upload_document(project_id, sample_dir / fname, doc_type)
            doc_ids.append(did)

        step("4/6 等待文档切片完成 (预计 30s - 2min)")
        client.wait_documents_ready(doc_ids)
    else:
        step("3-4/6 跳过 (复用模式)")

    if args.skip_insight:
        step("5-6/6 跳过 insight 生成 (--skip-insight)")
        bundle_id = None
    else:
        step("5/6 触发 insight 生成")
        bundle_id = client.generate_insight(project_id)

        step("6/6 等待 insight 完成 (预计 2-5 min)")
        client.wait_bundle_done(bundle_id)

    print(f"\n✓ 完成")
    print(f"  project_id = {project_id}")
    if bundle_id:
        print(f"  bundle_id  = {bundle_id}")
    print(f"\n下一步: 把上述 id 写入 scripts/demo-video/lib/auth.ts 供录屏使用")
    return 0


if __name__ == "__main__":
    sys.exit(main())
