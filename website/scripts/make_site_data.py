#!/usr/bin/env python3
"""Export the trained TerraTwin pipeline artifacts into slim, static-friendly site data.

Reads (never writes outside public/):
  ml/data/ml_products.json
  ml/data/terratwin_ml_ranked.csv
  ml/data/terratwin_harmonized.csv
  ml/data/transferability_report.csv
  ml/docs/figures/terratwin_model_report.png

Writes:
  public/data/ml_products.json            verbatim artifact copy (provenance)
  public/data/transferability_report.csv   verbatim artifact copy (provenance)
  public/data/terratwin_ml_ranked.json     slim columnar export of the 7,180 scored tiles
  public/data/reference.json               Earth-pool quantiles / moments used by the matcher
  public/data/bodies.json                  per-body stats, named sites, target signatures
  public/data/photo_label_schema.json      schema + validation rules for the future image model
  public/data/photo_label_schema.csv       fill-in template for the user's training data
  public/figures/model_report.png          exported report figure

The site must render only measured values: this script carries no hand-typed scores.
"""

import csv
import json
import math
import os
import shutil

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, "ml")
OUT = os.path.join(ROOT, "public")
DATA = os.path.join(OUT, "data")
FIGS = os.path.join(OUT, "figures")

ARCH_NAMES = ["A1_escarpment", "A2_coarse_fan", "A3_deltaic_plain", "A4_hardpan_flat"]

# Column layout of the slim tile table: short keys keep the payload small.
COLS = [
    ("id", "tile_id_stripped", 0),
    ("lat", "approx_lat", 4),
    ("lon", "approx_lon", 4),
    ("q", "site_quality", 4),
    ("sl", "slope_deg_mean", 3),
    ("sd", "slope_deg_stdDev", 3),
    ("rs", "roughness_m_mean", 3),
    ("rd", "roughness_m_stdDev", 3),
    ("scv", "slope_cv", 4),
    ("rcv", "roughness_cv", 4),
    ("al", "albedo_mean", 4),
    ("tr", "temp_range_K_mean", 2),
    ("ar", "aridity_index_mean", 4),
    ("a", "archetype_index", 0),
    ("p1", "arch_A1_escarpment", 3),
    ("p2", "arch_A2_coarse_fan", 3),
    ("p3", "arch_A3_deltaic_plain", 3),
    ("p4", "arch_A4_hardpan_flat", 3),
]


def rnd(v, nd):
    """Round a CSV value; NULL/empty becomes None so gaps stay visible in the UI."""
    if v is None or v == "" or (isinstance(v, str) and v.upper() in ("NULL", "NAN")):
        return None
    try:
        f = float(v)
    except (TypeError, ValueError):
        return None
    if math.isnan(f):
        return None
    return round(f, nd) if nd else f


def med(key, vals):
    """Median or None, so a NULL feature stays NULL instead of crashing."""
    st = quantiles(vals)
    return None if st is None else st["q50"]


def read_rows(path):
    with open(path, newline="") as fh:
        return list(csv.DictReader(fh))


def quantiles(vals, ps=(0.02, 0.1, 0.25, 0.5, 0.75, 0.9, 0.98)):
    v = sorted(x for x in vals if x is not None)
    if not v:
        return None
    out = {}
    for p in ps:
        idx = min(len(v) - 1, max(0, int(round(p * (len(v) - 1)))))
        out[f"q{int(p * 100):02d}"] = round(v[idx], 5)
    mean = sum(v) / len(v)
    var = sum((x - mean) ** 2 for x in v) / len(v)
    out["mean"] = round(mean, 5)
    out["std"] = round(math.sqrt(var), 5)
    out["min"] = round(v[0], 5)
    out["max"] = round(v[-1], 5)
    out["n"] = len(v)
    return out


