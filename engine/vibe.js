/* =====================================================================
   Vibe 知识短片运行时
   film.js 只描述「什么时候画什么」：字幕轨、章节、场景；这里负责世界背景、
   字幕排版、片名卡、常用图形组件、音效事件收集和逐帧导出。
   renderFrame(t) 是确定性的：同一个 t 永远得到同一帧。导入本模块不碰 DOM。
   ===================================================================== */

// ---------------------------------------------------------------- 工具
export function rng(seed) { return function () { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
export const clamp = (x, a = 0, b = 1) => Math.max(a, Math.min(b, x));
export const lerp = (a, b, k) => a + (b - a) * k;
export const prog = (t, a, b) => clamp((t - a) / (b - a));
// 区间 [a,b] 内的淡入淡出窗口
export const win = (t, a, b, fi = .6, fo = .6) => Math.max(0, Math.min(prog(t, a, a + fi), 1 - prog(t, b - fo, b)));
export const ease = {
  io: k => k < .5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2,
  out: k => 1 - Math.pow(1 - k, 3),
  in: k => k * k * k,
  sine: k => .5 - .5 * Math.cos(Math.PI * k),
  back: k => { const c = 1.7; return 1 + (c + 1) * Math.pow(k - 1, 3) + c * Math.pow(k - 1, 2); },
};
// 关键帧插值：kf(t, [[t0,v0],[t1,v1],...], ease.io)
export function kf(t, arr, e = k => k) {
  if (t <= arr[0][0]) return arr[0][1];
  for (let i = 1; i < arr.length; i++) if (t <= arr[i][0]) { const [a, va] = arr[i - 1], [b, vb] = arr[i]; return lerp(va, vb, e((t - a) / (b - a))); }
  return arr[arr.length - 1][1];
}
export const hx = h => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
export const rgba = (h, a) => { const [r, g, b] = hx(h); return `rgba(${r},${g},${b},${a})`; };
export const mixHex = (a, b, k) => '#' + hx(a).map((v, i) => Math.round(lerp(v, hx(b)[i], k)).toString(16).padStart(2, '0')).join('');

// ---------------------------------------------------------------- 字体与世界
// 先用开源 Noto（跨平台一致），没装就退到系统宋体/苹方
export const FONT = {
  serif: '"Noto Serif SC","Source Han Serif SC","Songti SC","STSong","SimSun",serif',
  sans: '"Noto Sans SC","Source Han Sans SC","PingFang SC","Hiragino Sans GB","Microsoft YaHei",sans-serif',
  latin: '"EB Garamond","Cormorant Garamond",Baskerville,Georgia,serif',
  mono: '"JetBrains Mono","SF Mono",Menlo,Consolas,monospace',
  type: '"Courier Prime","Courier New",Courier,monospace',
};
// 三套「世界」：颜色有语义——gold = 关键/正确，rose = 错误/危险，ice = 已知/可证
export const WORLDS = {
  night: { // 夜曲：抽象概念（数学、信息、逻辑）
    dark: true, bg: '#04050d', core: '#0c1431', ink: '#F4F2EC', gold: '#F2CF83', ice: '#64E3F6', rose: '#E84B75', dim: '#8C8FA6',
    paperCard: '#EDE4D3', subFont: 'serif', subWeight: 500, titleWeight: 300, stars: true,
  },
  gilt: { // 鎏金暗场：一门学问的编年史（年份 + 人 + 问题）
    dark: true, bg: '#0b0806', core: '#2a1a0c', ink: '#EEE6D6', gold: '#DDBD74', ice: '#86B3D1', rose: '#D9583C', dim: '#9C907E',
    paperCard: '#E8DCC2', subFont: 'serif', subWeight: 700, titleWeight: 900, dust: true,
  },
  paper: { // 宣纸水墨：国学、历史、人生道理（亮色，适合竖屏）
    dark: false, bg: '#ECE4D2', core: '#F4EEE0', ink: '#211C17', gold: '#9A7434', ice: '#3E6B88', rose: '#B53A2F', dim: '#7C7366',
    paperCard: '#F6F0E2', subFont: 'serif', subWeight: 700, titleWeight: 900, paper: true,
  },
};

// 场景声明的小糖：title(8, 13) 生成片名卡场景
export const title = (from, to, o = {}) => ({ from, to, fi: .4, fo: .8, ...o, draw: (c, k, lt) => c.titleCard(k, lt, o) });

// ---------------------------------------------------------------- 主体
export function createFilm(def, canvas) {
  const m = { fps: 30, size: '16:9', world: 'night', series: 'VIBE知识大赏', ...def.meta };
  if (!WORLDS[m.world]) throw new Error(`未知世界「${m.world}」：可选 ${Object.keys(WORLDS).join(' / ')}`);
  if (!['16:9', '9:16'].includes(m.size)) throw new Error(`size 只支持 16:9 或 9:16，收到「${m.size}」`);
  const [W, H] = m.size === '9:16' ? [1080, 1920] : [1920, 1080];
  canvas.width = W; canvas.height = H;
  const x = canvas.getContext('2d');
  const C = { ...WORLDS[m.world], ...(def.colors || {}) };
  const u = Math.min(W, H) / 1080;
  const vertical = H > W;
  const subs = (def.subs || []).map(s => ({ t0: s[0], t1: s[1], zh: s[2], en: s[3] || '', o: s[4] || {} }));
  const scenes = (def.scenes || []).map((s, i) => ({ fi: .6, fo: .6, z: 0, ...s, i })).sort((a, b) => a.z - b.z || a.i - b.i);
  const chapters = def.chapters || [];
  const duration = m.duration ?? Math.max(...scenes.map(s => s.to), ...subs.map(s => s.t1 + .5));
  const events = new Map();
  const col = n => C[n] ?? n;

  // ------------------------------------------------ 背景（预先生成，逐帧只做合成）
  const R = rng(m.seed ?? 7);
  const stars = Array.from({ length: Math.round(W * H / 7000) }, () => ({ x: R() * W, y: R() * H, r: .4 + R() ** 3 * 1.6, a: .15 + R() * .6, f: .3 + R() * 1.4, p: R() * 7 }));
  const dust = Array.from({ length: 46 }, () => ({ x: R() * W, y: R() * H, r: (20 + R() * 70) * u, a: .02 + R() * .05, vx: (R() - .5) * 6, vy: -2 - R() * 5 }));
  let paperTex = null;
  if (C.paper) {
    paperTex = document.createElement('canvas'); paperTex.width = W; paperTex.height = H;
    const p = paperTex.getContext('2d'), [r0, g0, b0] = hx(C.bg), img = p.createImageData(W, H), pr = rng(11);
    for (let i = 0; i < W * H; i++) { const n = (pr() - .5) * 10; img.data[i * 4] = r0 + n; img.data[i * 4 + 1] = g0 + n; img.data[i * 4 + 2] = b0 + n * .8; img.data[i * 4 + 3] = 255; }
    p.putImageData(img, 0, 0);
    p.strokeStyle = 'rgba(120,100,70,.06)'; p.lineWidth = 1;
    for (let i = 0; i < 900; i++) { const a = pr() * W, b = pr() * H, l = 10 + pr() * 40, th = pr() * Math.PI; p.beginPath(); p.moveTo(a, b); p.quadraticCurveTo(a + Math.cos(th) * l * .5 + 6, b + Math.sin(th) * l * .5, a + Math.cos(th) * l, b + Math.sin(th) * l); p.stroke(); }
    const g = p.createRadialGradient(W / 2, H / 2, Math.min(W, H) * .3, W / 2, H / 2, Math.hypot(W, H) * .6);
    g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(70,50,20,.22)'); p.fillStyle = g; p.fillRect(0, 0, W, H);
  }
  function drawBackground(t) {
    if (paperTex) { x.drawImage(paperTex, 0, 0); return; }
    x.fillStyle = C.bg; x.fillRect(0, 0, W, H);
    const g = x.createRadialGradient(W / 2, H * (C.dust ? .32 : .5), 0, W / 2, H / 2, Math.max(W, H) * .62);
    g.addColorStop(0, rgba(C.core, C.dust ? .9 : .85)); g.addColorStop(1, rgba(C.core, 0));
    x.fillStyle = g; x.fillRect(0, 0, W, H);
    if (C.stars) for (const s of stars) {
      x.globalAlpha = s.a * (.55 + .45 * Math.sin(t * s.f + s.p)); x.fillStyle = '#dfe6ff';
      x.beginPath(); x.arc((s.x + t * 1.5) % W, s.y, s.r * u, 0, 7); x.fill();
    }
    if (C.dust) for (const d of dust) {
      const px = ((d.x + t * d.vx) % W + W) % W, py = ((d.y + t * d.vy) % H + H) % H;
      const gg = x.createRadialGradient(px, py, 0, px, py, d.r); gg.addColorStop(0, rgba('#ffd9a0', d.a)); gg.addColorStop(1, rgba('#ffd9a0', 0));
      x.globalAlpha = 1; x.fillStyle = gg; x.fillRect(px - d.r, py - d.r, d.r * 2, d.r * 2);
    }
    x.globalAlpha = 1;
  }
  function drawVignette() {
    if (!C.dark) return;
    const g = x.createRadialGradient(W / 2, H / 2, Math.min(W, H) * .35, W / 2, H / 2, Math.hypot(W, H) * .58);
    g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,.55)'); x.fillStyle = g; x.fillRect(0, 0, W, H);
  }

  // ------------------------------------------------ 绘图上下文：场景里用 c.xxx
  const c = {
    x, W, H, u, C, m, vertical, t: 0, A: 1, cx: W / 2, cy: H / 2, duration,
    rng, clamp, lerp, prog, win, ease, kf, rgba, mixHex, col,

    // 音效事件：在哪一帧调都行，同一个（时刻，名字）只记一次
    sfx(T, name, o = {}) { events.set(`${T.toFixed(3)}|${name}`, { t: +T.toFixed(3), name, ...o }); },

    font(o) { return `${o.italic ? 'italic ' : ''}${o.weight ?? 400} ${(o.size ?? 40) * u}px ${FONT[o.font ?? 'serif'] ?? o.font}`; },
    // 文本：返回宽度。o = {font,size,weight,color,align,base,alpha,track,italic,glow,max}
    text(str, X, Y, o = {}) {
      x.save();
      x.font = c.font(o); x.textAlign = o.align ?? 'center'; x.textBaseline = o.base ?? 'alphabetic';
      x.letterSpacing = `${(o.track ?? 0) * u}px`;
      x.globalAlpha = c.A * (o.alpha ?? 1); x.fillStyle = col(o.color ?? 'ink');
      let w = x.measureText(str).width;
      if (o.max && w > o.max * u) { const k = o.max * u / w; x.font = c.font({ ...o, size: (o.size ?? 40) * k }); w = o.max * u; }
      // 辉光只在暗色世界有意义；亮色世界里会糊成一团
      if (o.glow && C.dark) { x.shadowColor = col(o.glowColor ?? o.color ?? 'gold'); x.shadowBlur = o.glow * u; }
      else if (o.shadow !== false && C.dark) { x.shadowColor = 'rgba(0,0,0,.65)'; x.shadowBlur = 14 * u; }
      x.fillText(str, X, Y);
      x.restore();
      return w;
    },
    // 富文本：[词] 染金，{词} 染红；整行按 align 排
    rich(str, X, Y, o = {}) {
      const segs = []; let mode = 'ink', buf = '';
      for (const ch of str) {
        if (ch === '[' || ch === '{') { if (buf) segs.push([buf, mode]); buf = ''; mode = ch === '[' ? 'gold' : 'rose'; }
        else if ((ch === ']' && mode === 'gold') || (ch === '}' && mode === 'rose')) { if (buf) segs.push([buf, mode]); buf = ''; mode = 'ink'; }
        else buf += ch;
      }
      if (buf) segs.push([buf, mode]);
      x.save(); x.font = c.font(o); x.letterSpacing = `${(o.track ?? 0) * u}px`;
      const ws = segs.map(s => x.measureText(s[0]).width); let total = ws.reduce((a, b) => a + b, 0);
      x.restore();
      let k = 1; if (o.max && total > o.max * u) { k = o.max * u / total; total *= k; }
      let left = o.align === 'left' ? X : o.align === 'right' ? X - total : X - total / 2;
      segs.forEach(([s, md], i) => {
        c.text(s, left, Y, { ...o, size: (o.size ?? 40) * k, align: 'left', color: md === 'ink' ? (o.color ?? 'ink') : md, glow: md !== 'ink' && C.dark ? (o.hlGlow ?? 16) : o.glow, max: undefined });
        left += ws[i] * k;
      });
      return total;
    },
    // 打字机：逐字出现，每个字记一声 tick；返回已打出的字数
    type(str, X, Y, t0, cps = 8, o = {}) {
      const chars = [...str];
      chars.forEach((ch, i) => { if (!/[\s，。、：；！？,.!?「」“”_]/.test(ch)) c.sfx(t0 + i / cps, 'tick', { pitch: 1 + (i % 4) * .05, gain: o.tickGain ?? -24 }); });
      const n = clamp(Math.floor((c.t - t0) * cps + 1), 0, chars.length);
      x.save(); x.font = c.font(o); x.letterSpacing = `${(o.track ?? 0) * u}px`; const full = x.measureText(str).width; x.restore();
      const left = o.align === 'left' ? X : X - full / 2;
      const w = c.text(chars.slice(0, n).join(''), left, Y, { ...o, align: 'left' });
      if (o.cursor && (n < chars.length || Math.floor(c.t * 2) % 2 === 0)) c.box(left + w + 6 * u, Y - (o.size ?? 40) * u * .85, 3 * u, (o.size ?? 40) * u, { fill: 'gold', alpha: o.alpha });
      return n;
    },
    num(v, X, Y, o = {}) {
      const s = (o.prefix ?? '') + (o.digits != null ? v.toFixed(o.digits) : Math.round(v).toLocaleString('en-US')) + (o.suffix ?? '');
      return c.text(s, X, Y, { font: 'latin', weight: 500, ...o });
    },
    box(X, Y, w, h, o = {}) {
      x.save(); x.globalAlpha = c.A * (o.alpha ?? 1);
      x.beginPath(); x.roundRect(X, Y, w, h, (o.radius ?? 0) * u);
      if (o.fill) { x.fillStyle = col(o.fill); x.fill(); }
      if (o.stroke) { x.strokeStyle = col(o.stroke); x.lineWidth = (o.width ?? 1.5) * u; x.stroke(); }
      x.restore();
    },
    dot(X, Y, o = {}) {
      x.save(); x.globalAlpha = c.A * (o.alpha ?? 1); x.fillStyle = col(o.color ?? 'gold');
      if (o.glow ?? C.dark) { x.shadowColor = col(o.color ?? 'gold'); x.shadowBlur = (o.glow || 18) * u; }
      x.beginPath(); x.arc(X, Y, (o.r ?? 6) * u, 0, 7); x.fill(); x.restore();
    },
    // 折线逐段画出：pts = [[x,y],...]，o.p ∈ [0,1] 画出的比例；返回笔尖位置
    path(pts, o = {}) {
      const L = [0]; for (let i = 1; i < pts.length; i++) L.push(L[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
      const end = L[L.length - 1] * clamp(o.p ?? 1); let tip = pts[0];
      x.save(); x.globalAlpha = c.A * (o.alpha ?? 1); x.strokeStyle = col(o.color ?? 'ink'); x.lineWidth = (o.width ?? 2) * u;
      x.lineCap = 'round'; x.lineJoin = 'round'; if (o.dash) x.setLineDash(o.dash.map(d => d * u));
      if (o.glow && C.dark) { x.shadowColor = col(o.color ?? 'gold'); x.shadowBlur = o.glow * u; }
      x.beginPath(); x.moveTo(...pts[0]);
      for (let i = 1; i < pts.length; i++) {
        if (L[i] <= end) { x.lineTo(...pts[i]); tip = pts[i]; continue; }
        const k = (end - L[i - 1]) / (L[i] - L[i - 1] || 1); tip = [lerp(pts[i - 1][0], pts[i][0], k), lerp(pts[i - 1][1], pts[i][1], k)]; x.lineTo(...tip); break;
      }
      x.stroke(); x.restore();
      return tip;
    },
    // 函数曲线：box = {x,y,w,h}，域 [x0,x1]、值域 [y0,y1]；返回坐标映射，方便在曲线上标点
    curve(fn, o = {}) {
      const b = o.box, [x0, x1] = o.dom ?? [0, 1], [y0, y1] = o.range ?? [0, 1], n = o.samples ?? 160;
      const X = v => b.x + (v - x0) / (x1 - x0) * b.w, Y = v => b.y + b.h - (v - y0) / (y1 - y0) * b.h;
      const pts = Array.from({ length: n + 1 }, (_, i) => { const v = lerp(x0, x1, i / n); return [X(v), Y(fn(v))]; });
      const tip = c.path(pts, { color: 'gold', width: 3, glow: C.dark ? 14 : 0, ...o });
      return { X, Y, tip };
    },
    axes(b, o = {}) {
      const a = o.alpha ?? 1, cl = o.color ?? 'dim';
      c.path([[b.x, b.y], [b.x, b.y + b.h], [b.x + b.w, b.y + b.h]], { color: cl, width: 1.5, alpha: a, p: o.p ?? 1 });
      if (o.xlabel) c.text(o.xlabel, b.x + b.w + 24 * u, b.y + b.h + 8 * u, { font: 'sans', size: 22, color: cl, align: 'left', alpha: a });
      if (o.ylabel) c.text(o.ylabel, b.x, b.y - 18 * u, { font: 'sans', size: 22, color: cl, align: 'left', alpha: a });
      for (const [v, lab] of o.xticks ?? []) { c.text(lab, b.x + v * b.w, b.y + b.h + 30 * u, { font: 'latin', size: 22, color: cl, alpha: a }); }
    },
    // 沿路径跑的光点，带彗尾：pos(u) → [x,y]
    comet(pos, at, o = {}) {
      const n = o.tail ?? 18, len = o.len ?? .08;
      for (let i = n; i >= 0; i--) { const q = at - len * i / n; if (q < 0) continue; const [px, py] = pos(q); c.dot(px, py, { r: (o.r ?? 6) * (1 - i / n * .8), color: o.color ?? 'gold', alpha: (o.alpha ?? 1) * (1 - i / n) ** 1.5, glow: i ? 0 : 24 }); }
    },
    ring(X, Y, t0, o = {}) {
      const k = prog(c.t, t0, t0 + (o.dur ?? 1.4)); if (k <= 0 || k >= 1) return;
      x.save(); x.globalAlpha = c.A * (1 - k) * (o.alpha ?? .8); x.strokeStyle = col(o.color ?? 'gold'); x.lineWidth = 2 * u;
      x.beginPath(); x.arc(X, Y, lerp(o.r0 ?? 10, o.r1 ?? 260, ease.out(k)) * u, 0, 7); x.stroke(); x.restore();
    },
    // 一帧闪亮：章节开头、定理落地。默认带一声 bloom
    flash(t0, o = {}) {
      if (o.sound !== false) c.sfx(t0, o.sound ?? 'bloom', { gain: o.gain });
      const k = c.t - t0; if (k < 0 || k > .5) return;
      x.save(); x.globalAlpha = Math.exp(-k * 14) * (o.amount ?? .85); x.fillStyle = C.dark ? '#ffffff' : '#fffaf0'; x.fillRect(0, 0, W, H); x.restore();
    },
    // 纸卡：o = {rot, fill, shadow}
    card(X, Y, w, h, o = {}) {
      x.save(); x.globalAlpha = c.A * (o.alpha ?? 1); x.translate(X + w / 2, Y + h / 2); x.rotate((o.rot ?? 0) * Math.PI / 180);
      x.shadowColor = 'rgba(0,0,0,.45)'; x.shadowBlur = 30 * u; x.shadowOffsetY = 10 * u;
      const g = x.createLinearGradient(-w / 2, -h / 2, w / 2, h / 2), base = col(o.fill ?? 'paperCard');
      g.addColorStop(0, mixHex(base, '#ffffff', .12)); g.addColorStop(1, mixHex(base, '#8a7350', .18));
      x.fillStyle = g; x.beginPath(); x.roundRect(-w / 2, -h / 2, w, h, (o.radius ?? 6) * u); x.fill();
      x.restore();
    },
    // 红色印章（阴文）：方形，字从右列起竖排
    seal(X, Y, str, o = {}) {
      const s = (o.size ?? 90) * u, ch = [...str], cols = ch.length <= 2 ? 1 : 2, rows = Math.ceil(ch.length / cols);
      const cw = s / cols, rh = s / rows;
      x.save(); x.globalAlpha = c.A * (o.alpha ?? .92); x.translate(X, Y); x.rotate((o.rot ?? -4) * Math.PI / 180);
      x.fillStyle = col(o.color ?? 'rose'); x.beginPath(); x.roundRect(-s / 2, -s / 2, s, s, 6 * u); x.fill();
      x.fillStyle = '#F6EEDD'; x.font = `900 ${Math.min(cw, rh) * .74}px ${FONT.serif}`; x.textAlign = 'center'; x.textBaseline = 'middle';
      ch.forEach((cc, i) => { const cl = Math.floor(i / rows), rw = i % rows; x.fillText(cc, s / 2 - cw * (cl + .5), -s / 2 + rh * (rw + .5)); });
      x.restore();
    },
    // 文献复原卡：真实标题排版 + 做旧纸 + 印章 + 「示意」
    doc(o) {
      const w = (o.w ?? 640) * u, h = (o.h ?? 400) * u, X = o.x - w / 2, Y = o.y - h / 2, a = o.alpha ?? 1;
      c.card(X, Y, w, h, { rot: o.rot ?? -2, alpha: a });
      x.save(); x.translate(o.x, o.y); x.rotate((o.rot ?? -2) * Math.PI / 180); x.translate(-o.x, -o.y);
      const ink = '#2a231b', txt = (s, yy, oo) => c.text(s, o.x, Y + yy * u, { color: ink, shadow: false, alpha: a, max: (o.w ?? 640) - 60, ...oo });
      if (o.top) txt(o.top, 58, { font: 'latin', size: 20, track: 4 });
      txt(o.title, h / u * .45, { font: 'latin', italic: true, size: o.titleSize ?? 46, weight: 500 });
      if (o.zh) txt(o.zh, h / u * .45 + 52, { font: 'serif', size: 26, weight: 700 });
      if (o.author) txt(o.author, h / u * .78, { font: 'latin', size: 24, track: 2 });
      x.restore();
      if (o.seal) c.seal(o.x + w * .36, o.y + h * .3, o.seal, { size: 74, alpha: a * .9 });
      c.text(o.note ?? '图为示意', X + w, Y + h + 30 * u, { font: 'sans', size: 18, color: 'dim', align: 'right', alpha: a * .8 });
    },
    // 规则卡：items = [[中文, English], ...]，k 控制逐条出现
    rules(o) {
      const n = o.items.length, w = (o.w ?? 900) * u, lh = (o.lh ?? 92) * u, h = 170 * u + n * lh, X = c.cx - w / 2, Y = (o.y ?? c.cy) - h / 2, a = o.alpha ?? 1;
      if (C.dark) c.box(X, Y, w, h, { stroke: 'gold', alpha: .5 * a, radius: 6 }); else c.card(X, Y, w, h, { alpha: a });
      c.text(o.title ?? '游戏规则', c.cx, Y + 72 * u, { size: 40, weight: 700, color: 'gold', alpha: a });
      if (o.en) c.text(o.en, c.cx, Y + 112 * u, { font: 'latin', italic: true, size: 24, color: 'dim', alpha: a });
      o.items.forEach(([zh, en], i) => {
        const ia = a * ease.out(prog(o.k ?? 1, i / n, (i + .8) / n)); if (ia <= 0) return;
        const yy = Y + 170 * u + lh * i + 34 * u;
        c.text(`${'①②③④⑤⑥'[i]} ${zh}`, X + 70 * u, yy, { size: 32, align: 'left', alpha: ia, weight: 500 });
        if (en) c.text(en, X + 116 * u, yy + 34 * u, { font: 'latin', italic: true, size: 21, align: 'left', color: 'dim', alpha: ia });
      });
    },
    // 片名卡：小号系列名 → 大字片名 → 副标题 → 英文
    titleCard(k, lt, o = {}) {
      const a1 = ease.out(prog(lt, 0, .9)), a2 = ease.out(prog(lt, .35, 1.4)), a3 = ease.out(prog(lt, .9, 1.9));
      const y = c.cy + (o.dy ?? 0) * u, big = (o.size ?? (vertical ? 150 : 132));
      const s = 1 + lt * .008; x.translate(c.cx, c.cy); x.scale(s, s); x.translate(-c.cx, -c.cy);   // 缓慢推近
      c.text(m.series, c.cx, y - big * u * .95, { font: 'sans', size: 24, track: 14, color: 'gold', alpha: a1 * .85, weight: 500 });
      x.save(); x.filter = `blur(${(1 - a2) * 10 * u}px)`;
      c.text(`《${m.title}》`, c.cx, y + big * u * .2, { size: big, weight: C.titleWeight, color: C.dark ? 'gold' : 'ink', alpha: a2, track: big * .04, glow: C.dark ? 26 : 0 });
      x.restore();
      c.path([[c.cx - 260 * u * a2, y + big * u * .55], [c.cx + 260 * u * a2, y + big * u * .55]], { color: 'gold', width: 1.2, alpha: a2 * .7 });
      if (m.subtitle) c.text(m.subtitle, c.cx, y + big * u * .55 + 62 * u, { size: 34, alpha: a3, weight: 500 });
      if (m.en) c.text(m.en, c.cx, y + big * u * .55 + 108 * u, { font: 'latin', italic: true, size: 26, color: 'dim', alpha: a3 });
      if (o.sound !== false) c.sfx(c.t - lt, 'bloom', { gain: o.gain ?? -10 });
    },
  };

  // ------------------------------------------------ 叠加层：水印、章节标、字幕
  function drawOverlay(t) {
    if (m.author) c.text(m.author, 48 * u, 64 * u, { font: 'sans', size: 22, align: 'left', color: 'dim', alpha: .55, shadow: false });
    let ch = null; for (const cc of chapters) if (t >= cc[0]) ch = cc;
    if (ch && (ch[3] == null || t < ch[3])) {
      const a = win(t, ch[0], ch[3] ?? duration + 1, .8, .6);
      c.text(`${ch[1]}${ch[2] ? '  ' + ch[2] : ''}`, vertical ? c.cx : W - 48 * u, 64 * u, { font: 'mono', size: 20, track: 4, align: vertical ? 'center' : 'right', color: 'gold', alpha: .75 * a, shadow: false });
    }
    for (const s of subs) {
      if (t < s.t0 - .01 || t > s.t1 + .4) continue;
      const a = Math.min(ease.out(prog(t, s.t0, s.t0 + .35)), 1 - prog(t, s.t1, s.t1 + .3)); if (a <= 0) continue;
      const rise = (1 - ease.out(prog(t, s.t0, s.t0 + .5))) * 10 * u;
      const size = (s.o.size ?? (vertical ? 54 : 46)) * (s.o.big ? 1.35 : 1);
      const y = (s.o.y ?? (vertical ? .79 : .865)) * H + rise;
      c.rich(s.zh, W / 2, y, { size, weight: C.subWeight, font: s.o.font ?? C.subFont, alpha: a, max: W / u * .88 });
      if (s.en) c.text(s.en, W / 2, y + size * u * .95, { font: 'latin', italic: true, size: size * .56, color: 'dim', alpha: a * .9, max: W / u * .88 });
    }
  }

  function renderFrame(t) {
    c.t = t; c.A = 1;
    x.setTransform(1, 0, 0, 1, 0, 0); x.globalAlpha = 1; x.globalCompositeOperation = 'source-over'; x.filter = 'none';
    drawBackground(t);
    for (const s of scenes) {
      if (t < s.from || t > s.to) continue;
      const a = win(t, s.from, s.to, s.fi, s.fo); if (a <= 0 && !s.always) continue;
      c.A = a; x.save();
      s.draw(c, prog(t, s.from, s.to), t - s.from, a);
      x.restore(); c.A = 1;
    }
    drawVignette();
    drawOverlay(t);
  }

  // 全片出现过的文字：用来预加载字体分片
  const allText = [m.title, m.subtitle, m.en, m.series, m.author, ...subs.flatMap(s => [s.zh, s.en]), ...chapters.flatMap(cc => [cc[1], cc[2]]), ...(def.strings ?? [])].filter(Boolean).join('') + '0123456789%.,①②③④⑤⑥《》「」？！图为示意';

  return { meta: { ...m, W, H, duration }, subs, renderFrame, allText, events: () => [...events.values()].sort((a, b) => a.t - b.t), ctx: c };
}

// 等字体分片下载完：canvas 不会自动触发 webfont 加载
export async function loadFonts(text) {
  const fams = ['"Noto Serif SC"', '"Noto Sans SC"', '"EB Garamond"', '"JetBrains Mono"'];
  const jobs = [];
  for (const f of fams) for (const w of [300, 400, 500, 700, 900]) { jobs.push(document.fonts.load(`${w} 40px ${f}`, text)); jobs.push(document.fonts.load(`italic ${w} 40px ${f}`, text)); }
  await Promise.race([Promise.allSettled(jobs), new Promise(r => setTimeout(r, 15000))]);
  await document.fonts.ready;
}
