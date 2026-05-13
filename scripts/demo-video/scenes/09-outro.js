/**
 * Scene 09 收尾 + 路线图 (炫酷版)
 *   1) 价值收束 - 渐进字符浮入 + 渐变光晕
 *   2) 三阶段路线图 - 连线 + 脉冲光点 + Phase 错落浮入
 *   3) LOGO "实施工作台" 大字 + 副标题 (无网址)
 */
const { moveTo } = require('../lib/cursor');

const OUTRO_HTML = `<!doctype html><html><head><meta charset="utf-8"><style>
  *{box-sizing:border-box;}
  html,body{margin:0;height:100vh;font-family:-apple-system,'PingFang SC',sans-serif;overflow:hidden;
    background:radial-gradient(ellipse at center,#1e293b 0%,#0b1220 60%,#000 100%);color:#f1f5f9;}
  .scene{position:fixed;inset:0;display:none;align-items:center;justify-content:center;}
  .scene.show{display:flex;}

  /* === scene 1: 价值收束 === */
  #s1 .wrap{text-align:center;}
  #s1 .line1, #s1 .line2{font-weight:600;letter-spacing:2px;opacity:0;transform:translateY(20px);}
  #s1.show .line1{animation:lineIn 1s 0.3s forwards cubic-bezier(.22,.61,.36,1);}
  #s1.show .line2{animation:lineIn 1s 1.4s forwards cubic-bezier(.22,.61,.36,1);}
  #s1 .line1{font-size:72px;background:linear-gradient(135deg,#fb923c,#f97316);
    -webkit-background-clip:text;-webkit-text-fill-color:transparent;margin-bottom:24px;}
  #s1 .line2{font-size:36px;color:#cbd5e1;font-weight:300;}
  @keyframes lineIn{to{opacity:1;transform:translateY(0);}}
  #s1 .glow{position:absolute;width:600px;height:600px;border-radius:50%;
    background:radial-gradient(circle,rgba(251,146,60,0.25) 0%,transparent 60%);
    filter:blur(40px);opacity:0;animation:glowIn 2s 0.3s forwards;}
  @keyframes glowIn{to{opacity:1;}}

  /* === scene 2: 路线图 === */
  #s2{padding:90px 100px;align-items:stretch;}
  #s2 .inner{width:100%;display:flex;flex-direction:column;}
  #s2 h2{font-size:42px;margin:0 0 18px;text-align:center;font-weight:600;}
  #s2 .subtitle{text-align:center;font-size:18px;color:#94a3b8;margin-bottom:55px;letter-spacing:6px;text-transform:uppercase;}
  .lanes{display:flex;gap:36px;flex:1;align-items:stretch;position:relative;}
  .lane{flex:1;border-radius:24px;padding:42px 32px;display:flex;flex-direction:column;
    opacity:0;transform:translateY(40px);position:relative;overflow:hidden;}
  #s2.show .lane.l1{animation:laneIn 0.9s 0.2s forwards cubic-bezier(.22,.61,.36,1);}
  #s2.show .lane.l2{animation:laneIn 0.9s 0.9s forwards cubic-bezier(.22,.61,.36,1);}
  #s2.show .lane.l3{animation:laneIn 0.9s 1.6s forwards cubic-bezier(.22,.61,.36,1);}
  @keyframes laneIn{to{opacity:1;transform:translateY(0);}}
  .lane .ph{font-size:14px;letter-spacing:6px;margin-bottom:24px;text-transform:uppercase;font-weight:600;}
  .lane .ti{font-size:32px;font-weight:600;margin-bottom:20px;line-height:1.3;}
  .lane .ds{font-size:17px;line-height:1.85;color:#cbd5e1;}
  .lane .step{position:absolute;top:24px;right:28px;width:56px;height:56px;border-radius:50%;
    display:flex;align-items:center;justify-content:center;font-size:24px;font-weight:700;}
  /* phase 1 (当前): 实心橙色 + 内发光 */
  .lane.l1{background:linear-gradient(135deg,#f97316 0%,#fb923c 100%);color:#fff;
    box-shadow:0 0 60px rgba(251,146,60,0.4),inset 0 0 30px rgba(255,255,255,0.08);}
  .lane.l1 .ph,.lane.l1 .ds{color:rgba(255,255,255,0.92);}
  .lane.l1 .step{background:rgba(255,255,255,0.18);color:#fff;}
  .lane.l1::after{content:'';position:absolute;inset:0;border-radius:24px;
    background:linear-gradient(45deg,transparent 40%,rgba(255,255,255,0.12) 50%,transparent 60%);
    animation:shine 4s 1.5s infinite;}
  @keyframes shine{0%{transform:translateX(-100%);}100%{transform:translateX(100%);}}
  /* phase 2 (下一步): 半透明蓝灰 + 脉冲虚线 */
  .lane.l2{background:rgba(59,130,246,0.08);border:1px solid rgba(96,165,250,0.35);}
  .lane.l2 .step{background:rgba(96,165,250,0.18);color:#93c5fd;border:1px dashed #60a5fa;}
  .lane.l2 .ph{color:#93c5fd;}
  /* phase 3 (远期): 纯虚线 + 极暗 */
  .lane.l3{background:transparent;border:1.5px dashed rgba(148,163,184,0.4);color:#94a3b8;}
  .lane.l3 .ti,.lane.l3 .ph{color:#94a3b8;}
  .lane.l3 .step{border:1.5px dashed #94a3b8;color:#94a3b8;}
  /* 流动光点装饰 */
  #s2 .dots{position:absolute;inset:0;pointer-events:none;}
  #s2 .dot{position:absolute;width:6px;height:6px;border-radius:50%;background:#fb923c;
    box-shadow:0 0 12px #fb923c;opacity:0;}
  #s2.show .dot{animation:dotFloat 4s infinite;}
  #s2 .dot.d1{top:20%;left:8%;animation-delay:0.5s;}
  #s2 .dot.d2{top:60%;left:92%;animation-delay:1.5s;background:#60a5fa;box-shadow:0 0 12px #60a5fa;}
  #s2 .dot.d3{top:85%;left:30%;animation-delay:2.5s;}
  @keyframes dotFloat{0%,100%{opacity:0;transform:scale(0.5);}50%{opacity:0.8;transform:scale(1.2);}}

  /* === scene 3: LOGO === */
  #s3 .wrap{text-align:center;position:relative;}
  #s3 h1{font-size:128px;font-weight:700;margin:0 0 28px;letter-spacing:4px;
    background:linear-gradient(135deg,#fb923c,#f97316,#fbbf24);
    background-size:200% 200%;
    -webkit-background-clip:text;-webkit-text-fill-color:transparent;
    animation:shift 5s ease-in-out infinite;opacity:0;}
  #s3.show h1{animation:logoIn 1.2s 0.2s forwards cubic-bezier(.22,.61,.36,1),shift 5s 1.4s ease-in-out infinite;}
  @keyframes logoIn{0%{opacity:0;transform:scale(0.92);letter-spacing:18px;}
    100%{opacity:1;transform:scale(1);letter-spacing:4px;}}
  @keyframes shift{0%,100%{background-position:0% 50%;}50%{background-position:100% 50%;}}
  #s3 .sub{font-size:28px;color:#94a3b8;font-weight:300;letter-spacing:8px;opacity:0;}
  #s3.show .sub{animation:subIn 1s 1.2s forwards;}
  @keyframes subIn{to{opacity:1;}}
  #s3 .ring{position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);
    width:0;height:0;border-radius:50%;border:1px solid rgba(251,146,60,0.4);
    pointer-events:none;}
  #s3.show .ring{animation:ringExpand 3s 0.4s infinite ease-out;}
  @keyframes ringExpand{0%{width:200px;height:200px;opacity:0.6;}100%{width:1400px;height:1400px;opacity:0;}}
</style></head><body>
  <div id="s1" class="scene"><div class="glow"></div><div class="wrap">
    <div class="line1">把咨询师从文档工里解放出来</div>
    <div class="line2">把更多时间还给客户</div>
  </div></div>

  <div id="s2" class="scene"><div class="inner">
    <h2>产品路线图</h2>
    <div class="subtitle">Product Roadmap</div>
    <div class="lanes">
      <div class="dots"><div class="dot d1"></div><div class="dot d2"></div><div class="dot d3"></div></div>
      <div class="lane l1">
        <div class="step">1</div>
        <div class="ph">当前 · Now</div>
        <div class="ti">独立工作台</div>
        <div class="ds">顾问各自上传积累<br/>验证产品力</div>
      </div>
      <div class="lane l2">
        <div class="step">2</div>
        <div class="ph">下一步 · Next</div>
        <div class="ti">接入行业 Know-how</div>
        <div class="ds">沉淀公司方法论库<br/>统一行业案例资产</div>
      </div>
      <div class="lane l3">
        <div class="step">3</div>
        <div class="ph">远期 · Future</div>
        <div class="ti">融入大黄蜂平台</div>
        <div class="ds">作为 agent 接入<br/>探索一线落地路径</div>
      </div>
    </div>
  </div></div>

  <div id="s3" class="scene"><div class="wrap">
    <div class="ring"></div>
    <h1>实施工作台</h1>
    <div class="sub">实 施 团 队 专 属 AI 工 作 台</div>
  </div></div>
</body></html>`;

async function run(page, n, { config }) {
  n.mark('start');
  await page.setContent(OUTRO_HTML);
  await page.waitForTimeout(300);

  n.mark('value');
  await page.evaluate(() => document.getElementById('s1').classList.add('show'));
  await page.waitForTimeout(8500);

  n.mark('roadmap');
  await page.evaluate(() => {
    document.getElementById('s1').classList.remove('show');
    document.getElementById('s2').classList.add('show');
  });
  await page.waitForTimeout(14000);

  n.mark('logo');
  await page.evaluate(() => {
    document.getElementById('s2').classList.remove('show');
    document.getElementById('s3').classList.add('show');
  });
  await page.waitForTimeout(7500);

  n.mark('end');
}

module.exports = { id: '09-outro', run, requireLogin: false };
