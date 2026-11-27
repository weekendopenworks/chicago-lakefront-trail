// Optional: install Playwright separately; see docs/development.md.
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import assert from 'node:assert/strict';

const modulePath = process.env.LAKEFRONT_PLAYWRIGHT;
const browsers = await import(modulePath ? pathToFileURL(path.resolve(modulePath)).href : 'playwright');
const base = process.env.LAKEFRONT_TEST_URL || 'http://127.0.0.1:4179';
const engines = (process.env.LAKEFRONT_ENGINES || 'chromium,firefox,webkit').split(',');
const reports = [];
fs.mkdirSync('.cache/reports', { recursive: true });
const near = (a, b, label, tolerance = 2) => assert(Math.abs(a - b) <= tolerance, `${label}: ${a} vs ${b}`);
const snapshot = page => page.evaluate(() => {
  const card = document.querySelector('#place-card');
  const matrix = new DOMMatrix(getComputedStyle(document.querySelector('#map-canvas')).transform);
  return { x: matrix.e, scale: matrix.a, scrollY, url: location.search, card: card.open, rect: card.getBoundingClientRect().toJSON(), focus: document.activeElement.id || document.activeElement.dataset.place };
});
const frame = page => page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
async function ready(page) {
  await page.waitForSelector('#atlas[data-ready=true]');
  await page.evaluate(() => document.fonts.ready);
  await frame(page);
}
async function load(page, query = '?place=navy-pier') {
  await page.goto(base + '/' + query);
  await ready(page);
}
async function activate(page, selector, touch) {
  const box = await page.locator(selector).boundingBox();
  assert(box, `Visible target: ${selector}`);
  if (touch) await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2);
  else await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  await frame(page);
  // Zoom controls animate unless reduced motion is requested; measure the settled view.
  await page.waitForFunction(() => !document.querySelector('#atlas').dataset.zooming);
}
const fullScreenDetails = page => page.evaluate(() => matchMedia('(max-width:700px), (hover:none) and (pointer:coarse)').matches);
async function checkDetailsPresentation(page) {
  const fullScreen = await fullScreenDetails(page);
  const state = await page.evaluate(() => {
    const card = document.querySelector('#place-card'), box = card.getBoundingClientRect();
    return { modal: card.matches(':modal'), rect: box.toJSON(), width: innerWidth, height: innerHeight,
      covered: [[2, 2], [innerWidth - 3, 2], [2, innerHeight - 3], [innerWidth - 3, innerHeight - 3]].every(([x, y]) => card.contains(document.elementFromPoint(x, y))) };
  });
  assert.equal(state.modal, fullScreen, 'Only full-screen details make the background modal');
  assert(await page.evaluate(() => { const c = document.querySelector('#card-content'); return !!document.querySelector('.card-scrollbar').getClientRects().length === (document.querySelector('#place-card').open && c.scrollHeight > c.clientHeight + 1); }), 'Scrollbar appears only for open, overflowing details');
  if (fullScreen) {
    near(state.rect.left, 0, 'Details cover the left edge'); near(state.rect.top, 0, 'Details cover the top edge');
    near(state.rect.width, state.width, 'Details cover the viewport width'); near(state.rect.height, state.height, 'Details cover the viewport height');
    assert(state.covered, 'Full-screen details cover the map at every viewport corner');
    assert(await page.evaluate(() => { document.querySelector('#zoom-in').focus(); return document.querySelector('#place-card').contains(document.activeElement); }), 'The modal blocks focus on the background map controls');
  } else assert(state.rect.height <= state.height - 50 + 1 && state.rect.top >= 49, 'Desktop details fit below the header');
  return fullScreen;
}
async function homepageOpening(page, touch) {
  await load(page, ''); await page.waitForTimeout(650);
  assert.equal(await page.locator('.overview').isVisible(), !await fullScreenDetails(page), 'Trail overview is desktop-only');
  const opening = await snapshot(page);
  const layout = await page.evaluate(() => {
    const header = document.querySelector('.site-header').getBoundingClientRect();
    const intro = document.querySelector('.map-intro').getBoundingClientRect();
    const overlaps = (a, b) => a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
    const failures = [];
    for (const selector of ['.map-intro h1', '.intro-facts', '.intro-tagline', '.intro-note', '#begin']) {
      const element = document.querySelector(selector), box = element.getBoundingClientRect();
      if (box.top < header.bottom || box.bottom > innerHeight || box.left < 0 || box.right > innerWidth) failures.push(`${selector} is outside the opening viewport`);
      if (selector === '#begin' && !element.contains(document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2))) failures.push('Begin is obscured');
    }
    const northernPlace = ['ardmore-trailhead', 'osterman-beach', 'osterman-beach-dunes', 'come-to-light', 'foster-beach'].find(id => {
      const marker = document.querySelector(`[data-place="${id}"]`), box = marker.querySelector('.marker-dot').getBoundingClientRect();
      return box.left >= 0 && box.right <= innerWidth && box.top >= header.bottom && box.bottom <= innerHeight && !overlaps(box, intro) && marker.contains(document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2));
    });
    return { failures, northernPlace, mapTop: document.querySelector('#map-canvas').getBoundingClientRect().top };
  });
  assert.deepEqual(layout.failures, [], 'Opening keeps the introduction readable');
  assert(layout.northernPlace, 'Opening shows a northern discovery clear of the introduction and controls');
  assert(!opening.card, 'Opening does not select a place automatically');
  await activate(page, `[data-place="${layout.northernPlace}"] .marker-dot`, touch);
  assert.equal(await page.locator('.map-marker.selected').getAttribute('data-place'), layout.northernPlace);
  assert((await snapshot(page)).card, 'The visible northern discovery responds to input');
  await page.goBack(); await ready(page); await page.waitForTimeout(650);
  const back = await snapshot(page);
  assert(!back.card, 'Back returns from a popup to the opening view');
  assert.equal(back.url, opening.url, 'Back preserves the opening URL');
  near(back.scrollY, opening.scrollY, 'Back restores the opening position');
  assert(opening.scrollY > 0, 'The opening view leaves a northern margin to explore');
  await page.evaluate(() => scrollTo({ top: 0, behavior: 'instant' })); await frame(page);
  near((await snapshot(page)).scrollY, 0, 'The northern margin remains reachable');
  assert(await page.locator('#map-canvas').evaluate((el, top) => el.getBoundingClientRect().top > top, layout.mapTop), 'Scrolling north exposes more of the map');

  await page.evaluate(() => scrollTo({ top: 1200, behavior: 'instant' })); await page.waitForTimeout(650);
  const restored = await snapshot(page);
  // Preserve the browser entry while removing the share URL: the startup
  // default must not override native restoration of a queryless map page.
  await page.evaluate(() => history.replaceState(history.state, '', '/'));
  await page.reload(); await ready(page); await page.waitForTimeout(650);
  near((await snapshot(page)).scrollY, restored.scrollY, 'Reload preserves the restored queryless position');
  await page.evaluate(() => history.replaceState(history.state, '', '/'));
  await page.goto(base + '/credits/'); await page.goBack(); await ready(page); await page.waitForTimeout(650);
  near((await snapshot(page)).scrollY, restored.scrollY, 'Back from another page preserves the queryless position');

  await load(page, '?at=41.895'); await page.waitForTimeout(650);
  const latitude = await snapshot(page);
  assert.equal(Number(new URLSearchParams(latitude.url).get('at')), 41.895, 'Startup preserves the requested latitude');
  assert(!latitude.card && latitude.scrollY > opening.scrollY + 500, 'Latitude link reaches its map destination instead of the opening view');
  await load(page, '?place=navy-pier'); await page.waitForTimeout(650);
  assert.equal(new URLSearchParams((await snapshot(page)).url).get('place'), 'navy-pier', 'Startup preserves the requested place');
  const fullScreen = await checkDetailsPresentation(page);
  if (!fullScreen) assert((await snapshot(page)).card && await page.locator('[data-place=navy-pier]').evaluate(el => {
    const box = el.querySelector('.marker-dot').getBoundingClientRect(), card = document.querySelector('#place-card').getBoundingClientRect();
    return box.left >= 0 && box.right <= innerWidth && box.top >= document.querySelector('.site-header').getBoundingClientRect().bottom && box.bottom <= innerHeight && !(box.left < card.right && box.right > card.left && box.top < card.bottom && box.bottom > card.top);
  }), 'Place link keeps its marker visible beside the details');

  const viewport = page.viewportSize();
  const mapPoint = () => page.evaluate(() => {
    const canvas = document.querySelector('#map-canvas'), box = canvas.getBoundingClientRect(), scale = new DOMMatrix(getComputedStyle(canvas).transform).a;
    const view = visualViewport, x = (view?.offsetLeft ?? 0) + (view?.width ?? innerWidth) * (innerWidth <= 700 ? .53 : .62), y = (view?.offsetTop ?? 0) + (view?.height ?? innerHeight) * .44;
    return { x: (x - box.left) / scale, y: (y - box.top) / scale };
  });
  await load(page, ''); await page.waitForTimeout(650);
  // Full-screen details intentionally block map controls. Set the map zoom
  // before opening them; desktop still permits zoom while reading details.
  if (fullScreen) { await activate(page, '#zoom-in', touch); await activate(page, '#zoom-in', touch); }
  const savedPoint = await mapPoint();
  if (fullScreen) await page.locator(`[data-place="${layout.northernPlace}"]`).dispatchEvent('click');
  else {
    await activate(page, `[data-place="${layout.northernPlace}"] .marker-dot`, touch);
    await activate(page, '#zoom-in', touch); await activate(page, '#zoom-in', touch);
  }
  assert.equal(await page.locator('#zoom-level').textContent(), '2×');
  try {
    await page.setViewportSize({ width: viewport.height, height: viewport.width }); await page.waitForTimeout(220);
    await page.goBack(); await ready(page); await page.waitForTimeout(650);
    const returnedPoint = await mapPoint();
    assert(!(await snapshot(page)).card, 'Back closes the popup after zoom and rotation');
    near(returnedPoint.x, savedPoint.x, 'Back restores the horizontal map coordinate after zoom and rotation');
    near(returnedPoint.y, savedPoint.y, 'Back restores the latitude after zoom and rotation');
    assert.equal(await page.locator('#zoom-level').textContent(), '2×', 'Back retains the current zoom');
  } finally { await page.setViewportSize(viewport); await page.waitForTimeout(220); }

  await activate(page, '#filter-toggle', touch); await activate(page, '[data-filter=beach]', touch);
  await page.evaluate(() => scrollBy({ top: 600, behavior: 'instant' })); await frame(page);
  const dragPoint = await page.evaluate(() => {
    for (let y = 120; y < innerHeight - 60; y += 40) for (let x = 70; x < innerWidth - 100; x += 40) {
      const element = document.elementFromPoint(x, y);
      if (element?.closest('#atlas') && !element.closest('button,a,.map-intro')) return { x, y };
    }
    throw new Error('No clear map area for the return-to-opening pan');
  });
  const beforePan = await snapshot(page);
  await page.mouse.move(dragPoint.x, dragPoint.y); await page.mouse.down();
  await page.mouse.move(dragPoint.x + 45, dragPoint.y, { steps: 4 }); await page.mouse.up(); await frame(page);
  assert(Math.abs((await snapshot(page)).x - beforePan.x) > 20, 'The camera is horizontally panned before returning north');
  await page.waitForTimeout(650);
  assert(new URLSearchParams((await snapshot(page)).url).has('at'), 'Exploring has saved a latitude URL');
  if (fullScreen) {
    await page.evaluate(top => scrollTo({ top, behavior: 'instant' }), opening.scrollY); await frame(page);
    near((await snapshot(page)).scrollY, opening.scrollY, 'Native scrolling returns north without overview controls');
    assert(!await page.locator('.overview').isVisible(), 'Trail overview stays hidden after exploring');
    return;
  }
  await activate(page, '#north-jump', touch);
  await page.waitForFunction(top => Math.abs(scrollY - top) < 2, opening.scrollY); await page.waitForTimeout(650);
  const north = await snapshot(page);
  near(north.scrollY, opening.scrollY, 'North restores the opening latitude');
  near(north.x, opening.x, 'North clears manual horizontal pan');
  near(north.scale, opening.scale, 'North restores the opening zoom', .002);
  assert(!north.card && !new URLSearchParams(north.url).has('place') && !new URLSearchParams(north.url).has('at'), 'North clears stale destination state');
  assert.equal(await page.locator('[data-filter=beach]').getAttribute('aria-pressed'), 'true', 'North preserves the chosen category');
  await page.reload(); await ready(page); await page.waitForTimeout(650);
  const refreshed = await snapshot(page);
  near(refreshed.scrollY, opening.scrollY, 'Refreshing after North keeps the opening latitude');
  near(refreshed.x, opening.x, 'Refreshing after North keeps the opening horizontal view');
  near(refreshed.scale, opening.scale, 'Refreshing after North keeps the opening zoom', .002);
}
async function historyAndFocus(page) {
  await load(page, '?at=41.97');
  const unpanned = await snapshot(page);
  await page.keyboard.press('ArrowRight'); await frame(page);
  const original = await snapshot(page);
  assert(Math.abs(original.x - unpanned.x) > 20, 'History starts from an intentionally panned map');
  await page.locator('[data-place=navy-pier]').dispatchEvent('click');
  await frame(page);
  await page.goBack();
  await frame(page);
  const back = await snapshot(page);
  assert.equal(Number(new URLSearchParams(back.url).get('at')), Number(new URLSearchParams(original.url).get('at')), 'Back preserves the destination latitude');
  assert(!new URLSearchParams(back.url).has('place'), 'Back removes the place selection');
  near(back.scrollY, original.scrollY, 'Back restores latitude');
  near(back.x, original.x, 'Back restores horizontal camera');
  assert(!back.card);
  await page.goForward();
  await frame(page);
  assert((await snapshot(page)).card, 'Forward reopens the linked place');

  await load(page, '?at=41.895');
  await page.locator('[data-place=navy-pier]').focus();
  await page.keyboard.press('Enter');
  await page.keyboard.press('Tab');
  await page.locator('#filter-toggle').focus();
  const outside = await snapshot(page);
  await page.keyboard.press('Escape');
  await frame(page);
  const closed = await snapshot(page);
  assert.equal(closed.focus, 'filter-toggle', 'Escape preserves focus outside the card');
  near(closed.x, outside.x, 'Escape cannot recenter the map');
  near(closed.scrollY, outside.scrollY, 'Escape cannot scroll the map');

  await page.locator('[data-place=navy-pier]').focus();
  await page.keyboard.press('Enter');
  await page.keyboard.press('Tab');
  await frame(page);
  const inside = await snapshot(page);
  await page.keyboard.press('Escape');
  await frame(page);
  assert.equal((await snapshot(page)).focus, 'navy-pier', 'Keyboard dismissal restores the visible marker');
  near((await snapshot(page)).x, inside.x, 'Returning focus cannot recenter the map');

  await page.locator('[data-place=navy-pier]').dispatchEvent('click');
  await page.locator('#filter-toggle').click();
  await page.locator('[data-filter=beach]').click();
  assert(!(await snapshot(page)).card, 'Filtering out a selection closes its stale card');
  assert.equal((await snapshot(page)).focus, 'filter-toggle');
  await page.evaluate(() => { history.pushState(null, '', '/?place=navy-pier'); dispatchEvent(new PopStateEvent('popstate')); });
  await frame(page);
  assert(await page.locator('[data-place=navy-pier]').isVisible(), 'History can reveal a place excluded by a previous filter');
}

