/**
 * 录屏脚本登录 helper
 *
 * 现代流程: 用 Node 内置 fetch 直接调 /api/auth/login 拿 token, 通过 context.addInitScript
 * 在每个 page navigation 之前注入 localStorage, 录屏完全跳过 /login 画面。
 *
 * 用法 (推荐):
 *   const { loginViaApi, setTokenContext } = require('./auth');
 *   const token = await loginViaApi({ baseUrl, username, password });
 *   await setTokenContext(context, token);
 *   const page = await context.newPage();
 *   await page.goto(baseUrl + '/console/projects/...');  // 直接进去, 不出现 /login
 *
 * 用法 (旧, 已弃用): login(page, opts) — 会走 page.goto('/login') + UI 注入, 出现登录画面
 */

/**
 * @param {import('playwright').Page} page
 * @param {{ baseUrl: string, username: string, password: string }} opts
 * @returns {Promise<string>} access_token
 */
async function login(page, { baseUrl, username, password }) {
  // 必须先 navigate 到同源页面, localStorage 才能写入到正确 origin
  await page.goto(baseUrl + '/login', { waitUntil: 'domcontentloaded', timeout: 30000 });

  const resp = await page.evaluate(async ({ baseUrl, username, password }) => {
    const r = await fetch(baseUrl + '/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    });
    return { status: r.status, body: await r.text() };
  }, { baseUrl, username, password });

  if (resp.status !== 200) {
    throw new Error(`登录失败 ${resp.status}: ${resp.body.slice(0, 200)}`);
  }

  const data = JSON.parse(resp.body);
  const token = data.access_token || data.token;
  if (!token) throw new Error('登录返回缺少 access_token: ' + resp.body.slice(0, 200));

  await page.evaluate((t) => localStorage.setItem('kb_access_token', t), token);

  // 验证 token 真的被 AuthContext 接受了 (fetchMe 偶发失败会清掉 token + 重定向 /login)
  for (let attempt = 0; attempt < 3; attempt++) {
    await page.goto(baseUrl + '/', { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(1500);
    const url = page.url();
    if (!url.includes('/login')) return token;
    // 被踢回登录页 — 重新注入 token 再试一次
    console.warn(`  ⚠ 登录后被踢回 /login (attempt ${attempt + 1}/3), 重新注入 token`);
    await page.evaluate((t) => localStorage.setItem('kb_access_token', t), token);
  }
  throw new Error('登录注入失败: 三次尝试后仍被踢回 /login');
}

/**
 * 在 context 级别注入 token, 后续 page 自动登录
 * @param {import('playwright').BrowserContext} context
 * @param {string} token
 */
async function injectTokenIntoContext(context, token) {
  await context.addInitScript((t) => {
    try { localStorage.setItem('kb_access_token', t); } catch (_) {}
  }, token);
}
const setTokenContext = injectTokenIntoContext;  // 别名

/**
 * 用 Node fetch 直接调 /api/auth/login 拿 token. 不依赖 Playwright page, 录屏看不到登录画面。
 * 含 SSL 抖动重试。
 *
 * @param {{ baseUrl: string, username: string, password: string }} opts
 * @returns {Promise<string>} access_token
 */
async function loginViaApi({ baseUrl, username, password }, maxRetries = 4) {
  let lastErr;
  for (let i = 0; i < maxRetries; i++) {
    try {
      const r = await fetch(baseUrl + '/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });
      if (!r.ok) {
        const body = await r.text().catch(() => '');
        throw new Error(`HTTP ${r.status}: ${body.slice(0, 200)}`);
      }
      const data = await r.json();
      const token = data.access_token || data.token;
      if (!token) throw new Error('登录 response 缺少 access_token');
      return token;
    } catch (e) {
      lastErr = e;
      const msg = e.message || '';
      if (!/EOF|ECONN|ETIMEDOUT|SSL|fetch failed|HTTP 5/i.test(msg) && i > 0) throw e;
      console.warn(`  ⚠ loginViaApi 失败 (${msg.slice(0, 60)}), 重试 ${i + 1}/${maxRetries}`);
      await new Promise((res) => setTimeout(res, 2000 * (i + 1)));
    }
  }
  throw lastErr;
}

module.exports = { login, injectTokenIntoContext, setTokenContext, loginViaApi };
