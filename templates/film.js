/* =====================================================================
   起步模板：六段式 130s。复制到新目录，按分镜表改；能直接渲染。
   【】里的都是占位，换成你的内容。时间轴按 76 BPM 小节（3.158s）对齐。
   ===================================================================== */
import { title, rng, prog, ease, kf, lerp } from '/engine/vibe.js';

const BAR = 60 / 76 * 4;
const TITLE = 3 * BAR;          // 片名卡：第 3 小节，配乐满编进入
const HUSH = 96, REVEAL = 98.5; // 转折段：静音 2.5 秒后揭晓

export default {
  meta: {
    title: '【片名】', subtitle: '【一句话说清这条讲什么？】', en: 'English Title', author: '@你的账号',
    world: 'night', size: '16:9', fps: 30, duration: 130,
    titleAt: TITLE,
    music: { bpm: 76, key: 'Am', sections: [[0, 'pad'], [TITLE, 'full'], [20, 'piano'], [36, 'full'], [70, 'arp'], [HUSH, 'rest'], [REVEAL, 'piano'], [110, 'full'], [120, 'outro']] },
    refs: ['【作者, "论文题名", 期刊 (年份)】'],
  },

  chapters: [[16, '01 史', 'HISTORY'], [36, '02 演', 'MECHANISM'], [90, '03 转', 'TWIST'], [104, '04 今', 'TODAY'], [118, '尾声', 'CODA', 130]],

  subs: [
    // ① 冷开场钩子 0–8s
    [0.6, 3.8, '【钩子第一句：一个场景】', '[English]'],
    [4.0, 8.4, '【钩子第二句：反直觉的[问题]？】', '[English]'],
    // ② 历史锚点
    [16.5, 20, '【1950 年，某某提出了它】', '[English]'],
    [20.2, 24, '【这道题，一悬就是 [10 年]】', '[English]'],
    // ③ 机制演示：先立规则，再一步一步推
    [36.5, 40, '【规则只有三条】', '[English]'],
    [52, 56, '【第一步……】', '[English]'],
    [64, 68, '【第二步……】', '[English]'],
    [78, 82, '【结果停在 [37%] 附近】', '[English]'],
    // ④ 反直觉转折（静音在这里）
    [90.5, 95, '【但还有一个反直觉的细节——】', '[English]'],
    [REVEAL + .2, REVEAL + 4, '【{最好的}，恰恰是……】', '[English]'],
    // ⑤ 现实落点
    [104.5, 108.5, '【它就在你身边：看房、招聘、选 offer】', '[English]'],
    [109, 113.5, '【一句可以转发的金句】', '[English]'],
    // ⑥ 收尾
    [119, 124, '【回到开场：这一次，由你来填】', '[English]'],
  ],

  scenes: [
    // ① 钩子：先演一个小东西，让观众"遇到"概念
    { from: 0, to: TITLE - .2, draw(c, k, lt) {
      c.type('【床前明月＿】', c.cx, c.cy, .8, 5, { size: 80, cursor: true });
    } },

    title(TITLE, TITLE + 5.5),

    // ② 历史锚点：年份地点戳 + 文献复原
    { from: 15.8, to: 35.6, draw(c, k, lt) {
      const a = ease.out(prog(lt, 0, 1));
      c.text('【1950 · WASHINGTON】', c.cx, 200 * c.u, { font: 'mono', size: 22, track: 8, color: 'gold', alpha: a * .8 });
      c.doc({ x: c.cx, y: c.cy - lt * 3 * c.u, w: 820, h: 400, rot: -2 + lt * .1, alpha: a,
        top: '【JOURNAL NAME · 1950】', title: '【Original Paper Title】', zh: '【中文译名】', author: '【AUTHOR NAME】', seal: '【印章】' });
      c.sfx(15.8 + .9, 'stamp');
    } },

    // ③ 机制：规则卡 → 曲线生长
    { from: 36, to: 52, draw(c, k, lt) {
      c.rules({ title: '游戏规则', en: 'The rules', k: prog(lt, .5, 6), items: [['【规则一】', 'Rule one'], ['【规则二】', 'Rule two'], ['【规则三】', 'Rule three']] });
    } },
    { from: 51.6, to: 90, draw(c, k, lt) {
      // 宽高按画布算，横竖屏通用
      const w = Math.min(1120 * c.u, c.W * .8), h = c.vertical ? w * .9 : 480 * c.u;
      const box = { x: c.cx - w / 2, y: c.vertical ? c.H * .28 : 220 * c.u, w, h };
      c.axes(box, { xlabel: '【横轴】', ylabel: '【纵轴】', alpha: ease.out(prog(lt, 0, 1)) });
      const cv = c.curve(v => v * Math.exp(1 - v * 2.7) * 1.35, { box, p: ease.io(prog(lt, 1, 24)) });
      c.dot(...cv.tip, { r: 8 });
      c.sfx(51.6 + 1, 'whoosh', { dur: 1.2 });
    } },

    // ④ 转折：静音 → 闪亮揭晓
    { from: 90, to: 104, draw(c, k, lt) {
      c.sfx(HUSH - 1.6, 'rise', { dur: 1.6 }); c.sfx(HUSH, 'hush', { dur: REVEAL - HUSH });
      if (c.t >= REVEAL) { c.flash(REVEAL); c.ring(c.cx, c.cy - 60 * c.u, REVEAL); }
      c.num(c.t < REVEAL ? 0 : 37, c.cx, c.cy, { suffix: '%', size: 200, color: 'gold', glow: 30, alpha: c.t < REVEAL ? .15 : 1 });
    } },

    // ⑤ 落点：泛化标签逐个入场
    { from: 104, to: 118, draw(c, k, lt) {
      ['【看房】', '【招聘】', '【找车位】', '【选 offer】'].forEach((w, i) => {
        const a = ease.out(prog(lt, .4 + i * .5, 1 + i * .5)); c.sfx(104 + .4 + i * .5, 'soft', { pitch: 1 + i * .1 });
        // 横屏一排四个；竖屏两行两列
        const [px, py] = c.vertical ? [c.cx + (i % 2 - .5) * 420 * c.u, c.cy - 120 * c.u + Math.floor(i / 2) * 160 * c.u] : [c.cx + (i - 1.5) * 300 * c.u, c.cy - 40 * c.u];
        c.text(w, px, py + (1 - a) * 20 * c.u, { size: 56, weight: 700, alpha: a });
      });
    } },

    // ⑥ 收尾：回到开场画面 → 参考文献
    { from: 118, to: 130, fo: 1, draw(c, k, lt) {
      c.type('【床前明月＿】', c.cx, c.cy - 60 * c.u, 118.4, 5, { size: 80, cursor: true });
      const e = ease.out(prog(lt, 6, 7));
      c.m.refs.forEach((r, i) => c.text(r, c.cx, c.cy + 160 * c.u + i * 40 * c.u - lt * 3 * c.u, { font: 'latin', italic: true, size: 22, color: 'dim', alpha: e }));
      c.sfx(118, 'chord', { root: -5 });
    } },
  ],
};
