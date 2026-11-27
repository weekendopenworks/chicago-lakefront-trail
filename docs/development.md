# Development

The complete website is committed in `public/`. Serve that directory with any static HTTP server, or use Node.js 20.19+ and `npm run dev`. No install or build is needed; the package and lockfile have no dependencies. CI uses `npm ci --ignore-scripts --offline` to verify the lockfile. Python, browser automation and credentials are unnecessary for ordinary development.

The local server serves only `public/` and binds to loopback. Use `PORT=4188 npm run dev` on a POSIX shell for another port. Edits are available on the next browser refresh. It never watches files, copies assets or generates content. The production-only analytics endpoint returns 404 locally.

## Editing and explicit page refresh

Edit JavaScript, CSS, fonts and delivery assets directly in `public/`. For editorial content, use the canonical place/photo data or templates under `scripts/pages/`, then run:

```sh
npm run update:pages
npm run check
```

The page command owns `public/index.html`, `public/places/index.html`, the story pages under `public/places/<id>/`, `public/credits/index.html`, `public/privacy/index.html`, `public/places-data.json`, `public/sitemap.xml`, `public/robots.txt` and `public/llms.txt` (22 files for the current inventory). It prepares content in memory, validates data and approved map fingerprints, then writes only those files, restoring previous contents on a write failure. It does not remove old routes; an intentional removal needs a separate URL migration decision. Hand edits to owned files will be overwritten, so change their data/templates instead. All other files in `public/` are maintained directly.

Run the same command after CSS or JavaScript changes to refresh page cache revisions. Review and include the updated pages in the pull request. It does not regenerate map assets, acquire data or invoke a browser. [Map generation](map-generation.md) is a separate explicit maintenance operation.

## Validation

Run `npm run check && npm test`. Checks leave `public/` and canonical data unchanged; disposable geographic/browser reports go to `.cache/reports/`. Page freshness is checked by comparing expected strings in memory, without saving pages. Checks also cover JavaScript syntax, JSON parsing, record integrity, safe URLs, coordinate evidence, photo-credit fields, all internal HTML links, metadata, sitemap coverage, map continuity, route interpolation, and a local secret-pattern scan. Photo-credit checks validate recorded fields, not legal clearance. `.editorconfig` sets UTF-8, LF and indentation; preserve nearby style and avoid unrelated reformatting.

Optional browser checks use `agent-browser` 0.26.0 with Chromium installed. Install that tool separately; it is not an application dependency. With a preview running:

```sh
npm run check:browser
npm run check:zoom
```

Set `LAKEFRONT_TEST_URL=http://127.0.0.1:4188` when using another local port. The first suite checks cards, photo loading, filters, shared links, responsive navigation, drag and every discovery at both zoom extremes. The second uses Chromium’s DevTools protocol for native touch, pinch anchoring, viewport changes, wheel/keyboard scroll containment and browser zoom. Node 20 needs the WebSocket flag already included in the command. Tests write disposable reports/screenshots to `.cache/reports/`.

There is no application search field in the current site. Use category filters, the geographic map, the collection, or browser Find. Do not report search-interface tests as passing.

The optional engine matrix uses Playwright 1.65.1 installed outside the project. For example, on a POSIX shell:

```sh
npm install --prefix /tmp/lakefront-browser-tools --no-save --package-lock=false playwright@1.65.1
/tmp/lakefront-browser-tools/node_modules/.bin/playwright install chromium firefox webkit
LAKEFRONT_PLAYWRIGHT=/tmp/lakefront-browser-tools/node_modules/playwright/index.mjs npm run check:engines
LAKEFRONT_PLAYWRIGHT=/tmp/lakefront-browser-tools/node_modules/playwright/index.mjs npm run check:motion
LAKEFRONT_PLAYWRIGHT=/tmp/lakefront-browser-tools/node_modules/playwright/index.mjs npm run check:popups
LAKEFRONT_PLAYWRIGHT=/tmp/lakefront-browser-tools/node_modules/playwright/index.mjs npm run check:performance
```

