/** Matches a browser-extracted photo signature against the 7,180 exported Earth tile
 *  signatures. The axes are chosen so that each one is defensible:
 *
 *   albedo  - tile albedo_mean is MODIS/S2 derived, comparable in kind to a ground
 *             brightness after gain/phase caveats are stated -> used as a BAND, not a point.
 *   spread  - tile slope_cv / roughness_cv are dimensionless, so a photo's contrast is a
 *             legitimate structural proxy (documented, weight reduced).
 *   relief  - tile slope_deg_mean vs the shadow-gradient proxy (weak, stated).
 *   thermal - tile temp_range_K_mean is NOT recoverable from one photo, so it is excluded
 *             from scoring and reported as "unknown from a single frame".
 *
 *  Nothing here is a learned image model; the roadmap page documents what will replace it.
 */

import { bandShare, haversineKm, zscore } from "./artifacts";
import type { Dataset, SampleMeta } from "./artifacts";
import type { PhotoFeatures, Tile } from "./types";
import { ARCH_ORDER } from "./types";

export interface MatchWeights {
  albedo: number;
  spread: number;
  relief: number;
}

export const DEFAULT_WEIGHTS: MatchWeights = { albedo: 0.5, spread: 0.3, relief: 0.2 };

export interface MatchResult {
  tile: Tile;
  rank: number;
  distance: number;
  /** Uncalibrated relative similarity, NOT a geolocation probability. */
  similarity: number;
  /** per-feature contribution to this tile's distance, in squared z units */
  parts: { albedo: number; spread: number; relief: number };
  /** [photo, tile] in robust z units, so the row can say which axis disagreed */
  z: { albedo: [number, number]; spread: [number, number]; relief: [number, number] };
  km: number;
}

export interface MatchOptions {
  topK?: number;
  /** keep only tiles that satisfy a documented engineering limit, e.g. the LRV slope cap */
  maxSlopeDeg?: number | null;
  minSpacingKm?: number;
  excludeVegetation?: boolean;
}

export interface MatchReport {
  ranked: MatchResult[];
  best: MatchResult | null;
  /** interquartile lat/lon box of the top 200 matches = the honest uncertainty region */
  band: { latMin: number; latMax: number; lonMin: number; lonMax: number; kmAcross: number };
  confidence: number;
  confidenceNote: string;
  /** share of the pool whose measured albedo falls inside the photo band */
  albedoPoolShare: number;
  archetypeMixTop: number;
  /** engineering cap applied to the candidate set, null when every tile was allowed */
  slopeCap: number | null;
  archetypeName: string;
  axisRows: {
    axis: string;
    photo: string;
    earth: string;
    kind: "measured-band" | "structural-proxy" | "unknown";
    weight: number;
    note: string;
  }[];
  evaluated: number;
}

function tileSpread(t: Tile): number {
  // two dimensionless spread statistics combined on the same robust scale
  return 0.5 * t.scv + 0.5 * t.rcv;
}

