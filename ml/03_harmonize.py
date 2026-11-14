"""TerraTwin measured-terrain pipeline.
This is a rule-labelled terrain model, not a trained image-geolocation system.
See ml/README.md for commands, feature order, provenance and limitations.
"""
import sys, os
import argparse
import numpy as np
import pandas as pd

DEFAULT_MASTER = os.path.join(os.path.dirname(__file__), "data", "terratwin_master_dataset.csv")
DEFAULT_OUT = os.path.join(os.path.dirname(__file__), "data", "terratwin_harmonized.csv")

# Region origins used to approximate geographic centers for local-grid bodies.
REGION_ORIGIN = {
    "Mars": dict(lat=18.45, lon=77.40, name="Jezero_Crater"),
    "Moon": dict(lat=-89.90, lon=0.00, name="Lunar_South_Pole"),
    "Earth": dict(lat=24.99, lon=27.00, name="Western_Desert_Egypt"),
}
TILE_SIZE_M = 5000.0          # 5 km x 5 km
PIXEL_M = 100.0               # 50 x 50 px
M_PER_DEG_LAT = 111_320.0

# Features that survive harmonization and are populated for all three bodies.
MATCH_FEATURES = [
    "slope_deg_mean",          # primary mobility/erosion signal, scale-robust
    "slope_cv",                # terrain heterogeneity, dimensionless
    "roughness_rel",           # roughness / footprint -> scale-invariant form class
    "roughness_cv",            # scatter of roughness, dimensionless
    "slope_log_ratio",         # robust slope magnitude vs tile scale
]
EXCLUDED = {
    "albedo_mean": "constant within body on Mars (0.16) and Moon (0.12): no cross-body variance",
    "temp_day_K_mean": "NULL for all 2,500 Mars/Moon tiles",
    "temp_night_K_mean": "NULL for all 2,500 Mars/Moon tiles",
    "temp_range_K_mean": "NULL for all 2,500 Mars/Moon tiles",
    "aridity_index_mean": "NULL for Mars/Moon; on Earth CV~1.5 around a ~0.003 mean (degenerate)",
    "roughness_m_mean": "footprint-resolution dependent -> replaced by roughness_rel",
    "roughness_m_stdDev": "footprint-resolution dependent -> replaced by roughness_cv",
    "slope_deg_stdDev": "kept only as slope_cv (dimensionless ratio)",
}


def audit_crs(df: pd.DataFrame) -> pd.DataFrame:
    """Flag bodies whose center_lat/center_lon are not geographic degrees."""
    flags = []
    for b, g in df.groupby("body"):
        la, lo = g.center_lat, g.center_lon
        in_bounds = (la.abs().max() <= 90.5) and (lo.abs().max() <= 360.5)
        metric = (la.abs().max() > 90.5) or (lo.abs().max() > 180.5)
        if metric:
            flags.append((b, "local_projected_grid", "no map origin applied; converted to approximate degrees"))
        elif not in_bounds:
            flags.append((b, "out_of_range", "check export projection"))
        else:
            flags.append((b, "geographic_degrees", "OK"))
    return pd.DataFrame(flags, columns=["body", "crs_flag", "note"])


def approx_geo_center(row: pd.Series, crs_flag_by_body: dict) -> tuple:
    body = row.body
    org = REGION_ORIGIN.get(body, REGION_ORIGIN["Earth"])
    if crs_flag_by_body.get(body) == "geographic_degrees":
        return float(row.center_lat), float(row.center_lon)
    x = float(row.center_lon)   # metres east in local grid
    y = float(row.center_lat)   # metres north in local grid
    lat = org["lat"] + y / M_PER_DEG_LAT
    lon = org["lon"] + x / (M_PER_DEG_LAT * max(np.cos(np.radians(org["lat"])), 1e-6))
    if body == "Moon":          # south pole: both axes are eastings in polar stereographic
        lat = org["lat"] - abs(y) / M_PER_DEG_LAT
    return float(np.clip(lat, -90, 90)), float(lon)


def harmonize(df: pd.DataFrame):
    flags = audit_crs(df)
    flag_by_body = dict(zip(flags.body, flags.crs_flag))
    out = df.copy()
    out["crs_flag"] = out.body.map(flag_by_body)

    la, lo = [], []
    for _, r in out.iterrows():
        a, b = approx_geo_center(r, flag_by_body)
        la.append(a); lo.append(b)
    out["approx_lat"] = np.round(la, 5)
    out["approx_lon"] = np.round(np.asarray(lo, dtype=float), 5)

    # --- scale-free matching features ---
    out["slope_cv"] = out.slope_deg_stdDev / out.slope_deg_mean.clip(lower=1e-6)
    out["roughness_rel"] = out.roughness_m_mean / TILE_SIZE_M
    out["roughness_cv"] = out.roughness_m_stdDev / out.roughness_m_mean.clip(lower=1e-6)
    out["slope_log_ratio"] = np.log10(1.0 + out.slope_deg_mean * PIXEL_M / 100.0)

    # --- per-body robust standardization (median / 1.4826*MAD) ---
    # This is the core harmonization step: every feature is expressed as
    # "how unusual for THIS body" instead of an absolute metre/degree value.
    for f in MATCH_FEATURES:
        med = out.groupby("body")[f].transform("median")
        mad = out.groupby("body")[f].transform(lambda s: s.abs().sub(s.median()).abs().median())
        scale = (1.4826 * mad).replace(0, np.nan)
        fallback = out.groupby("body")[f].transform("std").replace(0, 1.0)
        out[f + "_robust"] = ((out[f] - med) / scale.fillna(fallback)).clip(-6, 6)
    out.attrs["robust_cols"] = [f + "_robust" for f in MATCH_FEATURES]
    out.attrs["match_features"] = MATCH_FEATURES
    return out, flags


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--master", default=DEFAULT_MASTER)
    ap.add_argument("--out", default=DEFAULT_OUT)
    args = ap.parse_args()

    df = pd.read_csv(args.master)
    print(f"loaded {args.master}: {df.shape}")
    print(df.body.value_counts().to_string(), "\n")

    out, flags = harmonize(df)
    print("=== CRS AUDIT ===")
    print(flags.to_string(index=False), "\n")

    print("=== EXCLUDED FEATURES (and why) ===")
    for k, v in EXCLUDED.items():
        print(f"  {k}: {v}")
    print()

    print("=== MATCH FEATURE SPREAD BY BODY (raw) ===")
    print(out.groupby("body")[MATCH_FEATURES].median().round(4).to_string())
    print("\n=== SAME, AFTER ROBUST STANDARDIZATION (should overlap ~0) ===")
    print(out.groupby("body")[[f + "_robust" for f in MATCH_FEATURES]].median().round(4).to_string())

    out.to_csv(args.out, index=False)
    print(f"\nwrote {args.out}  ({out.shape[0]} rows, {out.shape[1]} cols)")


if __name__ == "__main__":
    main()
