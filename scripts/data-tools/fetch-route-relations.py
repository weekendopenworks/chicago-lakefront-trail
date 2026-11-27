"""Download complete OSM trail relations into the disposable local cache.

This retrieves current upstream data; it does not recreate the historical
snapshot. Inspect and review extracted coordinates before replacing map assets.
"""
import pathlib
import urllib.request
import xml.etree.ElementTree as ET

root = pathlib.Path(__file__).resolve().parents[2]
cache = root / 'data/raw'
cache.mkdir(parents=True, exist_ok=True)
for relation in ('8676789', '17527976'):
    url = f'https://api.openstreetmap.org/api/0.6/relation/{relation}/full'
    request = urllib.request.Request(url, headers={'User-Agent': 'LakefrontTrailAtlas/1.0 (route geometry)'} )
    with urllib.request.urlopen(request, timeout=60) as response:
        data = response.read(25 * 1024 * 1024 + 1)
    if len(data) > 25 * 1024 * 1024:
        raise ValueError('OSM relation exceeds 25 MiB')
    document = ET.fromstring(data)
    if document.find(f"relation[@id='{relation}']") is None:
        raise ValueError(f'Missing requested OSM relation {relation}')
    temporary = cache / f'route-{relation}.tmp'
    temporary.write_bytes(data)
    temporary.replace(cache / f'route-{relation}.xml')
    print(f'Cached relation {relation}; run extract-trail-routes.py and review its diff.')
