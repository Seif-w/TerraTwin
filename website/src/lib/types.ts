/** Types mirroring the exported pipeline artifacts. Nothing here is hand-authored data:
 *  every field maps onto a key present in the bundled artifact files. */

export type Arch = "A1_escarpment" | "A2_coarse_fan" | "A3_deltaic_plain" | "A4_hardpan_flat";

export const ARCH_ORDER: Arch[] = [
  "A1_escarpment",
  "A2_coarse_fan",
  "A3_deltaic_plain",
  "A4_hardpan_flat",
];

export const ARCH_LABEL: Record<Arch, { short: string; ground: string; color: string }> = {
  A1_escarpment: {
    short: "A1 escarpment",
    ground: "Pilot Mountain M2020-882-24 - indurated sandstone, blocky failure",
    color: "#f97316",
  },
  A2_coarse_fan: {
    short: "A2 coarse fan",
    ground: "Otis Peak M2020-822-23 - boulder conglomerate fan surface",
    color: "#a855f7",
  },
  A3_deltaic_plain: {
    short: "A3 deltaic plain",
    ground: "Melyn M2020-749-22 - fluvial-deltaic plain, fine sorted beds",
    color: "#38bdf8",
  },
  A4_hardpan_flat: {
    short: "A4 hardpan flat",
    ground: "Deflated hardpan / desert pavement, low mobility hazard",
    color: "#22c55e",
  },
};

/** Slim columnar tile table (terratwin_ml_ranked.json). */
export interface TileTable {
  columns: string[];
  source: string;
  rows: number;
  geometry_km: number;
  px_per_tile: number;
  meters_per_px: number;
  data: (string | number | null)[][];
}

export interface Tile {
  i: number;
  id: string;
  lat: number;
  lon: number;
  q: number;
  sl: number;
  sd: number;
  rs: number;
  rd: number;
  scv: number;
  rcv: number;
  al: number;
  tr: number;
  ar: number;
  a: number;
  arch: Arch;
  p: number[];
  /** share of vegetation pixels in the tile (Sentinel-2 land-cover screen), 0..1 */
  g: number;
}

export interface FeatureStats {
  q02: number;
  q10: number;
  q25: number;
  q50: number;
  q75: number;
  q90: number;
  q98: number;
  mean: number;
  std: number;
  min: number;
  max: number;
  n: number;
}

export interface Reference {
  feature_keys: string[];
  stats: Record<string, FeatureStats>;
  archetype_counts: Record<string, number>;
  spatial_blocks: number;
  block_deg: number;
  note: string;
}

export interface TransferRow {
  target: string;
  auc_raw: number;
  auc_shift_scale_aligned: number;
  auc_quantile_mapped: number;
  median_ratio_slope: number;
  median_ratio_roughness: number;
  median_ratio_slope_cv: number;
  median_ratio_roughness_cv: number;
}

export interface TargetSignature {
  target_body: string;
  rationale: string;
  tiles_used: number;
  archetype_mix: Record<string, number>;
  archetype_mix_native_uncalibrated: Record<string, number>;
  top_archetype: string;
  top_archetype_native: string;
  calibrated_band: number[];
  reachable_fraction: number;
}

export interface BodyStats {
  tiles: number;
  region: string[];
  dem_grid_m: number;
  crs_flag: string[];
  medians: Record<string, number | null>;
  albedo_status: string;
  temp_aridity_status: string;
  named_sites?: { name: string; lat: number; lon: number; note: string; source?: string }[];
  named_context?: { name: string; lat: number; lon: number; note: string }[];
}

export interface Products {
  dem_grid_m: Record<string, number>;
  features: string[];
  archetype_features: string[];
  archetype_names: string[];
  lrv_slope_limit_deg: number;
  transfer_diagnostics: TransferRow[];
  archetype_model: {
    n_tiles: number;
    cv_mode: string;
    block_deg: number;
    spatial_blocks: number;
    block_cv_accuracy: number;
    block_cv_macro_f1: number;
    baseline_shuffled_label_accuracy: number;
    baseline_majority_class_rate: number;
    class_counts: Record<string, number>;
  };
  site_quality_model: {
    n_tiles: number;
    features: string[];
    cv_mode: string;
    block_deg: number;
    spatial_blocks: number;
    cv_r2: number;
    cv_spearman: number;
    cv_mae: number;
    permutation_importance: Record<string, number>;
  };
  targets: Record<string, TargetSignature>;
  interpretation: Record<string, string>;
  top_site_quality: {
    tile_id: string;
    approx_lat: number;
    approx_lon: number;
    slope_deg_mean: number;
    roughness_m_mean: number;
    slope_cv: number;
    albedo_mean: number;
    site_quality: number;
    archetype: Arch;
  }[];
  status: string;
}

export interface BodiesFile {
  bodies: Record<string, BodyStats>;
  targets: Record<string, TargetSignature>;
  transferability: TransferRow[];
  interpretation: Record<string, string>;
  lrv_slope_limit_deg: number;
  status: string;
  generated_from: string[];
}

export interface SchemaFile {
  name: string;
  purpose: string;
  tile_geometry: {
    size_km: number;
    meters_per_px: number;
    px: number;
    channels: string[];
    earth_dem: string;
    mars_dem: string;
    moon_dem: string;
  };
  columns: {
    name: string;
    type: string;
    required: boolean;
    rule?: string;
    values?: string[];
    example?: string;
  }[];
  validation_rules: string[];
  honest_evaluation: string[];
  note: string;
}

/** Photo feature vector extracted in the browser. */
export interface PhotoFeatures {
  meanLuma: number;
  medianLuma: number;
  albedoProxy: number;
  albedoBand: [number, number];
  contrast: number;
  textureLocalVar: number;
  fftSlope: number;
  fftHFraction: number;
  grainScalePx: number;
  skyFraction: number;
  horizonRow: number | null;
  slopeProxy: number;
  hue: number;
  saturation: number;
  warmth: number;
  histogram: number[][];
  radialPower: number[];
  width: number;
  height: number;
  paletteClass: string;
}

/** Human label for a raw archetype key coming from an artifact, tolerant of unknowns. */
export function archShort(name: string): string {
  return ARCH_LABEL[name as Arch]?.short ?? name;
}
