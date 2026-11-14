/** Loads the bundled pipeline artifacts and refuses to render anything it cannot verify.
 *  No number on the site is typed into the source: each one is read from these files. */

import type {
  Arch,
  BodiesFile,
  PhotoFeatures,
  Products,
  Reference,
  SchemaFile,
  Tile,
  TileTable,
  TransferRow,
} from "./types";
import { ARCH_ORDER } from "./types";

/** All paths relative to the site origin - never derived from an internal host. */
const P = {
  products: "data/ml_products.json",
  ranked: "data/terratwin_ml_ranked.json",
  reference: "data/reference.json",
  bodies: "data/bodies.json",
  transfer: "data/transferability_report.csv",
  schema: "data/photo_label_schema.json",
  samples: "samples/samples.json",
  landcover: "data/landcover.json",
  places: "data/places.json",
  mars: "data/mars_samples.json",
};

export interface Place {
  name: string;
  area: string;
  lat: number;
  lon: number;
  kind: string;
}

export interface MarsSample {
  name: string;
  designation: string;
  sol: number;
  date: string;
  lat: number;
  lon: number;
  elev_m: number;
  volume_cm3: number | null;
  campaign: string;
  region: string;
  report_volume: number;
}

export interface MarsSite {
  key: string;
  title: string;
  rock: string;
  story: string;
  clue: string;
  campaign: string;
  region: string;
  lat: number;
  lon: number;
  elev_m: number;
  sol: number;
  date: string;
  photo: string;
  photo_crop: string;
  photo_size: [number, number];
  crop_size: [number, number];
  figure: string;
  samples: MarsSample[];
}

export interface MarsFile {
  source: string;
  photo_credit: string;
  coordinates: string;
  n_sites: number;
  n_samples: number;
  elev_min_m: number;
  elev_max_m: number;
  sites: MarsSite[];
}

interface LandcoverFile {
  source: string;
  license: string;
  method: string;
  green_flag_threshold: number;
  n_tiles: number;
  n_flagged: number;
  columns: string[];
  data: [string, number][];
}

export class ArtifactError extends Error {
  constructor(
    public file: string,
    message: string,
  ) {
    super(`${file}: ${message}`);
    this.name = "ArtifactError";
  }
}

export interface SampleMeta {
  file: string;
  body: string;
  credit: string;
  geometry_note: string;
  width: number;
  height: number;
  license: string;
}

export interface Dataset {
  products: Products;
  tiles: Tile[];
  reference: Reference;
  bodies: BodiesFile;
  transfer: TransferRow[];
  schema: SchemaFile;
  samples: SampleMeta[];
  disclaimer: string;
  provenance: Provenance;
  places: Place[];
  mars: MarsFile;
  landcover: { source: string; license: string; threshold: number; flagged: number };
}

export interface Provenance {
  /** rows is read from the decoded artifact; nothing here is estimated or filled in */
  files: { path: string; rows?: number }[];
  tileCount: number;
  geometryKm: number;
  metersPerPx: number;
  pxPerTile: number;
  demGridM: Record<string, number>;
  status: string;
}

async function get(path: string): Promise<Response> {
  const res = await fetch(`/${path}`, { cache: "no-cache" });
  if (!res.ok) throw new ArtifactError(path, `HTTP ${res.status}`);
  return res;
}

async function getJson<T>(path: string): Promise<T> {
  const res = await get(path);
  try {
    return (await res.json()) as T;
  } catch {
    throw new ArtifactError(path, "body is not valid JSON");
  }
}

function expect(cond: unknown, file: string, msg: string): asserts cond {
  if (!cond) throw new ArtifactError(file, msg);
}

/** Column-driven decode; a renamed or missing column fails loudly instead of silently
 *  falling back to demo values. */
