"""Build assets/male/male.json: Malé and its neighbours in the RoseWare HQ frame.
RoseWare HQ (Ma. Nooru Villa, Buruzu Magu, Malé 20168; ~4.17203 N, 73.51014 E) sits at the north-west corner of
Buruzu Magu and the east-west street, facing the street. Frame: origin = building centre, three.js x = east (along the street),
z = south. OSM buildings are kept (heights where tagged); empty land is filled with block buildings on a street-aligned grid.
Map data (c) OpenStreetMap contributors, ODbL."""
import json, math, random, sys, os
import numpy as np
from PIL import Image, ImageDraw
random.seed(7)
SRC = sys.argv[1] if len(sys.argv) > 1 else 'data/osm2.json'
OUT = sys.argv[2] if len(sys.argv) > 2 else 'assets/male/male.json'
R = json.load(open(SRC))['regions']['male']

# --- the frame: intersection of the E-W street (174.1 deg) and Buruzu Magu (84.1 deg) near the office
def inter(p, a1, q, a2):
    d1 = (math.cos(math.radians(a1)), math.sin(math.radians(a1))); d2 = (math.cos(math.radians(a2)), math.sin(math.radians(a2)))
    den = d1[0] * d2[1] - d1[1] * d2[0]; t = ((q[0] - p[0]) * d2[1] - (q[1] - p[1]) * d2[0]) / den
    return (p[0] + d1[0] * t, p[1] + d1[1] * t)
IX = inter((2513, -3754), 174.1, (2523, -3757), 84.1)
TH = math.radians(5.9)
BC = (-19.5, 15.5)   # building centre in the street frame (u east, v north)
def T(x, y):
    dx, dy = x - IX[0], y - IX[1]
    u = math.cos(TH) * dx - math.sin(TH) * dy; v = math.sin(TH) * dx + math.cos(TH) * dy
    return (u - BC[0], -(v - BC[1]))     # three x, three z
def ring(flat, k=0):
    return [T(flat[i], flat[i + 1]) for i in range(k, len(flat) - 1, 2)]
q = lambda P: [round(c, 1) for p in P for c in p]

isl = [ring(I) for I in R['isl']]
def area(P): return 0.5 * sum(P[i][0] * P[(i + 1) % len(P)][1] - P[(i + 1) % len(P)][0] * P[i][1] for i in range(len(P)))
def bbox(P): xs = [p[0] for p in P]; zs = [p[1] for p in P]; return min(xs), max(xs), min(zs), max(zs)
info = [(k, abs(area(P)), bbox(P)) for k, P in enumerate(isl)]
male_k = min(info, key=lambda a: abs(a[2][0]) + abs(a[2][2]) if a[2][0] < 0 < a[2][1] and a[2][2] < 0 < a[2][3] else 1e9)[0]
print('Malé island index', male_k, 'bbox', [round(x) for x in info[male_k][2]])

roads = [[r[0]] + ring(r, 1) for r in R['rd']]
greens = [ring(g) for g in R['green']]
aero = [[r[0], r[1]] + ring(r, 2) for r in R['rw']]
osmb = []
for b in R['bd']:
    P = ring(b, 3); h, kind, mh = b[0], b[1], b[2]
    if len(P) < 3: continue
    osmb.append([h, kind, mh, P])

# --- raster fill per inhabited island
RES = 2.0
fills = []
def zone_params(k, bb):
    w = bb[1] - bb[0]; d = bb[3] - bb[2]; a = w * d
    return a
