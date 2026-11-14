import { useMemo, useState } from "react";
import type { TooltipItem } from "chart.js";
import ChartBox from "../components/Chart";
import GlobeView from "../components/GlobeLazy";
import type { GlobePoint } from "../components/GlobeView";

import type { Dataset } from "../lib/artifacts";
import { fmt, haversineKm } from "../lib/artifacts";
import { EARTH_BUMP, EARTH_TEXTURE, planetTexture } from "../lib/textures";
import { ARCH_LABEL, archShort, type Arch } from "../lib/types";

type Target = "Moon" | "Mars";

export default function Dashboard({ data }: { data: Dataset }) {
  const [target, setTarget] = useState<Target>("Moon");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const ranked = useMemo(
    () => [...data.tiles].filter((t) => Number.isFinite(t.q)).sort((a, b) => b.q - a.q),
    [data],
  );
  const top = ranked.slice(0, 12);
  const selected = useMemo(
    () => ranked.find((t) => t.id === selectedId) ?? ranked[0],
    [ranked, selectedId],
  );

  const targetKey = target === "Moon" ? "lunar_south_pole_all" : "jezero_upper_fan";
  const sig = data.bodies.targets[targetKey];
  const bodyStats = data.bodies.bodies[target];
  const transfer = data.transfer.find((r) => r.target === target) ?? data.transfer[0];

  const earthPoints = useMemo<GlobePoint[]>(
    () =>
      top.map((t) => ({
        lat: t.lat,
        lng: t.lon,
        label: `WD ${t.id}`,
        detail: `learned site quality ${t.q.toFixed(4)} · ${ARCH_LABEL[t.arch].short}`,
        color: ARCH_LABEL[t.arch].color,
        value: t.q,
        // 0.22 -> 0.62 across the learned quality range; the value itself is in the label
        size: 0.22 + 0.4 * Math.max(0, Math.min(1, t.q)),
      })),
    [top],
  );

  const planetPoints = useMemo<GlobePoint[]>(
    () =>
      (bodyStats.named_sites ?? []).map((s) => ({
        lat: s.lat,
        lng: s.lon,
        label: s.name,
        detail: s.note,
        color: target === "Moon" ? "#facc15" : "#f97316",
      })),
    [bodyStats, target],
  );

  const planetArcs = useMemo(
    () =>
      planetPoints.length > 1
        ? planetPoints.slice(0, -1).map((p, i) => ({
            startLat: p.lat,
            startLng: p.lng,
            endLat: planetPoints[i + 1].lat,
            endLng: planetPoints[i + 1].lng,
          }))
        : [],
    [planetPoints],
  );

  // candidate traverse: a measured line between the three best tiles
  const earthArcs = useMemo(
    () =>
      top.slice(0, 3).slice(0, -1).map((t, i) => ({
        startLat: t.lat,
        startLng: t.lon,
        endLat: top[i + 1].lat,
        endLng: top[i + 1].lon,
      })),
    [top],
  );

  const chartConfig = useMemo(() => {
    const em = data.bodies.bodies.Earth.medians;
    const tm = bodyStats.medians;
    const axes = [
      ["slope mean (deg)", "slope_deg_mean", 2],
      ["roughness (m)", "roughness_m_mean", 2],
      ["slope CV", "slope_cv", 3],
      ["roughness CV", "roughness_cv", 3],
      ["albedo", "albedo_mean", 3],
      ["temp range (K)", "temp_range_K_mean", 1],
    ] as const;
    return {
      type: "bar" as const,
      data: {
        labels: axes.map((a) => a[0]),
        datasets: [
          {
            label: "Earth pool median (measured)",
            data: axes.map((a) => em[a[1]] ?? 0),
            backgroundColor: "#38bdf8",
            borderRadius: 4,
          },
          {
            label: `${target} signature (measured)`,
            data: axes.map((a) => tm[a[1]] ?? 0),
            backgroundColor: target === "Moon" ? "#a855f7" : "#f97316",
            borderRadius: 4,
          },
        ],
      },
      options: {
        scales: {
          y: {
            type: "logarithmic" as const,
            grid: { color: "rgba(255,255,255,0.06)" },
            title: { display: true, text: "log scale, mixed units", color: "#7f90ad" },
          },
          x: { grid: { display: false } },
        },
        plugins: {
          legend: { labels: { color: "#b8c6de", boxWidth: 10 } },
          tooltip: {
            callbacks: {
              label: (c: TooltipItem<"bar">) => `${c.dataset.label}: ${c.parsed.y ?? "NULL"}`,
            },
          },
        },
      },
    };
  }, [data, target, bodyStats]);

  return (
    <>
      <section className="hero">
        <div className="kicker">earth analogue engine · measured, not demo</div>
        <h1>
          Where on Earth should we rehearse the <span>Moon and Mars</span>?
        </h1>
        <p>
          {data.provenance.tileCount.toLocaleString("en-US")} Western Desert terrain tiles,
          each {data.provenance.geometryKm} km wide at {data.provenance.metersPerPx} m per pixel,
          scored by a validated model and matched against {bodyStats.tiles.toLocaleString("en-US")}{" "}
          {target} tiles from {bodyStats.dem_grid_m} m topography. Every figure below is read from
          the exported pipeline artifacts; the site renders nothing that is not in those files.
        </p>
      </section>

      <div className="split-sidebar">
        <aside className="stack">
          <div className="panel">
            <div className="kicker">target body</div>
            <div className="grid" style={{ gridTemplateColumns: "1fr 1fr", gap: 8 }}>
              {(["Moon", "Mars"] as Target[]).map((t) => (
                <button
                  key={t}
                  className={`btn ${target === t ? "primary" : "ghost"}`}
                  onClick={() => setTarget(t)}
                  aria-pressed={target === t}
                >
                  {t}
                </button>
              ))}
            </div>
            <p className="panel-sub" style={{ marginTop: 12 }}>
              signature: <code>{targetKey}</code> · {sig?.tiles_used.toLocaleString("en-US")} tiles
              selected by documented rules
            </p>
            <p className="note">{sig?.rationale}</p>
          </div>

          <div className="panel">
            <div className="kicker">what the model measures</div>
            <div className="stack" style={{ gap: 10 }}>
              {Object.entries(data.products.site_quality_model.permutation_importance)
                .filter(([, v]) => v > 0.01)
                .sort((a, b) => b[1] - a[1])
                .slice(0, 6)
                .map(([k, v]) => (
                  <div key={k}>
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12 }}>
                      <code>{k}</code>
                      <span className="num">{v.toFixed(3)}</span>
                    </div>
                    <div className="bar">
                      <i style={{ width: `${Math.min(100, v * 100)}%` }} />
                    </div>
                  </div>
                ))}
            </div>
            <p className="panel-sub" style={{ marginTop: 10 }}>
              permutation importance on {data.products.site_quality_model.spatial_blocks} spatial
              blocks · CV R² {fmt(data.products.site_quality_model.cv_r2, 4)} · Spearman{" "}
              {fmt(data.products.site_quality_model.cv_spearman, 4)} · encodes the Apollo S-200 LRV{" "}
              {data.products.lrv_slope_limit_deg}° slope limit
            </p>
          </div>

          <div className="panel">
            <div className="kicker">active datasets</div>
            <ul className="list" style={{ paddingLeft: 16 }}>
              <li>Mars: HRSC + MOLA blend ({data.products.dem_grid_m.Mars} m) · Jezero</li>
              <li>Moon: LRO LOLA + Diviner ({data.products.dem_grid_m.Moon} m)</li>
              <li>Earth: SRTMGL1_003 ({data.products.dem_grid_m.Earth} m) · MOD11A2 · S2_SR</li>
              <li>Ground truth: Mars 2020 IR Vol.3, NASA eCR 134306, USGS PP 1080</li>
            </ul>
          </div>
        </aside>

        <section className="stack">
          <div className="grid grid-2">
            <div className="panel">
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <h3>3D {target} globe</h3>
                <span className="badge">{sig ? archShort(sig.top_archetype) : ""}</span>
              </div>
              <GlobeView
                texture={planetTexture(target === "Moon" ? "moon" : "mars")}
                atmosphere={
                  target === "Mars"
                    ? { color: "#f97316", altitude: 0.13 }
                    : { color: "#818cf8", altitude: 0.06 }
                }
                points={planetPoints}
                arcs={planetArcs}
                focus={{
                  lat: planetPoints[0]?.lat ?? 0,
                  lng: planetPoints[0]?.lng ?? 0,
                  altitude: 1.9,
                }}
                label={`${target} target sites`}
              />
              <p className="panel-sub" style={{ marginTop: 10 }}>
                named sites from the cited sources ·{" "}
                {bodyStats.crs_flag.includes("local_projected_grid")
                  ? "tile centroids are a local projected grid in this dataset, so only documented site coordinates are plotted"
                  : "geographic degrees"}
              </p>
            </div>

            <div className="panel">
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <h3>Earth analogue globe</h3>
                <span className="badge ok">{top.length} ranked tiles</span>
              </div>
              <GlobeView
                texture={EARTH_TEXTURE}
                bumpTexture={EARTH_BUMP}
                atmosphere={{ color: "#38bdf8", altitude: 0.16 }}
                points={earthPoints}
                arcs={earthArcs}
                rings={[{ lat: selected.lat, lng: selected.lon, color: "#fbbf24" }]}
                focus={{ lat: selected.lat, lng: selected.lon, altitude: 2.4 }}
                onPointClick={(p) => setSelectedId(p.label?.replace("WD ", "") ?? null)}
                label="ranked Western Desert tiles"
              />
              <p className="panel-sub" style={{ marginTop: 10 }}>
                point colour = geomorphic archetype · size driven by learned site quality ·
                ring marks the selected tile
              </p>
            </div>
          </div>

          <div className="grid grid-2">
            <div className="panel">
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                <h3>Top Earth analogue matches</h3>
                <span className="provenance">sorted by learned site_quality</span>
              </div>
              <div className="stack" style={{ gap: 8 }}>
                {top.slice(0, 8).map((t, i) => (
                  <div
                    key={t.id}
                    className={`rank-row ${selected?.id === t.id ? "sel" : ""}`}
                    onClick={() => setSelectedId(t.id)}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => e.key === "Enter" && setSelectedId(t.id)}
                  >
                    <span className="pos">{i + 1}</span>
                    <div>
                      <div className="name">
                        WD {t.id}
                        <span
                          className="badge"
                          style={{ marginLeft: 8, borderColor: ARCH_LABEL[t.arch].color }}
                        >
                          {ARCH_LABEL[t.arch].short}
                        </span>
                      </div>
                      <div className="meta">
                        {t.lat.toFixed(3)}N {t.lon.toFixed(3)}E · slope {fmt(t.sl, 2)}° · rough{" "}
                        {fmt(t.rs, 2)} m
                        {i > 0 ? ` · ${haversineKm(t, top[0]).toFixed(1)} km from #1` : " · reference"}
                      </div>
                    </div>
                    <span className="badge ok num">{t.q.toFixed(4)}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="panel">
              <h3>Earth vs {target}: measured signature</h3>
              <p className="panel-sub">
                pool median versus {targetKey}. Log scale because units are mixed — this is the
                reason absolute statistics are not used for cross-body distance (see model evidence).
              </p>
              <ChartBox config={chartConfig} height={250} ariaLabel={`Earth versus ${target} medians`} />
            </div>
          </div>

          {selected && (
            <div className="panel">
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 10 }}>
                <h3>Selected tile · WD {selected.id}</h3>
                <span className="badge">{ARCH_LABEL[selected.arch].short}</span>
              </div>
              <p className="panel-sub">{ARCH_LABEL[selected.arch].ground}</p>
              <div className="grid grid-3">
                <Stat label="learned site quality" value={fmt(selected.q, 4)} note={`rank ${ranked.indexOf(selected) + 1} of ${ranked.length}`} />
                <Stat label="slope mean" value={fmt(selected.sl, 3)} note={`CV ${fmt(selected.scv, 3)} · std ${fmt(selected.sd, 3)}`} />
                <Stat label="roughness mean" value={`${fmt(selected.rs, 3)} m`} note={`std ${fmt(selected.rd, 3)} m · CV ${fmt(selected.rcv, 3)}`} />
                <Stat label="albedo mean" value={fmt(selected.al, 4)} note={`pool median ${fmt(data.reference.stats.al.q50, 4)}`} />
                <Stat label="thermal range" value={`${fmt(selected.tr, 2)} K`} note={`aridity ${fmt(selected.ar, 4)}`} />
                <Stat
                  label="distance to #1"
                  value={`${haversineKm(selected, ranked[0]).toFixed(1)} km`}
                  note={`${selected.lat.toFixed(4)}N ${selected.lon.toFixed(4)}E`}
                />
              </div>
              <p className="panel-sub" style={{ marginTop: 12 }}>
                archetype probabilities:{" "}
                {(Object.keys(ARCH_LABEL) as Arch[]).map((k, i) => (
                  <span key={k} className="num" style={{ marginRight: 10 }}>
                    {k.slice(0, 2)} {selected.p[i].toFixed(3)}
                  </span>
                ))}
              </p>
            </div>
          )}

          {transfer && (
            <div className="panel">
              <h3>Confidence for this target</h3>
              <p className="note">
                After full cross-scale quantile calibration a classifier still separates{" "}
                {target} tiles from Earth tiles at AUC <b>{transfer.auc_quantile_mapped.toFixed(3)}</b>{" "}
                (raw {transfer.auc_raw.toFixed(3)}; after shift/scale align{" "}
                {transfer.auc_shift_scale_aligned.toFixed(3)}).{" "}
                {target === "Moon"
                  ? data.products.interpretation.moon
                  : data.products.interpretation.mars}
              </p>
              <p className="panel-sub" style={{ marginTop: 10 }}>
                reachable fraction of the pool inside this target's calibrated band:{" "}
                {sig ? `${(sig.reachable_fraction * 100).toFixed(1)}%` : "n/a for this target"}
              </p>
            </div>
          )}
        </section>
      </div>
    </>
  );
}

function Stat({ label, value, note }: { label: string; value: string; note: string }) {
  return (
    <div className="metric">
      <div className="k">{label}</div>
      <div className="v">{value}</div>
      <div className="n">{note}</div>
    </div>
  );
}
