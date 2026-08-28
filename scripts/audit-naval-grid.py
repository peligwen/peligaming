#!/usr/bin/env python3
# Audit — and with --repair, mend — the Naval Pathfinder's navigation grid
# (public/tools/runescape/data/naval/navcells.png + naval.json).
#
# Deps: pip install pillow numpy
#
# Audit checks (always run):
#   1. class histogram vs the naval.json legend
#   2. connectivity of passable water under the app's movement model
#      (8-neighbour; "wall" hazard seas are blockers, unlike the generator's
#      old prune which let them act as connectors)
#   3. every port snaps into the main sea (the app snaps within 16 cells)
#   4. wreck fields, services, charting tasks and shoals snap somewhere sane
#   5. isolated water pockets that a map click could snap into but never leave
#
# Repairs (--repair):
#   A. Reclassify seas the colour classifier missed as land, by growing the
#      main sea outward over land cells whose map.jpg colour matches nearby
#      classified water (nearest-reference, per box). Growth starts from the
#      main component only and never crosses wall seas, so it cannot open a
#      passage the game doesn't have.
#   B. Absorb landlocked water pockets into the wall sea that seals them off
#      (or land when none does), so no snap can strand a route.
#   C. Charting tasks with cave-plane coordinates (OSRS caves live at y+6400)
#      are moved to their overworld position.
#
# Run from the repo root:  python3 scripts/audit-naval-grid.py [--repair]

import json, sys
import numpy as np
from PIL import Image
from collections import deque, Counter

ROOT = 'public/tools/runescape/data/naval'
REPAIR = '--repair' in sys.argv

nav = json.load(open(f'{ROOT}/naval.json'))
CW, CH = nav['grid']['w'], nav['grid']['h']
CELL = nav['cell']; W0 = nav['world']
CLASSES = nav['classes']; HAZ = nav['hazards']
WALL = [i for i, k in enumerate(CLASSES) if k in HAZ and HAZ[k]['mode'] == 'wall']
PASSABLE = [i for i, k in enumerate(CLASSES) if i and i not in WALL]

img = np.asarray(Image.open(f'{ROOT}/navcells.png').convert('RGBA'))
assert img.shape[:2] == (CH, CW)
cls = img[::-1, :, 0].astype(np.uint8).copy()   # row 0 = south, as in the app

# mean map colour per cell (map.jpg is 2 px/tile, so 8 px per 4-tile cell)
mp = np.asarray(Image.open(f'{ROOT}/map.jpg').convert('RGB'), dtype=np.float32)
cellcol = mp.reshape(CH, 8, CW, 8, 3).mean(axis=(1, 3))[::-1]

def components(mask):
    lab = np.zeros((CH, CW), np.int32); sizes = [0]; nid = 0
    for sy in range(CH):
        for sx in range(CW):
            if not mask[sy, sx] or lab[sy, sx]:
                continue
            nid += 1; lab[sy, sx] = nid; q = deque([(sx, sy)]); n = 0
            while q:
                x, y = q.popleft(); n += 1
                for dy in (-1, 0, 1):
                    yy = y + dy
                    if yy < 0 or yy >= CH: continue
                    for dx in (-1, 0, 1):
                        xx = x + dx
                        if 0 <= xx < CW and mask[yy, xx] and not lab[yy, xx]:
                            lab[yy, xx] = nid; q.append((xx, yy))
            sizes.append(n)
    return lab, sizes

