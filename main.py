from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, HTMLResponse
from pydantic import BaseModel
from typing import List, Optional
import pandas as pd
import os
import json

import terratwin_data as tdata
import ml_router

app = FastAPI(
    title="TerraTwin API",
    description="NASA Space Apps - Earth-to-Moon & Mars Analog Finder Backend",
    version="1.0.0"
)

# 1. تفعيل CORS عشان الفرونت إند (index1.html) يقدر يكلم الباك إند من غير مشاكل
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(ml_router.router)

# ==========================================
# 2. Data Models (عقد البيانات بين الفرونت والباك والـ AI)
# ==========================================
class AnalysisRequest(BaseModel):
    target_body: str  # "moon" or "mars"
    factors: List[str] = ["Topography", "Geology", "Temperature", "Terrain", "Resources", "Environment"]

class AnalogSite(BaseModel):
    name: str
    short: str
    lat: float
    lng: float
    score: str
    numeric_score: float
    color: str
    badgeColor: str
    type: str
    desc: str
    img: str
    elevation_m: float
    temp_range: str

# ==========================================
# 3. قاعدة بيانات المواقع (تقدر تستبدلها بقراءة من CSV أو SQLite/SQL Server)
# ==========================================
EARTH_ANALOGS_DB = [
    {
        "name": "Western Desert (White & Black Desert), Egypt",
        "short": "Western Desert, Egypt",
        "lat": 27.28, "lng": 28.12,
        "base_scores": {"mars": 97.1, "moon": 84.5},
        "color": "#f97316", "badgeColor": "#ef4444",
        "type": "mars",
        "desc": "Hyper-arid basaltic plains & chalk formations ideal for Mars rover & habitat testing.",
        "img": "https://images.unsplash.com/photo-1547234935-80c7145ec969?auto=format&fit=crop&w=200&q=80",
        "elevation_m": 120.0,
        "temp_range": "5°C to 45°C"
    },
    {
        "name": "Atacama Desert, Chile",
        "short": "Atacama Desert",
        "lat": -24.5, "lng": -69.25,
        "base_scores": {"mars": 96.4, "moon": 81.0},
        "color": "#f97316", "badgeColor": "#f97316",
        "type": "mars",
        "desc": "Extreme dryness & perchlorate-rich rocky terrain similar to Jezero Crater.",
        "img": "https://images.unsplash.com/photo-1509316785289-025f5b846b35?auto=format&fit=crop&w=200&q=80",
        "elevation_m": 2400.0,
        "temp_range": "-2°C to 30°C"
    },
    {
        "name": "Death Valley, USA",
        "short": "Death Valley",
        "lat": 36.5, "lng": -117.0,
        "base_scores": {"mars": 95.8, "moon": 79.2},
        "color": "#f97316", "badgeColor": "#f97316",
        "type": "mars",
        "desc": "Arid alluvial fans and Mars-like sedimentary geology.",
        "img": "https://images.unsplash.com/photo-1469854523086-cc02fe5d8800?auto=format&fit=crop&w=200&q=80",
        "elevation_m": -86.0,
        "temp_range": "4°C to 48°C"
    },
    {
        "name": "McMurdo Dry Valleys, Antarctica",
        "short": "McMurdo Dry Valleys",
        "lat": -77.5, "lng": 162.0,
        "base_scores": {"moon": 95.3, "mars": 89.0},
        "color": "#a855f7", "badgeColor": "#a855f7",
        "type": "moon",
        "desc": "Sub-zero hyper-arid environment mimicking Lunar South Pole conditions.",
        "img": "https://images.unsplash.com/photo-1517783999520-f068d7431a60?auto=format&fit=crop&w=200&q=80",
        "elevation_m": 450.0,
        "temp_range": "-50°C to -5°C"
    },
    {
        "name": "Haughton Crater, Canada",
        "short": "Haughton Crater",
        "lat": 75.4, "lng": -89.7,
        "base_scores": {"moon": 93.8, "mars": 86.4},
        "color": "#22c55e", "badgeColor": "#22c55e",
        "type": "moon",
        "desc": "23-km impact crater structure ideal for lunar base & EVA operations.",
        "img": "https://images.unsplash.com/photo-1464822759023-fed622ff2c3b?auto=format&fit=crop&w=200&q=80",
        "elevation_m": 200.0,
        "temp_range": "-40°C to 10°C"
    },
    {
        "name": "Iceland Volcanic Highlands",
        "short": "Iceland",
        "lat": 64.9, "lng": -18.0,
        "base_scores": {"moon": 92.9, "mars": 88.1},
        "color": "#38bdf8", "badgeColor": "#0284c7",
        "type": "moon",
        "desc": "Basaltic lava fields resembling Apollo 17 Taurus-Littrow mare.",
        "img": "https://images.unsplash.com/photo-1476610182048-b716b8518aae?auto=format&fit=crop&w=200&q=80",
        "elevation_m": 650.0,
        "temp_range": "-15°C to 15°C"
    }
]

