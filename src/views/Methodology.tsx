import type { Dataset } from "../lib/artifacts";
import { fmt } from "../lib/artifacts";
import { ARCH_LABEL, ARCH_ORDER } from "../lib/types";

export default function Methodology({ data }: { data: Dataset }) {
  const p = data.products;
  const sq = p.site_quality_model;
  const am = p.archetype_model;

  return (
    <>
      <section className="hero">
        <div className="kicker">methodology</div>
        <h1>
          From orbital topography to a <span>ranked Earth camp site</span>
        </h1>
        <p>
          TerraTwin compares terrain statistics, not pixels. That choice is deliberate and it is
          measured on this page's own artifacts: image chips in this dataset are DEM-derived
          hillshade with placeholder albedo, so a CNN trained on them would learn the sensor.
        </p>
      </section>

      <div className="panel">
        <h3>Pipeline</h3>
        <table className="data">
          <thead>
            <tr>
              <th>stage</th>
              <th>script</th>
              <th>what it produces</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>1 · tile extraction</td>
              <td>
                <code>01_extract_terrain_stats.py</code>
              </td>
              <td>
                {sq.n_tiles.toLocaleString("en-US")} Earth + {data.bodies.bodies.Mars.tiles.toLocaleString("en-US")} Mars +{" "}
                {data.bodies.bodies.Moon.tiles.toLocaleString("en-US")} Moon tiles of{" "}
                {data.provenance.geometryKm} km, statistics from SRTM / HRSC+MOLA / LOLA and MODIS MOD11A2,
                Sentinel-2 albedo and TerraClimate aridity through Google Earth Engine
              </td>
            </tr>
            <tr>
              <td>2 · chip render</td>
              <td>
                <code>02_train_and_rank.py</code>
              </td>
              <td>
                {data.provenance.pxPerTile} px chips at {data.provenance.metersPerPx} m/px, channels{" "}
                [R, G, B, Hillshade] — kept for the future learned image model, retired as the ranking input
              </td>
            </tr>
            <tr>
              <td>3 · harmonize</td>
              <td>
                <code>03_harmonize.py</code>
              </td>
              <td>
                CRS audit and dimensionless features (slope CV, roughness CV, slope spread ratio, slope log
                ratio, relative roughness) plus robust Earth-referenced z-scores
              </td>
            </tr>
            <tr>
              <td>4 · model</td>
              <td>
                <code>04_ml_rank.py</code>
              </td>
              <td>
                transferability diagnostics, archetype classifier, site-quality ranker, named target signatures —
                the source of every number in the Data Layers and Evidence tabs
              </td>
            </tr>
            <tr>
              <td>5 · report</td>
              <td>
                <code>05_report_figure.py</code>
              </td>
              <td>the figure reproduced on the Evidence tab</td>
            </tr>
          </tbody>
        </table>
      </div>

      <div className="grid grid-2">
        <div className="panel">
          <h3>Geomorphic classes, anchored to cited ground truth</h3>
          <p className="panel-sub">
            The 4-D probability vector replaces an unsupervised embedding: it is supervised,
            interpretable and comparable across bodies because it is built from ratios.
          </p>
          <div className="stack" style={{ gap: 8 }}>
            {ARCH_ORDER.map((a) => (
              <div key={a} className="rank-row" style={{ cursor: "default" }}>
                <span className="sw" style={{ width: 12, height: 12, borderRadius: "50%", background: ARCH_LABEL[a].color }} />
                <div>
                  <div className="name">{ARCH_LABEL[a].short}</div>
                  <div className="meta">{ARCH_LABEL[a].ground}</div>
                </div>
                <span className="badge num">{data.reference.archetype_counts[a].toLocaleString("en-US")} tiles</span>
              </div>
            ))}
          </div>
          <p className="panel-sub" style={{ marginTop: 10 }}>
            Validation: {am.cv_mode} over {am.spatial_blocks} blocks of {am.block_deg}° — accuracy{" "}
            {fmt(am.block_cv_accuracy, 4)}, macro-F1 {fmt(am.block_cv_macro_f1, 4)}, against a majority-class
            baseline of {fmt(am.baseline_majority_class_rate, 4)} and a shuffled-label control of{" "}
            {fmt(am.baseline_shuffled_label_accuracy, 4)}.
          </p>
        </div>

        <div className="panel">
          <h3>The site-quality label is engineering, not aesthetics</h3>
          <p className="panel-sub">
            A composite suitability target built from published limits, then learned so its behaviour can be
            inspected instead of hand-weighted:
          </p>
          <ul className="list">
            <li>
              slope penalty starts below the Apollo S-200 LRV limit of {p.lrv_slope_limit_deg}° and saturates as
              slope variability rises
            </li>
            <li>
              roughness and boulder-proxy penalty from measured roughness std-dev versus mean
            </li>
            <li>
              thermal penalty from the day-night range (MOD11A2), because EVA and battery margins are set by
              swing, not mean
            </li>
            <li>
              daylight and albedo terms as a first-order TCS and illumination proxy
            </li>
          </ul>
          <p className="panel-sub" style={{ marginTop: 10 }}>
            Held-out behaviour: {sq.cv_mode} R² {fmt(sq.cv_r2, 4)}, Spearman {fmt(sq.cv_spearman, 4)}, MAE{" "}
            {fmt(sq.cv_mae, 4)} over {sq.spatial_blocks} spatial blocks, with the top contributing features
            shown on the Evidence tab.
          </p>
          <p className="note">
            Sources: NASA eCR 134306 (Apollo S-200 soil mechanics), Mars 2020 Initial Reports Vol.3 (Farley &amp;
            Stack, 2024), USGS PP 1080 and NASA SP-418 for Apollo 17 Taurus-Littrow.
          </p>
        </div>
      </div>

      <div className="panel">
        <h3>How a similarity claim is allowed to be phrased</h3>
        <p className="panel-sub">
          Three tiers, decided by the measured calibration diagnostic rather than by taste:
        </p>
        <table className="data">
          <thead>
            <tr>
              <th>tier</th>
              <th>when it applies</th>
              <th>how the site reports it</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>ranked site quality</td>
              <td>within one body, one sensor — Earth tiles against Earth tiles</td>
              <td>numbered list with R²-validated scores (Dashboard, Data Layers)</td>
            </tr>
            <tr>
              <td>archetype mix</td>
              <td>cross-body where a fraction of the gap survives calibration</td>
              <td>4-D probability vector plus reachable fraction, never a single percentage</td>
            </tr>
            <tr>
              <td>refused</td>
              <td>cross-body where calibration removes nothing (AUC stays ≈1)</td>
              <td>the page says the class is missing from the pool instead of inventing a match</td>
            </tr>
          </tbody>
        </table>
        <p className="note warn" style={{ marginTop: 10 }}>
          This is why the site does not display "97.1% similar to Mars". The honest statement is in the
          artifacts: {p.interpretation.moon}
        </p>
      </div>
    </>
  );
}