def cellbox(x0, y0, x1, y1):
    return ((x0 - W0['x0']) // CELL, (y0 - W0['y0']) // CELL,
            (x1 - W0['x0']) // CELL, (y1 - W0['y0']) // CELL)

def tile_of(cx, cy):
    return W0['x0'] + cx * CELL, W0['y0'] + cy * CELL

# ---------------------------------------------------------------- repairs
if REPAIR:
    pass_mask = np.isin(cls, PASSABLE)
    lab, sizes = components(pass_mask)
    main = int(np.argmax(sizes))

    # Cells whose map colour is clearly terrain (green or brown dominating
    # blue). Dark shadowed land can read as murky water, and the upstream
    # classifier sometimes water-marks it; if such cells fed the grow's
    # references the grow could bridge real land (the Feldip strip north of
    # Corsair Cove was one such bridge). They are barred from references
    # and from being painted.
    _r, _g, _b = cellcol[..., 0], cellcol[..., 1], cellcol[..., 2]
    landish = (_g > _b + 18) | ((_r > _b + 25) & (_g > _b + 10))

    # A. grow the main sea over colour-matching land. Each box names the seas
    # the classifier dropped; references are the box's own classified water.
    GROW_BOXES = [
        # the southern kelp sea (Sunbleak, Rainbow's End, Isle of Serpents)
        ('southern kelp sea', 1400, 1984, 2600, 2620, 12),
        # the Backwater / Sea of Souls grey fetid waters (River Dougne mouth)
        ('backwater fetid sea', 2080, 2780, 2650, 3140, 12),
        # the Lum Lagoon (charting: sealed crate) — murkier, looser match
        ('lum lagoon', 3150, 3020, 3320, 3180, 22),
    ]
    for name, x0, y0, x1, y1, thr in GROW_BOXES:
        cx0, cy0, cx1, cy1 = cellbox(x0, y0, x1, y1)
        inbox = np.zeros((CH, CW), bool); inbox[cy0:cy1, cx0:cx1] = True
        refs = {}
        for ci in PASSABLE:
            cc = cellcol[(cls == ci) & inbox & ~landish]
            if len(cc) >= 30:
                refs[ci] = cc[np.random.default_rng(7).choice(len(cc), min(len(cc), 500), replace=False)]
        if not refs:
            print(f'grow {name}: no reference water in box, skipped'); continue

        def match(c):
            best, bd = 0, 1e9
            for ci, rr in refs.items():
                d = np.sqrt(((rr - c) ** 2).sum(1)).min()
                if d < bd: bd, best = d, ci
            return (best, bd)

        # frontier: main-sea cells in the box
        q = deque((x, y) for y, x in zip(*np.nonzero(inbox & (lab == main))))
        seen = np.zeros((CH, CW), bool)
        painted = Counter()
        while q:
            x, y = q.popleft()
            for dy in (-1, 0, 1):
                yy = y + dy
                if yy < cy0 or yy >= cy1: continue
                for dx in (-1, 0, 1):
                    xx = x + dx
                    if xx < cx0 or xx >= cx1 or seen[yy, xx]: continue
                    seen[yy, xx] = True
                    if cls[yy, xx] != 0 or landish[yy, xx]: continue
                    ci, d = match(cellcol[yy, xx])
                    if d <= thr:
                        cls[yy, xx] = ci
                        painted[ci] += 1
                        q.append((xx, yy))
        print(f'grow {name}: painted ' + (', '.join(
            f'{n} {CLASSES[ci]}' for ci, n in painted.most_common()) or 'nothing'))

    # B. absorb landlocked pockets into the wall sea that seals them
    def absorb_pockets():
        lab, sizes = components(np.isin(cls, PASSABLE))
        main = int(np.argmax(sizes))
        absorbed = Counter()
        for pid, sz in enumerate(sizes):
            if not pid or pid == main: continue
            ys, xs = np.nonzero(lab == pid)
            walls = Counter()
            for x, y in zip(xs, ys):
                for dy in (-1, 0, 1):
                    for dx in (-1, 0, 1):
                        yy, xx = y + dy, x + dx
                        if 0 <= yy < CH and 0 <= xx < CW and cls[yy, xx] in WALL:
                            walls[cls[yy, xx]] += 1
            into = walls.most_common(1)[0][0] if walls else 0
            cls[ys, xs] = into
            absorbed[into] += sz
        print('absorb pockets: ' + (', '.join(
            f'{n} cells -> {CLASSES[ci]}' for ci, n in absorbed.most_common()) or 'none found'))
        return lab, main

    absorb_pockets()

    # B2. de-water: terrain the classifier water-marked. The upstream build
    # reads dark shadowed land (the Gu'Tanoth scorch, shoreline cliff shadow)
    # as murky open water, and where such a strip touches the coast it joins
    # the sea and routes sail overland. Every passable cell whose map colour
    # is terrain goes back to land, and whatever that strands is absorbed.
    # (The port/target snap audit below is the guard on this heuristic: no
    # port moved and only one charting snap grew, 1.0 -> 4.0 cells, when it
    # was introduced.)
    bad = landish & np.isin(cls, PASSABLE)
    if bad.any():
        print(f'de-water: {int(bad.sum())} land-coloured cells were marked sailable')
        cls[bad] = 0
        absorb_pockets()

    # C. cave-plane charting coordinates back to the overworld
    moved = 0
    for t in nav.get('charting', []):
        if t.get('y') is not None and t['y'] > W0['y1'] and W0['y0'] <= t['y'] - 6400 <= W0['y1']:
            t['y'] -= 6400; moved += 1
            print(f'charting task moved to overworld: ({t["x"]},{t["y"]}) {t["task"][:60]}')
    if moved:
        json.dump(nav, open(f'{ROOT}/naval.json', 'w'), separators=(',', ':'))

    out = np.zeros((CH, CW, 4), np.uint8)
    out[:, :, 0] = cls[::-1]; out[:, :, 3] = 255
    Image.fromarray(out).save(f'{ROOT}/navcells.png')
    print('wrote navcells.png\n')

# ---------------------------------------------------------------- audit
print('=== class histogram ===')
histo = np.bincount(cls.ravel(), minlength=256)
for i, k in enumerate(CLASSES):
    print(f'  {i:2d} {k:10s} {histo[i]:7d}')
extra = [(v, int(histo[v])) for v in range(len(CLASSES), 256) if histo[v]]
print(f'  out-of-legend: {extra or "none"}')

pass_mask = np.isin(cls, PASSABLE)
lab, sizes = components(pass_mask)
main = int(np.argmax(sizes))
pockets = [(s, i) for i, s in enumerate(sizes) if i and i != main]
print(f'\n=== connectivity ===\n  main sea: {sizes[main]} cells; '
      f'isolated pockets: {len(pockets)} ({sum(s for s, _ in pockets)} cells)')
for s, i in sorted(pockets, reverse=True)[:10]:
    ys, xs = np.nonzero(lab == i)
    print(f'    {s} cells near tile {tile_of(int(xs.mean()), int(ys.mean()))}')

def snap(x, y, R=16):
    cx, cy = (int(x) - W0['x0']) // CELL, (int(y) - W0['y0']) // CELL
    best, bd = None, 1e18
    for dy in range(-R, R + 1):
        yy = cy + dy
        if yy < 0 or yy >= CH: continue
        for dx in range(-R, R + 1):
            xx = cx + dx
            if 0 <= xx < CW and pass_mask[yy, xx]:
                d = dx * dx + dy * dy
                if d < bd: bd, best = d, (xx, yy)
    return best, (bd ** 0.5 if best else None)

print(f'\n=== ports ({len(nav["ports"])}) ===')
bad = 0
for p in nav['ports']:
    got, dist = snap(p['x'], p['y'])
    if not got or lab[got[1], got[0]] != main or dist > 6:
        bad += 1
        why = 'UNSNAPPABLE' if not got else ('LANDLOCKED' if lab[got[1], got[0]] != main else f'snaps {dist:.1f} cells away')
        print(f'  {p["name"]}: {why}')
print(f'  {len(nav["ports"]) - bad} ok' + (', all in the main sea' if not bad else ''))

def centroid_fields(groups, thresh=90):
    out = []
    for g in groups:
        pts = g['points']
        parent = list(range(len(pts)))
        def find(i):
            while parent[i] != i: parent[i] = parent[parent[i]]; i = parent[i]
            return i
        for a in range(len(pts)):
            for b in range(a + 1, len(pts)):
                if ((pts[a]['x'] - pts[b]['x']) ** 2 + (pts[a]['y'] - pts[b]['y']) ** 2) ** .5 < thresh:
                    parent[find(a)] = find(b)
        fields = {}
        for i in range(len(pts)): fields.setdefault(find(i), []).append(pts[i])
        for f in fields.values():
            out.append((f'{g["type"]} wrecks x{len(f)}',
                        sum(p['x'] for p in f) / len(f), sum(p['y'] for p in f) / len(f)))
    return out

print('\n=== other targets ===')
targets = centroid_fields(nav.get('wrecks', []))
targets += [(s['name'], s['x'], s['y']) for s in nav.get('services', [])]
targets += [(f'chart: {t["task"][:45]}', t['x'], t['y']) for t in nav.get('charting', []) if t.get('x') is not None]
targets += [(s['name'], pt['x'], pt['y']) for s in nav.get('shoals', []) for pt in s['points']]
bad = 0
for name, x, y in targets:
    got, dist = snap(x, y)
    if not got or lab[got[1], got[0]] != main:
        bad += 1
        print(f'  {name} ({x:.0f},{y:.0f}): ' + ('UNSNAPPABLE' if not got else 'LANDLOCKED'))
print(f'  {len(targets) - bad}/{len(targets)} snap into the main sea')
