"""Acquire only exact, visually reviewed Commons files.

Edit data/photos/reviewed-photos.json after inspecting the subject and its license.
Search results are never automatically promoted to published photographs.
Run with --refresh to re-download already installed files.
"""
import argparse
import html
import json
import pathlib
import re
import subprocess
import tempfile
import time
import urllib.parse
import urllib.request

ROOT = pathlib.Path(__file__).resolve().parents[2]
OUT = ROOT / 'public/assets/photos'
OUT.mkdir(parents=True, exist_ok=True)
MANIFEST = json.loads((ROOT / 'data/photos/reviewed-photos.json').read_text())
PHOTO_FILE = ROOT / 'data/photos/photos.json'
photos = json.loads(PHOTO_FILE.read_text()) if PHOTO_FILE.exists() else {}
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--refresh', action='store_true')
args = parser.parse_args()


def get(url):
    parsed = urllib.parse.urlparse(url)
    if (parsed.scheme != 'https' or parsed.username or parsed.password
            or not (parsed.hostname == 'commons.wikimedia.org'
                    or parsed.hostname in ('upload.wikimedia.org', 'thumb.wikimedia.org'))):
        raise ValueError('Photo acquisition requires an HTTPS Wikimedia source')
    request = urllib.request.Request(url, headers={
        'User-Agent': 'LakefrontAtlas/1.0 (reviewed photograph acquisition; attribution included)'
    })
    with urllib.request.urlopen(request, timeout=45) as response:
        data = response.read(25 * 1024 * 1024 + 1)
        if len(data) > 25 * 1024 * 1024:
            raise ValueError('Photo source exceeds 25 MiB')
        return data


for place_id, reviewed in MANIFEST.items():
    if not re.fullmatch(r'[a-z0-9]+(?:-[a-z0-9]+)*', place_id):
        raise ValueError('Invalid place identifier in reviewed photo manifest')
    existing = photos.get(place_id)
    if existing and not re.fullmatch(r'/assets/photos/[a-z0-9-]+\.(webp|jpg|png)', existing['src']):
        raise ValueError(f'{place_id}: invalid output path')
    dest = ROOT / 'public' / existing['src'].lstrip('/') if existing else OUT / f'{place_id}.webp'
    if (not args.refresh and dest.exists() and existing
            and existing['title'] == reviewed['title']):
        existing['alt'] = reviewed['alt']
        continue
    if reviewed.get('sourceType', 'commons') != 'commons':
        raise RuntimeError(f'{place_id} uses an individually reviewed non-Commons source; re-review its original photo and license before refreshing.')
    query = urllib.parse.urlencode({
        'action': 'query', 'titles': reviewed['title'], 'prop': 'imageinfo',
        'iiprop': 'url|extmetadata', 'iiurlwidth': 960, 'format': 'json'
    })
    result = json.loads(get('https://commons.wikimedia.org/w/api.php?' + query))
    page = next(iter(result['query']['pages'].values()))
    if page['title'] != reviewed['title'] or not page.get('imageinfo'):
        raise RuntimeError(f'Exact reviewed source was not found: {reviewed["title"]}')
    info = page['imageinfo'][0]
    metadata = info['extmetadata']
    license_name = metadata['LicenseShortName']['value']
    if license_name != reviewed.get('license'):
        raise RuntimeError(f'{place_id}: source license changed; review before replacing the photo')
    license_url = metadata.get('LicenseUrl', {}).get('value')
    if reviewed.get('manualLicenseApproval') and reviewed.get('license') == license_name:
        license_url = reviewed['licenseUrl']
    elif not re.fullmatch(r'CC BY(?:-SA)? [1-4]\.0|CC BY-SA 2\.5|CC0', license_name) or not license_url:
        raise RuntimeError(f'License requires manual review for {place_id}: {license_name}')
    with tempfile.TemporaryDirectory(prefix='lakefront-photo-') as temporary:
        original = pathlib.Path(temporary) / 'source.image'
        original.write_bytes(get(info.get('thumburl', info['url'])))
        # Resize and format conversion only; do not generate or alter the subject.
        converted = pathlib.Path(temporary) / ('converted' + dest.suffix)
        subprocess.run(['convert', '-limit', 'memory', '256MiB', '-limit', 'map', '512MiB',
                        str(original), '-resize', '960x960>', '-quality', '84', str(converted)], check=True)
        dimensions = subprocess.check_output(['identify', '-format', '%w %h', str(converted)], text=True)
        width, height = map(int, dimensions.split())
        dest.write_bytes(converted.read_bytes())
    photos[place_id] = {
        **(existing or {}),
        'src': '/assets/photos/' + dest.name,
        'alt': reviewed['alt'],
        'title': page['title'],
        'author': html.unescape(re.sub('<[^>]+>', '', metadata['Artist']['value'])),
        'license': license_name,
        'licenseUrl': license_url.replace('http://', 'https://'),
        'sourceUrl': info['descriptionurl'],
        'width': width,
        'height': height,
        'fit': 'contain',
    }
    # Save successful files individually so a rate limit does not discard work.
    PHOTO_FILE.write_text(json.dumps(photos, ensure_ascii=False, indent=2) + '\n')
    print(f'{place_id}: {page["title"]} ({license_name})', flush=True)
    time.sleep(1)

photos = {place_id: photos[place_id] for place_id in MANIFEST}
PHOTO_FILE.write_text(json.dumps(photos, ensure_ascii=False, indent=2) + '\n')
print(f'{len(photos)} exact reviewed photographs installed.')
