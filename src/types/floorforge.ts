export type PipelineStageId = 'predict' | 'vectorize' | 'solve_scale' | 'build_model';

export type RoomCategory =
  | 'living'
  | 'bedroom'
  | 'kitchen'
  | 'bathroom'
  | 'hallway'
  | 'office'
  | 'utility'
  | 'balcony';

export interface Point2D {
  x: number;
  y: number;
}

export interface WallSegment {
  id: string;
  start: Point2D;
  end: Point2D;
  thickness_px: number;
  is_exterior: boolean;
  confidence: number;
}

export interface OpeningElement {
  id: string;
  kind: 'door' | 'window';
  wall_id: string;
  /** Normalized position along the parent wall (0.0 to 1.0) */
  position_t: number;
  width_px: number;
  swing_direction?: 'inward-left' | 'inward-right' | 'outward-left' | 'outward-right';
  sill_height_m: number;
  head_height_m: number;
  confidence: number;
}

export interface RoomPolygon {
  id: string;
  name: string;
  category: RoomCategory;
  polygon: Point2D[];
  area_px2: number;
  area_m2: number;
  perimeter_m: number;
  width_m: number;
  length_m: number;
  confidence: number;
}

export interface ScaleEstimation {
  method: 'ocr_dimension' | 'door_prior_heuristic' | 'manual_override' | 'ruler_calibration' | 'fallback_default';
  meters_per_pixel: number;
  confidence: number;
  reference_label: string;
  detected_dimension_text?: string;
}

export interface PipelineWarning {
  code: string;
  severity: 'info' | 'warning' | 'critical';
  stage: PipelineStageId;
  message: string;
  element_id?: string;
}

export interface PipelineConfig {
  wall_height_m: number;
  wall_thickness_m: number;
  default_door_width_m: number;
  scale_override_m_per_px: number | null;
  simplify_tolerance_px: number;
  manhattan_snap: boolean;
  include_floor_slabs: boolean;
  include_openings_3d: boolean;
  material_theme: 'clay' | 'timber' | 'blueprint';
}

export interface WallMeshSegment3D {
  id: string;
  parent_wall_id: string;
  start_m: Point2D;
  end_m: Point2D;
  bottom_y_m: number;
  height_m: number;
  thickness_m: number;
  is_exterior: boolean;
  segment_type: 'full_wall' | 'lintel' | 'sill';
}

export interface OpeningMesh3D {
  id: string;
  kind: 'door' | 'window';
  center_m: Point2D;
  angle_rad: number;
  width_m: number;
  sill_y_m: number;
  height_m: number;
  thickness_m: number;
}

export interface RoomSlabMesh3D {
  id: string;
  name: string;
  category: RoomCategory;
  points_m: Point2D[];
  centroid_m: Point2D;
  area_m2: number;
  dimensions_label: string;
}

export interface Built3DModelDescriptor {
  bounding_box_m: {
    width: number;
    depth: number;
    height: number;
    center_x: number;
    center_z: number;
  };
  wall_segments: WallMeshSegment3D[];
  openings: OpeningMesh3D[];
  room_slabs: RoomSlabMesh3D[];
  total_floor_area_m2: number;
  total_wall_linear_m: number;
}

export interface FloorPlanPipelineResult {
  project_id: string;
  blueprint_name: string;
  image_width_px: number;
  image_height_px: number;
  execution_mode: 'gemini_vision_assisted' | 'deterministic_mock' | 'custom_raster_cv';
  execution_badge: string;
  stage_timings_ms: Record<PipelineStageId, number>;
  walls: WallSegment[];
  openings: OpeningElement[];
  rooms: RoomPolygon[];
  scale: ScaleEstimation;
  warnings: PipelineWarning[];
  model3d: Built3DModelDescriptor;
}

export interface BlueprintPreset {
  id: string;
  name: string;
  subtitle: string;
  width_px: number;
  height_px: number;
  ocr_dimension_text: string;
  default_m_per_px: number;
  walls: WallSegment[];
  openings: OpeningElement[];
  rooms: Omit<RoomPolygon, 'area_m2' | 'perimeter_m' | 'width_m' | 'length_m'>[];
  warnings: PipelineWarning[];
}
