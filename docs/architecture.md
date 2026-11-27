# Architecture

`public/` is the complete static website, committed to the repository and directly deployable. Its 18 HTML pages, plain JavaScript, CSS, fonts, photographs, map tiles and runtime JSON need no bundler, framework, package installation or build step. Browser JavaScript fetches `places-data.json` and `map-config.json` and loads nearby WebP map tiles. Vercel Web Analytics is the only tracking integration found in the application.

```text
public/                  directly served website, including all pre-generated assets
  assets/  fonts/        local map tiles, photographs, illustrations and licensed fonts
  places/ credits/ privacy/
data/artwork/            active original illustrations and derivative credits
data/geography/          processed OSM geometry, routes, placement evidence, render records
data/places/             canonical editorial records and historical source evidence
data/photos/             canonical photo records, licensing metadata and review evidence
scripts/pages/           explicit page refresh; templates/ holds homepage, chrome and SEO
scripts/map/             explicit map generation and raster rendering
scripts/lib/             geometry, validation and export helpers
scripts/validation/      static and optional browser checks
scripts/data-tools/      optional geographic/photo acquisition and link checking
scripts/serve.mjs         small local static server
scripts/publication.mjs   allowlisted export and manifest verification
tests/                   security and data-boundary regression tests
docs/                    contributor and release guidance
.github/                 contribution templates and validation workflow
```

The original build mixed editable files with generated output in `dist/`. Inspection confirmed that it copied browser assets, generated editorial pages, recreated SVG maps and invoked a browser renderer. None of those operations is needed to serve the completed site. The redundant copy layer and mandatory build command have been removed. Existing routes and asset names are preserved, with one authoritative copy of browser code and assets in `public/`.

Node.js primarily validates committed content and serves it locally. `npm run update:pages` is an explicit maintenance command that assembles repeated editorial content and cache revisions. Its `--check` mode compares expected strings with committed files without writing them; normal validation uses that mode to catch forgotten updates. See [development](development.md) for page ownership. Deployment publishes the committed files after validation.

`public/assets/map/` contains ten detailed SVG sections, ten placeholders and forty WebP display tiles. `public/map-config.json` is the sole delivery configuration; `data/geography/map-tile-manifest.json` records tile source hashes. `map-inputs.json` checks the approved map inputs and outputs. Description and style edits do not regenerate maps. `npm run map:generate` is required only for intentional map input changes and uses a temporary stage before updating approved assets and matching pages.

Place descriptions and stories stay in `data/places/places.json`; source and licensing evidence stay outside page layouts. Only the two intended runtime JSON files are served, not the entire data tree.

Historical records under `provenance/` retain original filenames to distinguish observations made in separate reviews. They are evidence, not alternate editable datasets. Some contain superseded content; current records and their explicit source review take precedence. Active artwork originals and their delivery formats are intentionally both retained; they serve different purposes. Optimized compatibility assets remain at their existing public paths. Repeated blank tiles and the shared beach/beach-house photograph retain separate filenames to preserve the current URL contract.

The application escapes text used in HTML and structured data. Validation restricts identifiers, categories, coordinates, photo paths and external URLs before output generation. The local server refuses path traversal and symlink escapes. Runtime data is generated from these validated repository inputs, not arbitrary visitor input.

Remaining limits include system-font differences during optional raster rendering, manually reviewed factual data, source-specific asset rights, and hosting headers that are configured outside this repository.
