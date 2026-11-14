import type { Dataset } from "../lib/artifacts";
import { ALBEDO_HALF_BAND } from "../lib/photo";

export default function Roadmap({ data }: { data: Dataset }) {
  const s = data.schema;
  const g = s.tile_geometry;

  return (
    <>
      <section className="hero">
        <div className="kicker">training data · what you are building now</div>
        <h1>
          The dataset that turns this panel into a <span>learned photo-to-Earth model</span>
        </h1>
        <p>
          Today the photo panel measures what one uncalibrated frame can honestly give: a brightness
          band, a tone-spread proxy and a shadow-slope proxy. A learned model needs the image
          <em> and its physical context</em> stored together. This page is the contract — it is rendered
          from <code>photo_label_schema.json</code>, the same file the loader will validate against.
        </p>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 4 }}>
          <a className="btn primary" href="/data/photo_label_schema.csv" download>
            Download the fill-in CSV template
          </a>
          <a className="btn" href="/data/photo_label_schema.json" target="_blank" rel="noreferrer">
            Open the machine-readable schema
          </a>
        </div>
      </section>

      <div className="grid grid-3">
        <div className="metric">
          <div className="k">tile geometry</div>
          <div className="v">
            {g.size_km} km · {g.px} px
          </div>
          <div className="n">
            {g.meters_per_px} m/px · channels [{g.channels.join(", ")}]
          </div>
        </div>
        <div className="metric">
          <div className="k">rows in the current table</div>
          <div className="v">{data.provenance.tileCount.toLocaleString("en-US")}</div>
          <div className="n">Earth tiles already scored; the image rows join onto these IDs</div>
        </div>
        <div className="metric">
          <div className="k">split key</div>
          <div className="v">{data.reference.block_deg}° block</div>
          <div className="n">{data.reference.spatial_blocks} spatial blocks — the only honest train/test boundary</div>
        </div>
      </div>

      <div className="panel">
        <h3>Purpose, as stated in the artifact</h3>
        <p className="note">{s.purpose}</p>
        <p className="panel-sub" style={{ marginTop: 10 }}>
          {s.note}
        </p>
      </div>

      <div className="panel">
        <h3>Column contract — {s.columns.length} fields per image</h3>
        <p className="panel-sub">
          Sensor state is not optional bookkeeping: without incidence, phase and whether the file is
          radiometric, an albedo or slope label cannot be reused across images.
        </p>
        <table className="data">
          <thead>
            <tr>
              <th>field</th>
              <th>type</th>
              <th>required</th>
              <th>rule / allowed values</th>
            </tr>
          </thead>
          <tbody>
            {s.columns.map((c) => (
              <tr key={c.name}>
                <td>
                  <code>{c.name}</code>
                  {c.example ? <div className="meta">e.g. {c.example}</div> : null}
                </td>
                <td className="mono">{c.type}</td>
                <td>{c.required ? <span className="badge ok">yes</span> : <span className="badge">no</span>}</td>
                <td style={{ color: "var(--ink-2)" }}>
                  {c.rule ?? ""}
                  {c.values ? <span className="mono"> {"{"}{c.values.join(" | ")}{"}"} </span> : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="grid grid-2">
        <div className="panel">
          <h3>Validation rules the loader will enforce</h3>
          <ul className="list">
            {s.validation_rules.map((r) => (
              <li key={r}>{r}</li>
            ))}
          </ul>
          <p className="panel-sub" style={{ marginTop: 10 }}>
            Balance targets follow the measured class counts of the scored pool:{" "}
            {Object.entries(data.reference.archetype_counts)
              .map(([k, v]) => `${k} ${v}`)
              .join(" · ")}
            . Annotator confidence below 0.6 stays out of training and in evaluation only.
          </p>
        </div>

        <div className="panel">
          <h3>Cross-scale calibration procedure</h3>
          <p className="panel-sub">
            An image label is only reusable across bodies if the tile it points to has been put on the same
            measurement footing. The pipeline already does that for the terrain statistics, and the photo
            model inherits the same stages in this order - no stage may be skipped:
          </p>
          <ol className="list numbered">
            <li>
              <b>Harmonize</b> each body into dimensionless features (CVs, spread and log ratios, relative
              roughness) in <code>03_harmonize.py</code>, keeping the raw metre-scale columns for audit only.
            </li>
            <li>
              <b>Shift/scale align</b> target features onto the Earth distribution - per-feature median and IQR
              match - and record the domain-classifier AUC after this stage alone.
            </li>
            <li>
              <b>Earth-referenced quantile map</b> the target features through the Earth empirical CDF, which
              removes any remaining monotone scale difference, then re-run the classifier.
            </li>
            <li>
              <b>Read the residual AUC</b> from <code>transferability_report.csv</code>: what survives
              calibration is real geomorphic difference and may be modelled; what does not survive was only
              the sensor. Image rows must be labelled in the same calibrated space as{" "}
              <code>target_tile_id</code>, or the pair is not trainable.
            </li>
          </ol>
          <p className="panel-sub" style={{ marginTop: 10 }}>
            The photo extractor on the site mirrors this discipline: brightness is carried as a band because
            raw JPEG gain is unknown, and texture is only compared through dimensionless spread until{" "}
            <code>gsd_m_per_px</code> makes scale explicit.
          </p>
        </div>
        <div className="panel">
          <h3>Honest evaluation protocol</h3>
          <ul className="list">
            {s.honest_evaluation.map((r) => (
              <li key={r}>{r}</li>
            ))}
          </ul>
          <p className="note warn" style={{ marginTop: 10 }}>
            Leakage is the failure mode to avoid: a photo taken 2 km from a training tile inside the same
            block will look like a breakthrough and measure nothing. Folds are built from{" "}
            <code>split_block</code> / <code>split_region</code> only.
          </p>
        </div>
      </div>

      <div className="panel">
        <h3>Scope of the learned model</h3>
        <p className="panel-sub">
          Allowed <code>source_body</code> values are solid-body surfaces:{" "}
          <span className="mono">{(s.columns.find((c) => c.name === "source_body")?.values ?? []).join(", ")}</span>.
        </p>
        <p>
          A gas giant has no surface to place. Jupiter imagery from Juno or Cassini is cloud-top structure:
          its statistics are atmospheric, the "terrain" is advected between frames, and there is no
          landform class on Earth that a photo of the Great Red Spot can be matched to without inventing
          one. That belongs in a separate, clearly-labelled atmospheric mode - not in an Earth-location
          predictor. Icy moons with photographed ground (Europa, Enceladus) and Titan SAR/optical can join
          the same schema later, since they do have surfaces and published geomorphology.
        </p>
        <p className="note">{data.products.interpretation.recommended_next_step}</p>
      </div>

      <div className="panel">
        <h3>What changes in the site when the data exists</h3>
        <table className="data">
          <thead>
            <tr>
              <th>today</th>
              <th>with trained embeddings</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>
                brightness band of ±{ALBEDO_HALF_BAND.toFixed(2)} albedo units, scored with fixed weights
              </td>
              <td>learned image encoder aligned to the {g.channels.length}-D tile signature; weights replaced by a trained projection</td>
            </tr>
            <tr>
              <td>candidate list plus an interquartile band as uncertainty</td>
              <td>calibrated posterior over tiles, leave-region-out top-1 / top-5 accuracy reported next to it</td>
            </tr>
            <tr>
              <td>one province of candidates</td>
              <td>pool widened to the deserts, cratons and volcanic fields named in the evidence page</td>
            </tr>
            <tr>
              <td>runs entirely in the browser, no server</td>
              <td>an inference endpoint is added; the browser path stays as the fallback</td>
            </tr>
          </tbody>
        </table>
      </div>
    </>
  );
}
