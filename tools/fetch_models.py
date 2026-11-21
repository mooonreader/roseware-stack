"""Fetch CC0 3D models (glTF, 1k textures) from Poly Haven. Output: assets/models/<id>/..., assets/models/index.json"""
import json,os,time,requests
API='https://api.polyhaven.com';H={'User-Agent':'roseware-stack-concept/1.0'}
def get(u):
    for a in range(5):
        try:
            r=requests.get(u,headers=H,timeout=120);r.raise_for_status();return r
        except Exception as e: print('retry',u,e,flush=True);time.sleep(4+a*4)
    raise SystemExit('failed '+u)
allm=get(API+'/assets?t=models').json()
print('ALL MODELS:',', '.join(sorted(allm.keys())),flush=True)
want=[k for k in allm if any(w in k for w in ['potted_plant','plant','chair','sofa','armchair','desk','table','lamp','monstera','ficus','bench','shelf','cabinet','coffee','office','monitor','keyboard','laptop','book','vase','rug'])]
print('CANDIDATES:',want,flush=True)
pref=['potted_plant_01','potted_plant_02','potted_plant_04','ficus','modern_arm_chair_01','ArmChair_01','Sofa_01','sofa_02','GreenChair_01','coffee_table_round_01','WoodenTable_01','desk_lamp_arm_01','potted_plant_03']
pick=[p for p in pref if p in allm]+[w for w in want if w not in pref][:6]
os.makedirs('assets/models',exist_ok=True);idx={}
for aid in pick[:14]:
    f=get(f'{API}/files/{aid}').json();g=f.get('gltf',{});res=g.get('1k') or g.get(sorted(g)[0] if g else None)
    if not res: continue
    m=res['gltf'];d=f'assets/models/{aid}';os.makedirs(d,exist_ok=True)
    open(f'{d}/{aid}.gltf','wb').write(get(m['url']).content)
    for rel,info in m.get('include',{}).items():
        p=os.path.join(d,rel);os.makedirs(os.path.dirname(p),exist_ok=True);open(p,'wb').write(get(info['url']).content)
    idx[aid]={'name':allm[aid].get('name'),'categories':allm[aid].get('categories'),'authors':list(allm[aid].get('authors',{}).keys())};print('got',aid,flush=True)
json.dump(idx,open('assets/models/index.json','w'),indent=1)
