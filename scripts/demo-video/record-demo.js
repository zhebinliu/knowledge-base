/**
 * 演示视频录屏主入口。按顺序跑所有 scene, 每个 scene 出独立 webm。
 *
 * 用法:
 *   KB_USERNAME=admin KB_PASSWORD=Welcome123 node scripts/demo-video/record-demo.js
 *   node scripts/demo-video/record-demo.js --scene 01-intro       # 只跑一个
 *   node scripts/demo-video/record-demo.js --from 03-chunks       # 从某 scene 开始
 *
 * 前置:
 *   1. seed 项目已建好 (scripts/demo-video/seed/seed-demo-project.py)
 *   2. config.js 里的 projectId / bundleId 跟 seed 结果对齐
 */

const { recordScene } = require('./lib/render');

const SCENES = [
  require('./scenes/01-intro'),
  require('./scenes/02-documents'),
  require('./scenes/03-chunks'),
  require('./scenes/04-qa'),
  require('./scenes/05-insight'),
  require('./scenes/06-challenge-loop'),
  require('./scenes/07-survey'),
  require('./scenes/08-outline-challenge'),
  require('./scenes/09-outro'),
];

function parseArgs() {
  const a = process.argv.slice(2);
  const out = { only: null, from: null };
  for (let i = 0; i < a.length; i++) {
    if (a[i] === '--scene' && a[i + 1]) { out.only = a[++i]; }
    else if (a[i] === '--from' && a[i + 1]) { out.from = a[++i]; }
  }
  return out;
}

(async () => {
  const args = parseArgs();
  let list = SCENES;
  if (args.only) list = SCENES.filter((s) => s.id === args.only);
  if (args.from) {
    const idx = SCENES.findIndex((s) => s.id === args.from);
    if (idx >= 0) list = SCENES.slice(idx);
  }
  if (list.length === 0) {
    console.error('没有匹配的 scene. 可用 id:', SCENES.map((s) => s.id).join(', '));
    process.exit(1);
  }
  console.log(`将录制 ${list.length} 个 scene: ${list.map((s) => s.id).join(', ')}`);

  const failed = [];
  for (const scene of list) {
    try {
      await recordScene({
        sceneId: scene.id,
        sceneFn: scene.run,
        requireLogin: !!scene.requireLogin,
      });
    } catch (e) {
      console.error(`scene ${scene.id} 失败, 继续下一个:`, e.message);
      failed.push(scene.id);
    }
  }

  console.log('\n=== 全部完成 ===');
  if (failed.length > 0) console.log('失败: ' + failed.join(', '));
  else console.log('全部成功');
})();
