import type { Dataset } from "../lib/artifacts";

export default function Home({ data }: { data: Dataset }) {
  return (
    <>
      <section className="hero">
        <div className="kicker">TerraTwin · global preview</div>
        <h1>
          <span>Explore similar landscapes worldwide</span>
        </h1>
        <p>
          Search a new global satellite-imagery reference index, then open an immediate picture
          modal for each visual match. Similarity is a starting point for exploration, not an
          exact location claim.
        </p>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <a className="btn primary" href="/photo">
            Find a place from a photo
          </a>
          <a className="btn ghost" href="/mars-samples">
            Browse Mars samples
          </a>
        </div>
      </section>

      <section className="grid grid-2" aria-label="TerraTwin overview">
        <div className="panel">
          <div className="kicker">Global reference search</div>
          <h2>Compare landscapes from a worldwide grid</h2>
          <p className="panel-sub">
            Results use satellite imagery references sampled across NaturalEarth land areas. Open a
            result card to see its picture modal without leaving the search.
          </p>
          <a className="btn" href="/photo">
            Search the reference index
          </a>
        </div>
        <div className="panel">
          <div className="kicker">Mars context</div>
          <h2>Read the story behind each Mars place</h2>
          <p className="panel-sub">
            Browse {data.mars.n_sites.toLocaleString("en-US")} places and {data.mars.n_samples.toLocaleString("en-US")} sample records from the supplied gallery.
          </p>
          <a className="btn" href="/mars-samples">
            Open the gallery
          </a>
        </div>
      </section>

      <div className="panel">
        <div className="kicker">What is here</div>
        <p style={{ margin: 0, color: "var(--ink-2)" }}>
          A global satellite-reference index, immediate picture modals, a Mars sample gallery, and
          an Explore view. The original terrainML records remain limited to Egypt&apos;s Western Desert.
        </p>
      </div>
    </>
  );
}
