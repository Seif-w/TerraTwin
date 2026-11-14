# TerraTwin — Runbook (next steps, Windows training machine)

All commands assume `cd "D:\downloads edge"` first, and the venv interpreter
`"D:\downloads edge\tf_env\Scripts\python.exe"`. Never write anything to `C:`.

## Step 0 — NEW ORDER OF OPERATIONS (replaces the old 02_train_and_rank.py path)

The chip-ResNet dual head is retired as the primary model; see docs/MODELLING_DECISION.md
for the measured reasons. The pipeline is now:

```powershell
cd "D:\downloads edge"
& ".	f_env\Scripts\python.exe" "D:\downloads edge\03_harmonize.py"    # audit + scale-free features
& ".	f_env\Scripts\python.exe" "D:\downloads edge\04_ml_rank.py"      # transferability + archetypes + site quality
& ".	f_env\Scripts\python.exe" "D:\downloads edge\05_report_figure.py"# docs/figures/terratwin_model_report.png
```

`03`/`04` default to the `D:\downloads edge\data\...` paths and write
`terratwin_harmonized.csv`, `terratwin_ml_ranked.csv`, `ml_products.json`,
`transferability_report.csv`. Requirements additions: `scikit-learn>=1.4 scipy joblib`.
Then point the API at the folder and open `http://127.0.0.1:8000/app` - the model block
renders automatically from `data/ml_products.json`.

The old steps below still apply for the dataset audit and the MySQL load; MySQL should now
import `terratwin_ml_ranked.csv` (7,180 scored rows) as well as the master table.

## Step 1 — Verify the master dataset before training

```powershell
cd "D:\downloads edge"
& ".\tf_env\Scripts\python.exe" -c "import pandas as pd,os; d=pd.read_csv(r'D:\downloads edge\data\terratwin_master_dataset.csv'); print(d.shape); print(d['body'].value_counts()); miss=[p for p in d['chip_path'] if not os.path.exists(p)]; print('missing chips:', len(miss))"
```

Expected: `(9680, N)`, `earth 7180 / moon 1600 / mars 900`, `missing chips: 0`.

## Step 2 — Train and rank (the step we stopped at)

```powershell
& ".\tf_env\Scripts\python.exe" "D:\downloads edge\02_train_and_rank.py"
```

Check the three things it must print:
1. **Dataset audit** — channel stats per body; flag if Mars/Moon hillshade scale differs from Earth.
2. **Validation MAE** on `slope_deg_mean`, `roughness_m_mean`, `albedo_mean` (Earth held-out spatial blocks).
3. **Top-K analog matches** for a Jezero Crater tile and a Lunar South Pole tile, and confirm those
   top-K tiles fall inside the Western Desert window `[25E, 23N, 29E, 27N]`.

Keep a checkpoint outside `C:`, e.g. `D:\downloads edge\checkpoints\terratwinet_baseline.pt`.

## Step 3 — Load the dataset into MySQL

In MySQL Workbench (or CLI):

```sql
CREATE DATABASE IF NOT EXISTS terratwin;
USE terratwin;

CREATE TABLE Region_Measurements (
  tile_id      VARCHAR(32) PRIMARY KEY,
  body         ENUM('earth','mars','moon') NOT NULL,
  lat_min DOUBLE, lat_max DOUBLE, lon_min DOUBLE, lon_max DOUBLE,
  slope_deg_mean DOUBLE, roughness_m_mean DOUBLE, albedo_mean DOUBLE,
  lst_day_mean DOUBLE, lst_night_mean DOUBLE, lst_diurnal_range DOUBLE,
  aridity_index DOUBLE,
  emb_64d JSON NULL,
  chip_path  VARCHAR(255),
  INDEX idx_body (body)
);
```

Then import:

```powershell
& ".\tf_env\Scripts\mysqlimport.exe" --local --ignore-lines=1 `
  --fields-terminated-by=, terratwin Region_Measurements "D:\downloads edge\data\terratwin_master_dataset.csv"
```

(If `mysqlimport` is not on PATH, use `pymysql.executemany` instead — same result, no PATH issues.)

## Step 4 — Sanity check the analog lookup the website will call

```sql
SELECT tile_id, ROUND(slope_deg_mean,2) s, ROUND(roughness_m_mean,2) r, albedo_mean a
FROM Region_Measurements WHERE body='earth'
ORDER BY SQRT(POW(s-6.10,2)+POW((r-9.87)/5,2)+POW((a-0.16)*50,2)) LIMIT 10;
```

## Step 5 — Wire the trained model into the API

Once a checkpoint exists, drop it in `checkpoints/terratwin_model.pt` and the embedding cache in
`data/tile_embeddings.csv` (`tile_id`, 64 columns). `main.py` then serves real rankings from
`GET /api/similarity` and `GET /api/tiles` instead of the hand-typed `EARTH_ANALOGS_DB` scores.

## Step 6 — Upgrades queued after baseline

1. Replace placeholder albedo (Mars `0.16`, Moon `0.12`) with CTX/THEMIS and LROC WAC reflectance.
2. Re-run `01` + `02` scripts, re-import to MySQL, re-check top-K.
3. Retire `EARTH_ANALOGS_DB` hardcoding in `main.py` once `/api/similarity` is validated.