function decodeTiles(table: TileTable, file: string): Tile[] {
  const col = (name: string) => {
    const i = table.columns.indexOf(name);
    expect(i >= 0, file, `missing required column "${name}"`);
    return i;
  };
  const idx = {
    id: col("id"),
    lat: col("lat"),
    lon: col("lon"),
    q: col("q"),
    sl: col("sl"),
    sd: col("sd"),
    rs: col("rs"),
    rd: col("rd"),
    scv: col("scv"),
    rcv: col("rcv"),
    al: col("al"),
    tr: col("tr"),
    ar: col("ar"),
    a: col("a"),
    p1: col("p1"),
    p2: col("p2"),
    p3: col("p3"),
    p4: col("p4"),
  };
  expect(Array.isArray(table.data), file, "data is not an array");
  expect(table.rows === table.data.length, file, `header says ${table.rows} rows, found ${table.data.length}`);

  const out: Tile[] = [];
  for (let i = 0; i < table.data.length; i++) {
    const r = table.data[i];
    const num = (k: keyof typeof idx): number | null => {
      const v = r[idx[k]];
      return typeof v === "number" && Number.isFinite(v) ? v : null;
    };
    const aIdx = num("a");
    if (aIdx == null || aIdx < 1 || aIdx > ARCH_ORDER.length) continue; // unlabelled tile
    out.push({
      i,
      id: String(r[idx.id]),
      lat: num("lat") ?? NaN,
      lon: num("lon") ?? NaN,
      q: num("q") ?? NaN,
      sl: num("sl") ?? NaN,
      sd: num("sd") ?? NaN,
      rs: num("rs") ?? NaN,
      rd: num("rd") ?? NaN,
      scv: num("scv") ?? NaN,
      rcv: num("rcv") ?? NaN,
      al: num("al") ?? NaN,
      tr: num("tr") ?? NaN,
      ar: num("ar") ?? NaN,
      a: aIdx,
      arch: ARCH_ORDER[aIdx - 1] as Arch,
      p: [num("p1") ?? 0, num("p2") ?? 0, num("p3") ?? 0, num("p4") ?? 0],
      g: 0, // filled from the land-cover screen after decoding
    });
  }
  expect(out.length > 1000, file, `only ${out.length} usable rows decoded - artifact looks truncated`);
  return out;
}

/** transferability_report.csv is shipped verbatim, so parse it rather than restating it. */
function parseTransfer(csv: string, file: string): TransferRow[] {
  const lines = csv.trim().split(/\r?\n/);
  expect(lines.length > 1, file, "no data rows");
  const head = lines[0].split(",");
  const need = [
    "target",
    "auc_raw",
    "auc_shift_scale_aligned",
    "auc_quantile_mapped",
    "median_ratio_slope",
    "median_ratio_roughness",
    "median_ratio_slope_cv",
    "median_ratio_roughness_cv",
  ];
  for (const n of need) expect(head.includes(n), file, `missing column ${n}`);
  return lines.slice(1).map((line) => {
    const c = line.split(",");
    const at = (n: string) => c[head.indexOf(n)];
    return {
      target: at("target"),
      auc_raw: Number(at("auc_raw")),
      auc_shift_scale_aligned: Number(at("auc_shift_scale_aligned")),
      auc_quantile_mapped: Number(at("auc_quantile_mapped")),
      median_ratio_slope: Number(at("median_ratio_slope")),
      median_ratio_roughness: Number(at("median_ratio_roughness")),
      median_ratio_slope_cv: Number(at("median_ratio_slope_cv")),
      median_ratio_roughness_cv: Number(at("median_ratio_roughness_cv")),
    };
  });
}