async function positionLinks(page) {
  const bounds = await page.evaluate(async () => {
    const { height, projection: p } = await fetch('/map-config.json').then(response => response.json());
    return { north: (p.originLat + p.offsetY / p.scaleY).toFixed(4), south: (p.originLat - (height - p.offsetY) / p.scaleY).toFixed(4) };
  });
  await load(page, `?at=${bounds.south}`);
  assert((await snapshot(page)).scrollY > 2000, 'A rounded southern map latitude opens near the southern end');
  // A cold invalid northern link also happens to land at zero. Starting south
  // makes this assertion distinguish URL restoration from the opening fallback.
  await page.evaluate(north => { history.pushState(null, '', `/?at=${north}`); dispatchEvent(new PopStateEvent('popstate')); }, bounds.north);
  await frame(page);
  near((await snapshot(page)).scrollY, 0, 'History accepts the rounded northern map latitude');

  await load(page, '?place=navy-pier');
  await page.locator('.card-close').click();
  // Do not inject a scroll event: closing alone must save the displayed view.
  await page.waitForTimeout(650);
  const closed = await snapshot(page);
  assert(!closed.card && new URLSearchParams(closed.url).has('at'), 'Closing saves a latitude link');
  await page.reload(); await ready(page); await page.waitForTimeout(650);
  near((await snapshot(page)).scrollY, closed.scrollY, 'Reload after closing retains the displayed latitude');
}

