import { useMemo, useState } from "react";
import ChartBox from "../components/Chart";
import GlobeView from "../components/GlobeLazy";
import type { GlobePoint } from "../components/GlobeView";

import type { Dataset } from "../lib/artifacts";
import { fmt, haversineKm } from "../lib/artifacts";
import { EARTH_BUMP, EARTH_TEXTURE } from "../lib/textures";
import { ARCH_LABEL, ARCH_ORDER, type Arch, type Tile } from "../lib/types";

interface Filters {
  arch: Set<Arch>;
  qMin: number;
  slopeBand: [number, number];
  roughBand: [number, number];
  albedoBand: [number, number];
}

const ALL = new Set(ARCH_ORDER);

function inBand(v: number, [lo, hi]: [number, number]): boolean {
  if (lo === hi) return true;
  return v >= lo && v <= hi;
}

export default function DataLayers({ data }: { data: Dataset }) {
  const s = data.reference.stats;
  const [f, setF] = useState<Filters>({
    arch: new Set(ALL),
    qMin: 0,
    slopeBand: [0, Math.ceil(s.sl.max)],
    roughBand: [0, Math.ceil(s.rs.max)],
    albedoBand: [0, Math.ceil(s.al.max * 10) / 10],
  });
  const [focus, setFocus] = useState<Tile | null>(null);

  const filtered = useMemo(
    () =>
      data.tiles.filter(
        (t) =>
          f.arch.has(t.arch) &&
          t.q >= f.qMin &&
          inBand(t.sl, f.slopeBand) &&
          inBand(t.rs, f.roughBand) &&
          inBand(t.al, f.albedoBand),
      ),
    [data, f],
  );

  const hist = useMemo(() => buildHistogram(filtered, data.tiles), [filtered, data.tiles]);

  const points = useMemo<GlobePoint[]>(
    () =>
      filtered
        .filter((_, i) => i % Math.max(1, Math.floor(filtered.length / 2600)) === 0)
        .map((t) => ({
          lat: t.lat,
          lng: t.lon,
          label: `WD ${t.id}`,
          detail: `q ${t.q.toFixed(4)} · slope ${fmt(t.sl, 2)}° · ${ARCH_LABEL[t.arch].short}`,
          color: ARCH_LABEL[t.arch].color,
        })),
    [filtered],
  );

  const neigh = useMemo(() => {
    if (!focus) return [];
    return [...data.tiles]
      .map((t) => ({ t, km: haversineKm(focus, t) }))
      .filter((x) => x.km > 0.1 && x.km < 30)
      .sort((a, b) => b.t.q - a.t.q)
      .slice(0, 8);
  }, [focus, data.tiles]);

  const mixConfig = useMemo(
    () => ({
      type: "doughnut" as const,
      data: {
        labels: ARCH_ORDER.map((a) => ARCH_LABEL[a].short),
        datasets: [
          {
            data: ARCH_ORDER.map((a) => filtered.filter((t) => t.arch === a).length),
            backgroundColor: ARCH_ORDER.map((a) => ARCH_LABEL[a].color),
            borderColor: "rgba(4,6,15,.9)",
            borderWidth: 2,
          },
        ],
      },
      options: { plugins: { legend: { position: "right" as const, labels: { boxWidth: 10 } } } },
    }),
    [filtered],
  );

  const histConfig = useMemo(
    () => ({
      type: "bar" as const,
      data: {
        labels: hist.labels,
        datasets: [
          {
            label: "filtered set",
            data: hist.filtered,
            backgroundColor: "#38bdf8",
            borderRadius: 3,
          },
          {
            label: "whole pool",
            data: hist.pool,
            backgroundColor: "rgba(129,140,248,.45)",
            borderRadius: 3,
          },
        ],
      },
      options: {
        scales: {
          y: { type: "linear" as const, grid: { color: "rgba(255,255,255,.06)" } },
          x: { grid: { display: false } },
        },
        plugins: { legend: { labels: { boxWidth: 10 } } },
      },
    }),
    [hist],
  );

  return (
    <>
      <section className="hero">
        <div className="kicker">Explore</div>
        <h1>Get to know the <span>Western Desert.</span></h1>
        <p>Browse {data.tiles.length.toLocaleString()} measured terrain areas. Adjust the filters and click a place to see its details.</p>
      </section>
      <div className="split-sidebar">
        <aside className="stack">
          <div className="panel">
            <div className="kicker">archetype</div>
            <div className="stack" style={{ gap: 6 }}>
              {ARCH_ORDER.map((a) => (
                <button
                  key={a}
                  className={`chip ${f.arch.has(a) ? "on" : ""}`}
                  onClick={() =>
                    // functional update: two toggles in the same tick must not lose one
                    setF((prev) => {
                      const next = new Set(prev.arch);
                      if (next.has(a)) next.delete(a);
                      else next.add(a);
                      return { ...prev, arch: next };
                    })
                  }
                  aria-pressed={f.arch.has(a)}
                >
                  <span className="sw" style={{ background: ARCH_LABEL[a].color }} />
                  {ARCH_LABEL[a].short}
                  <span className="num">{data.reference.archetype_counts[a]}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="panel">
            <div className="kicker">measurement bands</div>
            <div className="stack" style={{ gap: 12 }}>
              <Range
                label="site quality ≥"
                min={0}
                max={1}
                step={0.01}
                value={f.qMin}
                onChange={(v) => setF((prev) => ({ ...prev, qMin: v }))}
                display={f.qMin.toFixed(2)}
              />
              <Range
                label="slope mean (deg)"
                min={0}
                max={Math.ceil(s.sl.max)}
                step={0.5}
                value={f.slopeBand[1]}
                onChange={(v) => setF((prev) => ({ ...prev, slopeBand: [0, v] }))}
                display={`0 – ${f.slopeBand[1].toFixed(1)}`}
              />
              <Range
                label="roughness mean (m)"
                min={0}
                max={Math.ceil(s.rs.max)}
                step={0.5}
                value={f.roughBand[1]}
                onChange={(v) => setF((prev) => ({ ...prev, roughBand: [0, v] }))}
                display={`0 – ${f.roughBand[1].toFixed(1)}`}
              />
              <Range
                label="albedo mean"
                min={0}
                max={Math.ceil(s.al.max * 10) / 10}
                step={0.01}
                value={f.albedoBand[1]}
                onChange={(v) => setF((prev) => ({ ...prev, albedoBand: [0, v] }))}
                display={`0 – ${f.albedoBand[1].toFixed(2)}`}
              />
            </div>
            <p className="note" style={{ marginTop: 12 }}>
              live count: <b className="num">{filtered.length.toLocaleString("en-US")}</b> tiles of{" "}
              {data.tiles.length.toLocaleString("en-US")} ({((filtered.length / data.tiles.length) * 100).toFixed(1)}%)
            </p>
          </div>

          <div className="panel">
            <div className="kicker">archetype mix of the filtered set</div>
            <ChartBox config={mixConfig} height={210} ariaLabel="archetype composition" />
          </div>
        </aside>

        <section className="stack">
          <div className="panel">
            <h3>Where these places are</h3>
            <p className="panel-sub">
              decimated to {points.length} points for rendering; colour shows archetype, click a
              point to open its record below
            </p>
            <GlobeView
              texture={EARTH_TEXTURE}
              bumpTexture={EARTH_BUMP}
              atmosphere={{ color: "#38bdf8", altitude: 0.15 }}
              points={points}
              rings={focus ? [{ lat: focus.lat, lng: focus.lon, color: "#fbbf24" }] : []}
              focus={focus ? { lat: focus.lat, lng: focus.lon, altitude: 2.2 } : null}
              onPointClick={(p) => {
                const t = filtered.find((x) => x.id === p.label?.replace("WD ", ""));
                if (t) setFocus(t);
              }}
              height={380}
              label="filtered tile density"
            />
          </div>

          <div className="panel">
            <h3>Compare the terrain</h3>
            <ChartBox config={histConfig} height={240} ariaLabel="feature distributions" />
          </div>

          {focus && (
            <div className="panel">
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                <h3>Record · WD {focus.id}</h3>
                <span className="badge">{ARCH_LABEL[focus.arch].short}</span>
              </div>
              <table className="data">
                <tbody>
                  {Object.entries(FOCUS_FIELDS).map(([key, label]) => (
                    <tr key={key}>
                      <td style={{ width: "45%" }}>{label}</td>
                      <td className="num">{fmt((focus as unknown as Record<string, number>)[key], 4)}</td>
                    </tr>
                  ))}
                  {focus.p.map((v, i) => (
                    <tr key={ARCH_ORDER[i]}>
                      <td>probability {ARCH_LABEL[ARCH_ORDER[i]].short}</td>
                      <td className="num">{v.toFixed(3)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="panel-sub" style={{ marginTop: 10 }}>
                {ARCH_LABEL[focus.arch].ground}
              </p>
              <h3 style={{ marginTop: 16 }}>Nearby places</h3>
              <table className="data">
                <thead>
                  <tr>
                    <th>tile</th>
                    <th className="num">km</th>
                    <th className="num">site quality</th>
                    <th>archetype</th>
                  </tr>
                </thead>
                <tbody>
                  {neigh.map(({ t, km }) => (
                    <tr key={t.id}>
                      <td>
                        <button className="btn ghost" style={{ padding: "2px 8px" }} onClick={() => setFocus(t)}>
                          WD {t.id}
                        </button>
                      </td>
                      <td className="num">{km.toFixed(1)}</td>
                      <td className="num">{t.q.toFixed(4)}</td>
                      <td>{ARCH_LABEL[t.arch].short}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div className="panel">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
              <h3>All matching places</h3>
              <span className="provenance">{filtered.length.toLocaleString("en-US")} rows · first 200 shown</span>
            </div>
            <div className="scroll-y">
              <table className="data">
                <thead>
                  <tr>
                    <th>tile</th>
                    <th className="num">lat</th>
                    <th className="num">lon</th>
                    <th className="num">quality</th>
                    <th className="num">slope °</th>
                    <th className="num">rough m</th>
                    <th className="num">slope CV</th>
                    <th className="num">rough CV</th>
                    <th className="num">albedo</th>
                    <th className="num">ΔT K</th>
                    <th>archetype</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered
                    .slice(0, 200)
                    .map((t) => (
                      <tr key={t.id} onClick={() => setFocus(t)} style={{ cursor: "pointer" }}>
                        <td>WD {t.id}</td>
                        <td className="num">{t.lat.toFixed(3)}</td>
                        <td className="num">{t.lon.toFixed(3)}</td>
                        <td className="num">{t.q.toFixed(4)}</td>
                        <td className="num">{fmt(t.sl, 2)}</td>
                        <td className="num">{fmt(t.rs, 2)}</td>
                        <td className="num">{fmt(t.scv, 3)}</td>
                        <td className="num">{fmt(t.rcv, 3)}</td>
                        <td className="num">{fmt(t.al, 3)}</td>
                        <td className="num">{fmt(t.tr, 1)}</td>
                        <td>{ARCH_LABEL[t.arch].short}</td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>
      </div>
    </>
  );
}

const FOCUS_FIELDS: Record<string, string> = {
  sl: "slope mean (deg)",
  sd: "slope std dev (deg)",
  scv: "slope coefficient of variation",
  rs: "roughness mean (m)",
  rd: "roughness std dev (m)",
  rcv: "roughness coefficient of variation",
  al: "albedo mean",
  tr: "day-night temperature range (K)",
  ar: "aridity index mean",
  q: "learned site quality",
};

function Range({
  label,
  min,
  max,
  step,
  value,
  display,
  onChange,
}: {
  label: string;
  min: number;
  max: number;
  step: number;
  value: number;
  display: string;
  onChange: (v: number) => void;
}) {
  return (
    <label className="field">
      <span>
        {label} <span className="num" style={{ color: "var(--cyan)" }}>{display}</span>
      </span>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} />
    </label>
  );
}

/** Histograms are computed from the artifact values, never pre-binned by hand. */
function buildHistogram(filtered: Tile[], pool: Tile[]) {
  const defs: [string, keyof Tile, number][] = [
    ["slope °", "sl", 24],
    ["roughness m", "rs", 24],
    ["albedo", "al", 24],
  ];
  const labels: string[] = [];
  const fCounts: number[] = [];
  const pCounts: number[] = [];
  for (const [name, key, bins] of defs) {
    const vals = pool.map((t) => Number(t[key]));
    // reduce instead of spread: the pool grows past the argument-count limit
    const lo = vals.reduce((a, b) => (b < a ? b : a), Infinity);
    const hi = vals.reduce((a, b) => (b > a ? b : a), -Infinity);
    const w = (hi - lo) / bins || 1;
    const pf = new Array(bins).fill(0);
    const pp = new Array(bins).fill(0);
    for (const t of filtered) {
      const i = Math.min(bins - 1, Math.floor((Number(t[key]) - lo) / w));
      pf[i]++;
    }
    for (const t of pool) {
      const i = Math.min(bins - 1, Math.floor((Number(t[key]) - lo) / w));
      pp[i]++;
    }
    for (let i = 0; i < bins; i++) {
      labels.push(i === 0 ? `${name} ▸` : (lo + i * w).toFixed(i < bins / 3 ? 1 : 2));
      fCounts.push(pf[i]);
      pCounts.push(pp[i]);
    }
    labels.push("·");
    fCounts.push(0);
    pCounts.push(0);
  }
  return { labels, filtered: fCounts, pool: pCounts };
}
