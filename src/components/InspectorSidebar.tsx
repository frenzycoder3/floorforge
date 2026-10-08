import React from 'react';
import {
  ConfidenceStatus,
  EditorToolMode,
  FloorPlanPipelineResult,
  FurnitureCategory,
  OverlayColorMode,
  PipelineConfig,
  RoomCategory,
  SelectedElementRef,
  ValidationIssue,
} from '../types/floorforge';
import {
  AlertTriangle,
  Check,
  CheckCircle2,
  DoorClosed,
  PlusSquare,
  Redo2,
  RotateCw,
  Ruler,
  ShieldAlert,
  Sliders,
  Trash2,
  Undo2,
  Wrench,
  AppWindow,
  Download,
  Cpu,
} from 'lucide-react';

export type InspectorTabId = 'correct' | 'validate' | 'report' | 'rooms';

interface InspectorSidebarProps {
  pipelineResult: FloorPlanPipelineResult;
  originalResult: FloorPlanPipelineResult;
  isComparingOriginal: boolean;
  onToggleCompareOriginal: () => void;
  activeTab: InspectorTabId;
  onChangeTab: (tab: InspectorTabId) => void;
  config: PipelineConfig;
  onChangeConfig: (updater: (prev: PipelineConfig) => PipelineConfig) => void;
  selectedElement: SelectedElementRef | null;
  onSelectElement: (el: SelectedElementRef | null) => void;
  editorTool: EditorToolMode;
  onChangeEditorTool: (tool: EditorToolMode) => void;
  overlayColorMode: OverlayColorMode;
  onChangeOverlayColorMode: (mode: OverlayColorMode) => void;
  onConfirmElement: (el: SelectedElementRef) => void;
  onRejectElement: (el: SelectedElementRef) => void;
  onUpdateWallGeometry: (
    wallId: string,
    updates: {
      start?: { x: number; y: number };
      end?: { x: number; y: number };
      thickness_px?: number;
      orthogonalize?: boolean;
      targetLengthM?: number;
    }
  ) => void;
  onUpdateOpeningGeometry: (
    openingId: string,
    updates: {
      wall_id?: string;
      position_t?: number;
      width_px?: number;
      kind?: 'door' | 'window';
    }
  ) => void;
  onUpdateRoomMeta: (
    roomId: string,
    updates: { name?: string; category?: RoomCategory }
  ) => void;
  onUpdateFurnitureGeometry: (
    furnitureId: string,
    updates: {
      kind?: FurnitureCategory;
      label?: string;
      center_px?: { x: number; y: number };
      width_px?: number;
      depth_px?: number;
      rotation_deg?: number;
      room_id?: string;
    }
  ) => void;
  onApplyValidationFix: (issue: ValidationIssue) => void;
  onAutoFixAllIssues: () => void;
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  onOpenRuler: () => void;
}

const FURNITURE_KINDS: { value: FurnitureCategory; label: string }[] = [
  { value: 'bed', label: 'Bed' },
  { value: 'nightstand', label: 'Bedside Table' },
  { value: 'wardrobe', label: 'Wardrobe' },
  { value: 'sofa', label: 'Sofa' },
  { value: 'coffee_table', label: 'Coffee Table' },
  { value: 'tv_stand', label: 'TV Stand / Console' },
  { value: 'dining_table', label: 'Dining Table' },
  { value: 'kitchen_counter', label: 'Kitchen Counter & Sink' },
  { value: 'fridge', label: 'Refrigerator' },
  { value: 'shower', label: 'Shower Enclosure' },
  { value: 'toilet', label: 'Toilet (WC)' },
  { value: 'sink_vanity', label: 'Washbasin Vanity' },
  { value: 'bathtub', label: 'Bathtub' },
  { value: 'desk', label: 'Study Desk' },
];

function renderStatusBadge(status?: ConfidenceStatus) {
  if (status === 'invalid') {
    return (
      <span className="px-1.5 py-0.5 text-[10px] font-semibold rounded bg-[#EF4444]/20 text-[#EF4444] border border-[#EF4444]/40">
        Red · Invalid / Disconnected
      </span>
    );
  }
  if (status === 'uncertain') {
    return (
      <span className="px-1.5 py-0.5 text-[10px] font-semibold rounded bg-[#F59E0B]/20 text-[#F59E0B] border border-[#F59E0B]/40">
        Amber · Uncertain
      </span>
    );
  }
  return (
    <span className="px-1.5 py-0.5 text-[10px] font-semibold rounded bg-[#10B981]/20 text-[#10B981] border border-[#10B981]/40">
      Green · High Confidence
    </span>
  );
}

