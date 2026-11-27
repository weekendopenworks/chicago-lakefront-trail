# Contributing

A spelling correction is as welcome as a code improvement. Keep changes focused and explain the result for visitors.

| Change | Edit |
| --- | --- |
| Place description, story, visitor link | `data/places/places.json` |
| Homepage wording | `scripts/pages/templates/index.html` |
| Shared navigation | `scripts/pages/templates/site-chrome.mjs` |
| Supporting-page copy | `scripts/pages/render-pages.mjs` |
| Styles or interaction | CSS or JavaScript directly in `public/` |
| Coordinates or new place | Follow [place editing](docs/adding-places.md) |
| Photograph or attribution | Follow [photography](docs/photography.md) |
| Map linework or artwork | Follow [map generation](docs/map-generation.md) |

Run `npm run dev` to serve `public/` immediately. After changing editorial data, templates, CSS or JavaScript, run `npm run update:pages` and review the resulting page/data diff. Include pre-generated pages and assets in the same pull request, retaining their licenses and attribution. Before submitting, run:

```sh
npm run check
npm test
```

When you add, remove or change files, refresh the file manifest with `npm run manifest`, review its diff, and run `npm run check:publication`.

For interface changes, inspect desktop and narrow mobile layouts and keyboard navigation. The optional browser checks are described in [development](docs/development.md). New tests should protect meaningful behavior; copy corrections do not need new tests.

Preserve place IDs and existing URLs. Link reliable sources for factual changes and distinguish a historical observation from current conditions. Do not add private information, credentials, unsupported claims of official endorsement, or images found online without clear reuse rights.

Open an issue if you are unsure about coordinates or a photograph’s rights; you do not need to understand the renderer to suggest a correction. A pull request should explain the change, its sources, checks run, and any relevant screenshots or attribution changes. Follow the [Code of Conduct](CODE_OF_CONDUCT.md).

Code contributions are accepted under the project’s [MIT License](LICENSE). Third-party material must retain its own terms; public availability alone is not permission to reuse it.
