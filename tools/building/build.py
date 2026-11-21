"""RoseWare HQ, modelled in Blender from code.
Blender axes: x east, y north, z up (glTF export converts to three.js: x, z->y, -y->z).
Usage:  python build.py --out DIR [--level NAME] [--bake SAMPLES] [--res PX] [--preview]
  --level ALL exports every level unbaked; --level <name> --bake N bakes that level's lightmap."""
import bpy, bmesh, math, sys, os, json, time
from mathutils import Vector, Matrix

A = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else sys.argv[1:]
def arg(k, d=None):
    return A[A.index(k) + 1] if k in A else d
OUT = arg('--out', '/tmp/bld'); LEVEL = arg('--level', 'ALL'); SAMPLES = int(arg('--bake', '0')); RES = int(arg('--res', '1536'))
os.makedirs(OUT, exist_ok=True)
bpy.ops.wm.read_factory_settings(use_empty=True)
scn = bpy.context.scene

# ---------------------------------------------------------------- materials
MATS = {}
def mat(name, col, rough=.6, metal=0., emit=None, estr=0., alpha=1., transm=0.):
    if name in MATS: return MATS[name]
    m = bpy.data.materials.new(name); m.use_nodes = True; b = m.node_tree.nodes['Principled BSDF']
    b.inputs['Base Color'].default_value = (*col, 1); b.inputs['Roughness'].default_value = rough; b.inputs['Metallic'].default_value = metal
    if emit: b.inputs['Emission Color'].default_value = (*emit, 1); b.inputs['Emission Strength'].default_value = estr
    if transm: b.inputs['Transmission Weight'].default_value = transm
    if alpha < 1: b.inputs['Alpha'].default_value = alpha
    MATS[name] = m; return m
def lin(h):
    h = h.lstrip('#'); c = [int(h[i:i + 2], 16) / 255 for i in (0, 2, 4)]
    return tuple(x / 12.92 if x <= .04045 else ((x + .055) / 1.055) ** 2.4 for x in c)
# names are read by the web app; colours drive bounce light in the bake
M = dict(
  concrete=mat('M_concrete', lin('a7a39d'), .85), concrete_dark=mat('M_concrete_dark', lin('5d5c5a'), .9), white=mat('M_white', lin('efece6'), .7),
  white_gloss=mat('M_white_gloss', lin('f4f2ee'), .25), timber=mat('M_timber', lin('a9744a'), .55), stone=mat('M_stone', lin('d8d2c8'), .35),
  floor_dark=mat('M_floor_dark', lin('3a3d42'), .5), floor_perf=mat('M_floor_perf', lin('6b6f75'), .5, .3), carpet=mat('M_carpet', lin('4a4c50'), .95),
  metal=mat('M_metal', lin('b9bcc0'), .35, 1.), metal_dark=mat('M_metal_dark', lin('2d3036'), .45, .8), rack=mat('M_rack', lin('15171b'), .5, .6),
  rack_front=mat('M_rack_front', lin('101216'), .45, .5, lin('6fa8ff'), .4), red=mat('M_red', lin('e2231a'), .45), red_gloss=mat('M_red_gloss', lin('e2231a'), .2),
  ups=mat('M_ups', lin('d9dcdf'), .45, .2), battery=mat('M_battery', lin('26282c'), .6), yellow=mat('M_yellow', lin('e5b31f'), .45), pipe=mat('M_pipe', lin('c9ccd0'), .4, .8),
  fabric=mat('M_fabric', lin('5b6470'), .9), fabric_red=mat('M_fabric_red', lin('b02a22'), .9), chair=mat('M_chair', lin('1d1f23'), .6), soil=mat('M_soil', lin('7a5a3c'), 1.),
  alu=mat('M_alu', lin('3b3f45'), .35, .9), panel=mat('M_panel', lin('f0eee9'), .5), plant=mat('M_plant', lin('3d6b3a'), .8), screen_back=mat('M_screen_back', lin('111215'), .4),
  # emissive (not baked; they light the bake)
  light=mat('M_light', (1, 1, 1), .5, 0, (1, .96, .9), 14.), light_cool=mat('M_light_cool', (1, 1, 1), .5, 0, (.85, .92, 1), 9.), led_blue=mat('M_led_blue', (0, 0, 0), .5, 0, (.25, .5, 1), 8.),
  led_red=mat('M_led_red', (0, 0, 0), .5, 0, (1, .1, .06), 10.), screen=mat('M_screen', (0, 0, 0), .3, 0, (.35, .55, 1), 3.), logo=mat('M_logo', (1, 1, 1), .4, 0, (1, .2, .15), 4.),
  glass=mat('M_glass', (.9, .95, 1), .02, 0, None, 0, 1, 1.), glass_frost=mat('M_glass_frost', (.95, .97, 1), .3, 0, None, 0, 1, .9),
)
EMISSIVE = {'M_light', 'M_light_cool', 'M_led_blue', 'M_led_red', 'M_screen', 'M_logo', 'M_rack_front'}
SEPARATE = EMISSIVE | {'M_glass', 'M_glass_frost'}

# ---------------------------------------------------------------- geometry accumulator per level
class Acc:
    def __init__(s, name): s.name = name; s.v = []; s.f = []; s.fm = []; s.mats = []; s.special = []
    def mi(s, m):
        if m not in s.mats: s.mats.append(m)
        return s.mats.index(m)
    def add_bm(s, bm, m):
        off = len(s.v); s.v += [tuple(v.co) for v in bm.verts]; idx = s.mi(m)
        for f in bm.faces: s.f.append(tuple(off + v.index for v in f.verts)); s.fm.append(idx)
LV = {}
def L(name):
    if name not in LV: LV[name] = Acc(name)
    return LV[name]
SPECIAL = []  # separate objects: (level, name, bm, material)

def _box_bm(sx, sy, sz, bevel=0.):
    bm = bmesh.new(); bmesh.ops.create_cube(bm, size=1.0); bmesh.ops.scale(bm, vec=(sx, sy, sz), verts=bm.verts)
    if bevel > 0: bmesh.ops.bevel(bm, geom=bm.edges[:], offset=min(bevel, min(sx, sy, sz) * .45), segments=2, affect='EDGES', profile=.5)
    bm.verts.ensure_lookup_table(); return bm
def place(bm, loc, rz=0., rx=0.):
    if rx: bmesh.ops.rotate(bm, verts=bm.verts, cent=(0, 0, 0), matrix=Matrix.Rotation(rx, 3, 'X'))
    if rz: bmesh.ops.rotate(bm, verts=bm.verts, cent=(0, 0, 0), matrix=Matrix.Rotation(rz, 3, 'Z'))
    bmesh.ops.translate(bm, vec=loc, verts=bm.verts); bm.verts.index_update(); return bm
