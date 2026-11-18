"""Fetch real OpenStreetMap geometry for key Maldivian islands and write compact JSON files.
data/osm.json  - original format (kept for older builds)
data/osm2.json - typed buildings, typed roads, bridges (incl. under construction), inhabited places and resorts
Map data (c) OpenStreetMap contributors, ODbL."""
import json, math, time, urllib.request, urllib.parse, os, sys
REGIONS = {
  'male':  (4.150, 73.415, 4.262, 73.560),
  'kulhu': (6.600, 73.040, 6.645, 73.090),
  'fuva':  (-0.338, 73.400, -0.262, 73.460),
  'addu':  (-0.722, 73.075, -0.575, 73.245),
}
MV = (-0.75, 72.55, 7.15, 73.80)
MIRRORS = ['https://overpass-api.de/api/interpreter','https://overpass.kumi.systems/api/interpreter','https://overpass.private.coffee/api/interpreter','https://maps.mail.ru/osm/tools/overpass/api/interpreter']
def run(q):
    for attempt in range(8):
        url=MIRRORS[attempt%len(MIRRORS)]
        try:
            req=urllib.request.Request(url,data=urllib.parse.urlencode({'data':q}).encode(),headers={'User-Agent':'roseware-stack-concept/1.1'})
            with urllib.request.urlopen(req,timeout=300) as r: return json.loads(r.read())
        except Exception as ex:
            print('retry',url,ex,file=sys.stderr); time.sleep(10+attempt*10)
    raise SystemExit('overpass failed')
def fetch(b):
    s,w,n,e=b; bb=f'{s},{w},{n},{e}'
    return run(f'''[out:json][timeout:240];(
way["building"]({bb});way["building:part"]({bb});way["highway"]({bb});way["man_made"="bridge"]({bb});way["aeroway"~"runway|taxiway|apron"]({bb});
way["place"~"island|islet"]({bb});relation["place"~"island|islet"]({bb});way["natural"="coastline"]({bb});
way["amenity"="hospital"]({bb});way["healthcare"="hospital"]({bb});way["leisure"~"park|pitch|stadium|garden"]({bb});way["landuse"~"grass|forest|farmland|orchard|meadow"]({bb});way["natural"~"wood|scrub"]({bb});
way["amenity"="place_of_worship"]({bb});
);out tags geom;''')
def rdp(P,tol):
    if len(P)<3: return P
    a,b=P[0],P[-1];dx,dy=b[0]-a[0],b[1]-a[1];L=math.hypot(dx,dy);md,mi=0,0
    for i in range(1,len(P)-1):
        d=math.hypot(P[i][0]-a[0],P[i][1]-a[1]) if L<1e-9 else abs(dy*P[i][0]-dx*P[i][1]+b[0]*a[1]-b[1]*a[0])/L
        if d>md: md,mi=d,i
    if md>tol: return rdp(P[:mi+1],tol)[:-1]+rdp(P[mi:],tol)
    return [a,b]
def ring_simplify(P,tol):
    if P[0]==P[-1]: P=P[:-1]
    if len(P)<4: return P
    far=max(range(len(P)),key=lambda i:(P[i][0]-P[0][0])**2+(P[i][1]-P[0][1])**2)
    A=rdp(P[:far+1],tol);B=rdp(P[far:]+[P[0]],tol)
    return A[:-1]+B[:-1]
def area(P): return 0.5*sum(P[i][0]*P[(i+1)%len(P)][1]-P[(i+1)%len(P)][0]*P[i][1] for i in range(len(P)))
def stitch(lines):
    lines=[l[:] for l in lines if len(l)>1];rings=[]
    while lines:
        cur=lines.pop();changed=True
        while changed and cur[0]!=cur[-1]:
            changed=False
            for i,l in enumerate(lines):
                if l[0]==cur[-1]: cur+=l[1:];lines.pop(i);changed=True;break
                if l[-1]==cur[-1]: cur+=l[::-1][1:];lines.pop(i);changed=True;break
                if l[-1]==cur[0]: cur=l+cur[1:];lines.pop(i);changed=True;break
                if l[0]==cur[0]: cur=l[::-1]+cur[1:];lines.pop(i);changed=True;break
        if cur[0]==cur[-1] and len(cur)>3: rings.append(cur)
    return rings
