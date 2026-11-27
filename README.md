# Chicago Lakefront Trail

An independent, free community guide to Chicago’s lakefront: an illustrated interactive map, 185 places, locally hosted photography, and 14 destination stories.

Visit [chicagolakefronttrail.com](https://chicagolakefronttrail.com).

The site uses vanilla HTML, CSS and JavaScript with Node.js validation and maintenance scripts. The committed `public/` directory is the complete deployable website; no build is required. There are no application npm dependencies, accounts, database, or live trail-condition feeds. It is not operated by or affiliated with the City of Chicago or Chicago Park District.

## Get started

Use Node.js 20.19 or newer; a supported Node.js LTS release is preferable. Python and browser automation are needed only for optional specialist workflows.

```sh
npm run dev
```

Open <http://127.0.0.1:4179>. Refresh the browser after edits. No package installation is needed: the tooling uses only built-in Node.js modules. Any static HTTP server can serve `public/`.

| Command | Purpose |
| --- | --- |
| `npm run dev` | Serve committed `public/` locally |
| `npm run check` | Validate syntax, data, page freshness, maps, links, assets, SEO and credential patterns |
| `npm test` | Data/security and publication boundary tests |
| `npm run update:pages` | Explicitly refresh pages after editorial, template, CSS or JavaScript edits |
| `npm run map:generate` | Explicitly regenerate map assets; optional renderer requirements apply |
| `npm run check:browser` | Desktop/mobile interaction checks against the local site |
| `npm run check:zoom` | Native Chromium touch and zoom checks |
| `npm run check:engines` | Optional Chromium, Firefox and WebKit interaction matrix |
| `npm run check:performance` | Optional mobile pinch measurements under CPU slowdown |

## Where to edit

| Path | Purpose |
| --- | --- |
| `public/` | Ready-to-serve HTML, CSS, JavaScript, runtime data, images and fonts |
| `public/app.js`, `public/site.js` | Browser behavior |
| `public/styles.css`, `public/editorial.css` | Styles |
| `scripts/pages/templates/` | Homepage template, shared navigation and SEO |
| `scripts/pages/render-pages.mjs` | Collection, story, credits and privacy layouts |
| `data/places/places.json` | Place descriptions, coordinates and stories |
| `data/photos/` | Photo records, attribution and review evidence |
| `data/geography/` | Geography, routes and map evidence |
| `data/artwork/` | Original artwork files and derivative attribution |
| `scripts/map/` | Optional map generation, separate from validation and deployment |
| `docs/` | Contributor and release documentation |

Edit browser code and styles directly in `public/`. For page content, edit the canonical data or templates and run `npm run update:pages`; include the refreshed files in the same change. This also updates cache revisions after CSS/JavaScript changes. [Development](docs/development.md) lists the files the command owns. Validation, local serving and deployment do not write website files or regenerate map tiles.

## Contribute

Small corrections, properly licensed photographs, accessibility improvements and documentation are welcome. Start with [CONTRIBUTING.md](CONTRIBUTING.md), [development](docs/development.md), [place editing](docs/adding-places.md), or [photography](docs/photography.md).

The map supports drag, zoom, category filters and shareable place/position links. The collection remains readable without JavaScript. It is an illustrated guide, not turn-by-turn navigation; check official sources and on-site signs for current access and conditions.

## Data and licensing

OpenStreetMap contributors provide geographic data under the ODbL. Photographs and fonts retain their individual licenses. See [data sources](docs/data-sources.md) and [third-party notices](THIRD_PARTY_NOTICES.md).

The source code is available under the [MIT License](LICENSE). Geographic data, photographs, illustrations and fonts are not covered by it; they keep the licenses listed in [third-party notices](THIRD_PARTY_NOTICES.md).
