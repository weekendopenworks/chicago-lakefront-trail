// Optional Chromium lab measurement. Timings vary by host; this is not a CI gate.
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const { chromium } = await import(process.env.LAKEFRONT_PLAYWRIGHT ? pathToFileURL(path.resolve(process.env.LAKEFRONT_PLAYWRIGHT)).href : 'playwright');
const base = process.env.LAKEFRONT_TEST_URL || 'http://127.0.0.1:4179';
const baseline = process.env.LAKEFRONT_BASELINE_APP ? fs.readFileSync(process.env.LAKEFRONT_BASELINE_APP, 'utf8') : null;
const runs = Number(process.env.LAKEFRONT_PERF_RUNS || 3);
if (!Number.isInteger(runs) || runs < 1 || runs > 10) throw new Error('LAKEFRONT_PERF_RUNS must be between 1 and 10');
const input = process.env.LAKEFRONT_PERF_INPUT || 'pinch';
if (!['pinch', 'buttons', 'wheel', 'glide'].includes(input)) throw new Error('LAKEFRONT_PERF_INPUT must be pinch, buttons, wheel or glide');
const browser = await chromium.launch({ headless: true }), results = [];
try {
  for (let run = 1; run <= runs; run++) for (const cpu of [1, 4, 6]) {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2, reducedMotion: input === 'pinch' ? 'reduce' : 'no-preference' });
    try {
      const page = await context.newPage(), cdp = await context.newCDPSession(page);
      if (baseline) await page.route('**/app.js?*', route => route.fulfill({ contentType: 'text/javascript', body: baseline }));
      await cdp.send('Emulation.setCPUThrottlingRate', { rate: cpu });
      await page.goto(base + '/?place=navy-pier');
      await page.waitForSelector('#atlas[data-ready=true]');
      // Full-screen mobile details block the map until the visitor closes them.
      await page.locator('.card-close').click();
      await page.evaluate(() => document.fonts.ready);
      await page.waitForFunction(() => [...document.querySelectorAll('.map-tile')].filter(el => { const r = el.getBoundingClientRect(); return r.left < innerWidth && r.right > 0 && r.top < innerHeight && r.bottom > 50; }).every(el => el.dataset.loaded === 'true'));
      await page.waitForTimeout(1200);
      await cdp.send('Performance.enable');
      const before = (await cdp.send('Performance.getMetrics')).metrics;
      await page.evaluate(() => {
        window.framesMeasured = []; window.tasksMeasured = [];
        let last;
        window.measureFrame = requestAnimationFrame(function frame(time) { if (last) framesMeasured.push(time - last); last = time; window.measureFrame = requestAnimationFrame(frame); });
        new PerformanceObserver(list => tasksMeasured.push(...list.getEntries().map(entry => entry.duration))).observe({ type: 'longtask', buffered: false });
      });
      const touch = (type, points) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: points.map(([id, x, y]) => ({ id, x, y, radiusX: 2, radiusY: 2, force: 1 })) });
      if (input === 'pinch') for (let round = 0; round < 3; round++) {
        await touch('touchStart', [[1, 130, 250], [2, 250, 250]]);
        for (let step = 1; step <= 24; step++) {
          const distance = 40 * Math.sin(Math.PI * step / 24);
          await touch('touchMove', [[1, 130 - distance, 250], [2, 250 + distance, 250]]);
          await new Promise(resolve => setTimeout(resolve, 12));
        }
        await touch('touchEnd', []);
      }
      if (input === 'buttons') for (const direction of ['in', 'in', 'in', 'out', 'out', 'out']) {
        await page.locator(`#zoom-${direction}`).evaluate(button => button.click());
        await page.waitForFunction(() => !document.querySelector('#atlas').dataset.zooming);
      }
      if (input === 'wheel') for (let round = 0; round < 2; round++) for (let step = 0; step < 40; step++) {
        await cdp.send('Input.dispatchMouseEvent', { type: 'mouseWheel', x: 180, y: 250, deltaX: 0, deltaY: step < 20 ? -3 : 3, modifiers: 2 });
        await new Promise(resolve => setTimeout(resolve, 12));
      }
      if (input === 'glide') for (let round = 0; round < 3; round++) {
        await touch('touchStart', [[1, 180, 330]]);
        for (let step = 1; step <= 10; step++) {
          await touch('touchMove', [[1, 180 + step * 2, 330 - step * 10]]);
          await new Promise(resolve => setTimeout(resolve, 12));
        }
        await touch('touchEnd', []);
        await new Promise(resolve => setTimeout(resolve, 800));
      }
      const timings = await page.evaluate(() => {
        cancelAnimationFrame(measureFrame);
        const frames = framesMeasured.slice(2).sort((a, b) => a - b);
        return { frames: frames.length, frameP50Ms: frames[Math.floor(frames.length * .5)], frameP95Ms: frames[Math.floor(frames.length * .95)], longestFrameMs: Math.max(...frames), framesOver50Ms: frames.filter(time => time > 50).length, longTasks: tasksMeasured.length, longestTaskMs: Math.max(0, ...tasksMeasured), loadedTiles: document.querySelectorAll('.map-tile[data-loaded=true]').length };
      });
      const after = (await cdp.send('Performance.getMetrics')).metrics;
      const metrics = Object.fromEntries(['LayoutDuration', 'RecalcStyleDuration', 'ScriptDuration', 'TaskDuration'].map(name => [name, after.find(metric => metric.name === name).value - before.find(metric => metric.name === name).value]));
      const result = { run, input, cpuSlowdown: cpu, ...timings, seconds: metrics };
      results.push(result); console.log(JSON.stringify(result));
    } finally { await context.close(); }
  }
} finally {
  const report = { browser: browser.version(), baseline: !!baseline, input, viewport: [390, 844], results, limitation: 'Linux headless Chromium with synthetic CPU slowdown; not physical-device or GPU performance.' };
  await browser.close();
  fs.mkdirSync('.cache/reports', { recursive: true });
  fs.writeFileSync(`.cache/reports/map-performance${input === 'pinch' ? '' : `-${input}`}${baseline ? '-baseline' : ''}.json`, JSON.stringify(report, null, 2) + '\n');
}
