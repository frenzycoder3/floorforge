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

/**
 * Reconstruction Provenance categories:
 * - 'observed': AI-detected / CV-detected geometry from floor plan
 * - 'user_corrected': Geometry confirmed, adjusted, or added by the user
 * - 'generated_completion': Automatically inferred or generated elements
 */
export type EpistemicProvenance = 'observed' | 'user_corrected' | 'generated_completion';

/**
 * Deterministic AI + Geometric Confidence tier:
 * - 'high': Green — High confidence & passes all geometric checks
 * - 'uncertain': Amber — Uncertain or needs human review
 * - 'invalid': Red — Missing, disconnected, overlapping, or geometrically inconsistent
 */
export type ConfidenceStatus = 'high' | 'uncertain' | 'invalid';

export type WorkflowStepId =
  | 'upload'
  | 'detect'
  | 'review_confidence'
  | 'correct'
  | 'validate'
  | 'explore_3d'
  | 'report';

export type EditorToolMode = 'select' | 'add_wall' | 'add_door' | 'add_window';

export type OverlayColorMode = 'confidence' | 'diagnostics' | 'standard';

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
  confidence_status?: ConfidenceStatus;
  status_reason?: string;
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
  confidence_status?: ConfidenceStatus;
  status_reason?: string;
}

export interface FurnitureElement {
  id: string;
  room_id: string;
  kind: FurnitureCategory;
  label: string;
  center_px: Point2D;
  width_px: number;
  depth_px: number;
  height_m: number;
  rotation_deg: number;
  confidence: number;
  provenance: EpistemicProvenance;
  confidence_status?: ConfidenceStatus;
  status_reason?: string;
  /** Original axis-aligned bounding box in source image pixel coordinates */
  detected_bbox_px?: {
    xmin: number;
    ymin: number;
    xmax: number;
    ymax: number;
  };
  /** Original detected center in source image pixel coordinates before any manual adjustment */
  detected_center_px?: Point2D;
  /** Which detector produced this object */
  detector_source?:
    | 'gemini_vision'
    | 'raster_contour_heuristic'
    | 'blueprint_annotation'
    | 'generated_completion'
    | 'user_manual';
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
  confidence_status?: ConfidenceStatus;
  status_reason?: string;
}

export interface ScaleEstimation {
  method: 'ocr_dimension' | 'door_prior_heuristic' | 'manual_override' | 'ruler_calibration' | 'fallback_default';
  meters_per_pixel: number;
  confidence: number;
  reference_label: string;
  detected_dimension_text?: string;
}

export type ValidationCheckCategory =
  | 'disconnected_walls'
  | 'invalid_room_boundaries'
  | 'overlapping_geometry'
  | 'inconsistent_dimensions'
  | 'unassociated_openings';

export interface ValidationIssue {
  id: string;
  category: ValidationCheckCategory;
  severity: 'warning' | 'critical';
  element_id: string;
  element_type: 'wall' | 'opening' | 'room';
  title: string;
  description: string;
  suggestion: string;
  fix_action?:
    | { type: 'snap_wall_endpoint'; wall_id: string; endpoint: 'start' | 'end'; target: Point2D }
    | { type: 'orthogonalize_wall'; wall_id: string }
    | { type: 'remove_duplicate_wall'; wall_id: string }
    | { type: 'clamp_opening'; opening_id: string; wall_id: string; position_t: number; width_px: number }
    | { type: 'close_room_boundary'; room_id: string };
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
  material_theme: 'studio' | 'confidence_overlay' | 'blueprint';
  overlay_2d_mode: OverlayColorMode;
  ablation_mode: AblationMode;
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
  confidence_status: ConfidenceStatus;
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
  confidence_status: ConfidenceStatus;
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
  confidence_status: ConfidenceStatus;
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
  confidence_status: ConfidenceStatus;
}

export interface ProvenanceReport {
  ai_detected_count: number;
  user_corrected_count: number;
  inferred_completion_count: number;
  unresolved_count: number;
  high_confidence_count: number;
  uncertain_count: number;
  invalid_count: number;
}

export interface EvaluationMetrics {
  total_walls: number;
  total_rooms: number;
  total_openings: number;
  uncertain_elements_count: number;
  invalid_elements_count: number;
  user_corrections_count: number;
  validation_checks_passed: number;
  validation_checks_total: number;
  dimension_error_m: number | null;
  dimension_error_status: string;
  layout_iou: number | null;
  layout_iou_status: string;
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
  provenance_report: ProvenanceReport;
  evaluation_metrics: EvaluationMetrics;
  validation_issues: ValidationIssue[];
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
  reference_width_m: number;
  default_m_per_px: number;
  has_ground_truth: boolean;
  walls: WallSegment[];
  openings: OpeningElement[];
  furniture: FurnitureElement[];
  rooms: Omit<RoomPolygon, 'area_m2' | 'perimeter_m' | 'width_m' | 'length_m'>[];
  warnings: PipelineWarning[];
}

export interface SelectedElementRef {
  kind: 'wall' | 'opening' | 'room' | 'furniture';
  id: string;
}
