/**
 * 共享录屏 helper: 启 browser + context (1920x1080, 注入光标), 跑 sceneFn, 出 webm。
 * 每个 scene 用独立 context, 便于单段重录。
 */

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const { installCursor } = require('./cursor');
const { login, loginViaApi, setTokenContext } = require('./auth');
const Narration = require('./narration');
const config = require('../config');

/**
 * 跑一个 scene 录成 webm
 *
 * @param {object} opts
 * @param {string} opts.sceneId   e.g. "01-intro"
 * @param {function(import('playwright').Page, Narration, object)} opts.sceneFn  实际场景
 * @param {boolean} [opts.requireLogin=false]
 * @returns {Promise<string>}  最终 webm 路径
 */
async function recordScene({ sceneId, sceneFn, requireLogin = false }) {
  fs.mkdirSync(config.outputDir, { recursive: true });
  const t0 = Date.now();
  console.log(`\n=== scene ${sceneId} 开始 ===`);

  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
  const context = await browser.newContext({
    viewport: config.viewport,
    deviceScaleFactor: 1,
    ignoreHTTPSErrors: true,
    recordVideo: { dir: config.outputDir, size: config.viewport },
  });
  await installCursor(context);

  // requireLogin 走"API 拿 token + addInitScript 注入"模式 — 录屏不出现 /login 画面
  if (requireLogin) {
    try {
      const token = await loginViaApi({
        baseUrl: config.baseUrl,
        username: config.username,
        password: config.password,
      });
      await setTokenContext(context, token);
      console.log('  ✓ token 已通过 API 获取并注入 context');
    } catch (e) {
      console.warn('  ⚠ API 登录失败, scene 可能看到 /login:', e.message);
    }
  }

  const page = await context.newPage();
  page.on('console', (msg) => {
    if (msg.text().startsWith('[cursor]')) console.log('  PAGE>', msg.text());
  });

  // monkey-patch page.goto: 给所有 navigation 加 SSL 抖动重试
  const _goto = page.goto.bind(page);
  page.goto = async function gotoWithRetry(url, opts = {}, maxRetries = 4) {
    let lastErr;
    for (let i = 0; i < maxRetries; i++) {
      try {
        return await _goto(url, { waitUntil: 'networkidle', timeout: 30000, ...opts });
      } catch (e) {
        lastErr = e;
        const msg = e.message || '';
        // 只对网络抖动重试 (SSL/connection-closed/timeout), 其他错误立刻抛
        if (!/ERR_CONNECTION_CLOSED|ERR_SOCKET_NOT_CONNECTED|ERR_NETWORK_CHANGED|net::ERR_|Timeout/i.test(msg)) {
          throw e;
        }
        console.warn(`  ⚠ goto ${url.slice(0, 80)} 失败 (${msg.slice(0, 60)}), 重试 ${i + 1}/${maxRetries}`);
        await page.waitForTimeout(2000 * (i + 1));
      }
    }
    throw lastErr;
  };

  // 旧的 page-level login() 流程已废弃 (会出现 /login 画面), 改由上面的 setTokenContext 注入

  const narration = new Narration(sceneId);

  let err;
  try {
    await sceneFn(page, narration, { context, config });
  } catch (e) {
    err = e;
    console.error(`  ✗ scene ${sceneId} 异常:`, e.message);
  }

  // 必须 close context 才能 flush 视频
  await context.close();
  await browser.close();

  // 重命名 video 为 scene-XX.webm
  // 用 "本 scene 启动后 mtime 最新 + 文件非空" 选最新的 Playwright video
  const candidates = fs.readdirSync(config.outputDir)
    .filter((f) => f.endsWith('.webm') && f !== `scene-${sceneId}.webm`)
    .map((f) => {
      const p = path.join(config.outputDir, f);
      const st = fs.statSync(p);
      return { name: f, path: p, mtime: st.mtimeMs, size: st.size };
    })
    .filter((x) => x.size > 0 && x.mtime >= t0)
    .sort((a, b) => b.mtime - a.mtime);
  if (candidates.length > 0) {
    const src = candidates[0].path;
    const dst = path.join(config.outputDir, `scene-${sceneId}.webm`);
    if (fs.existsSync(dst)) fs.unlinkSync(dst);
    fs.renameSync(src, dst);
    console.log(`  ✓ ${dst} 已生成 (${(fs.statSync(dst).size / 1024 / 1024).toFixed(1)} MB)`);
  } else {
    console.warn(`  ⚠ 没找到本场录制的 webm (本 scene 后无新文件)`);
  }

  narration.save(path.join(config.outputDir, 'markers.json'));
  console.log(`  scene ${sceneId} 完成 用时 ${((Date.now() - t0) / 1000).toFixed(1)}s\n`);
  if (err) throw err;

  return path.join(config.outputDir, `scene-${sceneId}.webm`);
}

/** 平稳滚动到指定像素 (替代 jumpy 的 page.evaluate(scrollTo)) */
async function smoothScrollTo(page, y, durationMs = 1500) {
  await page.evaluate(async ({ y, dur }) => {
    const start = window.scrollY;
    const delta = y - start;
    const t0 = performance.now();
    return new Promise((resolve) => {
      function step(now) {
        const t = Math.min(1, (now - t0) / dur);
        const eased = 0.5 - 0.5 * Math.cos(Math.PI * t);
        window.scrollTo(0, start + delta * eased);
        if (t < 1) requestAnimationFrame(step);
        else resolve();
      }
      requestAnimationFrame(step);
    });
  }, { y, dur: durationMs });
}

/** 注入一个 fixed 全屏黑底, 用于场景之间的 fade 转场 (录屏时挂半秒再 unmount) */
async function fadeBlack(page, holdMs = 500) {
  await page.evaluate((hold) => {
    const div = document.createElement('div');
    div.id = '__fade-overlay';
    Object.assign(div.style, {
      position: 'fixed', inset: '0', background: '#000',
      opacity: '0', transition: 'opacity 0.4s ease',
      zIndex: '2147483646', pointerEvents: 'none',
    });
    document.documentElement.appendChild(div);
    requestAnimationFrame(() => { div.style.opacity = '1'; });
    return new Promise((r) => setTimeout(r, hold));
  }, holdMs);
}

async function fadeFromBlack(page) {
  await page.evaluate(() => {
    const div = document.getElementById('__fade-overlay');
    if (!div) return;
    div.style.opacity = '0';
    setTimeout(() => div.remove(), 500);
  });
  await page.waitForTimeout(500);
}

module.exports = { recordScene, smoothScrollTo, fadeBlack, fadeFromBlack };
