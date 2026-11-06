/* =====================================================================
   示例《笔触世界》—— 16 秒演示 engine/brush.js 的四个手法
   ① 整幅画由流动笔触组成（天空漩涡、月亮、远山、河光、草地、柏树）
   ② 笔触聚字  ③ 失焦醒来转场  ④ 切到蓝图世界，梦境缩成画中画
   拆解来源：ClawTouch《你怎么证明此刻不是梦？》，见 references/visual.md「笔触世界」
   ===================================================================== */
import { prog, ease, lerp } from '/engine/vibe.js';
import { strokes, glowDisc, brushText, dreamBlur, grain, blueprint } from '/engine/brush.js';

const MOON = [.78, .22];

// 整幅油画风景；在任何 transform 下都能画（画中画就是缩放后再画一遍）
function landscape(c, o = {}) {
  const { x, W, H } = c, A = c.A;
  // 底色：先铺一层暗色，笔触盖在上面
  const g = x.createLinearGradient(0, 0, 0, H * .66);
  g.addColorStop(0, '#121226'); g.addColorStop(1, '#262540');
  x.globalAlpha = A; x.fillStyle = g; x.fillRect(0, 0, W, H * .66);
  x.fillStyle = '#16200f'; x.fillRect(0, H * .64, W, H * .36);
  strokes(c, {
    id: 'sky', area: [-.03, -.03, 1.03, .66], count: o.lite ? 2200 : 5200, len: 34, width: 3.6, period: 9, travel: 50,
    colors: ['#2a2a4e', '#38375e', '#1d1d38', '#4d4b72', '#6c6888', '#a89a7c', '#d9c99a'],
    field: { bias: .15, turns: .8, scale: 2.4, vortices: [{ x: MOON[0], y: MOON[1], r: .17, k: 1.2 }, { x: .4, y: .2, r: .13, dir: -1 }, { x: .12, y: .08, r: .1 }] },
  });
  glowDisc(c, MOON[0] * W, MOON[1] * H, 62, { color: '#F7E7B0', halo: 3 });
  // 远山 + 河光
  const hill = (x) => { x.moveTo(0, H * .62); for (let i = 0; i <= 12; i++) x.lineTo(W * i / 12, H * (.6 + Math.sin(i * 1.7) * .018)); x.lineTo(W, H * .7); x.lineTo(0, H * .7); x.closePath(); };
  strokes(c, { id: 'hill', area: [0, .57, 1, .71], count: 1500, len: 22, width: 3, colors: ['#24305a', '#2e4268', '#1a2244', '#3d5680'], field: { bias: 0, turns: .25 }, clip: hill });
  strokes(c, { id: 'river', area: [0, .665, 1, .69], count: 500, len: 30, width: 2.4, period: 5, travel: 90, colors: ['#8fb1dc', '#e8dfb5', '#5b7fb2'], field: { bias: 0, turns: .08 } });
  // 草地：笔触竖着长
  strokes(c, { id: 'grass', area: [0, .68, 1, 1.02], count: o.lite ? 1500 : 3600, len: 24, width: 3, period: 6, travel: 14, colors: ['#3b5528', '#55713a', '#2a3f1e', '#7d8f4e', '#a3a86a'], field: { bias: -Math.PI / 2, turns: .22, scale: 4 } });
  // 柏树：火焰形轮廓里的竖向深绿笔触
  const cyp = (x) => { const cx = W * .16, b = H * .97, top = H * .2; x.moveTo(cx, top); x.bezierCurveTo(cx + W * .045, H * .45, cx + W * .05, H * .8, cx + W * .03, b); x.lineTo(cx - W * .03, b); x.bezierCurveTo(cx - W * .05, H * .8, cx - W * .04, H * .45, cx, top); };
  x.globalAlpha = A; x.fillStyle = '#0f1a10'; x.beginPath(); cyp(x); x.fill();
  strokes(c, { id: 'cypress', area: [.1, .18, .22, .98], count: 900, len: 30, width: 3.2, period: 8, travel: 20, colors: ['#1f3a22', '#2f5530', '#3f6b3a', '#152a17'], field: { bias: -Math.PI / 2, turns: .35, vortices: [{ x: .16, y: .6, r: .08 }] }, clip: cyp });
  x.globalAlpha = 1;
}

