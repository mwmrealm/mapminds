#!/usr/bin/env python3
"""Checks data/places.json (run from the site folder:  python .github/validate.py). Exit code 1 on errors."""
import json, os, sys
CATS = {'gate', 'library', 'food', 'parking', 'bus', 'sports', 'photo', 'medical', 'building'}
BBOX = (34.70, 34.95, 113.40, 113.70)          # generous box around the campus: warn only
path = next((p for p in ('data/places.json', 'web/data/places.json') if os.path.exists(p)), None)
if not path: print('no places.json — nothing to check'); sys.exit(0)
root = os.path.dirname(os.path.dirname(path)); err, warn = [], []
try: places = json.load(open(path, encoding='utf-8'))['places']
except Exception as e: print('places.json is not valid JSON:', e); sys.exit(1)
seen = set()
for p in places:
    i = p.get('id', '?')
    if i in seen: err.append(f'duplicate id {i}')
    seen.add(i)
    if not (p.get('zh') or p.get('en')): err.append(f'{i}: no name')
    if p.get('cat') not in CATS: err.append(f"{i}: bad category {p.get('cat')}")
    try:
        la, lo = float(p['lat']), float(p['lon'])
        if not (-90 <= la <= 90 and -180 <= lo <= 180): err.append(f'{i}: coordinates out of range')
        elif not (BBOX[0] <= la <= BBOX[1] and BBOX[2] <= lo <= BBOX[3]): warn.append(f'{i}: far from campus ({la}, {lo})')
    except Exception: err.append(f'{i}: missing lat/lon')
    for ph in p.get('photos', []):
        if not ph.startswith('http') and not os.path.exists(os.path.join(root, ph)): err.append(f'{i}: photo file missing {ph}')
for w in warn: print('WARN', w)
for e in err: print('ERROR', e)
print(f'{len(places)} places checked: {len(err)} errors, {len(warn)} warnings'); sys.exit(1 if err else 0)
