// Optional browser regression checks for navigation motion and interrupted input.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const browsers = await import(process.env.LAKEFRONT_PLAYWRIGHT ? pathToFileURL(path.resolve(process.env.LAKEFRONT_PLAYWRIGHT)).href : 'playwright');
const base = process.env.LAKEFRONT_TEST_URL || 'http://127.0.0.1:4179';
const engines = (process.env.LAKEFRONT_ENGINES || 'chromium,firefox,webkit').split(',');
const results = [];
const near = (actual, expected, message, tolerance = 2) => assert(Math.abs(actual - expected) <= tolerance, `${message}: ${actual} vs ${expected}`);
const frame = page => page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
const snapshot = page => page.evaluate(() => {
  const canvas = document.querySelector('#map-canvas'), matrix = new DOMMatrix(getComputedStyle(canvas).transform);
  return { x: matrix.e, top: canvas.getBoundingClientRect().top, scale: matrix.a, scrollY, zoom: Number(document.querySelector('#zoom-level').textContent.replace('×', '')), card: document.querySelector('#place-card').open };
});
const unchanged = (before, after, message) => {
  near(after.x, before.x, `${message}: horizontal position`);
  near(after.scrollY, before.scrollY, `${message}: vertical position`);
  near(after.scale, before.scale, `${message}: scale`, .002);
};
async function load(page, query = '?at=41.895') {
  await page.goto(base + '/' + query);
  await page.waitForSelector('#atlas[data-ready=true]');
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(700);
  await page.evaluate(() => new Promise(resolve => {
    let previous = scrollY, stable = 0;
    const wait = () => {
      stable = Math.abs(scrollY - previous) < .5 ? stable + 1 : 0; previous = scrollY;
      if (stable >= 3) resolve(); else requestAnimationFrame(wait);
    };
    requestAnimationFrame(wait);
  }));
}
async function settle(page) {
  await page.waitForFunction(() => !document.querySelector('#atlas').dataset.zooming);
  await frame(page);
}
async function beginZoom(page) {
  // Programmatic activation permits the interruption to occur during the first
  // animation frames, without a test driver's click-stability wait.
  assert(await page.locator('#zoom-in').evaluate(el => { el.click(); return !!document.querySelector('#atlas').dataset.zooming; }), 'Zoom has begun');
}
async function interruptZoom(page, action) {
  return page.evaluate(action => new Promise(resolve => {
    document.querySelector('#zoom-in').click();
    requestAnimationFrame(() => {
      const active = !!document.querySelector('#atlas').dataset.zooming;
      if (action === 'blur') dispatchEvent(new Event('blur'));
      if (action === 'history') { history.pushState({}, '', '/?place=osterman-beach'); dispatchEvent(new PopStateEvent('popstate')); }
      if (action === 'selection') document.querySelector('[data-place=osterman-beach]').click();
      if (action === 'north') document.querySelector('#north-jump').click();
      if (action === 'close') document.querySelector('.card-close').click();
      const canvas = document.querySelector('#map-canvas'), matrix = new DOMMatrix(getComputedStyle(canvas).transform);
      resolve({ active, x: matrix.e, top: canvas.getBoundingClientRect().top, scale: matrix.a, scrollY });
    });
  }), action);
}
async function check(engine, name, run) {
  try { await run(); results.push({ engine, name, passed: true }); console.log(`PASS ${engine}: ${name}`); }
  catch (error) { results.push({ engine, name, passed: false, error: error.message }); console.error(`FAIL ${engine}: ${name}: ${error.message}`); }
}
async function selectedVisible(page) {
  return page.evaluate(() => {
    const dot = document.querySelector('.map-marker.selected .marker-dot').getBoundingClientRect();
    const card = document.querySelector('#place-card').getBoundingClientRect(), header = document.querySelector('.site-header').getBoundingClientRect();
    return dot.left >= 0 && dot.right <= innerWidth && dot.top >= header.bottom && dot.bottom <= innerHeight && !(dot.right > card.left && dot.left < card.right && dot.bottom > card.top && dot.top < card.bottom);
  });
}

