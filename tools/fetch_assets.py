"""Download CC0 skies and PBR textures from Poly Haven (polyhaven.com, CC0) and prepare web-sized files.
Output: assets/sky/<slot>.jpg (4k equirect, tone-mapped), assets/sky/<slot>_env.hdr (1k RGBE), assets/tex/<slot>_{diff,nor,rough}.jpg, assets/index.json"""
import json, os, sys, time, requests, numpy as np, cv2
API='https://api.polyhaven.com'
H={'User-Agent':'roseware-stack-concept/1.0 (github.com/mooonreader/roseware-stack)'}
def get(u,**k):
    for a in range(5):
        try:
            r=requests.get(u,headers=H,timeout=180,**k);r.raise_for_status();return r
        except Exception as e:
            print('retry',u,e,flush=True);time.sleep(5+a*5)
    raise SystemExit('failed '+u)
os.makedirs('assets/sky',exist_ok=True);os.makedirs('assets/tex',exist_ok=True)
hdris=get(API+'/assets?t=hdris').json();texs=get(API+'/assets?t=textures').json()
print('HDRI sky ids:',', '.join(sorted(k for k,v in hdris.items() if 'skies' in v.get('categories',[])))[:6000],flush=True)
def pick(pool,prefs,words,cat=None):
    for p in prefs:
        if p in pool:return p
    for k,v in sorted(pool.items(),key=lambda kv:-kv[1].get('download_count',0)):
        if cat and cat not in v.get('categories',[]):continue
        t=' '.join([k]+v.get('tags',[])+v.get('categories',[])).lower()
        if all(w in t for w in words):return k
    return None
SKIES={
 'day':(['kloofendal_48d_partly_cloudy_puresky','qwantani_puresky','kloofendal_28d_misty_puresky','syferfontein_0d_clear_puresky','rustig_koppie_puresky','kloofendal_43d_clear_puresky'],['puresky']),
 'golden':(['belfast_sunset_puresky','qwantani_dusk_2_puresky','qwantani_sunset_puresky','kloofendal_misty_morning_puresky','spaichingen_hill','industrial_sunset_puresky','venice_sunset'],['sunset']),
 'night':(['qwantani_night_puresky','kloppenheim_07_puresky','rogland_clear_night','dikhololo_night','satara_night','moonless_golf'],['night']),
}
idx={'credits':'Skies and textures: Poly Haven (polyhaven.com), CC0','sky':{},'tex':{}}
def tonemap(x,exp):
    x=x*exp;a,b,c,d,e=2.51,.03,2.43,.59,.14;y=np.clip((x*(a*x+b))/(x*(c*x+d)+e),0,1);return np.power(y,1/2.2)
for slot,(prefs,words) in SKIES.items():
    aid=pick(hdris,prefs,words,'skies') or pick(hdris,prefs,words)
    print('sky',slot,'->',aid,flush=True)
    if not aid:continue
    f=get(f'{API}/files/{aid}').json()['hdri'];res='4k' if '4k' in f else sorted(f)[-1]
    open('/tmp/s.hdr','wb').write(get(f[res]['hdr']['url']).content)
    im=cv2.imread('/tmp/s.hdr',cv2.IMREAD_ANYDEPTH|cv2.IMREAD_COLOR).astype(np.float32)  # BGR float
    lum=im[...,0]*.0722+im[...,1]*.7152+im[...,2]*.2126
    h,w=lum.shape;blur=cv2.GaussianBlur(lum,(0,0),3);y,x=np.unravel_index(np.argmax(blur),blur.shape)
    phi=(x+.5)/w*2*np.pi;theta=(y+.5)/h*np.pi  # equirect: u=0 at -x? three: u=atan2(z,x)/(2pi)+.5
    med=float(np.median(lum[:h//2]));exp=.18/max(med,1e-4)
    big=cv2.resize(im,(4096,2048),interpolation=cv2.INTER_AREA);ldr=(tonemap(big,exp)*255).astype(np.uint8)
    cv2.imwrite(f'assets/sky/{slot}.jpg',ldr,[cv2.IMWRITE_JPEG_QUALITY,88,cv2.IMWRITE_JPEG_PROGRESSIVE,1])
    cv2.imwrite(f'assets/sky/{slot}_lo.jpg',cv2.resize(ldr,(2048,1024),interpolation=cv2.INTER_AREA),[cv2.IMWRITE_JPEG_QUALITY,85])
    env=cv2.resize(im,(1024,512),interpolation=cv2.INTER_AREA);cv2.imwrite(f'assets/sky/{slot}_env.hdr',env)
    idx['sky'][slot]={'id':aid,'author':','.join(hdris[aid].get('authors',{}).keys()),'sun_px':[int(x),int(y)],'size':[w,h],'exposure':exp,'median':med,'peak':float(blur.max())}
TEX={
 'plaster':(['white_plaster_02','painted_plaster_wall','plastered_wall_02','plastered_wall_04','beige_wall_001'],['plaster']),
 'coral':(['coral_fort_wall_01','coral_fort_wall_02','coral_stone_wall','castle_wall_slates','rough_block_wall'],['coral']),
 'wood':(['weathered_planks','wood_planks','brown_planks_03','old_planks_02','wood_planks_grey'],['planks']),
 'sand':(['coast_sand_01','coast_sand_05','aerial_beach_01','sand_01','coast_sand_rocks_02'],['sand']),
 'concrete':(['concrete_floor_worn_001','concrete_floor_02','concrete_floor_painted','grey_concrete'],['concrete','floor']),
 'metal':(['metal_plate','metal_plate_02','blue_metal_plate','metal_grate_rusty'],['metal','plate']),
 'marble':(['marble_01','white_marble_03','marble_tiles'],['marble']),
 'grass':(['aerial_grass_rock','grass_path_2','forest_ground_04','brown_mud_leaves_01'],['grass']),
 'stone':(['rock_boulder_dry','rocks_ground_05','aerial_rocks_02','gravel_concrete'],['rock']),
}
MAP={'diff':['Diffuse','diff'],'nor':['nor_gl'],'rough':['Rough','rough'],'ao':['AO','ao'],'arm':['arm']}
for slot,(prefs,words) in TEX.items():
    aid=pick(texs,prefs,words);print('tex',slot,'->',aid,flush=True)
    if not aid:continue
    f=get(f'{API}/files/{aid}').json();got={}
    for k,names in MAP.items():
        for n in names:
            if n in f:
                r=f[n].get('2k' if slot in ('plaster','coral','wood','sand') else '1k') or f[n].get('1k')
                if r and 'jpg' in r:
                    open(f'assets/tex/{slot}_{k}.jpg','wb').write(get(r['jpg']['url']).content);got[k]=1;break
    idx['tex'][slot]={'id':aid,'maps':sorted(got)}
json.dump(idx,open('assets/index.json','w'),indent=1);print(json.dumps(idx,indent=1))
