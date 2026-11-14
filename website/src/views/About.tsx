import type { Dataset } from "../lib/artifacts";

/** عن صفحة المشروع: المصدر، والملكية، وشروط الاستخدام. كل رقم هنا مقروء من artifact. */
export default function About({ data }: { data: Dataset }) {
  const b = data.bodies;
  return (
    <>
      <section className="hero">
        <div className="kicker">about</div>
        <h1>
          TerraTwin: <span>a twin landscape on Earth</span> for every place we plan to visit
        </h1>
        <p>
          TerraTwin answers a practical question for Moon and Mars base planning: where on Earth can
          crews, rovers and instruments be tested in conditions that resemble the destination? Egypt's
          Western Desert is the case study because its 30 m topography, thermal data and published
          geomorphology make it the best-instrumented analogue region in North Africa.
        </p>
      </section>

      <div className="grid grid-2">
        <div className="panel">
          <h3>Provenance of every number on this site</h3>
          <table className="data">
            <thead>
              <tr>
                <th>artifact</th>
                <th className="num">rows</th>
                <th>role</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>
                  <code>/data/terratwin_ml_ranked.json</code>
                </td>
                <td className="num">{data.provenance.tileCount.toLocaleString("en-US")}</td>
                <td>scored tile table behind the globes, filters and rankings</td>
              </tr>
              <tr>
                <td>
                  <code>/data/ml_products.json</code>
                </td>
                <td className="num">1</td>
                <td>model metrics, importances, target signatures, interpretations</td>
              </tr>
              <tr>
                <td>
                  <code>/data/transferability_report.csv</code>
                </td>
                <td className="num">{data.transfer.length}</td>
                <td>cross-body calibration AUC, shipped verbatim from the pipeline</td>
              </tr>
              <tr>
                <td>
                  <code>/data/reference.json</code>
                </td>
                <td className="num">{Object.keys(data.reference.stats).length} stats</td>
                <td>pool quantiles and spreads used to standardise measurements</td>
              </tr>
              <tr>
                <td>
                  <code>/data/bodies.json</code>
                </td>
                <td className="num">{Object.keys(b.bodies).length} bodies</td>
                <td>per-body medians, DEM grids, CRS flags, named sites</td>
              </tr>
              <tr>
                <td>
                  <code>/data/photo_label_schema.json</code>
                </td>
                <td className="num">{data.schema.columns.length} fields</td>
                <td>the contract for the future learned photo model</td>
              </tr>
            </tbody>
          </table>
          <p className="panel-sub" style={{ marginTop: 10 }}>
            generated from {b.generated_from.join(" + ")} by <code>scripts/make_site_data.py</code>. Status
            string as exported: <code>{data.provenance.status}</code>. The site validates these files on load
            and refuses to render if a column or count is missing - no demo values are stored in the source.
          </p>
        </div>

        <div className="panel">
          <h3>Named sites and datasets</h3>
          <table className="data">
            <thead>
              <tr>
                <th>body</th>
                <th className="num">tiles</th>
                <th className="num">DEM (m)</th>
                <th>reference points used on the globes</th>
              </tr>
            </thead>
            <tbody>
              {Object.entries(b.bodies).map(([name, body]) => (
                <tr key={name}>
                  <td>{name}</td>
                  <td className="num">{body.tiles.toLocaleString("en-US")}</td>
                  <td className="num">{body.dem_grid_m}</td>
                  <td style={{ color: "var(--ink-2)" }}>
                    {(body.named_sites ?? [])
                      .map((s) => `${s.name} (${s.lat.toFixed(2)}, ${s.lon.toFixed(2)})`)
                      .join(" · ") ||
                      (body.named_context ?? [])
                        .map((s) => `${s.name} (${s.lat.toFixed(2)}, ${s.lon.toFixed(2)})`)
                        .join(" · ")}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="panel-sub" style={{ marginTop: 10 }}>
            Earth candidate pool: {b.bodies.Earth.region.join(", ")}. Site coordinates and selection rules
            are quoted in <code>bodies.json</code>; Mars and Moon tile centroids are stored in a local
            projected grid, so only documented site coordinates are plotted on those globes.
          </p>
        </div>
      </div>

      <div className="panel">
        <h3>Sources and citations</h3>
        <ul className="list">
          <li>
            Mars 2020 Initial Reports, Vol. 3 - Farley &amp; Stack (2024): Jezero delta-front units Melyn
            (749-22), Otis Peak (822-23) and Pilot Mountain (882-24) - the ground truth behind the
            archetype classes.
          </li>
          <li>
            NASA eCR 134306, Apollo S-200 Lunar Roving Vehicle soil-mechanics test results - the{" "}
            {data.products.lrv_slope_limit_deg}° slope limit encoded in the site-quality label.
          </li>
          <li>USGS Professional Paper 1080 and NASA SP-418 - Apollo 17 Taurus-Littrow geology and landing site.</li>
          <li>
            Earth terrain: SRTMGL1_003 ({data.products.dem_grid_m.Earth} m) via Google Earth Engine; thermal:
            MOD11A2 day-night range; albedo: MODIS/Sentinel-2 surface reflectance (Liang 2001 narrow-band
            method); aridity: TerraClimate.
          </li>
          <li>Mars terrain: HRSC-DTM + MOLA blend ({data.products.dem_grid_m.Mars} m). Lunar terrain: LRO LOLA + Diviner ({data.products.dem_grid_m.Moon} m).</li>
          <li>
            Sample photographs are published NASA imagery (NASA Science / NASA JSC / NASA-GSFC-ASU), public
            domain; they demonstrate the extractor and are not part of the tile dataset.
          </li>
        </ul>
      </div>

      <div className="grid grid-2">
        <div className="panel">
          <h3>Repository and pipeline</h3>
          <p className="panel-sub">
            Source code, training scripts and the full data pipeline live at{" "}
            <a href="https://github.com/Seif-w/TerraTwin" target="_blank" rel="noreferrer">
              github.com/Seif-w/TerraTwin
            </a>
            . The scripts that produced these artifacts are <code>03_harmonize.py</code>,{" "}
            <code>04_ml_rank.py</code> and <code>05_report_figure.py</code>; reruns reproduce every number
            on the Evidence tab.
          </p>
          <p className="note">
            This site is a static build: it needs no Python server. The FastAPI backend in the repository
            serves the same artifacts for local work with the full{" "}
            {(data.bodies.bodies.Earth.tiles + data.bodies.bodies.Mars.tiles + data.bodies.bodies.Moon.tiles).toLocaleString("en-US")}
            -tile dataset and the image chips, which stay outside git on purpose.
          </p>
        </div>

        <div className="panel">
          <h3>What this site deliberately does not claim</h3>
          <ul className="list">
            {Object.entries(data.products.interpretation).map(([k, v]) => (
              <li key={k}>
                <code>{k}</code>: {v}
              </li>
            ))}
            <li>
              No percentage similarity between a body and an Earth location is published, because the
              measured calibration diagnostic says the pools are not yet commensurable: the lowest
              remaining separation is AUC{" "}
              {data.transfer.reduce((m, r) => Math.min(m, r.auc_quantile_mapped), 1).toFixed(3)}.
            </li>
            <li>
              The photo panel returns bands and shortlists, not coordinates of a landing site, and says so
              next to every result.
            </li>
          </ul>
        </div>
      </div>
    </>
  );
}
