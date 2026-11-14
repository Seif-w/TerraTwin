# TerraTwin — ML pipeline <-> website integration

## Current state

| Layer | Status |
|---|---|
| `index1.html` (globe.gl + Chart.js) | Works. Calls `POST http://127.0.0.1:8000/api/analyze` |
| `main.py` -> `/api/analyze` | Returns 6 **hand-typed** analog sites + synthetic chart values. `data_source: "demo_hardcoded_scores"` |
| `main.py` -> `/api/mars-traverse` | Reads `best_interp.csv` if present; uses `planetocentric latitude` / `planetocentric_latitude` (ignores the corrupted `planetodetic` column) |
| `ml_router.py` -> `/api/data-status`, `/api/tiles`, `/api/similarity`, `/api/tiles/{id}/rank`, `/api/region-stats` | **New.** Serve the measured 9,680-tile dataset |
| `terratwin_data.py` | Loader: column-alias normalization, cached read, z-score baseline ranking, 64-D cosine ranking |

## Data contract

Drop these files next to `main.py` and the real endpoints activate automatically — no code change:

```
data/terratwin_master_dataset.csv   # from 01_build_dataset / master assembly
data/tile_embeddings.csv            # tile_id + 64 Head-2 columns (export from 02_train_and_rank.py)
checkpoints/terratwin_model.pt      # optional, for on-the-fly tile inference
```

`data/sample_schema.csv` in this repo shows the minimum column set. Column names are flexible:
`slope_deg_mean|slope_mean|slope`, `albedo_mean|albedo|albedo_lang2001`, etc.
`data/*.csv` and `*.tif` are gitignored on purpose — the 9,680-row dataset stays off GitHub.

## Endpoints

```bash
GET  /api/data-status                     # loaded? tile counts per body? embeddings present?
GET  /api/tiles?body=earth&limit=50       # paged measured tiles
GET  /api/region-stats?body=moon          # per-body distribution of the signature
POST /api/similarity                      # rank Earth tiles against a physical signature
       {"slope_deg_mean":6.1,"roughness_m_mean":9.87,"albedo_mean":0.16,"top_k":10}
GET  /api/tiles/{tile_id}/rank?top_k=10   # learned 64-D cosine ranking (needs embeddings)
```

`/api/similarity` response gives `similarity`, `distance_sigma`, tile bbox, centre `lat`/`lng`
and `chip_path` — everything the frontend needs for markers and a chip preview.

## Two-stage similarity

1. **Baseline (works now):** z-scored Euclidean distance over
   `[slope_deg_mean, roughness_m_mean, albedo_mean]`, fitted on Earth tiles.
   Transparent, no checkpoint required, good enough to demo "Jezero -> Western Desert".
2. **Trained (after `02_train_and_rank.py`):** Head-2 64-D embeddings, cosine similarity.
   This is what makes cross-planet matches respond to geomorphology rather than raw numbers.

## Next code step (frontend)

Make `index1.html` dataset-driven:

1. On load, `GET /api/data-status`. If `loaded`, switch the analog panel to real tiles.
2. For the selected target body, POST the body's signature (Jezero: slope 6.1 deg,
   roughness 9.87 m, albedo 0.16 placeholder; Lunar south pole: slope 11.3 deg,
   roughness 15.0 m, albedo 0.12) to `/api/similarity`.
3. Plot `results[]` as map markers coloured by `similarity`, plus a card list with `tile_id`.
4. Point `API_BASE` at a configurable constant (see `window.TERRATWIN_API`) instead of
   hardcoded `http://127.0.0.1:8000`, so the same page works when deployed.
5. When `data/tile_embeddings.csv` exists, use `/api/tiles/{id}/rank` for the "find twins" button.

## Known caveats carried over

- Mars albedo `0.16` and Moon albedo `0.12` are placeholders; similarity scores inherit that bias
  until CTX/THEMIS and LROC WAC reflectance are loaded.
- `initial_reports_volume2.pdf` is unreadable — do not cite until re-uploaded.
- Frontend still assumes port 8000; deploy behind a relative path or make it configurable.
