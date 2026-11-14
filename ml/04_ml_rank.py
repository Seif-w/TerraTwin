"""TerraTwin measured-terrain pipeline.
This is a rule-labelled terrain model, not a trained image-geolocation system.
See ml/README.md for commands, feature order, provenance and limitations.
"""
import sys, os
import argparse
import numpy as np
import pandas as pd
from scipy.stats import rankdata, spearmanr
from sklearn.ensemble import (HistGradientBoostingClassifier, HistGradientBoostingRegressor)
from sklearn.inspection import permutation_importance
from sklearn.metrics import mean_absolute_error, r2_score, roc_auc_score
from sklearn.model_selection import StratifiedKFold, cross_val_predict

def _default(win_name):
    return os.path.join(os.path.dirname(__file__), "data", win_name)
DEFAULT_HARM = _default("terratwin_harmonized.csv")
DEFAULT_RANKED = _default("terratwin_ml_ranked.csv")
DEFAULT_PRODUCTS = _default("ml_products.json")
DEFAULT_TRANSFER = _default("transferability_report.csv")

DEM_M = {"Earth": 30.0, "Mars": 200.0, "Moon": 118.0}
LRV_SLOPE_LIMIT_DEG = 19.0                    # Apollo S-200 final report
FEATS = ["slope_deg_mean", "slope_deg_stdDev", "slope_cv", "roughness_m_mean",
         "roughness_m_stdDev", "roughness_cv", "slope_log_ratio", "roughness_rel"]
ARCH_FEATS = ["slope_deg_mean", "slope_cv", "roughness_m_mean", "roughness_cv",
              "slope_log_ratio", "albedo_mean", "temp_range_K_mean"]
ARCH_NAMES = ["A1_escarpment", "A2_coarse_fan", "A3_deltaic_plain", "A4_hardpan_flat"]

QUERIES = [
    dict(name="jezero_upper_fan", target_body="Mars",
         constraints={"slope_deg_mean": (2.0, 9.0), "slope_cv": (0.3, 0.9)},
         rationale="M2020 IR Vol.3 unit D-tcl delta front/upper fan: Melyn 749-22, "
                   "Otis Peak 822-23, Pilot Mountain 882-24."),
    dict(name="lunar_south_pole_all", target_body="Moon", constraints={},
         rationale="LOLA 90S window: cratered anorthositic highlands + PSR margins (SP-418)."),
    dict(name="taurus_littrow_mare", target_body="Moon",
         constraints={"slope_deg_mean": (3.0, 12.0), "roughness_rel": (0.0, 0.0025)},
         rationale="Apollo 17 high-Ti mare floor, albedo 0.07-0.10 (USGS PP1080 p.125)."),
]


def softstep(x, x_ok, x_bad):
    x = np.asarray(x, dtype=float)
    t = np.clip((x - x_ok) / max(x_bad - x_ok, 1e-9), 0.0, 1.0)
    return 1.0 - (t * t * (3 - 2 * t))


def derive(h):
    h = h.copy()
    h["slope_cv"] = h.slope_deg_stdDev / h.slope_deg_mean.clip(lower=1e-6)
    h["roughness_cv"] = h.roughness_m_stdDev / h.roughness_m_mean.clip(lower=1e-6)
    h["roughness_rel"] = h.roughness_m_mean / 5000.0
    h["slope_log_ratio"] = np.log10(1.0 + h.slope_deg_mean)
    return h


def quantile_map(target, earth):
    """Map target marginals onto Earth marginals: best possible monotone calibration."""
    out = np.empty_like(np.asarray(target, dtype=float))
    for j in range(target.shape[1]):
        tq = rankdata(target[:, j]) / (len(target) + 1.0)
        eq = np.sort(np.asarray(earth[:, j], dtype=float))
        out[:, j] = np.interp(tq, np.linspace(0, 1, len(eq)), eq)
    return out


def cv_auc(X, y, seed=0):
    m = HistGradientBoostingClassifier(max_iter=150, max_leaf_nodes=15, random_state=seed)
    p = cross_val_predict(m, X, y, cv=StratifiedKFold(5, shuffle=True, random_state=seed),
                          method="predict_proba")[:, 1]
    return float(roc_auc_score(y, p))


