"""TerraTwin ML endpoints: real dataset + trained-model access.

Mounted by main.py. These endpoints read data/terratwin_master_dataset.csv
(9,680 tiles) when present, so the frontend can graduate from the hand-typed
EARTH_ANALOGS_DB scores to measured similarity.
"""

from __future__ import annotations

from typing import List, Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

import terratwin_data as tdata

router = APIRouter(tags=["ml-dataset"])


class SignatureRequest(BaseModel):
    slope_deg_mean: Optional[float] = None
    roughness_m_mean: Optional[float] = None
    albedo_mean: Optional[float] = None
    top_k: int = 10
    body: str = "earth"


class TileBatchRequest(BaseModel):
    tile_ids: List[str]
    top_k: int = 10


def _isnan(v) -> bool:
    if v is None:
        return True
    try:
        return bool(float(v) != float(v))  # NaN != NaN
    except (TypeError, ValueError):
        return False


@router.get("/api/data-status")
def data_status():
    """Report whether the real ML dataset is loaded (vs. the hardcoded demo list)."""
    return tdata.status()


@router.get("/api/tiles")
def tiles(body: Optional[str] = None, limit: int = 200, offset: int = 0):
    """Page through tile measurements; body = earth | mars | moon."""
    return tdata.list_tiles(body=body, limit=min(int(limit), 2000), offset=max(int(offset), 0))


@router.post("/api/similarity")
def similarity(req: SignatureRequest):
    """Rank stored tiles against a physical signature (z-scored Euclidean baseline).

    Works today from the CSV alone. After Head 2 is trained, use
    /api/tiles/{tile_id}/rank for the learned 64-D cosine ranking.
    """
    signature = {
        c: getattr(req, c)
        for c in tdata.SIGNATURE_COLUMNS
        if getattr(req, c) is not None
    }
    if not signature:
        raise HTTPException(status_code=400, detail="provide at least one of " + ", ".join(tdata.SIGNATURE_COLUMNS))
    try:
        return tdata.rank_analogs(signature, top_k=req.top_k, body=req.body)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=409, detail=str(exc))
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc))


@router.get("/api/tiles/{tile_id}/rank")
def rank_tile(tile_id: str, top_k: int = 10):
    """Cosine ranking over the trained 64-D embeddings (needs data/tile_embeddings.csv)."""
    try:
        return tdata.rank_by_embedding(tile_id, top_k=top_k)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=409, detail=str(exc))
    except KeyError as exc:
        raise HTTPException(status_code=404, detail=str(exc))


@router.get("/api/region-stats")
def region_stats(body: Optional[str] = "earth"):
    """Aggregate signature statistics per body - handy for charts and sanity checks."""
    df = tdata.load_master()
    if df is None:
        raise HTTPException(status_code=409, detail=f"{tdata.MASTER_CSV} not found")
    view = df if not body else df[df["body"] == body.lower()]
    cols = [c for c in tdata.SIGNATURE_COLUMNS if c in view.columns]
    if not cols:
        raise HTTPException(status_code=422, detail="signature columns missing from dataset")
    stats = view[cols].describe().to_dict()
    return {
        "body": body,
        "tiles": int(len(view)),
        "stats": {k: {kk: (None if _isnan(vv) else round(float(vv), 4)) for kk, vv in v.items()} for k, v in stats.items()},
    }



# ---------------------------------------------------------------- v4 endpoints
class TextureSignatureRequest(BaseModel):
    slope_cv: Optional[float] = None
    roughness_cv: Optional[float] = None
    slope_spread_ratio: Optional[float] = None
    slope_log_ratio: Optional[float] = None
    top_k: int = 10


@router.post("/api/similarity/scale-stable")
def similarity_scale_stable(req: TextureSignatureRequest):
    """Cross-body ranking using ONLY scale-stable texture statistics.

    Prefer this over /api/similarity when the query signature comes from a
    different DEM resolution than the candidates (Earth 30 m vs Mars 200 m /
    Moon 118 m). Absolute metres are not comparable across those grids;
    dimensionless ratios are.
    """
    sig = {k: v for k, v in req.dict().items() if v is not None and k != "top_k"}
    if not sig:
        raise HTTPException(status_code=400,
                            detail="provide at least one of " + ", ".join(tdata.SCALE_STABLE_FEATURES))
    try:
        return tdata.rank_analogs_scale_stable(sig, top_k=req.top_k)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=409, detail=str(exc))
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc))


@router.get("/api/model/products")
def model_products():
    """Full trained-model output from 04_ml_rank.py: transferability diagnostics,
    archetype mix per target, site-quality ranking, validation metrics."""
    prods = tdata.load_ml_products()
    if prods is None:
        raise HTTPException(status_code=409,
                            detail="data/ml_products.json not found - run 04_ml_rank.py")
    return prods


@router.get("/api/model/transferability")
def model_transferability():
    """Domain-classifier AUC decomposition: how much of the Earth/target gap is
    sensor registration (calibratable) versus real geomorphic difference."""
    rep = tdata.load_transferability()
    if rep is None:
        raise HTTPException(status_code=409, detail="no transferability report - run 04_ml_rank.py")
    prods = tdata.load_ml_products() or {}
    return {"records": rep, "interpretation": prods.get("interpretation")}


@router.get("/api/model/target-signature/{name}")
def target_signature(name: str):
    """Named target signature: jezero_upper_fan | lunar_south_pole_all | taurus_littrow_mare."""
    prods = tdata.load_ml_products()
    if prods is None:
        raise HTTPException(status_code=409, detail="run 04_ml_rank.py first")
    targets = prods.get("targets", {})
    if name not in targets:
        raise HTTPException(status_code=404,
                            detail="unknown target %r; available: %s" % (name, sorted(targets)))
    return targets[name]


@router.get("/api/model/site-quality")
def model_site_quality(limit: int = 25):
    """Top Western Desert tiles for a field-test camp, by learned site quality."""
    prods = tdata.load_ml_products()
    if prods is None:
        raise HTTPException(status_code=409, detail="run 04_ml_rank.py first")
    return {"model": prods.get("site_quality_model"),
            "archetype_model": prods.get("archetype_model"),
            "lrv_slope_limit_deg": prods.get("lrv_slope_limit_deg"),
            "top": prods.get("top_site_quality", [])[:limit],
            "status": prods.get("status")}
