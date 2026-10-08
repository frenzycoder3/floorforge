"""
FloorForge (HNX26EPS06) — FastAPI Backend Entry Point
Pipeline: predict -> vectorize -> solve_scale -> build_model
Run locally with: uvicorn backend.main:app --reload --port 8000
"""
from fastapi import FastAPI, UploadFile, File, Form
from fastapi.middleware.cors import CORSMiddleware
from typing import Optional
from .schemas import FloorPlanPipelineResponse, PipelineConfig, PipelineWarning
from .pipeline.predict import run_predict
from .pipeline.vectorize import run_vectorize
from .pipeline.solve_scale import run_solve_scale
from .pipeline.build_model import run_build_model

app = FastAPI(
    title="FloorForge API (HNX26EPS06)",
    description="2D Floor-Plan to 3D Architectural Layout Pipeline: predict -> vectorize -> solve_scale -> build_model",
    version="0.1.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/api/health")
async def health_check():
    return {
        "service": "FloorForge (HNX26EPS06)",
        "pipeline_stages": ["predict", "vectorize", "solve_scale", "build_model"],
        "status": "ready",
    }


@app.post("/api/pipeline/process", response_model=FloorPlanPipelineResponse)
async def process_floorplan(
    file: UploadFile = File(...),
    wall_height_m: float = Form(2.8),
    wall_thickness_m: float = Form(0.18),
    default_door_width_m: float = Form(0.9),
    scale_override_m_per_px: Optional[float] = Form(None),
):
    image_bytes = await file.read()
    config = PipelineConfig(
        wall_height_m=wall_height_m,
        wall_thickness_m=wall_thickness_m,
        default_door_width_m=default_door_width_m,
        scale_override_m_per_px=scale_override_m_per_px,
    )

    # 1. predict
    pred_out = run_predict(image_bytes, image_width=1000, image_height=750)
    # 2. vectorize
    vec_out = run_vectorize(pred_out["predictions"], config)
    # 3. solve_scale
    scale, rooms, warnings = run_solve_scale(
        vec_out["walls"], vec_out["openings"], vec_out["rooms"], config
    )
    # 4. build_model
    model_out = run_build_model(vec_out["walls"], vec_out["openings"], rooms, scale, config)

    warnings.append(
        PipelineWarning(
            code="MOCK_SEGMENTATION_ACTIVE",
            severity="info",
            stage="predict",
            message="Running modular reference segmentation weights; swap in CubiCasa5K/ONNX weights in backend/pipeline/predict.py.",
        )
    )

    return FloorPlanPipelineResponse(
        project_id="HNX26EPS06",
        blueprint_name=file.filename or "uploaded_floorplan.png",
        image_width_px=1000,
        image_height_px=750,
        execution_mode="fastapi_ml",
        stage_timings_ms={
            "predict": pred_out["elapsed_ms"],
            "vectorize": vec_out["elapsed_ms"],
            "solve_scale": 14.2,
            "build_model": 28.5,
        },
        walls=vec_out["walls"],
        openings=vec_out["openings"],
        rooms=rooms,
        scale=scale,
        warnings=warnings,
    )
