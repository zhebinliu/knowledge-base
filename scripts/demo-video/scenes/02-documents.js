/**
 * Scene 02 文档上传 (3:00 - 3:45, 约 45s)
 * 画面: /documents 真实页, 友发钢管 Demo 项目, 展示已上传的 3 份文档列表。
 * 需要登录。
 */
const { moveTo } = require('../lib/cursor');
const { smoothScrollTo } = require('../lib/render');

async function run(page, n, { config }) {
  n.mark('start');
  // 直接定位到友发钢管项目的文档列表
  const url = `${config.baseUrl}/documents?project_id=${config.projectId}`;
  await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(2500);
  await moveTo(page, 960, 540);

  // 高亮 3 份文档
  n.mark('docs-list');
  await moveTo(page, 600, 300);
  await page.waitForTimeout(2500);
  await moveTo(page, 600, 400);
  await page.waitForTimeout(2500);
  await moveTo(page, 600, 500);
  await page.waitForTimeout(2500);

  // 鼠标移到第一份文档,模拟想点开
  n.mark('hover-doc');
  await moveTo(page, 800, 300);
  await page.waitForTimeout(2000);

  // 收尾停顿
  n.mark('end');
  await moveTo(page, 960, 540);
  await page.waitForTimeout(2000);
}

module.exports = { id: '02-documents', run, requireLogin: true };
