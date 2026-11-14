"""TerraTwin data access layer.

Reads the real ML dataset when it is available next to the backend, and degrades
gracefully to "not loaded" so the demo endpoints keep working on a clean checkout.

Expected files (see docs/ARCHITECTURE.md):
  data/terratwin_master_dataset.csv   9,680 tiles (7,180 earth / 900 mars / 1,600 moon)
  data/tile_embeddings.csv            tile_id + 64 embedding columns (written by 02_train_and_rank.py)
  checkpoints/terratwin_model.pt      trained TerraTwinNet weights
"""

from __future__ import annotations

import os
import threading
from typing import Dict, List, Optional

import numpy as np
import pandas as pd

DATA_DIR = os.environ.get("TERRATWIN_DATA_DIR", "data")
MASTER_CSV = os.path.join(DATA_DIR, "terratwin_master_dataset.csv")
EMBEDDINGS_CSV = os.path.join(DATA_DIR, "tile_embeddings.csv")

# Signature used for classic (non-learned) similarity ranking.
SIGNATURE_COLUMNS = ["slope_deg_mean", "roughness_m_mean", "albedo_mean"]

# Column-name aliases: E/GEE and the NASA traverse CSV use both "_" and " " separators.
_ALIASES = {
    "slope_deg_mean": ["slope_deg_mean", "slope_mean", "slope_deg", "slope"],
    "roughness_m_mean": ["roughness_m_mean", "roughness_mean", "roughness_m", "roughness"],
    "albedo_mean": ["albedo_mean", "albedo", "broadband_albedo", "albedo_lang2001"],
    "lst_day_mean": ["lst_day_mean", "lst_day", "day_lst_mean"],
    "lst_night_mean": ["lst_night_mean", "lst_night", "night_lst_mean"],
    "lst_diurnal_range": ["lst_diurnal_range", "diurnal_range", "lst_range"],
    "aridity_index": ["aridity_index", "aridity", "ai"],
    "lat_min": ["lat_min", "south", "lat_south"],
    "lat_max": ["lat_max", "north", "lat_north"],
    "lon_min": ["lon_min", "west", "lon_west"],
    "lon_max": ["lon_max", "east", "lon_east"],
    "planetocentric_latitude": ["planetocentric_latitude", "planetocentric latitude"],
    "planetodetic_latitude": ["planetodetic_latitude", "planetodetic latitude"],
}

_lock = threading.Lock()
_cache: Dict[str, object] = {"df": None, "loaded": False, "error": None}


def normalize_columns(df: pd.DataFrame) -> pd.DataFrame:
    """Rename known aliases to the canonical snake_case schema."""
    out = df.copy()
    lower = {c.lower().strip(): c for c in out.columns}
    for canonical, candidates in _ALIASES.items():
        if canonical in out.columns:
            continue
        for cand in candidates:
            if cand in lower:
                out = out.rename(columns={lower[cand]: canonical})
                break
    # Never trust planetodetic_latitude (corrupted/constant in best_interp.csv).
    if "lat" not in out.columns:
        for col in ("lat_center", "latitude", "planetocentric_latitude"):
            if col in out.columns:
                out["lat"] = out[col]
                break
    if "lng" not in out.columns:
        for col in ("lon_center", "longitude", "lon"):
            if col in out.columns:
                out["lng"] = out[col]
                break
    return out


def load_master(raise_on_missing: bool = False) -> Optional[pd.DataFrame]:
    """Load and cache the master dataset. Returns None if it is not on disk."""
    with _lock:
        if _cache["loaded"]:
            if _cache["error"] and raise_on_missing:
                raise FileNotFoundError(_cache["error"])
            return _cache["df"]  # type: ignore[return-value]

        if not os.path.exists(MASTER_CSV):
            _cache["loaded"] = True
            _cache["error"] = f"{MASTER_CSV} not found"
            return None

        try:
            df = normalize_columns(pd.read_csv(MASTER_CSV))
        except Exception as exc:  # corrupt/partial export
            _cache["loaded"] = True
            _cache["error"] = f"failed to read {MASTER_CSV}: {exc}"
            if raise_on_missing:
                raise
            return None

        if "body" in df.columns:
            df["body"] = df["body"].astype(str).str.lower().str.strip()
        _cache["df"] = df
        _cache["loaded"] = True
        _cache["error"] = None
        return df