Install the browser platform's runtime libraries when required; see [Playwright's browser documentation](https://playwright.dev/docs/browsers). These tools are not required by ordinary validation or deployment. `LAKEFRONT_ENGINES=webkit` limits the engine matrix to one browser. The matrix covers seven viewport sizes per engine, popup/photo identity, history/focus, rotation, controls, scrollbar behavior, and failed/slow network recovery. Mobile WebKit lacks automated wheel input, so those entries use keyboard boundary checks; the Chromium gesture suite separately checks trusted touch swipes.

The motion suite exercises animations with reduced motion disabled, trackpad-style wheel input, keyboard navigation, interrupted zoom, and trusted Chromium touch momentum. The popup suite checks full-screen mobile reading, close/history/focus behavior, rotation and the desktop side panel. Run browser suites sequentially so competing browser processes do not distort gesture timing. Synthetic lifecycle/Safari gesture events test handler cleanup; they do not certify OS gesture delivery.

The performance command measures a fixed mobile pinch sequence at 1×, 4× and 6× CPU slowdown, three runs each. Set `LAKEFRONT_PERF_INPUT=buttons`, `wheel` or `glide` to measure the other navigation paths with animations enabled. Run it alone on an otherwise idle machine. It reports timings rather than imposing a machine-dependent pass threshold. Set `LAKEFRONT_PERF_RUNS=1` for a quick measurement; `LAKEFRONT_BASELINE_APP=/absolute/path/to/earlier/app.js` permits a same-host comparison using an earlier compatible application file. Results are saved in `.cache/reports/` and never exported.

See [map interactions](map-interactions.md) for how the map responds to touch, mouse, trackpad and keyboard input. Engine and mobile emulation do not replace physical iPhone/Android testing or shipped Safari/Chrome/Firefox on their target operating systems. Check keyboard focus, reduced motion, contrast, image alternatives, and screen-reader behavior for affected UI. No blanket accessibility-conformance claim is made.

Optional acquisition scripts require Python 3.10+; photo conversion additionally requires ImageMagick (`convert` and `identify`). They access upstream public services and require editorial review. Compile Python scripts without creating caches with `python3 -c "import ast,pathlib; [ast.parse(p.read_text()) for p in pathlib.Path('scripts').rglob('*.py')]"`.

## CI and hosting

The GitHub workflow validates pull requests and pushes on Node 20, 22 and 24, checks the publication manifest, and verifies a clean export. It uses read-only repository permissions and pinned actions, with no deployment step, production secrets or privileged pull-request trigger. It never generates pages or maps. Browser suites remain optional.

`vercel.json` selects no framework and publishes `public/`, retaining clean URLs, trailing slashes and the canonical origin `https://chicagolakefronttrail.com`. Vercel calls its pre-publication hook a “Build Command”; here it runs only `npm run check && npm test && npm run check:publication`. A failure prevents that deployment from publishing. No page generation, map rendering, Python, browser installation or network data acquisition is part of that command. Any other static host can publish `public/` directly after equivalent validation.

Keep `vercel.json` as compact JSON with a final newline. Vercel serializes it this way before running validation, so matching that format preserves the publication manifest's exact byte checks. After reviewing configuration changes, refresh the manifest with `npm run manifest`.

Vercel Git builds and GitHub Actions run independently. To make production domain assignment wait for the GitHub results as well, the maintainer must add `check (20)`, `check (22)` and `check (24)` as required GitHub [Deployment Checks](https://vercel.com/docs/deployment-checks) in Vercel, and require reviewed pull requests and passing checks in GitHub branch rules. The JSON file does not create those dashboard settings. Until configured, Vercel gates on its own validation command, not completion of the GitHub matrix.

The [Vercel configuration reference](https://vercel.com/docs/project-configuration/vercel-json) documents the command and output-directory overrides. Domain redirects, analytics, account logs and repository connections are hosting settings outside this repository.
