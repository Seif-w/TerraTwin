# TerraTwin terrain ML

This folder contains the terrain models, reproducible training code, and the measured dataset used in this project. It does **not** contain a trained image-geolocation model.

## Models

`models/terrain_archetypes.joblib` is a fitted gradient-boosted classifier for four rule-defined terrain classes. `models/site_quality.joblib` is a fitted regressor that approximates the engineering suitability formula in `04_ml_rank.py`. `models/metadata.json` records feature order, class names, training-data hash, and scikit-learn version.

Both were fitted on 7,180 Earth rows from the supplied dataset. The earlier cross-validation numbers in `data/ml_products.json` measure reproduction of rule-derived labels/formulas. They are **not** proof of true base suitability, expert geological classification, or photo-location accuracy.

Only load `.joblib` files from a trusted source: Python serialization can execute code.

## Setup and reproduce

From the repository root, with Python 3.12 and a virtual environment:

```bash
python -m pip install -r ml/requirements.txt
python ml/03_harmonize.py
python ml/04_ml_rank.py
python ml/export_models.py
```

The packaged model files were saved with the exact scikit-learn version in `models/metadata.json`. Use `ml/model-requirements.txt` to restore that version. Model persistence across different scikit-learn versions is not guaranteed.

## Use a saved model

```python
import importlib.util
import json
import joblib
import pandas as pd

spec = importlib.util.spec_from_file_location('pipeline', 'ml/04_ml_rank.py')
pipeline = importlib.util.module_from_spec(spec)
spec.loader.exec_module(pipeline)
metadata = json.load(open('ml/models/metadata.json'))
rows = pipeline.derive(pd.read_csv('ml/data/terratwin_harmonized.csv'))
rows = rows[rows.body.str.lower() == 'earth'].head(5)
model = joblib.load('ml/models/site_quality.joblib')
print(model.predict(rows[metadata['quality_features']].to_numpy(float)))
```

## Website connection

The static website uses exported terrain records in `public/data/`; it does not execute Python or deserialize models in a visitor's browser. `src/lib/photo.ts` extracts image features, while `src/lib/match.ts` implements an experimental visual-similarity baseline. It compares uncalibrated brightness/contrast/relief proxies with tile measurements. It is not validated exact geolocation.

The two uploaded Mars reports provide geological records and demonstration photographs. They do not supply verified Mars-to-Earth image pairs. Training a proper image model still requires georeferenced Earth photographs, meaningful analogue-pair labels, scale/lighting metadata, and held-out geographic regions.

## Data and source provenance

`data/terratwin_master_dataset.csv` is the user-supplied input; `03_harmonize.py` generates harmonized records and `04_ml_rank.py` generates ranked records and model diagnostics. The claimed original sources in the project are SRTM, MODIS/Sentinel-2/TerraClimate for Earth; HRSC/MOLA for Mars; LOLA for Moon. Inclusion here does not independently authenticate upstream extraction. Mars/Moon albedo constants, missing environmental fields, approximate local-grid origins, and cross-resolution differences remain important limitations.
