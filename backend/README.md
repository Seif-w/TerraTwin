# TerraTwin backend (optional)

The original FastAPI server and the first web page (`index1.html`). You don't need it to run the website, which works on its own.

## Run

```bash
pip install -r requirements.txt
uvicorn main:app --reload
```

- API docs: http://localhost:8000/docs
- Original page: http://localhost:8000/app

## Files

| File | Purpose |
|---|---|
| `main.py` | API server and the original analysis endpoints |
| `ml_router.py` | Endpoints for tiles, rankings and model results |
| `terratwin_data.py` | Reads the dataset files in `data/` |
| `index1.html` | The original single-page interface |
| `data/` | Model outputs and the dataset schema |

To use the full dataset, copy `ml/data/terratwin_master_dataset.csv` into `backend/data/`.
