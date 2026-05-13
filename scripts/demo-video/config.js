/**
 * 演示视频统一配置。环境变量优先级最高, 然后才是这里的默认值。
 *
 * 关键 id 来自 scripts/demo-video/seed/seed-demo-project.py 的输出:
 *   project_id = 50c75a03-da54-4a9c-83c9-fbe19e2be0b5  (友发钢管 Demo)
 *   bundle_id  = 7299c63c-a1ac-40e3-9c54-9403085349ba  (insight 报告)
 */

module.exports = {
  baseUrl: process.env.KB_BASE_URL || 'https://kb.liii.in',
  username: process.env.KB_USERNAME || 'admin',
  password: process.env.KB_PASSWORD || 'Welcome123',

  // 演示用的真实项目: 特变新能源 (客户特变电工), 信息齐全
  projectId:   process.env.DEMO_PROJECT_ID || 'e26aa95b-9a9d-41fa-8a64-85c7582e4b30',
  projectName: process.env.DEMO_PROJECT_NAME || '特变新能源',
  bundleId:    process.env.DEMO_BUNDLE_ID  || '',

  // 录屏统一规格
  viewport: { width: 1920, height: 1080 },

  // 输出目录
  outputDir: require('path').join(__dirname, 'output'),
  narrationDir: require('path').join(__dirname, 'narration'),
  assetsDir: require('path').join(__dirname, 'assets'),
};
