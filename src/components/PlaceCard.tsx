import { useState } from 'react';
import type { PlaceResult } from '../lib/world';
import { satelliteUrl } from '../lib/places';

export default function PlaceCard({ place, photoSrc, photoName }: { place: PlaceResult; photoSrc?: string; photoName?: string }) {
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);
  const lat = `${Math.abs(place.lat).toFixed(4)}° ${place.lat >= 0 ? 'N' : 'S'}`;
  const lon = `${Math.abs(place.lon).toFixed(4)}° ${place.lon >= 0 ? 'E' : 'W'}`;
  const url = place.image || satelliteUrl(place.lat, place.lon);
  const c = place.compare;
  return (
    <section className="place-card" aria-live="polite">
      <div className="place-heading">
        <div>
          <div className="kicker">Result #{place.rank}</div>
          <h2>{place.country}</h2>
          <p>{place.continent} · {lat} · {lon}</p>
        </div>
        <span className="match-score">{Math.round(place.score * 100)}<small>overall match / 100</small></span>
      </div>

      {/* Your picture and the matched place, side by side */}
      <div className="side-by-side">
        <figure>
          {photoSrc ? <img src={photoSrc} alt={photoName ?? 'Your picture'} /> : <div className="sbs-empty">Your picture</div>}
          <figcaption>Your picture</figcaption>
        </figure>
        <figure>
          <img src={url} alt={`Satellite view of ${place.country}, ${lat}, ${lon}`} onLoad={() => setLoaded(true)} onError={() => setFailed(true)} style={{ display: failed ? 'none' : 'block' }} />
          {!loaded && !failed && <div className="sbs-empty">Loading picture…</div>}
          {failed && <div className="sbs-empty">Picture unavailable</div>}
          <figcaption>This place (satellite)</figcaption>
        </figure>
      </div>

      {c && (
        <>
          <div className="best-strip">
            <div><span>Best at</span><b>{c.best.label}</b><em>{c.best.match}%</em></div>
            <div><span>Weakest</span><b>{c.weakest.label}</b><em>{c.weakest.match}%</em></div>
          </div>
          <table className="feature-table">
            <thead>
              <tr><th>Feature</th><th>Your picture</th><th>This place</th><th>Match</th></tr>
            </thead>
            <tbody>
              {c.rows.map((r) => (
                <tr key={r.key} className={r.key === c.best.key ? 'is-best' : undefined}>
                  <td><b>{r.label}</b><small>{r.hint}</small></td>
                  <td>{r.swatch ? <i className="swatch" style={{ background: r.swatch[0] }} /> : null}{r.photo}</td>
                  <td>{r.swatch ? <i className="swatch" style={{ background: r.swatch[1] }} /> : null}{r.place}</td>
                  <td>
                    <div className="match-bar" role="img" aria-label={`${r.match} percent`}>
                      <span style={{ width: `${r.match}%`, background: r.match >= 75 ? '#ef4444' : r.match >= 50 ? '#f97316' : '#eab308' }} />
                    </div>
                    <b className="match-num">{r.match}%</b>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}

      {place.slope != null && (
        <div className="place-facts"><span>{place.slope.toFixed(1)}° measured slope</span>{place.roughness != null && <span>{place.roughness.toFixed(1)} m roughness</span>}</div>
      )}
      <a className="btn primary" target="_blank" rel="noopener noreferrer" href={`https://www.google.com/maps?q=${place.lat},${place.lon}&t=k`}>Open this place on a map</a>
      <p className="caption-muted">Visual similarity, not a confirmed photo location.</p>
      <div className="image-credit">
        {place.layer === 'bluemarble' ? 'Blue Marble composite via EOX.' : 'Sentinel-2 cloudless 2023 by EOX · modified Copernicus Sentinel data · CC BY-NC-SA 4.0.'}
      </div>
    </section>
  );
}
