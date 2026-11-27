"""Export source geometry for the illustrated atlas, without invented land cover.

Run with --cached-only to rebuild from saved OSM extracts, or --expand-city to
also retrieve bounded strips extending 0.032 degrees west of the shoreline.
"""
import argparse
import concurrent.futures
import datetime
import json
import pathlib
import urllib.request
import xml.etree.ElementTree as E

root = pathlib.Path(__file__).resolve().parents[2]
cache = root / 'data/raw'
anchors = [(41.995,-87.654),(41.979,-87.649),(41.966,-87.635),(41.945,-87.637),(41.928,-87.630),(41.914,-87.625),(41.903,-87.621),(41.892,-87.609),(41.878,-87.614),(41.866,-87.605),(41.852,-87.609),(41.838,-87.603),(41.823,-87.595),(41.807,-87.583),(41.795,-87.577),(41.780,-87.574),(41.764,-87.562)]

def lonat(lat):
    if lat >= anchors[0][0]:
        return anchors[0][1]
    if lat <= anchors[-1][0]:
        return anchors[-1][1]
    for (a,b),(c,d) in zip(anchors,anchors[1:]):
        if c <= lat <= a:
            return b + (d-b) * (a-lat) / (a-c)


def fetch(box, key, depth=0):
    p = cache / (str(key) + '.xml')
    if p.exists() and p.stat().st_size > 200:
        data = p.read_bytes()
        bounds = E.fromstring(data).find('bounds')
        expected = ['minlon','minlat','maxlon','maxlat']
        if bounds is not None and all(abs(float(bounds.attrib[k])-v) < .000011 for k,v in zip(expected,box)):
            return True
    url = 'https://api.openstreetmap.org/api/0.6/map?bbox=' + ','.join(f'{n:.5f}' for n in box)
    try:
        req = urllib.request.Request(url, headers={'User-Agent':'LakefrontTrailAtlas/1.1 (illustrated geographic guide; OSM geometry)'})
        data = urllib.request.urlopen(req, timeout=60).read()
        E.fromstring(data)
        p.write_bytes(data)
        print(key, len(data), flush=True)
        return True
    except Exception as error:
        if depth < 2:
            a,b,c,d = box
            mid = (b+d)/2
            left = fetch((a,b,c,mid), str(key)+'a', depth+1)
            right = fetch((a,mid,c,d), str(key)+'b', depth+1)
            return left and right
        print('FAIL', key, str(error), flush=True)
        return False


def tags(element):
    return {e.attrib['k']:e.attrib['v'] for e in element.findall('tag')}


def numeric(value):
    if not value:
        return None
    try:
        return float(value.replace(' m','').strip())
    except ValueError:
        return None


def in_bounds(point):
    x,y = point
    return 41.755 < y < 42.002 and lonat(y)-.037 < x < lonat(y)+.02


def green_kind(t):
    if t.get('natural')=='wood' or t.get('landuse')=='forest':
        return 'wood'
    if t.get('natural') in ['scrub','wetland']:
        return t['natural']
    if t.get('landuse') in ['grass','meadow','recreation_ground','flowerbed'] or t.get('natural')=='grassland':
        return 'garden' if t.get('landuse')=='flowerbed' else 'grass'
    return t.get('leisure','park')


def relation_category(t):
    if t.get('type')!='multipolygon':
        return None
    if t.get('natural')=='water' or t.get('waterway')=='riverbank':
        return 'water'
    if t.get('natural')=='beach':
        return 'beaches'
    if t.get('landuse')=='construction':
        return 'construction'
    if t.get('leisure') in ['park','garden','nature_reserve','golf_course'] or t.get('landuse') in ['grass','forest','meadow','recreation_ground','flowerbed'] or t.get('natural') in ['wood','scrub','grassland','wetland']:
        return 'parks'
    return None


def assemble_rings(paths):
    """Join OSM member ways by node ID, preserving actual closed geometry."""
    pending=[p[:] for p in paths if len(p)>1]
    rings=[]
    while pending:
        chain=pending.pop()
        changed=True
        while chain[0]!=chain[-1] and changed:
            changed=False
            for i,part in enumerate(pending):
                if chain[-1]==part[0]:chain+=part[1:]
                elif chain[-1]==part[-1]:chain+=part[-2::-1]
                elif chain[0]==part[-1]:chain=part[:-1]+chain
                elif chain[0]==part[0]:chain=part[:0:-1]+chain
                else:continue
                pending.pop(i);changed=True;break
        rings.append(chain)
    return rings


