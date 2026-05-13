/**
 * 旁白时间戳标记: 每个 scene 在关键操作前后调 mark(),
 * 输出 markers.json 给后期合成时对齐 TTS mp3 用。
 *
 * 用法:
 *   const Narration = require('./narration');
 *   const n = new Narration('scene-01');
 *   n.mark('hero-start');
 *   // ... 跑一段录屏 ...
 *   n.mark('pipeline-start');
 *   // ... 更多 ...
 *   n.save('output/markers.json');
 */

const fs = require('fs');
const path = require('path');

class Narration {
  constructor(sceneName) {
    this.scene = sceneName;
    this.startMs = Date.now();
    this.markers = [];
  }

  /** 打一个时间戳标记 */
  mark(name, meta = {}) {
    const t = Date.now() - this.startMs;
    this.markers.push({
      scene: this.scene,
      marker: name,
      timestamp_ms: t,
      ...meta,
    });
    console.log(`  ⏱  [${this.scene}] ${name} @ ${(t / 1000).toFixed(2)}s`);
  }

  /** 把当前 scene 的 markers 追加到统一文件 (idempotent: 先去重再追加) */
  save(filePath) {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    let existing = [];
    if (fs.existsSync(filePath)) {
      try { existing = JSON.parse(fs.readFileSync(filePath, 'utf-8')); } catch (_) {}
    }
    // 去掉同 scene 的旧记录, 再追加新的
    const merged = existing.filter((m) => m.scene !== this.scene).concat(this.markers);
    fs.writeFileSync(filePath, JSON.stringify(merged, null, 2));
    console.log(`  ✓ markers 写入 ${filePath} (本场 ${this.markers.length} 条)`);
  }
}

module.exports = Narration;
