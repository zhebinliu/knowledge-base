/**
 * Scene 06 五阶段流水线评审 - 用 /demo/insight Step 7 概念图 (旁白 48s)
 * 真实工作台 insight 已生成完后看不到进度卡, 走查页那张 Runner/Critic/Challenger 三角图最直观。
 */
const { moveTo } = require('../lib/cursor');
const { smoothScrollTo } = require('../lib/render');

async function run(page, n, { config }) {
  n.mark('start');
  await page.goto(config.baseUrl + '/demo/insight', { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(2500);
  await moveTo(page, 960, 540);

  // 1. 滚到挑战循环段 (大约 Step 7 在页面 6200-7000px)
  n.mark('scroll-to-loop');
  await smoothScrollTo(page, 5800, 2500);
  await page.waitForTimeout(2000);
  await moveTo(page, 960, 540);

  // 2. 五阶段进度条 - 鼠标依次扫过 5 个阶段 (旁白讲到每个阶段时画面对应)
  n.mark('plan');
  await smoothScrollTo(page, 6200, 1500);
  await moveTo(page, 360, 540); await page.waitForTimeout(3000);

  n.mark('generate');
  await moveTo(page, 580, 540); await page.waitForTimeout(3000);

  n.mark('critic');
  await moveTo(page, 800, 540); await page.waitForTimeout(4500);

  n.mark('challenger');
  await moveTo(page, 1020, 540); await page.waitForTimeout(4500);

  n.mark('reflect');
  await moveTo(page, 1240, 540); await page.waitForTimeout(3000);

  // 3. 滚到 Runner/Critic/Challenger 三角图 + 整体回顾
  n.mark('triangle');
  await smoothScrollTo(page, 6800, 1500);
  await moveTo(page, 960, 540);
  await page.waitForTimeout(4500);

  n.mark('end');
  await page.waitForTimeout(2000);
}

module.exports = { id: '06-challenge-loop', run, requireLogin: false };
