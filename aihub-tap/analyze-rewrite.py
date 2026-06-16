#!/usr/bin/env python3
"""
aihub-tap rewrite analyzer — Level 0 dry-run

扫 /opt/aihub-tap/logs/tap.jsonl,按 client_ip 维护最近 N 次 system 内容,
对每条 Claude 请求算最长公共前缀(LCP),找最近的 \\n## / \\n### / \\n``` 等
markdown 边界作为建议切点。写到 rewrite-suggestions.jsonl 给人看。

**不修改任何实际请求**。可以放心 cron。

用法:
    python3 analyze-rewrite.py              # 走默认路径
    python3 analyze-rewrite.py --tail 1000  # 只看最近 1000 条
"""

import argparse
import json
import os
import sys
from collections import defaultdict, deque

TAP_LOG = "/opt/aihub-tap/logs/tap.jsonl"
SUGGESTIONS_OUT = "/opt/aihub-tap/logs/rewrite-suggestions.jsonl"

# 调参区
HISTORY_PER_CLIENT = 10   # 每个 client 跟过去 N 次 system 比 LCP
MIN_LCP_CHARS = 5000       # 公共前缀至少 5K 字符 (~2K tokens) 才值得提
MIN_SPLIT_OFFSET = 1000    # 切点至少在 1K 字符之后

# 估算用单价
SONNET_INPUT_USD_PER_1M = 3.0
CACHE_HIT_DISCOUNT = 0.1   # cached 价格 = 标准 × 0.1


def longest_common_prefix(a: str, b: str) -> int:
    n = min(len(a), len(b))
    for i in range(n):
        if a[i] != b[i]:
            return i
    return n


def find_clean_boundary(text: str, near: int) -> int:
    """从 near 位置往回找 \\n## / \\n### / \\n``` 边界,返回切点 offset。
    找不到 markdown 标题就 fall back 到最近 \\n。"""
    if near > len(text):
        near = len(text)
    min_pos = max(0, near - 2000)

    # 1) 优先找 \n## (含 ###)
    for i in range(near, min_pos, -1):
        if i + 3 < len(text) and text[i] == '\n' and text[i+1:i+3] == '##':
            return i + 1
    # 2) fall back 到任意 \n
    for i in range(near, min_pos, -1):
        if i < len(text) and text[i] == '\n':
            return i + 1
    return 0


