import { useMemo } from "react";
import ChartBox from "../components/Chart";
import type { Dataset } from "../lib/artifacts";
import { fmt } from "../lib/artifacts";
import { ARCH_LABEL, ARCH_ORDER } from "../lib/types";

export default function Evidence({ data }: { data: Dataset }) {
  const p = data.products;
  const am = p.archetype_model;
  const sq = p.site_quality_model;

  const aucConfig = useMemo(
    () => ({
      type: "bar" as const,
      data: {
        labels: ["raw statistics", "+ shift/scale align", "+ full quantile map"],
        datasets: data.transfer.map((r) => ({
          label: `Earth vs ${r.target}`,
          data: [r.auc_raw, r.auc_shift_scale_aligned, r.auc_quantile_mapped],
          backgroundColor: r.target === "Mars" ? "#f97316" : "#a855f7",
          borderRadius: 4,
        })),
      },
      options: {
        scales: {
          y: {
            // 0.5 is chance: starting the axis there shows the real size of the effect.
            min: 0.5,
            max: 1.02,
            grid: { color: "rgba(255,255,255,.06)" },
            title: { display: true, text: "domain-classifier AUC (0.5 = indistinguishable)" },
          },
          x: { grid: { display: false } },
        },
        plugins: {
          legend: { labels: { boxWidth: 10 } },
          tooltip: {
            callbacks: {
              afterLabel: (c: { datasetIndex: number }) => {
                const r = data.transfer[c.datasetIndex];
                return `median ratios vs Earth: slope ${r.median_ratio_slope}x, roughness ${r.median_ratio_roughness}x,\nslope CV ${r.median_ratio_slope_cv}x, roughness CV ${r.median_ratio_roughness_cv}x`;
              },
            },
          },
        },
      },
    }),
    [data],
  );

  const mixConfig = useMemo(() => {
    const keys = Object.keys(p.targets);
    return {
      type: "bar" as const,
      data: {
        labels: keys.map((k) => `${k}\n${p.targets[k].target_body}`),
        datasets: ARCH_ORDER.map((a) => ({
          label: ARCH_LABEL[a].short,
          data: keys.map((k) => p.targets[k].archetype_mix_native_uncalibrated[a] ?? 0),
          backgroundColor: ARCH_LABEL[a].color,
          stack: "native",
          borderRadius: 3,
        })),
      },
      options: {
        indexAxis: "y" as const,
        scales: {
          x: { stacked: true, max: 1, grid: { color: "rgba(255,255,255,.06)" }, title: { display: true, text: "native (uncalibrated) archetype probability" } },
          y: { stacked: true, grid: { display: false } },
        },
        plugins: { legend: { labels: { boxWidth: 10 } } },
      },
    };
  }, [p]);

  const impConfig = useMemo(() => {
    const entries = Object.entries(sq.permutation_importance)
      .filter(([, v]) => v > 0.001)
      .sort((a, b) => b[1] - a[1]);
    return {
      type: "bar" as const,
      data: {
        labels: entries.map(([k]) => k),
        datasets: [{ label: "permutation importance", data: entries.map(([, v]) => v), backgroundColor: "#38bdf8", borderRadius: 3 }],
      },
      options: {
        indexAxis: "y" as const,
        scales: { x: { grid: { color: "rgba(255,255,255,.06)" } }, y: { grid: { display: false } } },
        plugins: { legend: { display: false } },
      },
    };
  }, [sq]);

  // the two headline magnitudes in the prose below are computed from the rows the table renders,
  // so they cannot drift away from the artifact
  const absRatios = data.transfer.flatMap((r) => [r.median_ratio_slope, r.median_ratio_roughness]);
  const absMax = absRatios.reduce((a, b) => (b > a ? b : a), 0);
  const cvRatios = data.transfer.flatMap((r) => [r.median_ratio_slope_cv, r.median_ratio_roughness_cv]);
  const cvMin = cvRatios.reduce((a, b) => (b < a ? b : a), Infinity);
  const cvMax = cvRatios.reduce((a, b) => (b > a ? b : a), -Infinity);

  return (
    <>
      <section className="hero">
        <div className="kicker">model evidence</div>
        <h1>
          What the {data.tiles.length.toLocaleString("en-US")}-tile dataset <span>can and cannot</span> support
        </h1>
        <p>
          Earth tiles were measured on {p.dem_grid_m.Earth} m SRTM, Mars on {p.dem_grid_m.Mars} m
          HRSC/MOLA and the Moon on {p.dem_grid_m.Moon} m LOLA. That difference is not a footnote: it
          changes what any similarity number can mean. Every figure on this page is read from{" "}
          <code>ml_products.json</code> and <code>transferability_report.csv</code>.
        </p>
      </section>

      <div className="grid grid-3">
        <div className="metric">
          <div className="k">site-quality CV</div>
          <div className="v">R² {fmt(sq.cv_r2, 4)}</div>
          <div className="n">Spearman {fmt(sq.cv_spearman, 4)} · MAE {fmt(sq.cv_mae, 4)} · {sq.spatial_blocks} spatial blocks of {sq.block_deg}°</div>
        </div>
        <div className="metric">
          <div className="k">archetype CV</div>
          <div className="v">{fmt(am.block_cv_accuracy, 4)} acc</div>
          <div className="n">macro-F1 {fmt(am.block_cv_macro_f1, 4)} · shuffled {fmt(am.baseline_shuffled_label_accuracy, 4)} · majority {fmt(am.baseline_majority_class_rate, 4)}</div>
        </div>
        <div className="metric">
          <div className="k">artifact status</div>
          <div className="v" style={{ fontSize: 14 }}>
            {p.status.replace(/_/g, " ")}
          </div>
          <div className="n">as exported by 04_ml_rank.py — not edited for display</div>
        </div>
      </div>

      <div className="grid grid-2">
        <div className="panel">
          <h3>How much of the Earth/target gap is only the sensor?</h3>
          <p className="panel-sub">
            A classifier is trained to tell Earth tiles from target tiles. Calibration removes
            monotone scale differences; whatever AUC survives is real geomorphic difference.
          </p>
          <ChartBox config={aucConfig} height={250} ariaLabel="transferability AUC by calibration stage" />
          <table className="data" style={{ marginTop: 12 }}>
            <thead>
              <tr>
                <th>target</th>
                <th className="num">raw</th>
                <th className="num">+ shift/scale</th>
                <th className="num">+ quantile map</th>
                <th className="num">slope x</th>
                <th className="num">rough x</th>
                <th className="num">slope CV x</th>
                <th className="num">rough CV x</th>
              </tr>
            </thead>
            <tbody>
              {data.transfer.map((r) => (
                <tr key={r.target}>
                  <td>{r.target}</td>
                  <td className="num">{r.auc_raw.toFixed(3)}</td>
                  <td className="num">{r.auc_shift_scale_aligned.toFixed(3)}</td>
                  <td className="num">{r.auc_quantile_mapped.toFixed(3)}</td>
                  <td className="num">{r.median_ratio_slope.toFixed(2)}</td>
                  <td className="num">{r.median_ratio_roughness.toFixed(2)}</td>
                  <td className="num">{r.median_ratio_slope_cv.toFixed(2)}</td>
                  <td className="num">{r.median_ratio_roughness_cv.toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="note" style={{ marginTop: 10 }}>{p.interpretation.mars}</p>
          <p className="note warn" style={{ marginTop: 8 }}>{p.interpretation.moon}</p>
        </div>

        <div className="panel">
          <h3>Absolutes do not transfer; dimensionless ratios nearly do</h3>
          <p className="panel-sub">
            Median per body taken from the harmonized table. Read the two ratio pairs side by side: the
            metre-scale statistics differ by up to {absMax.toFixed(2)}x, while the dimensionless CV ratios
            stay inside {cvMin.toFixed(2)}-{cvMax.toFixed(2)}x.
          </p>
          <table className="data">
            <thead>
              <tr>
                <th>body</th>
                <th className="num">tiles</th>
                <th className="num">DEM (m)</th>
                <th className="num">slope °</th>
                <th className="num">roughness m</th>
                <th className="num">slope CV</th>
                <th className="num">rough CV</th>
                <th className="num">albedo</th>
              </tr>
            </thead>
            <tbody>
              {Object.entries(data.bodies.bodies).map(([body, b]) => (
                <tr key={body}>
                  <td>{body}</td>
                  <td className="num">{b.tiles.toLocaleString("en-US")}</td>
                  <td className="num">{b.dem_grid_m}</td>
                  <td className="num">{fmt(b.medians.slope_deg_mean, 3)}</td>
                  <td className="num">{fmt(b.medians.roughness_m_mean, 3)}</td>
                  <td className="num">{fmt(b.medians.slope_cv, 3)}</td>
                  <td className="num">{fmt(b.medians.roughness_cv, 3)}</td>
                  <td className="num">{fmt(b.medians.albedo_mean, 3)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="panel-sub" style={{ marginTop: 10 }}>
            albedo status: {data.bodies.bodies.Mars.albedo_status} · {data.bodies.bodies.Moon.albedo_status} ·{" "}
            {data.bodies.bodies.Earth.albedo_status}
          </p>
          <p className="panel-sub">
            thermal status: Earth {data.bodies.bodies.Earth.temp_aridity_status} · Mars/Moon{" "}
            {data.bodies.bodies.Mars.temp_aridity_status}
          </p>

          <h3 style={{ marginTop: 16 }}>What drives the learned site quality</h3>
          <ChartBox config={impConfig} height={230} ariaLabel="permutation importance of the site quality model" />
        </div>
      </div>

      <div className="panel">
        <h3>Target archetype signatures (native, uncalibrated)</h3>
        <p className="panel-sub">
          Selection rules are quoted from the artifact so the numbers are reproducible. The three
          targets separate here even though their absolute statistics collapsed onto "Earth smooth,
          targets rough".
        </p>
        <div className="grid grid-2">
          <ChartBox config={mixConfig} height={230} ariaLabel="target archetype mix" />
          <div>
            <table className="data">
              <thead>
                <tr>
                  <th>query</th>
                  <th className="num">tiles</th>
                  <th>selection rule</th>
                  <th className="num">reachable</th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(p.targets).map(([k, t]) => (
                  <tr key={k}>
                    <td>
                      <code>{k}</code>
                      <div className="meta">{t.target_body}</div>
                    </td>
                    <td className="num">{t.tiles_used.toLocaleString("en-US")}</td>
                    <td style={{ color: "var(--ink-2)", maxWidth: 420 }}>{t.rationale}</td>
                    <td className="num">{fmt(t.reachable_fraction * 100, 1)}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="panel-sub" style={{ marginTop: 10 }}>
              Earth class balance in the training labels ({Object.keys(am.class_counts).length} classes):{" "}
              {Object.entries(am.class_counts).map(([k, v]) => `${k.split("_")[0]} ${v}`).join(" · ")}. The
              scored pool counts differ slightly ({Object.values(data.reference.archetype_counts).reduce((a, b) => a + b, 0).toLocaleString("en-US")} tiles) because
              the label set and the exported table are built at different stages of the pipeline.
            </p>
          </div>
        </div>
      </div>

      <div className="panel">
        <h3>Report figure</h3>
        <p className="panel-sub">Produced by 05_report_figure.py from the same artifacts this page reads.</p>
        <img
          src="/figures/model_report.png"
          alt="TerraTwin model report: learned site quality map, absolute versus dimensionless statistics, calibration AUC stages, and target archetype mix"
          style={{ width: "100%", borderRadius: 12, border: "1px solid var(--line)" }}
          loading="lazy"
        />
      </div>

      <div className="panel">
        <h3>Known limitations of this dataset</h3>
        <ul className="list">
          <li>
            Mars and Moon albedo are single placeholder constants —{" "}
            <code>{data.bodies.bodies.Mars.albedo_status}</code> and{" "}
            <code>{data.bodies.bodies.Moon.albedo_status}</code> — so a reflectance axis cannot be
            used cross-body yet.
          </li>
          <li>
            Temperature and aridity are NULL for all{" "}
            {(data.bodies.bodies.Mars.tiles + data.bodies.bodies.Moon.tiles).toLocaleString("en-US")} non-Earth
            tiles.
          </li>
          <li>
            The candidate pool is one province ({data.bodies.bodies.Earth.region.join(", ")}), which is the
            direct cause of the Moon result above.
          </li>
          <li>
            Mars and Moon tile centroids are stored in a local projected grid (
            {data.bodies.bodies.Mars.crs_flag.join("/")}), so tile-level positions on those bodies are not
            georeferenced; only documented site coordinates are plotted.
          </li>
        </ul>
        <p className="note" style={{ marginTop: 8 }}>{p.interpretation.recommended_next_step}</p>
      </div>
    </>
  );
}