def block_ids(df, n_blocks_target=25):
    """Adaptive square spatial blocks over the candidate region.

    A 5 km grid over ~4 deg x 4 deg is only 16 blocks wide if we bin at 5 deg,
    which would make 5-fold block CV degenerate (empty folds). Bin size is chosen
    so the region splits into ~n_blocks_target blocks, minimum 0.25 deg (25 km).
    """
    n = max(len(df), 1)
    span = max(float(df.approx_lat.max()) - float(df.approx_lat.min()),
                float(df.approx_lon.max()) - float(df.approx_lon.min()), 1e-6)
    size = max(span / np.sqrt(max(n_blocks_target, 4)), 0.25)
    la = np.floor(df.approx_lat / size).astype(int)
    lo = np.floor(df.approx_lon / size).astype(int)
    return (la.astype(str) + "_" + lo.astype(str)), round(size, 4)


def make_folds(df, y=None, n_blocks_target=25, n_folds=5, seed=0):
    """Spatial-block folds; fall back to random folds if the region is too coarse."""
    bid, size = block_ids(df, n_blocks_target)
    uniq = np.unique(bid)
    if len(uniq) < n_folds:
        idx = np.arange(len(df))
        np.random.default_rng(seed).shuffle(idx)
        return np.array([i % n_folds for i in
                         np.argsort(np.argsort(idx))]), 0, "random_fallback", None
    rng = np.random.default_rng(seed)
    fold_of = {u: i % n_folds for i, u in enumerate(rng.permutation(uniq))}
    fold = np.array([fold_of[b] for b in bid])
    if y is not None:
        # ensure every fold sees every class: move singleton blocks to the rarest fold
        classes = np.unique(y)
        for f in range(n_folds):
            seen = set(y[fold == f])
            missing = [c for c in classes if c not in seen]
            if missing:
                donors = np.where((y == missing[0]) & (fold != f))[0]
                if len(donors):
                    fold[donors[0]] = f
    return fold, len(uniq), "spatial_block", size


def transferability(h, seed=0):
    e = h[h.body == "Earth"]
    E = e[FEATS].to_numpy(float)
    rows = []
    for body in ["Mars", "Moon"]:
        g = h[h.body == body]
        T = g[FEATS].to_numpy(float)
        y = np.r_[np.zeros(len(E)), np.ones(len(T))]
        shifted = (T - T.mean(0)) / (T.std(0) + 1e-9) * E.std(0) + E.mean(0)
        mapped = quantile_map(T, E)
        rows.append(dict(
            target=body,
            auc_raw=round(cv_auc(np.vstack([E, T]), y, seed), 3),
            auc_shift_scale_aligned=round(cv_auc(np.vstack([E, shifted]), y, seed), 3),
            auc_quantile_mapped=round(cv_auc(np.vstack([E, mapped]), y, seed), 3),
            median_ratio_slope=round(float(g.slope_deg_mean.median() / e.slope_deg_mean.median()), 2),
            median_ratio_roughness=round(float(g.roughness_m_mean.median() /
                                               e.roughness_m_mean.median()), 2),
            median_ratio_slope_cv=round(float(g.slope_cv.median() / e.slope_cv.median()), 2),
            median_ratio_roughness_cv=round(float(g.roughness_cv.median() / e.roughness_cv.median()), 2)))
    return pd.DataFrame(rows)


def _macro_f1(pred, y):
    f1s = []
    for c in np.unique(y):
        tp = int(((pred == c) & (y == c)).sum())
        fp = int(((pred == c) & (y != c)).sum())
        fn = int(((pred != c) & (y == c)).sum())
        prec = tp / max(tp + fp, 1)
        rec = tp / max(tp + fn, 1)
        f1s.append(2 * prec * rec / max(prec + rec, 1e-9))
    return float(np.mean(f1s))


def archetype_labels(earth):
    s = earth.slope_deg_mean.to_numpy(float)
    r = earth.roughness_m_mean.to_numpy(float)
    cv = earth.slope_cv.to_numpy(float)
    A1 = (s >= np.quantile(s, 0.80)) & (cv >= np.quantile(cv, 0.55))
    A2 = (r >= np.quantile(r, 0.75)) & (s < np.quantile(s, 0.80)) & (~A1)
    A4 = (s <= np.quantile(s, 0.35)) & (r <= np.quantile(r, 0.35))
    A3 = (~A1) & (~A2) & (~A4)
    return np.select([A1, A2, A4], [0, 1, 3], default=2)