def status() -> Dict[str, object]:
    df = load_master()
    if df is None:
        return {
            "master_dataset": MASTER_CSV,
            "loaded": False,
            "reason": _cache["error"] or "not loaded",
            "embeddings": os.path.exists(EMBEDDINGS_CSV),
        }
    counts = df["body"].value_counts().to_dict() if "body" in df.columns else {}
    return {
        "loaded": True,
        "tiles": int(len(df)),
        "by_body": {str(k): int(v) for k, v in counts.items()},
        "signature_columns": [c for c in SIGNATURE_COLUMNS if c in df.columns],
        "embeddings": os.path.exists(EMBEDDINGS_CSV),
        "rows": df.columns.tolist(),
    }


def _zscore(df: pd.DataFrame, cols: List[str]) -> np.ndarray:
    x = df[cols].to_numpy(dtype=float)
    mu = np.nanmean(x, axis=0)
    sd = np.nanstd(x, axis=0)
    sd[sd == 0] = 1.0
    return np.nan_to_num((x - mu) / sd)


def list_tiles(body: Optional[str] = None, limit: int = 200, offset: int = 0) -> Dict[str, object]:
    df = load_master()
    if df is None:
        return {"loaded": False, "total": 0, "tiles": []}
    view = df if not body else df[df["body"] == body.lower()]
    cols = [c for c in ["tile_id", "body", "lat_min", "lat_max", "lon_min", "lon_max",
                        *SIGNATURE_COLUMNS, "lst_day_mean", "lst_night_mean",
                        "lst_diurnal_range", "aridity_index"] if c in view.columns]
    sub = view[cols].iloc[offset: offset + limit]
    return {
        "loaded": True,
        "total": int(len(view)),
        "offset": offset,
        "limit": limit,
        "tiles": sub.where(pd.notna(sub), None).to_dict(orient="records"),
    }


def rank_analogs(
    signature: Dict[str, float],
    top_k: int = 10,
    body: str = "earth",
) -> Dict[str, object]:
    """Rank stored tiles by z-scored Euclidean distance to a physical signature.

    This is the transparent baseline that works *today*, straight from the CSV.
    Once Head 2 is trained, `/api/similarity?mode=embedding` swaps in the learned
    64-D cosine ranking over the same rows.
    """
    df = load_master()
    if df is None:
        raise FileNotFoundError(MASTER_CSV)

    cols = [c for c in SIGNATURE_COLUMNS if c in df.columns and c in signature]
    if not cols:
        raise ValueError(
            f"no usable signature columns; provide any of {SIGNATURE_COLUMNS} present in the dataset"
        )

    earth = df[df["body"] == body.lower()] if "body" in df.columns else df
    z_tiles = _zscore(earth, cols)
    mu = earth[cols].to_numpy(dtype=float).mean(axis=0)
    sd = earth[cols].to_numpy(dtype=float).std(axis=0)
    sd[sd == 0] = 1.0
    q = np.array([float(signature.get(c, mu[i])) for i, c in enumerate(cols)])
    qz = (q - mu) / sd

    dist = np.sqrt(((z_tiles - qz) ** 2).sum(axis=1))
    order = np.argsort(dist)[: max(1, int(top_k))]

    out = []
    for rank, idx in enumerate(order, start=1):
        row = earth.iloc[int(idx)]
        sim = float(1.0 / (1.0 + float(dist[int(idx)])))
        item = {
            "rank": rank,
            "similarity": round(sim, 4),
            "distance_sigma": round(float(dist[int(idx)]), 3),
        }
        for c in ["tile_id", "body", "lat_min", "lat_max", "lon_min", "lon_max",
                  *SIGNATURE_COLUMNS, "aridity_index", "chip_path"]:
            if c in earth.columns:
                v = row[c]
                item[c] = None if pd.isna(v) else (float(v) if isinstance(v, (int, float, np.floating)) else v)
        if "lat_min" in item and "lon_min" in item and item["lat_min"] is not None:
            item["lat"] = round((item["lat_min"] + (item["lat_max"] or item["lat_min"])) / 2, 4)
            item["lng"] = round((item["lon_min"] + (item["lon_max"] or item["lon_min"])) / 2, 4)
        out.append(item)

    return {
        "query_signature": {c: float(signature[c]) for c in cols},
        "signature_used": cols,
        "candidates": int(len(earth)),
        "method": "zscore_euclidean_baseline",
        "results": out,
    }


