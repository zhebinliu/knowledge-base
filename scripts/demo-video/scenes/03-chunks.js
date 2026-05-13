/**
 * Scene 03 切片审核 (3:45 - 4:45, 约 60s)
 * 画面: /chunks 真实页, 顾问可以人工审核每条切片。
 */
const { moveTo } = require('../lib/cursor');
const { smoothScrollTo } = require('../lib/render');

async function run(page, n, { config }) {
  n.mark('start');
  await page.goto(`${config.baseUrl}/chunks?project_id=${config.projectId}`,
    { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(3000);
  await moveTo(page, 960, 540);

  // 切片列表上扫一眼
  n.mark('chunks-overview');
  await moveTo(page, 700, 350);
  await page.waitForTimeout(2500);
  await smoothScrollTo(page, 400, 1500);
  await moveTo(page, 700, 500);
  await page.waitForTimeout(2500);

  // 鼠标移到某条切片
  n.mark('one-chunk');
  await moveTo(page, 1200, 500);
  await page.waitForTimeout(3000);

  // 滚回顶部
  n.mark('back-top');
  await smoothScrollTo(page, 0, 1500);
  await moveTo(page, 960, 540);
  await page.waitForTimeout(2500);

  // 结尾停顿
  n.mark('end');
  await page.waitForTimeout(2500);
}

module.exports = { id: '03-chunks', run, requireLogin: true };
