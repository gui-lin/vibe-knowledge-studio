// 声音：配乐（代码合成或外部授权曲）+ 事件音 + 静音段 → out/audio.wav（-14 LUFS）
// 读 out/film.json（meta.music）和 out/events.json（场景里 c.sfx 记下的事件）
//
// meta.music 两种写法：
//   { bpm: 76, key: 'Am', sections: [[0,'pad'], [8,'piano'], [17,'full'], [90,'arp'], [105,'piano'], [118,'outro']] }
//   { file: 'bgm.mp3', gain: -8, offset: 0, at: 0 }     外部曲（请用有授权的），offset = 从曲子第几秒开始
// 织体：rest 无 · pad 长音 · piano 柱式和弦 · full 琶音+低音+轻打击 · arp 再加高音琶音 · outro 只剩单音钢琴
import fs from 'fs';
import path from 'path';
import { spawn, spawnSync } from 'child_process';

const SR = 44100;
const clamp = (x, a = 0, b = 1) => Math.max(a, Math.min(b, x));
const prog = (t, a, b) => clamp((t - a) / (b - a));
const dB = g => Math.pow(10, g / 20);
function rng(seed) { return function () { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
// 振荡器用相量递推，比 Math.sin 快得多
function phasor(f) { const w = 2 * Math.PI * f / SR; return { c: Math.cos(w), s: Math.sin(w), x: 1, y: 0 }; }
function step(p) { const y = p.y * p.c + p.x * p.s; p.x = p.x * p.c - p.y * p.s; p.y = y; return y; }
const mtof = m => 440 * Math.pow(2, (m - 69) / 12);

export async function buildAudio(FILM) {
  const OUT = path.join(FILM, 'out');
  const { meta } = JSON.parse(fs.readFileSync(path.join(OUT, 'film.json')));
  const evFile = path.join(OUT, 'events.json');
  if (!fs.existsSync(evFile)) throw new Error('没有 out/events.json：先运行 events 或 video 模式');
  const events = JSON.parse(fs.readFileSync(evFile));
  const DUR = meta.duration, N = Math.ceil(SR * DUR);
  const dryL = new Float32Array(N), dryR = new Float32Array(N), wetL = new Float32Array(N), wetR = new Float32Array(N);
  const rand = rng(42);
  const S = t => Math.round(t * SR);
  const put = (L, R, i, v, pan = 0) => { if (i >= 0 && i < N) { L[i] += v * (1 - pan); R[i] += v * (1 + pan); } };

  // ---------------------------------------------------------------- 乐器
  function piano(t0, f, amp, dur = 4.5) {
    const s0 = S(t0), n = S(dur), pan = clamp(Math.log2(f / 260) * .35, -.6, .6), H = [], B = .0004;
    for (let h = 1; h <= 7; h++) { const fh = f * h * Math.sqrt(1 + B * h * h); H.push([phasor(fh), phasor(fh * 1.0006), Math.pow(h, -1.6), .55 + h * .45]); }
    let lp = 0;
    for (let k = 0; k < n; k++) {
      const tt = k / SR; let v = 0;
      for (const [p, q, a, d] of H) v += (step(p) + step(q)) * a * Math.exp(-tt * d);
      lp += .3 * ((rand() * 2 - 1) - lp);
      v = v * .5 + lp * Math.exp(-tt * 140) * .25;          // 击弦噪声
      put(wetL, wetR, s0 + k, v * amp * Math.min(1, tt * 300) * Math.min(1, (dur - tt) * 3), pan);
    }
  }
  function pad(t0, t1, freqs, amp) {
    const voices = [];
    for (const f of freqs) for (const det of [-.0035, 0, .0035]) for (let h = 1; h <= 6; h++) voices.push([phasor(f * h * (1 + det)), Math.exp(-h * .5) / h, det]);
    for (let i = Math.max(0, S(t0)); i < Math.min(N, S(t1)); i++) {
      const t = i / SR, env = prog(t, t0, t0 + 1.6) * (1 - prog(t, t1 - 1.6, t1));
      let l = 0, r = 0; for (const [p, a, det] of voices) { const v = step(p) * a; if (det < 0) l += v; else if (det > 0) r += v; else { l += v * .5; r += v * .5; } }
      const m = amp * env * (1 + .04 * Math.sin(t * 2 * Math.PI * .3)); wetL[i] += l * m; wetR[i] += r * m;
    }
  }
  function bass(t0, f, amp, dur) {
    const p = phasor(f), q = phasor(f * 2);
    for (let i = S(t0), k = 0; k < S(dur); i++, k++) { const tt = k / SR, env = Math.min(1, tt * 20) * Math.exp(-tt * .7) * Math.min(1, (dur - tt) * 4); put(dryL, dryR, i, (step(p) + step(q) * .25) * amp * env); }
  }
  function kick(t0, amp) { for (let i = S(t0), k = 0; k < S(.35); i++, k++) { const tt = k / SR; put(dryL, dryR, i, Math.sin(2 * Math.PI * (48 + 60 * Math.exp(-tt * 30)) * tt) * Math.exp(-tt * 9) * amp); } }
  function shaker(t0, amp) { let hp = 0, prev = 0; for (let i = S(t0), k = 0; k < S(.08); i++, k++) { const w = rand() * 2 - 1; hp = .6 * (hp + w - prev); prev = w; put(dryL, dryR, i, hp * amp * Math.exp(-k / SR * 60), .2); } }

  // ---------------------------------------------------------------- 事件音
  const SFX = {
    tick: (t, o) => { const f = 2100 * (o.pitch ?? 1), p = phasor(f), q = phasor(f * 2.76); for (let i = S(t), k = 0; k < S(.06); i++, k++) { const e = Math.exp(-k / SR * 90); put(dryL, dryR, i, (step(p) + step(q) * .3) * e * o.g); } },
    soft: (t, o) => { const f = 1180 * (o.pitch ?? 1), p = phasor(f), q = phasor(f * 2.71); for (let i = S(t), k = 0; k < S(.5); i++, k++) { const e = Math.exp(-k / SR * 14); put(wetL, wetR, i, (step(p) + step(q) * .25) * e * o.g); } },
    chord: (t, o) => { const r = o.root ?? 0; [57, 64, 69, 72, 76].forEach((m, j) => { const p = phasor(mtof(m + r)), q = phasor(mtof(m + r) * 2.01); for (let i = S(t), k = 0; k < S(8); i++, k++) { const tt = k / SR, e = Math.min(1, tt * 200) * Math.exp(-tt * .55); put(wetL, wetR, i, (step(p) + step(q) * .2) * e * o.g * .3, (j - 2) * .2); } }); },
    bloom: (t, o) => { SFX.chord(t, { ...o, g: o.g * .8 }); let a = 0; for (let i = S(t - .6), k = 0; k < S(2.2); i++, k++) { const tt = k / SR - .6, w = rand() * 2 - 1; a += .05 * (w - a); const e = tt < 0 ? Math.pow(prog(tt, -.6, 0), 2) : Math.exp(-tt * 2.2); put(wetL, wetR, i, a * e * o.g * 1.6, (rand() - .5) * .3); } },
    rise: (t, o) => { const d = o.dur ?? 1.5; let ph = 0, a = 0; for (let i = S(t), k = 0; k < S(d); i++, k++) { const u = k / S(d), w = rand() * 2 - 1; a += (.02 + .2 * u) * (w - a); ph += 2 * Math.PI * (180 * Math.pow(4, u)) / SR; put(wetL, wetR, i, (Math.sin(ph) * .5 + a * .5) * u * u * o.g); } },
    thud: (t, o) => { for (let i = S(t), k = 0; k < S(1.4); i++, k++) { const tt = k / SR; put(dryL, dryR, i, Math.sin(2 * Math.PI * (42 + 26 * Math.exp(-tt * 10)) * tt) * Math.exp(-tt * 3.2) * Math.min(1, tt * 400) * o.g); } },
    stamp: (t, o) => { let a = 0; for (let i = S(t), k = 0; k < S(.3); i++, k++) { const tt = k / SR, w = rand() * 2 - 1; a += .3 * (w - a); put(dryL, dryR, i, (Math.sin(2 * Math.PI * 95 * tt) * .8 + a * .5) * Math.exp(-tt * 22) * o.g); } },
    shimmer: (t, o) => { const r2 = rng(Math.round(t * 1000)); for (let j = 0; j < 14; j++) { const st = t + r2() * 1.2, f = 2000 + r2() * 3500, p = phasor(f); for (let i = S(st), k = 0; k < S(.6); i++, k++) put(wetL, wetR, i, step(p) * Math.exp(-k / SR * 7) * o.g * .25, r2() - .5); } },
    whoosh: (t, o) => { const d = o.dur ?? .7; let a = 0, b = 0; for (let i = S(t), k = 0; k < S(d); i++, k++) { const u = k / S(d), w = rand() * 2 - 1; a += (.03 + .25 * Math.sin(Math.PI * u)) * (w - a); b += .05 * (a - b); put(wetL, wetR, i, (a - b) * Math.sin(Math.PI * u) * o.g * 2, (u - .5) * .8); } },
    boom: (t, o) => { SFX.thud(t, o); SFX.shimmer(t + .05, { g: o.g * .5 }); },
  };
  const GAIN = { tick: -24, soft: -18, chord: -12, bloom: -10, rise: -16, thud: -8, stamp: -12, shimmer: -18, whoosh: -18, boom: -6 };

  // ---------------------------------------------------------------- 配乐
  const music = meta.music ?? {};
  let bgL = new Float32Array(N), bgR = new Float32Array(N);
  if (music.file) {
    const src = path.resolve(FILM, music.file);
    const r = spawnSync('ffmpeg', ['-v', 'error', '-ss', String(music.offset ?? 0), '-i', src, '-t', String(DUR), '-f', 'f32le', '-ac', '2', '-ar', String(SR), '-'], { maxBuffer: 1 << 30 });
    if (r.status) throw new Error('外部配乐解码失败：' + r.stderr);
    const f = new Float32Array(r.stdout.buffer, r.stdout.byteOffset, r.stdout.length / 4), at = S(music.at ?? 0), g = dB(music.gain ?? -8);
    for (let i = 0; i * 2 + 1 < f.length && at + i < N; i++) { bgL[at + i] = f[i * 2] * g; bgR[at + i] = f[i * 2 + 1] * g; }
  } else if (music.sections !== null) {
    const bpm = music.bpm ?? 76, BEAT = 60 / bpm, BAR = BEAT * 4;
    const tonic = { Am: 57, Bm: 59, Cm: 60, Dm: 50 + 12, Em: 52 + 12, Fm: 53 + 12, Gm: 55 + 12 }[music.key ?? 'Am'] ?? 57;
    // 小调 i – VI – III – VII
    const PROG = [[0, 3, 7], [-4, 0, 3], [3, 7, 10], [-2, 2, 5]];
    const sections = music.sections ?? [[0, 'pad'], [Math.max(0, (meta.titleAt ?? 8)), 'full'], [DUR * .7, 'piano'], [DUR - 12, 'outro']];
    const secAt = t => { let s = 'rest'; for (const [a, n] of sections) if (t + 1e-6 >= a) s = n; return s; };
    let last = 'rest';
    for (let bar = 0, t = music.start ?? 0; t < DUR; bar++, t += BAR) {
      const sec = secAt(t), ch = PROG[bar % 4].map(iv => tonic + iv), amp = music.gain != null ? dB(music.gain) : 1;
      if ((sec === 'full' || sec === 'arp') && last !== 'full' && last !== 'arp') { kick(t, .5 * amp); SFX.shimmer(t, { g: dB(-14) * amp }); }   // 满编进入的那一拍
      last = sec;
      if (sec === 'rest') continue;
      pad(t, t + BAR + 1.2, ch.map(m => mtof(m - 12)), { pad: .007, piano: .008, full: .011, arp: .012, outro: .007 }[sec] * amp);
      if (sec === 'piano') { piano(t, mtof(ch[0]), .1 * amp); piano(t + .02, mtof(ch[1]), .08 * amp); piano(t + .04, mtof(ch[2]), .08 * amp); piano(t + 2 * BEAT, mtof(ch[2] + 12), .07 * amp); }
      if (sec === 'outro') piano(t, mtof(ch[bar % 3] + 12), .09 * amp, 5);
      if (sec === 'full' || sec === 'arp') {
        const arp = [ch[0], ch[1], ch[2], ch[0] + 12, ch[2], ch[1], ch[2], ch[0] + 12];
        arp.forEach((m, e) => piano(t + e * BEAT / 2, mtof(m), .075 * amp));
        bass(t, mtof(ch[0] - 24), .13 * amp, BAR);
        for (let b = 0; b < 4; b += 2) kick(t + b * BEAT, .22 * amp);
        for (let e = 0; e < 8; e++) shaker(t + e * BEAT / 2, (e % 2 ? .03 : .05) * amp);
        if (sec === 'arp') [ch[2] + 12, ch[1] + 24, ch[0] + 24, ch[2] + 24].forEach((m, e) => piano(t + (e * 2 + 1) * BEAT / 2, mtof(m), .05 * amp, 3));
      }
    }
  }

  // ---------------------------------------------------------------- 事件
  const counts = {};
  for (const e of events) {
    if (e.name === 'hush') continue;
    const fn = SFX[e.name]; if (!fn) { console.warn('未知音效：', e.name); continue; }
    fn(e.t, { ...e, g: dB(e.gain ?? GAIN[e.name] ?? -16) });
    counts[e.name] = (counts[e.name] || 0) + 1;
  }

  // ---------------------------------------------------------------- Freeverb + 混音
  function reverb(inp, off) {
    const o = new Float32Array(N);
    const combs = [1116, 1188, 1277, 1356, 1422, 1491, 1557, 1617].map(d => ({ b: new Float32Array(d + off), i: 0, s: 0 }));
    const aps = [556, 441, 341, 225].map(d => ({ b: new Float32Array(d + off), i: 0 }));
    for (let n = 0; n < N; n++) {
      const x = inp[n] * .015; let y = 0;
      for (const c of combs) { const v = c.b[c.i]; c.s = v * .75 + c.s * .25; c.b[c.i] = x + c.s * .88; c.i = (c.i + 1) % c.b.length; y += v; }
      for (const a of aps) { const v = a.b[a.i]; a.b[a.i] = y + v * .5; y = v - y; a.i = (a.i + 1) % a.b.length; }
      o[n] = y;
    }
    return o;
  }
  const rvL = reverb(wetL, 0), rvR = reverb(wetR, 23);
  // 静音段：之前 30ms 收掉，之后 30ms 放回
  const hush = events.filter(e => e.name === 'hush').map(e => [e.t, e.t + (e.dur ?? 2)]);
  const gate = t => { let g = 1; for (const [a, b] of hush) g = Math.min(g, 1 - Math.min(prog(t, a - .03, a), 1 - prog(t, b, b + .03))); return g; };
  const L = new Float32Array(N), R = new Float32Array(N); let peak = 0;
  for (let i = 0; i < N; i++) {
    const t = i / SR, f = Math.min(1, t / .3) * (1 - prog(t, DUR - 2.5, DUR)) * gate(t);
    L[i] = (bgL[i] + dryL[i] + wetL[i] * 1.2 + rvL[i] * 4.5) * f; R[i] = (bgR[i] + dryR[i] + wetR[i] * 1.2 + rvR[i] * 4.5) * f;
    peak = Math.max(peak, Math.abs(L[i]), Math.abs(R[i]));
  }
  const g = peak ? .89 / peak : 1, buf = Buffer.alloc(44 + N * 4);
  buf.write('RIFF', 0); buf.writeUInt32LE(36 + N * 4, 4); buf.write('WAVEfmt ', 8); buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(2, 22);
  buf.writeUInt32LE(SR, 24); buf.writeUInt32LE(SR * 4, 28); buf.writeUInt16LE(4, 32); buf.writeUInt16LE(16, 34); buf.write('data', 36); buf.writeUInt32LE(N * 4, 40);
  for (let i = 0; i < N; i++) { buf.writeInt16LE(Math.round(clamp(L[i] * g, -1, 1) * 32767), 44 + i * 4); buf.writeInt16LE(Math.round(clamp(R[i] * g, -1, 1) * 32767), 46 + i * 4); }
  const raw = path.join(OUT, 'audio_raw.wav'); fs.writeFileSync(raw, buf);

  // 响度统一：默认 -14 LUFS（抖音常见），安静风格可设 meta.loudness = -18
  const I = meta.loudness ?? -14;
  await new Promise((res, rej) => { const p = spawn('ffmpeg', ['-y', '-v', 'error', '-i', raw, '-af', `loudnorm=I=${I}:TP=-1.5:LRA=11`, '-ar', String(SR), path.join(OUT, 'audio.wav')], { stdio: 'inherit' }); p.on('close', c => c ? rej(new Error('loudnorm 失败')) : res()); });
  fs.unlinkSync(raw);
  console.log(`声音完成：out/audio.wav（${I} LUFS）  事件 ${JSON.stringify(counts)}${hush.length ? `  静音段 ${hush.map(h => h[0] + 's').join(',')}` : ''}`);
}

if (process.argv[1]?.endsWith('audio.mjs')) buildAudio(path.resolve(process.argv[2] ?? '.')).catch(e => { console.error(e.message); process.exit(1); });