async function networkRecovery(browser, engine) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, ...(engine !== 'firefox' ? { isMobile: true } : {}), reducedMotion: 'reduce' });
  const page = await context.newPage(), errors = [];
  page.on('pageerror', error => errors.push(error.message));
  try {
    for (const kind of ['data', 'tile', 'photo']) {
      let blocked = true;
      const pattern = kind === 'data' ? '**/places-data.json?*' : kind === 'tile' ? '**/assets/map/tile-*.webp?*' : '**/assets/photos/*';
      await page.route(pattern, route => blocked ? route.abort() : route.continue());
      await page.goto(base + '/?place=navy-pier');
      const recovery = page.locator(kind === 'photo' ? '.card-photo-error button' : '#map-status button');
      await recovery.waitFor();
      if (kind === 'data') {
        assert(await page.locator('#atlas').evaluate(el => el.inert));
        await page.locator('.mobile-menu summary').tap();
        assert(await page.locator('.mobile-menu').evaluate(el => el.open), 'Navigation works while data is unavailable');
        await page.locator('.mobile-menu summary').tap();
      } else {
        assert((await snapshot(page)).card, 'Network failure leaves place details usable');
        if (kind === 'tile') {
          assert(await page.locator('.map-tile[data-failed] img').count() > 0, 'Tile previews remain during failure');
          await page.locator('.card-close').tap();
        }
      }
      blocked = false;
      await recovery.tap();
      await page.waitForSelector('#atlas[data-ready=true]');
      if (kind === 'photo') await page.waitForFunction(() => { const image = document.querySelector('.card-photo'); return image?.complete && image.naturalWidth > 0 && !document.querySelector('.card-photo-error'); });
      else await page.waitForFunction(() => document.querySelector('#map-status').hidden && !document.querySelector('.map-tile[data-failed]'));
      await page.unroute(pattern);
    }
    // Slow data gets a useful loading state, then resumes the original deep link.
    await page.route('**/places-data.json?*', async route => { await new Promise(resolve => setTimeout(resolve, 1200)); await route.continue(); });
    await page.goto(base + '/?place=navy-pier', { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => document.querySelector('#map-status')?.textContent.includes('Loading the map'));
    await page.waitForSelector('#atlas[data-ready=true]');
    assert((await snapshot(page)).card);
    assert.deepEqual(errors, [], 'Recoverable network failures produce no uncaught errors');
    return ['data retry', 'tile retry with previews', 'photo retry', 'slow data with working navigation'];
  } finally { await context.close(); }
}

