/**
 * Scene 05 项目洞察 - 真实工作台 三栏工作区展示 (旁白 50s)
 * 关键: 画面必须有变化 — 列表点击 / 阶段栏扫过 / 文档清单逐个高亮 / 滚动到生成卡 / 滚到下方文档列表
 */
const { moveTo } = require('../lib/cursor');
const { smoothScrollTo } = require('../lib/render');

async function run(page, n, { config }) {
  n.mark('start');
  // 1. 项目列表 (约 5s)
  await page.goto(`${config.baseUrl}/console/projects`, { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(3500);
  await moveTo(page, 960, 540);

  // 2. 鼠标移到特变卡片 (约 3s)
  n.mark('hover');
  const card = page.locator(`text=${config.projectName}`).first();
  let targetXY = { x: 720, y: 200 };
  try {
    const box = await card.boundingBox();
    if (box) targetXY = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  } catch (e) {}
  await moveTo(page, targetXY.x, targetXY.y);
  await page.waitForTimeout(2500);

  // 3. 点击进入 (约 4s 让 React 渲染)
  n.mark('click');
  try { await card.click({ timeout: 5000 }); }
  catch (e) {
    await page.goto(`${config.baseUrl}/console/projects/${config.projectId}`,
      { waitUntil: 'networkidle', timeout: 30000 });
  }
  await page.waitForTimeout(4500);
  await moveTo(page, 960, 540);

  // 4. 阶段栏鼠标依次扫过 4 个阶段 (约 6s)
  n.mark('stage-bar');
  await moveTo(page, 240, 145); await page.waitForTimeout(1300);
  await moveTo(page, 720, 145); await page.waitForTimeout(1300);
  await moveTo(page, 1200, 145); await page.waitForTimeout(1300);
  await moveTo(page, 1680, 145); await page.waitForTimeout(1300);
  await moveTo(page, 240, 145); await page.waitForTimeout(1500);

  // 5. 左栏文档清单逐项高亮 (约 8s)
  n.mark('docs');
  const docYs = [250, 310, 370, 430, 490, 550];
  for (const y of docYs) {
    await moveTo(page, 75, y);
    await page.waitForTimeout(1200);
  }

  // 6. 中央洞察报告 - 滚动逐段查看 (约 14s)
  n.mark('report');
  await moveTo(page, 700, 200);
  await page.waitForTimeout(1500);
  await smoothScrollTo(page, 300, 1800);
  await moveTo(page, 700, 500);
  await page.waitForTimeout(2500);
  await smoothScrollTo(page, 700, 1800);
  await moveTo(page, 700, 400);
  await page.waitForTimeout(2500);
  await smoothScrollTo(page, 1100, 1800);
  await moveTo(page, 700, 500);
  await page.waitForTimeout(2500);

  // 7. 回顶 (约 4s)
  n.mark('back-top');
  await smoothScrollTo(page, 0, 1500);
  await moveTo(page, 960, 400);
  await page.waitForTimeout(2500);

  n.mark('end');
}

module.exports = { id: '05-insight', run, requireLogin: true };
