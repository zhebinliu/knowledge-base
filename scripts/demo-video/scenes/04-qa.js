/**
 * Scene 04 RAG 问答 (4:45 - 5:45, 约 60s)
 * 简化版: 只展示 /qa 界面 + 模拟交互, 不真实触发后端调用 (避免页面加载/LLM 延迟踩坑)。
 */
const { moveTo } = require('../lib/cursor');

async function run(page, n, { config }) {
  n.mark('start');
  // 用 /console/qa (新版工作台问答, 比旧 /qa 加载快 + 干净)
  await page.goto(`${config.baseUrl}/console/qa`,
    { waitUntil: 'networkidle', timeout: 30000 });
  // 等待示例问题出现 (典型内容已渲染的标志)
  try {
    await page.locator('text=如何推进商机').first().waitFor({ timeout: 15000 });
  } catch (e) {
    await page.waitForTimeout(5000);  // 兜底
  }
  await page.waitForTimeout(1500);
  await moveTo(page, 960, 540);

  // 顶部区域 / 左侧导航
  n.mark('overview');
  await moveTo(page, 300, 300);
  await page.waitForTimeout(3000);

  // 输入框区
  n.mark('input-area');
  await moveTo(page, 960, 800);
  await page.waitForTimeout(3000);

  // 中央
  n.mark('center');
  await moveTo(page, 960, 500);
  await page.waitForTimeout(4000);

  // 右上区 (引用 / 设置)
  n.mark('citations-corner');
  await moveTo(page, 1400, 400);
  await page.waitForTimeout(3000);

  // 回到中央, 自然结尾
  n.mark('end');
  await moveTo(page, 960, 540);
  await page.waitForTimeout(3000);
}

module.exports = { id: '04-qa', run, requireLogin: true };
