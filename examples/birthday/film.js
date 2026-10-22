/* =====================================================================
   示例《生日悖论》—— 23 个人里，两人同一天生日的概率超过一半
   夜曲世界 · 16:9 · 80s（演示用的短版；正片建议 120–180s）
   所有数字都是真算出来的：模拟用固定种子的随机数，曲线是精确公式。
   ===================================================================== */
import { title, rng, prog, ease, kf, lerp } from '/engine/vibe.js';

// ---------------------------------------------------------------- 数据
const N = 23, DAYS = 365;
// 精确概率：P(n) = 1 − ∏(365−k)/365
const P0 = n => { let q = 1; for (let k = 0; k < n; k++) q *= (DAYS - k) / DAYS; return 1 - q; };
const P = v => lerp(P0(Math.floor(v)), P0(Math.ceil(v)), v - Math.floor(v));   // 画曲线用：整数点之间线性插值
// 第一次撞生日发生在第几个人（-1 = 没撞）
const firstHit = days => { const seen = new Map(); for (let i = 0; i < days.length; i++) { if (seen.has(days[i])) return [seen.get(days[i]), i]; seen.set(days[i], i); } return null; };
const drawDays = r => Array.from({ length: N }, () => Math.floor(r() * DAYS));
// 挑一个种子：让第 18–21 个人才撞上，演示节奏最好
let SEED = 1; while (true) { const h = firstHit(drawDays(rng(SEED))); if (h && h[1] >= 17 && h[1] <= 20) break; SEED++; }
const DAYS_23 = drawDays(rng(SEED)), [HIT_A, HIT_B] = firstHit(DAYS_23);
// 一万次班级模拟：累计撞上的次数
const TRIALS = 10000, CUM = new Uint16Array(TRIALS + 1), TR = rng(2026);
for (let i = 0; i < TRIALS; i++) CUM[i + 1] = CUM[i] + (firstHit(drawDays(TR)) ? 1 : 0);
const RATE = CUM[TRIALS] / TRIALS;
const MONTH = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
const dateOf = d => { let m = 0; while (d >= MONTH[m]) d -= MONTH[m++]; return `${m + 1}月${d + 1}日`; };

// ---------------------------------------------------------------- 时间轴
const TITLE = 9.47;            // 76 BPM 第 3 小节——配乐满编进入的那一拍
const SIM = 24, GAP = .62;     // 第 i 个人落在日历上的时刻：SIM + i·GAP
const T_HIT = SIM + HIT_B * GAP;
const HUSH = 57.5, REVEAL = 60;

