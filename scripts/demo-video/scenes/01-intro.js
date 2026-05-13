/**
 * Scene 01 开场 (0:00 - 3:00, 约 180s)
 *
 * 画面: /demo 公开页 Hero → 痛点 → Pipeline → Architecture → 几张截图拼图。
 * 不需要登录。
 */

const { smoothScrollTo } = require('../lib/render');
const { moveTo } = require('../lib/cursor');

async function run(page, n, { config }) {
  // 1. 黑底标题卡 (用 setContent 注入一个临时全屏覆盖)
  n.mark('title-card');
  await page.setContent(`<!doctype html><html><head><meta charset="utf-8"><style>
    html,body{margin:0;height:100%;background:#0b1220;color:#fff;font-family:-apple-system,sans-serif;
              display:flex;align-items:center;justify-content:center;}
    .t{text-align:center;}
    .t h1{font-size:88px;font-weight:700;margin:0 0 24px;
          background:linear-gradient(135deg,#fb923c 0%,#f97316 100%);
          -webkit-background-clip:text;-webkit-text-fill-color:transparent;}
    .t p{font-size:32px;color:#94a3b8;margin:0;font-weight:300;}
  </style></head><body><div class="t">
    <h1>实施工作台</h1>
    <p>纷享销客 CRM 实施咨询师内部产品</p>
  </div></body></html>`);
  await page.waitForTimeout(4000);

  // 2. 切到 /demo 真实页, hero
  n.mark('demo-hero');
  await page.goto(config.baseUrl + '/demo', { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(3500);
  await moveTo(page, 960, 540);  // 居中 cursor

  // 3. 滚到第 1 屏底部 (大约一屏)
  n.mark('pain-points');
  await smoothScrollTo(page, 900, 2000);
  await moveTo(page, 480, 400);
  await page.waitForTimeout(2000);
  await moveTo(page, 960, 400);
  await page.waitForTimeout(2000);
  await moveTo(page, 1440, 400);
  await page.waitForTimeout(2500);

  // 4. 滚到差异化能力区
  n.mark('differentiation');
  await smoothScrollTo(page, 1800, 1800);
  await page.waitForTimeout(4000);
  await moveTo(page, 960, 540);
  await page.waitForTimeout(3000);

  // 5. 滚到 Pipeline 区 (大约 2700 px)
  n.mark('pipeline');
  await smoothScrollTo(page, 2700, 2000);
  await page.waitForTimeout(2500);
  // 模拟 4 个阶段逐个高亮 (其实是鼠标顺序停在 4 个位置)
  const stages = [[480, 580], [820, 580], [1140, 580], [1480, 580]];
  for (const [x, y] of stages) {
    await moveTo(page, x, y);
    await page.waitForTimeout(1500);
  }

  // 6. 滚到 Architecture 区 (大约 3800 px)
  n.mark('architecture');
  await smoothScrollTo(page, 3800, 2000);
  await page.waitForTimeout(2500);
  await moveTo(page, 960, 600);
  await page.waitForTimeout(3000);
  await moveTo(page, 960, 380);
  await page.waitForTimeout(3000);
  await moveTo(page, 960, 200);
  await page.waitForTimeout(3000);

  // 7. 路线图小预告 (用 setContent 注入)
  n.mark('roadmap-tease');
  await smoothScrollTo(page, 4900, 2000);
  await page.waitForTimeout(4000);

  // 8. 引出后 7 分钟
  n.mark('to-walkthrough');
  await moveTo(page, 960, 540);
  await page.waitForTimeout(2500);
}

module.exports = { id: '01-intro', run, durationHint: 60 };
