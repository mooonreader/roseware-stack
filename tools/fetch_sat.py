"""Cloud-free true-colour composites of the lagoons around four island groups, from Copernicus Sentinel-2 L2A
(public COGs on AWS, found through the Earth Search STAC API). Output: data/sat/<name>.jpg (+ _lo.jpg) and data/sat/index.json.
Contains modified Copernicus Sentinel data."""
import json, os, sys, math, requests, numpy as np, rasterio
from rasterio.vrt import WarpedVRT
from rasterio.enums import Resampling
from rasterio.transform import from_bounds
from PIL import Image
PATCHES = {  # name: (south, west, north, east, degrees per pixel)
  'male':  (4.105, 73.395, 4.300, 73.600, 0.0001),
  'kulhu': (6.565, 72.995, 6.690, 73.135, 0.0001),
  'fuva':  (-0.350, 73.385, -0.250, 73.475, 0.0001),
  'addu':  (-0.735, 73.060, -0.565, 73.260, 0.00015),
}
STAC = 'https://earth-search.aws.element84.com/v1/search'
os.makedirs('data/sat', exist_ok=True)
env = dict(GDAL_DISABLE_READDIR_ON_OPEN='EMPTY_DIR', CPL_VSIL_CURL_ALLOWED_EXTENSIONS='.tif', AWS_NO_SIGN_REQUEST='YES', GDAL_HTTP_MAX_RETRY='4', GDAL_HTTP_RETRY_DELAY='2', VSI_CACHE='TRUE')
index = {'attribution': 'Contains modified Copernicus Sentinel data (2023-2026), processed via Earth Search / AWS Open Data', 'patches': {}}
def search(b):
    s, w, n, e, _ = b
    body = {'collections': ['sentinel-2-l2a'], 'bbox': [w, s, e, n], 'datetime': '2023-01-01T00:00:00Z/2026-11-15T00:00:00Z',
            'query': {'eo:cloud_cover': {'lt': 25}}, 'sortby': [{'field': 'properties.eo:cloud_cover', 'direction': 'asc'}], 'limit': 40}
    r = requests.post(STAC, json=body, timeout=120); r.raise_for_status()
    return r.json().get('features', [])
def read(href, b, W, H, resamp):
    s, w, n, e, _ = b
    with rasterio.open(href) as src:
        with WarpedVRT(src, crs='EPSG:4326', transform=from_bounds(w, s, e, n, W, H), width=W, height=H, resampling=resamp) as vrt:
            return vrt.read()
with rasterio.Env(**env):
    for name, b in PATCHES.items():
        s, w, n, e, res = b
        W, H = int(round((e - w) / res)), int(round((n - s) / res))
        items = search(b); print(name, 'items', len(items), W, H, flush=True)
        stack = []; used = 0
        for it in items:
            if used >= 9: break
            a = it['assets']; vis = a.get('visual', {}).get('href'); scl = a.get('scl', {}).get('href')
            if not vis or not scl: continue
            try:
                rgb = read(vis, b, W, H, Resampling.bilinear).astype(np.float32)
                cl = read(scl, b, W, H, Resampling.nearest)[0]
            except Exception as ex:
                print('skip', it['id'], ex, flush=True); continue
            bad = (cl == 0) | (cl == 1) | (cl == 3) | (cl == 8) | (cl == 9) | (cl == 10) | (rgb.sum(0) == 0)
            frac = 1 - bad.mean()
            if frac < 0.08: continue
            rgb[:, bad] = np.nan; stack.append(rgb); used += 1
            print(' use', it['id'], it['properties'].get('eo:cloud_cover'), 'valid %.2f' % frac, flush=True)
        if not stack: print('no data for', name); continue
        med = np.nanmedian(np.stack(stack), axis=0)
        valid = ~np.isnan(med[0])
        med = np.nan_to_num(med, nan=0.0)
        img = np.clip(med, 0, 255).astype(np.uint8).transpose(1, 2, 0)
        alpha = (valid * 255).astype(np.uint8)
        # fill small gaps so seams don't show; alpha keeps true coverage for the shader
        Image.fromarray(img).save(f'data/sat/{name}.jpg', quality=84, optimize=True, progressive=True)
        Image.fromarray(img).resize((W // 2, H // 2), Image.LANCZOS).save(f'data/sat/{name}_lo.jpg', quality=80, optimize=True, progressive=True)
        Image.fromarray(alpha).resize((W // 4, H // 4), Image.BILINEAR).save(f'data/sat/{name}_mask.png', optimize=True)
        index['patches'][name] = {'bbox': [w, s, e, n], 'size': [W, H], 'scenes': used, 'coverage': round(float(valid.mean()), 3)}
        print(name, 'done', used, 'coverage', valid.mean(), flush=True)
json.dump(index, open('data/sat/index.json', 'w'), indent=1)
print(json.dumps(index))