def box(lv, m, size, c, bevel=0., rz=0., rx=0., name=None):
    """size (x,y,z), c = centre"""
    bm = place(_box_bm(*size, bevel=bevel), c, rz, rx)
    if m.name in SEPARATE or name: SPECIAL.append((lv, name or m.name, bm, m))
    else: L(lv).add_bm(bm, m); bm.free()
def boxr(lv, m, x0, x1, y0, y1, z0, z1, bevel=0., name=None):
    box(lv, m, (x1 - x0, y1 - y0, z1 - z0), ((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2), bevel, name=name)
def cyl(lv, m, r, h, c, seg=20, axis='Z', r2=None, name=None):
    bm = bmesh.new(); bmesh.ops.create_cone(bm, cap_ends=True, cap_tris=False, segments=seg, radius1=r, radius2=r if r2 is None else r2, depth=h)
    if axis == 'X': bmesh.ops.rotate(bm, verts=bm.verts, cent=(0, 0, 0), matrix=Matrix.Rotation(math.pi / 2, 3, 'Y'))
    if axis == 'Y': bmesh.ops.rotate(bm, verts=bm.verts, cent=(0, 0, 0), matrix=Matrix.Rotation(math.pi / 2, 3, 'X'))
    place(bm, c)
    if m.name in SEPARATE or name: SPECIAL.append((lv, name or m.name, bm, m))
    else: L(lv).add_bm(bm, m); bm.free()
def plane(lv, m, w, h, c, facing='-Y', name=None):
    """vertical (or horizontal) rectangle with 0..1 UVs, for screens / logos / glass"""
    bm = bmesh.new(); uv = bm.loops.layers.uv.new('UVMap')
    q = {'-Y': [(-w / 2, 0, -h / 2), (w / 2, 0, -h / 2), (w / 2, 0, h / 2), (-w / 2, 0, h / 2)], '+Y': [(w / 2, 0, -h / 2), (-w / 2, 0, -h / 2), (-w / 2, 0, h / 2), (w / 2, 0, h / 2)],
         '+X': [(0, -w / 2, -h / 2), (0, w / 2, -h / 2), (0, w / 2, h / 2), (0, -w / 2, h / 2)], '-X': [(0, w / 2, -h / 2), (0, -w / 2, -h / 2), (0, -w / 2, h / 2), (0, w / 2, h / 2)],
         '+Z': [(-w / 2, -h / 2, 0), (w / 2, -h / 2, 0), (w / 2, h / 2, 0), (-w / 2, h / 2, 0)], '-Z': [(-w / 2, h / 2, 0), (w / 2, h / 2, 0), (w / 2, -h / 2, 0), (-w / 2, -h / 2, 0)]}[facing]
    vs = [bm.verts.new((c[0] + p[0], c[1] + p[1], c[2] + p[2])) for p in q]; f = bm.faces.new(vs)
    for l, t in zip(f.loops, [(0, 0), (1, 0), (1, 1), (0, 1)]): l[uv].uv = t
    SPECIAL.append((lv, name or m.name, bm, m))

# ---------------------------------------------------------------- the building
X0, X1, Y0, Y1 = -12., 12., -8., 8.
LEVELS = [('B3', -12.6), ('B2', -8.4), ('B1', -4.2), ('G', 0.), ('L1', 5.4), ('L2', 9.6), ('L3', 13.8), ('L4', 18.), ('L5', 22.2), ('ROOF', 26.4)]
Z = dict(LEVELS); TOP = {LEVELS[i][0]: LEVELS[i + 1][1] for i in range(len(LEVELS) - 1)}; TOP['ROOF'] = 28.
SLAB = .35
CORE = (-12., -6.5, 2.5, 8.)   # stairs + lifts, north-west

def slab(lv, z0, holes=()):
    """structural slab whose top is at z0 (belongs to the level above). holes: list of (x0,x1,y0,y1)"""
    # split around holes along x into strips (simple and enough for a couple of openings)
    if not holes: boxr(lv, M['concrete'], X0, X1, Y0, Y1, z0 - SLAB, z0); return
    hx0, hx1, hy0, hy1 = holes[0]
    boxr(lv, M['concrete'], X0, hx0, Y0, Y1, z0 - SLAB, z0); boxr(lv, M['concrete'], hx1, X1, Y0, Y1, z0 - SLAB, z0)
    boxr(lv, M['concrete'], hx0, hx1, Y0, hy0, z0 - SLAB, z0); boxr(lv, M['concrete'], hx0, hx1, hy1, Y1, z0 - SLAB, z0)
def columns(lv, z0, z1, skip=()):
    for x in (-6., 0., 6.):
        for y in (-4., 2.5):
            if (x, y) in skip: continue
            box(lv, M['concrete'], (.5, .5, z1 - z0), (x, y, (z0 + z1) / 2))
def core(lv, z0, z1, doors=True):
    cx0, cx1, cy0, cy1 = CORE; t = .3
    boxr(lv, M['concrete'], cx0, cx1, cy0, cy0 + t, z0, z1)                  # south wall
    if doors:  # east wall with two lift doors
        boxr(lv, M['concrete'], cx1 - t, cx1, cy0, 3.6, z0, z1); boxr(lv, M['concrete'], cx1 - t, cx1, 4.9, 5.6, z0, z1); boxr(lv, M['concrete'], cx1 - t, cx1, 6.9, cy1, z0, z1)
        boxr(lv, M['concrete'], cx1 - t, cx1, 3.6, 4.9, z0 + 2.4, z1); boxr(lv, M['concrete'], cx1 - t, cx1, 5.6, 6.9, z0 + 2.4, z1)
        for y in (4.25, 6.25): box(lv, M['metal'], (.04, 1.3, 2.4), (cx1 + .02, y, z0 + 1.2))
    else: boxr(lv, M['concrete'], cx1 - t, cx1, cy0, cy1, z0, z1)
    boxr(lv, M['concrete'], cx0 + t, cx0 + t + .2, cy0, cy1, z0, z1)
def ceiling(lv, z, m=None, lights='grid', lm=None):
    m = m or M['white']; lm = lm or M['light']
    boxr(lv, m, X0, X1, Y0, Y1, z, z + .04)
    if lights == 'grid':
        for x in (-9, -3, 3, 9):
            for y in (-5.5, -1.5, 2.5, 6.):
                if CORE[0] <= x <= CORE[1] and CORE[2] <= y <= CORE[3]: continue
                box(lv, lm, (3.6, .22, .03), (x, y, z - .02))
    elif lights == 'lines':
        for y in (-5.8, -2.6, .6, 3.8, 6.6): box(lv, lm, (20, .12, .03), (1.5, y, z - .02))
def void_services(lv, z0, z1):
    """ducts, trays and sprinkler pipes in a ceiling void between z0 and z1"""
    zc = (z0 + z1) / 2
    for y in (-5., 1.): boxr(lv, M['metal'], X0 + 1, X1 - 1, y - .45, y + .45, zc - .18, zc + .18)
    for y in (-2., 4.): boxr(lv, M['yellow'], X0 + 1, X1 - 1, y - .15, y + .15, zc + .05, zc + .12)
    cyl(lv, M['red'], .05, X1 - X0 - 2, (0, -7., zc - .1), 10, 'X')
def retaining(lv, z0, z1):
    t = .4
    boxr(lv, M['concrete'], X0 - t, X1 + t, Y0 - t, Y0, z0, z1); boxr(lv, M['concrete'], X0 - t, X1 + t, Y1, Y1 + t, z0, z1)
    boxr(lv, M['concrete'], X0 - t, X0, Y0, Y1, z0, z1); boxr(lv, M['concrete'], X1, X1 + t, Y0, Y1, z0, z1)
def chair(lv, x, y, z, rz=0.):
    bm = _box_bm(.5, .5, .08, .02); place(bm, (0, 0, .46)); L(lv).add_bm(bm, M['chair']); bm.free()
    for (sx, sy, sz, c) in [(.48, .07, .55, (0, .24, .8)), (.06, .06, .4, (0, 0, .24))]:
        bm = _box_bm(sx, sy, sz, .02); place(bm, c); bmesh.ops.rotate(bm, verts=bm.verts, cent=(0, 0, 0), matrix=Matrix.Rotation(rz, 3, 'Z')); bmesh.ops.translate(bm, vec=(x, y, z), verts=bm.verts); L(lv).add_bm(bm, M['chair']); bm.free()
    # move the seat too
    v = L(lv).v
    # (seat added at origin; shift it) -> simpler: re-add seat in place
    L(lv).v = v
    bm = _box_bm(.5, .5, .08, .02); place(bm, (x, y, z + .46)); L(lv).add_bm(bm, M['chair']); bm.free()
    bm = _box_bm(.6, .6, .04, .02); place(bm, (x, y, z + .03)); L(lv).add_bm(bm, M['metal_dark']); bm.free()
def desk(lv, x, y, z, rz=0., screens=2, scr_name='screen_office', w=1.4, d=.75):
    c, s = math.cos(rz), math.sin(rz)
    def rot(px, py): return (x + px * c - py * s, y + px * s + py * c)
    bm = place(_box_bm(w, d, .04, .01), (0, 0, 0), rz); bmesh.ops.translate(bm, vec=(x, y, z + .74), verts=bm.verts); L(lv).add_bm(bm, M['white_gloss']); bm.free()
    for px in (-w / 2 + .05, w / 2 - .05):
        p = rot(px, 0); box(lv, M['metal_dark'], (.05, d - .1, .72), (p[0], p[1], z + .36), rz=rz)
    for k in range(screens):
        px = (k - (screens - 1) / 2) * .58; p = rot(px, d / 2 - .18); box(lv, M['screen_back'], (.56, .03, .34), (p[0], p[1], z + 1.06), rz=rz)
        q = rot(px, d / 2 - .198); plane(lv, M['screen'], .52, .3, (q[0], q[1], z + 1.06), name=f'{scr_name}', facing='-Y')
        _rotate_last_special(rz, (q[0], q[1], z + 1.06))
        p2 = rot(px, d / 2 - .14); box(lv, M['metal_dark'], (.06, .06, .28), (p2[0], p2[1], z + .88), rz=rz)
    p = rot(0, -.05); box(lv, M['metal_dark'], (.44, .14, .02), (p[0], p[1], z + .77), rz=rz)
def _rotate_last_special(rz, centre):
    if not rz: return
    lv, n, bm, m = SPECIAL[-1]; bmesh.ops.rotate(bm, verts=bm.verts, cent=centre, matrix=Matrix.Rotation(rz, 3, 'Z'))

# ===== B3: power & cooling plant
def build_B3():
    lv = 'B3'; z0 = Z['B3']; z1 = TOP['B3'] - SLAB
    slab(lv, z0); retaining(lv, z0 - SLAB, TOP['B3']); core(lv, z0, z1); columns(lv, z0, z1, skip=((6., -4.), (0., 2.5)))
    boxr(lv, M['concrete_dark'], X0, X1, Y0, Y1, z0, z0 + .02)
    for x in (-10.5, -8., -5.5, -3., -.5, 2.): boxr(lv, M['yellow'], x, x + 2., -6.8, -6.75, z0 + .02, z0 + .03)
    # UPS row along north
    for k in range(8):
        x = -4. + k * .86; box(lv, M['ups'], (.8, .9, 2.), (x, 6.9, z0 + 1.), bevel=.01); plane(lv, M['screen'], .3, .18, (x, 6.44, z0 + 1.55), name='screen_ups')
    # battery racks
    for yy in (2.2, -.6):
        for k in range(5):
            x = -3.5 + k * 2.2; box(lv, M['metal_dark'], (2., .8, .05), (x, yy, z0 + .1))
            for sh in range(4):
                zz = z0 + .2 + sh * .42; box(lv, M['metal_dark'], (2., .8, .03), (x, yy, zz))
                for b in range(6): box(lv, M['battery'], (.28, .55, .3), (x - .8 + b * .32, yy, zz + .17), bevel=.01)
            for px in (-1., 1.): box(lv, M['metal_dark'], (.05, .8, 1.8), (x + px, yy, z0 + .9))
    # switchgear along west
    for k in range(6):
        y = -5. + k * 1.05; box(lv, M['ups'], (.8, 1.0, 2.2), (-11.4, y, z0 + 1.1), bevel=.01); plane(lv, M['led_red'], .06, .06, (-10.99, y - .2, z0 + 1.7), name='led_ind', facing='+X'); plane(lv, M['screen'], .22, .14, (-10.99, y + .15, z0 + 1.5), name='screen_ups', facing='+X')
    # fire suppression cylinders (red)
    for k in range(7): cyl(lv, M['red_gloss'], .2, 1.6, (-8.8 + k * .5, -6.9, z0 + .8), 24)
    # generator on a skid
    box(lv, M['metal_dark'], (4.6, 2.2, .25), (9., -2.5, z0 + .13)); box(lv, M['yellow'], (4.2, 1.9, 2.1), (9., -2.5, z0 + 1.3), bevel=.06); box(lv, M['metal_dark'], (.5, 1.7, 1.8), (11.35, -2.5, z0 + 1.2)); cyl(lv, M['metal'], .16, 3.5, (8., -2.5, z1 - 1.6), 16)
    box(lv, M['red'], (1.6, .02, .3), (9., -3.46, z0 + 1.9))
    # pipes overhead
    for k, y in enumerate((-5.5, -4.8, 4., 4.7)): cyl(lv, M['pipe'], .16, 22., (0, y, z1 - .55 - (k % 2) * .25), 18, 'X')
    for x in (-8., 0., 8.): cyl(lv, M['red'], .17, .12, (x, -5.5, z1 - .55), 18, 'X'); cyl(lv, M['led_blue'] if False else M['concrete_dark'], .17, .1, (x + 1, 4., z1 - .55), 18, 'X')
    for x in (-8, -2, 4, 10): box(lv, M['light_cool'], (3., .12, .04), (x, -2.4, z1 - .06)); box(lv, M['light_cool'], (3., .12, .04), (x, 2.0, z1 - .06))

# ===== B2: data hall
def build_B2():
    lv = 'B2'; z0 = Z['B2']; z1 = TOP['B2'] - SLAB; rf = z0 + .3
    slab(lv, z0); retaining(lv, z0 - SLAB, TOP['B2']); core(lv, z0, z1); columns(lv, z0, z1, skip=((0., -4.), (6., -4.), (0., 2.5), (6., 2.5)))
    boxr(lv, M['floor_dark'], X0, X1, Y0, Y1, z0, rf - .04)            # raised floor void (seen in section)
    boxr(lv, M['floor_dark'], X0, X1, Y0, Y1, rf - .04, rf)            # tiles
    rows = [(-3.6, 1), (-1.2, -1), (1.8, 1), (4.2, -1), (7.2, 1), (9.6, -1)]   # x, facing (+1 faces +x)
    for (rx, fc) in rows:
        for k in range(17):
            y = -6.3 + k * .6; box(lv, M['rack'], (1.2, .58, 2.2), (rx, y, rf + 1.1))
            plane(lv, M['rack_front'], .56, 2.1, (rx + fc * .605, y, rf + 1.1), name='rack_front', facing='+X' if fc > 0 else '-X')
    for ax in (-2.4, 3., 8.4):
        boxr(lv, M['floor_perf'], ax - .6, ax + .6, -6.6, 3.9, rf, rf + .005)
        box(lv, M['glass_frost'], (1.2, 10.3, .03), (ax, -1.25, rf + 2.22), name='containment_roof')
        box(lv, M['alu'], (1.3, .1, .3), (ax, 4.0, rf + 2.35)); plane(lv, M['logo'], 1.1, .22, (ax, 3.94, rf + 2.35), name='aisle_sign', facing='-Y')
        box(lv, M['glass'], (1.2, .04, 2.2), (ax, 4.02, rf + 1.1), name='aisle_door')
        box(lv, M['led_red'], (1.2, .05, .03), (ax, 3.92, rf + 2.5))
    # cable trays above
    for (rx, fc) in rows:
        boxr(lv, M['yellow'], rx - .15, rx + .15, -6.8, 4.5, rf + 2.75, rf + 2.85); boxr(lv, M['metal_dark'], rx - .25, rx + .25, -6.8, 4.5, rf + 3.15, rf + 3.2)
    # cooling units on the east wall
    for k in range(4): box(lv, M['ups'], (1., 2.4, 2.1), (11.4, -5.5 + k * 2.9, rf + 1.05), bevel=.02); plane(lv, M['screen'], .2, .12, (10.89, -5.5 + k * 2.9, rf + 1.6), name='screen_ups', facing='-X')
    boxr(lv, M['concrete_dark'], X0, X1, Y0, Y1, z1 - .02, z1)
    for x in (-2.4, 3., 8.4): box(lv, M['light_cool'], (.12, 10., .04), (x, -1.2, z1 - .25))
    for x in (-6., 12.): pass
    plane(lv, M['logo'], 3.2, .65, (-6.18, 0., rf + 2.4), name='logo_wall', facing='+X')

def _rot_plane_vertical_rack():
    """rack_front plane was built as w=2.1 (height) x h=.56; swap axes so it stands upright"""
    lv, n, bm, m = SPECIAL[-1]; c = sum((v.co for v in bm.verts), Vector()) / 4
    bmesh.ops.rotate(bm, verts=bm.verts, cent=c, matrix=Matrix.Rotation(math.pi / 2, 3, 'X' if abs(bm.faces[0].normal.x) > .5 else 'Y'))

# ===== B1: security operations centre
def build_B1():
    lv = 'B1'; z0 = Z['B1']; z1 = TOP['B1'] - SLAB; rf = z0 + .3; cz = z1 - .6
    slab(lv, z0, holes=()); retaining(lv, z0 - SLAB, TOP['B1']); core(lv, z0, z1); columns(lv, z0, cz, skip=((0., -4.), (6., -4.), (0., 2.5), (6., 2.5)))
    boxr(lv, M['floor_dark'], X0, X1, Y0, Y1, z0, rf - .04); boxr(lv, M['carpet'], -6., X1, Y0, Y1, rf - .04, rf); boxr(lv, M['floor_dark'], X0, -6., Y0, 2.5, rf - .04, rf)
    # north wall with video wall
    boxr(lv, M['concrete_dark'], -6., X1, 3.6, 3.9, rf, cz)
    box(lv, M['screen_back'], (9.2, .1, 3.0), (3., 3.52, rf + 1.95))
    for i in range(4):
        for j in range(2): plane(lv, M['screen'], 2.18, 1.4, (3. - 3.3 + i * 2.2, 3.46, rf + 1.25 + j * 1.42), name=f'soc_wall_{i}_{j}')
    # tiers of desks facing north
    for r, (yy, h) in enumerate(((-.2, 0.), (-2.6, .25), (-5.0, .5))):
        if h: boxr(lv, M['carpet'], -5.5, 11.5, yy - 1.2, yy + 1.0, rf, rf + h); boxr(lv, M['led_blue'], -5.5, 11.5, yy + .99, yy + 1.0, rf + h - .05, rf + h - .01)
        for k in range(4): desk(lv, -3.2 + k * 3.7, yy, rf + h, 0., 3, f'screen_soc')
    # glass wall to the corridor (west)
    box(lv, M['glass'], (.04, 10.5, 2.8), (-5.9, -2.6, rf + 1.4), name='soc_glass')
    plane(lv, M['logo'], 2.6, .52, (-5.86, -2.6, rf + 2.2), name='logo_etch', facing='+X')
    boxr(lv, M['white'], X0, X1, Y0, Y1, cz, cz + .04)
    void_services(lv, cz + .04, z1)
    for y in (-6.5, -3.8, -1.2, 1.4): box(lv, M['led_blue'], (16., .05, .03), (3., y, cz - .02))
    for k in range(3): box(lv, M['light_cool'], (.6, .6, .03), (-9., -5. + k * 3., cz - .02))

# ===== G: lobby
def build_G():
    lv = 'G'; z0 = Z['G']; z1 = TOP['G'] - SLAB; cz = 4.8
    slab(lv, z0, holes=[(6., 10.5, 1., 6.)])
    core(lv, z0, z1); columns(lv, z0, cz, skip=((6., 2.5),))
    boxr(lv, M['stone'], X0, 6., Y0, Y1, z0, z0 + .02); boxr(lv, M['stone'], 10.5, X1, Y0, Y1, z0, z0 + .02); boxr(lv, M['stone'], 6., 10.5, Y0, 1., z0, z0 + .02); boxr(lv, M['stone'], 6., 10.5, 6., Y1, z0, z0 + .02)
    # reception desk + red light line
    box(lv, M['white_gloss'], (5.2, .9, 1.1), (0., 2.2, .55), bevel=.06); box(lv, M['white_gloss'], (5.4, 1.1, .05), (0., 2.2, 1.12), bevel=.02)
    box(lv, M['led_red'], (5.0, .02, .04), (0., 1.74, .92))
    for x in (-1.2, 1.2): box(lv, M['screen_back'], (.5, .04, .32), (x, 2.45, 1.32)); plane(lv, M['screen'], .46, .28, (x, 2.425, 1.32), name='screen_office', facing='+Y')
    # timber logo wall
    boxr(lv, M['timber'], -4.6, 4.6, 4.9, 5.1, z0, 4.4)
    for k in range(46): box(lv, M['timber'], (.08, .08, 4.3), (-4.5 + k * .2, 4.86, 2.17))
    plane(lv, M['logo'], 4.4, .89, (0., 4.79, 2.9), name='logo_lobby')
    box(lv, M['led_red'], (9., .04, .04), (0., 4.78, 4.3))
    # lounge rug and a low wall
    boxr(lv, M['fabric'], -10.5, -4.5, -6.2, -1.6, z0 + .02, z0 + .03)
    # lobby screen on east wall
    box(lv, M['screen_back'], (.08, 3.4, 2.0), (11.9, -3., 2.4)); plane(lv, M['screen'], 3.2, 1.8, (11.85, -3., 2.4), name='screen_lobby', facing='-X')
    # stair void balustrade and stairs down to B1
    for (x0, x1, y0, y1) in ((6., 10.5, .97, 1.), (6., 6.03, 1., 6.), (10.47, 10.5, 1., 6.)): box(lv, M['glass'], (x1 - x0, y1 - y0, 1.1), ((x0 + x1) / 2, (y0 + y1) / 2, .55), name='stair_glass')
    for k in range(22):
        y = 5.8 - k * .22; zt = z0 - (k + 1) * .19; box(lv, M['stone'], (1.6, .3, .05), (7.2, y, zt))
    boxr(lv, M['concrete'], 6.4, 8.0, 1.0, 6.0, -4.2, -4.0)
    # ceiling with downlights and ring pendants
    boxr(lv, M['white'], X0, X1, Y0, Y1, cz, cz + .04)
    for x in (-9., -5., -1., 3.):
        for y in (-6., -2.5):
            cyl(lv, M['light'], .09, .02, (x, y, cz - .01), 16)
    for (x, y) in ((-7.5, -3.9), (0., 0.)):
        bm = bmesh.new(); bmesh.ops.create_circle(bm, cap_ends=False, segments=48, radius=1.1);
        ring = bmesh.ops.extrude_edge_only(bm, edges=bm.edges[:]); bmesh.ops.translate(bm, vec=(0, 0, .06), verts=[v for v in ring['geom'] if isinstance(v, bmesh.types.BMVert)])
        bmesh.ops.translate(bm, vec=(x, y, 3.7), verts=bm.verts); SPECIAL.append((lv, 'pendant', bm, M['light']))
        box(lv, M['metal_dark'], (.01, .01, 1.05), (x, y, 4.25))
    void_services(lv, cz + .04, z1)

# ===== offices
def office_floor(lv, people_desks=True, dense=True):
    z0 = Z[lv]; z1 = TOP[lv] - SLAB; cz = z1 - .55
    slab(lv, z0); core(lv, z0, z1); columns(lv, z0, cz)
    boxr(lv, M['carpet'], X0, X1, Y0, Y1, z0, z0 + .02)
    clusters = [(-3., -4.6), (3.6, -4.6), (-3., -.6), (3.6, -.6), (9.6, -2.6)] if dense else [(-2., -4.), (5., -4.)]
    for (cx, cy) in clusters:
        for i in range(3):
            for s in (-1, 1): desk(lv, cx + (i - 1) * 1.45, cy + s * .42, z0, 0. if s < 0 else math.pi, 2)
    boxr(lv, M['white'], X0, X1, Y0, Y1, cz, cz + .04); ceiling_lines(lv, cz)
    void_services(lv, cz + .04, z1)
def ceiling_lines(lv, cz):
    for y in (-6.4, -3.2, 0., 3.2, 6.4): box(lv, M['light'], (17., .1, .03), (2.5, y, cz - .02))
def build_L1():
    lv = 'L1'; office_floor(lv); z0 = Z[lv]
    # glass meeting pod
    for (x0, x1, y0, y1) in ((7., 11., 3., 3.04), (7., 7.04, 3., 7.6)): box(lv, M['glass'], (x1 - x0, y1 - y0, 2.8), ((x0 + x1) / 2, (y0 + y1) / 2, z0 + 1.4), name='pod_glass')
    box(lv, M['white_gloss'], (2.6, 1.2, .05), (9.2, 5.3, z0 + .74), bevel=.02); box(lv, M['metal_dark'], (.1, .1, .72), (9.2, 5.3, z0 + .36))
    # kitchen island and red feature wall on the core
    box(lv, M['white_gloss'], (3.2, 1., .95), (-2.5, 5.6, z0 + .48), bevel=.03); box(lv, M['red'], (3.0, .02, .5), (-2.5, 5.09, z0 + .5))
    plane(lv, M['logo'], 4.2, 1.0, (-6.17, -1.5, z0 + 2.3), name='graphic_l1', facing='+X')
    box(lv, M['red'], (.06, 6.0, 3.4), (-6.2, -1.5, z0 + 2.0))
def build_L2():
    lv = 'L2'; z0 = Z[lv]; z1 = TOP[lv] - SLAB; cz = z1 - .55
    slab(lv, z0); core(lv, z0, z1); columns(lv, z0, cz, skip=((0., 2.5), (6., 2.5)))
    boxr(lv, M['carpet'], X0, X1, Y0, Y1, z0, z0 + .02); boxr(lv, M['timber'], -6., X1, 1.2, Y1, z0 + .02, z0 + .03)
    # boardroom
    box(lv, M['white_gloss'], (6.4, 1.8, .06), (3., 4.4, z0 + .74), bevel=.03); box(lv, M['metal_dark'], (5.0, .3, .72), (3., 4.4, z0 + .36))
    for k in range(5):
        for s in (-1, 1): chair(lv, .4 + k * 1.3, 4.4 + s * 1.25, z0, 0. if s > 0 else math.pi)
    box(lv, M['screen_back'], (7.2, .1, 2.2), (3., 7.85, z0 + 1.7))
    for i in range(3): plane(lv, M['screen'], 2.3, 1.3, (.7 + i * 2.32, 7.79, z0 + 1.7), name=f'vc_{i}')
    box(lv, M['glass'], (18., .04, 2.9), (3., 1.2, z0 + 1.45), name='board_glass')
    # lounge by the windows
    for (x, y) in ((-3., -5.5), (5., -5.5)):
        box(lv, M['fabric'], (2.6, .9, .45), (x, y, z0 + .23), bevel=.08); box(lv, M['fabric'], (2.6, .25, .8), (x, y - .4, z0 + .4), bevel=.08)
    box(lv, M['white'], (1.2, .7, .4), (1., -5.4, z0 + .2), bevel=.04)
    boxr(lv, M['white'], X0, X1, Y0, Y1, cz, cz + .04); ceiling_lines(lv, cz); void_services(lv, cz + .04, z1)
def build_upper(lv): office_floor(lv)
def build_ROOF():
    lv = 'ROOF'; z0 = Z['ROOF']
    slab(lv, z0); boxr(lv, M['concrete'], X0, X1, Y0, Y1, z0, z0 + .05)
    for (x0, x1, y0, y1) in ((X0 - .3, X1 + .3, Y0 - .3, Y0), (X0 - .3, X1 + .3, Y1, Y1 + .3), (X0 - .3, X0, Y0, Y1), (X1, X1 + .3, Y0, Y1)): boxr(lv, M['panel'], x0, x1, y0, y1, z0, z0 + 1.1)
    for k in range(4): box(lv, M['ups'], (1.4, 1.4, 1.2), (4. + k * 1.8, 5.2, z0 + .65), bevel=.03); cyl(lv, M['metal_dark'], .55, .05, (4. + k * 1.8, 5.2, z0 + 1.27), 24)
    for r in range(3):
        for k in range(6): box(lv, M['metal_dark'], (1.0, 1.65, .05), (-4. + k * 1.05, -2. + r * 1.75, z0 + .7), rx=-.2)
    cyl(lv, M['metal'], .06, 6., (-9., 5., z0 + 3.), 10); cyl(lv, M['metal'], .04, 4., (-10., 6., z0 + 2.), 10); box(lv, M['white'], (.6, .2, .6), (-9., 5., z0 + 4.8))
    core(lv, z0, z0 + 3.2, doors=False); boxr(lv, M['concrete'], CORE[0], CORE[1], CORE[2], CORE[3], z0 + 3.2, z0 + 3.5)
    # illuminated sign facing the sea
    box(lv, M['metal_dark'], (9., .2, .1), (2., -7.6, z0 + 1.2)); [box(lv, M['metal_dark'], (.08, .08, 2.2), (x, -7.55, z0 + 2.2)) for x in (-2., 2., 6.)]
    plane(lv, M['logo'], 8.6, 1.74, (2., -7.72, z0 + 2.4), name='logo_roof')

# ===== facade (above ground)
def build_FACADE():
    lv = 'FACADE'; zT = Z['ROOF']
    # spandrel bands at each floor, with a thin red line
    for name, z in LEVELS[3:10]:
        for (x0, x1, y0, y1) in ((X0 - .15, X1 + .15, Y0 - .15, Y0), (X0 - .15, X1 + .15, Y1, Y1 + .15), (X0 - .15, X0, Y0, Y1), (X1, X1 + .15, Y0, Y1)):
            if name == 'G': continue
            boxr(lv, M['panel'], x0, x1, y0, y1, z - .45, z + .45)
        if name not in ('G',): boxr(lv, M['red'], X0 - .17, X1 + .17, Y0 - .17, Y0 - .15, z - .05, z + .02)
    # mullions (south/east/west glass), north mostly solid
    for x in [X0 + i * 1.5 for i in range(17)]:
        boxr(lv, M['alu'], x - .03, x + .03, Y0 - .1, Y0, 0., zT)
    for y in [Y0 + i * 1.6 for i in range(11)]:
        boxr(lv, M['alu'], X1, X1 + .1, y - .03, y + .03, 0., zT); boxr(lv, M['alu'], X0 - .1, X0, y - .03, y + .03, 5.4, zT)
    # white vertical fins
    for x in [X0 + i * 3. for i in range(9)]:
        boxr(lv, M['panel'], x - .07, x + .07, Y0 - .75, Y0 - .1, 5.4, zT + 1.1)
    boxr(lv, M['red'], X0 - .5, X0 - .1, Y0 - .75, Y0 - .1, 0., zT + 1.6)   # red corner blade
    # glazing
    for name, z in LEVELS[3:9]:
        zt = TOP[name] - (.45 if name != 'L5' else .45); zb = z + (.45 if name != 'G' else 0.)
        if name == 'L2':
            box(lv, M['glass'], (5.5, .03, zt - zb), (-6.75, Y0 - .02, (zb + zt) / 2), name='facade_glass_s'); box(lv, M['glass'], (9.0, .03, zt - zb), (7.5, Y0 - .02, (zb + zt) / 2), name='facade_glass_s')
            box(lv, M['glass'], (4.0, .03, zt - zb), (-2.0, Y0 - .02, (zb + zt) / 2), name='facade_glass_s')   # leaves the balcony door at x 0..3 open
        elif name == 'G':
            box(lv, M['glass'], (10.4, .03, zt - zb), (-6.8, Y0 - .02, (zb + zt) / 2), name='facade_glass_s'); box(lv, M['glass'], (10.4, .03, zt - zb), (6.8, Y0 - .02, (zb + zt) / 2), name='facade_glass_s')
            box(lv, M['glass'], (3.2, .03, zt - 3.0), (0., Y0 - .02, (3.0 + zt) / 2), name='facade_glass_s')
            for x in (-.8, .8): box(lv, M['glass'], (1.55, .04, 2.95), (x * 1.35, Y0 - .3 if x < 0 else Y0 - .02, 1.5), name='entry_door', rz=.5 if x < 0 else 0.)
            for x in (-.15, .15): box(lv, M['red'], (.04, .06, .8), (x, Y0 - .12, 1.2))
        else: box(lv, M['glass'], (24., .03, zt - zb), (0., Y0 - .02, (zb + zt) / 2), name='facade_glass_s')
        box(lv, M['glass'], (.03, 16., zt - zb), (X1 + .02, 0., (zb + zt) / 2), name='facade_glass_e')
        if name != 'G': box(lv, M['glass'], (.03, 10.5, zt - zb), (X0 - .02, -2.75, (zb + zt) / 2), name='facade_glass_w')
        else: box(lv, M['glass'], (.03, 10.5, zt - zb), (X0 - .02, -2.75, (zb + zt) / 2), name='facade_glass_w')
    # north + core walls (solid, white) with slot windows
    boxr(lv, M['panel'], X0 - .15, X1 + .15, Y1, Y1 + .25, 0., zT)
    boxr(lv, M['panel'], X0 - .25, X0, 2.5, Y1, 0., zT)
    # entrance canopy
    boxr(lv, M['panel'], -4.5, 4.5, Y0 - 3.2, Y0, 4.2, 4.5); boxr(lv, M['red'], -4.5, 4.5, Y0 - 3.22, Y0 - 3.2, 4.2, 4.5)
    for x in (-1.8, 0., 1.8): cyl(lv, M['light'], .07, .02, (x, Y0 - 1.6, 4.19), 14)
    # L2 balcony
    boxr(lv, M['concrete'], -.5, 3.5, Y0 - 2.2, Y0, Z['L2'] - .3, Z['L2'] + .02); box(lv, M['glass'], (4., .03, 1.1), (1.5, Y0 - 2.18, Z['L2'] + .55), name='balcony_glass')
    # soil around the basements (shows in section)
    for (x0, x1, y0, y1) in ((-40, 40, -34, Y0 - .4), (-40, 40, Y1 + .4, 34), (-40, X0 - .4, Y0 - .4, Y1 + .4), (X1 + .4, 40, Y0 - .4, Y1 + .4)):
        boxr(lv, M['soil'], x0, x1, y0, y1, -13.2, -.03)
    boxr(lv, M['soil'], -40, 40, -34, 34, -14.2, -13.2)

BUILD = dict(B3=build_B3, B2=build_B2, B1=build_B1, G=build_G, L1=build_L1, L2=build_L2, L3=lambda: build_upper('L3'), L4=lambda: build_upper('L4'), L5=lambda: build_upper('L5'), ROOF=build_ROOF, FACADE=build_FACADE)
for k, f in BUILD.items(): f()

# ---------------------------------------------------------------- make objects
coll = {}
def collection(name):
    if name not in coll: c = bpy.data.collections.new(name); scn.collection.children.link(c); coll[name] = c
    return coll[name]
LEVEL_OBJ = {}
for name, acc in LV.items():
    me = bpy.data.meshes.new('lv_' + name); me.from_pydata(acc.v, [], acc.f)
    for m in acc.mats: me.materials.append(m)
    for p, mi in zip(me.polygons, acc.fm): p.material_index = mi
    me.update(); me.uv_layers.new(name='UVMap')
    ob = bpy.data.objects.new('LV_' + name, me); collection(name).objects.link(ob); LEVEL_OBJ[name] = ob
    # merge coincident verts per object would weld separate boxes; keep them separate (clean section caps)
SPECIAL_OBJS = []
GROUP = {}
for (lv, nm, bm, m) in SPECIAL:
    key = (lv, nm, m.name)
    tmp = bpy.data.meshes.new('tmp'); bm.to_mesh(tmp); bm.free()
    if key not in GROUP: GROUP[key] = bmesh.new()
    GROUP[key].from_mesh(tmp); bpy.data.meshes.remove(tmp)
for (lv, nm, mn), bm in GROUP.items():
    me = bpy.data.meshes.new(nm); bm.to_mesh(me); bm.free(); me.materials.append(MATS_BY[mn] if False else bpy.data.materials[mn])
    if not me.uv_layers: me.uv_layers.new(name='UVMap')
    ob = bpy.data.objects.new(nm, me); collection(lv).objects.link(ob); SPECIAL_OBJS.append(ob)
print('SPECIAL OBJECTS', len(SPECIAL_OBJS))

# world + sun for the bake of above-ground floors
world = bpy.data.worlds.new('W'); scn.world = world; world.use_nodes = True
bg = world.node_tree.nodes['Background']; sky = world.node_tree.nodes.new('ShaderNodeTexSky'); sky.sky_type = 'NISHITA'; sky.sun_elevation = math.radians(52); sky.sun_rotation = math.radians(200); sky.sun_intensity = .35
world.node_tree.links.new(sky.outputs['Color'], bg.inputs['Color']); bg.inputs['Strength'].default_value = .5
sun = bpy.data.lights.new('Sun', 'SUN'); sun.energy = 3.5; sun.angle = math.radians(2); so = bpy.data.objects.new('Sun', sun); scn.collection.objects.link(so); so.rotation_euler = (math.radians(38), 0, math.radians(200))
STATS = {n: {'verts': len(a.v), 'faces': len(a.f)} for n, a in LV.items()}
print('LEVEL STATS', json.dumps(STATS))

# ---------------------------------------------------------------- lightmap UVs + bake
def lightmap_uv(ob):
    ob.data.uv_layers.new(name='LM'); ob.data.uv_layers.active = ob.data.uv_layers['LM']
    bpy.ops.object.select_all(action='DESELECT'); ob.select_set(True); bpy.context.view_layer.objects.active = ob
    bpy.ops.object.mode_set(mode='EDIT'); bpy.ops.mesh.select_all(action='SELECT')
    bpy.ops.uv.smart_project(angle_limit=math.radians(66), island_margin=.003, area_weight=0., scale_to_bounds=False)
    bpy.ops.uv.pack_islands(margin=.004, rotate=True)
    bpy.ops.object.mode_set(mode='OBJECT')
if SAMPLES > 0 and LEVEL in LEVEL_OBJ:
    ob = LEVEL_OBJ[LEVEL]; lightmap_uv(ob)
    scn.render.engine = 'CYCLES'; scn.cycles.device = 'CPU'; scn.cycles.samples = SAMPLES; scn.cycles.use_denoising = False
    scn.cycles.max_bounces = 6; scn.cycles.diffuse_bounces = 4; scn.cycles.glossy_bounces = 1; scn.cycles.transmission_bounces = 4
    img = bpy.data.images.new('LM_' + LEVEL, RES, RES, float_buffer=True)
    for m in ob.data.materials:
        nt = m.node_tree; t = nt.nodes.new('ShaderNodeTexImage'); t.image = img; nt.nodes.active = t
    b = scn.render.bake; b.use_pass_direct = True; b.use_pass_indirect = True; b.use_pass_color = False; b.margin = 6; b.target = 'IMAGE_TEXTURES'
    bpy.ops.object.select_all(action='DESELECT'); ob.select_set(True); bpy.context.view_layer.objects.active = ob
    t0 = time.time(); bpy.ops.object.bake(type='DIFFUSE'); print('BAKED', LEVEL, round(time.time() - t0), 's')
    img.filepath_raw = f'{OUT}/lm_{LEVEL}.exr'; img.file_format = 'OPEN_EXR'; img.save()
    # denoise with the compositor (OIDN), then encode: jpeg = srgb(L / 4)
    scn.use_nodes = True; nt = scn.node_tree; [nt.nodes.remove(n) for n in list(nt.nodes)]
    ni = nt.nodes.new('CompositorNodeImage'); ni.image = img; dn = nt.nodes.new('CompositorNodeDenoise'); dn.use_hdr = True
    try: dn.prefilter = 'ACCURATE'
    except Exception: pass
    oc = nt.nodes.new('CompositorNodeComposite'); nt.links.new(ni.outputs[0], dn.inputs['Image']); nt.links.new(dn.outputs[0], oc.inputs['Image'])
    vw = nt.nodes.new('CompositorNodeViewer'); nt.links.new(dn.outputs[0], vw.inputs[0])
    scn.render.resolution_x = RES; scn.render.resolution_y = RES; scn.render.resolution_percentage = 100; scn.cycles.samples = 1
    for o in scn.objects: o.hide_render = True
    scn.view_settings.view_transform = 'Standard'; scn.render.image_settings.file_format = 'OPEN_EXR'; scn.render.filepath = f'{OUT}/lm_{LEVEL}_dn.exr'
    t0 = time.time(); bpy.ops.render.render(write_still=True); print('DENOISED', round(time.time() - t0), 's')
    import numpy as np
    dimg = bpy.data.images.load(f'{OUT}/lm_{LEVEL}_dn.exr'); px = np.array(dimg.pixels[:], dtype=np.float32).reshape(RES, RES, 4)
    raw = np.array(img.pixels[:], dtype=np.float32).reshape(RES, RES, 4)
    if not np.isfinite(px).all() or px[..., :3].max() <= 0: px = raw
    mask = raw[..., 3:4] > 0; px[..., :3] = np.where(mask, px[..., :3], raw[..., :3])
    L4 = np.clip(px[..., :3] / 4., 0, 1); enc = np.where(L4 <= .0031308, L4 * 12.92, 1.055 * np.power(L4, 1 / 2.4) - .055)
    out = bpy.data.images.new('enc', RES, RES, alpha=False); out.colorspace_settings.name = 'Non-Color'
    o4 = np.ones((RES, RES, 4), np.float32); o4[..., :3] = enc; out.pixels.foreach_set(o4.ravel())
    out.filepath_raw = f'{OUT}/lm_{LEVEL}.jpg'; out.file_format = 'JPEG'; scn.render.image_settings.quality = 90; out.save()
    print('LM STATS', LEVEL, float(np.percentile(px[..., :3][mask[..., 0]], 50)), float(np.percentile(px[..., :3][mask[..., 0]], 99)))
    for o in scn.objects: o.hide_render = False

# ---------------------------------------------------------------- export
def export(objs, path):
    bpy.ops.object.select_all(action='DESELECT')
    for o in objs: o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    bpy.ops.export_scene.gltf(filepath=path, export_format='GLB', use_selection=True, export_apply=True, export_materials='EXPORT', export_image_format='NONE',
                              export_texcoords=True, export_normals=True, export_draco_mesh_compression_enable=True, export_draco_mesh_compression_level=7,
                              export_draco_position_quantization=14, export_draco_texcoord_quantization=12, export_lights=False, export_cameras=False)
if LEVEL == 'ALL':
    for name in LV:
        objs = [LEVEL_OBJ[name]] + [o for o in collection(name).objects if o != LEVEL_OBJ[name]]
        export(objs, f'{OUT}/{name}.glb')
elif SAMPLES > 0:
    objs = [LEVEL_OBJ[LEVEL]] + [o for o in collection(LEVEL).objects if o != LEVEL_OBJ[LEVEL]]
    export(objs, f'{OUT}/{LEVEL}.glb')
print('DONE')

# ---------------------------------------------------------------- preview render (section through y = -6.6)
if '--preview' in A:
    scn.render.engine = 'CYCLES'; scn.cycles.samples = int(arg('--psamples', '24')); scn.cycles.use_denoising = True
    try: scn.cycles.denoiser = 'OPENIMAGEDENOISE'
    except Exception: pass
    scn.render.resolution_x = int(arg('--pw', '1400')); scn.render.resolution_y = int(arg('--ph', '1100'))
    scn.view_settings.view_transform = 'AgX'
    cam = bpy.data.cameras.new('C'); co = bpy.data.objects.new('C', cam); scn.collection.objects.link(co); scn.camera = co
    mode = arg('--pmode', 'section')
    if mode == 'section':
        cam.type = 'ORTHO'; cam.ortho_scale = 46; co.location = (0, -40, 7.5); co.rotation_euler = (math.radians(90), 0, 0); cam.clip_start = 40 - 6.6; cam.clip_end = 200
    else:
        e = [float(x) for x in arg('--pcam', '0,-7.5,1.6,0,0,1.6').split(',')]
        cam.lens = float(arg('--plens', '18')); co.location = e[:3]
        d = Vector(e[3:]) - Vector(e[:3]); co.rotation_euler = d.to_track_quat('-Z', 'Y').to_euler(); cam.clip_start = .05
    scn.render.filepath = arg('--pout', f'{OUT}/preview.png'); bpy.ops.render.render(write_still=True); print('RENDERED', scn.render.filepath)
