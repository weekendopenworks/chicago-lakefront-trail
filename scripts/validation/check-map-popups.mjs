// Optional browser checks; install Playwright separately (docs/development.md).
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const modulePath = process.env.LAKEFRONT_PLAYWRIGHT;
const browsers = await import(modulePath ? pathToFileURL(path.resolve(modulePath)).href : 'playwright');
const base = process.env.LAKEFRONT_TEST_URL || 'http://127.0.0.1:4179';
const engines = (process.env.LAKEFRONT_ENGINES || 'chromium,firefox,webkit').split(',');
const report = [];
fs.mkdirSync('.cache/reports', { recursive: true });

for (const engine of engines) {
  assert(['chromium', 'firefox', 'webkit'].includes(engine), `Unknown engine: ${engine}`);
  const browser = await browsers[engine].launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, ...(engine === 'firefox' ? {} : { isMobile: true }) });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  const cdp = engine === 'chromium' ? await context.newCDPSession(page) : null;
  const state = () => page.evaluate(() => {
    const card = document.querySelector('#place-card'), canvas = document.querySelector('#map-canvas');
    return { open: card.open, modal: card.matches(':modal'), id: document.querySelector('.map-marker.selected')?.dataset.place, y: scrollY, x: new DOMMatrix(getComputedStyle(canvas).transform).e, zoom: Number(document.querySelector('#zoom-level').textContent.replace('×', '')) };
  });
  const sameMap = (before, after) => {
    for (const key of ['x', 'y', 'zoom']) assert(Math.abs(after[key] - before[key]) < (key === 'zoom' ? .001 : 2), `Map ${key} stays still: ${before[key]} → ${after[key]}`);
  };
  async function load(query = '?place=navy-pier', viewport = { width: 390, height: 844 }) {
    await page.setViewportSize(viewport);
    await page.goto(base + '/' + query, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#atlas[data-ready=true]');
    await page.waitForFunction(() => document.fonts.status === 'loaded', null, { timeout: 10000 });
    await page.waitForTimeout(350);
    await page.waitForFunction(() => {
      const sample = window.popupScrollSample;
      if (!sample || sample.y !== scrollY) { window.popupScrollSample = { y: scrollY, since: performance.now() }; return false; }
      return performance.now() - sample.since > 150;
    });
  }
  async function center(selector) {
    return page.locator(selector).evaluate(el => {
      const r = el.getBoundingClientRect(), x = r.x + r.width / 2, y = r.y + r.height / 2;
      if (!el.contains(document.elementFromPoint(x, y))) throw new Error(`Target is obscured: ${el.className}`);
      return { x, y };
    });
  }
  async function tap(selector) { const point = await center(selector); await page.touchscreen.tap(point.x, point.y); }
  async function swipe(from, to) {
    if (cdp) {
      const finger = { id: 1, x: from.x, y: from.y, radiusX: 2, radiusY: 2, force: 1 };
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [finger] });
      for (let step = 1; step <= 8; step++) {
        await page.waitForTimeout(30);
        finger.x = from.x + (to.x - from.x) * step / 8; finger.y = from.y + (to.y - from.y) * step / 8;
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [finger] });
      }
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    } else {
      // Other engines expose trusted mouse movement but not touch swipes.
      await page.mouse.move(from.x, from.y); await page.mouse.down();
      await page.mouse.move(to.x, to.y, { steps: 8 }); await page.mouse.up();
    }
  }
  async function fullScreen() {
    // Scrollbar geometry follows ResizeObserver after rotation and reflow.
    await page.waitForFunction(() => {
      const content = document.querySelector('#card-content');
      return !!document.querySelector('.card-scrollbar').getClientRects().length === (document.querySelector('#place-card').open && content.scrollHeight > content.clientHeight + 1);
    });
    const failures = await page.evaluate(() => {
      const card = document.querySelector('#place-card'), r = card.getBoundingClientRect(), failures = [];
      if (!card.open || !card.matches(':modal')) failures.push('Details are not a native modal');
      if (Math.abs(r.left) > 1 || Math.abs(r.top) > 1 || Math.abs(r.width - innerWidth) > 2 || Math.abs(r.height - innerHeight) > 2) failures.push('Details do not fill the viewport');
      for (const x of [2, innerWidth / 2, innerWidth - 2]) for (const y of [2, innerHeight / 2, innerHeight - 2]) {
        if (!card.contains(document.elementFromPoint(x, y))) failures.push(`Background is exposed at ${x}, ${y}`);
      }
      const scroller = document.querySelector('#card-content');
      if (!!document.querySelector('.card-scrollbar').getClientRects().length !== (card.open && scroller.scrollHeight > scroller.clientHeight + 1)) failures.push('Scrollbar visibility does not match overflow');
      const touchAction = getComputedStyle(document.querySelector('#card-content')).touchAction;
      if (touchAction !== 'manipulation' && !touchAction.includes('pinch-zoom')) failures.push('Details disallow native pinch zoom');
      if (/user-scalable\s*=\s*no|maximum-scale\s*=\s*1(?:[,\s]|$)/i.test(document.querySelector('meta[name=viewport]').content)) failures.push('Page disables browser zoom');
      if (document.documentElement.scrollWidth > innerWidth) failures.push('Horizontal page overflow');
      return failures;
    });
    assert.deepEqual(failures, []);
    await center('.card-close');
  }
  async function check(name, run, query, viewport) {
    await load(query, viewport);
    try {
      await run();
      assert.deepEqual(errors, [], 'No uncaught browser errors');
      const result = { engine, version: browser.version(), name, status: 'pass' };
      report.push(result); console.log(JSON.stringify(result));
    } catch (error) {
      await page.screenshot({ path: `.cache/reports/popup-failure-${engine}.png`, timeout: 5000 }).catch(() => {});
      throw new Error(`${engine}/${name}: ${error.message}`, { cause: error });
    }
  }
  try {
    for (const [width, height] of [[568, 320], [667, 320], [844, 390]]) {
      await check(`Short landscape ${width}×${height} keeps the introduction and controls usable`, async () => {
        const geometry = await page.evaluate(() => {
          const rect = selector => document.querySelector(selector).getBoundingClientRect();
          const overlaps = (a, b) => a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
          const headerBottom = rect('.site-header').bottom;
          const sharingVisible = document.querySelector('#share-map').getClientRects().length > 0;
          const tools = ['.map-zoom', '#filter-toggle', ...(sharingVisible ? ['.route-key'] : [])].map(selector => ({ selector, box: rect(selector) }));
          const failures = [];
          if (document.querySelector('.overview').getClientRects().length) failures.push('Trail overview is visible on touch screens');
          for (let first = 0; first < tools.length; first++) for (let second = first + 1; second < tools.length; second++) {
            if (overlaps(tools[first].box, tools[second].box)) failures.push(`${tools[first].selector} overlaps ${tools[second].selector}`);
          }
          for (const selector of ['.map-intro h1', '.intro-facts', '.intro-tagline', '.intro-note', '#begin']) {
            const box = rect(selector);
            if (box.top < headerBottom || box.bottom > innerHeight || box.left < 0 || box.right > innerWidth) failures.push(`${selector} is outside the reading viewport`);
            for (const tool of tools) if (overlaps(box, tool.box)) failures.push(`${selector} overlaps ${tool.selector}`);
          }
          for (const selector of ['#begin', '#zoom-in', '#zoom-out', '#filter-toggle', ...(sharingVisible ? ['#share-map'] : []), ...(innerWidth <= 700 ? ['.mobile-menu summary'] : [])]) {
            const el = document.querySelector(selector), box = el.getBoundingClientRect();
            if (box.width < 44 || box.height < 44) failures.push(`${selector} has a small target`);
            const minimumTop = selector === '.mobile-menu summary' ? 0 : headerBottom;
            if (box.top < minimumTop || box.bottom > innerHeight || box.left < 0 || box.right > innerWidth) failures.push(`${selector} is outside the usable viewport`);
            if (!el.contains(document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2))) failures.push(`${selector} is obscured`);
          }
          if (document.documentElement.scrollWidth > innerWidth) failures.push('Horizontal page overflow');
          return failures;
        });
        assert.deepEqual(geometry, []);
        const openingY = await page.evaluate(() => scrollY);
        await tap('#begin');
        await page.waitForFunction(before => scrollY > before + 100, openingY);
        await load('?place=international-museum-surgical-science', { width, height });
        await fullScreen();
        assert(await page.locator('#card-content').evaluate(el => el.clientHeight - document.querySelector('.card-heading').offsetHeight >= 100), 'Long titles leave room for reading');
        await tap('.card-close'); assert(!(await state()).open);
      }, '', { width, height });
    }
    for (const [width, height] of [[320, 740], [390, 844], [844, 390]]) {
      await check(`Fullscreen details at ${width}×${height} hide the map and close without moving it`, async () => {
        await fullScreen();
        const before = await state();
        await page.locator('#card-content').evaluate(el => { el.scrollTop = el.scrollHeight; });
        await tap('.card-close'); await page.waitForTimeout(200);
        const after = await state(); assert(!after.open); sameMap(before, after);
        assert(await page.evaluate(() => getComputedStyle(document.documentElement).overflowY !== 'hidden'), 'Closing restores map scrolling');
      }, undefined, { width, height });
    }
    await check('Native scrolling stays inside details, including both edges and Space on a link', async () => {
      assert(await page.locator('#card-content').evaluate(el => el.scrollHeight - el.clientHeight > 100), 'The reading viewport has enough content to exercise scrolling');
      const before = await state();
      if (cdp) await swipe({ x: 180, y: 480 }, { x: 180, y: 230 });
      else if (engine === 'webkit') { await page.locator('#card-content').focus(); await page.keyboard.press('PageDown'); }
      else { await page.mouse.move(180, 480); await page.mouse.wheel(0, 400); }
      await page.waitForFunction(() => document.querySelector('#card-content').scrollTop > 100);
      await page.waitForTimeout(300); sameMap(before, await state());
      for (const edge of ['top', 'bottom']) {
        await page.locator('#card-content').evaluate((el, edge) => { el.scrollTop = edge === 'top' ? 0 : el.scrollHeight; }, edge);
        if (engine === 'webkit') { await page.locator('#card-content').focus(); await page.keyboard.press(edge === 'top' ? 'PageUp' : 'PageDown'); }
        else { await page.mouse.move(180, 480); await page.mouse.wheel(0, edge === 'top' ? -600 : 600); }
        await page.waitForTimeout(200); sameMap(before, await state());
      }
      await page.locator('.card-location-source a').focus();
      await page.locator('#card-content').evaluate(el => { el.scrollTop = el.scrollHeight; });
      await page.keyboard.press('Space'); await page.waitForTimeout(250);
      sameMap(before, await state()); assert((await state()).open);
    }, undefined, { width: 390, height: 600 });
    await check('Dragging the title does not dismiss or move fullscreen details', async () => {
      const before = await state(), heading = await page.locator('.card-heading').boundingBox();
      await swipe({ x: 70, y: heading.y + 25 }, { x: 70, y: heading.y + 155 });
      await page.waitForTimeout(300); await fullScreen(); sameMap(before, await state());
    });
    // Firefox's touch-emulated mouse input emits no PointerEvents; its drag
    // behavior is checked below in a narrow context with mouse input enabled.
    if (engine !== 'firefox') await check('Only a rightward swipe from the left handle closes details', async () => {
      const before = await state(), handle = await center('.card-swipe-handle');
      await swipe({ x: 100, y: handle.y }, { x: 220, y: handle.y });
      assert((await state()).open, 'Horizontal reading gestures leave details open'); sameMap(before, await state());
      await swipe(handle, { x: handle.x + 120, y: handle.y });
      await page.waitForTimeout(200);
      const after = await state(); assert(!after.open, 'The left handle closes details'); sameMap(before, after);
      assert(await page.evaluate(() => getComputedStyle(document.documentElement).overflowY !== 'hidden'), 'Swipe close restores map scrolling');
    });
    else {
      const result = { engine, version: browser.version(), name: 'Touch-context swipe drag', status: 'unsupported', reason: 'Firefox touch emulation has no drag input; narrow mouse-context coverage follows.' };
      report.push(result); console.log(JSON.stringify(result));
    }
    await check('Tab stays inside details and Escape restores the map', async () => {
      const before = await state();
      for (const key of [...Array(10).fill('Tab'), ...Array(10).fill('Shift+Tab')]) {
        await page.keyboard.press(key);
        // Native Tab traversal can report body at the browser-chrome boundary.
        assert(await page.evaluate(() => document.activeElement === document.body || !document.hasFocus() || document.querySelector('#place-card').contains(document.activeElement)), 'Native modal keeps focus out of background controls');
        await page.keyboard.press('ArrowRight'); await page.keyboard.press('+');
        await page.waitForTimeout(50); sameMap(before, await state());
      }
      await page.keyboard.press('Escape'); await page.waitForTimeout(200);
      assert(!(await state()).open); sameMap(before, await state());
      assert(await page.evaluate(() => document.activeElement.getClientRects().length > 0 && !document.activeElement.closest('#place-card')), 'Focus returns to a visible map control');
    });
    await check('Back and Forward close and reopen fullscreen details', async () => {
      const before = await state();
      const marker = await page.evaluate(() => {
        for (const el of document.querySelectorAll('.map-marker:not(.hidden)')) {
          const dot = el.querySelector('.marker-dot'), r = dot.getBoundingClientRect(), x = r.x + r.width / 2, y = r.y + r.height / 2;
          if (x > 25 && x < innerWidth - 25 && y > 80 && y < innerHeight - 100 && el.contains(document.elementFromPoint(x, y))) return { id: el.dataset.place, x, y };
        }
        throw new Error('No visible marker for native selection');
      });
      await page.touchscreen.tap(marker.x, marker.y); await fullScreen();
      assert.equal((await state()).id, marker.id);
      await page.goBack({ waitUntil: 'domcontentloaded' }); await page.waitForTimeout(250);
      assert(!(await state()).open); sameMap(before, await state());
      await page.goForward({ waitUntil: 'domcontentloaded' }); await page.waitForTimeout(250);
      await fullScreen(); assert.equal((await state()).id, marker.id);
    }, '?at=41.895');
    await check('Rotation keeps details fullscreen and the close button reachable', async () => {
      await page.setViewportSize({ width: 844, height: 390 }); await fullScreen();
      await page.setViewportSize({ width: 390, height: 844 }); await fullScreen();
      await tap('.card-close'); assert(!(await state()).open);
    });
    await check('Share confirmation is visible inside fullscreen details and returns to the map', async () => {
      const visibleToast = async () => assert(await page.locator('#toast').evaluate(el => {
        const r = el.getBoundingClientRect(), style = getComputedStyle(el);
        if (Number(style.opacity) < .99 || style.visibility !== 'visible' || r.width <= 0 || r.height <= 0 || r.top < 0 || r.bottom > innerHeight || r.left < 0 || r.right > innerWidth) return false;
        // Toasts deliberately ignore pointer input. Enable hit testing only
        // during this synchronous occlusion probe, then restore that behavior.
        const previous = el.style.pointerEvents;
        try { el.style.pointerEvents = 'auto'; return el.contains(document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2)); }
        finally { el.style.pointerEvents = previous; }
      }), 'Share confirmation is visible and unobscured');
      await page.evaluate(() => Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async url => { window.popupCopiedUrl = url; } } }));
      await page.locator('#share-place').tap();
      await page.waitForFunction(() => getComputedStyle(document.querySelector('#toast')).opacity === '1');
      const expected = new URL(await page.locator('link[rel=canonical]').getAttribute('href'));
      expected.searchParams.set('place', 'navy-pier');
      assert.equal(await page.evaluate(() => window.popupCopiedUrl), expected.href, 'Share copies the selected discovery URL');
      assert(await page.locator('#toast').evaluate(el => el.closest('#place-card')?.matches(':modal') && el.textContent.includes('Link copied')), 'Confirmation belongs to the active modal');
      await visibleToast();
      await tap('.card-close');
      assert(await page.locator('#toast').evaluate(el => el.parentElement === document.body), 'Closing details returns the confirmation to the page');
      await visibleToast();
    });

    const desktop = await browser.newContext({ viewport: { width: 1440, height: 700 } });
    try {
      const desktopPage = await desktop.newPage();
      desktopPage.on('pageerror', error => errors.push(error.message));
      await desktopPage.goto(base + '/?place=navy-pier', { waitUntil: 'domcontentloaded' });
      await desktopPage.waitForSelector('#atlas[data-ready=true]');
      const geometry = await desktopPage.evaluate(() => {
        const card = document.querySelector('#place-card'), r = card.getBoundingClientRect(), scroller = document.querySelector('#card-content');
        return { open: card.open, modal: card.matches(':modal'), left: r.left, right: r.right, width: innerWidth, top: r.top, header: document.querySelector('.site-header').getBoundingClientRect().bottom, scrollbar: !!document.querySelector('.card-scrollbar').getClientRects().length, overflow: scroller.scrollHeight > scroller.clientHeight + 1 };
      });
      assert(geometry.open && !geometry.modal && geometry.left > geometry.width / 2 && Math.abs(geometry.right - geometry.width) < 2 && Math.abs(geometry.top - geometry.header) < 2, 'Desktop retains the nonmodal side panel');
      assert.equal(geometry.scrollbar, geometry.open && geometry.overflow, 'Scrollbar appears only for open, overflowing details');
      await desktopPage.locator('#zoom-in').click();
      await desktopPage.waitForFunction(() => document.querySelector('#zoom-level').textContent === '1.5×');
      assert(await desktopPage.locator('#place-card').evaluate(el => el.open), 'Desktop map remains usable with details open');
      assert.deepEqual(errors, [], 'No uncaught browser errors');
      const result = { engine, version: browser.version(), name: 'Desktop retains its side panel, scrollbar and usable map', status: 'pass' };
      report.push(result); console.log(JSON.stringify(result));
      if (engine === 'firefox') {
        await desktopPage.waitForFunction(() => !document.querySelector('#atlas').dataset.zooming);
        await desktopPage.setViewportSize({ width: 390, height: 844 });
        await desktopPage.waitForFunction(() => document.querySelector('#place-card').matches(':modal'));
        await desktopPage.waitForTimeout(200);
        const read = () => desktopPage.evaluate(() => ({ open: document.querySelector('#place-card').open, y: scrollY, x: new DOMMatrix(getComputedStyle(document.querySelector('#map-canvas')).transform).e, zoom: Number(document.querySelector('#zoom-level').textContent.replace('×', '')) }));
        const drag = async (from, to) => { await desktopPage.mouse.move(from.x, from.y); await desktopPage.mouse.down(); await desktopPage.mouse.move(to.x, to.y, { steps: 8 }); await desktopPage.mouse.up(); };
        const before = await read(), box = await desktopPage.locator('.card-swipe-handle').boundingBox(), handle = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
        await drag({ x: 100, y: handle.y }, { x: 220, y: handle.y });
        assert((await read()).open, 'Content dragging leaves fullscreen details open'); sameMap(before, await read());
        await drag(handle, { x: handle.x + 120, y: handle.y }); await desktopPage.waitForTimeout(200);
        const after = await read(); assert(!after.open, 'The left handle closes fullscreen details'); sameMap(before, after);
        assert.deepEqual(errors, [], 'No uncaught browser errors');
        const result = { engine, version: browser.version(), name: 'Narrow fullscreen pointer drag closes only from the handle and preserves the map', status: 'pass' };
        report.push(result); console.log(JSON.stringify(result));
      }
    } finally { await desktop.close(); }
  } finally {
    await context.close(); await browser.close();
    fs.writeFileSync('.cache/reports/map-popups.json', JSON.stringify(report, null, 2) + '\n');
  }
}
console.log(`Passed ${report.filter(result => result.status === 'pass').length} popup interaction scenarios.`);