def fit_archetypes(earth, seed=0):
    X = earth[ARCH_FEATS].to_numpy(float)
    y = archetype_labels(earth)
    fold, n_blk, mode, bsize = make_folds(earth, y=y, seed=seed)
    proba = np.zeros((len(y), len(ARCH_NAMES)))
    for k in range(5):
        tr, te = fold != k, fold == k
        if te.sum() == 0 or tr.sum() == 0:
            continue
        m = HistGradientBoostingClassifier(max_iter=250, learning_rate=0.08, random_state=seed)
        m.fit(X[tr], y[tr])
        p = m.predict_proba(X[te])
        for ci, cls in enumerate(m.classes_):
            proba[te, int(cls)] = p[:, ci]
    acc = float((proba.argmax(1) == y).mean())
    # honest baseline: shuffled labels, and majority-class rate
    rs = np.random.default_rng(seed + 1)
    y_shuf = rs.permutation(y)
    base_proba = np.zeros((len(y), len(ARCH_NAMES)))
    fold_b = fold.copy()
    for k in range(5):
        tr, te = fold_b != k, fold_b == k
        if te.sum() == 0 or tr.sum() == 0:
            continue
        mb = HistGradientBoostingClassifier(max_iter=250, learning_rate=0.08, random_state=seed)
        mb.fit(X[tr], y_shuf[tr])
        pb = mb.predict_proba(X[te])
        for ci, cls in enumerate(mb.classes_):
            base_proba[te, int(cls)] = pb[:, ci]
    shuffled_acc = float((base_proba.argmax(1) == y_shuf).mean())
    majority = float(np.bincount(y, minlength=len(ARCH_NAMES)).max() / len(y))
    final = HistGradientBoostingClassifier(max_iter=250, learning_rate=0.08, random_state=seed).fit(X, y)
    meta = dict(n_tiles=int(len(y)), cv_mode=mode, block_deg=bsize, spatial_blocks=int(n_blk),
                block_cv_accuracy=round(acc, 4),
                block_cv_macro_f1=round(_macro_f1(proba.argmax(1), y), 4),
                baseline_shuffled_label_accuracy=round(shuffled_acc, 4),
                baseline_majority_class_rate=round(majority, 4),
                class_counts={ARCH_NAMES[i]: int((y == i).sum()) for i in range(len(ARCH_NAMES))})
    return final, meta, proba


def suitability_frame(earth):
    out = earth.copy()
    s = earth.slope_deg_mean.to_numpy(float)
    f_slope = softstep(s, 4.0, LRV_SLOPE_LIMIT_DEG * 1.4)
    f_rough = softstep(earth.roughness_m_mean.to_numpy(float), 2.0, 12.0)
    f_patch = softstep(earth.slope_cv.to_numpy(float), 0.6, 1.6)
    f_therm = softstep(np.nan_to_num(earth.temp_range_K_mean.to_numpy(float), nan=15.0), 10.0, 40.0)
    f_day = softstep(np.abs(earth.approx_lat.to_numpy(float)), 25.0, 75.0)
    f_alb = 0.5 + 0.5 * softstep(np.abs(earth.albedo_mean.to_numpy(float) - 0.30), 0.0, 0.25)
    out["f_slope"] = np.round(f_slope, 4)
    out["f_rough"] = np.round(f_rough, 4)
    out["f_patchiness"] = np.round(f_patch, 4)
    out["f_thermal"] = np.round(f_therm, 4)
    out["f_daylight"] = np.round(f_day, 4)
    out["site_quality"] = np.round(np.clip(np.cbrt((f_slope * f_rough) * (f_patch * f_therm)
                                                   * (f_day * f_alb)), 0, 1), 5)
    return out


SQ_FEATS = (FEATS + ["albedo_mean", "temp_range_K_mean", "aridity_index_mean", "approx_lat"])


