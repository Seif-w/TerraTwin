# TerraTwin
TerraTwin finds Earth analog sites for future Moon and Mars bases. Using NASA Earthdata (SRTM, MODIS), the Planetary Data System (LRO LOLA and Diviner, Mars MOLA) and Copernicus, it derives slope, roughness, temperature and aridity, then ranks Earth sites by similarity on an interactive map, with Egypt’s Western Desert as a case study.

## Repo layout

```
03_harmonize.py        CRS audit + cross-body scale harmonization
04_ml_rank.py          transferability test, archetype classifier, site-quality ranker
05_report_figure.py    docs/figures/terratwin_model_report.png
index1.html            globe.gl + Chart.js frontend (calls POST /api/analyze)
main.py                FastAPI backend, demo analog scores + Mars traverse reader
ml_router.py           endpoints over the real 9,680-tile dataset
terratwin_data.py      dataset loader, z-score baseline + 64-D cosine ranking
data/sample_schema.csv minimal column contract (real CSVs are gitignored)
docs/MODELLING_DECISION.md  why the model changed + measured evidence (read this first)
docs/ARCHITECTURE.md   TerraTwinNet dual-head spec, sources, ground truth
docs/RUNBOOK.md        step-by-step: audit dataset -> train -> MySQL -> wire API
docs/INTEGRATION.md    data contract, endpoint reference, frontend TODOs
```

## Run locally

```bash
pip install -r requirements.txt
uvicorn main:app --reload          # http://127.0.0.1:8000/docs
# then open index1.html
```

Drop `data/terratwin_master_dataset.csv` next to `main.py` and these light up with real
measurements: `GET /api/data-status`, `GET /api/tiles`, `POST /api/similarity`,
`GET /api/region-stats`, `GET /api/tiles/{tile_id}/rank`.

Training data, GeoTIFF chips and checkpoints stay on the workstation disk and out of git
(see `.gitignore`).