PLANETARY_TRAVERSES = {
    "moon": {
        "title": "Moon Surface Map",
        "badge": "Apollo 17 & South Pole",
        "center": [20.19, 30.77],
        "zoom": 4,
        "sites": [
            {"name": "Apollo 17 (Taurus-Littrow)", "lat": 20.19, "lng": 30.77, "info": "Lunar Rover Traverse & Basalt Samples"},
            {"name": "Apollo 15 (Hadley Rille)", "lat": 26.13, "lng": 3.63, "info": "Mountainous Highlands & Rille"},
            {"name": "Shackleton Crater (South Pole)", "lat": -89.9, "lng": 0.0, "info": "Permanent Base Candidate (Water Ice)"}
        ]
    },
    "mars": {
        "title": "Mars Surface Map",
        "badge": "Jezero Crater (Perseverance)",
        "center": [18.44, 77.45],
        "zoom": 4,
        "sites": [
            {"name": "Jezero Crater (Mars 2020)", "lat": 18.44, "lng": 77.45, "info": "Perseverance Rover Traverse & Delta"},
            {"name": "Gale Crater (Curiosity)", "lat": -5.4, "lng": 137.8, "info": "Mount Sharp Sedimentary Layers"},
            {"name": "Olympus Mons", "lat": 18.65, "lng": -133.8, "info": "Volcanic Basalt Terrain"}
        ]
    }
}

# ==========================================
# 4. API Endpoints
# ==========================================

@app.get("/")
def health_check():
    return {"status": "online", "service": "TerraTwin NASA Space Apps API",
            "ui": "/app", "docs": "/docs"}


@app.get("/app", response_class=HTMLResponse)
def serve_ui():
    """Serve the frontend from the API origin: one port, no CORS, works deployed."""
    idx = os.path.join(os.path.dirname(os.path.abspath(__file__)), "index1.html")
    if not os.path.exists(idx):
        raise HTTPException(status_code=404, detail="index1.html not found next to main.py")
    return FileResponse(idx, media_type="text/html")

@app.post("/api/analyze")
def analyze_analogs(req: AnalysisRequest):
    target = req.target_body.lower()
    if target not in ["moon", "mars"]:
        raise HTTPException(status_code=400, detail="target_body must be 'moon' or 'mars'")

    # حساب الـ Score ديناميكياً بناءً على عدد الفلاتر المختارة
    factor_weight = min(1.0, 0.85 + (len(req.factors) * 0.025))

    results = []
    for site in EARTH_ANALOGS_DB:
        raw_score = site["base_scores"].get(target, 80.0)
        final_score = round(min(99.5, raw_score * factor_weight), 1)
        results.append({
            "name": site["name"],
            "short": site["short"],
            "lat": site["lat"],
            "lng": site["lng"],
            "score": f"{final_score}%",
            "numeric_score": final_score,
            "color": site["color"],
            "badgeColor": site["badgeColor"],
            "type": site["type"],
            "desc": site["desc"],
            "img": site["img"],
            "elevation_m": site["elevation_m"],
            "temp_range": site["temp_range"]
        })

    # ترتيب النتائج من الأعلى تشابهاً للأقل
    results.sort(key=lambda x: x["numeric_score"], reverse=True)

    # حساب قيم ديناميكية للرسم البياني بناءً على الفلاتر المختارة والكوكب
    active_factors = req.factors if req.factors else ["Terrain", "Geology", "Temperature", "Resources"]
    
    factor_scores = {
        "Topography":  {"earth": 91, "moon": 82, "mars": 89},
        "Geology":     {"earth": 92, "moon": 84, "mars": 90},
        "Temperature": {"earth": 85, "moon": 65, "mars": 76},
        "Terrain":     {"earth": 88, "moon": 78, "mars": 85},
        "Resources":   {"earth": 90, "moon": 72, "mars": 80},
        "Environment": {"earth": 87, "moon": 60, "mars": 74},
    }

    chart_labels = []
    earth_vals = []
    moon_vals = []
    mars_vals = []

    for f in active_factors:
        if f in factor_scores:
            chart_labels.append(f)
            boost = 3 if target == "mars" else -2
            earth_vals.append(factor_scores[f]["earth"])
            moon_vals.append(min(99, max(40, factor_scores[f]["moon"] - boost)))
            mars_vals.append(min(99, max(40, factor_scores[f]["mars"] + boost)))

    return {
        "target_body": target,
        "planetary_data": PLANETARY_TRAVERSES[target],
        "earth_analogs": results,
        "data_source": "demo_hardcoded_scores",
        "real_dataset_available": tdata.load_master() is not None,
        "comparison_metrics": {
            "labels": chart_labels,
            "earth": earth_vals,
            "moon": moon_vals,
            "mars": mars_vals
        }
    }


# Endpoint إضافي لقراءة مسار مركبة المريخ الحقيقي من ملف best_interp.csv لو حطيته في الفولدر
@app.get("/api/mars-traverse")
def get_mars_traverse(limit: int = 100):
    csv_path = "best_interp.csv"
    if not os.path.exists(csv_path):
        return {"message": "Put best_interp.csv in the root folder to serve real NASA rover coordinates.", "points": []}
    
    df = tdata.normalize_columns(pd.read_csv(csv_path))
    # أخذ عينة منتظمة عشان الخريطة متهنجش
    step = max(1, len(df) // limit)
    sampled = df.iloc[::step]
    
    points = []
    for _, row in sampled.iterrows():
        lat = row.get("planetocentric_latitude")
        if pd.notna(lat) and pd.notna(row.get("longitude")):
            points.append({
                "sol": int(row.get("sol", 0)),
                "lat": float(lat),
                "lng": float(row["longitude"]),
                "elevation": float(row.get("elevation", 0))
            })
    return {"total_loaded": len(points), "points": points}
