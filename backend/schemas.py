"""
FloorForge (HNX26EPS06) — Data Schemas for 4-Stage Pipeline
predict -> vectorize -> solve_scale -> build_model
"""
from typing import List, Literal, Optional
from pydantic import BaseModel, Field


class Point2D(BaseModel):
    x: float = Field(..., description="Normalized X coordinate (0.0 to 1.0) or pixel coordinate")
    y: float = Field(..., description="Normalized Y coordinate (0.0 to 1.0) or pixel coordinate")


class WallSegment(BaseModel):
    id: str
    start: Point2D
    end: Point2D
    thickness_px: float
    is_exterior: bool = False
    confidence: float = Field(ge=0.0, le=1.0)


class OpeningElement(BaseModel):
    id: str
    kind: Literal["door", "window"]
    wall_id: str
    position_t: float = Field(..., description="Normalized position along parent wall (0.0 to 1.0)")
    width_px: float
    swing_direction: Optional[Literal["inward-left", "inward-right", "outward-left", "outward-right"]] = None
    sill_height_m: float = 0.9
    head_height_m: float = 2.1
    confidence: float = Field(ge=0.0, le=1.0)


class RoomPolygon(BaseModel):
    id: str
    name: str
    category: Literal["living", "bedroom", "kitchen", "bathroom", "hallway", "office", "utility", "balcony"]
    polygon: List[Point2D]
    area_px2: float
    area_m2: float = 0.0
    perimeter_m: float = 0.0
    width_m: float = 0.0
    length_m: float = 0.0
    confidence: float = Field(ge=0.0, le=1.0)


class ScaleEstimation(BaseModel):
    method: Literal["ocr_dimension", "door_prior_heuristic", "manual_override", "fallback_default"]
    meters_per_pixel: float
    confidence: float = Field(ge=0.0, le=1.0)
    reference_label: str
    detected_dimension_text: Optional[str] = None


class PipelineWarning(BaseModel):
    code: str
    severity: Literal["info", "warning", "critical"]
    stage: Literal["predict", "vectorize", "solve_scale", "build_model"]
    message: str
    element_id: Optional[str] = None


class PipelineConfig(BaseModel):
    wall_height_m: float = 2.8
    wall_thickness_m: float = 0.18
    default_door_width_m: float = 0.9
    scale_override_m_per_px: Optional[float] = None
    simplify_tolerance_px: float = 2.5
    manhattan_snap: bool = True


class FloorPlanPipelineResponse(BaseModel):
    project_id: str
    blueprint_name: str
    image_width_px: int
    image_height_px: int
    execution_mode: Literal["gemini_vision_assisted", "deterministic_mock", "fastapi_ml"]
    stage_timings_ms: dict
    walls: List[WallSegment]
    openings: List[OpeningElement]
    rooms: List[RoomPolygon]
    scale: ScaleEstimation
    warnings: List[PipelineWarning]
