#!/usr/bin/env python3
"""Rebuild the atlas trail linework from complete cached OSM route relations.

The relation, rather than a way-name search, includes the Navy Pier Flyover,
unnamed shared sections, and the correct separate walking/bicycle routes.
No network request, inferred gap, or straight-line repair is used.
"""
import json
import math
import argparse
import xml.etree.ElementTree as ET
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
FILES = sorted((ROOT / 'data/raw').glob('*.xml'))
RELATIONS = {'bike': '8676789', 'walk': '17527976'}
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--reviewed-on', required=True, help='Actual geographic review date, YYYY-MM-DD')
args = parser.parse_args()
from datetime import date
date.fromisoformat(args.reviewed_on)


def tags(element):
    return {t.attrib['k']: t.attrib['v'] for t in element.findall('tag')}


relations = {}
for filename in FILES:
    tree = ET.parse(filename).getroot()
    for relation in tree.findall('relation'):
        if relation.attrib['id'] in RELATIONS.values():
            relations[relation.attrib['id']] = {
                'tags': tags(relation),
                'members': [dict(m.attrib) for m in relation.findall('member') if m.attrib['type'] == 'way']
            }
    if len(relations) == len(RELATIONS):
        break
assert len(relations) == len(RELATIONS), 'Missing cached trail route relation'
required = {m['ref'] for r in relations.values() for m in r['members']}
ways, nodes = {}, {}
for filename in FILES:
    tree = ET.parse(filename).getroot()
    for node in tree.findall('node'):
        nodes[node.attrib['id']] = [float(node.attrib['lon']), float(node.attrib['lat'])]
    for way in tree.findall('way'):
        if way.attrib['id'] in required:
            ways[way.attrib['id']] = {
                'nodeIds': [n.attrib['ref'] for n in way.findall('nd')],
                'tags': tags(way)
            }
assert required <= ways.keys(), f'Missing route ways: {required - ways.keys()}'
features = []
for wid, way in ways.items():
    assert all(n in nodes for n in way['nodeIds']), f'Missing nodes in {wid}'
    modes = [mode for mode, rid in RELATIONS.items() if any(m['ref'] == wid for m in relations[rid]['members'])]
    features.append({
        'id': wid, 'name': way['tags'].get('name', 'Lakefront Trail'),
        'modes': modes, 'mode': 'shared' if len(modes) > 1 else modes[0],
        'points': [nodes[n] for n in way['nodeIds']], 'nodeIds': way['nodeIds'],
        'tags': way['tags'], 'sourceUrl': f'https://www.openstreetmap.org/way/{wid}'
    })
features.sort(key=lambda f: int(f['id']))
result = {
    'reviewedAt': args.reviewed_on,
    'sourceUrls': ['https://www.chicagoparkdistrict.com/lakefront-trail',
                   'https://www.epa.gov/lindsay-light/navy-pier-flyover'] +
                  [f'https://www.openstreetmap.org/relation/{rid}' for rid in RELATIONS.values()],
    'method': 'Exact member-way and node geometry from cached OSM bicycle and walking route relations. No invented links or name-based mode classification.',
    'routes': {mode: {'relationId': rid, 'sourceUrl': f'https://www.openstreetmap.org/relation/{rid}', **relations[rid]} for mode, rid in RELATIONS.items()},
    'features': features
}
(ROOT / 'data/geography/trail-routes.json').write_text(json.dumps(result, separators=(',', ':')) + '\n')
print(f'Extracted {len(features)} exact route ways: ' + ', '.join(f'{mode} {len(r["members"])} members' for mode, r in result['routes'].items()))
