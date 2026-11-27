# Photography

Suggest photographs through the photography/attribution issue template, including the original source page, creator, exact license/version and the depicted place. Upload only material you have permission to distribute. A photo license may not cover a sculpture or artwork appearing in the photo.

Canonical delivery records are in `data/photos/photos.json`; exact reviewed source selections are in `reviewed-photos.json`. They map stable place IDs to local files in `public/assets/photos/`. Each entry needs a title, creator, source URL, license name/URL, alt text and intrinsic width/height. Use `fit: "contain"` for the full composition and for restricted-derivative photographs. Captions should identify contextual or historical images honestly.

Keep source-page rights evidence under `data/photos/provenance/`. Update the matching entry and counts in `photo-audit.json` and `photo-gaps.json`. The geographic checker verifies that every published photo matches an audited source; it does not grant legal clearance.

`python3 scripts/data-tools/fetch-photos.py` fetches exact reviewed Commons files; it requires Python 3.10+, ImageMagick and a network connection. Existing files are reused unless `--refresh` is specified. A changed source license or non-Commons source stops automatic acquisition for manual review. Do not run refresh on BY-ND or custom-license material without checking the exact terms and transformations.

Inspect the actual subject and image quality before accepting a file. Keep required copyright/creator metadata. Remove unrelated personal camera or contact metadata only after distinguishing it from attribution requirements. A technical conversion is different from a substantive crop or alteration; record changes and retain the applicable version of the license.

The two Richard Bartlaga JPEGs carry CC BY-ND 2.0. Preserve their full files and composition until their source-to-delivery comparison is documented. The two architectural adaptations have separate ShareAlike records in `data/artwork/attribution.json`.

Run `npm run update:pages && npm run check`, inspect the map card, collection and story, and confirm visible creator/source/license links. For photos of modern sculptures and artworks, a photographer’s Creative Commons license does not by itself cover the depicted work; note the artwork’s rights status in the photo record.
