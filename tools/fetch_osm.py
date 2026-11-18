"""Fetch real OpenStreetMap geometry for key Maldivian islands and write a compact JSON file.
Map data (c) OpenStreetMap contributors, ODbL."""
import json, math, time, urllib.request, urllib.parse, os, sys
REGIONS = {
  'male':  (4.150, 73.470, 4.252, 73.560),
  'kulhu': (6.600, 73.040, 6.645, 73.090),
  'fuva':  (-0.338, 73.400, -0.262, 73.460),
  'addu':  (-0.722, 73.075, -0.575, 73.245),
}
MIRRORS = ['https://overpass-api.de/api/interpreter','https://overpass.kumi.systems/api/interpreter','https://overpass.private.coffee/api/interpreter','https://maps.mail.ru/osm/tools/overpass/api/interpreter']
def fetch(b):
    s,w,n,e=b; bb=f'{s},{w},{n},{e}'
    q=f'''[out:json][timeout:240];(
way["building"]({bb});way["highway"]({bb});way["aeroway"~"runway|taxiway|apron"]({bb});
way["place"~"island|islet"]({bb});relation["place"~"island|islet"]({bb});way["natural"="coastline"]({bb});
way["amenity"="hospital"]({bb});way["healthcare"="hospital"]({bb});way["leisure"~"park|pitch|stadium|garden"]({bb});way["landuse"~"grass|forest|farmland|orchard|meadow"]({bb});way["natural"~"wood|scrub"]({bb});
);out tags geom;'''
    for attempt in range(8):
        url=MIRRORS[attempt%len(MIRRORS)]
        try:
            req=urllib.request.Request(url,data=urllib.parse.urlencode({'data':q}).encode(),headers={'User-Agent':'roseware-stack-concept/1.0'})
            with urllib.request.urlopen(req,timeout=300) as r: return json.loads(r.read())
        except Exception as ex:
            print('retry',url,ex,file=sys.stderr); time.sleep(10+attempt*10)
    raise SystemExit('overpass failed')
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
out={'attribution':'Map data (c) OpenStreetMap contributors, ODbL','regions':{}}
for name,b in REGIONS.items():
    data=fetch(b); time.sleep(3)
    s,w,n,e=b;lat0=(s+n)/2;lon0=(w+e)/2;kx=111320*math.cos(math.radians(lat0));ky=110574
    M=lambda g:[(round((p['lon']-lon0)*kx,1),round((p['lat']-lat0)*ky,1)) for p in g]
    R={'o':[lon0,lat0],'isl':[],'bld':[],'rd':[],'rw':[],'hosp':[],'green':[]}
    coast=[];islands=[]
    for el in data.get('elements',[]):
        t=el.get('tags',{})
        if el['type']=='relation':
            outers=[M(m['geometry']) for m in el.get('members',[]) if m.get('role')=='outer' and m.get('geometry')]
            islands+=stitch(outers);continue
        g=el.get('geometry');
        if not g: continue
        P=M(g);closed=len(P)>3 and P[0]==P[-1]
        if 'building' in t and closed:
            h=0
            try:
                if 'height' in t: h=float(str(t['height']).split()[0])
                elif 'building:levels' in t: h=float(t['building:levels'])*3.2
            except: h=0
            Q=ring_simplify(P,0.7)
            if len(Q)>=3 and abs(area(Q))>8:
                Q=Q[:14];R['bld'].append([round(h,1)]+[c for p in Q for c in (round(p[0]),round(p[1]))])
            if t.get('amenity')=='hospital' or t.get('healthcare')=='hospital': R['hosp'].append([c for p in Q for c in (round(p[0]),round(p[1]))])
        elif ('amenity' in t and t['amenity']=='hospital') or t.get('healthcare')=='hospital':
            if closed: Q=ring_simplify(P,1.5);R['hosp'].append([c for p in Q for c in (round(p[0]),round(p[1]))])
        elif 'highway' in t:
            if t['highway'] in ('footway','steps','path','corridor','elevator','proposed','construction','platform'): continue
            Q=rdp(P,1.5);R['rd'].append([c for p in Q for c in (round(p[0]),round(p[1]))])
        elif 'aeroway' in t:
            try: wd=float(str(t.get('width','45')).split()[0])
            except: wd=45
            Q=rdp(P,2);R['rw'].append([t['aeroway'],round(wd)]+[c for p in Q for c in (round(p[0]),round(p[1]))])
        elif t.get('natural')=='coastline': coast.append(P)
        elif 'place' in t and closed: islands.append(P)
        elif closed and (('leisure' in t) or ('landuse' in t) or t.get('natural') in ('wood','scrub')):
            Q=ring_simplify(P,2);
            if len(Q)>=3: R['green'].append([c for p in Q for c in (round(p[0]),round(p[1]))])
    rings=stitch(coast)+islands;kept=[]
    for P in rings:
        Q=ring_simplify(P,3.0)
        if len(Q)<3: continue
        A=abs(area(Q));cx=sum(p[0] for p in Q)/len(Q);cy=sum(p[1] for p in Q)/len(Q)
        if A<400: continue
        if any(abs(k[1]-A)<0.25*max(A,k[1]) and math.hypot(k[2]-cx,k[3]-cy)<60 for k in kept): continue
        kept.append((Q,A,cx,cy))
    R['isl']=[[c for p in Q for c in (round(p[0]),round(p[1]))] for Q,A,cx,cy in kept]
    print(name,{k:len(v) for k,v in R.items() if isinstance(v,list)})
    out['regions'][name]=R
os.makedirs('data',exist_ok=True)
json.dump(out,open('data/osm.json','w'),separators=(',',':'))
print('bytes',os.path.getsize('data/osm.json'))