export async function loadDataset(): Promise<Dataset> {
  const [products, ranked, reference, bodies, transferCsv, schema, samplesRaw, landcover, placesFile, mars] = await Promise.all([
    getJson<Products>(P.products),
    getJson<TileTable>(P.ranked),
    getJson<Reference>(P.reference),
    getJson<BodiesFile>(P.bodies),
    get(P.transfer).then((r) => r.text()),
    getJson<SchemaFile>(P.schema),
    getJson<{ samples: SampleMeta[]; disclaimer: string }>(P.samples),
    getJson<LandcoverFile>(P.landcover),
    getJson<{ source: string; places: Place[] }>(P.places),
    getJson<MarsFile>(P.mars),
  ]);

  expect(products.site_quality_model?.cv_r2 != null, P.products, "site_quality_model absent");
  expect(products.transfer_diagnostics?.length >= 2, P.products, "transfer diagnostics absent");
  const tiles = decodeTiles(ranked, P.ranked);
  expect(
    tiles.length === products.site_quality_model.n_tiles,
    P.ranked,
    `decoded ${tiles.length} tiles but ml_products.json reports ${products.site_quality_model.n_tiles}`,
  );
  const transfer = parseTransfer(transferCsv, P.transfer);

  // land-cover screen: one green share per tile id, so oasis fields can be kept out of results
  expect(landcover.columns?.[0] === "id" && landcover.columns?.[1] === "green", P.landcover, "expected columns [id, green]");
  expect(landcover.data.length === ranked.data.length, P.landcover, `covers ${landcover.data.length} tiles, table has ${ranked.data.length}`);
  const green = new Map<string, number>(landcover.data.map(([id, g]) => [String(id), g]));
  for (const t of tiles) {
    const g = green.get(t.id);
    expect(g != null, P.landcover, `no land-cover value for tile ${t.id}`);
    t.g = g;
  }
  expect(Array.isArray(placesFile.places) && placesFile.places.length > 0, P.places, "places list empty");
  expect(Array.isArray(mars.sites) && mars.sites.length === mars.n_sites, P.mars, "site count mismatch");
  for (const site of mars.sites) {
    expect(site.samples.length > 0 && Number.isFinite(site.lat) && Number.isFinite(site.elev_m), P.mars, `site ${site.key} incomplete`);
  }

  // The views read these paths directly; assert them here so a regenerated artifact with a
  // renamed key fails into the styled ArtifactError state instead of a blank screen.
  for (const body of ["Earth", "Moon", "Mars"]) {
    const b = bodies.bodies?.[body];
    expect(b, P.bodies, `bodies.${body} absent`);
    expect(typeof b.tiles === "number", P.bodies, `bodies.${body}.tiles is not a number`);
    expect(typeof b.dem_grid_m === "number", P.bodies, `bodies.${body}.dem_grid_m is not a number`);
    expect(Array.isArray(b.region) && Array.isArray(b.crs_flag), P.bodies, `bodies.${body} region/crs audit missing`);
    expect(typeof b.albedo_status === "string", P.bodies, `bodies.${body}.albedo_status missing`);
    expect(b.medians && typeof b.medians === "object", P.bodies, `bodies.${body}.medians missing`);
  }
  for (const key of ["jezero_upper_fan", "lunar_south_pole_all"]) {
    const t = bodies.targets?.[key];
    expect(t, P.bodies, `targets.${key} absent - the dashboard target switch needs it`);
    expect(typeof t.reachable_fraction === "number", P.bodies, `targets.${key}.reachable_fraction missing`);
    expect(t.archetype_mix && Object.keys(t.archetype_mix).length >= 2, P.bodies, `targets.${key}.archetype_mix missing`);
  }
  expect(typeof bodies.transferability === "object", P.bodies, "transferability block absent");
  expect(typeof products.status === "string" && products.status.length > 0, P.products, "status missing");
  expect(Number.isFinite(products.lrv_slope_limit_deg), P.products, "lrv_slope_limit_deg missing");
  expect(products.interpretation?.mars && products.interpretation?.moon, P.products, "interpretation texts missing");
  for (const a of ["A1_escarpment", "A2_coarse_fan", "A3_deltaic_plain", "A4_hardpan_flat"]) {
    expect(Number.isFinite(reference.archetype_counts?.[a]), P.reference, `archetype_counts.${a} missing`);
  }
  for (const key of ["al", "sl", "tr", "scv", "rcv"]) {
    expect(reference.stats?.[key], P.reference, `reference.stats.${key} missing - the matcher needs its quantiles`);
  }
  expect(Number.isFinite(reference.block_deg) && reference.spatial_blocks > 1, P.reference, "spatial block metadata missing");

  const provenance: Provenance = {
    files: [
      { path: `/${P.products}`, rows: 1 },
      { path: `/${P.ranked}`, rows: tiles.length },
      { path: `/${P.transfer}`, rows: transfer.length },
      { path: `/${P.reference}` },
      { path: `/${P.bodies}` },
    ],
    tileCount: tiles.length,
    geometryKm: ranked.geometry_km,
    metersPerPx: ranked.meters_per_px,
    pxPerTile: ranked.px_per_tile,
    demGridM: products.dem_grid_m,
    status: products.status,
  };

  return {
    products,
    tiles,
    reference,
    bodies,
    transfer,
    schema,
    samples: samplesRaw.samples,
    disclaimer: samplesRaw.disclaimer,
    provenance,
    places: placesFile.places,
    mars,
    landcover: {
      source: landcover.source,
      license: landcover.license,
      threshold: landcover.green_flag_threshold,
      flagged: tiles.filter((t) => t.g > landcover.green_flag_threshold).length,
    },
  };
}

/* ---------------------------------------------------------------- helpers */

export const fmt = (v: number | null | undefined, digits = 3): string =>
  v == null || !Number.isFinite(v) ? "NULL" : v.toFixed(digits);

export const pct = (v: number, digits = 0): string => `${(v * 100).toFixed(digits)}%`;

export function haversineKm(a: { lat: number; lon: number }, b: { lat: number; lon: number }): number {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLon = ((b.lon - a.lon) * Math.PI) / 180;
  const la1 = (a.lat * Math.PI) / 180;
  const la2 = (b.lat * Math.PI) / 180;
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(la1) * Math.cos(la2) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/** Robust standardisation used by both the tile table and the photo signature. */
export function zscore(value: number, s: { median: number; q25: number; q75: number }): number {
  const iqr = s.q75 - s.q25;
  if (!(iqr > 0)) return 0;
  return (value - s.median) / (iqr / 1.349);
}

export function bandShare(sortedValues: number[], lo: number, hi: number): number {
  if (!sortedValues.length) return 0;
  const first = lowerBound(sortedValues, lo);
  const last = lowerBound(sortedValues, hi);
  return (last - first) / sortedValues.length;
}

export function lowerBound(sorted: number[], v: number): number {
  let lo = 0;
  let hi = sorted.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (sorted[mid] < v) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

export type { PhotoFeatures };
