import React, { useRef, useState } from 'react';
import {
  ConfidenceStatus,
  EditorToolMode,
  EpistemicProvenance,
  FloorPlanPipelineResult,
  OverlayColorMode,
  Point2D,
  SelectedElementRef,
} from '../types/floorforge';
import {
  Eye,
  EyeOff,
  Ruler,
  Upload,
  Sparkles,
  Undo2,
  Redo2,
  MousePointer,
  PlusSquare,
  DoorClosed,
  AppWindow,
} from 'lucide-react';

interface BlueprintCanvas2DProps {
  imageDataUrl: string;
  pipelineResult: FloorPlanPipelineResult;
  selectedElement: SelectedElementRef | null;
  onSelectElement: (el: SelectedElementRef | null) => void;
  editorTool: EditorToolMode;
  onChangeEditorTool: (tool: EditorToolMode) => void;
  overlayColorMode: OverlayColorMode;
  onChangeOverlayColorMode: (mode: OverlayColorMode) => void;
  onMoveWallEndpoint: (wallId: string, endpoint: 'start' | 'end', newPt: Point2D) => void;
  onAddMissingWall: (start: Point2D, end: Point2D) => void;
  onAddMissingOpeningAtPoint: (kind: 'door' | 'window', pt: Point2D) => void;
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  rulerActive: boolean;
  onToggleRuler: () => void;
  rulerPoints: [Point2D, Point2D];
  onChangeRulerPoints: (pts: [Point2D, Point2D]) => void;
  rulerDistanceM: number;
  onChangeRulerDistanceM: (val: number) => void;
  onApplyRulerCalibration: () => void;
  onClearRulerCalibration: () => void;
  isRulerCalibrated: boolean;
  onUploadFile: (file: File) => void;
  onRunAiVision: () => void;
  isRunningPipeline: boolean;
}

function getStatusColor(status?: ConfidenceStatus): string {
  if (status === 'invalid') return '#EF4444'; // Red
  if (status === 'uncertain') return '#F59E0B'; // Amber
  return '#10B981'; // Green
}

function getProvenanceColor(prov?: EpistemicProvenance): string {
  if (prov === 'user_corrected') return '#A855F7'; // Violet: User-Corrected
  if (prov === 'generated_completion') return '#F59E0B'; // Amber: Inferred
  return '#38BDF8'; // Cyan: AI-Detected
}