def build(complete_water=False):
    nodes, node_tags, ways, relations, shoreids = {}, {}, {}, {}, set()
    def ingest(r):
        for n in r.findall('node'):
            nid = n.attrib['id']
            nodes[nid] = [float(n.attrib['lon']), float(n.attrib['lat'])]
            t = tags(n)
            if t.get('natural') == 'tree':
                node_tags[nid] = t
        for w in r.findall('way'):
            ways[w.attrib['id']] = w
        for rel in r.findall('relation'):
            if rel.attrib['id'] == '1205149':
                shoreids.update(m.attrib['ref'] for m in rel.findall('member') if m.attrib['type']=='way' and m.attrib.get('role')=='outer')
            t=tags(rel)
            if relation_category(t):
                relations[rel.attrib['id']]=rel
    for p in sorted(cache.glob('*.xml')):
        try:
            ingest(E.parse(p).getroot())
        except E.ParseError:
            continue
    if complete_water:
        # The regional Lake Michigan relation spans the entire lake; its local
        # shoreline already provides the base. Only complete smaller waters.
        missing=[rid for rid,rel in relations.items() if rid!='1205149' and relation_category(tags(rel)) in ['water','beaches'] and any(m.attrib['type']=='way' and m.attrib['ref'] not in ways for m in rel.findall('member'))]
        for rid in missing:
            url=f'https://api.openstreetmap.org/api/0.6/relation/{rid}/full'
            req=urllib.request.Request(url,headers={'User-Agent':'LakefrontTrailAtlas/1.1 (water geometry completion)'})
            data=urllib.request.urlopen(req,timeout=60).read()
            r=E.fromstring(data)
            (cache/f'water-relation-{rid}.xml').write_bytes(data)
            ingest(r)
            print('Completed water relation',rid,len(data),flush=True)
    out = {key:[] for key in ['shorePaths','trails','roads','parks','beaches','water','buildings','piers','sports','paved','trees','railways','construction']}
    out.update(sourceUrls=['https://www.openstreetmap.org/copyright','https://www.chicagoparkdistrict.com/lakefront-trail'], retrieved=datetime.date.today().isoformat())
    keep = ['leisure','natural','landuse','highway','service','surface','building','building:levels','height','sport','amenity','parking','access','leaf_type','leaf_cycle','water','man_made']
    road_kinds = {'motorway','motorway_link','trunk','trunk_link','primary','primary_link','secondary','secondary_link','tertiary','tertiary_link','residential','unclassified','living_street','service'}
    for wid,w in ways.items():
        t = tags(w)
        coords = [nodes[n.attrib['ref']] for n in w.findall('nd') if n.attrib['ref'] in nodes]
        if len(coords)<2 or not any(in_bounds(p) for p in coords):
            continue
        feature = {'id':wid,'name':t.get('name',''),'points':[[round(x,6),round(y,6)] for x,y in coords]}
        selected = {k:t[k] for k in keep if k in t}
        if selected:
            feature['tags'] = selected
        if wid in shoreids:
            out['shorePaths'].append(feature)
        elif 'Lakefront Trail' in t.get('name','') and t.get('highway') in ['path','cycleway','footway']:
            feature['mode'] = 'walk' if t.get('bicycle')=='no' else 'bike'
            out['trails'].append(feature)
        elif t.get('highway') in road_kinds:
            feature['kind'] = t['highway']
            out['roads'].append(feature)
        elif t.get('natural')=='beach':
            out['beaches'].append(feature)
        elif t.get('natural')=='water':
            feature['kind'] = t.get('water','water')
            out['water'].append(feature)
        elif t.get('man_made') in ['pier','breakwater']:
            feature['kind'] = t['man_made']
            out['piers'].append(feature)
        elif t.get('landuse')=='construction':
            feature['kind']='construction'
            out['construction'].append(feature)
        elif t.get('building') and t['building'] != 'no':
            feature['kind'] = t['building']
            for source,key in [('building:levels','levels'),('height','height')]:
                value = numeric(t.get(source))
                if value is not None:
                    feature[key] = value
            out['buildings'].append(feature)
        elif t.get('leisure') in ['pitch','track','playground','stadium','swimming_pool','sports_centre','dog_park']:
            feature['kind'] = t['leisure']
            feature['sport'] = t.get('sport','')
            feature['surface'] = t.get('surface','')
            out['sports'].append(feature)
        elif t.get('amenity')=='parking' or (t.get('highway')=='pedestrian' and t.get('area')=='yes') or t.get('place')=='square':
            feature['kind'] = 'parking' if t.get('amenity')=='parking' else 'plaza'
            feature['surface'] = t.get('surface','')
            out['paved'].append(feature)
        elif t.get('leisure') in ['park','garden','nature_reserve','golf_course'] or t.get('landuse') in ['grass','forest','meadow','recreation_ground','flowerbed'] or t.get('natural') in ['wood','scrub','grassland','wetland']:
            feature['kind'] = green_kind(t)
            out['parks'].append(feature)
        elif t.get('railway') in ['rail','light_rail','tram','subway'] and t.get('tunnel')!='yes':
            feature['kind'] = t['railway']
            out['railways'].append(feature)
    # Area relations contain the surface area; their member
    # ways alone often have no area tags and must not be closed independently.
    emitted_members={k:set() for k in ['water','construction','beaches','parks']}
    relation_features={k:[] for k in emitted_members}
    incomplete_relations=0
    for rid,rel in relations.items():
        if rid=='1205149':
            continue
        t=tags(rel)
        category=relation_category(t)
        members=[m for m in rel.findall('member') if m.attrib['type']=='way' and m.attrib.get('role','outer') in ['outer','inner','']]
        if any(m.attrib['ref'] not in ways for m in members):
            incomplete_relations+=1
            continue
        ring_data=[]
        for role in ['outer','inner']:
            paths=[[n.attrib['ref'] for n in ways[m.attrib['ref']].findall('nd')] for m in members if (m.attrib.get('role') or 'outer')==role]
            for ring in assemble_rings(paths):
                if ring[0]!=ring[-1] or any(nid not in nodes for nid in ring):
                    ring_data=[]
                    break
                ring_data.append({'role':role,'points':[[round(v,6) for v in nodes[nid]] for nid in ring]})
            else:
                continue
            break
        outer=[r for r in ring_data if r['role']=='outer']
        if not outer or not any(in_bounds(point) for ring in outer for point in ring['points']):
            continue
        kind=green_kind(t) if category=='parks' else 'beach' if category=='beaches' else t.get('water','river' if t.get('waterway')=='riverbank' else category)
        f={'id':'relation:'+rid,'name':t.get('name',''),'kind':kind,'points':outer[0]['points'],'rings':ring_data,'tags':{k:t[k] for k in keep if k in t}}
        relation_features[category].append(f)
        emitted_members[category].update(m.attrib['ref'] for m in members)
    print('Assembled relations', {k:len(v) for k,v in relation_features.items()}, 'incomplete omitted',incomplete_relations,flush=True)
    for category in relation_features:
        out[category]=[f for f in out[category] if f['id'] not in emitted_members[category]]+relation_features[category]
    for nid,t in node_tags.items():
        p=nodes[nid]
        if in_bounds(p):
            f={'id':nid,'name':t.get('name',''),'kind':'tree','points':[[round(v,6) for v in p]]}
            for source,key in [('leaf_type','leafType'),('leaf_cycle','leafCycle')]:
                if source in t:
                    f[key]=t[source]
            out['trees'].append(f)
    paths=[f['points'][:] for f in out['shorePaths']]
    chains=[]
    while paths:
        c=paths.pop()
        changed=True
        while changed:
            changed=False
            for i,p in enumerate(paths):
                if c[-1]==p[0]:c+=p[1:]
                elif c[-1]==p[-1]:c+=p[-2::-1]
                elif c[0]==p[-1]:c=p[:-1]+c
                elif c[0]==p[0]:c=p[:0:-1]+c
                else:continue
                paths.pop(i);changed=True;break
        chains.append(c)
    out['shoreline']=max(chains,key=len)
    if out['shoreline'][0][1]<out['shoreline'][-1][1]:
        out['shoreline'].reverse()
    target=root/'data/geography/geography.json'
    temporary=target.with_suffix('.tmp')
    temporary.write_text(json.dumps(out,separators=(',',':')))
    temporary.replace(target)
    print({k:len(v) for k,v in out.items() if isinstance(v,list)},flush=True)


if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--cached-only',action='store_true')
    parser.add_argument('--expand-city',action='store_true')
    parser.add_argument('--complete-water',action='store_true',help='Complete smaller water and beach relations from OSM when members fall outside cached map bounds')
    args=parser.parse_args()
    cache.mkdir(exist_ok=True)
    if not args.cached_only:
        boxes=[]
        for i in range(24):
            lo=41.760+i*.01
            hi=lo+.011
            c=lonat((lo+hi)/2)
            boxes.append(((c-.014,lo,c+.012,hi),str(i)))
            if args.expand_city:
                boxes.append(((c-.032,lo,c-.013,hi),'city-'+str(i)))
        with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
            fetched=list(pool.map(lambda item:fetch(*item),boxes))
        if not all(fetched):
            raise SystemExit('Some source extracts could not be fetched; existing geography left intact.')
    build(complete_water=args.complete_water)
