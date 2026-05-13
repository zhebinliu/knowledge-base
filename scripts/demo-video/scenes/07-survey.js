/**
 * Scene 07 需求调研 (旁白 42s)
 * 关键: page.goto 后立刻点 "需求调研" tab, 不要等
 */
const { moveTo } = require('../lib/cursor');
const { smoothScrollTo } = require('../lib/render');

async function run(page, n, { config }) {
  n.mark('start');
  await page.goto(`${config.baseUrl}/console/projects/${config.projectId}`,
    { waitUntil: 'networkidle', timeout: 30000 });

  // 等到阶段栏出现就立刻点击 (avoiding 5s 死等)
  n.mark('click-survey');
  try {
    await page.locator('text=需求调研').first().waitFor({ timeout: 8000 });
    await page.locator('text=需求调研').first().click({ timeout: 3000 });
  } catch (e) {
    console.warn('点击需求调研失败:', e.message);
  }
  await page.waitForTimeout(2500);
  await moveTo(page, 960, 540);

  // 中央工作区说明 (~3s)
  n.mark('intro');
  await moveTo(page, 1100, 333);
  await page.waitForTimeout(3500);

  // 左栏访谈角色 (~7s)
  n.mark('roles');
  const roleYs = [380, 425, 480, 535];
  for (const y of roleYs) {
    await moveTo(page, 75, y);
    await page.waitForTimeout(1700);
  }

  // 切换 "按 LTC 模块" (~4s)
  n.mark('group-ltc');
  try {
    await page.locator('text=按 LTC').first().click({ timeout: 3000 });
    await page.waitForTimeout(2500);
  } catch (e) {}
  await moveTo(page, 75, 400);
  await page.waitForTimeout(2000);

  // 切回 "按角色" 再演示生成卡 (~3s)
  try {
    await page.locator('text=按角色').first().click({ timeout: 3000 });
    await page.waitForTimeout(1800);
  } catch (e) {}

  // 中央两个生成卡 (~7s)
  n.mark('outline-card');
  await moveTo(page, 1100, 535);
  await page.waitForTimeout(3500);
  n.mark('survey-card');
  await moveTo(page, 1100, 625);
  await page.waitForTimeout(3500);

  // 开始生成按钮 (~3s)
  n.mark('generate-btn');
  await moveTo(page, 1860, 230);
  await page.waitForTimeout(2500);

  n.mark('end');
  await moveTo(page, 960, 540);
  await page.waitForTimeout(1500);
}

module.exports = { id: '07-survey', run, requireLogin: true };
