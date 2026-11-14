import { haversineKm } from './artifacts';
import { compareWorld, type FeatureSummary } from './features';

export interface WorldSite {
  id: string; lat: number; lon: number; country: string; continent: string;
  name: string; image: string; features: number[]; layer: string; bbox: string;
}
export interface WorldIndex {
  version: number; count: number; countries: number; continents: string[];
  scope: string; grid_degrees: number; source: string; sites: WorldSite[];
}
export interface PlaceResult {
  id:string; lat:number; lon:number; name:string; country:string; continent:string;
  image:string; rank:number; score:number; source:'world'|'terrain';
  slope?:number; roughness?:number; layer?:string;
  /** measured side-by-side feature comparison for this result */
  compare?:FeatureSummary;
}
export async function loadWorldIndex():Promise<WorldIndex> {
  const r=await fetch('/world/index.json');
  if(!r.ok||!r.headers.get('content-type')?.includes('json'))throw new Error('Worldwide pictures are still being prepared. Try again shortly.');
  const index=await r.json() as WorldIndex;
  if(!Array.isArray(index.sites)||index.count!==index.sites.length||index.sites.length===0)throw new Error('Worldwide reference data is incomplete.');
  for(const s of index.sites) {
    if(!Number.isFinite(s.lat)||!Number.isFinite(s.lon)||!Array.isArray(s.features)||s.features.length!==13||s.features.some(x=>!Number.isFinite(x))||!/^\/world\/images\/w_[a-f0-9]+\.jpg$/.test(s.image))throw new Error('Invalid worldwide image record.');
  }
  return index;
}
/** Same 64-pixel descriptor as build_world_index.py; values measured, not fabricated. */
export async function visualSignature(src:string,excludeSky=false):Promise<number[]> {
  const image=await new Promise<HTMLImageElement>((resolve,reject)=>{
    const im=new Image();im.crossOrigin='anonymous';im.onload=()=>resolve(im);im.onerror=()=>reject(new Error('That picture could not be opened. Try JPG, PNG or WebP.'));im.src=src;
  });
  if(image.naturalWidth*image.naturalHeight>40_000_000)throw new Error('This picture is too large to analyse safely. Resize it below 40 megapixels.');
  const canvas=document.createElement('canvas');canvas.width=64;canvas.height=64;
  const ctx=canvas.getContext('2d',{willReadFrequently:true});if(!ctx)throw new Error('Image processing is unavailable in this browser.');
  const top=excludeSky?Math.floor(image.naturalHeight*.25):0;
  ctx.drawImage(image,0,top,image.naturalWidth,image.naturalHeight-top,0,0,64,64);
  const px=ctx.getImageData(0,0,64,64).data;
  const gray=new Float64Array(4096);const rgb=[0,0,0];const hist=Array(8).fill(0);
  let sum=0,sum2=0;
  for(let i=0;i<4096;i++) {
    const r=px[i*4]/255,g=px[i*4+1]/255,b=px[i*4+2]/255;
    rgb[0]+=r;rgb[1]+=g;rgb[2]+=b;
    const v=.2126*r+.7152*g+.0722*b;gray[i]=v;sum+=v;sum2+=v*v;hist[Math.min(7,Math.floor(v*8))]++;
  }
  let vertical=0,horizontal=0;
  for(let y=0;y<64;y++)for(let x=0;x<64;x++) {
    const i=y*64+x;if(y<63)vertical+=Math.abs(gray[i+64]-gray[i]);if(x<63)horizontal+=Math.abs(gray[i+1]-gray[i]);
  }
  return [...rgb.map(v=>v/4096),Math.sqrt(Math.max(0,sum2/4096-(sum/4096)**2)),(vertical+horizontal)/(2*64*63),...hist.map(v=>v/4096)];
}
export function matchWorld(index:WorldIndex,query:number[],continent='All',diverse=true):PlaceResult[] {
  const pool=index.sites.filter(s=>continent==='All'||s.continent===continent);
  const scored=pool.map(site=>{
    const c=Math.sqrt(site.features.slice(0,3).reduce((a,v,i)=>a+(v-query[i])**2,0)/3);
    const hist=site.features.slice(5).reduce((a,v,i)=>a+Math.abs(v-query[i+5]),0)/2;
    const texture=Math.abs(site.features[3]-query[3])*1.5+Math.abs(site.features[4]-query[4])*2;
    const distance=c*.45+hist*.35+texture*.2;
    return {site,distance};
  }).sort((a,b)=>a.distance-b.distance);
  const chosen:PlaceResult[]=[];const counts=new Map<string,number>();
  for(const {site,distance} of scored) {
    if(diverse&&(counts.get(site.country)??0)>=2)continue;
    if(chosen.some(s=>haversineKm(s,site)<100))continue;
    counts.set(site.country,(counts.get(site.country)??0)+1);
    chosen.push({id:site.id,lat:site.lat,lon:site.lon,name:site.name,country:site.country,continent:site.continent,image:site.image,rank:chosen.length+1,score:Math.max(0,Math.min(.99,1-distance)),source:'world',layer:site.layer,compare:compareWorld(query,site.features)});
    if(chosen.length>=18)break;
  }
  return chosen;
}