export const InspectorSidebar: React.FC<InspectorSidebarProps> = ({
  pipelineResult,
  originalResult,
  isComparingOriginal,
  onToggleCompareOriginal,
  activeTab,
  onChangeTab,
  config,
  onChangeConfig,
  selectedElement,
  onSelectElement,
  editorTool,
  onChangeEditorTool,
  overlayColorMode,
  onChangeOverlayColorMode,
  onConfirmElement,
  onRejectElement,
  onUpdateWallGeometry,
  onUpdateOpeningGeometry,
  onUpdateRoomMeta,
  onUpdateFurnitureGeometry,
  onApplyValidationFix,
  onAutoFixAllIssues,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  onOpenRuler,
}) => {
  const { scale, walls, openings, rooms, furniture, model3d } = pipelineResult;
  const { provenance_report, evaluation_metrics, validation_issues } = model3d;
  const mPerPx = scale.meters_per_pixel;

  const selectedWall =
    selectedElement?.kind === 'wall'
      ? walls.find((w) => w.id === selectedElement.id) || null
      : null;
  const selectedOpening =
    selectedElement?.kind === 'opening'
      ? openings.find((o) => o.id === selectedElement.id) || null
      : null;
  const selectedRoom =
    selectedElement?.kind === 'room'
      ? rooms.find((r) => r.id === selectedElement.id) || null
      : null;
  const selectedFurniture =
    selectedElement?.kind === 'furniture'
      ? furniture.find((f) => f.id === selectedElement.id) || null
      : null;

  // Gather all uncertain or invalid elements for quick review
  const reviewQueue = [
    ...walls
      .filter((w) => w.confidence_status === 'invalid' || w.confidence_status === 'uncertain')
      .map((w) => ({
        kind: 'wall' as const,
        id: w.id,
        label: `Wall Border ${w.id}`,
        status: w.confidence_status!,
        reason: w.status_reason || 'Needs review',
      })),
    ...openings
      .filter((o) => o.confidence_status === 'invalid' || o.confidence_status === 'uncertain')
      .map((o) => ({
        kind: 'opening' as const,
        id: o.id,
        label: `${o.kind === 'door' ? 'Door' : 'Window'} ${o.id} (on ${o.wall_id})`,
        status: o.confidence_status!,
        reason: o.status_reason || 'Needs review',
      })),
    ...rooms
      .filter((r) => r.confidence_status === 'invalid' || r.confidence_status === 'uncertain')
      .map((r) => ({
        kind: 'room' as const,
        id: r.id,
        label: `${r.name} (${r.id})`,
        status: r.confidence_status!,
        reason: r.status_reason || 'Needs review',
      })),
    ...furniture
      .filter((f) => f.confidence_status === 'invalid' || f.confidence_status === 'uncertain')
      .map((f) => ({
        kind: 'furniture' as const,
        id: f.id,
        label: `${f.label}`,
        status: f.confidence_status!,
        reason: f.status_reason || 'Needs review',
      })),
  ];

  const checkSummary = [
    {
      id: 'disconnected_walls',
      label: 'Disconnected Wall Endpoints',
      count: validation_issues.filter((i) => i.category === 'disconnected_walls').length,
    },
    {
      id: 'invalid_room_boundaries',
      label: 'Closed Room Boundaries',
      count: validation_issues.filter((i) => i.category === 'invalid_room_boundaries').length,
    },
    {
      id: 'overlapping_geometry',
      label: 'Overlapping / Duplicate Geometry',
      count: validation_issues.filter((i) => i.category === 'overlapping_geometry').length,
    },
    {
      id: 'inconsistent_dimensions',
      label: 'Consistent Metric Dimensions',
      count: validation_issues.filter((i) => i.category === 'inconsistent_dimensions').length,
    },
    {
      id: 'unassociated_openings',
      label: 'Door & Window Wall Association',
      count: validation_issues.filter((i) => i.category === 'unassociated_openings').length,
    },
  ];

  const handleExportTrainingAnnotations = () => {
    const datasetPayload = {
      schema_version: 'floorforge-obb-annotations-v1',
      blueprint_name: pipelineResult.blueprint_name,
      image_width_px: pipelineResult.image_width_px,
      image_height_px: pipelineResult.image_height_px,
      meters_per_pixel: mPerPx,
      detector_mode: pipelineResult.execution_mode,
      furniture_annotations: furniture.map((f) => ({
        id: f.id,
        category: f.kind,
        room_id: f.room_id,
        center_px: f.center_px,
        width_px: f.width_px,
        depth_px: f.depth_px,
        rotation_deg: f.rotation_deg,
        detected_bbox_px: f.detected_bbox_px,
        detector_source: f.detector_source || 'blueprint_annotation',
        user_verified: f.provenance === 'user_corrected',
      })),
      wall_annotations: walls.map((w) => ({
        id: w.id,
        start_px: w.start,
        end_px: w.end,
        thickness_px: w.thickness_px,
        is_exterior: w.is_exterior,
      })),
    };
    const blob = new Blob([JSON.stringify(datasetPayload, null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${pipelineResult.blueprint_name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-annotations.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <aside className="w-full lg:w-[400px] xl:w-[420px] shrink-0 bg-[#12161F] border-l border-[#222938] flex flex-col h-full overflow-y-auto">
      {/* Top Status & Quick Confidence Bar */}
      <div className="p-3.5 border-b border-[#222938] bg-[#0B0D11]/60 space-y-2.5">
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs font-semibold text-[#F8FAFC] truncate">
            {pipelineResult.execution_badge}
          </span>
          <div className="flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              onClick={onUndo}
              disabled={!canUndo}
              className="p-1 rounded bg-[#181D29] hover:bg-[#222938] text-[#F1F5F9] border border-[#222938] disabled:opacity-35"
              title="Undo Correction"
            >
              <Undo2 className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={onRedo}
              disabled={!canRedo}
              className="p-1 rounded bg-[#181D29] hover:bg-[#222938] text-[#F1F5F9] border border-[#222938] disabled:opacity-35"
              title="Redo Correction"
            >
              <Redo2 className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* 3-Color Confidence Counter Strip */}
        <div className="grid grid-cols-3 gap-1.5 text-center bg-[#0B0D11] p-2 rounded border border-[#222938]">
          <div className="px-1">
            <div className="text-[10px] text-[#10B981] font-medium">High (Green)</div>
            <div className="text-sm font-mono font-bold text-[#10B981] tabular-nums">
              {provenance_report.high_confidence_count}
            </div>
          </div>
          <div className="border-x border-[#222938] px-1">
            <div className="text-[10px] text-[#F59E0B] font-medium">Uncertain (Amber)</div>
            <div className="text-sm font-mono font-bold text-[#F59E0B] tabular-nums">
              {provenance_report.uncertain_count}
            </div>
          </div>
          <div className="px-1">
            <div className="text-[10px] text-[#EF4444] font-medium">Invalid (Red)</div>
            <div className="text-sm font-mono font-bold text-[#EF4444] tabular-nums">
              {provenance_report.invalid_count}
            </div>
          </div>
        </div>
      </div>

      {/* 4-Tab Navigation */}
      <div className="px-3.5 pt-2.5 pb-2 border-b border-[#222938] bg-[#12161F]">
        <div className="grid grid-cols-4 gap-1 p-1 bg-[#0B0D11] rounded-md border border-[#222938]">
          <button
            type="button"
            onClick={() => onChangeTab('correct')}
            className={`py-1.5 px-1.5 text-[11px] font-semibold rounded transition-colors whitespace-nowrap ${
              activeTab === 'correct'
                ? 'bg-[#D97706] text-[#F8FAFC]'
                : 'text-[#94A3B8] hover:text-[#F1F5F9]'
            }`}
          >
            Correct ({reviewQueue.length})
          </button>
          <button
            type="button"
            onClick={() => onChangeTab('validate')}
            className={`py-1.5 px-1.5 text-[11px] font-semibold rounded transition-colors whitespace-nowrap ${
              activeTab === 'validate'
                ? 'bg-[#D97706] text-[#F8FAFC]'
                : 'text-[#94A3B8] hover:text-[#F1F5F9]'
            }`}
          >
            Validate ({validation_issues.length})
          </button>
          <button
            type="button"
            onClick={() => onChangeTab('report')}
            className={`py-1.5 px-1.5 text-[11px] font-semibold rounded transition-colors whitespace-nowrap ${
              activeTab === 'report'
                ? 'bg-[#D97706] text-[#F8FAFC]'
                : 'text-[#94A3B8] hover:text-[#F1F5F9]'
            }`}
          >
            Diagnostics
          </button>
          <button
            type="button"
            onClick={() => onChangeTab('rooms')}
            className={`py-1.5 px-1.5 text-[11px] font-semibold rounded transition-colors whitespace-nowrap ${
              activeTab === 'rooms'
                ? 'bg-[#181D29] text-[#F8FAFC]'
                : 'text-[#94A3B8] hover:text-[#F1F5F9]'
            }`}
          >
            Rooms & 3D
          </button>
        </div>
      </div>

      {/* Tab Body */}
      <div className="p-4 flex-1 space-y-4">
        {/* TAB 1: AI CONFIDENCE & INTERACTIVE BORDER/OBJECT CORRECTION TOOL */}
        {activeTab === 'correct' && (
          <div className="space-y-4">
            {/* Mark Missing Elements Toolbar */}
            <div className="p-3 rounded-md bg-[#0B0D11] border border-[#222938] space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-[#F8FAFC] flex items-center gap-1.5">
                  <Wrench className="w-3.5 h-3.5 text-[#D97706]" />
                  <span>Edit Borders & Add Missing Elements</span>
                </span>
                {editorTool !== 'select' && (
                  <button
                    type="button"
                    onClick={() => onChangeEditorTool('select')}
                    className="text-[11px] text-[#F59E0B] hover:underline"
                  >
                    Exit Draw Mode
                  </button>
                )}
              </div>
              <div className="grid grid-cols-3 gap-1.5">
                <button
                  type="button"
                  onClick={() =>
                    onChangeEditorTool(editorTool === 'add_wall' ? 'select' : 'add_wall')
                  }
                  className={`py-1.5 px-2 rounded text-xs font-medium border flex items-center justify-center gap-1 transition-colors ${
                    editorTool === 'add_wall'
                      ? 'bg-[#D97706]/25 border-[#D97706] text-[#F8FAFC]'
                      : 'bg-[#181D29] border-[#222938] text-[#CBD5E1] hover:bg-[#222938]'
                  }`}
                >
                  <PlusSquare className="w-3.5 h-3.5" />
                  <span>+ Wall</span>
                </button>
                <button
                  type="button"
                  onClick={() =>
                    onChangeEditorTool(editorTool === 'add_door' ? 'select' : 'add_door')
                  }
                  className={`py-1.5 px-2 rounded text-xs font-medium border flex items-center justify-center gap-1 transition-colors ${
                    editorTool === 'add_door'
                      ? 'bg-[#D97706]/25 border-[#D97706] text-[#F8FAFC]'
                      : 'bg-[#181D29] border-[#222938] text-[#CBD5E1] hover:bg-[#222938]'
                  }`}
                >
                  <DoorClosed className="w-3.5 h-3.5" />
                  <span>+ Door</span>
                </button>
                <button
                  type="button"
                  onClick={() =>
                    onChangeEditorTool(editorTool === 'add_window' ? 'select' : 'add_window')
                  }
                  className={`py-1.5 px-2 rounded text-xs font-medium border flex items-center justify-center gap-1 transition-colors ${
                    editorTool === 'add_window'
                      ? 'bg-[#D97706]/25 border-[#D97706] text-[#F8FAFC]'
                      : 'bg-[#181D29] border-[#222938] text-[#CBD5E1] hover:bg-[#222938]'
                  }`}
                >
                  <AppWindow className="w-3.5 h-3.5" />
                  <span>+ Window</span>
                </button>
              </div>
              <p className="text-[11px] text-[#94A3B8]">
                Select & drag any wall border, room corner, door, or furniture item on the 2D canvas to update 3D live.
              </p>
            </div>

            {/* Selected Wall Border Inspector */}
            {selectedWall && (
              <div className="p-3.5 rounded-md bg-[#0B0D11] border border-[#D97706] space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <span className="text-xs font-bold text-[#F8FAFC]">
                      Wall Border {selectedWall.id} ({selectedWall.is_exterior ? 'Exterior' : 'Partition'})
                    </span>
                    <div className="text-[11px] text-[#94A3B8] mt-0.5">
                      {selectedWall.status_reason}
                    </div>
                  </div>
                  {renderStatusBadge(selectedWall.confidence_status)}
                </div>

                {/* Confirm or Reject */}
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => onConfirmElement({ kind: 'wall', id: selectedWall.id })}
                    className="py-1.5 px-2.5 rounded bg-[#10B981]/20 hover:bg-[#10B981]/30 text-[#10B981] border border-[#10B981]/40 text-xs font-semibold flex items-center justify-center gap-1"
                  >
                    <Check className="w-3.5 h-3.5" />
                    <span>Confirm Border</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => onRejectElement({ kind: 'wall', id: selectedWall.id })}
                    className="py-1.5 px-2.5 rounded bg-[#EF4444]/15 hover:bg-[#EF4444]/25 text-[#EF4444] border border-[#EF4444]/40 text-xs font-semibold flex items-center justify-center gap-1"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Delete Border</span>
                  </button>
                </div>

                {/* Adjust Wall Length & Endpoints */}
                {(() => {
                  const lenPx = Math.hypot(
                    selectedWall.end.x - selectedWall.start.x,
                    selectedWall.end.y - selectedWall.start.y
                  );
                  const lenM = Number((lenPx * mPerPx).toFixed(2));
                  return (
                    <div className="space-y-2.5 pt-2 border-t border-[#222938] text-xs">
                      <div className="flex items-center justify-between">
                        <span className="text-[#94A3B8]">Wall Length (m)</span>
                        <div className="flex items-center gap-1.5">
                          <input
                            type="number"
                            step="0.1"
                            min="0.4"
                            max="30"
                            value={lenM}
                            onChange={(e) => {
                              const val = parseFloat(e.target.value);
                              if (!isNaN(val) && val > 0.3) {
                                onUpdateWallGeometry(selectedWall.id, { targetLengthM: val });
                              }
                            }}
                            className="w-20 px-2 py-1 bg-[#12161F] border border-[#222938] rounded text-right font-mono text-[#F8FAFC]"
                          />
                          <button
                            type="button"
                            onClick={() =>
                              onUpdateWallGeometry(selectedWall.id, { orthogonalize: true })
                            }
                            className="px-2 py-1 bg-[#181D29] hover:bg-[#222938] text-[#38BDF8] border border-[#222938] rounded text-[11px]"
                            title="Snap wall to exact 90° horizontal/vertical axis"
                          >
                            Snap 90°
                          </button>
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="text-[10px] text-[#94A3B8] block mb-1">
                            Start (X, Y px)
                          </label>
                          <div className="flex gap-1">
                            <input
                              type="number"
                              value={Math.round(selectedWall.start.x)}
                              onChange={(e) =>
                                onUpdateWallGeometry(selectedWall.id, {
                                  start: {
                                    x: Number(e.target.value),
                                    y: selectedWall.start.y,
                                  },
                                })
                              }
                              className="w-full px-1.5 py-1 bg-[#12161F] border border-[#222938] rounded font-mono text-[11px] text-[#F8FAFC]"
                            />
                            <input
                              type="number"
                              value={Math.round(selectedWall.start.y)}
                              onChange={(e) =>
                                onUpdateWallGeometry(selectedWall.id, {
                                  start: {
                                    x: selectedWall.start.x,
                                    y: Number(e.target.value),
                                  },
                                })
                              }
                              className="w-full px-1.5 py-1 bg-[#12161F] border border-[#222938] rounded font-mono text-[11px] text-[#F8FAFC]"
                            />
                          </div>
                        </div>
                        <div>
                          <label className="text-[10px] text-[#94A3B8] block mb-1">
                            End (X, Y px)
                          </label>
                          <div className="flex gap-1">
                            <input
                              type="number"
                              value={Math.round(selectedWall.end.x)}
                              onChange={(e) =>
                                onUpdateWallGeometry(selectedWall.id, {
                                  end: {
                                    x: Number(e.target.value),
                                    y: selectedWall.end.y,
                                  },
                                })
                              }
                              className="w-full px-1.5 py-1 bg-[#12161F] border border-[#222938] rounded font-mono text-[11px] text-[#F8FAFC]"
                            />
                            <input
                              type="number"
                              value={Math.round(selectedWall.end.y)}
                              onChange={(e) =>
                                onUpdateWallGeometry(selectedWall.id, {
                                  end: {
                                    x: selectedWall.end.x,
                                    y: Number(e.target.value),
                                  },
                                })
                              }
                              className="w-full px-1.5 py-1 bg-[#12161F] border border-[#222938] rounded font-mono text-[11px] text-[#F8FAFC]"
                            />
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })()}
              </div>
            )}

            {/* Selected Door / Window Inspector */}
            {selectedOpening && (
              <div className="p-3.5 rounded-md bg-[#0B0D11] border border-[#D97706] space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <span className="text-xs font-bold text-[#F8FAFC]">
                      {selectedOpening.kind === 'door' ? 'Closed Door' : 'Window'} {selectedOpening.id}
                    </span>
                    <div className="text-[11px] text-[#94A3B8] mt-0.5">
                      {selectedOpening.status_reason}
                    </div>
                  </div>
                  {renderStatusBadge(selectedOpening.confidence_status)}
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => onConfirmElement({ kind: 'opening', id: selectedOpening.id })}
                    className="py-1.5 px-2.5 rounded bg-[#10B981]/20 hover:bg-[#10B981]/30 text-[#10B981] border border-[#10B981]/40 text-xs font-semibold flex items-center justify-center gap-1"
                  >
                    <Check className="w-3.5 h-3.5" />
                    <span>Confirm</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => onRejectElement({ kind: 'opening', id: selectedOpening.id })}
                    className="py-1.5 px-2.5 rounded bg-[#EF4444]/15 hover:bg-[#EF4444]/25 text-[#EF4444] border border-[#EF4444]/40 text-xs font-semibold flex items-center justify-center gap-1"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Delete</span>
                  </button>
                </div>

                <div className="space-y-2.5 pt-2 border-t border-[#222938] text-xs">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[#94A3B8]">Attached Wall</span>
                    <select
                      value={selectedOpening.wall_id}
                      onChange={(e) =>
                        onUpdateOpeningGeometry(selectedOpening.id, {
                          wall_id: e.target.value,
                        })
                      }
                      className="px-2 py-1 bg-[#12161F] border border-[#222938] rounded font-mono text-xs text-[#F8FAFC]"
                    >
                      {walls.map((w) => (
                        <option key={w.id} value={w.id}>
                          {w.id} ({w.is_exterior ? 'Exterior' : 'Partition'})
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="flex items-center justify-between">
                    <span className="text-[#94A3B8]">Position Along Wall</span>
                    <span className="font-mono text-[#F8FAFC]">
                      {Math.round(selectedOpening.position_t * 100)}%
                    </span>
                  </div>
                  <input
                    type="range"
                    min="0.1"
                    max="0.9"
                    step="0.02"
                    value={selectedOpening.position_t}
                    onChange={(e) =>
                      onUpdateOpeningGeometry(selectedOpening.id, {
                        position_t: parseFloat(e.target.value),
                      })
                    }
                    className="w-full accent-[#D97706]"
                  />

                  <div className="flex items-center justify-between">
                    <span className="text-[#94A3B8]">Opening Width (m)</span>
                    <span className="font-mono text-[#F8FAFC]">
                      {(selectedOpening.width_px * mPerPx).toFixed(2)} m
                    </span>
                  </div>
                  <input
                    type="range"
                    min="36"
                    max="140"
                    step="2"
                    value={selectedOpening.width_px}
                    onChange={(e) =>
                      onUpdateOpeningGeometry(selectedOpening.id, {
                        width_px: parseInt(e.target.value, 10),
                      })
                    }
                    className="w-full accent-[#D97706]"
                  />
                </div>
              </div>
            )}

            {/* Selected Room Inspector */}
            {selectedRoom && (
              <div className="p-3.5 rounded-md bg-[#0B0D11] border border-[#D97706] space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <span className="text-xs font-bold text-[#F8FAFC]">
                      {selectedRoom.name} ({selectedRoom.id})
                    </span>
                    <div className="text-[11px] text-[#94A3B8] mt-0.5">
                      {selectedRoom.status_reason}
                    </div>
                  </div>
                  {renderStatusBadge(selectedRoom.confidence_status)}
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => onConfirmElement({ kind: 'room', id: selectedRoom.id })}
                    className="py-1.5 px-2.5 rounded bg-[#10B981]/20 hover:bg-[#10B981]/30 text-[#10B981] border border-[#10B981]/40 text-xs font-semibold flex items-center justify-center gap-1"
                  >
                    <Check className="w-3.5 h-3.5" />
                    <span>Confirm Room</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => onRejectElement({ kind: 'room', id: selectedRoom.id })}
                    className="py-1.5 px-2.5 rounded bg-[#EF4444]/15 hover:bg-[#EF4444]/25 text-[#EF4444] border border-[#EF4444]/40 text-xs font-semibold flex items-center justify-center gap-1"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Remove Room</span>
                  </button>
                </div>

                <div className="space-y-2 pt-2 border-t border-[#222938] text-xs">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[#94A3B8]">Room Name</span>
                    <input
                      type="text"
                      value={selectedRoom.name}
                      onChange={(e) =>
                        onUpdateRoomMeta(selectedRoom.id, { name: e.target.value })
                      }
                      className="px-2 py-1 bg-[#12161F] border border-[#222938] rounded text-xs text-[#F8FAFC]"
                    />
                  </div>
                  <div className="flex items-center justify-between text-[11px] font-mono text-[#94A3B8]">
                    <span>Calibrated Dimensions</span>
                    <span className="text-[#38BDF8]">
                      {selectedRoom.width_m.toFixed(2)}m × {selectedRoom.length_m.toFixed(2)}m ({selectedRoom.area_m2.toFixed(1)} m²)
                    </span>
                  </div>
                </div>
              </div>
            )}

            {/* Selected Furniture Object Inspector (Full Position, Size, Rotation & BBox Diagnostics) */}
            {selectedFurniture && (
              <div className="p-3.5 rounded-md bg-[#0B0D11] border border-[#D97706] space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <span className="text-xs font-bold text-[#F8FAFC]">
                      {selectedFurniture.label}
                    </span>
                    <div className="text-[11px] text-[#94A3B8] mt-0.5">
                      {selectedFurniture.status_reason}
                    </div>
                  </div>
                  {renderStatusBadge(selectedFurniture.confidence_status)}
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() =>
                      onConfirmElement({ kind: 'furniture', id: selectedFurniture.id })
                    }
                    className="py-1.5 px-2.5 rounded bg-[#10B981]/20 hover:bg-[#10B981]/30 text-[#10B981] border border-[#10B981]/40 text-xs font-semibold flex items-center justify-center gap-1"
                  >
                    <Check className="w-3.5 h-3.5" />
                    <span>Confirm Object</span>
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      onRejectElement({ kind: 'furniture', id: selectedFurniture.id })
                    }
                    className="py-1.5 px-2.5 rounded bg-[#EF4444]/15 hover:bg-[#EF4444]/25 text-[#EF4444] border border-[#EF4444]/40 text-xs font-semibold flex items-center justify-center gap-1"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Delete Object</span>
                  </button>
                </div>

                <div className="space-y-2.5 pt-2 border-t border-[#222938] text-xs">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[#94A3B8]">Object Type</span>
                    <select
                      value={selectedFurniture.kind}
                      onChange={(e) => {
                        const newKind = e.target.value as FurnitureCategory;
                        const found = FURNITURE_KINDS.find((k) => k.value === newKind);
                        onUpdateFurnitureGeometry(selectedFurniture.id, {
                          kind: newKind,
                          label: found ? found.label : newKind,
                        });
                      }}
                      className="px-2 py-1 bg-[#12161F] border border-[#222938] rounded text-xs text-[#F8FAFC]"
                    >
                      {FURNITURE_KINDS.map((k) => (
                        <option key={k.value} value={k.value}>
                          {k.label}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[#94A3B8]">Orientation ({selectedFurniture.rotation_deg}°)</span>
                    <button
                      type="button"
                      onClick={() =>
                        onUpdateFurnitureGeometry(selectedFurniture.id, {
                          rotation_deg: (selectedFurniture.rotation_deg + 90) % 360,
                        })
                      }
                      className="px-2.5 py-1 bg-[#181D29] hover:bg-[#222938] text-[#F59E0B] border border-[#222938] rounded flex items-center gap-1 text-xs font-medium"
                    >
                      <RotateCw className="w-3 h-3" />
                      <span>Rotate 90°</span>
                    </button>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-[10px] text-[#94A3B8] block mb-1">
                        Center (X, Y px)
                      </label>
                      <div className="flex gap-1">
                        <input
                          type="number"
                          value={Math.round(selectedFurniture.center_px.x)}
                          onChange={(e) =>
                            onUpdateFurnitureGeometry(selectedFurniture.id, {
                              center_px: {
                                x: Number(e.target.value),
                                y: selectedFurniture.center_px.y,
                              },
                            })
                          }
                          className="w-full px-1.5 py-1 bg-[#12161F] border border-[#222938] rounded font-mono text-[11px] text-[#F8FAFC]"
                        />
                        <input
                          type="number"
                          value={Math.round(selectedFurniture.center_px.y)}
                          onChange={(e) =>
                            onUpdateFurnitureGeometry(selectedFurniture.id, {
                              center_px: {
                                x: selectedFurniture.center_px.x,
                                y: Number(e.target.value),
                              },
                            })
                          }
                          className="w-full px-1.5 py-1 bg-[#12161F] border border-[#222938] rounded font-mono text-[11px] text-[#F8FAFC]"
                        />
                      </div>
                    </div>
                    <div>
                      <label className="text-[10px] text-[#94A3B8] block mb-1">
                        Size W × D (px)
                      </label>
                      <div className="flex gap-1">
                        <input
                          type="number"
                          min="24"
                          max="400"
                          value={Math.round(selectedFurniture.width_px)}
                          onChange={(e) =>
                            onUpdateFurnitureGeometry(selectedFurniture.id, {
                              width_px: Math.max(24, Number(e.target.value)),
                            })
                          }
                          className="w-full px-1.5 py-1 bg-[#12161F] border border-[#222938] rounded font-mono text-[11px] text-[#F8FAFC]"
                        />
                        <input
                          type="number"
                          min="24"
                          max="400"
                          value={Math.round(selectedFurniture.depth_px)}
                          onChange={(e) =>
                            onUpdateFurnitureGeometry(selectedFurniture.id, {
                              depth_px: Math.max(24, Number(e.target.value)),
                            })
                          }
                          className="w-full px-1.5 py-1 bg-[#12161F] border border-[#222938] rounded font-mono text-[11px] text-[#F8FAFC]"
                        />
                      </div>
                    </div>
                  </div>

                  {selectedFurniture.detected_bbox_px && (
                    <div className="p-2 rounded bg-[#12161F] border border-[#222938] text-[10px] font-mono text-[#94A3B8] space-y-0.5">
                      <div>
                        Source BBox: [{selectedFurniture.detected_bbox_px.xmin},{' '}
                        {selectedFurniture.detected_bbox_px.ymin},{' '}
                        {selectedFurniture.detected_bbox_px.xmax},{' '}
                        {selectedFurniture.detected_bbox_px.ymax}] px
                      </div>
                      <div>
                        Detector: {selectedFurniture.detector_source || 'blueprint_annotation'} ·{' '}
                        {(selectedFurniture.width_px * mPerPx).toFixed(2)}m ×{' '}
                        {(selectedFurniture.depth_px * mPerPx).toFixed(2)}m
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Queue of Uncertain / Invalid Elements Requiring Review */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-[#F8FAFC] flex items-center gap-1.5">
                  <ShieldAlert className="w-3.5 h-3.5 text-[#F59E0B]" />
                  <span>Elements Flagged for Review ({reviewQueue.length})</span>
                </span>
                <button
                  type="button"
                  onClick={() =>
                    onChangeOverlayColorMode(
                      overlayColorMode === 'confidence' ? 'diagnostics' : 'confidence'
                    )
                  }
                  className="text-[11px] text-[#38BDF8] hover:underline"
                >
                  2D Mode: {overlayColorMode === 'confidence' ? 'Confidence' : 'Detection Boxes'}
                </button>
              </div>

              {reviewQueue.length === 0 ? (
                <div className="p-4 rounded-md bg-[#10B981]/10 border border-[#10B981]/30 text-xs text-[#10B981] flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 shrink-0" />
                  <span>
                    All walls, rooms, doors, windows, and furniture are verified at High Confidence!
                  </span>
                </div>
              ) : (
                <div className="space-y-2">
                  <button
                    type="button"
                    onClick={onAutoFixAllIssues}
                    className="w-full py-1.5 px-3 rounded bg-[#D97706] hover:bg-[#F59E0B] text-[#F8FAFC] text-xs font-semibold transition-colors flex items-center justify-center gap-1.5"
                  >
                    <Wrench className="w-3.5 h-3.5" />
                    <span>Auto-Fix & Confirm All Flagged ({reviewQueue.length})</span>
                  </button>
                  {reviewQueue.map((item) => {
                    const isSel =
                      selectedElement?.kind === item.kind && selectedElement.id === item.id;
                    return (
                      <div
                        key={`${item.kind}-${item.id}`}
                        onClick={() => onSelectElement({ kind: item.kind, id: item.id })}
                        className={`p-2.5 rounded-md border cursor-pointer transition-colors ${
                          isSel
                            ? 'bg-[#D97706]/15 border-[#D97706]'
                            : 'bg-[#0B0D11] border-[#222938] hover:border-[#334155]'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-xs font-semibold text-[#F8FAFC]">
                            {item.label}
                          </span>
                          {renderStatusBadge(item.status)}
                        </div>
                        <p className="text-[11px] text-[#94A3B8] mt-1">{item.reason}</p>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}

        {/* TAB 2: VALIDATION & QUALITY CHECKS */}
        {activeTab === 'validate' && (
          <div className="space-y-4">
            <div className="p-3 rounded-md bg-[#0B0D11] border border-[#222938] space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-[#F8FAFC]">
                  Automated Geometric Quality Checks
                </span>
                <span className="text-xs font-mono font-bold text-[#10B981]">
                  {evaluation_metrics.validation_checks_passed} / {evaluation_metrics.validation_checks_total} Passed
                </span>
              </div>

              <div className="space-y-1.5">
                {checkSummary.map((chk) => (
                  <div
                    key={chk.id}
                    className="flex items-center justify-between text-xs py-1 border-b border-[#222938]/60 last:border-none"
                  >
                    <span className="text-[#CBD5E1]">{chk.label}</span>
                    {chk.count === 0 ? (
                      <span className="text-[11px] font-mono text-[#10B981] flex items-center gap-1">
                        <CheckCircle2 className="w-3.5 h-3.5" /> Pass
                      </span>
                    ) : (
                      <span className="text-[11px] font-mono text-[#EF4444] font-semibold">
                        {chk.count} {chk.count === 1 ? 'Issue' : 'Issues'}
                      </span>
                    )}
                  </div>
                ))}
              </div>

              {validation_issues.length > 0 && (
                <button
                  type="button"
                  onClick={onAutoFixAllIssues}
                  className="w-full py-2 px-3 rounded bg-[#D97706] hover:bg-[#F59E0B] text-[#F8FAFC] text-xs font-semibold transition-colors flex items-center justify-center gap-1.5"
                >
                  <Wrench className="w-3.5 h-3.5" />
                  <span>Auto-Resolve All Geometric Issues ({validation_issues.length})</span>
                </button>
              )}
            </div>

            {validation_issues.length === 0 ? (
              <div className="p-4 rounded-md bg-[#10B981]/10 border border-[#10B981]/30 text-xs text-[#10B981] space-y-1">
                <div className="font-semibold flex items-center gap-1.5">
                  <CheckCircle2 className="w-4 h-4" />
                  <span>Zero Geometric Violations Detected</span>
                </div>
                <p className="text-[#94A3B8]">
                  All walls are connected, room boundaries are closed, and all doors/windows are properly associated with structural walls.
                </p>
              </div>
            ) : (
              <div className="space-y-2.5">
                {validation_issues.map((iss) => (
                  <div
                    key={iss.id}
                    onClick={() =>
                      onSelectElement({
                        kind: iss.element_type,
                        id: iss.element_id,
                      })
                    }
                    className="p-3 rounded-md bg-[#0B0D11] border border-[#222938] hover:border-[#475569] cursor-pointer space-y-2"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <span className="text-xs font-semibold text-[#F8FAFC] flex items-center gap-1.5">
                        <AlertTriangle
                          className={`w-3.5 h-3.5 shrink-0 ${
                            iss.severity === 'critical' ? 'text-[#EF4444]' : 'text-[#F59E0B]'
                          }`}
                        />
                        <span>{iss.title}</span>
                      </span>
                      <span
                        className={`text-[10px] font-mono uppercase px-1.5 py-0.5 rounded ${
                          iss.severity === 'critical'
                            ? 'bg-[#EF4444]/20 text-[#EF4444]'
                            : 'bg-[#F59E0B]/20 text-[#F59E0B]'
                        }`}
                      >
                        {iss.severity}
                      </span>
                    </div>
                    <p className="text-[11px] text-[#94A3B8]">{iss.description}</p>
                    <div className="text-[11px] text-[#38BDF8]">
                      Suggestion: {iss.suggestion}
                    </div>
                    {iss.fix_action && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onApplyValidationFix(iss);
                        }}
                        className="mt-1 w-full py-1.5 px-2.5 rounded bg-[#181D29] hover:bg-[#222938] text-[#10B981] border border-[#10B981]/40 text-xs font-semibold flex items-center justify-center gap-1"
                      >
                        <Wrench className="w-3 h-3" />
                        <span>Apply Suggested Fix</span>
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* TAB 3: DETECTOR DIAGNOSTICS, TRANSPARENCY & EVALUATION METRICS */}
        {activeTab === 'report' && (
          <div className="space-y-4">
            {/* Furniture Detector Architecture & Fine-Tuning Transparency */}
            <div className="p-3.5 rounded-md bg-[#0B0D11] border border-[#222938] space-y-2.5 text-xs">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-[#F8FAFC] flex items-center gap-1.5">
                  <Cpu className="w-3.5 h-3.5 text-[#38BDF8]" />
                  <span>Furniture Detector Transparency</span>
                </span>
                <span className="px-1.5 py-0.5 rounded bg-[#38BDF8]/15 text-[#38BDF8] font-mono text-[10px]">
                  {pipelineResult.execution_mode === 'gemini_vision_assisted'
                    ? 'Zero-Shot VLM'
                    : pipelineResult.execution_mode === 'custom_raster_cv'
                    ? 'Contour Heuristic'
                    : 'Reference Symbols'}
                </span>
              </div>

              <p className="text-[11px] text-[#94A3B8] leading-relaxed">
                FloorForge separates <strong>Furniture Detection</strong> from optional{' '}
                <strong>Room Completion</strong>. The current detector is <em>not</em> a custom-trained
                floor-plan neural network; it combines a zero-shot VLM (Gemini 3 Flash Vision bounding
                boxes) with a local 2D connected-component contour heuristic.
              </p>

              <div className="p-2.5 rounded bg-[#12161F] border border-[#222938] space-y-1 text-[11px] text-[#CBD5E1]">
                <div className="font-semibold text-[#F59E0B]">
                  How to Fine-Tune for Production CAD Symbols:
                </div>
                <p className="text-[#94A3B8]">
                  1. Train an oriented bounding-box detector (<strong>YOLOv8-OBB</strong> or{' '}
                  <strong>RT-DETR</strong>) on <strong>CubiCasa5k</strong> / <strong>SESYD</strong> +
                  labelled Indian architectural floor plans with <code>(cx, cy, w, h, θ)</code> labels.
                </p>
                <p className="text-[#94A3B8]">
                  2. Drag & verify objects on the 2D canvas, then export verified annotations below to
                  build your fine-tuning dataset.
                </p>
              </div>

              <button
                type="button"
                onClick={handleExportTrainingAnnotations}
                className="w-full py-1.5 px-3 rounded bg-[#181D29] hover:bg-[#222938] text-[#38BDF8] border border-[#222938] text-xs font-semibold flex items-center justify-center gap-1.5"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Export Verified Annotations (.JSON)</span>
              </button>
            </div>

            {/* Honest Evaluation Metrics */}
            <div className="p-3.5 rounded-md bg-[#0B0D11] border border-[#222938] space-y-2.5 text-xs">
              <div className="font-semibold text-[#F8FAFC]">Evaluation Metrics</div>

              <div className="grid grid-cols-4 gap-1.5 text-center bg-[#12161F] p-2 rounded border border-[#222938]">
                <div>
                  <div className="text-[10px] text-[#94A3B8]">Walls</div>
                  <div className="font-mono font-semibold text-[#F8FAFC]">
                    {evaluation_metrics.total_walls}
                  </div>
                </div>
                <div className="border-x border-[#222938]">
                  <div className="text-[10px] text-[#94A3B8]">Rooms</div>
                  <div className="font-mono font-semibold text-[#F8FAFC]">
                    {evaluation_metrics.total_rooms}
                  </div>
                </div>
                <div className="border-r border-[#222938]">
                  <div className="text-[10px] text-[#94A3B8]">Doors/Win</div>
                  <div className="font-mono font-semibold text-[#F8FAFC]">
                    {evaluation_metrics.total_openings}
                  </div>
                </div>
                <div>
                  <div className="text-[10px] text-[#94A3B8]">Objects</div>
                  <div className="font-mono font-semibold text-[#38BDF8]">
                    {furniture.length}
                  </div>
                </div>
              </div>

              <div className="space-y-2 pt-1">
                <div className="p-2 rounded bg-[#12161F] border border-[#222938]">
                  <div className="flex items-center justify-between">
                    <span className="text-[#94A3B8]">Dimension Error</span>
                    <span className="font-mono font-semibold text-[#38BDF8]">
                      {evaluation_metrics.dimension_error_m !== null
                        ? `±${evaluation_metrics.dimension_error_m.toFixed(3)} m`
                        : 'Not Calibrated'}
                    </span>
                  </div>
                  <div className="text-[10px] text-[#64748B] mt-0.5">
                    {evaluation_metrics.dimension_error_status}
                  </div>
                </div>

                <div className="p-2 rounded bg-[#12161F] border border-[#222938]">
                  <div className="flex items-center justify-between">
                    <span className="text-[#94A3B8]">Layout IoU (Ground Truth)</span>
                    <span className="font-mono font-semibold text-[#10B981]">
                      {evaluation_metrics.layout_iou !== null
                        ? `${(evaluation_metrics.layout_iou * 100).toFixed(1)}%`
                        : 'N/A (No GT)'}
                    </span>
                  </div>
                  <div className="text-[10px] text-[#64748B] mt-0.5">
                    {evaluation_metrics.layout_iou_status}
                  </div>
                </div>
              </div>
            </div>

            {/* Original vs. Corrected Reconstruction Comparison */}
            <div className="p-3.5 rounded-md bg-[#0B0D11] border border-[#222938] space-y-2.5 text-xs">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-[#F8FAFC]">
                  Original vs. Corrected Comparison
                </span>
                <button
                  type="button"
                  onClick={onToggleCompareOriginal}
                  className={`px-2 py-1 rounded text-[11px] font-semibold border transition-colors ${
                    isComparingOriginal
                      ? 'bg-[#F59E0B] text-[#0B0D11] border-[#F59E0B]'
                      : 'bg-[#181D29] text-[#F8FAFC] border-[#222938] hover:bg-[#222938]'
                  }`}
                >
                  {isComparingOriginal ? 'Viewing: Original AI' : 'Compare Original AI'}
                </button>
              </div>

              <div className="grid grid-cols-3 gap-1 text-[11px] font-mono bg-[#12161F] p-2 rounded border border-[#222938]">
                <div className="text-[#94A3B8]">Metric</div>
                <div className="text-right text-[#94A3B8]">Initial AI</div>
                <div className="text-right text-[#10B981]">Corrected</div>

                <div className="text-[#CBD5E1] py-1 border-t border-[#222938]">Unresolved</div>
                <div className="text-right text-[#F59E0B] py-1 border-t border-[#222938]">
                  {originalResult.model3d.provenance_report.unresolved_count}
                </div>
                <div className="text-right text-[#10B981] font-bold py-1 border-t border-[#222938]">
                  {provenance_report.unresolved_count}
                </div>

                <div className="text-[#CBD5E1] py-1 border-t border-[#222938]">Checks Passed</div>
                <div className="text-right text-[#94A3B8] py-1 border-t border-[#222938]">
                  {originalResult.model3d.evaluation_metrics.validation_checks_passed}/5
                </div>
                <div className="text-right text-[#10B981] font-bold py-1 border-t border-[#222938]">
                  {evaluation_metrics.validation_checks_passed}/5
                </div>

                <div className="text-[#CBD5E1] py-1 border-t border-[#222938]">User Edits</div>
                <div className="text-right text-[#94A3B8] py-1 border-t border-[#222938]">0</div>
                <div className="text-right text-[#38BDF8] font-bold py-1 border-t border-[#222938]">
                  {evaluation_metrics.user_corrections_count}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* TAB 4: ROOMS, OBJECTS & 3D PARAMETERS */}
        {activeTab === 'rooms' && (
          <div className="space-y-4">
            {/* Separate Detection vs Optional Auto-Furnish Empty Rooms Toggle */}
            <label className="flex items-center justify-between px-3 py-2.5 rounded bg-[#0B0D11] border border-[#222938] text-xs cursor-pointer">
              <div>
                <div className="font-semibold text-[#F8FAFC]">
                  {config.show_generated_completion
                    ? 'Mode: Detected + Auto-Furnish Empty Rooms'
                    : 'Strict Mode: Detected Plan Furniture Only'}
                </div>
                <div className="text-[10px] text-[#94A3B8]">
                  Never duplicates furniture already drawn in the source plan
                </div>
              </div>
              <input
                type="checkbox"
                checked={config.show_generated_completion}
                onChange={(e) =>
                  onChangeConfig((prev) => ({
                    ...prev,
                    show_generated_completion: e.target.checked,
                  }))
                }
                className="accent-[#D97706] w-4 h-4 rounded shrink-0"
              />
            </label>

            {/* Scale & Extrusion Sliders */}
            <div className="p-3 rounded-md bg-[#0B0D11] border border-[#222938] space-y-2.5 text-xs">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-[#F8FAFC] flex items-center gap-1.5">
                  <Sliders className="w-3.5 h-3.5 text-[#38BDF8]" />
                  <span>Scale & 3D Extrusion</span>
                </span>
                <button
                  type="button"
                  onClick={onOpenRuler}
                  className="text-[11px] text-[#F59E0B] hover:underline flex items-center gap-1"
                >
                  <Ruler className="w-3 h-3" />
                  <span>2D Scale Ruler</span>
                </button>
              </div>

              <div>
                <div className="flex justify-between mb-1">
                  <span className="text-[#94A3B8]">Wall Height</span>
                  <span className="font-mono text-[#F8FAFC]">
                    {config.wall_height_m.toFixed(1)} m
                  </span>
                </div>
                <input
                  type="range"
                  min={2.2}
                  max={4.2}
                  step={0.1}
                  value={config.wall_height_m}
                  onChange={(e) =>
                    onChangeConfig((prev) => ({
                      ...prev,
                      wall_height_m: parseFloat(e.target.value),
                    }))
                  }
                  className="w-full accent-[#D97706]"
                />
              </div>
            </div>

            {/* Room List */}
            <div className="space-y-2">
              {rooms.map((room) => {
                const isSelected =
                  selectedElement?.kind === 'room' && selectedElement.id === room.id;
                const roomObjects = furniture.filter((f) => f.room_id === room.id);

                return (
                  <div
                    key={room.id}
                    onClick={() =>
                      onSelectElement(isSelected ? null : { kind: 'room', id: room.id })
                    }
                    className={`p-3 rounded-md border cursor-pointer transition-colors ${
                      isSelected
                        ? 'bg-[#D97706]/15 border-[#D97706]'
                        : 'bg-[#0B0D11] border-[#222938] hover:border-[#334155]'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-semibold text-[#F8FAFC]">
                        {room.name}
                      </span>
                      <span className="text-xs font-mono font-semibold text-[#38BDF8]">
                        {room.area_m2.toFixed(1)} m²
                      </span>
                    </div>
                    <div className="mt-1 flex items-center justify-between text-[11px] text-[#94A3B8] font-mono">
                      <span>
                        {room.width_m.toFixed(2)}m × {room.length_m.toFixed(2)}m
                      </span>
                      {renderStatusBadge(room.confidence_status)}
                    </div>
                    {roomObjects.length > 0 && (
                      <div className="mt-2 pt-2 border-t border-[#222938]/80 flex flex-wrap gap-1.5 text-[11px]">
                        {roomObjects.map((obj) => (
                          <button
                            key={obj.id}
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              onSelectElement({ kind: 'furniture', id: obj.id });
                              onChangeTab('correct');
                            }}
                            className="font-mono text-[#10B981] hover:underline"
                          >
                            • {obj.label}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </aside>
  );
};
