import React, { useRef, useState } from 'react';
import {
  ConfidenceStatus,
  EditorToolMode,
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
  Move,
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
  onMoveWallSegment: (wallId: string, delta: Point2D) => void;
  onMoveRoomVertex: (roomId: string, vertexIndex: number, newPt: Point2D) => void;
  onMoveFurniture: (furnitureId: string, newCenter: Point2D) => void;
  onSlideOpening: (openingId: string, pointerPt: Point2D) => void;
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
  onMoveWallSegment,
  onMoveRoomVertex,
  onMoveFurniture,
  onSlideOpening,
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
  const [draggingWallSegment, setDraggingWallSegment] = useState<{
    wallId: string;
    lastPt: Point2D;
  } | null>(null);
  const [draggingRoomVertex, setDraggingRoomVertex] = useState<{
    roomId: string;
    vertexIndex: number;
  } | null>(null);
  const [draggingFurnitureId, setDraggingFurnitureId] = useState<string | null>(null);
  const [draggingOpeningId, setDraggingOpeningId] = useState<string | null>(null);

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

  /**
   * Exact inverse screen-to-SVG matrix transform accounting for scaling, aspect ratio, and offsets.
   */
  const clientToBlueprintCoords = (clientX: number, clientY: number): Point2D => {
    const svg = svgRef.current;
    if (!svg) return { x: 0, y: 0 };

    const ctm = svg.getScreenCTM();
    if (ctm) {
      const pt = svg.createSVGPoint();
      pt.x = clientX;
      pt.y = clientY;
      const transformed = pt.matrixTransform(ctm.inverse());
      return {
        x: Math.round(Math.max(8, Math.min(width - 8, transformed.x))),
        y: Math.round(Math.max(8, Math.min(height - 8, transformed.y))),
      };
    }

    const rect = svg.getBoundingClientRect();
    const x = Math.max(8, Math.min(width - 8, ((clientX - rect.left) / rect.width) * width));
    const y = Math.max(8, Math.min(height - 8, ((clientY - rect.top) / rect.height) * height));
    return { x: Math.round(x), y: Math.round(y) };
  };

  // Snap a point to existing wall endpoints if within 12px
  const snapToExistingVertices = (pt: Point2D, ignoreWallId?: string): Point2D => {
    for (const w of walls) {
      if (w.id === ignoreWallId) continue;
      if (Math.hypot(pt.x - w.start.x, pt.y - w.start.y) <= 12) {
        return { x: w.start.x, y: w.start.y };
      }
      if (Math.hypot(pt.x - w.end.x, pt.y - w.end.y) <= 12) {
        return { x: w.end.x, y: w.end.y };
      }
    }
    return pt;
  };

  const stopAllDragging = () => {
    setDraggingRulerHandle(null);
    setDraggingWallVertex(null);
    setDraggingWallSegment(null);
    setDraggingRoomVertex(null);
    setDraggingFurnitureId(null);
    setDraggingOpeningId(null);
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
      return;
    }

    if (draggingWallSegment) {
      const dx = rawPt.x - draggingWallSegment.lastPt.x;
      const dy = rawPt.y - draggingWallSegment.lastPt.y;
      if (Math.abs(dx) >= 2 || Math.abs(dy) >= 2) {
        onMoveWallSegment(draggingWallSegment.wallId, { x: dx, y: dy });
        setDraggingWallSegment({
          wallId: draggingWallSegment.wallId,
          lastPt: rawPt,
        });
      }
      return;
    }

    if (draggingRoomVertex) {
      onMoveRoomVertex(draggingRoomVertex.roomId, draggingRoomVertex.vertexIndex, rawPt);
      return;
    }

    if (draggingFurnitureId) {
      onMoveFurniture(draggingFurnitureId, rawPt);
      return;
    }

    if (draggingOpeningId) {
      onSlideOpening(draggingOpeningId, rawPt);
      return;
    }
  };

  const handleCanvasClick = (e: React.MouseEvent<SVGSVGElement>) => {
    if (
      draggingWallVertex ||
      draggingWallSegment ||
      draggingRoomVertex ||
      draggingFurnitureId ||
      draggingOpeningId ||
      draggingRulerHandle !== null
    ) {
      return;
    }
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
      {/* Row 1: Overlay Mode Switcher & Interactive Border / Object Editing Tools */}
      <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-2 bg-[#12161F] border-b border-[#222938]">
        {/* Overlay Color Mode Selector (Provenance View Removed) */}
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
            onClick={() => onChangeOverlayColorMode('diagnostics')}
            className={`px-2.5 py-1 text-xs font-medium rounded transition-colors whitespace-nowrap ${
              overlayColorMode === 'diagnostics'
                ? 'bg-[#38BDF8]/20 text-[#38BDF8] border border-[#38BDF8]/40'
                : 'text-[#94A3B8] hover:text-[#F1F5F9]'
            }`}
            title="Inspect detected furniture bounding boxes, centers, orientation vectors, and border vertices"
          >
            Detection Boxes
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
            title="Select & drag wall borders, room corners, furniture objects, or doors/windows"
          >
            <MousePointer className="w-3 h-3" />
            <span>Select / Drag Borders</span>
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
            title="Mark a missing wall border by clicking start and end points on the floor plan"
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
                ? `Click second endpoint on the floor plan to finish new wall border from (${newWallStart.x}, ${newWallStart.y})...`
                : 'Click the starting point on the floor plan to draw a missing wall border.'
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
            onPointerUp={stopAllDragging}
            onPointerLeave={stopAllDragging}
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

            {/* Room Polygons & Draggable Room Border Vertices */}
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
                  : '#38BDF8';

              const fillColor = isSelected
                ? 'rgba(217, 119, 6, 0.24)'
                : overlayColorMode === 'confidence'
                ? room.confidence_status === 'invalid'
                  ? 'rgba(239, 68, 68, 0.15)'
                  : room.confidence_status === 'uncertain'
                  ? 'rgba(245, 158, 11, 0.15)'
                  : 'rgba(16, 185, 129, 0.11)'
                : 'rgba(56, 189, 248, 0.11)';

              return (
                <g key={room.id}>
                  <polygon
                    points={pointsAttr}
                    fill={fillColor}
                    stroke={isSelected ? '#F8FAFC' : strokeColor}
                    strokeWidth={isSelected ? 3 : 1.75}
                    strokeDasharray={
                      room.confidence_status === 'uncertain' ? '6,4' : undefined
                    }
                    className="cursor-pointer"
                    onClick={(e) => {
                      if (editorTool !== 'select') return;
                      e.stopPropagation();
                      onSelectElement(isSelected ? null : { kind: 'room', id: room.id });
                    }}
                  />
                  <g
                    className="cursor-pointer"
                    onClick={(e) => {
                      if (editorTool !== 'select') return;
                      e.stopPropagation();
                      onSelectElement(isSelected ? null : { kind: 'room', id: room.id });
                    }}
                  >
                    <rect
                      x={cx - 72}
                      y={cy - 20}
                      width={144}
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
                  </g>

                  {/* Draggable Room Border Vertices when Room is Selected */}
                  {isSelected &&
                    room.polygon.map((pt, vIdx) => (
                      <rect
                        key={`${room.id}-v-${vIdx}`}
                        x={pt.x - 6}
                        y={pt.y - 6}
                        width={12}
                        height={12}
                        rx={2}
                        fill="#F59E0B"
                        stroke="#0B0D11"
                        strokeWidth={2}
                        className="cursor-move"
                        onPointerDown={(e) => {
                          if (editorTool !== 'select') return;
                          e.stopPropagation();
                          setDraggingRoomVertex({ roomId: room.id, vertexIndex: vIdx });
                        }}
                      >
                        <title>{`Drag to adjust ${room.name} corner border (${pt.x}, ${pt.y})`}</title>
                      </rect>
                    ))}
                  <title>{`${room.name} (${room.id}): Click to select & drag room border corners`}</title>
                </g>
              );
            })}

            {/* 2D Furniture & Fixtures (Interactive Click + Drag to Reposition + Detection BBox Overlay) */}
            {showFurniture &&
              furniture.map((item) => {
                const isSelected =
                  selectedElement?.kind === 'furniture' && selectedElement.id === item.id;
                const strokeColor =
                  overlayColorMode === 'confidence'
                    ? getStatusColor(item.confidence_status)
                    : '#38BDF8';

                return (
                  <g key={item.id}>
                    {/* Raw Detected Bounding Box in Diagnostics Mode */}
                    {overlayColorMode === 'diagnostics' && item.detected_bbox_px && (
                      <rect
                        x={item.detected_bbox_px.xmin}
                        y={item.detected_bbox_px.ymin}
                        width={item.detected_bbox_px.xmax - item.detected_bbox_px.xmin}
                        height={item.detected_bbox_px.ymax - item.detected_bbox_px.ymin}
                        fill="none"
                        stroke="#F59E0B"
                        strokeWidth={1.2}
                        strokeDasharray="3,3"
                        className="pointer-events-none"
                      />
                    )}

                    <g
                      transform={`translate(${item.center_px.x}, ${item.center_px.y}) rotate(${item.rotation_deg})`}
                      onPointerDown={(e) => {
                        if (editorTool !== 'select') return;
                        e.stopPropagation();
                        onSelectElement({ kind: 'furniture', id: item.id });
                        setDraggingFurnitureId(item.id);
                      }}
                      className="cursor-move"
                    >
                      <rect
                        x={-item.width_px / 2}
                        y={-item.depth_px / 2}
                        width={item.width_px}
                        height={item.depth_px}
                        rx={4}
                        fill={
                          isSelected
                            ? 'rgba(217, 119, 6, 0.35)'
                            : 'rgba(15, 23, 42, 0.62)'
                        }
                        stroke={isSelected ? '#F8FAFC' : strokeColor}
                        strokeWidth={isSelected ? 2.6 : 1.8}
                        strokeDasharray={
                          item.provenance === 'generated_completion' ? '4,3' : undefined
                        }
                      />
                      {/* Front Orientation Indicator Line (shows which way the 3D model faces) */}
                      <line
                        x1={0}
                        y1={0}
                        x2={0}
                        y2={item.depth_px * 0.42}
                        stroke={isSelected ? '#F59E0B' : strokeColor}
                        strokeWidth={2}
                      />
                      <circle
                        cx={0}
                        cy={0}
                        r={3}
                        fill={isSelected ? '#F8FAFC' : strokeColor}
                      />
                      <text
                        x={0}
                        y={-3}
                        textAnchor="middle"
                        fill="#F8FAFC"
                        fontSize="8.5"
                        fontFamily="JetBrains Mono, monospace"
                        fontWeight="600"
                      >
                        {item.kind.replace('_', ' ').toUpperCase()}
                      </text>
                      <title>{`${item.label} (${item.center_px.x}, ${item.center_px.y}) — Drag to reposition`}</title>
                    </g>
                  </g>
                );
              })}

            {/* Structural & Partition Wall Borders (Select + Drag Entire Border + Drag Endpoints) */}
            {walls.map((wall) => {
              const isSelected =
                selectedElement?.kind === 'wall' && selectedElement.id === wall.id;
              const strokeColor =
                overlayColorMode === 'confidence'
                  ? getStatusColor(wall.confidence_status)
                  : wall.is_exterior
                  ? '#38BDF8'
                  : '#CBD5E1';

              const midX = Math.round((wall.start.x + wall.end.x) / 2);
              const midY = Math.round((wall.start.y + wall.end.y) / 2);

              return (
                <g key={wall.id}>
                  {/* Wide hit line for selecting OR dragging the entire wall border segment */}
                  <line
                    x1={wall.start.x}
                    y1={wall.start.y}
                    x2={wall.end.x}
                    y2={wall.end.y}
                    stroke="transparent"
                    strokeWidth={24}
                    className="cursor-move"
                    onPointerDown={(e) => {
                      if (editorTool !== 'select') return;
                      e.stopPropagation();
                      const pt = clientToBlueprintCoords(e.clientX, e.clientY);
                      onSelectElement({ kind: 'wall', id: wall.id });
                      setDraggingWallSegment({ wallId: wall.id, lastPt: pt });
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

                  {/* Center Grip Handle when wall border is selected */}
                  {isSelected && (
                    <g
                      className="cursor-move"
                      onPointerDown={(e) => {
                        if (editorTool !== 'select') return;
                        e.stopPropagation();
                        const pt = clientToBlueprintCoords(e.clientX, e.clientY);
                        setDraggingWallSegment({ wallId: wall.id, lastPt: pt });
                      }}
                    >
                      <rect
                        x={midX - 9}
                        y={midY - 9}
                        width={18}
                        height={18}
                        rx={4}
                        fill="#D97706"
                        stroke="#F8FAFC"
                        strokeWidth={1.8}
                      />
                      <title>{`Drag to slide entire wall border ${wall.id}`}</title>
                    </g>
                  )}

                  {/* Draggable Wall Endpoints (Always interactive so any border vertex can be dragged) */}
                  {(['start', 'end'] as const).map((ep) => {
                    const pt = wall[ep];
                    const isEmphasized =
                      isSelected ||
                      wall.confidence_status === 'invalid' ||
                      wall.confidence_status === 'uncertain';
                    return (
                      <circle
                        key={`${wall.id}-${ep}`}
                        cx={pt.x}
                        cy={pt.y}
                        r={isSelected ? 8 : isEmphasized ? 6.5 : 4.5}
                        fill={isSelected ? '#F59E0B' : strokeColor}
                        stroke="#0B0D11"
                        strokeWidth={1.8}
                        className="cursor-grab active:cursor-grabbing"
                        onPointerDown={(e) => {
                          if (editorTool !== 'select') return;
                          e.stopPropagation();
                          onSelectElement({ kind: 'wall', id: wall.id });
                          setDraggingWallVertex({ wallId: wall.id, endpoint: ep });
                        }}
                      >
                        <title>{`Drag to move ${wall.id} ${ep} border vertex (${pt.x}, ${pt.y})`}</title>
                      </circle>
                    );
                  })}
                  <title>{`Wall Border ${wall.id}: Drag line to move border or drag circular endpoints`}</title>
                </g>
              );
            })}

            {/* Doors & Windows (Closed Doors + Drag Along Wall to Reposition) */}
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
                  : op.kind === 'door'
                  ? '#F59E0B'
                  : '#2DD4BF';

              return (
                <g
                  key={op.id}
                  className="cursor-grab active:cursor-grabbing"
                  onPointerDown={(e) => {
                    if (editorTool !== 'select') return;
                    e.stopPropagation();
                    onSelectElement({ kind: 'opening', id: op.id });
                    setDraggingOpeningId(op.id);
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
                  <title>{`${op.id} (${op.kind}): Drag to slide along wall`}</title>
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
                stroke="#F59E0B"
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
            <span aria-hidden="true" className="hidden xl:inline">·</span>
            <span className="hidden xl:flex items-center gap-1 text-[#38BDF8]">
              <Move className="w-3 h-3" />
              <span>Drag walls, corners, doors & objects</span>
            </span>
          </div>

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
