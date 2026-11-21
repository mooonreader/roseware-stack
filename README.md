# RoseWare — immersive concept

An immersive 3D concept redesign for RoseWare Corporation (not the official site). You start inside the entry door of a
modelled RoseWare HQ in Malé and scroll down through it in section: the lobby, a security operations centre, the data hall
and the power plant, cut open like an architect's drawing. Then the whole section, the engineering floor, out through a
boardroom balcony door to the building on the Malé waterfront, and up through the clouds to the atolls where RoseWare works.
The sky follows the real time in Malé.

- Live site: https://mooonreader.github.io/roseware-stack/
- Previous versions: [/v4/](https://mooonreader.github.io/roseware-stack/v4/) (island world), [/v3/](https://mooonreader.github.io/roseware-stack/v3/) (the stack)

## How it is built

- `tools/building/build.py` models the building in Blender (bpy) from code: every floor, furniture, racks, plant, facade.
- `.github/workflows/bake.yml` bakes global-illumination lightmaps with Cycles, one floor per runner, and commits
  `assets/building/<floor>.glb` + `lm_<floor>.jpg` (meshopt compressed).
- The page (three.js) swaps in web materials, cuts the building with a moving section plane (hatched poché caps and a red
  section line), animates the screens, and poses the people bone by bone (sitting, typing, talking, walking).
- People: Mixamo X Bot. Skies and PBR textures: Poly Haven (CC0), fetched by `tools/fetch_assets.py`.
- Satellite lagoon colours in v4: contains modified Copernicus Sentinel data (2023–2026), via Earth Search / AWS Open Data.