def fit_site_quality(sq, seed=0):
    cols = [c for c in SQ_FEATS if c in sq.columns]
    X = sq[cols].to_numpy(float)
    y = sq["site_quality"].to_numpy(float)
    fold, n_blk, mode, bsize = make_folds(sq, seed=seed)
    oof = np.zeros(len(y))
    for k in range(5):
        tr, te = fold != k, fold == k
        if te.sum() == 0 or tr.sum() == 0:
            continue
        m = HistGradientBoostingRegressor(max_iter=300, learning_rate=0.07, max_leaf_nodes=31,
                                          l2_regularization=1.0, random_state=seed)
        m.fit(X[tr], y[tr])
        oof[te] = m.predict(X[te])
    final = HistGradientBoostingRegressor(max_iter=300, learning_rate=0.07, max_leaf_nodes=31,
                                          l2_regularization=1.0, random_state=seed).fit(X, y)
    imp = permutation_importance(final, X, y, n_repeats=4, random_state=seed)
    meta = dict(n_tiles=int(len(y)), features=cols, cv_mode=mode, block_deg=bsize,
                spatial_blocks=int(n_blk),
                cv_r2=round(float(r2_score(y, oof)), 4),
                cv_spearman=round(float(spearmanr(oof, y).statistic), 4),
                cv_mae=round(float(mean_absolute_error(y, oof)), 4),
                permutation_importance=dict(sorted({f: round(float(v), 5) for f, v in
                                                    zip(cols, imp.importances_mean)}.items(),
                                                   key=lambda kv: -kv[1])))
    return final, meta, oof


def target_signatures(h, arch_model, earth, seed=0):
    """Calibrate each target into Earth space, then read its archetype mix + reachability."""
    E = earth[FEATS].to_numpy(float)
    res = {}
    for q in QUERIES:
        sub = h[h.body == q["target_body"]]
        sel = sub
        for col, (lo, hi) in q["constraints"].items():
            cand = sel[(sel[col] >= lo) & (sel[col] <= hi)]
            if len(cand) >= 30:
                sel = cand
        T = sel[FEATS].to_numpy(float)
        Tc = quantile_map(T, E)
        cal = sel.copy()
        for j, c in enumerate(FEATS):
            cal[c] = Tc[:, j]
        A = cal[[c for c in ARCH_FEATS if c in cal.columns]].to_numpy(float)
        p = arch_model.predict_proba(A)
        pa = np.zeros((len(cal), len(ARCH_NAMES)))
        for ci, cls in enumerate(arch_model.classes_):
            pa[:, int(cls)] = p[:, ci]
        mix = pa.mean(0)
        band = []
        for j, c in enumerate(FEATS):
            lo, hi = np.quantile(Tc[:, j], [0.1, 0.9])
            frac = float(((earth[c] >= lo) & (earth[c] <= hi)).mean())
            band.append(dict(feature=c, p10=round(float(lo), 4), p90=round(float(hi), 4),
                             earth_fraction_in_band=round(frac, 4)))
        An = sel[[c for c in ARCH_FEATS if c in sel.columns]].to_numpy(float)
        pn = arch_model.predict_proba(An)
        pan = np.zeros((len(sel), len(ARCH_NAMES)))
        for ci, cls in enumerate(arch_model.classes_):
            pan[:, int(cls)] = pn[:, ci]
        mix_native = pan.mean(0)
        res[q["name"]] = dict(target_body=q["target_body"], rationale=q["rationale"],
                              tiles_used=int(len(sel)),
                              archetype_mix={ARCH_NAMES[i]: round(float(mix[i]), 4)
                                             for i in range(len(ARCH_NAMES))},
                              archetype_mix_native_uncalibrated={
                                  ARCH_NAMES[i]: round(float(mix_native[i]), 4)
                                  for i in range(len(ARCH_NAMES))},
                              top_archetype=ARCH_NAMES[int(np.argmax(mix))],
                              top_archetype_native=ARCH_NAMES[int(np.argmax(mix_native))],
                              calibrated_band=band,
                              reachable_fraction=round(float(np.mean([x["earth_fraction_in_band"]
                                                                      for x in band])), 4))
    return res


