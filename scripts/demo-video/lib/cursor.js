/**
 * 伪光标: Playwright headless 模式默认不渲染鼠标光标, 录屏看不出在点哪里。
 * 通过 page.addInitScript 注入一个固定定位的黄点 + 点击波纹动画。
 *
 * 用法:
 *   const { installCursor, moveTo, clickAt } = require('./cursor');
 *   await installCursor(context);     // 一次注入, 后续 navigation 自动保留
 *   await moveTo(page, 800, 400);     // 平滑移动到 (800, 400)
 *   await clickAt(page, 800, 400);    // 移动 + 点击 + 波纹
 */

const CURSOR_SCRIPT = `
(() => {
  // addInitScript 在 document_start 之前注入, documentElement / body 可能还没就绪
  // 所以包一层 ready 检查
  function install() {
    try {
  if (window.__demoCursor) return;
  if (!document.documentElement) { return; }
  const cur = document.createElement('div');
  cur.id = '__demo-cursor';
  Object.assign(cur.style, {
    position: 'fixed',
    left: '-100px',
    top: '-100px',
    width: '20px',
    height: '20px',
    borderRadius: '50%',
    background: 'rgba(255, 200, 0, 0.9)',
    border: '2px solid rgba(255, 140, 0, 0.95)',
    boxShadow: '0 0 10px rgba(255, 200, 0, 0.6)',
    pointerEvents: 'none',
    zIndex: '2147483647',
    transition: 'left 0.6s cubic-bezier(.22,.61,.36,1), top 0.6s cubic-bezier(.22,.61,.36,1)',
    transform: 'translate(-50%, -50%)',
  });
  document.documentElement.appendChild(cur);

  // 波纹动画 keyframes
  const style = document.createElement('style');
  style.textContent = \`
    @keyframes __demo-ripple {
      0%   { transform: translate(-50%, -50%) scale(0.4); opacity: 0.9; }
      100% { transform: translate(-50%, -50%) scale(3);   opacity: 0; }
    }
    .__demo-ripple {
      position: fixed;
      width: 40px;
      height: 40px;
      border-radius: 50%;
      background: rgba(255, 200, 0, 0.55);
      pointer-events: none;
      z-index: 2147483646;
      animation: __demo-ripple 0.65s ease-out forwards;
    }
  \`;
  document.documentElement.appendChild(style);

  window.__demoCursor = {
    move(x, y) {
      cur.style.left = x + 'px';
      cur.style.top  = y + 'px';
    },
    ripple(x, y) {
      const r = document.createElement('div');
      r.className = '__demo-ripple';
      r.style.left = (x - 20) + 'px';
      r.style.top  = (y - 20) + 'px';
      document.documentElement.appendChild(r);
      setTimeout(() => r.remove(), 700);
    },
  };
    } catch (e) {
      console.log('[cursor] error:', e.message);
    }
  }
  // 兜底: 多个时机都尝试 install
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', install, { once: true });
  } else if (document.documentElement) {
    install();
  } else {
    // 极早期 — 等下一个 tick
    setTimeout(install, 0);
  }
})();
`;

/**
 * 注入伪光标到 context 的所有页面 (含 navigate 后的新文档)
 * @param {import('playwright').BrowserContext} context
 */
async function installCursor(context) {
  await context.addInitScript(CURSOR_SCRIPT);
}

/**
 * 平滑移动光标到 (x, y), 等过渡动画走完
 * @param {import('playwright').Page} page
 * @param {number} x
 * @param {number} y
 * @param {number} settle 过渡毫秒数 (CSS transition 是 600ms, 给点余量)
 */
async function moveTo(page, x, y, settle = 700) {
  await page.evaluate(({ x, y }) => {
    if (window.__demoCursor) window.__demoCursor.move(x, y);
  }, { x, y });
  // 同时驱动真实鼠标位置 (hover 效果靠这个)
  await page.mouse.move(x, y, { steps: 10 });
  await page.waitForTimeout(settle);
}

/**
 * 移动到 (x, y) → 触发波纹 → 真实点击
 * @param {import('playwright').Page} page
 * @param {number} x
 * @param {number} y
 */
async function clickAt(page, x, y) {
  await moveTo(page, x, y);
  await page.evaluate(({ x, y }) => {
    if (window.__demoCursor) window.__demoCursor.ripple(x, y);
  }, { x, y });
  await page.waitForTimeout(150);  // 让波纹起头先于点击
  await page.mouse.click(x, y);
  await page.waitForTimeout(300);
}

/**
 * 移动到 selector 中心 (用于不知道精确坐标的场景)
 * @param {import('playwright').Page} page
 * @param {string} selector
 */
async function moveToSelector(page, selector) {
  const box = await page.locator(selector).first().boundingBox();
  if (!box) throw new Error(`selector 找不到: ${selector}`);
  await moveTo(page, box.x + box.width / 2, box.y + box.height / 2);
}

/**
 * 点击 selector 中心
 * @param {import('playwright').Page} page
 * @param {string} selector
 */
async function clickSelector(page, selector) {
  const box = await page.locator(selector).first().boundingBox();
  if (!box) throw new Error(`selector 找不到: ${selector}`);
  await clickAt(page, box.x + box.width / 2, box.y + box.height / 2);
}

module.exports = { installCursor, moveTo, clickAt, moveToSelector, clickSelector };
