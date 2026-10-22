// 分析一首配乐：BPM 和「满编进入」的重音点，好把片名卡、章节转折对到拍上
// 用法：node engine/beats.mjs 曲子.mp3
// 实测：话题里最常用的那首氛围钢琴曲，重音在 17.1s 和 93.6s，多条爆款的片名卡都落在 17s 附近
import { spawnSync } from 'child_process';

const file = process.argv[2];
if (!file) { console.error('用法：node engine/beats.mjs <音频文件>'); process.exit(1); }
const SR = 22050, r = spawnSync('ffmpeg', ['-v', 'error', '-i', file, '-f', 'f32le', '-ac', '1', '-ar', String(SR), '-'], { maxBuffer: 1 << 30 });
if (r.status) { console.error(String(r.stderr)); process.exit(1); }
const x = new Float32Array(r.stdout.buffer, r.stdout.byteOffset, r.stdout.length / 4), dur = x.length / SR;
const db = v => 20 * Math.log10(Math.max(v, 1e-4));   // 下限 -80dB：数字静音不该算出几百 dB 的"跳变"

// 20ms 一帧的响度
const H = Math.round(SR * .02), F = [];
for (let i = 0; i + H < x.length; i += H) { let a = 0; for (let j = i; j < i + H; j++) a += x[j] * x[j]; F.push(db(Math.sqrt(a / H))); }
// 起音包络 → 自相关找 BPM
const on = F.map((v, i) => i ? Math.max(0, v - F[i - 1]) : 0), mean = on.reduce((a, b) => a + b, 0) / on.length, o = on.map(v => v - mean);
const bpms = [];
for (let bpm = 60; bpm <= 180; bpm += .5) { const lag = 60 / bpm / .02, L = Math.floor(lag), fr = lag - L; let c = 0; for (let i = 0; i + L + 1 < o.length; i++) c += o[i] * (o[i + L] * (1 - fr) + o[i + L + 1] * fr); bpms.push([bpm, c]); }
bpms.sort((a, b) => b[1] - a[1]);
// 段落进入：后 2 秒比前 2 秒响 4dB 以上，且本身是个强起音
const avg = (a, b) => { a = Math.max(0, a); b = Math.min(F.length, b); let s = 0; for (let i = a; i < b; i++) s += F[i]; return s / Math.max(1, b - a); };
const acc = [];
for (let i = 50; i < F.length - 100; i++) {
  const jump = avg(i, i + 100) - avg(i - 100, i);
  if (jump > 4 && on[i] > 6 && on[i] === Math.max(...on.slice(i - 10, i + 10))) acc.push([i * .02, jump, on[i]]);
}
const picked = [];
for (const a of acc.sort((p, q) => q[1] + q[2] / 3 - p[1] - p[2] / 3)) if (picked.every(p => Math.abs(p[0] - a[0]) > 4)) picked.push(a);
picked.sort((a, b) => a[0] - b[0]);

console.log(`时长 ${dur.toFixed(1)}s`);
console.log(`BPM 候选：${bpms.slice(0, 4).map(b => b[0]).join(' / ')}（自相关；两两成 2:3 或 1:2 时是同一首的不同拍感）`);
console.log('段落进入 / 重音点：');
for (const [t, j, s] of picked.slice(0, 8)) console.log(`  ${t.toFixed(2)}s   响度 +${j.toFixed(1)}dB   起音 ${s.toFixed(1)}dB`);
if (picked[0]) console.log(`\n建议：meta.titleAt ≈ ${picked.find(p => p[0] > 5)?.[0].toFixed(1) ?? picked[0][0].toFixed(1)}（第一个大段落进入），中段转折对齐后面的重音点。`);
