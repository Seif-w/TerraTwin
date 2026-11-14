import type { Dataset, MarsSite } from "../lib/artifacts";

export default function MarsSamples({ data }: { data: Dataset }) {
  return (
    <>
      <section className="hero">
        <div className="kicker">Mars samples</div>
        <h1>
          Places, rocks, and <span>sample stories</span>
        </h1>
        <p>
          Browse the supplied Mars sample places, then use any card to start a visual Earth-place
          search.
        </p>
      </section>

      <div className="grid grid-3">
        {data.mars.sites.map((site) => (
          <SiteCard key={site.key} site={site} />
        ))}
      </div>

      <details className="panel" style={{ marginTop: 18 }}>
        <summary style={{ cursor: "pointer", color: "var(--ink-2)" }}>Image and data credits</summary>
        <p className="panel-sub" style={{ marginTop: 12 }}>
          {data.mars.photo_credit}. Source: {data.mars.source}.
        </p>
      </details>
    </>
  );
}

function SiteCard({ site }: { site: MarsSite }) {
  return (
    <article className="panel" style={{ padding: 0, overflow: "hidden" }}>
      <img
        src={site.photo}
        alt={`${site.title}: ${site.rock}`}
        loading="lazy"
        style={{ display: "block", width: "100%", height: 170, objectFit: "cover" }}
      />
      <div style={{ padding: 16 }}>
        <div className="kicker">{site.region}</div>
        <h2>{site.title}</h2>
        <p style={{ margin: "0 0 8px", color: "var(--cyan)", fontWeight: 600 }}>{site.rock}</p>
        <p className="panel-sub">{site.story}</p>
        <p className="provenance" style={{ margin: "0 0 12px" }}>
          Sol {site.sol} · {site.date}
        </p>
        <div style={{ marginBottom: 14 }}>
          <div className="kicker" style={{ marginBottom: 4 }}>Collected samples</div>
          <ul className="list" style={{ marginTop: 0 }}>
            {site.samples.map((sample) => (
              <li key={sample.designation}>
                {sample.name} <span className="provenance">({sample.designation})</span>
              </li>
            ))}
          </ul>
        </div>
        <a className="btn primary" href={`/photo?sample=${encodeURIComponent(site.key)}`}>
          Find its Earth match
        </a>
        <p className="provenance" style={{ margin: "10px 0 0", fontSize: 10.5 }}>
          Photo: {site.figure}
        </p>
      </div>
    </article>
  );
}
