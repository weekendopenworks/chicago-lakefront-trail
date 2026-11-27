# Data sources

| Material | Canonical record | Provenance and constraints |
| --- | --- | --- |
| Shoreline, buildings, roads, water, trees, parks | `data/geography/geography.json` | OpenStreetMap extracts; source URLs and feature IDs retained; ODbL |
| Walking/cycling routes | `data/geography/trail-routes.json` | OSM relations 8676789 and 17527976, exact member ways and nodes |
| Place locations | `data/geography/location-audit.json` | Point meaning, coordinates and source evidence for each place |
| Attraction text and stories | `data/places/places.json` | Linked Park District, venue and institutional sources |
| Aerial comparison | `data/geography/aerial-reference-audit.json` | Cook County GIS and USGS/USDA NAIP reference records; no aerial basemap shipped |
| Photographs | `data/photos/photos.json` | Creator, source page and exact license per image |
| Illustration adaptations | `data/artwork/attribution.json` | Reference photograph, creator, license and modification notice |

The recorded geographic acquisition date is November 18, 2026. This is not the survey date of every feature or evidence of current trail conditions. Aerial records explicitly note inconsistent Cook County acquisition-year metadata and older NAIP imagery. Historical review files under `provenance/` are retained as evidence, with their original filenames; they are not alternate current datasets.

© OpenStreetMap contributors. Data is available under the [ODbL 1.0](https://opendatacommons.org/licenses/odbl/1-0/). Keep the [OpenStreetMap attribution](https://www.openstreetmap.org/copyright) visible and preserve database obligations when distributing modified extracts. The repository includes the processed geographic database used to make the map.

Photo metadata includes source-page text and rights records from Commons, Flickr and the Library of Congress. Preserve source-specific terms and notices; the project’s MIT License does not cover them. Provider metadata, creator names and contributor usernames are third-party attribution.

`python3 scripts/data-tools/verify-sources.py` checks current visitor-information URLs and writes `.cache/reports/source-links.json`. A successful HTTP response does not verify the facts; a blocked or redirected request does not by itself mean the source is false. Review the linked content and record the actual review date.
