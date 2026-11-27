# Edit or add a place

Edit `data/places/places.json`, not generated HTML. Each record needs a stable lowercase hyphenated `id`, name, category (`beach`, `nature`, `harbor`, `landmark`), description, fact, practical advice, access description, region number 0–9, region name, related IDs, latitude/longitude, official URL, source URLs, coordinate URL and point meaning. Use an existing nearby record as a schema example. A `story` is an array of paragraphs; adding one creates a permanent `/places/ID/` URL.

For a spelling or description correction, edit the relevant text and run `npm run update:pages && npm run check`. Support factual changes with an official park, venue or institutional source. Distinguish dated observations from current conditions; do not promise safe access, live closures or accessibility without evidence.

For coordinate corrections, identify the relevant OSM node, way or relation and explain whether the point is a building interior, monument, area reference or entrance. Preserve `coordinateUrl`, `coordinateSource`, `pointKind` and any `coordinateMapUrl`. Update the corresponding record in `data/geography/location-audit.json`; pins and evidence must agree. Use geographic coordinates, not screen-pixel offsets.

For a new place, choose an unused stable ID, select its region, add related IDs that exist, and add a reviewed location-evidence record. Update the audit’s count and any photo gap/audit inventory. If there is no suitable licensed photograph, add a location-header entry to `data/photos/photo-audit.json` and the gap list; use a nearby no-photo record as the example. Do not substitute an unrelated landmark photo.

Coordinate, name and inventory changes affect map labels. Run `npm run map:generate`, inspect the resulting map, then run all ordinary checks. Do not rename IDs or remove existing story URLs without an explicit migration decision.

To suggest a correction without editing code, file the geographic correction or new place issue template with a source link and a clear description. Automated checks cannot establish whether a source is accurate; a reviewer must inspect the evidence.