export default {
  meta: {
    title: '笔触世界', subtitle: 'engine/brush.js 演示', en: 'Brushstroke World',
    world: 'night', size: '16:9', fps: 30, duration: 16, titleAt: 6, cover: 5,
    music: { bpm: 70, key: 'Am', sections: [[0, 'pad']] },
  },
  colors: { bg: '#000000', core: '#000000', stars: false },
  subs: [
    [0.6, 4.2, '这片天空，是一根一根[笔触]画出来的。', 'This sky is painted one brushstroke at a time.'],
    [5.0, 9.4, '连字也是笔触聚成的；醒来时，整幅画失焦褪色。', 'Even the words are strokes; waking blurs the painting away.'],
    [11.0, 15.6, '换到[蓝图]讲科学，梦缩成一幅画中画。', 'Switch to the blueprint for science; the dream shrinks into a frame.'],
  ],
  scenes: [
    { from: 0, to: 10.6, fi: .8, fo: .6, draw(c, k, lt) {
      // 慢推近，避免死帧
      const s = 1 + lt * .006; c.x.translate(c.cx, c.cy); c.x.scale(s, s); c.x.translate(-c.cx, -c.cy);
      landscape(c);
      c.x.setTransform(1, 0, 0, 1, 0, 0);
      const kt = prog(lt, 2.6, 5.4) - prog(lt, 7.6, 8.4);
      if (kt > 0) brushText(c, '此刻，你醒着。', c.cx, c.H * .3, { size: 132, k: kt, alpha: Math.min(1, kt * 1.5) });
      dreamBlur(c, ease.io(prog(lt, 7.4, 10.2)));
      grain(c, .07);
    } },
    { from: 10, to: 16, fi: .9, fo: .8, z: 1, draw(c, k, lt) {
      const { x, W, H, u } = c;
      blueprint(c);
      // 罐子线稿
      const vx = W * .3, vy = H * .2, vw = W * .17, vh = H * .52, p = ease.out(prog(lt, .3, 2));
      c.path([[vx, vy], [vx, vy + vh], [vx + vw, vy + vh], [vx + vw, vy]], { color: '#8fc3ee', width: 1.6, p, alpha: .8 });
      c.path([[vx - 8 * u, vy], [vx + vw + 8 * u, vy]], { color: '#8fc3ee', width: 2.4, p, alpha: .8 });
      c.text('缸中之脑', vx - 30 * u, vy + 40 * u, { size: 26, align: 'right', color: '#cfe3f5', alpha: p });
      // 画中画：刚才的梦缩成右侧的一幅画，连线接到罐子
      const q = ease.io(prog(lt, .8, 3)), fw = lerp(W, W * .26, q), fh = fw * H / W, fx = lerp(0, W * .6, q), fy = lerp(0, H * .2, q);
      x.save(); x.beginPath(); x.rect(fx, fy, fw, fh); x.clip();
      x.translate(fx, fy); x.scale(fw / W, fw / W); landscape(c, { lite: true });
      x.restore();
      x.save(); x.globalAlpha = c.A * q; x.strokeStyle = '#cfe3f5'; x.lineWidth = 1.5 * u; x.strokeRect(fx, fy, fw, fh); x.restore();
      for (let i = 0; i < 4; i++) {
        const a = [vx + vw * .5, vy + vh * .4], b = [fx, fy + fh * (.2 + i * .2)], m = [lerp(a[0], b[0], .5), Math.min(a[1], b[1]) - 60 * u];
        const pts = Array.from({ length: 20 }, (_, j) => { const s = j / 19; return [lerp(lerp(a[0], m[0], s), lerp(m[0], b[0], s), s), lerp(lerp(a[1], m[1], s), lerp(m[1], b[1], s), s)]; });
        c.path(pts, { color: '#cfe3f5', width: 1, dash: [4, 6], p: ease.out(prog(lt, 2.2 + i * .15, 3.6)), alpha: .6 });
      }
      grain(c, .05);
    } },
  ],
  strings: ['此刻，你醒着。缸中之脑'],
};
