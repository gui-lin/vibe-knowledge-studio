# 引擎 API

## film.js 格式

```js
import { title, rng, prog, ease, kf, lerp } from '/engine/vibe.js';   // 绝对路径：影片目录放哪都能用

export default {
  meta: {
    title: '片名', subtitle: '副标题一句话', en: 'English Title', author: '@你的账号',
    world: 'night',            // night | gilt | paper
    size: '16:9',              // 16:9（1920×1080）| 9:16（1080×1920）
    fps: 30, duration: 130,
    titleAt: 9.47,             // 片名卡时刻（体检用；封面默认取它后 2 秒）
    cover: 11.5,               // 可选：封面时刻
    loudness: -14,             // 可选
    music: { bpm: 76, key: 'Am', sections: [[0, 'pad'], [9.47, 'full'], ...] },   // 或 { file, gain, offset }
    refs: ['作者, 题名, 期刊 (年份)', ...],
  },
  colors: { gold: '#…' },      // 可选：覆盖世界配色
  chapters: [[14, '01 题', 'THE PROBLEM'], ..., [70, '尾声', 'CODA', 80]],   // [起, 中文, 英文, 可选止]
  subs: [[0.6, 3.6, '一个班，[23] 个人。', 'A class of 23.', { big: true }], ...],
  scenes: [
    { from: 0, to: 9.2, draw(c, k, lt, a) { ... } },   // k = 场景内进度 0–1，lt = 场景内秒数，a = 淡入淡出
    title(9.47, 14.2),
  ],
  strings: ['场景里画的、字幕里没有的中文'],   // 可选：让字体分片提前加载
};
```

字幕选项：`big`（放大 1.35 倍）、`y`（0–1，纵向位置）、`size`、`font`。
场景选项：`fi`/`fo`（淡入淡出秒数，默认 0.6）、`z`（层级）。场景之间可以重叠。

文件顶层可以做计算（模拟、搜种子），但**不要碰 DOM**——渲染器会在浏览器里导入它。

## `c` 上下文

| 成员 | 说明 |
|---|---|
| `c.x` | CanvasRenderingContext2D，组件不够用时直接画 |
| `c.W` `c.H` `c.cx` `c.cy` | 画布尺寸与中心 |
| `c.u` | 尺寸单位：短边 / 1080。**所有长度乘 `c.u`**，横竖屏通用 |
| `c.t` | 当前全片时间（秒） |
| `c.A` | 当前场景透明度（组件自动乘上） |
| `c.C` / `c.col(name)` | 世界配色；颜色参数可以写 `'gold'` 或 `'#hex'` |
| `c.m` | meta |
| `c.vertical` | 是否竖屏 |
| `prog` `win` `ease` `kf` `lerp` `clamp` `rng` `rgba` `mixHex` | 工具 |

## 组件

所有尺寸参数是"1080 基准下的像素"，组件内部会乘 `c.u`；位置参数是真实像素（自己乘 `c.u`）。

| 组件 | 签名 | 说明 |
|---|---|---|
| `text` | `(str, x, y, {font, size, weight, color, align, base, alpha, track, italic, glow, max, shadow})` | font: serif / sans / latin / mono / type。`max` 超宽自动缩。返回宽度 |
| `rich` | `(str, x, y, opts)` | `[金]` `{红}` 标记 |
| `type` | `(str, x, y, t0, cps=8, {cursor, tickGain, ...text})` | 打字机，每字自动记一声 tick。返回已出字数 |
| `num` | `(v, x, y, {digits, prefix, suffix, ...text})` | 数字，默认千分位 |
| `box` | `(x, y, w, h, {fill, stroke, width, radius, alpha})` | |
| `dot` | `(x, y, {r, color, glow, alpha})` | |
| `path` | `(pts, {p, color, width, dash, glow, alpha})` | 折线逐段画出，`p` 0–1；返回笔尖 |
| `curve` | `(fn, {box:{x,y,w,h}, dom:[x0,x1], range:[y0,y1], p, samples, ...path})` | 返回 `{X, Y, tip}` 映射 |
| `axes` | `(box, {xlabel, ylabel, xticks:[[0–1, '标签']], p, alpha})` | |
| `comet` | `(pos(u)→[x,y], at, {r, color, tail, len})` | 沿路径的光点 + 彗尾 |
| `ring` | `(x, y, t0, {dur, r0, r1, color})` | 扩散细环 |
| `flash` | `(t0, {amount, sound='bloom' \| false, gain})` | 一帧闪亮 + 音 |
| `card` | `(x, y, w, h, {rot, fill, radius, alpha})` | 做旧纸卡 |
| `seal` | `(x, y, str, {size, rot, color})` | 红印章，2–4 字 |
| `doc` | `({x, y, w, h, rot, top, title, titleSize, zh, author, seal, note})` | 文献复原卡，默认标"图为示意" |
| `rules` | `({title, en, items:[[中,英]], k, y, w})` | 规则卡，`k` 控制逐条出现 |
| `titleCard` | `(k, lt, {dy, size, sound})` | 片名卡；一般直接用 `title(from, to)` |
| `sfx` | `(t, name, {gain, pitch, dur, root})` | 事件音，见 sound.md |

## 命令

```bash
node engine/render.mjs <影片目录> preview            # 浏览器里拖进度条（有 out/audio.wav 会同步播放）
node engine/render.mjs <影片目录> stills 3,12,30     # 关键帧
node engine/render.mjs <影片目录> events             # 只收集音效事件（改声音时比 video 快）
node engine/render.mjs <影片目录> audio              # 只重做声音
node engine/render.mjs <影片目录> video              # 只出画面 + 体检
node engine/render.mjs <影片目录> all                # 全部 → out/<片名>.mp4
node engine/beats.mjs 曲子.mp3                       # 外部配乐的 BPM 和重音点
```
`PORT=8200` 换端口；`CHROME_PATH=…` 指定浏览器。80 秒的示例在 M 系列 Mac 上全流程约 70 秒。
