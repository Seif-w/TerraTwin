import '../finder.css';
import { useEffect, useMemo, useRef, useState } from 'react';
import GlobeView from '../components/GlobeLazy';
import PlaceCard from '../components/PlaceCard';
import type { GlobePoint } from '../components/GlobeView';
import type { Dataset } from '../lib/artifacts';
import { matchPhoto, DEFAULT_WEIGHTS } from '../lib/match';
import { analysePhoto, type PhotoAnalysis } from '../lib/photo';
import { EARTH_TEXTURE, EARTH_BUMP } from '../lib/textures';
import { MATCH_COLORS, matchTier, nearbyPlace, satelliteUrl } from '../lib/places';
import { compareTerrain } from '../lib/features';
import { loadWorldIndex, visualSignature, matchWorld, type WorldIndex, type PlaceResult } from '../lib/world';

type Photo = {src:string;name:string;signature:number[];terrain:PhotoAnalysis};
export default function PhotoView({data}:{data:Dataset}) {
  const [photo,setPhoto]=useState<Photo|null>(null);
  const [working,setWorking]=useState(false);
  const [error,setError]=useState('');
  const [world,setWorld]=useState<WorldIndex|null>(null);
  const [worldError,setWorldError]=useState('');
  const [mode,setMode]=useState<'world'|'terrain'>('world');
  const [continent,setContinent]=useState('All');
  const [diverse,setDiverse]=useState(true);
  const [ignoreSky,setIgnoreSky]=useState(false);
  const [selected,setSelected]=useState<string|null>(null);
  const [minScore,setMinScore]=useState(0);
  const [preview,setPreview]=useState<PlaceResult|null>(null);
  const input=useRef<HTMLInputElement>(null);
  const dialog=useRef<HTMLDialogElement>(null);
  const seq=useRef(0);
  const objectUrl=useRef<string|null>(null);
  const alive=useRef(true);

  async function loadWorld() {
    setWorldError('');
    try {const value=await loadWorldIndex();if(alive.current)setWorld(value);}
    catch(e){if(alive.current)setWorldError(e instanceof Error?e.message:'Worldwide data could not be loaded.');}
  }
  async function run(src:string,name:string,sky=ignoreSky) {
    const token=++seq.current;
    setWorking(true);setError('');setSelected(null);setPreview(null);setMinScore(0);
    try {
      const [signature,terrain]=await Promise.all([visualSignature(src,sky),analysePhoto(src)]);
      if(alive.current&&token===seq.current)setPhoto({src,name,signature,terrain});
    } catch(e) {if(alive.current&&token===seq.current){setError(e instanceof Error?e.message:'Picture could not be opened.');setPhoto(null);}}
    finally {if(alive.current&&token===seq.current)setWorking(false);}
  }
  function useFile(file?:File) {
    if(!file)return;
    if(!['image/jpeg','image/png','image/webp'].includes(file.type)||file.size>12*1024*1024){seq.current++;setWorking(false);setError('Choose a JPG, PNG or WebP smaller than 12 MB.');return;}
    if(objectUrl.current)URL.revokeObjectURL(objectUrl.current);
    objectUrl.current=URL.createObjectURL(file);run(objectUrl.current,file.name);
  }
  useEffect(()=>{
    alive.current=true;loadWorld();
    const key=new URLSearchParams(location.search).get('sample');
    const sample=data.mars.sites.find(s=>s.key===key);if(sample)run(sample.photo_crop,sample.title);
    return()=>{alive.current=false;seq.current++;if(objectUrl.current)URL.revokeObjectURL(objectUrl.current);};
  },[data]);
  useEffect(()=>{
    const el=dialog.current;if(!el)return;
    if(preview&&!el.open)el.showModal();else if(!preview&&el.open)el.close();
  },[preview]);

  const ranked=useMemo<PlaceResult[]>(()=>{
    if(!photo)return [];
    if(mode==='world')return world?matchWorld(world,photo.signature,continent,diverse):[];
    return matchPhoto(data,photo.terrain,DEFAULT_WEIGHTS,{topK:18,minSpacingKm:12}).ranked.map(r=>({id:r.tile.id,lat:r.tile.lat,lon:r.tile.lon,name:nearbyPlace(r.tile,data.places).name,country:'Egypt',continent:'Africa',image:satelliteUrl(r.tile.lat,r.tile.lon,320),rank:r.rank,score:r.similarity,source:'terrain',slope:r.tile.sl,roughness:r.tile.rs,compare:compareTerrain(r.z)}));
  },[photo,world,mode,continent,diverse,data]);
  const results=useMemo(()=>ranked.filter(r=>r.score*100>=minScore),[ranked,minScore]);
  const chosen=results.find(r=>r.id===selected);
  const flags=useMemo<GlobePoint[]>(()=>results.map(r=>({lat:r.lat,lng:r.lon,id:r.id,rank:r.rank,label:r.country,detail:r.compare?`Best at ${r.compare.best.label.toLowerCase()} (${r.compare.best.match}%) · click for picture`:'Click to see this place picture',color:MATCH_COLORS[matchTier(r.rank)],selected:r.id===selected})),[results,selected]);
  const focus=useMemo(()=>chosen?{lat:chosen.lat,lng:chosen.lon,altitude:.85}:{lat:20,lng:10,altitude:1.8},[chosen]);
  function openPlace(place:PlaceResult){setSelected(place.id);setPreview(place);}

  return <div className="finder-page">
    <header className="finder-intro"><div className="kicker">Photo to place · Global preview 2</div><h1>Where on Earth looks like this?</h1><p>Choose a landscape. Compare real places. Click any flag to see its picture.</p></header>
    <section className="panel finder-upload" aria-label="Choose a picture">
      <button className="drop" onClick={()=>input.current?.click()} onDragOver={e=>e.preventDefault()} onDrop={e=>{e.preventDefault();useFile(e.dataTransfer.files[0]);}}><b>{working?'Comparing your picture…':'Choose or drop a picture'}</b><span>JPG, PNG, WebP · up to 12 MB · processed on your device</span></button>
      <input ref={input} type="file" hidden accept="image/jpeg,image/png,image/webp" onChange={e=>{useFile(e.target.files?.[0]);e.target.value='';}}/>
      {photo&&<div className="uploaded-mini"><img src={photo.src} alt={photo.name}/><div><b>{photo.name}</b><span>Ready to compare</span></div></div>}
      <details className="try-examples"><summary>Try a Mars or Earth example</summary><div className="example-row">{data.mars.sites.slice(0,4).map(s=><button key={s.key} onClick={()=>run(s.photo_crop,s.title)}><img src={s.photo_crop} alt={s.title}/><span>{s.title}</span></button>)}{data.samples.filter(s=>s.body==='Earth').map(s=><button key={s.file} onClick={()=>run(s.file,'Earth example')}><img src={s.file} alt="Earth example"/><span>Earth example</span></button>)}</div></details>
      {error&&<p className="errorbox" role="alert">{error}</p>}
    </section>
    <section className="finder-options" aria-label="Search options">
      <div className="segmented"><button className={mode==='world'?'active':''} onClick={()=>{setMode('world');setSelected(null);}}>Worldwide</button><button className={mode==='terrain'?'active':''} onClick={()=>{setMode('terrain');setSelected(null);}}>Your Egypt terrain data</button></div>
      {mode==='world'&&<label>Region <select value={continent} onChange={e=>{setContinent(e.target.value);setSelected(null);}}><option value="All">All regions</option>{world?.continents.map(c=><option key={c}>{c}</option>)}</select></label>}
      {mode==='world'&&<label className="check-option"><input type="checkbox" checked={diverse} onChange={e=>setDiverse(e.target.checked)}/>Spread results across countries</label>}
      <label className="check-option"><input type="checkbox" checked={ignoreSky} onChange={e=>{setIgnoreSky(e.target.checked);if(photo)run(photo.src,photo.name,e.target.checked);}}/>Ignore top 25% (sky)</label>
    </section>
    <p className="coverage-line">{mode==='world'?(world?`${world.count.toLocaleString()} reference pictures · ${world.countries} countries / map areas · sampled worldwide coverage`:'Loading worldwide reference pictures…'):`${data.tiles.length.toLocaleString()} measured terrain areas · Western Desert, Egypt only`}</p>
    {worldError&&mode==='world'&&<p className="errorbox" role="alert">{worldError} <button className="btn" onClick={loadWorld}>Retry</button></p>}
    <div className="finder-workspace">
      <section className="panel finder-map"><div className="map-heading"><h2>{photo?'Explore the flags':'World overview'}</h2><button className="btn ghost" onClick={()=>setSelected(null)}>World view</button></div><GlobeView texture={EARTH_TEXTURE} bumpTexture={EARTH_BUMP} flags={flags} focus={focus} autoRotate={0} height={390} label="Worldwide clickable result flags" onPointClick={p=>{const place=results.find(r=>r.id===p.id);if(place)openPlace(place);}}/><div className="flag-legend"><span><i style={{background:MATCH_COLORS.red}}/>Top 3</span><span><i style={{background:MATCH_COLORS.orange}}/>Next 5</span><span><i style={{background:MATCH_COLORS.yellow}}/>Next 10</span><span>Click = picture</span></div></section>
      <section className="panel finder-results"><div className="map-heading"><h2>{results.length?`${results.length} similar places`:'Your results'}</h2></div>
        {!photo&&<div className="empty-finder"><b>Start with a picture</b><p>Your matches and their real pictures will appear here.</p><button className="btn primary" onClick={()=>input.current?.click()}>Choose a picture</button></div>}
        {photo&&<label className="score-filter">Minimum visual score <b>{minScore}/100</b><input type="range" min="0" max="100" value={minScore} onChange={e=>setMinScore(Number(e.target.value))}/></label>}
        <div className="match-list">{results.map(r=><button key={r.id} className={`result-button ${selected===r.id?'selected':''}`} onClick={()=>openPlace(r)}><img className="result-thumb" src={r.image} alt={`Satellite view in ${r.country}`} loading="lazy"/><span className="result-description"><strong><i className="rank-dot" style={{background:MATCH_COLORS[matchTier(r.rank)]}}/>{r.rank}. {r.country}</strong><small>{r.continent} · {Math.abs(r.lat).toFixed(1)}°{r.lat>=0?'N':'S'}, {Math.abs(r.lon).toFixed(1)}°{r.lon>=0?'E':'W'}</small>{r.compare&&<span className="best-at">Best at {r.compare.best.label.toLowerCase()} · {r.compare.best.match}%</span>}<span className="preview-link">View picture & features →</span></span><b>{Math.round(r.score*100)}<small>/100</small></b></button>)}</div>
        {photo&&!working&&!results.length&&<p className="caption-muted">{world&&!worldError?'No results meet these filters. Try lowering the score or choosing all continents.':'Waiting for the worldwide index…'}</p>}
      </section>
    </div>
    <p className="caption-muted">Experimental visual similarity—not exact geolocation. Worldwide mode compares sampled satellite pictures; your uploaded terrain model still covers Egypt only.</p>
    <details className="privacy-details"><summary>Privacy, sources & limits</summary><p>Uploaded pictures are decoded in your browser and are not sent to a server. No account or location permission is required. The site loads bundled reference data and pictures; opening an external map shares that destination with the map provider. In the optional Egypt terrain mode, loading a live satellite picture also sends its view coordinates to EOX; your uploaded photo is never sent.</p><p>Worldwide imagery: EOX Sentinel-2 cloudless 2023, containing modified Copernicus Sentinel data, CC BY-NC-SA 4.0. Blue Marble where available beyond Sentinel coverage. Natural Earth boundaries: public domain. Sparse land sampling, not every place. Camera angle, lighting and scale can change results. Visual scores are not location confidence.</p></details>
    <dialog ref={dialog} aria-label="Selected place picture" className="place-dialog" onCancel={()=>setPreview(null)} onClose={()=>setPreview(null)} onClick={e=>{if(e.target===dialog.current)setPreview(null);}}><div className="dialog-inner"><button className="dialog-close btn" onClick={()=>setPreview(null)} autoFocus aria-label="Close place picture">Close ×</button>{preview&&<PlaceCard key={preview.id} place={preview} photoSrc={photo?.src} photoName={photo?.name}/>}</div></dialog>
  </div>;
}
