"""Save final terrain estimators using the same parameters and targets as 04_ml_rank.py.
Run from the repository root: python ml/export_models.py
These models learn rule-derived terrain labels, NOT photo-to-location ground truth.
Only load joblib files from a source you trust: Python serialization can execute code.
"""
from pathlib import Path
import importlib.util
import json
import hashlib
import joblib
import pandas as pd
import sklearn
from sklearn.ensemble import HistGradientBoostingClassifier, HistGradientBoostingRegressor

ROOT = Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location('terrain_pipeline', ROOT / '04_ml_rank.py')
pipeline = importlib.util.module_from_spec(spec)
spec.loader.exec_module(pipeline)
source = ROOT / 'data/terratwin_harmonized.csv'
data = pipeline.derive(pd.read_csv(source))
earth = data[data.body.str.lower() == 'earth'].copy()
quality = pipeline.suitability_frame(earth)
quality_features = [c for c in pipeline.SQ_FEATS if c in quality.columns]
print(f'Fitting final terrain models on {len(earth):,} Earth rows', flush=True)
archetypes = HistGradientBoostingClassifier(max_iter=250, learning_rate=0.08, random_state=0).fit(
    earth[pipeline.ARCH_FEATS].to_numpy(float), pipeline.archetype_labels(earth))
ranker = HistGradientBoostingRegressor(max_iter=300, learning_rate=0.07, max_leaf_nodes=31,
    l2_regularization=1.0, random_state=0).fit(
    quality[quality_features].to_numpy(float), quality.site_quality.to_numpy(float))
folder = ROOT / 'models'
folder.mkdir(exist_ok=True)
joblib.dump(archetypes, folder / 'terrain_archetypes.joblib', compress=3)
joblib.dump(ranker, folder / 'site_quality.joblib', compress=3)
metadata = {
    'n_training_rows': len(earth), 'sklearn_version': sklearn.__version__,
    'training_data_sha256': hashlib.sha256(source.read_bytes()).hexdigest(),
    'archetype_features': pipeline.ARCH_FEATS, 'quality_features': quality_features,
    'archetype_names': pipeline.ARCH_NAMES,
    'scope': 'Earth terrain classifiers and rule-based site-quality surrogate. Not an image encoder or photo geolocation model.',
    'labels': 'Archetypes are thresholds of measured terrain; site_quality is the suitability_frame engineering formula.',
    'validation': 'ml/data/ml_products.json contains previous spatial-block cross-validation against these rule-derived targets. It does not measure real-world base suitability or image geolocation accuracy.',
}
(folder / 'metadata.json').write_text(json.dumps(metadata, indent=2) + '\n')
# Verify serialized artifacts can be restored and used on genuine rows.
loaded = joblib.load(folder / 'site_quality.joblib')
values = loaded.predict(quality[quality_features].head(3).to_numpy(float))
assert len(values) == 3
print('Saved and reloaded both models. Example terrain quality predictions:', values, flush=True)