def run(a):
    h = derive(pd.read_csv(a.harmonized))
    h["body"] = h.body.str.capitalize()
    earth = h[h.body == "Earth"].copy()
    print("loaded %s: %s | Earth candidates %s" % (a.harmonized, str(h.shape), format(len(earth), ",")))

    print("\n=== T1 transferability decomposition ===")
    rep = transferability(h)
    print(rep.to_string(index=False))
    rep.to_csv(a.transfer, index=False)

    print("\n=== T2 geomorphic archetype classifier (Earth, spatial-block CV) ===")
    arch_model, arch_meta, arch_proba = fit_archetypes(earth)
    for i, n in enumerate(ARCH_NAMES):
        earth["arch_" + n] = np.round(arch_proba[:, i], 4)
    earth["archetype"] = [ARCH_NAMES[i] for i in arch_proba.argmax(1)]
    print(pd.Series(arch_meta).to_string())

    print("\n=== T3 site-quality ranker (spatial-block CV) ===")
    sq = suitability_frame(earth)
    model, sq_meta, sq_oof = fit_site_quality(sq)
    sq["site_quality_pred"] = np.round(sq_oof, 4)
    printable = {k: v for k, v in sq_meta.items() if k not in ("permutation_importance", "features")}
    print(pd.Series(printable).to_string())
    print("top features:", list(sq_meta["permutation_importance"].items())[:6])

    print("\n=== T4 target signatures (calibrated into Earth space) ===")
    sigs = target_signatures(h, arch_model, sq)
    for k, v in sigs.items():
        print("  %s: tiles=%d reachable=%.3f calibrated_top=%s native_top=%s"
              % (k, v["tiles_used"], v["reachable_fraction"], v["top_archetype"],
                 v["top_archetype_native"]))
        print("      native mix:", v["archetype_mix_native_uncalibrated"])

    top = sq.sort_values("site_quality", ascending=False).head(a.top_k)
    show = ["tile_id", "approx_lat", "approx_lon", "slope_deg_mean", "roughness_m_mean",
            "slope_cv", "albedo_mean", "site_quality", "archetype"]
    print("\ntop tiles for a field-test camp (site quality):")
    print(top[show].head(10).round(4).to_string(index=False))

    moon_auc = float(rep.loc[rep.target == "Moon", "auc_quantile_mapped"].iloc[0])
    mars_auc = float(rep.loc[rep.target == "Mars", "auc_quantile_mapped"].iloc[0])
    products = dict(
        dem_grid_m=DEM_M, features=FEATS, archetype_features=ARCH_FEATS,
        archetype_names=ARCH_NAMES, lrv_slope_limit_deg=LRV_SLOPE_LIMIT_DEG,
        transfer_diagnostics=rep.to_dict(orient="records"),
        archetype_model=arch_meta, site_quality_model=sq_meta, targets=sigs,
        interpretation=dict(
            moon=("Cross-body similarity NOT defensible: AUC stays %.3f after full quantile "
                  "mapping, so the Western Desert candidate pool lacks the lunar highland class."
                  % moon_auc),
            mars=("Calibration removes most of the gap (1.000 -> %.3f); the residual is a real "
                  "geomorphic difference, so report the archetype mix rather than one similarity "
                  "percentage." % mars_auc),
            recommended_next_step=("Widen the Earth candidate pool (Atacama, Iceland, McMurdo Dry "
                                   "Valleys, Death Valley, Namib, Arabian An Nafud) AND export Earth "
                                   "statistics at 118 m/200 m grids for a measured calibration "
                                   "factor; then re-run T1.")),
        top_site_quality=top[show].round(4).to_dict(orient="records"),
        status="earth_site_quality_ready; cross_body_match_needs_wider_earth_domain")
    out = sq.assign(query="earth_site_quality", target_body="Earth")
    out.to_csv(a.out, index=False)
    with open(a.products, "w") as f:
        json.dump(products, f, indent=2)
    print("\nwrote %s %s\nwrote %s\nwrote %s" % (a.out, str(out.shape), a.products, a.transfer))
    return products


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--harmonized", default=DEFAULT_HARM)
    ap.add_argument("--out", default=DEFAULT_RANKED)
    ap.add_argument("--products", default=DEFAULT_PRODUCTS)
    ap.add_argument("--transfer", default=DEFAULT_TRANSFER)
    ap.add_argument("--top-k", type=int, default=25)
    run(ap.parse_args())


if __name__ == "__main__":
    main()