export const BlueprintCanvas2D: React.FC<BlueprintCanvas2DProps> = ({
  imageDataUrl,
  pipelineResult,
  selectedElement,
  onSelectElement,
  editorTool,
  onChangeEditorTool,
  overlayColorMode,
  onChangeOverlayColorMode,
  onMoveWallEndpoint,
  onAddMissingWall,
  onAddMissingOpeningAtPoint,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  rulerActive,
  onToggleRuler,
  rulerPoints,
  onChangeRulerPoints,
  rulerDistanceM,
  onChangeRulerDistanceM,
  onApplyRulerCalibration,
  onClearRulerCalibration,
  isRulerCalibrated,
  onUploadFile,
  onRunAiVision,
  isRunningPipeline,
}) => {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [showRaster, setShowRaster] = useState(true);
  const [showFurniture, setShowFurniture] = useState(true);
  const [draggingRulerHandle, setDraggingRulerHandle] = useState<0 | 1 | null>(null);
  const [draggingWallVertex, setDraggingWallVertex] = useState<{
    wallId: string;
    endpoint: 'start' | 'end';
  } | null>(null);
  const [newWallStart, setNewWallStart] = useState<Point2D | null>(null);
  const [hoverPoint, setHoverPoint] = useState<Point2D | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);

  const {
    image_width_px: width,
    image_height_px: height,
    walls,
    openings,
    furniture,
    rooms,
  } = pipelineResult;

  const clientToBlueprintCoords = (clientX: number, clientY: number): Point2D => {
    const svg = svgRef.current;
    if (!svg) return { x: 0, y: 0 };
    const rect = svg.getBoundingClientRect();
    const x = Math.max(12, Math.min(width - 12, ((clientX - rect.left) / rect.width) * width));
    const y = Math.max(12, Math.min(height - 12, ((clientY - rect.top) / rect.height) * height));
    return { x: Math.round(x), y: Math.round(y) };
  };

  // Snap a point to existing wall endpoints if within 14px
  const snapToExistingVertices = (pt: Point2D, ignoreWallId?: string): Point2D => {
    for (const w of walls) {
      if (w.id === ignoreWallId) continue;
      if (Math.hypot(pt.x - w.start.x, pt.y - w.start.y) <= 14) {
        return { x: w.start.x, y: w.start.y };
      }
      if (Math.hypot(pt.x - w.end.x, pt.y - w.end.y) <= 14) {
        return { x: w.end.x, y: w.end.y };
      }
    }
    return pt;
  };

  const handlePointerMove = (e: React.PointerEvent<SVGSVGElement>) => {
    const rawPt = clientToBlueprintCoords(e.clientX, e.clientY);
    setHoverPoint(rawPt);

    if (draggingRulerHandle !== null) {
      onChangeRulerPoints([
        draggingRulerHandle === 0 ? rawPt : rulerPoints[0],
        draggingRulerHandle === 1 ? rawPt : rulerPoints[1],
      ]);
      return;
    }

    if (draggingWallVertex) {
      const snapped = snapToExistingVertices(rawPt, draggingWallVertex.wallId);
      onMoveWallEndpoint(draggingWallVertex.wallId, draggingWallVertex.endpoint, snapped);
    }
  };

  const handleCanvasClick = (e: React.MouseEvent<SVGSVGElement>) => {
    if (draggingWallVertex || draggingRulerHandle !== null) return;
    const pt = snapToExistingVertices(clientToBlueprintCoords(e.clientX, e.clientY));

    if (editorTool === 'add_wall') {
      if (!newWallStart) {
        setNewWallStart(pt);
      } else {
        if (Math.hypot(pt.x - newWallStart.x, pt.y - newWallStart.y) > 20) {
          onAddMissingWall(newWallStart, pt);
        }
        setNewWallStart(null);
        onChangeEditorTool('select');
      }
    } else if (editorTool === 'add_door') {
      onAddMissingOpeningAtPoint('door', pt);
      onChangeEditorTool('select');
    } else if (editorTool === 'add_window') {
      onAddMissingOpeningAtPoint('window', pt);
      onChangeEditorTool('select');
    }
  };

  const rulerPxDist = Math.hypot(
    rulerPoints[1].x - rulerPoints[0].x,
    rulerPoints[1].y - rulerPoints[0].y
  );

  return (
    <div
      className="relative flex flex-col h-full w-full bg-[#0B0D11] select-none overflow-hidden"
      onDragOver={(e) => {
        e.preventDefault();
        setIsDragOver(true);
      }}
      onDragLeave={() => setIsDragOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setIsDragOver(false);
        const file = e.dataTransfer.files?.[0];
        if (file && file.type.startsWith('image/')) {
          onUploadFile(file);
        }
      }}
    >
      {/* Row 1: Overlay Mode Switcher & Undo/Redo Controls */}
      <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-2 bg-[#12161F] border-b border-[#222938]">
        {/* Overlay Color Mode Selector */}
        <div className="flex items-center gap-1 bg-[#0B0D11] p-1 rounded-md border border-[#222938]">
          <button
            type="button"
            onClick={() => onChangeOverlayColorMode('confidence')}
            className={`px-2.5 py-1 text-xs font-medium rounded transition-colors whitespace-nowrap ${
              overlayColorMode === 'confidence'
                ? 'bg-[#10B981]/20 text-[#10B981] border border-[#10B981]/40'
                : 'text-[#94A3B8] hover:text-[#F1F5F9]'
            }`}
            title="Show AI Confidence & Geometric Validation status (Green = High, Amber = Uncertain, Red = Disconnected/Invalid)"
          >
            AI Confidence Overlay
          </button>
          <button
            type="button"
            onClick={() => onChangeOverlayColorMode('provenance')}
            className={`px-2.5 py-1 text-xs font-medium rounded transition-colors whitespace-nowrap ${
              overlayColorMode === 'provenance'
                ? 'bg-[#A855F7]/20 text-[#C084FC] border border-[#A855F7]/40'
                : 'text-[#94A3B8] hover:text-[#F1F5F9]'
            }`}
            title="Distinguish AI-Detected (Cyan), User-Corrected (Purple), and Inferred (Amber) geometry"
          >
            Provenance View
          </button>
          <button
            type="button"
            onClick={() => onChangeOverlayColorMode('standard')}
            className={`px-2.5 py-1 text-xs font-medium rounded transition-colors whitespace-nowrap ${
              overlayColorMode === 'standard'
                ? 'bg-[#181D29] text-[#F1F5F9]'
                : 'text-[#94A3B8] hover:text-[#F1F5F9]'
            }`}
          >
            CAD View
          </button>
        </div>

        {/* Interactive Correction Tools & Undo/Redo */}
        <div className="flex items-center gap-1 bg-[#0B0D11] p-1 rounded-md border border-[#222938]">
          <button
            type="button"
            onClick={() => {
              setNewWallStart(null);
              onChangeEditorTool('select');
            }}
            className={`px-2 py-1 text-xs font-medium rounded flex items-center gap-1 transition-colors whitespace-nowrap ${
              editorTool === 'select'
                ? 'bg-[#D97706] text-[#F8FAFC]'
                : 'text-[#94A3B8] hover:text-[#F1F5F9]'
            }`}
            title="Select & drag wall endpoints, rooms, or openings"
          >
            <MousePointer className="w-3 h-3" />
            <span>Select / Edit</span>
          </button>
          <button
            type="button"
            onClick={() => {
              setNewWallStart(null);
              onChangeEditorTool(editorTool === 'add_wall' ? 'select' : 'add_wall');
            }}
            className={`px-2 py-1 text-xs font-medium rounded flex items-center gap-1 transition-colors whitespace-nowrap ${
              editorTool === 'add_wall'
                ? 'bg-[#D97706] text-[#F8FAFC]'
                : 'text-[#94A3B8] hover:text-[#F1F5F9]'
            }`}
            title="Mark a missing wall by clicking start and end points on the floor plan"
          >
            <PlusSquare className="w-3 h-3" />
            <span>+ Wall</span>
          </button>
          <button
            type="button"
            onClick={() =>
              onChangeEditorTool(editorTool === 'add_door' ? 'select' : 'add_door')
            }
            className={`px-2 py-1 text-xs font-medium rounded flex items-center gap-1 transition-colors whitespace-nowrap ${
              editorTool === 'add_door'
                ? 'bg-[#D97706] text-[#F8FAFC]'
                : 'text-[#94A3B8] hover:text-[#F1F5F9]'
            }`}
            title="Click on any wall to mark a missing door"
          >
            <DoorClosed className="w-3 h-3" />
            <span>+ Door</span>
          </button>
          <button
            type="button"
            onClick={() =>
              onChangeEditorTool(editorTool === 'add_window' ? 'select' : 'add_window')
            }
            className={`px-2 py-1 text-xs font-medium rounded flex items-center gap-1 transition-colors whitespace-nowrap ${
              editorTool === 'add_window'
                ? 'bg-[#D97706] text-[#F8FAFC]'
                : 'text-[#94A3B8] hover:text-[#F1F5F9]'
            }`}
            title="Click on any wall to mark a missing window"
          >
            <AppWindow className="w-3 h-3" />
            <span>+ Window</span>
          </button>

          <span className="text-[#222938] px-0.5">|</span>

          <button
            type="button"
            onClick={onUndo}
            disabled={!canUndo}
            className="p-1 text-[#94A3B8] hover:text-[#F8FAFC] disabled:opacity-30 rounded transition-colors"
            title="Undo last correction"
          >
            <Undo2 className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={onRedo}
            disabled={!canRedo}
            className="p-1 text-[#94A3B8] hover:text-[#F8FAFC] disabled:opacity-30 rounded transition-colors"
            title="Redo correction"
          >
            <Redo2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Tool Instruction Banner when adding missing elements */}
      {editorTool !== 'select' && (
        <div className="px-4 py-1.5 bg-[#D97706]/20 border-b border-[#D97706]/40 flex items-center justify-between text-xs text-[#F8FAFC]">
          <span>
            {editorTool === 'add_wall'
              ? newWallStart
                ? `Click second endpoint on the floor plan to finish new wall from (${newWallStart.x}, ${newWallStart.y})...`
                : 'Click the starting point on the floor plan to draw a missing wall segment.'
              : editorTool === 'add_door'
              ? 'Click anywhere along an existing wall to insert a missing door.'
              : 'Click anywhere along an existing wall to insert a missing window.'}
          </span>
          <button
            type="button"
            onClick={() => {
              setNewWallStart(null);
              onChangeEditorTool('select');
            }}
            className="text-xs underline text-[#F59E0B]"
          >
            Cancel
          </button>
        </div>
      )}

      {/* Interactive Calibration Bar */}
      {rulerActive && (
        <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-2 bg-[#181D29] border-b border-[#222938] text-xs">
          <span className="text-[#94A3B8]">
            Drag A & B on blueprint: <strong className="font-mono text-[#F8FAFC]">{Math.round(rulerPxDist)} px</strong>
          </span>
          <div className="flex items-center gap-2">
            <input
              type="number"
              step="0.1"
              min="0.3"
              max="50"
              value={rulerDistanceM}
              onChange={(e) => onChangeRulerDistanceM(Math.max(0.2, Number(e.target.value) || 1))}
              className="w-20 px-2 py-1 bg-[#0B0D11] border border-[#222938] rounded font-mono text-xs text-[#F1F5F9] tabular-nums"
            />
            <span className="text-[#94A3B8]">m</span>
            <button
              type="button"
              onClick={onApplyRulerCalibration}
              className="px-2.5 py-1 bg-[#D97706] hover:bg-[#F59E0B] text-[#F8FAFC] font-medium rounded transition-colors whitespace-nowrap"
            >
              Calibrate Scale
            </button>
            {isRulerCalibrated && (
              <button
                type="button"
                onClick={onClearRulerCalibration}
                className="px-2 py-1 text-[#94A3B8] hover:text-[#F1F5F9] border border-[#222938] rounded"
              >
                Auto
              </button>
            )}
          </div>
        </div>
      )}

      {/* Main 2D SVG Canvas */}
      <div className="relative flex-1 flex items-center justify-center p-3 overflow-hidden">
        <div className="relative w-full h-full flex items-center justify-center">
          <svg
            ref={svgRef}
            viewBox={`0 0 ${width} ${height}`}
            className={`max-w-full max-h-full w-auto h-auto rounded border border-[#222938] shadow-xl bg-[#12161F] ${
              editorTool !== 'select' ? 'cursor-crosshair' : ''
            }`}
            onPointerMove={handlePointerMove}
            onPointerUp={() => {
              setDraggingRulerHandle(null);
              setDraggingWallVertex(null);
            }}
            onPointerLeave={() => {
              setDraggingRulerHandle(null);
              setDraggingWallVertex(null);
            }}
            onClick={handleCanvasClick}
          >
            {imageDataUrl && (
              <image
                href={imageDataUrl}
                x={0}
                y={0}
                width={width}
                height={height}
                opacity={showRaster ? 0.88 : 0.12}
                preserveAspectRatio="none"
              />
            )}

            {/* Room Polygons */}
            {rooms.map((room) => {
              const isSelected =
                selectedElement?.kind === 'room' && selectedElement.id === room.id;
              const pointsAttr = room.polygon.map((p) => `${p.x},${p.y}`).join(' ');
              const cx =
                room.polygon.reduce((acc, p) => acc + p.x, 0) / (room.polygon.length || 1);
              const cy =
                room.polygon.reduce((acc, p) => acc + p.y, 0) / (room.polygon.length || 1);

              const strokeColor =
                overlayColorMode === 'confidence'
                  ? getStatusColor(room.confidence_status)
                  : overlayColorMode === 'provenance'
                  ? getProvenanceColor(room.provenance)
                  : '#38BDF8';

              const fillColor = isSelected
                ? 'rgba(217, 119, 6, 0.26)'
                : overlayColorMode === 'confidence'
                ? room.confidence_status === 'invalid'
                  ? 'rgba(239, 68, 68, 0.16)'
                  : room.confidence_status === 'uncertain'
                  ? 'rgba(245, 158, 11, 0.16)'
                  : 'rgba(16, 185, 129, 0.12)'
                : 'rgba(56, 189, 248, 0.12)';

              return (
                <g
                  key={room.id}
                  onClick={(e) => {
                    if (editorTool !== 'select') return;
                    e.stopPropagation();
                    onSelectElement(isSelected ? null : { kind: 'room', id: room.id });
                  }}
                  className="cursor-pointer"
                >
                  <polygon
                    points={pointsAttr}
                    fill={fillColor}
                    stroke={isSelected ? '#F8FAFC' : strokeColor}
                    strokeWidth={isSelected ? 3 : 1.75}
                    strokeDasharray={
                      room.confidence_status === 'uncertain' ||
                      room.provenance === 'generated_completion'
                        ? '6,4'
                        : undefined
                    }
                  />
                  <rect
                    x={cx - 70}
                    y={cy - 20}
                    width={140}
                    height={40}
                    rx={4}
                    fill="rgba(11, 13, 17, 0.88)"
                    stroke={isSelected ? '#F8FAFC' : strokeColor}
                    strokeWidth={1.2}
                  />
                  <text
                    x={cx}
                    y={cy - 4}
                    textAnchor="middle"
                    fill="#F8FAFC"
                    fontSize="10.5"
                    fontFamily="Plus Jakarta Sans, sans-serif"
                    fontWeight="600"
                  >
                    {room.name}
                  </text>
                  <text
                    x={cx}
                    y={cy + 11}
                    textAnchor="middle"
                    fill={strokeColor}
                    fontSize="10"
                    fontFamily="JetBrains Mono, monospace"
                    fontWeight="600"
                  >
                    {room.area_m2.toFixed(1)} m² · {Math.round(room.confidence * 100)}%
                  </text>
                  <title>{`${room.name} (${room.id}): ${room.status_reason || ''}`}</title>
                </g>
              );
            })}

            {/* 2D Furniture & Fixtures */}
            {showFurniture &&
              furniture.map((item) => {
                const isSelected =
                  selectedElement?.kind === 'furniture' && selectedElement.id === item.id;
                const strokeColor =
                  overlayColorMode === 'confidence'
                    ? getStatusColor(item.confidence_status)
                    : getProvenanceColor(item.provenance);

                return (
                  <g
                    key={item.id}
                    transform={`translate(${item.center_px.x}, ${item.center_px.y}) rotate(${item.rotation_deg})`}
                    onClick={(e) => {
                      if (editorTool !== 'select') return;
                      e.stopPropagation();
                      onSelectElement(
                        isSelected ? null : { kind: 'furniture', id: item.id }
                      );
                    }}
                    className="cursor-pointer"
                  >
                    <rect
                      x={-item.width_px / 2}
                      y={-item.depth_px / 2}
                      width={item.width_px}
                      height={item.depth_px}
                      rx={4}
                      fill="rgba(15, 23, 42, 0.55)"
                      stroke={isSelected ? '#F8FAFC' : strokeColor}
                      strokeWidth={isSelected ? 2.5 : 1.8}
                      strokeDasharray={
                        item.provenance === 'generated_completion' ? '4,3' : undefined
                      }
                    />
                    <text
                      x={0}
                      y={3}
                      textAnchor="middle"
                      fill="#F8FAFC"
                      fontSize="8.5"
                      fontFamily="JetBrains Mono, monospace"
                      fontWeight="600"
                    >
                      {item.kind.replace('_', ' ').toUpperCase()}
                    </text>
                    <title>{`${item.label}: ${item.status_reason || ''}`}</title>
                  </g>
                );
              })}

            {/* Structural & Partition Walls (Interactive Click + Endpoint Drag) */}
            {walls.map((wall) => {
              const isSelected =
                selectedElement?.kind === 'wall' && selectedElement.id === wall.id;
              const strokeColor =
                overlayColorMode === 'confidence'
                  ? getStatusColor(wall.confidence_status)
                  : overlayColorMode === 'provenance'
                  ? getProvenanceColor(wall.provenance)
                  : wall.is_exterior
                  ? '#38BDF8'
                  : '#CBD5E1';

              const showHandles =
                isSelected ||
                wall.confidence_status === 'invalid' ||
                wall.confidence_status === 'uncertain';

              return (
                <g key={wall.id}>
                  {/* Invisible wider hit line for easy clicking */}
                  <line
                    x1={wall.start.x}
                    y1={wall.start.y}
                    x2={wall.end.x}
                    y2={wall.end.y}
                    stroke="transparent"
                    strokeWidth={22}
                    className="cursor-pointer"
                    onClick={(e) => {
                      if (editorTool !== 'select') return;
                      e.stopPropagation();
                      onSelectElement({ kind: 'wall', id: wall.id });
                    }}
                  />
                  <line
                    x1={wall.start.x}
                    y1={wall.start.y}
                    x2={wall.end.x}
                    y2={wall.end.y}
                    stroke={isSelected ? '#F8FAFC' : strokeColor}
                    strokeWidth={Math.max(5, wall.thickness_px * 0.58)}
                    strokeLinecap="square"
                    className="pointer-events-none"
                  />

                  {/* Draggable Wall Endpoints when selected or uncertain/invalid */}
                  {showHandles &&
                    (['start', 'end'] as const).map((ep) => {
                      const pt = wall[ep];
                      return (
                        <circle
                          key={`${wall.id}-${ep}`}
                          cx={pt.x}
                          cy={pt.y}
                          r={isSelected ? 8 : 6}
                          fill={strokeColor}
                          stroke="#0B0D11"
                          strokeWidth={2}
                          className="cursor-grab active:cursor-grabbing"
                          onPointerDown={(e) => {
                            if (editorTool !== 'select') return;
                            e.stopPropagation();
                            onSelectElement({ kind: 'wall', id: wall.id });
                            setDraggingWallVertex({ wallId: wall.id, endpoint: ep });
                          }}
                        >
                          <title>{`Drag to adjust ${wall.id} ${ep} vertex (${pt.x}, ${pt.y})`}</title>
                        </circle>
                      );
                    })}
                  <title>{`Wall ${wall.id}: ${wall.status_reason || ''} (Click to inspect or drag endpoints)`}</title>
                </g>
              );
            })}

            {/* Doors & Windows (Closed Doors + Confidence/Provenance Color) */}
            {openings.map((op) => {
              const wall = walls.find((w) => w.id === op.wall_id);
              if (!wall) return null;
              const isSelected =
                selectedElement?.kind === 'opening' && selectedElement.id === op.id;
              const dx = wall.end.x - wall.start.x;
              const dy = wall.end.y - wall.start.y;
              const len = Math.hypot(dx, dy) || 1;
              const ux = dx / len;
              const uy = dy / len;
              const cx = wall.start.x + dx * op.position_t;
              const cy = wall.start.y + dy * op.position_t;
              const half = op.width_px / 2;

              const color =
                overlayColorMode === 'confidence'
                  ? getStatusColor(op.confidence_status)
                  : overlayColorMode === 'provenance'
                  ? getProvenanceColor(op.provenance)
                  : op.kind === 'door'
                  ? '#F59E0B'
                  : '#2DD4BF';

              return (
                <g
                  key={op.id}
                  className="cursor-pointer"
                  onClick={(e) => {
                    if (editorTool !== 'select') return;
                    e.stopPropagation();
                    onSelectElement({ kind: 'opening', id: op.id });
                  }}
                >
                  <line
                    x1={cx - ux * half}
                    y1={cy - uy * half}
                    x2={cx + ux * half}
                    y2={cy + uy * half}
                    stroke={isSelected ? '#F8FAFC' : color}
                    strokeWidth={9}
                    strokeLinecap="butt"
                  />
                  <circle
                    cx={cx}
                    cy={cy}
                    r={9}
                    fill="#0B0D11"
                    stroke={isSelected ? '#F8FAFC' : color}
                    strokeWidth={2}
                  />
                  <text
                    x={cx}
                    y={cy + 3.5}
                    textAnchor="middle"
                    fill="#F8FAFC"
                    fontSize="8.5"
                    fontFamily="JetBrains Mono, monospace"
                    fontWeight="600"
                  >
                    {op.kind === 'door' ? 'D' : 'W'}
                  </text>
                  <title>{`${op.id} (${op.kind}): ${op.status_reason || ''}`}</title>
                </g>
              );
            })}

            {/* Preview line when drawing a new missing wall */}
            {editorTool === 'add_wall' && newWallStart && hoverPoint && (
              <line
                x1={newWallStart.x}
                y1={newWallStart.y}
                x2={hoverPoint.x}
                y2={hoverPoint.y}
                stroke="#A855F7"
                strokeWidth={8}
                strokeDasharray="6,4"
              />
            )}

            {/* Interactive 2-Point Ruler */}
            {rulerActive && (
              <g>
                <line
                  x1={rulerPoints[0].x}
                  y1={rulerPoints[0].y}
                  x2={rulerPoints[1].x}
                  y2={rulerPoints[1].y}
                  stroke="#F59E0B"
                  strokeWidth={3}
                  strokeDasharray="6,4"
                />
                {([0, 1] as const).map((idx) => {
                  const pt = rulerPoints[idx];
                  return (
                    <g
                      key={idx}
                      className="cursor-grab active:cursor-grabbing"
                      onPointerDown={(e) => {
                        e.stopPropagation();
                        setDraggingRulerHandle(idx);
                      }}
                    >
                      <circle
                        cx={pt.x}
                        cy={pt.y}
                        r={11}
                        fill="#D97706"
                        stroke="#F8FAFC"
                        strokeWidth={2}
                      />
                      <text
                        x={pt.x}
                        y={pt.y + 3.5}
                        textAnchor="middle"
                        fill="#F8FAFC"
                        fontSize="9.5"
                        fontFamily="JetBrains Mono, monospace"
                        fontWeight="600"
                      >
                        {idx === 0 ? 'A' : 'B'}
                      </text>
                    </g>
                  );
                })}
              </g>
            )}
          </svg>
        </div>

        {isDragOver && (
          <div className="absolute inset-4 rounded-lg bg-[#0B0D11]/90 border-2 border-dashed border-[#D97706] flex flex-col items-center justify-center gap-2 z-20">
            <Upload className="w-8 h-8 text-[#D97706]" />
            <p className="text-sm font-semibold text-[#F1F5F9]">Drop 2D Floor-Plan Image</p>
          </div>
        )}

        {/* Bottom Legend & Quick Actions */}
        <div className="absolute bottom-3 left-4 right-4 flex flex-wrap items-center justify-between gap-2 px-3 py-2 rounded-md bg-[#0B0D11]/90 backdrop-blur-md border border-[#222938] text-xs">
          {overlayColorMode === 'confidence' ? (
            <div className="flex items-center gap-3 text-[#94A3B8]">
              <span className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-xs bg-[#10B981] inline-block" />
                <span>High Confidence</span>
              </span>
              <span aria-hidden="true">·</span>
              <span className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-xs bg-[#F59E0B] inline-block" />
                <span>Uncertain (Needs Review)</span>
              </span>
              <span aria-hidden="true">·</span>
              <span className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-xs bg-[#EF4444] inline-block" />
                <span>Disconnected / Invalid</span>
              </span>
            </div>
          ) : (
            <div className="flex items-center gap-3 text-[#94A3B8]">
              <span className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-xs bg-[#38BDF8] inline-block" />
                <span>AI-Detected</span>
              </span>
              <span aria-hidden="true">·</span>
              <span className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-xs bg-[#A855F7] inline-block" />
                <span>User-Corrected</span>
              </span>
              <span aria-hidden="true">·</span>
              <span className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-xs bg-[#F59E0B] inline-block" />
                <span>Inferred</span>
              </span>
            </div>
          )}

          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => setShowRaster((v) => !v)}
              className="px-2 py-1 bg-[#181D29] hover:bg-[#222938] text-[#94A3B8] hover:text-[#F1F5F9] border border-[#222938] rounded flex items-center gap-1"
            >
              {showRaster ? <Eye className="w-3 h-3" /> : <EyeOff className="w-3 h-3" />}
              <span>Plan</span>
            </button>
            <button
              type="button"
              onClick={() => setShowFurniture((v) => !v)}
              className={`px-2 py-1 border border-[#222938] rounded ${
                showFurniture ? 'bg-[#181D29] text-[#F1F5F9]' : 'text-[#64748B]'
              }`}
            >
              Objects
            </button>
            <button
              type="button"
              onClick={onToggleRuler}
              className={`px-2 py-1 border border-[#222938] rounded flex items-center gap-1 ${
                rulerActive ? 'bg-[#D97706] text-[#F8FAFC]' : 'bg-[#181D29] text-[#94A3B8]'
              }`}
            >
              <Ruler className="w-3 h-3" />
              <span>Scale</span>
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/png,image/jpeg,image/webp"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) onUploadFile(file);
                e.target.value = '';
              }}
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="px-2.5 py-1 bg-[#181D29] hover:bg-[#222938] text-[#F1F5F9] border border-[#222938] rounded flex items-center gap-1 whitespace-nowrap"
            >
              <Upload className="w-3.5 h-3.5 text-[#38BDF8]" />
              <span>Upload</span>
            </button>
            <button
              type="button"
              onClick={onRunAiVision}
              disabled={isRunningPipeline}
              className="px-2.5 py-1 bg-[#D97706]/20 hover:bg-[#D97706]/30 text-[#F59E0B] border border-[#D97706]/40 rounded flex items-center gap-1 whitespace-nowrap disabled:opacity-50"
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>{isRunningPipeline ? 'Scanning...' : 'AI Vision'}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
