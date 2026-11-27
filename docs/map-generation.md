# Map generation

The committed website serves pre-generated map assets. Validation, local development and deployment never invoke these generation scripts. Editing prose or CSS does not require geographic acquisition or raster rendering.

The map uses `scripts/lib/map-coordinates.mjs` for the shared projection. `trail-geometry.mjs` builds connected walking and bicycle routes and latitude-based overview samples; `street-labels.mjs` positions labels from source road centerlines. The main atlas deliberately expands east–west geography; the overview uses geographic aspect. Neither is a navigation survey.

## Regenerate from included data

Use Node.js and, when tile content changes, `agent-browser` 0.26.0 with its Chromium installed. The existing renderer uses four 1300-unit columns per 690-unit row, a 1.5 raster scale and WebP quality 0.88. SVG text uses the system Georgia/serif fallback: exact raster bytes can vary across OS/font/browser versions. The versioned delivery files provide stable deployments.

```sh
npm run map:generate
npm run check
```

`map:generate` works in a temporary directory, creates SVGs/configuration, reuses tiles with matching source hashes, renders changed tiles, refreshes the matching committed pages and runs geographic checks before promoting the complete outputs. A rendering/check failure leaves the existing website and map metadata untouched. Copy failures restore the backed-up assets. `npm run map:generate -- --force` rerenders every row; use it only when intentionally reviewing a renderer change. Inspect desktop/mobile screenshots, anchor placement and tile seams before accepting changes.

The input fingerprint includes geometry, routes, landmark settings, map-generation code, illustration WebPs, and place IDs/names/coordinates in source order. Hashes of all approved map files are checked by normal validation. Do not hand-edit the fingerprint to bypass a meaningful map change.

## Acquire updated geographic data

Python 3.10+ and network access are needed only to update upstream geometry:

```sh
python3 scripts/data-tools/fetch-geo.py --expand-city --complete-water
python3 scripts/data-tools/fetch-route-relations.py
python3 scripts/data-tools/extract-trail-routes.py --reviewed-on YYYY-MM-DD
npm run map:generate
npm run check
```

Replace the date with the actual date you reviewed the coordinates. Downloads go to ignored `data/raw/`. `fetch-geo.py --cached-only` uses existing extracts; an empty cache cannot recreate a historical acquisition. New downloads reflect upstream changes and are not guaranteed to reproduce the November 18 snapshot. Included processed geometry and route data are sufficient to reproduce the current vector map without that cache.

Review upstream differences, update coordinate evidence, and preserve OpenStreetMap feature IDs and ODbL attribution. Do not fill missing route segments with invented straight lines. Changes that alter geography, place IDs, artwork, public URLs or attribution need focused review.

Original artwork files are retained in `data/artwork/`; optimized versions are in `public/assets/`. Two photo-derived illustrations retain reference and license records in `data/artwork/attribution.json`. The map pipeline reuses the original artwork; it does not recreate that artwork from a recipe. Any replacement must preserve or correctly update its rights and credits.