def extract_system_text(req: dict):
    """提取 system 第一个 block 的 text。如果 system 已经是多 block(说明她已改造)就跳过。"""
    s = req.get('system')
    if not s:
        return None
    if isinstance(s, list):
        if len(s) > 1:
            return None  # 已经多块了,不需要建议
        if not s:
            return None
        first = s[0]
        if not isinstance(first, dict):
            return None
        return first.get('text', '')
    if isinstance(s, str):
        return s
    return None


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--tap', default=TAP_LOG)
    ap.add_argument('--out', default=SUGGESTIONS_OUT)
    ap.add_argument('--tail', type=int, default=0,
                    help='只看 tap.jsonl 最近 N 条(0=全部)')
    args = ap.parse_args()

    client_history = defaultdict(lambda: deque(maxlen=HISTORY_PER_CLIENT))
    suggestions = []
    stats = {
        'total_claude': 0,
        'skip_multi_block': 0,
        'skip_short_sys': 0,
        'skip_no_lcp': 0,
        'skip_small_split': 0,
    }

    # 读 tap.jsonl
    if args.tail > 0:
        # 只读最后 N 行
        with open(args.tap, 'rb') as f:
            f.seek(0, 2)
            size = f.tell()
            # 估算每行 50KB 上限,往回读
            chunk = min(size, args.tail * 80_000)
            f.seek(size - chunk)
            lines = f.read().decode('utf-8', errors='replace').splitlines()[-args.tail:]
    else:
        with open(args.tap) as f:
            lines = f.readlines()

    for line in lines:
        try:
            d = json.loads(line)
        except Exception:
            continue
        if d.get('status') != 200:
            continue
        try:
            req = json.loads(d.get('req_body', ''))
        except Exception:
            continue
        model = req.get('model', '')
        if not model.startswith('claude'):
            continue

        stats['total_claude'] += 1
        sys_text = extract_system_text(req)
        if sys_text is None:
            stats['skip_multi_block'] += 1
            continue
        if len(sys_text) < MIN_LCP_CHARS:
            stats['skip_short_sys'] += 1
            continue

        client_ip = d.get('client_ip', 'unknown')
        # 跟历史比 LCP
        best_lcp = 0
        for prev in client_history[client_ip]:
            lcp = longest_common_prefix(sys_text, prev)
            if lcp > best_lcp:
                best_lcp = lcp
        # 当前 system 入历史
        client_history[client_ip].append(sys_text)

        if best_lcp < MIN_LCP_CHARS:
            stats['skip_no_lcp'] += 1
            continue

        split_at = find_clean_boundary(sys_text, best_lcp)
        if split_at < MIN_SPLIT_OFFSET:
            stats['skip_small_split'] += 1
            continue

        # 估算可缓存 tokens (中文 ~2 字符/token)
        est_cacheable_tokens = split_at // 2
        suggestions.append({
            'ts': d['ts'],
            'client_ip': client_ip,
            'model': model,
            'system_full_chars': len(sys_text),
            'best_lcp_chars': best_lcp,
            'proposed_split_at': split_at,
            'est_cacheable_tokens': est_cacheable_tokens,
            'history_size': len(client_history[client_ip]),
            'prefix_first_60': sys_text[:60],
            'split_context': sys_text[max(0, split_at-40):split_at+40].replace('\n', '\\n'),
        })

    # 写 suggestions 文件
    with open(args.out, 'w') as f:
        for s in suggestions:
            f.write(json.dumps(s, ensure_ascii=False) + '\n')

    # ===== 报告 =====
    print('==== aihub-tap rewrite dry-run ====')
    print(f'输入: {args.tap}')
    print(f'输出: {args.out}')
    print()
    print(f'总 Claude 200 请求: {stats["total_claude"]}')
    print(f'  跳过 - 已经多块 system: {stats["skip_multi_block"]}')
    print(f'  跳过 - system < {MIN_LCP_CHARS} 字符: {stats["skip_short_sys"]}')
    print(f'  跳过 - LCP < {MIN_LCP_CHARS}(无稳定前缀): {stats["skip_no_lcp"]}')
    print(f'  跳过 - 切点 < {MIN_SPLIT_OFFSET}: {stats["skip_small_split"]}')
    print(f'  ✓ 生成 split 建议: {len(suggestions)}')
    print()

    if not suggestions:
        return

    # 按客户端聚合
    by_client = defaultdict(list)
    for s in suggestions:
        by_client[s['client_ip']].append(s)

    print('按客户端汇总:')
    print(f'  {"IP":18} {"建议数":>6} {"累计可缓存 tokens":>20} {"估算最大可省 USD":>16}')
    for ip, ss in sorted(by_client.items(), key=lambda x: -len(x[1])):
        total_tok = sum(s['est_cacheable_tokens'] for s in ss)
        full_cost = total_tok * SONNET_INPUT_USD_PER_1M / 1_000_000
        cache_cost = full_cost * CACHE_HIT_DISCOUNT
        save = full_cost - cache_cost
        print(f'  {ip:18} {len(ss):>6} {total_tok:>20,} {save:>15.3f}')

    print()
    total_save_tokens = sum(s['est_cacheable_tokens'] for s in suggestions)
    full_cost = total_save_tokens * SONNET_INPUT_USD_PER_1M / 1_000_000
    cache_cost = full_cost * CACHE_HIT_DISCOUNT
    print(f'总估算最大可省 (按 Sonnet $3/M, cache 命中省 90%):')
    print(f'  当前付费(等价): ${full_cost:.3f}')
    print(f'  改写后(全命中): ${cache_cost:.3f}')
    print(f'  最大可省: ${full_cost - cache_cost:.3f}')
    print()
    print('前 3 条建议示例(完整内容看 rewrite-suggestions.jsonl):')
    for s in suggestions[:3]:
        print(f'  [{s["ts"][:19]}] ip={s["client_ip"]}')
        print(f'    system {s["system_full_chars"]} 字符  LCP {s["best_lcp_chars"]}  建议切于 {s["proposed_split_at"]}')
        print(f'    切点上下文: ...{s["split_context"]}...')


if __name__ == '__main__':
    main()
