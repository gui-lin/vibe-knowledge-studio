// 用法：node engine/render.mjs <影片目录> <模式> [参数]
//   preview            起本地服务，浏览器里拖进度条预览（有 out/audio.wav 时同步播放）
//   stills 5,17,60     导出指定秒数的关键帧 → out/stills/
//   events             快速过一遍全片，只收集音效事件 → out/events.json
//   video              逐帧渲染 → out/video_noaudio.mp4，并做体检 → out/qa.json
//   audio              合成配乐 + 事件音并混音 → out/audio.wav
//   all                video + audio + 合成 → out/<片名>.mp4 和封面 out/cover.jpg
//   qa                 只重跑体检（需要先 video）
import { chromium } from 'playwright-core';
import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import { serve } from './serve.mjs';
import { buildAudio } from './audio.mjs';
import { qa } from './qa.mjs';

const [filmArg, mode = 'preview', arg = ''] = process.argv.slice(2);
if (!filmArg || !fs.existsSync(path.join(filmArg, 'film.js'))) { console.error('用法：node engine/render.mjs <含 film.js 的目录> <preview|stills|events|video|audio|all|qa> [参数]'); process.exit(1); }
const FILM = path.resolve(filmArg), OUT = path.join(FILM, 'out');
fs.mkdirSync(OUT, { recursive: true });
const PORT = +(process.env.PORT || 8123);
const URL_ = `http://127.0.0.1:${PORT}/engine/player.html?film=/film/film.js`;

function findChrome() {
  const c = [process.env.CHROME_PATH,
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/Applications/Chromium.app/Contents/MacOS/Chromium',
    '/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium', '/usr/bin/chromium-browser',
    'C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe'];
  return c.find(p => p && fs.existsSync(p));
}
async function openPage() {
  const exe = findChrome();
  const browser = await chromium.launch({ executablePath: exe, headless: true, args: process.platform === 'darwin' ? ['--use-angle=metal', '--ignore-gpu-blocklist'] : [] })
    .catch(e => { console.error('找不到 Chrome：设置 CHROME_PATH，或运行 npx playwright install chromium'); throw e; });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  page.on('pageerror', e => console.error('PAGE ERROR:', e.message));
  page.on('console', m => { if (m.type() === 'error') console.error('console:', m.text()); });
  await page.goto(URL_ + '&render=1');
  await page.waitForFunction(() => window.READY === true, null, { timeout: 120000 });
  return { browser, page };
}
const save = (name, obj) => fs.writeFileSync(path.join(OUT, name), JSON.stringify(obj, null, 1));
const b64 = s => Buffer.from(s.slice(s.indexOf(',') + 1), 'base64');
const run = (cmd, args) => new Promise((res, rej) => { const p = spawn(cmd, args, { stdio: ['ignore', 'inherit', 'inherit'] }); p.on('close', c => c ? rej(new Error(`${cmd} 退出码 ${c}`)) : res()); });

async function dumpMeta(page) {
  const info = await page.evaluate(() => ({ meta: window.VIBE.meta, subs: window.VIBE.subs }));
  save('film.json', info); return info;
}
async function events(page, meta) {
  for (let t = 0; t <= meta.duration; t += .1) await page.evaluate(tt => window.VIBE.frame(tt), t);
  const ev = await page.evaluate(() => window.VIBE.events()); save('events.json', ev); return ev;
}
async function video(page, meta) {
  const fps = meta.fps, total = Math.round(meta.duration * fps), file = path.join(OUT, 'video_noaudio.mp4');
  const ff = spawn('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', String(fps), '-c:v', 'mjpeg', '-i', '-',
    '-c:v', 'libx264', '-preset', 'medium', '-crf', '17', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', file], { stdio: ['pipe', 'inherit', 'inherit'] });
  const motion = [], start = Date.now();
  for (let f = 0; f < total; f++) {
    const r = await page.evaluate(([t]) => window.VIBE.frameJpeg(t, .93, true), [f / fps]);
    motion.push(+r.motion.toFixed(5));
    if (!ff.stdin.write(b64(r.jpg))) await new Promise(res => ff.stdin.once('drain', res));
    if (f % (fps * 10) === 0) process.stdout.write(`\r帧 ${f}/${total}  ${((Date.now() - start) / 1000).toFixed(0)}s   `);
  }
  ff.stdin.end(); await new Promise(r => ff.on('close', r));
  console.log(`\n画面完成：${path.relative(process.cwd(), file)}`);
  save('motion.json', motion);
  const ev = await page.evaluate(() => window.VIBE.events()); save('events.json', ev);
  return { motion, ev };
}
function report(info) {
  const motion = JSON.parse(fs.readFileSync(path.join(OUT, 'motion.json')));
  const ev = JSON.parse(fs.readFileSync(path.join(OUT, 'events.json')));
  const r = qa(info.meta, info.subs, motion, ev); save('qa.json', r);
  console.log('\n—— 体检 ——'); for (const [lv, msg] of r.items) console.log(`${{ ok: '✓', warn: '!', fail: '✗' }[lv]} ${msg}`);
  return r;
}

if (mode === 'preview') {
  await serve(FILM, PORT); console.log(`预览：${URL_}`);
} else {
  const server = await serve(FILM, PORT);
  try {
    if (mode === 'audio') {
      await buildAudio(FILM);
    } else {
      const { browser, page } = await openPage();
      const info = await dumpMeta(page);
      if (mode === 'stills') {
        fs.mkdirSync(path.join(OUT, 'stills'), { recursive: true });
        for (const s of arg.split(',').filter(Boolean).map(Number)) {
          const r = await page.evaluate(t => window.VIBE.frameJpeg(t, .9), s);
          fs.writeFileSync(path.join(OUT, 'stills', `s${s.toFixed(1).padStart(6, '0')}.jpg`), b64(r.jpg));
        }
        console.log(`关键帧 → ${path.relative(process.cwd(), path.join(OUT, 'stills'))}`);
      } else if (mode === 'events') {
        const ev = await events(page, info.meta); console.log(`${ev.length} 个音效事件 → out/events.json`);
      } else if (mode === 'video' || mode === 'all') {
        await video(page, info.meta);
        fs.writeFileSync(path.join(OUT, 'cover.jpg'), b64((await page.evaluate(t => window.VIBE.frameJpeg(t, .95), info.meta.cover ?? info.meta.titleAt ?? 0)).jpg));
        report(info);
      } else if (mode === 'qa') report(info);
      await browser.close();
      if (mode === 'all') {
        await buildAudio(FILM);
        const final = path.join(OUT, `${info.meta.title}.mp4`);
        await run('ffmpeg', ['-y', '-loglevel', 'error', '-i', path.join(OUT, 'video_noaudio.mp4'), '-i', path.join(OUT, 'audio.wav'), '-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k', '-shortest', '-movflags', '+faststart', final]);
        console.log(`成片：${path.relative(process.cwd(), final)}`);
      }
    }
  } finally { server.close(); }
}