def main():
    os.makedirs(DATA, exist_ok=True)
    os.makedirs(FIGS, exist_ok=True)

    products = json.load(open(os.path.join(SRC, "data", "ml_products.json")))
    ranked = read_rows(os.path.join(SRC, "data", "terratwin_ml_ranked.csv"))
    harmon = read_rows(os.path.join(SRC, "data", "terratwin_harmonized.csv"))

    # ---- verbatim provenance copies -------------------------------------------
    shutil.copyfile(os.path.join(SRC, "data", "ml_products.json"),
                    os.path.join(DATA, "ml_products.json"))
    shutil.copyfile(os.path.join(SRC, "data", "transferability_report.csv"),
                    os.path.join(DATA, "transferability_report.csv"))
    shutil.copyfile(os.path.join(SRC, "docs", "figures", "terratwin_model_report.png"),
                    os.path.join(FIGS, "model_report.png"))

    # ---- slim ranked tiles ----------------------------------------------------
    earth = [r for r in ranked if r["body"] == "Earth"]
    table = []
    for r in earth:
        row = []
        for key, src, nd in COLS:
            if key == "id":
                row.append(r["tile_id"].replace("EARTH_WD_", ""))
            elif key == "a":
                row.append(ARCH_NAMES.index(r["archetype"]) + 1 if r["archetype"] in ARCH_NAMES else 0)
            else:
                row.append(rnd(r.get(src), nd))
        table.append(row)

    json.dump({"columns": [c[0] for c in COLS], "source": "terratwin_ml_ranked.csv",
               "rows": len(table), "geometry_km": 5.0, "px_per_tile": 50,
               "meters_per_px": 100, "data": table},
              open(os.path.join(DATA, "terratwin_ml_ranked.json"), "w"),
              separators=(",", ":"))

    # ---- reference moments used by the photo matcher --------------------------
    feats = ["sl", "sd", "rs", "rd", "scv", "rcv", "al", "tr", "ar", "q"]
    idx = {c[0]: i for i, c in enumerate(COLS)}
    ref = {"feature_keys": feats, "stats": {}}
    for f in feats:
        ref["stats"][f] = quantiles([row[idx[f]] for row in table])
    ref["archetype_counts"] = {n: sum(1 for row in table if row[idx["a"]] == i + 1)
                               for i, n in enumerate(ARCH_NAMES)}
    ref["spatial_blocks"] = products["site_quality_model"]["spatial_blocks"]
    ref["block_deg"] = products["site_quality_model"]["block_deg"]
    ref["note"] = ("Earth-pool moments for the 7,180 scored Western Desert tiles. The photo "
                   "matcher standardises both sides with these numbers; it is a structural "
                   "prior, not a learned image match.")
    json.dump(ref, open(os.path.join(DATA, "reference.json"), "w"), indent=1)

    # ---- per-body stats, named sites, target signatures -----------------------
    by_body = {}
    for body in ("Earth", "Mars", "Moon"):
        rows = [r for r in harmon if r["body"] == body]
        by_body[body] = {
            "tiles": len(rows),
            "region": sorted({r["region_name"] for r in rows}),
            "dem_grid_m": products["dem_grid_m"][body],
            "crs_flag": sorted({r["crs_flag"] for r in rows}),
            "medians": {k: med(qname, [rnd(r[qname], d) for r in rows])
                        for k, qname, d in (
                            ("slope_deg_mean", "slope_deg_mean", 3),
                            ("roughness_m_mean", "roughness_m_mean", 3),
                            ("slope_cv", "slope_cv", 4),
                            ("roughness_cv", "roughness_cv", 4),
                            ("albedo_mean", "albedo_mean", 4),
                            ("temp_range_K_mean", "temp_range_K_mean", 2))},
            "albedo_status": ("measured (MODIS/S2, Liang 2001)" if body == "Earth"
                              else f"placeholder constant {quantiles([rnd(r['albedo_mean'], 4) for r in rows])['q50']} - no real albedo layer"),
            "temp_aridity_status": ("measured" if body == "Earth"
                                    else "NULL for all tiles in this dataset"),
        }

    by_body["Earth"]["named_context"] = [
        {"name": "Gilf Kebir plateau", "lat": 24.0, "lon": 25.7,
         "note": "Nubian Sandstone escarpments, source of A1 class"},
        {"name": "Abu Ballus / Dakhla structure line", "lat": 25.05, "lon": 28.35,
         "note": "carbonate and hardpan flats, source of A4 class"},
    ]
    by_body["Mars"]["named_sites"] = [
        {"name": "Jezero Crater (Perseverance)", "lat": 18.38, "lon": 77.58,
         "note": "delta front / upper fan: Melyn 749-22, Otis Peak 822-23, "
                 "Pilot Mountain 882-24", "source": "Mars 2020 IR Vol.3, Farley & Stack 2024-07-11"},
    ]
    by_body["Moon"]["named_sites"] = [
        {"name": "Apollo 17 Taurus-Littrow", "lat": 20.19, "lon": 30.77,
         "note": "high-Ti mare floor, albedo 0.07-0.10", "source": "USGS PP 1080 p.125; NASA SP-418"},
        {"name": "Lunar South Pole", "lat": -89.5, "lon": 0.0,
         "note": "cratered anorthositic highlands + permanently shadowed margins",
         "source": "LOLA 90S window in this dataset"},
    ]

    bodies = {
        "bodies": by_body,
        "targets": products["targets"],
        "transferability": products["transfer_diagnostics"],
        "interpretation": products["interpretation"],
        "lrv_slope_limit_deg": products["lrv_slope_limit_deg"],
        "status": products["status"],
        "generated_from": ["ml_products.json", "terratwin_ml_ranked.csv",
                           "terratwin_harmonized.csv", "transferability_report.csv"],
    }
    json.dump(bodies, open(os.path.join(DATA, "bodies.json"), "w"), indent=1)

    # ---- photo training-data schema (the user is assembling this now) ---------
    schema = {
        "name": "terratwin_photo_labels_v1",
        "purpose": ("Training table for the learned photo-to-Earth model: one row per image "
                    "with its geometry, sensor state and the Earth tile it should resolve to."),
        "tile_geometry": {"size_km": 5.0, "meters_per_px": 100, "px": 50,
                          "channels": ["R", "G", "B", "Hillshade"],
                          "earth_dem": "SRTMGL1_003 (30 m)", "mars_dem": "HRSC/MOLA blend (200 m)",
                          "moon_dem": "LOLA (118 m)"},
        "columns": [
            {"name": "image_id", "type": "str", "required": True,
             "rule": "unique; filename stem of the source image"},
            {"name": "source_body", "type": "enum", "required": True,
             "values": ["Earth", "Moon", "Mars", "Venus_radar", "Titan_sar"],
             "rule": "solid-body targets only; gas-giant cloud imagery is out of scope"},
            {"name": "sensor", "type": "str", "required": True,
             "example": "Mastcam-Z L; LROC NAC; PSMO Mars 2020 S-200; Sentinel-2 L2A"},
            {"name": "is_raw_jpeg", "type": "bool", "required": True,
             "rule": "true means gain/white-balance applied - blocks albedo reuse"},
            {"name": "radiometric_albedo_mean", "type": "float", "required": False,
             "rule": "only if the image is radiometrically calibrated; else null"},
            {"name": "incidence_deg", "type": "float", "required": False},
            {"name": "emission_deg", "type": "float", "required": False},
            {"name": "phase_deg", "type": "float", "required": False},
            {"name": "sun_elev_deg", "type": "float", "required": False,
             "rule": "needed before any slope proxy is trusted"},
            {"name": "gsd_m_per_px", "type": "float", "required": True,
             "rule": "ground sample distance of the photo, drives the scale harmonisation"},
            {"name": "target_tile_id", "type": "str", "required": True,
             "rule": "the Earth tile the image should map to; must exist in terratwin_ml_ranked.csv"},
            {"name": "target_archetype", "type": "enum", "required": True,
             "values": ARCH_NAMES},
            {"name": "pair_label", "type": "int", "required": True,
             "rule": "1 same geomorphic class, 0 different class (contrastive pairs)"},
            {"name": "split_block", "type": "str", "required": True,
             "rule": "0.81 deg spatial block key of target_tile_id - never random rows"},
            {"name": "split_region", "type": "str", "required": True,
             "rule": "province name; leave-region-out folds are built from this"},
            {"name": "annotator_confidence", "type": "float", "required": False,
             "rule": "0..1; drop rows below 0.6 from training, keep for evaluation"}
        ],
        "validation_rules": [
            "target_tile_id must join to the ranked tile table (7,180 Earth tiles)",
            "radiometric_albedo_mean may be null only when is_raw_jpeg is true",
            "images from a province held out for evaluation must not appear in training",
            "no image may contribute more than 5% of one archetype class",
            "gsd_m_per_px within 2 orders of magnitude of the tile geometry, else resample first",
            "each split_block appears in exactly one fold",
        ],
        "honest_evaluation": [
            "primary metric: leave-region-out top-1/top-5 archetype accuracy and median "
            "rank of the true tile, never in-region accuracy",
            "report a domain-classifier AUC between photo features and Earth tile features; "
            "if it stays above ~0.9 the match is still sensor-bound and must be labelled so",
            "report band width (lat/lon km) of the top-5 neighbours as the uncertainty measure",
        ],
        "note": ("This schema is the contract the site's browser matcher will be replaced by. "
                 "The current photo panel uses only features a single uncalibrated photograph "
                 "can provide, and labels them as structural proxies."),
    }
    json.dump(schema, open(os.path.join(DATA, "photo_label_schema.json"), "w"), indent=1)

    cols = [c["name"] for c in schema["columns"]]
    with open(os.path.join(DATA, "photo_label_schema.csv"), "w", newline="") as fh:
        w = csv.writer(fh)
        w.writerow(cols)
        w.writerow(["M2020_004217_L0", "Mars", "Mastcam-Z L", "true", "", "38.2", "12.4", "26.7",
                    "14.9", "0.34", "EARTH_WD_137,568", "A3_deltaic_plain", "1", "block_25_28",
                    "Western_Desert_Egypt", "0.8"])
        w.writerow(["NAC_001882_R0", "Moon", "LROC NAC", "true", "", "61.0", "8.1", "52.9",
                    "-3.2", "0.5", "EARTH_WD_68,553", "A4_hardpan_flat", "0", "block_25_25",
                    "Western_Desert_Egypt", "0.65"])

    sizes = {f: os.path.getsize(os.path.join(DATA, f)) for f in sorted(os.listdir(DATA))}
    print(json.dumps({"tiles": len(table), "columns": [c[0] for c in COLS],
                      "data_files_bytes": sizes,
                      "figure_bytes": os.path.getsize(os.path.join(FIGS, "model_report.png"))},
                     indent=1))


if __name__ == "__main__":
    main()
