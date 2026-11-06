/* =====================================================================
   流动笔触（油画）工具箱 —— 「笔触」世界用
   来源：ClawTouch《你怎么证明此刻不是梦？》拆解（见 references/visual.md）
   整个画面由成千上万根短笔触组成，每根沿一个缓慢变化的流场漂动；
   月亮、漩涡是流场里的涡旋。所有函数都是时间的纯函数，可逐帧复现。

   import { strokes, glowDisc, brushText, dreamBlur, grain, blueprint } from '/engine/brush.js';
   ===================================================================== */
import { rng, clamp, lerp, ease, hx } from '/engine/vibe.js';

// ------------------------------------------------ 值噪声 + 流场
function hash(i, j, k) {
  let h = Math.imul(i, 374761393) + Math.imul(j, 668265263) + Math.imul(k, 1274126177) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
const sm = t => t * t * (3 - 2 * t);
function noise3(x, y, z) {
  const i = Math.floor(x), j = Math.floor(y), k = Math.floor(z), u = sm(x - i), v = sm(y - j), w = sm(z - k);
  const L = (a, b, t) => a + (b - a) * t;
  return L(L(L(hash(i, j, k), hash(i + 1, j, k), u), L(hash(i, j + 1, k), hash(i + 1, j + 1, k), u), v),
           L(L(hash(i, j, k + 1), hash(i + 1, j, k + 1), u), L(hash(i, j + 1, k + 1), hash(i + 1, j + 1, k + 1), u), v), w);
}
const mixAngle = (a, b, w) => a + Math.atan2(Math.sin(b - a), Math.cos(b - a)) * Math.min(1, w);

// 流场：o.vortices 位置用画面比例（x 占宽、y 和 r 占高），dir 1 顺时针 / -1 逆时针
// o.bias 是整体基础方向（弧度，0 = 向右），o.turns 是噪声能把方向拧多少圈
function makeField(c, o = {}) {
  const { W, H } = c, sc = (o.scale ?? 2.2) / H, seed = (o.seed ?? 1) * 31.7, turns = o.turns ?? .55, bias = o.bias ?? 0, drift = o.drift ?? .05;
  const vs = (o.vortices ?? []).map(v => ({ x: v.x * W, y: v.y * H, r: v.r * H, dir: v.dir ?? 1, k: v.k ?? 1 }));
  return (x, y, t) => {
    let a = bias + (noise3(x * sc + seed, y * sc, t * drift) - .5) * Math.PI * 2 * turns;
    for (const v of vs) {
      const dx = x - v.x, dy = y - v.y, w = Math.exp(-(dx * dx + dy * dy) / (v.r * v.r));
      if (w > .02) a = mixAngle(a, Math.atan2(dy, dx) + v.dir * Math.PI / 2, w * v.k * 1.4);
    }
    return a;
  };
}

// ------------------------------------------------ 笔触层
// strokes(c, { id, area:[x0,y0,x1,y1](比例), count, colors:['#..'], len, width, alpha, period, travel, field:{...}, clip(x,c) })
// - count 按 1920×1080 计，竖屏自动按面积换算
// - period 一根笔触从出现到消失的秒数；travel 它在这段时间里沿流场走多远（1080 基准像素）
// - clip 可选：传一个函数在 x 上画路径（山丘、柏树轮廓），笔触只出现在里面
const cache = new Map();
export function strokes(c, o) {
  const { x, W, H, u, t } = c, key = `${o.id}|${W}x${H}`;
  let L = cache.get(key);
  if (!L) {
    const R = rng(o.seed ?? hashStr(o.id)), [x0, y0, x1, y1] = o.area ?? [0, 0, 1, 1], cols = o.colors ?? ['#ffffff'];
    const n = Math.round((o.count ?? 3000) * (W * H) / (1920 * 1080));
    L = { field: makeField(c, o.field), s: Array.from({ length: n }, () => ({
      x: lerp(x0, x1, R()) * W, y: lerp(y0, y1, R()) * H, ph: R(), col: cols[Math.floor(R() * cols.length)],
      lm: .6 + R() * .8, wm: .6 + R() * .8,
    })) };
    // 同色一起画，少切状态
    L.s.sort((a, b) => (a.col < b.col ? -1 : a.col > b.col ? 1 : 0));
    cache.set(key, L);
  }
  const f = L.field, len = (o.len ?? 26) * u, wid = (o.width ?? 3.2) * u, per = o.period ?? 7, trav = (o.travel ?? 60) * u, A = (o.alpha ?? .9) * c.A;
  if (A <= 0) return;
  x.save();
  if (o.clip) { x.beginPath(); o.clip(x, c); x.clip(); }
  x.lineCap = 'round';
  let cur = null;
  for (const s of L.s) {
    const q = (s.ph + t / per) % 1, life = Math.sin(Math.PI * q);
    if (life < .04) continue;
    // 沿流场走到当前位置（两步积分），再往回画一根弯曲笔触
    let px = s.x, py = s.y, d = q * trav * .5;
    for (let i = 0; i < 2; i++) { const a = f(px, py, t); px += Math.cos(a) * d; py += Math.sin(a) * d; }
    if (s.col !== cur) { cur = s.col; x.strokeStyle = cur; }
    x.globalAlpha = A * Math.min(1, life * 1.6);
    x.lineWidth = wid * s.wm;
    const seg = len * s.lm / 3;
    x.beginPath(); x.moveTo(px, py);
    for (let i = 0; i < 3; i++) { const a = f(px, py, t); px -= Math.cos(a) * seg; py -= Math.sin(a) * seg; x.lineTo(px, py); }
    x.stroke();
  }
  x.restore();
}
const hashStr = s => { let h = 7; for (const ch of String(s)) h = Math.imul(h ^ ch.charCodeAt(0), 2654435761); return h >>> 0; };

// ------------------------------------------------ 发光圆盘（月亮、意识光点）
export function glowDisc(c, cx, cy, r, o = {}) {
  const { x, u } = c, R = r * u, col = o.color ?? '#FFF1C8', [cr, cg, cb] = hx(col), a = (o.alpha ?? 1) * c.A, halo = (o.halo ?? 3.2) * R;
  x.save();
  const g = x.createRadialGradient(cx, cy, R * .6, cx, cy, halo);
  g.addColorStop(0, `rgba(${cr},${cg},${cb},${.55 * a})`); g.addColorStop(1, `rgba(${cr},${cg},${cb},0)`);
  x.fillStyle = g; x.beginPath(); x.arc(cx, cy, halo, 0, 7); x.fill();
  const d = x.createRadialGradient(cx - R * .25, cy - R * .25, R * .1, cx, cy, R);
  d.addColorStop(0, `rgba(255,255,245,${a})`); d.addColorStop(1, `rgba(${cr},${cg},${cb},${a})`);
  x.fillStyle = d; x.beginPath(); x.arc(cx, cy, R, 0, 7); x.fill();
  x.restore();
}

// ------------------------------------------------ 笔触聚字：大字由短笔触组成，k 0→1 从四散飞来聚拢
// brushText(c, '八减六', x, y, { size, k, colors, font, scatter, id })
const textCache = new Map();
export function brushText(c, str, cx, cy, o = {}) {
  const { x, u, t } = c, size = (o.size ?? 120) * u, key = `${str}|${size}|${o.font ?? ''}`;
  let pts = textCache.get(key);
  if (!pts) {
    const cv = document.createElement('canvas'), g = cv.getContext('2d'), font = `900 ${size}px ${o.font ?? '"Noto Serif SC", "Songti SC", serif'}`;
    g.font = font; const w = Math.ceil(g.measureText(str).width) + 20, h = Math.ceil(size * 1.3);
    cv.width = w; cv.height = h; g.font = font; g.textBaseline = 'middle'; g.fillStyle = '#fff'; g.fillText(str, 10, h / 2);
    const img = g.getImageData(0, 0, w, h).data, step = Math.max(2, Math.round(size / 40)), R = rng(hashStr(key));
    pts = [];
    for (let yy = 0; yy < h; yy += step) for (let xx = 0; xx < w; xx += step)
      if (img[(yy * w + xx) * 4 + 3] > 128) pts.push({ dx: xx - w / 2, dy: yy - h / 2, a: -.5 + (R() - .5) * .5, sx: (R() - .5) * 2, sy: (R() - .5) * 2, ph: R(), ci: R() });
    textCache.set(key, pts);
  }
  const k = ease.io(clamp(o.k ?? 1)), cols = o.colors ?? ['#FFF6E0', '#F2CF83', '#ffffff'], sc = (o.scatter ?? 600) * u, seg = size / 16, A = (o.alpha ?? 1) * c.A;
  x.save(); x.lineCap = 'round'; x.lineWidth = Math.max(1.5, size / 44);
  for (const p of pts) {
    const sp = (1 - k) ** 2, px = cx + p.dx + p.sx * sc * sp, py = cy + p.dy + p.sy * sc * sp, a = p.a + Math.sin(t * 1.3 + p.ph * 6) * .15;
    x.globalAlpha = A * (.35 + .65 * k); x.strokeStyle = cols[Math.floor(p.ci * cols.length)];
    x.beginPath(); x.moveTo(px - Math.cos(a) * seg / 2, py - Math.sin(a) * seg / 2); x.lineTo(px + Math.cos(a) * seg / 2, py + Math.sin(a) * seg / 2); x.stroke();
  }
  x.restore();
}

// ------------------------------------------------ 失焦醒来：把已画好的画面整体虚化 + 褪色 + 泛白
// 放在场景 draw 的最后调用；amt 0–1。字幕在叠加层，不受影响
let tmp = null;
export function dreamBlur(c, amt, o = {}) {
  if (amt <= .001) return;
  const { x, W, H, u } = c;
  if (!tmp || tmp.width !== W) { tmp = document.createElement('canvas'); tmp.width = W; tmp.height = H; }
  const g = tmp.getContext('2d'); g.setTransform(1, 0, 0, 1, 0, 0); g.globalAlpha = 1; g.filter = 'none'; g.clearRect(0, 0, W, H); g.drawImage(x.canvas, 0, 0);
  x.save(); x.setTransform(1, 0, 0, 1, 0, 0); x.globalAlpha = 1;
  x.filter = `blur(${amt * (o.blur ?? 22) * u}px) saturate(${1 - amt * .55}) brightness(${1 + amt * .25})`;
  x.drawImage(tmp, 0, 0); x.filter = 'none';
  x.fillStyle = o.wash ?? '#d8d2c8'; x.globalAlpha = amt * (o.washAlpha ?? .22); x.fillRect(0, 0, W, H);
  x.restore();
}

// ------------------------------------------------ 胶片颗粒（压住数字感）
let grainTiles = null;
export function grain(c, amount = .06) {
  const { x, W, H, t } = c;
  if (!grainTiles) grainTiles = [0, 1, 2, 3].map(s => {
    const cv = document.createElement('canvas'); cv.width = cv.height = 256; const g = cv.getContext('2d'), img = g.createImageData(256, 256), R = rng(s + 99);
    for (let i = 0; i < img.data.length; i += 4) { const v = R() * 255; img.data[i] = img.data[i + 1] = img.data[i + 2] = v; img.data[i + 3] = 255; }
    g.putImageData(img, 0, 0); return cv;
  });
  x.save(); x.setTransform(1, 0, 0, 1, 0, 0); x.globalAlpha = amount; x.globalCompositeOperation = 'overlay';
  x.fillStyle = x.createPattern(grainTiles[Math.floor(t * 24) % 4], 'repeat'); x.fillRect(0, 0, W, H);
  x.restore();
}

// ------------------------------------------------ 蓝图世界：深蓝底 + 细网格（思想实验 / 科学仪器段落）
export function blueprint(c, o = {}) {
  const { x, W, H, u } = c, A = (o.alpha ?? 1) * c.A, step = (o.step ?? 90) * u;
  x.save(); x.globalAlpha = A;
  x.fillStyle = o.bg ?? '#08111d'; x.fillRect(0, 0, W, H);
  x.strokeStyle = o.line ?? 'rgba(120,170,220,.10)'; x.lineWidth = 1;
  x.beginPath();
  for (let gx = (W / 2) % step; gx < W; gx += step) { x.moveTo(gx, 0); x.lineTo(gx, H); }
  for (let gy = (H / 2) % step; gy < H; gy += step) { x.moveTo(0, gy); x.lineTo(W, gy); }
  x.stroke(); x.restore();
}
