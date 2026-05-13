/**
 * Scene 08 调研大纲 + 知识挑战 (旁白 35s)
 * 前 8s: 调研大纲 tab → 调研问卷录入 tab (展示工作区上方三个 tab)
 * 后 28s: /challenge 真实知识挑战页 (阶段筛选 + 出题模式 + 对抗挑战概念)
 */
const { moveTo } = require('../lib/cursor');
const { smoothScrollTo } = require('../lib/render');

async function run(page, n, { config }) {
  n.mark('start');
  await page.goto(`${config.baseUrl}/console/projects/${config.projectId}`,
    { waitUntil: 'networkidle', timeout: 30000 });

  // 立刻点击需求调研 tab
  try {
    await page.locator('text=需求调研').first().waitFor({ timeout: 8000 });
    await page.locator('text=需求调研').first().click({ timeout: 3000 });
  } catch (e) {}
  await page.waitForTimeout(2000);

  // 切到调研大纲 tab
  n.mark('outline-tab');
  try {
    await page.locator('text=调研大纲').nth(1).click({ timeout: 3000 });  // 第二个匹配避免左栏的同名
  } catch (e) {
    try { await page.locator('text=调研大纲').first().click({ timeout: 3000 }); } catch (e2) {}
  }
  await page.waitForTimeout(3000);
  await moveTo(page, 960, 540);

  // 切到调研问卷录入 tab
  n.mark('survey-input-tab');
  try {
    await page.locator('text=调研问卷(录入)').first().click({ timeout: 3000 });
  } catch (e) {}
  await page.waitForTimeout(3000);
  await moveTo(page, 960, 540);

  // 切到 /challenge 知识挑战页
  n.mark('challenge-page');
  await page.goto(`${config.baseUrl}/challenge`, { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(2500);
  await moveTo(page, 960, 540);

  // 阶段标签栏扫过 (旁白讲"对抗式挑战")
  n.mark('stages');
  for (const x of [530, 620, 710, 800, 890, 980]) {
    await moveTo(page, x, 220);
    await page.waitForTimeout(700);
  }

  // 出题模式: 基于知识库 / 自由提问
  n.mark('mode');
  await moveTo(page, 545, 275);
  await page.waitForTimeout(2200);
  await moveTo(page, 613, 275);
  await page.waitForTimeout(2200);

  // 开始挑战按钮 (旁白讲"人工判定")
  n.mark('btn');
  await moveTo(page, 1050, 330);
  await page.waitForTimeout(3000);

  // 滚到下方计划任务 / 历史区 (旁白讲"改写队列")
  n.mark('history');
  await smoothScrollTo(page, 400, 1500);
  await moveTo(page, 960, 540);
  await page.waitForTimeout(3000);

  n.mark('end');
}

module.exports = { id: '08-outline-challenge', run, requireLogin: true };