def rank_by_embedding(tile_id: str, top_k: int = 10) -> Dict[str, object]:
    """Cosine ranking over the trained 64-D Head-2 embeddings (needs data/tile_embeddings.csv)."""
    if not os.path.exists(EMBEDDINGS_CSV):
        raise FileNotFoundError(
            f"{EMBEDDINGS_CSV} not found - export embeddings from 02_train_and_rank.py first"
        )
    emb = pd.read_csv(EMBEDDINGS_CSV)
    id_col = "tile_id" if "tile_id" in emb.columns else emb.columns[0]
    vec_cols = [c for c in emb.columns if c != id_col]
    if tile_id not in set(emb[id_col].astype(str)):
        raise KeyError(f"tile_id {tile_id!r} not in embeddings")
    matrix = emb[vec_cols].to_numpy(dtype=float)
    matrix = matrix / (np.linalg.norm(matrix, axis=1, keepdims=True) + 1e-9)
    q = matrix[emb[id_col].astype(str).eq(str(tile_id)).to_numpy().argmax()]
    sims = matrix @ q
    order = np.argsort(-sims)[: max(1, int(top_k)) + 1]
    results = [
        {"rank": i + 1, "tile_id": str(emb[id_col].iloc[int(ix)]), "cosine": round(float(sims[int(ix)]), 4)}
        for i, ix in enumerate(order)
    ]
    return {"tile_id": tile_id, "dimensions": len(vec_cols), "method": "embedding_cosine", "results": results}


# ---------------------------------------------------------------------------
# v4 additions: harmonized features, scale-stable cross-body ranking,
# and the trained-model products written by 04_ml_rank.py.
# ---------------------------------------------------------------------------

HARMONIZED_CSV = os.path.join(DATA_DIR, "terratwin_harmonized.csv")
ML_PRODUCTS_JSON = os.path.join(DATA_DIR, "ml_products.json")
TRANSFER_CSV = os.path.join(DATA_DIR, "transferability_report.csv")

# Features admitted by the domain-classifier transferability test in 04_ml_rank.py.
SCALE_STABLE_FEATURES = ["slope_cv", "roughness_cv", "slope_spread_ratio", "slope_log_ratio"]
_RANK_WEIGHTS = {"slope_cv": 1.0, "roughness_cv": 1.0, "slope_spread_ratio": 0.8,
                 "slope_log_ratio": 0.4}
_harm_cache: Dict[str, Optional[pd.DataFrame]] = {"df": None, "loaded": False}


def load_harmonized() -> Optional[pd.DataFrame]:
    if _harm_cache["loaded"]:
        return _harm_cache["df"]
    _harm_cache["loaded"] = True
    df = load_master()
    if os.path.exists(HARMONIZED_CSV):
        try:
            _harm_cache["df"] = normalize_columns(pd.read_csv(HARMONIZED_CSV))
        except Exception:
            _harm_cache["df"] = df
    else:
        _harm_cache["df"] = df
    if _harm_cache["df"] is not None and "body" in _harm_cache["df"].columns:
        _harm_cache["df"]["body"] = _harm_cache["df"]["body"].astype(str).str.lower().str.strip()
    return _harm_cache["df"]


