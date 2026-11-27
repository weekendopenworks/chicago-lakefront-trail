"""Check public visitor-information links; results are evidence, not factual review."""
import concurrent.futures
import json
import pathlib
import urllib.parse
import urllib.request

root = pathlib.Path(__file__).resolve().parents[2]
places = json.loads((root / 'data/places/places.json').read_text())

def check(place):
    url = place['officialUrl']
    parsed = urllib.parse.urlparse(url)
    if parsed.scheme != 'https' or parsed.username or parsed.password:
        return {'id': place['id'], 'error': 'Unsafe source URL; skipped'}
    try:
        request = urllib.request.Request(url, headers={'User-Agent': 'LakefrontTrailAtlas/1.0 (source-link check)'}, method='HEAD')
        with urllib.request.urlopen(request, timeout=12) as response:
            return {'id': place['id'], 'status': response.status, 'url': response.url}
    except Exception as error:
        return {'id': place['id'], 'error': str(error), 'url': url}

with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:
    results = list(pool.map(check, places))
out = root / '.cache/reports/source-links.json'
out.parent.mkdir(parents=True, exist_ok=True)
out.write_text(json.dumps(results, indent=2) + '\n')
print(f'{sum("status" in result for result in results)}/{len(results)} source links responded successfully. Details: .cache/reports/source-links.json')