export default {
  meta: {
    title: '生日悖论', subtitle: '23 个人，有多大可能撞生日？', en: 'The Birthday Paradox',
    author: '@vibe-knowledge-studio', world: 'night', size: '16:9', fps: 30, duration: 80,
    titleAt: TITLE, cover: TITLE + 2.2,
    music: { bpm: 76, key: 'Am', sections: [[0, 'pad'], [TITLE, 'full'], [40, 'arp'], [52.6, 'piano'], [HUSH, 'rest'], [REVEAL, 'piano'], [66.3, 'full'], [72.6, 'outro']] },
    refs: [
      'R. von Mises, "Über Aufteilungs- und Besetzungs-Wahrscheinlichkeiten", Rev. Fac. Sci. Univ. Istanbul 4 (1939)',
      'W. Feller, An Introduction to Probability Theory and Its Applications, Vol. 1 (1968)',
    ],
  },

  chapters: [[14, '01 题', 'THE PROBLEM'], [22, '02 算', 'SIMULATE'], [52, '03 线', 'THE CURVE'], [63.5, '04 对', 'PAIRS'], [70.5, '尾声', 'CODA', 80]],

  // [起, 止, 中文（[金] {红}）, 英文, 选项]
  subs: [
    [0.6, 3.6, '一个班，23 个人。', 'A class of 23.'],
    [3.8, 8.6, '有两个人同一天生日的概率，是多少？', 'What are the odds two of them share a birthday?'],
    [14.6, 18, '1939 年，数学家冯·米塞斯', 'In 1939, Richard von Mises'],
    [18.2, 21.8, '第一次把这道题写进了论文。', 'first put this puzzle in a paper.'],
    [22.6, 26, '把每个人的生日，落在日历上。', 'Drop each birthday onto the calendar.'],
    [26.2, 30.5, '一个，两个……一年还空得很。', 'One, two… the year is still wide open.'],
    [31, 35, '直觉说：要凑够 183 人才稳。', 'Intuition says you need 183 people.'],
    [T_HIT + .3, T_HIT + 4, `可第 ${HIT_B + 1} 个人，就{撞上}了。`, `Yet person #${HIT_B + 1} already collides.`],
    [40.4, 44, '一次是运气。那就算一万次。', 'Once is luck. So run it ten thousand times.'],
    [44.2, 48.6, '每次 23 人，约[一半]的班级会撞。', 'About half of all classes get a match.'],
    [48.8, 52, `最后停在 ${(RATE * 100).toFixed(1)}%。`, `It settles at ${(RATE * 100).toFixed(1)}%.`],
    [52.6, 56.6, '人数从 1 加到 70——', 'Now add people, one by one —'],
    [REVEAL + .2, REVEAL + 3.6, '23 人：[50.7%]。57 人：[99%]。', '23 people: 50.7%. 57 people: 99%.'],
    [64, 67.4, '因为要数的，不是"和我同一天"，', "You're not counting 'same day as me' —"],
    [67.6, 70.6, '而是任意两个人：[253] 对。', 'but any two people: 253 pairs.'],
    [71, 74, '密码学里，这叫「生日攻击」。', 'Cryptographers call it the birthday attack.'],
    [74.4, 78.6, '所谓巧合，是没数清楚的可能。', "A coincidence is a possibility you didn't count."],
  ],

  scenes: [
    // ------------------------------------------------ 钩子：23 个小人一个个出现
    { from: 0, to: 9.2, draw(c, k, lt) {
      const y = c.cy - 40 * c.u, w = 62 * c.u, x0 = c.cx - w * (N - 1) / 2;
      for (let i = 0; i < N; i++) {
        const t0 = .5 + i * .12, a = ease.out(prog(c.t, t0, t0 + .4)); if (a <= 0) continue;
        c.sfx(t0, 'tick', { pitch: 1 + (i % 5) * .04, gain: -28 });
        const px = x0 + i * w, py = y + (1 - a) * 20 * c.u + Math.sin(c.t * 1.3 + i) * 3 * c.u;
        c.dot(px, py - 22 * c.u, { r: 9, color: 'ink', alpha: a, glow: 0 });
        c.path([[px - 15 * c.u, py + 18 * c.u], [px - 12 * c.u, py], [px, py - 6 * c.u], [px + 12 * c.u, py], [px + 15 * c.u, py + 18 * c.u]], { color: 'ink', width: 2.4, alpha: a * .8 });
      }
      c.text('?', c.cx, y - 120 * c.u, { font: 'latin', size: 120, color: 'gold', alpha: ease.out(prog(c.t, 4, 5)), glow: 30 });
    } },

    title(TITLE, 14.2),

    // ------------------------------------------------ 历史锚点：1939 论文
    { from: 14.2, to: 22.2, draw(c, k, lt) {
      const a = ease.out(prog(lt, 0, 1));
      c.text('1939 · ISTANBUL', c.cx, 190 * c.u, { font: 'mono', size: 22, track: 8, color: 'gold', alpha: a * .8 });
      c.doc({ x: c.cx, y: c.cy + (1 - a) * 30 * c.u - lt * 4 * c.u, w: 860, h: 420, rot: -2.5 + lt * .12, alpha: a,
        top: 'REVUE DE LA FACULTÉ DES SCIENCES · ISTANBUL', title: 'Über Aufteilungs- und Besetzungs-Wahrscheinlichkeiten', titleSize: 36,
        zh: '论分配与占位概率', author: 'RICHARD VON MISES', seal: '生日问题', note: '论文首页示意 · 中文题名为意译' });
      c.sfx(14.2 + .9, 'stamp');
    } },

    // ------------------------------------------------ 机制：23 个生日落在 365 天的环上
    { from: 22.2, to: 40.2, draw(c, k, lt) {
      const R = 300 * c.u, X = c.cx, Y = c.cy - 40 * c.u, ang = d => -Math.PI / 2 + 2 * Math.PI * (d + .5) / DAYS;
      const pos = (d, r = R) => [X + Math.cos(ang(d)) * r, Y + Math.sin(ang(d)) * r];
      const ra = ease.out(prog(c.t, 22.2, 23.6));
      // 日历环：365 根刻度 + 12 个月
      for (let d = 0; d < DAYS; d++) { const [x1, y1] = pos(d, R - 8 * c.u), [x2, y2] = pos(d, R + 8 * c.u); if (d / DAYS > ra) break; c.path([[x1, y1], [x2, y2]], { color: 'dim', width: 1, alpha: .45 }); }
      let acc = 0; MONTH.forEach((m, i) => { const [mx, my] = pos(acc + m / 2, R + 46 * c.u); c.text(`${i + 1}月`, mx, my + 8 * c.u, { font: 'sans', size: 20, color: 'dim', alpha: ra * .8 }); acc += m; });
      // 一个个落下
      for (let i = 0; i < N; i++) {
        const t0 = SIM + i * GAP, a = prog(c.t, t0 - .3, t0); if (a <= 0) continue;
        if (i <= HIT_B) c.sfx(t0, 'soft', { pitch: .8 + DAYS_23[i] / DAYS * .6, gain: -20 });
        const hit = (i === HIT_A || i === HIT_B) && c.t >= T_HIT;
        const [px, py] = pos(DAYS_23[i], lerp(0, R, ease.out(a)));
        c.dot(px, py, { r: hit ? 9 : 7, color: hit ? 'rose' : 'gold', alpha: i > HIT_B ? .35 : 1 });
      }
      c.num(Math.min(N, Math.max(0, Math.floor((c.t - SIM) / GAP) + 1)), X, Y + 20 * c.u, { size: 110, color: 'ink', alpha: .9 });
      c.text('人', X, Y + 66 * c.u, { font: 'sans', size: 24, color: 'dim' });
      if (c.t >= T_HIT) {
        const [ax, ay] = pos(DAYS_23[HIT_A]); c.ring(ax, ay, T_HIT, { color: 'rose', r1: 160 });
        c.text(dateOf(DAYS_23[HIT_B]), ax + (ax > X ? 60 : -60) * c.u, ay, { font: 'sans', size: 30, weight: 700, color: 'rose', align: ax > X ? 'left' : 'right', alpha: ease.out(prog(c.t, T_HIT, T_HIT + .5)), glow: 16 });
        c.flash(T_HIT, { sound: 'boom', amount: .5 });
      }
    } },

    // ------------------------------------------------ 一万次模拟：400 个格子 + 实时比例
    { from: 40.2, to: 52.4, draw(c, k, lt) {
      const n = Math.floor(TRIALS * ease.io(prog(c.t, 41, 50))), cols = 25, rows = 16, s = 26 * c.u, gx = c.cx - 520 * c.u - cols * s / 2, gy = c.cy - 40 * c.u - rows * s / 2;
      c.sfx(41, 'shimmer');
      const lit = Math.floor(n / TRIALS * cols * rows);
      for (let i = 0; i < lit; i++) {
        const hit = CUM[i + 1] > CUM[i];
        c.box(gx + (i % cols) * s, gy + Math.floor(i / cols) * s, s - 6 * c.u, s - 6 * c.u, { fill: hit ? 'gold' : 'dim', alpha: hit ? .9 : .25, radius: 3 });
      }
      c.text('每格 = 一个 23 人的班级 · 金色 = 有人撞生日', gx + cols * s / 2, gy + rows * s + 44 * c.u, { font: 'sans', size: 20, color: 'dim' });
      const rx = c.cx + 380 * c.u;
      c.text('第', rx - 90 * c.u, c.cy - 130 * c.u, { font: 'sans', size: 26, color: 'dim', align: 'right' });
      c.num(n, rx, c.cy - 130 * c.u, { size: 44 });
      c.text('次', rx + 90 * c.u, c.cy - 130 * c.u, { font: 'sans', size: 26, color: 'dim', align: 'left' });
      c.num(n ? CUM[n] / n * 100 : 0, rx, c.cy + 30 * c.u, { digits: 1, suffix: '%', size: 150, color: 'gold', glow: 28 });
      c.text('撞上的比例', rx, c.cy + 90 * c.u, { font: 'sans', size: 24, color: 'dim' });
    } },

    // ------------------------------------------------ 曲线：人数 1 → 70；静音后揭晓
    { from: 52.4, to: 63.6, draw(c, k, lt) {
      const box = { x: c.cx - 600 * c.u, y: 210 * c.u, w: 1200 * c.u, h: 520 * c.u };
      c.axes(box, { xlabel: '人数', ylabel: '至少两人同一天生日', alpha: ease.out(prog(lt, 0, .8)), xticks: [[0, '0'], [23 / 70, '23'], [57 / 70, '57'], [1, '70']] });
      const p = ease.io(prog(c.t, 53, 57.4));
      c.sfx(55.9, 'rise', { dur: 1.6 }); c.sfx(HUSH, 'hush', { dur: REVEAL - HUSH });
      const cv = c.curve(P, { box, dom: [0, 70], range: [0, 1], p });
      const n = Math.round(p * 70); c.dot(...cv.tip, { r: 8 });
      if (c.t < HUSH) c.text(`${n} 人  ${(P(n) * 100).toFixed(1)}%`, cv.tip[0] + 16 * c.u, cv.tip[1] - 18 * c.u, { font: 'latin', size: 30, align: 'left', color: 'gold' });
      // 静音那 2.5 秒：只剩 50% 那条虚线慢慢画出来
      const dl = prog(c.t, HUSH, REVEAL);
      c.path([[box.x, cv.Y(.5)], [box.x + box.w, cv.Y(.5)]], { color: 'dim', width: 1.5, dash: [8, 8], p: dl, alpha: .8 });
      c.text('50%', box.x - 16 * c.u, cv.Y(.5) + 8 * c.u, { font: 'latin', size: 24, color: 'dim', align: 'right', alpha: dl });
      if (c.t >= REVEAL) {
        c.flash(REVEAL);
        const a = ease.out(prog(c.t, REVEAL, REVEAL + .6));
        for (const [m, lab] of [[23, '50.7%'], [57, '99.0%']]) {
          c.path([[cv.X(m), box.y + box.h], [cv.X(m), cv.Y(P(m))]], { color: 'gold', width: 1.5, dash: [6, 6], alpha: a });
          c.dot(cv.X(m), cv.Y(P(m)), { r: 10, alpha: a });
          c.text(lab, cv.X(m) - 14 * c.u, cv.Y(P(m)) - 22 * c.u, { font: 'latin', size: 44, weight: 500, color: 'gold', align: 'right', alpha: a, glow: 20 });
        }
      }
    } },

    // ------------------------------------------------ 转折：253 对连线
    { from: 63.6, to: 71, draw(c, k, lt) {
      const R = 280 * c.u, X = c.cx, Y = c.cy - 40 * c.u, P23 = Array.from({ length: N }, (_, i) => [X + Math.cos(-Math.PI / 2 + i / N * 2 * Math.PI) * R, Y + Math.sin(-Math.PI / 2 + i / N * 2 * Math.PI) * R]);
      const pairs = []; for (let i = 0; i < N; i++) for (let j = i + 1; j < N; j++) pairs.push([i, j]);
      // 先只连「我」（第 0 人）的 22 条，再铺满全部 253 条
      const mine = ease.io(prog(c.t, 64.4, 66.6)), all = ease.io(prog(c.t, 67.6, 70.2));
      c.sfx(64.4, 'whoosh', { dur: 1.2 }); c.sfx(67.6, 'whoosh', { dur: 1.8 });
      let shown = 0;
      pairs.forEach(([i, j], q) => {
        const isMine = i === 0, on = isMine ? (j - 1) / (N - 1) < mine : q / pairs.length < all; if (!on) return;
        shown++;
        c.path([P23[i], P23[j]], { color: isMine ? 'gold' : 'ice', width: isMine ? 1.6 : 1, alpha: isMine ? .8 : .28 });
      });
      P23.forEach(([px, py], i) => c.dot(px, py, { r: i ? 7 : 10, color: i ? 'ink' : 'gold', glow: i ? 0 : 20 }));
      c.text('我', P23[0][0], P23[0][1] - 26 * c.u, { font: 'sans', size: 24, color: 'gold' });
      c.num(shown, X, Y + 30 * c.u, { size: 120, color: shown > 22 ? 'ice' : 'gold', glow: 24 });
      c.text('对', X, Y + 76 * c.u, { font: 'sans', size: 24, color: 'dim' });
    } },

    // ------------------------------------------------ 尾声：生日攻击 → 金句 → 片尾卡
    { from: 71, to: 80, fo: 1.2, draw(c, k, lt) {
      const a = ease.out(prog(c.t, 71, 72)) * (1 - prog(c.t, 77.6, 78.4));
      c.text('HASH(a) = HASH(b)', c.cx, c.cy - 90 * c.u, { font: 'mono', size: 60, color: 'ice', alpha: a, glow: 20 });
      c.text('n 位哈希，大约试 2^(n/2) 次就会碰撞', c.cx, c.cy - 20 * c.u, { font: 'sans', size: 26, color: 'dim', alpha: a });
      const e = ease.out(prog(c.t, 77.8, 78.8)), dy = -(c.t - 77.8) * 6 * c.u;
      c.text(`《${c.m.title}》`, c.cx, 330 * c.u + dy, { size: 64, weight: 300, color: 'gold', alpha: e, glow: 20 });
      c.text('参考', c.cx, 450 * c.u + dy, { font: 'sans', size: 20, color: 'dim', track: 8, alpha: e });
      c.m.refs.forEach((r, i) => c.text(r, c.cx, 500 * c.u + i * 44 * c.u + dy, { font: 'latin', italic: true, size: 22, color: 'dim', alpha: e, max: 1500 }));
      c.text('假设：一年 365 天、生日均匀分布。现实中分布不均，撞上的概率只会更高。', c.cx, 640 * c.u + dy, { font: 'sans', size: 20, color: 'dim', alpha: e * .8 });
      c.sfx(77.8, 'chord', { root: -5, gain: -14 });
    } },
  ],
};