def _ensure_derived(df: pd.DataFrame) -> pd.DataFrame:
    out = df.copy()
    if "slope_deg_stdDev" in out.columns and "slope_cv" not in out.columns:
        out["slope_cv"] = out.slope_deg_stdDev / out.slope_deg_mean.clip(lower=1e-6)
    if "roughness_m_stdDev" in out.columns and "roughness_cv" not in out.columns:
        out["roughness_cv"] = out.roughness_m_stdDev / out.roughness_m_mean.clip(lower=1e-6)
    if "slope_spread_ratio" not in out.columns and "slope_deg_stdDev" in out.columns:
        out["slope_spread_ratio"] = out.slope_deg_stdDev / out.slope_deg_mean.clip(lower=1e-6)
    if "slope_log_ratio" not in out.columns and "slope_deg_mean" in out.columns:
        out["slope_log_ratio"] = np.log10(1.0 + out.slope_deg_mean)
    if "region_name" in out.columns:
        out["region_name"] = out.region_name.astype(str)
    return out


def rank_analogs_scale_stable(signature: Dict[str, float], top_k: int = 10,
                             body: str = "earth") -> Dict[str, object]:
    """Rank using only scale-stable statistics, referenced to Earth's own spread.

    Unlike rank_analogs() (which mixes metres from different DEMs), this compares
    dimensionless texture ratios - the statistics the transferability test showed
    to survive cross-body comparison.
    """
    df = _ensure_derived(load_harmonized())
    if df is None:
        raise FileNotFoundError(MASTER_CSV)
    earth = df[df["body"] == "earth"].copy()
    cols = [c for c in SCALE_STABLE_FEATURES if c in signature and c in earth.columns]
    if not cols:
        raise ValueError("provide any of " + ", ".join(SCALE_STABLE_FEATURES))
    med = {c: float(earth[c].median()) for c in cols}
    mad = {c: float(max(1.4826 * (earth[c] - earth[c].median()).abs().median(), 1e-9)) for c in cols}
    w = np.array([_RANK_WEIGHTS.get(c, 0.5) for c in cols])
    z = np.column_stack([(earth[c].to_numpy(float) - med[c]) / mad[c] for c in cols])
    q = np.array([(float(signature[c]) - med[c]) / mad[c] for c in cols])
    dist = np.sqrt((((z - q) * w) ** 2).sum(axis=1))
    d50 = float(np.median(dist))
    order = np.argsort(dist)[: max(1, int(top_k))]
    results = []
    for rank, ix in enumerate(order, start=1):
        row = earth.iloc[int(ix)]
        item = {"rank": rank, "similarity": round(float(1.0 / (1.0 + dist[ix] / max(d50, 1e-9))), 4),
                "distance": round(float(dist[ix]), 4), "method": "scale_stable_texture"}
        for c in ["tile_id", "region_name", "approx_lat", "approx_lon", "center_lat", "center_lon",
                  *SCALE_STABLE_FEATURES, "slope_deg_mean", "roughness_m_mean"]:
            if c in earth.columns and pd.notna(row[c]):
                item[c] = row[c] if isinstance(row[c], str) else round(float(row[c]), 5)
        results.append(item)
    return {"query": signature, "features_used": cols, "earth_reference_median": med,
            "earth_reference_scale": {k: round(v, 5) for k, v in mad.items()},
            "candidates": int(len(earth)), "results": results}


def load_ml_products() -> Optional[Dict]:
    import json
    if not os.path.exists(ML_PRODUCTS_JSON):
        return None
    with open(ML_PRODUCTS_JSON) as f:
        return json.load(f)


def load_transferability() -> Optional[List[Dict]]:
    if not os.path.exists(TRANSFER_CSV):
        prods = load_ml_products()
        return prods.get("transfer_diagnostics") if prods else None
    try:
        return pd.read_csv(TRANSFER_CSV).where(pd.notna(pd.read_csv(TRANSFER_CSV)), None)\
            .to_dict(orient="records")
    except Exception:
        return None