for (const engine of engines) {
  const browser = await browsers[engine].launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, reducedMotion: 'no-preference' });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));

    await check(engine, 'Repeated zoom buttons reach their accumulated destination', async () => {
      await load(page);
      await page.locator('#zoom-in').evaluate(el => { el.click(); el.click(); el.click(); });
      await settle(page);
      near((await snapshot(page)).zoom, 2.5, 'Three half-step presses', .01);
      await page.locator('#zoom-out').click(); await settle(page);
      near((await snapshot(page)).zoom, 2, 'Zoom out half-step', .01);
    });

    await check(engine, 'Trackpad and Shift+wheel pan horizontally without vertical drift', async () => {
      await load(page);
      await page.mouse.move(650, 330);
      const before = await snapshot(page);
      await page.mouse.wheel(85, 0); await page.waitForTimeout(100);
      const horizontal = await snapshot(page);
      near(horizontal.x, before.x - 85, 'Horizontal wheel delta'); near(horizontal.scrollY, before.scrollY, 'Horizontal wheel keeps vertical position');
      await page.keyboard.down('Shift'); await page.mouse.wheel(0, 95); await page.keyboard.up('Shift'); await page.waitForTimeout(100);
      const shifted = await snapshot(page);
      near(shifted.x, horizontal.x - 95, 'Shift wheel delta'); near(shifted.scrollY, horizontal.scrollY, 'Shift wheel keeps vertical position');
    });

    await check(engine, 'Ctrl+wheel zoom preserves the map coordinate under the pointer', async () => {
      await load(page);
      const point = { x: 650, y: 330 }, before = await snapshot(page);
      const map = { x: (point.x - before.x) / before.scale, y: (point.y - before.top) / before.scale };
      await page.mouse.move(point.x, point.y); await page.keyboard.down('Control'); await page.mouse.wheel(0, -24); await page.keyboard.up('Control');
      await page.waitForTimeout(250);
      const after = await snapshot(page);
      assert(after.scale > before.scale, 'Wheel zoom changes map scale');
      near(after.x + map.x * after.scale, point.x, 'Pointer anchor X'); near(after.top + map.y * after.scale, point.y, 'Pointer anchor Y');
      near(await page.evaluate(() => visualViewport.scale), 1, 'Browser page scale');
    });

    await check(engine, 'Keyboard pans and zooms the map while details retain their own keys', async () => {
      await load(page);
      await page.evaluate(() => document.activeElement.blur());
      const before = await snapshot(page);
      await page.keyboard.press('ArrowRight'); await frame(page);
      near((await snapshot(page)).x, before.x - 240, 'Right-arrow map pan');
      await page.keyboard.press('+'); await settle(page);
      near((await snapshot(page)).zoom, 1.5, 'Keyboard zoom', .01);
      await page.locator('[data-place=navy-pier]').dispatchEvent('click'); await page.waitForTimeout(700);
      await page.setViewportSize({ width: 1440, height: 650 }); await page.waitForTimeout(200);
      const open = await snapshot(page);
      await page.keyboard.press('+'); await page.keyboard.press('-'); await page.keyboard.press('ArrowRight'); await frame(page);
      unchanged(open, await snapshot(page), 'Details keys leave map alone');
      await page.keyboard.press('PageDown'); await page.waitForTimeout(250);
      assert(await page.locator('#card-content').evaluate(el => el.scrollTop > 0), 'PageDown scrolls details');
      unchanged(open, await snapshot(page), 'Scrolling details leaves map alone');
      await page.setViewportSize({ width: 1440, height: 1000 });
    });

    await check(engine, 'Blur stops an in-progress zoom at its rendered position', async () => {
      await load(page);
      // OS focus loss is represented directly; browser drivers cannot reliably
      // focus another desktop application in headless mode.
      const interrupted = await interruptZoom(page, 'blur'); assert(interrupted.active, 'Zoom was interrupted while active'); await page.waitForTimeout(350);
      unchanged(interrupted, await snapshot(page), 'Blurred zoom');
    });

    await check(engine, 'History navigation interrupts zoom and reveals its destination', async () => {
      await load(page);
      const interrupted = await interruptZoom(page, 'history'); assert(interrupted.active, 'Zoom was interrupted while active'); await page.waitForTimeout(800);
      near((await snapshot(page)).scale, interrupted.scale, 'History stops old zoom', .002);
      assert(await selectedVisible(page), 'History destination remains visible above the details panel');
    });

    await check(engine, 'Back preserves its latitude when rendering runs behind the URL timer', async () => {
      await page.emulateMedia({ reducedMotion: 'reduce' });
      await load(page, '?at=41.97');
      const original = await snapshot(page);
      await page.locator('[data-place=navy-pier]').dispatchEvent('click'); await frame(page);
      // Simulate a busy or background renderer: the map's next animation frame
      // arrives after its 500ms URL debounce. The visible scroll position is
      // already restored, so an old rendered latitude must not replace history.
      await page.evaluate(() => {
        const nativeFrame = requestAnimationFrame, nativeCancel = cancelAnimationFrame, delayed = new Map();
        window.restoreNavigationFrames = () => {
          requestAnimationFrame = nativeFrame; cancelAnimationFrame = nativeCancel;
          for (const timer of delayed.values()) clearTimeout(timer);
        };
        requestAnimationFrame = callback => {
          const id = nativeFrame(() => delayed.set(id, setTimeout(() => { delayed.delete(id); callback(performance.now()); }, 700)));
          return id;
        };
        cancelAnimationFrame = id => { nativeCancel(id); clearTimeout(delayed.get(id)); delayed.delete(id); };
      });
      try {
        await page.goBack(); await page.waitForTimeout(1700);
        const back = await snapshot(page);
        near(Number(new URLSearchParams(await page.evaluate(() => location.search)).get('at')), 41.97, 'Back latitude remains its original destination', .00005);
        near(back.scrollY, original.scrollY, 'Back restores the original viewport');
        assert(!back.card, 'Back closes the previous place');
      } finally {
        await page.evaluate(() => { restoreNavigationFrames(); delete window.restoreNavigationFrames; });
        await page.emulateMedia({ reducedMotion: 'no-preference' });
      }
    });

    await check(engine, 'Selecting a place during zoom does not retain the old zoom anchor', async () => {
      await load(page);
      const interrupted = await interruptZoom(page, 'selection'); assert(interrupted.active, 'Zoom was interrupted while active'); await page.waitForTimeout(800);
      near((await snapshot(page)).scale, interrupted.scale, 'Selection stops old zoom', .002);
      assert(await selectedVisible(page), 'Selected destination remains visible');
    });

    await check(engine, 'North navigation interrupts zoom and restores the opening view', async () => {
      await load(page, ''); const opening = await snapshot(page);
      await load(page, '?place=navy-pier');
      const interrupted = await interruptZoom(page, 'north'); assert(interrupted.active, 'Zoom was interrupted while active');
      // Native smooth-scroll duration varies with engine and distance.
      await page.waitForFunction(top => Math.abs(scrollY - top) < 2, opening.scrollY, { timeout: 3000 });
      await page.waitForTimeout(350); await frame(page);
      const returned = await snapshot(page);
      unchanged(opening, returned, 'North restores the opening camera');
      assert.equal(returned.zoom, 1, 'North resets interrupted zoom');
      assert(!returned.card, 'North closes the previous discovery');
      assert(await page.evaluate(() => { const params = new URLSearchParams(location.search); return !params.has('place') && !params.has('at'); }), 'North clears the previous destination URL');
    });

    await check(engine, 'A vertical wheel gesture takes over from animated zoom', async () => {
      await load(page); await page.mouse.move(650, 330); await beginZoom(page);
      await page.mouse.wheel(0, 90); await frame(page);
      const interrupted = await snapshot(page); await page.waitForTimeout(350);
      near((await snapshot(page)).scale, interrupted.scale, 'Wheel stops old zoom', .002);
    });

    await check(engine, 'Closing details interrupts zoom without moving the camera', async () => {
      await load(page, '?place=navy-pier');
      const interrupted = await interruptZoom(page, 'close'); assert(interrupted.active, 'Zoom was interrupted while active'); await page.waitForTimeout(350);
      unchanged(interrupted, await snapshot(page), 'Closing details stops zoom');
      assert(!(await snapshot(page)).card, 'Details are closed');
    });

    await check(engine, 'Blur cancels a queued wheel zoom before its animation frame', async () => {
      await load(page); const before = await snapshot(page);
      // Both events intentionally share one task to exercise the queued-frame
      // race. Normal wheel behavior above uses trusted browser input.
      await page.evaluate(() => {
        document.querySelector('#atlas').dispatchEvent(new WheelEvent('wheel', { bubbles: true, cancelable: true, ctrlKey: true, deltaY: -24, clientX: 650, clientY: 330 }));
        dispatchEvent(new Event('blur'));
      });
      await page.waitForTimeout(250); unchanged(before, await snapshot(page), 'Queued wheel cancellation');
    });

    await check(engine, 'New navigation, zoom, and drag supersede a pending scroll stop', async () => {
      await page.emulateMedia({ reducedMotion: 'reduce' });
      try {
        for (const action of ['jump', 'zoom', 'drag']) {
          await load(page, '?place=navy-pier');
          // Hold rendering while trusted input starts a stop correction, then
          // starts another movement. This makes the same-frame race reliable
          // even when a browser driver takes longer than one rendering frame.
          await page.evaluate(() => {
            const nativeFrame = requestAnimationFrame, nativeCancel = cancelAnimationFrame;
            const held = new Map(); let next = -1;
            requestAnimationFrame = callback => { const id = next--; held.set(id, callback); return id; };
            cancelAnimationFrame = id => { if (!held.delete(id)) nativeCancel(id); };
            window.releaseMotionFrames = () => {
              requestAnimationFrame = nativeFrame; cancelAnimationFrame = nativeCancel;
              const callbacks = [...held.values()]; held.clear();
              return new Promise(resolve => nativeFrame(now => { for (const callback of callbacks) callback(now); resolve(); }));
            };
          });
          try {
            const card = await page.locator('#card-content').boundingBox();
            await page.mouse.click(card.x + 30, card.y + 30);
            const stopped = await snapshot(page);
            if (action === 'jump') await page.locator('#north-jump').evaluate(el => el.click());
            if (action === 'zoom') await page.locator('#zoom-in').evaluate(el => el.click());
            if (action === 'drag') {
              await page.mouse.move(650, 330); await page.mouse.down();
              await page.mouse.move(650, 250); await page.mouse.up();
            }
            const moved = await snapshot(page);
            assert(Math.abs(moved.scrollY - stopped.scrollY) > 10, `${action} changes the vertical viewport before held frames resume`);
            await page.evaluate(() => releaseMotionFrames()); await frame(page);
            const resumed = await snapshot(page);
            // The normal position frame may still update horizontal centering
            // after a jump; only an obsolete vertical stop is under test here.
            near(resumed.scrollY, moved.scrollY, `${action} cancels the previous scroll-stop correction`);
            near(resumed.scale, moved.scale, `${action} retains its requested scale`, .002);
          } finally {
            await page.evaluate(async () => { if (window.releaseMotionFrames) { await releaseMotionFrames(); delete window.releaseMotionFrames; } });
          }
        }
      } finally { await page.emulateMedia({ reducedMotion: 'no-preference' }); }
    });

    if (engine === 'webkit') await check(engine, 'Safari gesture protocol anchors zoom and ignores changes after blur', async () => {
      await load(page);
      const point = { x: 650, y: 330 }, before = await snapshot(page);
      const map = { x: (point.x - before.x) / before.scale, y: (point.y - before.top) / before.scale };
      // Automation cannot inject native macOS trackpad GestureEvents. These
      // synthetic protocol events cover handler state and coordinate math.
      await page.evaluate(point => {
        const send = (type, scale) => {
          const event = new Event(type, { bubbles: true, cancelable: true });
          Object.assign(event, { clientX: point.x, clientY: point.y, scale });
          document.querySelector('#atlas').dispatchEvent(event);
        };
        send('gesturestart', 1); send('gesturechange', 1.3);
      }, point);
      const zoomed = await snapshot(page);
      near(zoomed.scale / before.scale, 1.3, 'Safari gesture scale', .01);
      near(zoomed.x + map.x * zoomed.scale, point.x, 'Safari anchor X'); near(zoomed.top + map.y * zoomed.scale, point.y, 'Safari anchor Y');
      await page.evaluate(point => {
        dispatchEvent(new Event('blur'));
        const event = new Event('gesturechange', { bubbles: true, cancelable: true });
        Object.assign(event, { clientX: point.x, clientY: point.y, scale: 1.8 }); document.querySelector('#atlas').dispatchEvent(event);
      }, point);
      unchanged(zoomed, await snapshot(page), 'Cancelled Safari gesture');
    });

    await check(engine, 'Reduced motion makes zoom immediate', async () => {
      await page.emulateMedia({ reducedMotion: 'reduce' }); await load(page);
      await page.locator('#zoom-in').click();
      near((await snapshot(page)).zoom, 1.5, 'Reduced-motion zoom destination', .01);
      assert(!await page.locator('#atlas').evaluate(el => !!el.dataset.zooming), 'Reduced-motion zoom has no animation');
      await page.emulateMedia({ reducedMotion: 'no-preference' });
    });
    await check(engine, 'Motion checks produce no browser errors', async () => assert.deepEqual(errors, []));
    await page.close();

    const nativeContext = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, ...(engine === 'firefox' ? {} : { isMobile: true }), reducedMotion: 'no-preference' });
    const nativePage = await nativeContext.newPage();
    for (const action of ['read', 'close']) await check(engine, `Opening mobile details stops map travel before ${action === 'read' ? 'reading' : 'closing'}`, async () => {
      await load(nativePage, '?at=41.97');
      const initial = await snapshot(nativePage);
      await nativePage.locator('#south-jump').evaluate(el => el.click());
      await nativePage.waitForFunction(top => scrollY > top + 5, initial.scrollY);
      await nativePage.locator('[data-place=south-shore-cultural-center]').evaluate(el => el.click());
      assert(await nativePage.locator('#place-card').evaluate(el => el.matches(':modal')), 'Mobile details are modal');
      const opened = await snapshot(nativePage);
      if (action === 'close') await nativePage.locator('.card-close').tap();
      else {
        const heading = await nativePage.locator('.card-heading').boundingBox();
        await nativePage.touchscreen.tap(60, heading.y + heading.height + 35);
      }
      await nativePage.waitForTimeout(1400);
      unchanged(opened, await snapshot(nativePage), 'The background map stays at its interrupted position');
      assert.equal((await snapshot(nativePage)).card, action === 'read', 'The requested details interaction is preserved');
    });
    await nativeContext.close();

    if (engine === 'chromium') {
      const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2, reducedMotion: 'no-preference' });
      const touchPage = await context.newPage(), cdp = await context.newCDPSession(touchPage);
      const touch = (type, points = []) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: points.map(([x, y], index) => ({ id: index + 1, x, y, radiusX: 2, radiusY: 2, force: 1 })) });
      const flick = async ({ hold = 0 } = {}) => {
        await touch('touchStart', [[150, 420]]);
        for (let step = 1; step <= 7; step++) { await touch('touchMove', [[150, 420 - step * 20]]); await touchPage.waitForTimeout(16); }
        if (hold) await touchPage.waitForTimeout(hold);
        await touch('touchEnd');
      };
      await check(engine, 'Touch flick continues smoothly and a new touch catches it', async () => {
        await load(touchPage); await flick(); const released = await snapshot(touchPage);
        await touchPage.waitForTimeout(110); const gliding = await snapshot(touchPage);
        assert(gliding.scrollY > released.scrollY + 15, 'Flick continues after release');
        await touch('touchStart', [[150, 280]]); const caught = await snapshot(touchPage);
        await touchPage.waitForTimeout(130); unchanged(caught, await snapshot(touchPage), 'Touch catches glide');
        await touch('touchEnd'); await touchPage.waitForTimeout(100);
        assert(!(await snapshot(touchPage)).card, 'Catching glide does not select a place');
      });
      await check(engine, 'Holding a finger still before release does not start momentum', async () => {
        await load(touchPage); await flick({ hold: 150 }); const released = await snapshot(touchPage);
        await touchPage.waitForTimeout(250); unchanged(released, await snapshot(touchPage), 'Rested release');
      });
      await check(engine, 'A long catch on a marker does not activate it when released', async () => {
        await load(touchPage); await flick();
        const dot = await touchPage.evaluate(() => [...document.querySelectorAll('.map-marker .marker-dot')].map(el => { const r = el.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; }).find(p => p.x > 30 && p.x < innerWidth - 30 && p.y > 120 && p.y < 650));
        assert(dot, 'A marker is visible while map glides');
        await touch('touchStart', [[dot.x, dot.y]]); await touchPage.waitForTimeout(550); await touch('touchEnd'); await touchPage.waitForTimeout(100);
        assert(!(await snapshot(touchPage)).card, 'Holding the caught marker does not become selection');
      });
      await check(engine, 'Opening full-screen details stops map momentum', async () => {
        await load(touchPage); await flick(); await touchPage.waitForTimeout(40);
        await touchPage.locator('[data-place=navy-pier]').evaluate(el => el.click());
        const opened = await snapshot(touchPage);
        assert(await touchPage.locator('#place-card').evaluate(el => el.matches(':modal')), 'Touch details cover the map');
        await touchPage.waitForTimeout(250); unchanged(opened, await snapshot(touchPage), 'Details opening stops glide');
        await touchPage.locator('.card-close').tap();
        unchanged(opened, await snapshot(touchPage), 'Closing returns to the stopped map');
      });
      await check(engine, 'A map pinch keeps its anchor and ignores simultaneous wheel zoom', async () => {
        await load(touchPage);
        const before = await snapshot(touchPage), point = { x: 190, y: 250 };
        const map = { x: (point.x - before.x) / before.scale, y: (point.y - before.top) / before.scale };
        await touch('touchStart', [[130, 250], [250, 250]]); await frame(touchPage);
        await touchPage.mouse.move(190, 250); await touchPage.keyboard.down('Control'); await touchPage.mouse.wheel(0, -24); await touchPage.keyboard.up('Control'); await frame(touchPage);
        near((await snapshot(touchPage)).scale, before.scale, 'An active pinch owns zoom', .002);
        await touch('touchMove', [[110, 280], [270, 280]]); await frame(touchPage);
        const moved = await snapshot(touchPage);
        near(moved.scale / before.scale, 160 / 120, 'Pinch scale', .01);
        near(moved.x + map.x * moved.scale, 190, 'Moving pinch anchor X'); near(moved.top + map.y * moved.scale, 280, 'Moving pinch anchor Y');
        await touch('touchEnd'); await frame(touchPage);
        assert(!(await snapshot(touchPage)).card, 'A map pinch does not open a discovery');
        const marker = await touchPage.locator('[data-place=navy-pier]').boundingBox();
        near(marker.width, 44, 'Marker target width after pinch'); near(marker.height, 44, 'Marker target height after pinch');
      });
      await check(engine, 'Reduced motion disables touch momentum', async () => {
        await touchPage.emulateMedia({ reducedMotion: 'reduce' }); await load(touchPage); await flick();
        const released = await snapshot(touchPage); await touchPage.waitForTimeout(250);
        unchanged(released, await snapshot(touchPage), 'Reduced-motion touch');
      });
      await context.close();
    }
  } finally { await browser.close(); }
}
fs.mkdirSync('.cache/reports', { recursive: true });
fs.writeFileSync('.cache/reports/map-motion.json', JSON.stringify({ results, limitation: 'Desktop browser engines, emulated touch input, and trusted Chromium multi-touch gestures; native Safari trackpad gestures and physical-device performance require device testing.' }, null, 2) + '\n');
assert(results.every(result => result.passed), `${results.filter(result => !result.passed).length} motion checks failed; see .cache/reports/map-motion.json`);