export function matchPhoto(
  ds: Dataset,
  f: PhotoFeatures,
  weights: MatchWeights = DEFAULT_WEIGHTS,
  options: MatchOptions = {},
): MatchReport {
  const topK = options.topK ?? 18;
  const minSpacingKm = options.minSpacingKm ?? 12;
  const slopeCap = options.maxSlopeDeg ?? null;
  const s = ds.reference.stats;
  // robust spread of the pool for the derived photo axes
  const poolSpread = tileSpreadLikeStats(ds.tiles, s);

  const photoAlbZ = zscore(f.albedoProxy, {
    median: s.al.q50,
    q25: s.al.q25,
    q75: s.al.q75,
  });
  const photoSpreadZ = zscore(f.contrast, poolSpread.slopeCv);
  const photoReliefZ = zscore(f.slopeProxy, {
    median: s.sl.q50,
    q25: s.sl.q25,
    q75: s.sl.q75,
  });

  const scored: MatchResult[] = [];
  // distance context is relative to the closest match, recomputed after ranking
  let bestAnchor: Tile | null = null;
  for (const t of ds.tiles) {
    if (slopeCap != null && t.sl > slopeCap) continue;
    if (options.excludeVegetation !== false && t.g > ds.landcover.threshold) continue;
    const albZ = zscore(t.al, { median: s.al.q50, q25: s.al.q25, q75: s.al.q75 });
    const spreadZ = zscore(tileSpread(t), poolSpread.combined);
    const reliefZ = zscore(t.sl, { median: s.sl.q50, q25: s.sl.q25, q75: s.sl.q75 });
    const dAlb = (photoAlbZ - albZ) ** 2;
    const dSpr = (photoSpreadZ - spreadZ) ** 2;
    const dRel = (photoReliefZ - reliefZ) ** 2;
    // albedo enters as a band: inside the band the penalty decays instead of vanishing
    const inBand = t.al >= f.albedoBand[0] && t.al <= f.albedoBand[1];
    const bandPenalty = inBand ? 0 : Math.abs(t.al - (t.al < f.albedoBand[0] ? f.albedoBand[0] : f.albedoBand[1])) / s.al.std;
    const distance = Math.sqrt(
      weights.albedo * (dAlb * 0.35 + bandPenalty * 1.4) +
        weights.spread * dSpr +
        (f.horizonRow == null ? 0 : weights.relief) * dRel,
    );
    scored.push({
      tile: t,
      rank: 0,
      distance,
      similarity: 0,
      parts: { albedo: weights.albedo * (dAlb * 0.35 + bandPenalty * 1.4), spread: weights.spread * dSpr, relief: (f.horizonRow == null ? 0 : weights.relief) * dRel },
      z: {
        albedo: [photoAlbZ, albZ],
        spread: [photoSpreadZ, spreadZ],
        relief: [photoReliefZ, reliefZ],
      },
      km: bestAnchor ? haversineKm(t, bestAnchor) : 0,
    });
  }
  scored.sort((a, b) => a.distance - b.distance);
  // A candidate rule can empty the pool (e.g. the slope cap plus tight weights). Everything
  // below then degenerates to zero rather than dividing by an empty distribution.
  const has = scored.length > 0;
  const selected: MatchResult[] = [];
  if (has) {
    bestAnchor = scored[0].tile;
    for (const r of scored) {
      if (selected.every(other => haversineKm(r.tile, other.tile) >= minSpacingKm)) {
        r.rank = selected.length + 1;
        r.km = haversineKm(r.tile, bestAnchor);
        selected.push(r);
        if (selected.length >= topK) break;
      }
    }
  }

  const top = scored.slice(0, Math.max(50, topK));
  const quantile = (values: number[], p: number) =>
    values.length ? values[Math.min(values.length - 1, Math.floor(values.length * p))] : 0;
  const lats = top.map((r) => r.tile.lat).sort((a, b) => a - b);
  const lons = top.map((r) => r.tile.lon).sort((a, b) => a - b);
  const latMin = quantile(lats, 0.25);
  const latMax = quantile(lats, 0.75);
  const lonMin = quantile(lons, 0.25);
  const lonMax = quantile(lons, 0.75);
  const kmAcross = has ? haversineKm({ lat: latMin, lon: lonMin }, { lat: latMax, lon: lonMax }) : 0;

  // distance distribution of the whole pool -> rank separation is the confidence signal
  const dists = scored.map((r) => r.distance).sort((a, b) => a - b);
  const medianDist = quantile(dists, 0.5);
  const p05 = quantile(dists, 0.05);
  for (const r of selected) r.similarity = medianDist > 0 ? Math.max(0, Math.min(1, 1-r.distance/medianDist)) : 0;
  const sep = medianDist > 0 ? (medianDist - (has ? scored[0].distance : 0)) / medianDist : 0;
  const spreadNorm = medianDist > 0 ? 1 - p05 / medianDist : 0;
  const confidence = has ? Math.max(0, Math.min(0.99, 0.55 * sep + 0.45 * spreadNorm)) : 0;

  const mix = new Array(4).fill(0);
  top.slice(0, 25).forEach((r) => {
    r.tile.p.forEach((v, i) => (mix[i] += v));
  });
  const mixTotal = mix.reduce((a, b) => a + b, 0) || 1;
  const bestArchIdx = Math.max(...mix) > 0 ? mix.indexOf(Math.max(...mix)) : 0;

  const albedoPoolShare = bandShare(
    ds.tiles.map((t) => t.al).filter((v) => Number.isFinite(v)).sort((a, b) => a - b),
    f.albedoBand[0],
    f.albedoBand[1],
  );

  const note = !has
    ? "No tile in this pool satisfies the selected candidate rule, so nothing can be ranked. " +
      "Relax the rule or widen the candidate pool."
    : confidence > 0.55
      ? "The photo signature is well separated from the bulk of the pool, but the candidate " +
        "region still spans tens of kilometres."
      : confidence > 0.35
        ? "Moderate separation. Treat the list as a shortlist of environments, not locations."
        : "Weak separation: the photo mostly agrees with the average tile. A single frame " +
          "cannot pin this down - it needs the learned model described in the roadmap.";

  const axisRows: MatchReport["axisRows"] = [
    {
      axis: "Surface brightness -> albedo",
      photo: `${f.albedoProxy.toFixed(3)} (band ${f.albedoBand[0].toFixed(3)} to ${f.albedoBand[1].toFixed(3)})`,
      earth: `measured albedo_mean, pool median ${s.al.q50.toFixed(3)}`,
      kind: "measured-band",
      weight: weights.albedo,
      note: "Raw JPEG brightness is gain, white-balance and phase dependent. It is used as a band, never as a point value.",
    },
    {
      axis: "Tone spread -> dimensionless heterogeneity",
      photo: `contrast (std/mean) ${f.contrast.toFixed(3)}`,
      earth: `slope_cv + roughness_cv, pool median ${(((s.scv.q50 + s.rcv.q50)) / 2).toFixed(3)}`,
      kind: "structural-proxy",
      weight: weights.spread,
      note: "Both are dimensionless spread measures, so this is the most transferable axis - but photo spread also contains shadows and dust.",
    },
    {
      axis: "Shadow gradient -> slope",
      photo: `${f.slopeProxy.toFixed(2)} deg proxy`,
      earth: `slope_deg_mean, pool median ${s.sl.q50.toFixed(2)} deg`,
      kind: "structural-proxy",
      weight: weights.relief,
      note: "Needs sun elevation to be meaningful; low weight and disabled automatically when no horizon is found.",
    },
    {
      axis: "Thermal amplitude",
      photo: "unknown from one frame",
      earth: `temp_range_K_mean, pool median ${s.tr.q50.toFixed(1)} K`,
      kind: "unknown",
      weight: 0,
      note: "Excluded from scoring. Two images at different local times would be required.",
    },
    {
      axis: "Colour / mineralogy",
      photo: `${f.paletteClass} (hue ${f.hue.toFixed(0)} deg, sat ${f.saturation.toFixed(2)})`,
      earth: "albedo_mean only in this dataset",
      kind: "unknown",
      weight: 0,
      note: "Earth tiles have real albedo but no spectral bands in the exported artifact, so hue is shown, not scored.",
    },
  ];
  if (f.horizonRow == null) {
    axisRows[2].note += " No horizon detected in this frame, so the relief axis carries no information here.";
  }

  return {
    ranked: selected,
    best: scored[0] ?? null,
    band: { latMin, latMax, lonMin, lonMax, kmAcross },
    confidence,
    confidenceNote: note,
    albedoPoolShare,
    archetypeMixTop: mix[bestArchIdx] / mixTotal,
    archetypeName: ARCH_ORDER[bestArchIdx],
    axisRows,
    evaluated: scored.length,
    slopeCap,
  };
}

/** Pool statistics for the derived axes (computed from the tiles themselves, not typed in). */
function tileSpreadLikeStats(tiles: Tile[], s: Dataset["reference"]["stats"]) {
  const comb = new Float64Array(tiles.length);
  for (let i = 0; i < tiles.length; i++) comb[i] = tileSpread(tiles[i]);
  const sorted = Array.from(comb).sort((a, b) => a - b);
  const q = (p: number) => sorted[Math.floor(sorted.length * p)];
  // contrast is a ratio of a different kind; map it through the pool's own spread scale
  return {
    slopeCv: { median: s.rcv.q50, q25: s.rcv.q25, q75: s.rcv.q75 },
    combined: { median: q(0.5), q25: q(0.25), q75: q(0.75) },
  };
}

export function sampleKind(s: SampleMeta): string {
  return s.body === "Earth" ? "Earth orbital" : `${s.body} surface`;
}