big = sorted(info, key=lambda a: -a[1])
hulhu = big[0][0]                                   # Hulhulé + Hulhumalé (largest)
vill = min((a for a in info if 150000 < a[1] < 1000000), key=lambda a: abs(a[2][0] + 1500))[0]   # Villingili, west of Malé
inhabited = [male_k, vill, hulhu]                   # Thilafushi / Gulhifalhu stay industrial and open
print('fill islands', [(k, round(info[k][1])) for k in inhabited])
def road_w(c): return {0: 13., 1: 7.5}.get(c, 4.)
for k in inhabited:
    P = isl[k]; x0, x1, z0, z1 = bbox(P); W = int((x1 - x0) / RES) + 2; H = int((z1 - z0) / RES) + 2
    S = lambda p: ((p[0] - x0) / RES, (p[1] - z0) / RES)
    land = Image.new('L', (W, H), 0); dl = ImageDraw.Draw(land); dl.polygon([S(p) for p in P], fill=255)
    block = Image.new('L', (W, H), 0); db = ImageDraw.Draw(block)
    for r in roads:
        pts = [S(p) for p in r[1:]]
        if len(pts) > 1 and any(0 <= a < W and 0 <= b < H for a, b in pts): db.line(pts, fill=255, width=max(1, int(road_w(r[0]) / RES)))
    for g in greens:
        if len(g) > 2: db.polygon([S(p) for p in g], fill=255)
    for a in aero:
        pts = [S(p) for p in a[2:]]
        if len(pts) > 1: db.line(pts, fill=255, width=int(max(a[1], 30) * 1.6 / RES)); db.polygon(pts, fill=255) if a[0] in ('apron', 'terminal') and len(pts) > 2 else None
    for h, kind, mh, Q in osmb:
        db.polygon([S(p) for p in Q], fill=255)
    if k == male_k:   # keep the RoseWare plot clear
        db.rectangle([S((-16, -12)), S((16, 12))], fill=255)
    L = np.array(land) > 0; Bk = np.array(block) > 0
    # shoreline setback ~6 m
    from scipy.ndimage import binary_erosion
    L = binary_erosion(L, iterations=3)
    free = L & ~Bk
    # local street orientation: Malé is aligned with the frame; elsewhere use dominant road angle on that island
    ang = 0.0
    if k != male_k:
        hist = {}
        for r in roads:
            pts = r[1:]
            for i in range(len(pts) - 1):
                (ax, az), (bx, bz) = pts[i], pts[i + 1]
                if not (x0 <= ax <= x1 and z0 <= az <= z1): continue
                Lg = math.hypot(bx - ax, bz - az); a = math.degrees(math.atan2(bz - az, bx - ax)) % 90
                hist[round(a / 3) * 3] = hist.get(round(a / 3) * 3, 0) + Lg
        if hist: ang = max(hist, key=hist.get)
    ca, sa = math.cos(math.radians(ang)), math.sin(math.radians(ang))
    cx, cz = (x0 + x1) / 2, (z0 + z1) / 2; span = max(x1 - x0, z1 - z0) * .75
    tall = 1.0 if k == male_k else (1.25 if info[k][1] > 2e6 else .45)
    cell = 11.0 if k == male_k else (12.0 if k == vill else 19.0)
    n = 0; u = -span
    while u < span:
        cw = cell * random.uniform(.8, 1.25); v = -span
        while v < span:
            cd = cell * random.uniform(.8, 1.3)
            mx = cx + ca * (u + cw / 2) - sa * (v + cd / 2); mz = cz + sa * (u + cw / 2) + ca * (v + cd / 2)
            ok = True; hits = 0; tot = 0
            for fu in (.1, .5, .9):
                for fv in (.1, .5, .9):
                    px = cx + ca * (u + cw * fu) - sa * (v + cd * fv); pz = cz + sa * (u + cw * fu) + ca * (v + cd * fv)
                    ix = int((px - x0) / RES); iz = int((pz - z0) / RES); tot += 1
                    if 0 <= ix < W and 0 <= iz < H and free[iz, ix]: hits += 1
            if hits >= 8:
                r = random.random()
                fl = (3 + int(r * r * 4) + (random.random() < .55) * random.randint(2, 6)) if k == male_k else int(3 + random.random() ** 1.6 * 14 * tall)
                h = round(fl * 3.1 + random.uniform(0, 1.2), 1)
                dd = math.hypot(mx, mz)
                if dd < 130: h = round(min(h, 9 + dd * .12 + random.uniform(0, 4)), 1)   # keep the RoseWare block readable from the street and the air
                fills.append([round(mx, 1), round(mz, 1), round(cw - 1.2, 1), round(cd - 1.2, 1), h, round(ang, 1)]); n += 1
            v += cd
        u += cw
    print('island', k, 'filled', n, 'angle', ang)

# OSM heights: unknown -> plausible for Malé
bd = []
for h, kind, mh, P in osmb:
    if all(abs(p[0]) < 16 and abs(p[1]) < 12 for p in P): continue
    c = (sum(p[0] for p in P) / len(P), sum(p[1] for p in P) / len(P))
    if abs(c[0]) < 16 and abs(c[1]) < 12: continue
    if not h: h = round(random.choice([9, 12, 15, 18, 21, 24, 27, 30, 33]) + random.uniform(0, 2), 1)
    dd = math.hypot(*c)
    if dd < 130: h = min(h, 9 + dd * .12 + random.uniform(0, 4))
    bd.append([round(h, 1), round(mh, 1)] + q(P))

# Sinamalé bridge deck (centre line + width) from the bridge outline
bridges = []
for B in R.get('brA', []):
    P = ring(B['p'])
    A = np.array(P); c = A.mean(0); U, S_, Vt = np.linalg.svd(A - c); ax = Vt[0]; pr = (A - c) @ ax; pw = (A - c) @ Vt[1]
    L0, L1 = pr.min(), pr.max(); wid = float(np.percentile(np.abs(pw), 60) * 2)
    bridges.append({'n': B['n'], 'a': q([tuple(c + ax * L0)]), 'b': q([tuple(c + ax * L1)]), 'w': round(max(wid, 14), 1)})

out = {'attribution': 'Map data (c) OpenStreetMap contributors, ODbL', 'frame': {'lonlat': [73.51014, 4.17203], 'rot_deg': 5.9},
       'male': male_k, 'isl': [q(P) for P in isl], 'rd': [[r[0]] + q(r[1:]) for r in roads], 'green': [q(g) for g in greens if len(g) > 2],
       'aero': [[a[0], a[1]] + q(a[2:]) for a in aero], 'bd': bd, 'fill': fills, 'bridge': bridges}
os.makedirs(os.path.dirname(OUT), exist_ok=True)
s = json.dumps(out, separators=(',', ':')); open(OUT, 'w').write(s)
print('osm buildings', len(bd), 'fill', len(fills), 'bytes', len(s))
