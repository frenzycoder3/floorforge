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

export type EpistemicProvenance = 'observed' | 'generated_completion';

export type FurnitureCategory =
  | 'bed'
  | 'nightstand'
  | 'wardrobe'
  | 'sofa'
  | 'coffee_table'
  | 'tv_stand'
  | 'dining_table'
  | 'kitchen_counter'
  | 'fridge'
  | 'bathtub'
  | 'toilet'
  | 'sink_vanity'
  | 'shower'
  | 'desk';

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
  provenance?: EpistemicProvenance;
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
  provenance?: EpistemicProvenance;
}

export interface FurnitureElement {
  id: string;
  room_id: string;
  kind: FurnitureCategory;
  label: string;
  /** Center position in blueprint pixel coordinates */
  center_px: Point2D;
  /** Width & depth in blueprint pixels */
  width_px: number;
  depth_px: number;
  height_m: number;
  rotation_deg: number;
  confidence: number;
  /** PS06 Novelty: Whether directly observed in blueprint/video or plausibly completed */
  provenance: EpistemicProvenance;
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
  provenance?: EpistemicProvenance;
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

export type AblationMode = 'baseline_shell' | 'walls_and_rooms' | 'full_floorforge';

export interface PipelineConfig {
  wall_height_m: number;
  wall_thickness_m: number;
  default_door_width_m: number;
  scale_override_m_per_px: number | null;
  simplify_tolerance_px: number;
  manhattan_snap: boolean;
  include_floor_slabs: boolean;
  include_openings_3d: boolean;
  include_furniture_3d: boolean;
  show_generated_completion: boolean;
  /** PS06 Novelty: Visual mode separating Observed (Emerald/Cyan) vs AI-Completed (Amber) geometry */
  material_theme: 'studio' | 'epistemic_confidence' | 'blueprint';
  /** PS06 Research Contribution: Ablation mode comparing Baseline vs Full FloorForge */
  ablation_mode: AblationMode;
  /** PS06 Mode A (Floor Plan) vs Mode B (Blueprint-Guided Video Completion with Camera Frustum) */
  input_mode: 'mode_a_blueprint' | 'mode_b_video_fusion';
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
  provenance: EpistemicProvenance;
  confidence: number;
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
  provenance: EpistemicProvenance;
}

export interface FurnitureMesh3D {
  id: string;
  room_id: string;
  kind: FurnitureCategory;
  label: string;
  center_m: Point2D;
  width_m: number;
  depth_m: number;
  height_m: number;
  rotation_rad: number;
  provenance: EpistemicProvenance;
  confidence: number;
}

export interface RoomSlabMesh3D {
  id: string;
  name: string;
  category: RoomCategory;
  points_m: Point2D[];
  centroid_m: Point2D;
  area_m2: number;
  dimensions_label: string;
  provenance: EpistemicProvenance;
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
  furniture: FurnitureMesh3D[];
  room_slabs: RoomSlabMesh3D[];
  total_floor_area_m2: number;
  total_wall_linear_m: number;
  epistemic_stats: {
    observed_count: number;
    completed_count: number;
    observed_ratio_pct: number;
    layout_iou_vs_baseline: number;
    dimension_error_cm: number;
  };
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
  furniture: FurnitureElement[];
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
  furniture: FurnitureElement[];
  rooms: Omit<RoomPolygon, 'area_m2' | 'perimeter_m' | 'width_m' | 'length_m'>[];
  warnings: PipelineWarning[];
}
