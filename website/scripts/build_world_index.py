"""Deterministic land-grid sampling; every visual feature is measured from real pixels.
Sources: Natural Earth countries (public domain), EOX Sentinel-2 cloudless2023
(CC BY-NC-SA4.0), Blue Marble fallback for places outside Sentinel coverage.
This is a sparse global IMAGE reference set, not invented global terrain statistics.
"""
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor, as_completed
from urllib.parse import urlencode
from io import BytesIO
import json,math,time,hashlib
import numpy as np
from PIL import Image
import requests
from shapely.geometry import shape,Point
from shapely.prepared import prep

ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'public/world';OUT.mkdir(exist_ok=True)
IMAGES=OUT/'images';IMAGES.mkdir(exist_ok=True)
previous_path=OUT/'index.json'
previous_layers={}
if previous_path.exists():
 previous_layers={s['id']:s.get('layer','') for s in json.loads(previous_path.read_text()).get('sites',[])}
SOURCE='https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_110m_admin_0_countries.geojson'
geo=OUT/'countries.geojson'
if not geo.exists():
 r=requests.get(SOURCE,timeout=40);r.raise_for_status();geo.write_bytes(r.content)
features=json.loads(geo.read_text())['features']
polygons=[]
for f in features:
 g=shape(f['geometry']);p=f['properties']
 polygons.append((g,prep(g),p.get('ADMIN',p.get('NAME','Land')),p.get('CONTINENT','Other')))

def country_at(lat,lon):
 point=Point(lon,lat)
 for g,pg,name,continent in polygons:
  if pg.contains(point):return name,continent
 return None

points={}
# Global systematic grid, plus an interior sample per country/cartographic unit.
for lat in range(-81,85,6):
 for lon in range(-177,180,6):
  found=country_at(lat,lon)
  if found:points[(float(lat),float(lon))]=found
for g,pg,name,continent in polygons:
 p=g.representative_point();lat,lon=round(p.y,4),round(p.x,4)
 points[(lat,lon)]=(name,continent)

# Small pure image signature shared with src/lib/world.ts.
def signature(im):
 a=np.array(im.resize((64,64),Image.Resampling.BILINEAR).convert('RGB'),dtype=float)/255
 gray=a[:,:,0]*.2126+a[:,:,1]*.7152+a[:,:,2]*.0722
 hist=np.histogram(gray,bins=8,range=(0,1))[0]/gray.size
 edge=(np.abs(gray[1:]-gray[:-1]).mean()+np.abs(gray[:,1:]-gray[:,:-1]).mean())/2
 return [round(float(x),6) for x in list(a.mean(axis=(0,1)))+[float(gray.std()),float(edge)]+list(hist)]

def fetch(point):
 (lat,lon),(country,continent)=point
 key='w_'+hashlib.sha1(f'{lat},{lon}'.encode()).hexdigest()[:12]
 path=IMAGES/(key+'.jpg')
 half=.07;dx=half/max(.15,math.cos(math.radians(lat)))
 bbox=f'{max(-180,lon-dx)},{max(-90,lat-half)},{min(180,lon+dx)},{min(90,lat+half)}'
 layer='s2cloudless-2023'
 if path.exists() and previous_layers.get(key):
  layer=previous_layers[key];im=Image.open(path).convert('RGB')
 else:
  time.sleep(.2)
  for attempt in range(2):
   try:
    params=dict(service='WMS',request='GetMap',version='1.1.1',layers=layer,styles='',srs='EPSG:4326',bbox=bbox,width=320,height=320,format='image/jpeg')
    r=requests.get('https://tiles.maps.eox.at/wms',params=params,timeout=18)
    r.raise_for_status();im=Image.open(BytesIO(r.content)).convert('RGB')
    arr=np.array(im)
    if arr.mean()<3 or arr.std()<1:
     layer='bluemarble';continue
    im.save(path,quality=84)
    break
   except Exception:
    if attempt==0:time.sleep(2)
    else:return None
  else:return None
 if np.asarray(im).std()<1:return None
 return dict(id=key,lat=lat,lon=lon,country=country,continent=continent,
  name=f'{country} · {abs(lat):.1f}°'+('N' if lat>=0 else 'S')+f', {abs(lon):.1f}°'+('E' if lon>=0 else 'W'),
  image='/world/images/'+path.name,features=signature(im),layer=layer,bbox=bbox)

print(f'Indexing {len(points)} real global land-image samples with 4 workers',flush=True)
results=[];failed=0
with ThreadPoolExecutor(max_workers=4) as pool:
 futures=[pool.submit(fetch,p) for p in points.items()]
 for i,f in enumerate(as_completed(futures),1):
  value=f.result()
  if value:results.append(value)
  else:failed+=1
  if i%40==0:print(f'{i}/{len(points)} complete · {len(results)} usable · {failed} skipped',flush=True)
results.sort(key=lambda x:x['id'])
metadata=dict(version=2,scope='Sparse worldwide land-image samples, not exhaustive photo geolocation.',
 grid_degrees=6,count=len(results),countries=len(set(x['country'] for x in results)),
 continents=sorted(set(x['continent'] for x in results)),failed=failed,
 source='EOX Sentinel-2 cloudless2023 satellite mosaic; Blue Marble fallback where available.',
 image_license='CC BY-NC-SA4.0 for Sentinel-2 cloudless; review before commercial use.',
 boundary_source=SOURCE,boundary_license='Natural Earth public domain',
 feature_order=['meanR','meanG','meanB','grayStd','edgeMean']+[f'grayBin{i}' for i in range(8)],
 sites=results)
(OUT/'index.json').write_text(json.dumps(metadata,separators=(',',':'))+'\n')
print(f'Finished: {len(results)} images; {metadata["countries"]} countries/cartographic units; continents={metadata["continents"]}',flush=True)