def num(v):
    try: return float(str(v).replace(',','.').split()[0].rstrip('m'))
    except: return None
RES={'apartments','residential','house','detached','terrace','dormitory','semidetached_house','flats'}
COM={'commercial','office','retail','hotel','shop','supermarket','mall','kiosk'}
PUB={'public','government','hospital','school','university','college','mosque','civic','religious','stadium','fire_station','police','courthouse','train_station','transportation','kindergarten'}
IND={'industrial','warehouse','storage_tank','hangar','service','garage','garages','shed','roof','power','utility'}
def bkind(t):
    b=t.get('building') or 'yes'
    if b=='construction' or t.get('construction'): return 5
    if t.get('amenity') in ('hospital','school','place_of_worship','townhall','police') or b in PUB: return 3
    if b in RES: return 1
    if b in COM or 'shop' in t or t.get('tourism')=='hotel': return 2
    if b in IND: return 4
    return 0
MAJOR={'motorway','trunk','primary','secondary','motorway_link','trunk_link','primary_link','secondary_link'}
MINOR={'tertiary','tertiary_link','residential','unclassified','living_street','road'}
SKIP={'footway','steps','path','corridor','elevator','proposed','platform','bridleway','cycleway'}
out={'attribution':'Map data (c) OpenStreetMap contributors, ODbL','regions':{}}
out2={'attribution':'Map data (c) OpenStreetMap contributors, ODbL','regions':{}}
for name,b in REGIONS.items():
    data=fetch(b); time.sleep(3)
    s,w,n,e=b;lat0=(s+n)/2;lon0=(w+e)/2;kx=111320*math.cos(math.radians(lat0));ky=110574
    M=lambda g:[(round((p['lon']-lon0)*kx,1),round((p['lat']-lat0)*ky,1)) for p in g]
    F=lambda Q:[c for p in Q for c in (round(p[0]),round(p[1]))]
    R={'o':[lon0,lat0],'isl':[],'bld':[],'rd':[],'rw':[],'hosp':[],'green':[]}
    R2={'o':[lon0,lat0],'isl':[],'bd':[],'rd':[],'br':[],'brA':[],'rw':[],'hosp':[],'green':[],'mosq':[]}
    coast=[];islands=[]
    for el in data.get('elements',[]):
        t=el.get('tags',{})
        if el['type']=='relation':
            outers=[M(m['geometry']) for m in el.get('members',[]) if m.get('role')=='outer' and m.get('geometry')]
            islands+=stitch(outers);continue
        g=el.get('geometry')
        if not g: continue
        P=M(g);closed=len(P)>3 and P[0]==P[-1]
        if t.get('man_made')=='bridge' and closed:
            Q=ring_simplify(P,1.0)
            if len(Q)>=3: R2['brA'].append({'n':t.get('name:en') or t.get('name',''),'p':F(Q)})
            continue
        if ('building' in t or 'building:part' in t) and closed:
            h=0;lv=0
            hh=num(t.get('height'));ll=num(t.get('building:levels'));rl=num(t.get('roof:levels')) or 0
            if hh: h=hh
            elif ll: h=(ll+rl*.5)*3.2;lv=ll
            if ll: lv=ll
            Q=ring_simplify(P,0.7)
            if len(Q)>=3 and abs(area(Q))>8:
                Q=Q[:16];k=bkind(t)
                if 'building' in t: R['bld'].append([round(h,1)]+F(Q))
                mh=num(t.get('min_height')) or ((num(t.get('building:min_level')) or 0)*3.2)
                R2['bd'].append([round(h,1),k+(10 if 'building:part' in t and 'building' not in t else 0),round(mh or 0,1)]+F(Q))
            if t.get('amenity')=='hospital' or t.get('healthcare')=='hospital':
                R['hosp'].append(F(Q));R2['hosp'].append(F(Q))
            if t.get('amenity')=='place_of_worship' and t.get('religion','muslim')=='muslim':
                c=[sum(p[0] for p in Q)/len(Q),sum(p[1] for p in Q)/len(Q)];R2['mosq'].append([round(c[0]),round(c[1]),round(math.sqrt(abs(area(Q))))])
        elif t.get('amenity')=='hospital' or t.get('healthcare')=='hospital':
            if closed: Q=ring_simplify(P,1.5);R['hosp'].append(F(Q));R2['hosp'].append(F(Q))
        elif 'highway' in t:
            hw=t['highway']
            if hw in SKIP: continue
            isbr=t.get('bridge') not in (None,'no') or t.get('man_made')=='bridge'
            con=hw=='construction'
            sub=t.get('construction','') if con else hw
            if isbr and name=='male':
                wd=num(t.get('width')) or (16 if sub in MAJOR else 9)
                R2['br'].append({'n':t.get('name:en') or t.get('name',''),'c':1 if con else 0,'h':sub,'w':round(wd,1),'l':num(t.get('layer')) or 1,'p':F(rdp(P,0.8))})
                continue
            if con: continue
            Q=rdp(P,1.5)
            if not isbr: R['rd'].append(F(Q))
            cls=0 if hw in MAJOR else 1 if hw in MINOR else 2
            if not isbr: R2['rd'].append([cls]+F(Q))
        elif 'aeroway' in t:
            wd=num(t.get('width')) or 45
            Q=rdp(P,2);row=[t['aeroway'],round(wd)]+F(Q);R['rw'].append(row);R2['rw'].append(row)
        elif t.get('natural')=='coastline': coast.append(P)
        elif 'place' in t and closed: islands.append(P)
        elif closed and (('leisure' in t) or ('landuse' in t) or t.get('natural') in ('wood','scrub')):
            Q=ring_simplify(P,2)
            if len(Q)>=3: R['green'].append(F(Q));R2['green'].append(F(Q))
    rings=stitch(coast)+islands;kept=[]
    for P in rings:
        Q=ring_simplify(P,3.0)
        if len(Q)<3: continue
        A=abs(area(Q));cx=sum(p[0] for p in Q)/len(Q);cy=sum(p[1] for p in Q)/len(Q)
        if A<400: continue
        if any(abs(k[1]-A)<0.25*max(A,k[1]) and math.hypot(k[2]-cx,k[3]-cy)<60 for k in kept): continue
        kept.append((Q,A,cx,cy))
    R['isl']=[F(Q) for Q,A,cx,cy in kept];R2['isl']=R['isl']
    print(name,{k:len(v) for k,v in R2.items() if isinstance(v,list)})
    out['regions'][name]=R;out2['regions'][name]=R2
# inhabited islands and resorts across the whole country, for night lights
s,w,n,e=MV;bb=f'{s},{w},{n},{e}'
pl=run(f'''[out:json][timeout:180];(node["place"~"city|town|village"]({bb});node["tourism"="resort"]({bb});way["tourism"="resort"]({bb});node["leisure"="resort"]({bb});way["leisure"="resort"]({bb}););out center tags;''')
places=[]
for el in pl.get('elements',[]):
    t=el.get('tags',{});lat=el.get('lat') or (el.get('center') or {}).get('lat');lon=el.get('lon') or (el.get('center') or {}).get('lon')
    if lat is None: continue
    kind='resort' if (t.get('tourism')=='resort' or t.get('leisure')=='resort') else t.get('place','village')
    pop=num(t.get('population')) or 0
    places.append([round(lon,5),round(lat,5),kind,int(pop),t.get('name:en') or t.get('name','')])
out2['places']=places
print('places',len(places))
os.makedirs('data',exist_ok=True)
json.dump(out,open('data/osm.json','w'),separators=(',',':'))
json.dump(out2,open('data/osm2.json','w'),separators=(',',':'))
print('bytes',os.path.getsize('data/osm.json'),os.path.getsize('data/osm2.json'))
