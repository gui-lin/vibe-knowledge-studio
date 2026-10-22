// 体检：判据来自对 76 条 #vibe知识大赏 视频的实测（见 references/research.md）
// ok = 符合 · warn = 偏离爆款区间，确认是有意为之 · fail = 必须改
export function qa(meta, subs, motion, events) {
  const items = [], add = (lv, msg) => items.push([lv, msg]);
  const D = meta.duration, fps = meta.fps;

  // 时长：120–180s 这档总赞最高；300s+ 中位只有 1.4 万
  if (D >= 120 && D <= 180) add('ok', `时长 ${D.toFixed(0)}s，在 120–180s 甜区`);
  else add('warn', `时长 ${D.toFixed(0)}s，样本里 120–180s 这档总赞最高${D > 300 ? '；超过 300s 的中位赞只有 1.4 万' : ''}`);

  // 片名卡：先演后命名，样本多在 15–20s 落片名
  if (meta.titleAt == null) add('warn', 'meta.titleAt 没写：片名卡在第几秒？（先用 6–20s 演一个小东西再命名）');
  else if (meta.titleAt < 5) add('warn', `片名卡在 ${meta.titleAt}s，太早——先让观众"遇到"概念`);
  else if (meta.titleAt > 22) add('warn', `片名卡在 ${meta.titleAt}s，太晚，前面容易流失`);
  else add('ok', `片名卡在 ${meta.titleAt}s`);

  // 字幕：一句 ≤20 字、读得完、尽量带英文
  const plain = s => s.replace(/[\[\]{}]/g, '');
  let long = [], fast = [], noEn = 0, cover = 0;
  subs.forEach((s, i) => {
    const n = [...plain(s.zh)].filter(ch => !/[\s，。、：；！？,.!?「」“”《》—…]/.test(ch)).length, d = s.t1 - s.t0;
    cover += d;
    if (n > 20) long.push(`#${i + 1}「${plain(s.zh).slice(0, 10)}…」${n}字`);
    if (d < Math.max(1.3, n * .14)) fast.push(`#${i + 1} ${d.toFixed(1)}s/${n}字`);
    if (!s.en) noEn++;
  });
  if (!subs.length) add('fail', '没有字幕：这个风格不配音，旁白就是字幕');
  else {
    long.length ? add('warn', `字幕超过 20 字：${long.join('，')}`) : add('ok', `${subs.length} 句字幕都不超过 20 字`);
    fast.length ? add('warn', `字幕停留太短读不完（每字约 0.14s）：${fast.join('，')}`) : add('ok', '每句字幕都读得完');
    if (noEn) add('warn', `${noEn} 句没有英文副行（双语是系列的识别符号，可选）`);
    add('ok', `字幕覆盖全片 ${(cover / D * 100).toFixed(0)}%（参考 58–74%，其余留给片名、转场和纯画面）`);
  }

  // 画面：允许留白让人读字，但不要整段死帧
  // motion[i] = 第 i 帧和 0.5 秒前相比，有变化的像素占比
  if (motion?.length) {
    const TH = .0003, still = motion.filter(v => v < TH).length / motion.length, runs = [];
    let st = -1;
    motion.forEach((v, i) => { if (v < TH) { if (st < 0) st = i; } else { if (st >= 0 && (i - st) / fps > 4) runs.push(`${(st / fps).toFixed(1)}–${(i / fps).toFixed(1)}s`); st = -1; } });
    if (st >= 0 && (motion.length - st) / fps > 4) runs.push(`${(st / fps).toFixed(1)}s–结尾`);
    add(runs.length ? 'warn' : 'ok', `完全静止帧 ${(still * 100).toFixed(0)}%${runs.length ? `；超过 4 秒完全不动：${runs.join('，')}（加缓慢推近、漂移或进度点）` : '，没有超过 4 秒的死帧'}`);
  }

  // 声音：重音要省着用，定理落地最好有一次静音
  const cnt = n => events.filter(e => e.name === n).length;
  if (cnt('thud') + cnt('boom') > 3) add('warn', `重音（thud/boom）${cnt('thud') + cnt('boom')} 次，超过 3 次会钝化`);
  if (!cnt('hush')) add('warn', '没有静音段：高潮之后、结论之前静音 2–3 秒（c.sfx(t, "hush", {dur: 2.5})）很有效，全片一次');
  else add('ok', `静音段 ${cnt('hush')} 次`);

  // 可信度装置
  if (!meta.refs?.length) add('warn', '没写 meta.refs：片尾的参考文献是"看起来可信"的来源');
  else add('ok', `参考文献 ${meta.refs.length} 条`);

  return { items, stats: { duration: D, subs: subs.length, events: events.length } };
}