for (const engine of engines) {
  assert(['chromium', 'firefox', 'webkit'].includes(engine), `Unknown browser engine: ${engine}`);
  const browser = await browsers[engine].launch({ headless: true });
  try {
    for (const [label, width, height, touch] of [
      ['desktop', 1440, 1000, false], ['tablet', 800, 600, false],
      ['small-phone', 320, 740, true], ['phone', 390, 844, true],
      ['short-landscape', 667, 375, true], ['landscape', 844, 390, true],
      ['touch-tablet', 1024, 768, true],
    ]) {
      const context = await browser.newContext({ viewport: { width, height }, hasTouch: touch, ...(engine !== 'firefox' ? { isMobile: touch } : {}), deviceScaleFactor: touch ? 2 : 1, reducedMotion: 'reduce' });
      const page = await context.newPage();
      const errors = [];
      page.on('pageerror', error => errors.push(error.message));
      page.setDefaultTimeout(10000);
      try {
        const openingChecked = ['desktop', 'small-phone', 'short-landscape'].includes(label);
        if (openingChecked) await homepageOpening(page, touch);
        await load(page);
        assert.equal(await page.locator('.map-marker').count(), 185);
        assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'No horizontal page overflow');
        const before = await snapshot(page);
        const fullScreen = await checkDetailsPresentation(page);
        assert(await page.evaluate(() => { const c = document.querySelector('#card-content'); return c.clientHeight - document.querySelector('.card-heading').offsetHeight >= 60; }), 'Card leaves usable reading space');
        const scrollable = await page.locator('#card-content').evaluate(el => el.scrollHeight > el.clientHeight + 1);
        assert.equal(await page.locator('.card-scrollbar').isVisible(), scrollable, 'Scrollbar appears only for overflow');
        if (scrollable) {
          const bar = await page.locator('.card-scrollbar').boundingBox();
          if (touch) await page.touchscreen.tap(bar.x + bar.width / 2, bar.y + bar.height - 5);
          else await page.mouse.click(bar.x + bar.width / 2, bar.y + bar.height - 5);
          await frame(page);
          assert(await page.locator('#card-content').evaluate(el => el.scrollTop > 0), 'Scrollbar track scrolls details');
          near((await snapshot(page)).scrollY, before.scrollY, 'Scrollbar cannot scroll map');
          await page.locator('#card-content').evaluate(el => { el.scrollTop = 0; });
        }
        if (fullScreen) await activate(page, '.card-close', touch);
        // The same controls provide a single-pointer alternative to pinch.
        assert(await page.locator('#zoom-in').isVisible());
        assert(!await page.locator('.map-zoom').evaluate(el => el.inert));
        await activate(page, '#zoom-in', touch);
        near((await snapshot(page)).scale / before.scale, 1.5, 'Visible zoom control works', .01);
        await activate(page, '#zoom-out', touch);
        const resting = await snapshot(page);
        const y = Math.min(200, height * .4);
        await page.mouse.move(130, y); await page.mouse.down();
        await page.mouse.move(180, y - 45, { steps: 8 }); await page.mouse.up(); await frame(page);
        const dragged = await snapshot(page);
        near(dragged.x - resting.x, 50, 'Two-dimensional map drag X');
        near(dragged.scrollY - resting.scrollY, 45, 'Two-dimensional map drag Y');
        assert.equal(dragged.card, !fullScreen, 'Map dragging remains available outside desktop details or after closing full-screen details');
        if (fullScreen) {
          await activate(page, '[data-place=navy-pier] .marker-dot', touch);
          assert.equal(await page.locator('#card-title').textContent(), 'Navy Pier', 'The actual marker reopens full-screen details after map navigation');
          await checkDetailsPresentation(page);
        } else for (const key of ['x', 'y', 'width', 'height']) near(dragged.rect[key], resting.rect[key], `Card remains fixed: ${key}`);
        const reading = await snapshot(page);
        // Card wheel input must not leak into page/map scrolling at either edge.
        for (const edge of [0, 1]) {
          await page.locator('#card-content').evaluate((el, bottom) => { el.scrollTop = bottom ? el.scrollHeight : 0; }, edge);
          if (engine === 'webkit' && touch) {
            // Playwright's mobile WebKit transport has no wheel input. Exercise
            // native keyboard containment here; trusted touch is checked separately.
            await page.locator('#card-content').focus();
            await page.keyboard.press(edge ? 'PageDown' : 'PageUp');
          } else {
            await page.mouse.move(reading.rect.x + 35, reading.rect.bottom - 25);
            await page.mouse.wheel(0, edge ? 300 : -300);
          }
          await page.waitForTimeout(80);
          near((await snapshot(page)).scrollY, reading.scrollY, 'Card scroll boundary contains wheel');
          await page.locator('.card-location-source a').evaluate(el => el.focus({ preventScroll: true }));
          await page.locator('#card-content').evaluate((el, bottom) => { el.scrollTop = bottom ? el.scrollHeight : 0; }, edge);
          await page.keyboard.press(edge ? 'Space' : 'Shift+Space');
          await page.waitForTimeout(250);
          near((await snapshot(page)).scrollY, reading.scrollY, 'Space on a popup link cannot scroll the map at either boundary');
        }
        await page.locator('.card-close').evaluate(el => el.focus({ preventScroll: true }));
        await page.keyboard.press('Space'); await frame(page);
        const dismissed = await snapshot(page);
        assert(!dismissed.card, 'Space still activates a real popup button');
        near(dismissed.x, reading.x, 'Dismissal retains map pan');
        near(dismissed.scrollY, reading.scrollY, 'Dismissal retains map latitude');
        // A fresh direct tap selects the actual visible dot after map movement.
        await page.evaluate(() => { history.pushState(null, '', '/?place=navy-pier'); dispatchEvent(new PopStateEvent('popstate')); });
        await frame(page); await activate(page, '.card-close', touch);
        await activate(page, '[data-place=navy-pier] .marker-dot', touch);
        assert.equal(await page.locator('#card-title').textContent(), 'Navy Pier');
        await activate(page, '.card-close', touch);
        await activate(page, '#filter-toggle', touch);
        await activate(page, '[data-filter=beach]', touch);
        assert(await page.evaluate(() => [...document.querySelectorAll('.map-marker:not(.hidden)')].every(el => el.classList.contains('beach'))));
        await activate(page, '#filter-toggle', touch); await activate(page, '[data-filter=all]', touch);
        await activate(page, '#filter-toggle', touch);
        await page.locator('[data-filter=beach]').focus(); await page.keyboard.press('Escape');
        assert(await page.locator('#filters').evaluate(el => el.hidden), 'Escape closes the filter menu');
        assert.equal((await snapshot(page)).focus, 'filter-toggle', 'Escape returns focus to the filter opener');
        if (width <= 700) {
          await activate(page, '.mobile-menu summary', touch);
          await page.locator('.mobile-menu a').first().focus(); await page.keyboard.press('Escape');
          assert(await page.locator('.mobile-menu').evaluate(el => !el.open), 'Escape closes mobile navigation');
          assert(await page.locator('.mobile-menu summary').evaluate(el => el === document.activeElement), 'Escape returns focus to the mobile menu opener');
        }
        // Resizing and rotation keep the selected card readable.
        await load(page, '?place=south-shore-cultural-center');
        await page.setViewportSize({ width: height, height: width });
        await page.waitForTimeout(220); await frame(page);
        await checkDetailsPresentation(page);
        assert(await page.evaluate(() => { const r = document.querySelector('.card-close').getBoundingClientRect(); return r.top >= 0 && r.bottom <= innerHeight && r.left >= 0 && r.right <= innerWidth; }), 'Close stays reachable after rotation');
        await page.setViewportSize({ width, height }); await page.waitForTimeout(220);

        if (label === 'desktop' || label === 'phone') await positionLinks(page);

        let cards = 0;
        if (label === 'desktop') {
          await historyAndFocus(page);
          await load(page);
          cards = await page.evaluate(async () => {
            const places = await fetch('/places-data.json').then(response => response.json());
            const push = history.pushState, replace = history.replaceState;
            history.pushState = history.replaceState = () => {};
            try {
              for (const place of places) {
                document.querySelector(`[data-place="${place.id}"]`).click();
                await new Promise(resolve => requestAnimationFrame(resolve));
                if (!document.querySelector('#place-card').open || document.querySelector('#card-title').textContent !== place.name) throw new Error(`Wrong popup: ${place.id}`);
                const image = document.querySelector('#card-body img');
                if (place.photo) { if (image?.getAttribute('src') !== place.photo.src) throw new Error(`Wrong photo: ${place.id}`); await image.decode(); }
                else if (image) throw new Error(`Unexpected photo: ${place.id}`);
                document.querySelector('.card-close').click();
              }
              return places.length;
            } finally { history.pushState = push; history.replaceState = replace; }
          });
        }
        const recovery = label === 'phone' ? await networkRecovery(browser, engine) : [];
        assert.deepEqual(errors, [], 'No uncaught browser errors');
        const result = { engine, version: browser.version(), label, viewport: [width, height], touchEmulated: touch, fullScreenDetails: fullScreen, openingChecked, panelBoundaryInput: engine === 'webkit' && touch ? 'keyboard' : 'wheel', cards, recovery, status: 'pass' };
        reports.push(result); console.log(JSON.stringify(result));
      } catch (error) {
        await page.screenshot({ path: `.cache/reports/engine-failure-${engine}-${label}.png` });
        throw new Error(`${engine}/${label}: ${error.message}`, { cause: error });
      } finally { await context.close(); }
    }
  } finally { await browser.close(); fs.writeFileSync('.cache/reports/cross-browser.json', JSON.stringify(reports, null, 2) + '\n'); }
}
console.log(`PASS: ${reports.length} engine/viewport combinations. Mobile emulation does not replace physical-device testing.`);
