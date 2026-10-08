import React, { useRef, useState } from 'react';
import {
  FloorPlanPipelineResult,
  Point2D,
} from '../types/floorforge';
import { Eye, EyeOff, Ruler, Upload, Sparkles } from 'lucide-react';

interface BlueprintCanvas2DProps {
  imageDataUrl: string;
  pipelineResult: FloorPlanPipelineResult;
  selectedRoomId: string | null;
  onSelectRoom: (roomId: string | null) => void;
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

export const BlueprintCanvas2D: React.FC<BlueprintCanvas2DProps> = ({
  imageDataUrl,
  pipelineResult,
  selectedRoomId,
  onSelectRoom,
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
  const [showVectors, setShowVectors] = useState(true);
  const [showFurniture, setShowFurniture] = useState(true);
  const [draggingHandle, setDraggingHandle] = useState<0 | 1 | null>(null);
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
    const x = Math.max(20, Math.min(width - 20, ((clientX - rect.left) / rect.width) * width));
    const y = Math.max(20, Math.min(height - 20, ((clientY - rect.top) / rect.height) * height));
    return { x: Math.round(x), y: Math.round(y) };
  };

  const handlePointerMove = (e: React.PointerEvent<SVGSVGElement>) => {
    if (draggingHandle === null) return;
    const pt = clientToBlueprintCoords(e.clientX, e.clientY);
    onChangeRulerPoints([
      draggingHandle === 0 ? pt : rulerPoints[0],
      draggingHandle === 1 ? pt : rulerPoints[1],
    ]);
  };

  const rulerPxDist = Math.hypot(
    rulerPoints[1].x - rulerPoints[0].x,
    rulerPoints[1].y - rulerPoints[0].y
  );

  const roomColorMap: Record<string, { fill: string; stroke: string }> = {
    living: { fill: 'rgba(56, 189, 248, 0.14)', stroke: '#38BDF8' },
    bedroom: { fill: 'rgba(129, 140, 248, 0.16)', stroke: '#818CF8' },
    kitchen: { fill: 'rgba(245, 158, 11, 0.14)', stroke: '#F59E0B' },
    bathroom: { fill: 'rgba(45, 212, 191, 0.16)', stroke: '#2DD4BF' },
    hallway: { fill: 'rgba(148, 163, 184, 0.14)', stroke: '#94A3B8' },
    office: { fill: 'rgba(167, 139, 250, 0.15)', stroke: '#A78BFA' },
    utility: { fill: 'rgba(100, 116, 139, 0.16)', stroke: '#64748B' },
    balcony: { fill: 'rgba(52, 211, 153, 0.15)', stroke: '#34D399' },
  };

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
      {/* Clean Sub-Header */}
      <div className="flex items-center justify-between gap-2 px-4 py-2.5 bg-[#12161F] border-b border-[#222938]">
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold text-[#F1F5F9]">2D Blueprint & Layout Vectors</span>
          <span className="text-xs text-[#64748B]" aria-hidden="true">·</span>
          <span className="text-xs text-[#94A3B8]">
            {rooms.length} Rooms · {furniture.length} Objects
          </span>
        </div>

        <div className="flex items-center gap-1 bg-[#0B0D11] p-1 rounded-md border border-[#222938]">
          <button
            type="button"
            onClick={() => setShowRaster((v) => !v)}
            className={`px-2 py-1 text-xs font-medium rounded transition-colors flex items-center gap-1 whitespace-nowrap ${
              showRaster ? 'bg-[#181D29] text-[#F1F5F9]' : 'text-[#64748B] hover:text-[#94A3B8]'
            }`}
          >
            {showRaster ? <Eye className="w-3 h-3" /> : <EyeOff className="w-3 h-3" />}
            <span>Image</span>
          </button>
          <button
            type="button"
            onClick={() => setShowVectors((v) => !v)}
            className={`px-2 py-1 text-xs font-medium rounded transition-colors whitespace-nowrap ${
              showVectors ? 'bg-[#38BDF8]/20 text-[#38BDF8]' : 'text-[#64748B] hover:text-[#94A3B8]'
            }`}
          >
            Rooms & Walls
          </button>
          <button
            type="button"
            onClick={() => setShowFurniture((v) => !v)}
            className={`px-2 py-1 text-xs font-medium rounded transition-colors whitespace-nowrap ${
              showFurniture ? 'bg-[#10B981]/20 text-[#10B981]' : 'text-[#64748B] hover:text-[#94A3B8]'
            }`}
          >
            Objects ({furniture.length})
          </button>
          <button
            type="button"
            onClick={onToggleRuler}
            className={`px-2 py-1 text-xs font-medium rounded transition-colors flex items-center gap-1 whitespace-nowrap ${
              rulerActive || isRulerCalibrated
                ? 'bg-[#D97706] text-[#F8FAFC]'
                : 'text-[#94A3B8] hover:text-[#F1F5F9]'
            }`}
          >
            <Ruler className="w-3 h-3" />
            <span>Ruler</span>
          </button>
        </div>
      </div>

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

      {/* Main 2D Canvas */}
      <div className="relative flex-1 flex items-center justify-center p-4 overflow-hidden">
        <div className="relative w-full h-full flex items-center justify-center">
          <svg
            ref={svgRef}
            viewBox={`0 0 ${width} ${height}`}
            className="max-w-full max-h-full w-auto h-auto rounded border border-[#222938] shadow-xl bg-[#12161F]"
            onPointerMove={handlePointerMove}
            onPointerUp={() => setDraggingHandle(null)}
            onPointerLeave={() => setDraggingHandle(null)}
          >
            {imageDataUrl && (
              <image
                href={imageDataUrl}
                x={0}
                y={0}
                width={width}
                height={height}
                opacity={showRaster ? 0.9 : 0.12}
                preserveAspectRatio="none"
              />
            )}

            {/* Room Polygons */}
            {showVectors &&
              rooms.map((room) => {
                const palette = roomColorMap[room.category] || roomColorMap.living;
                const isSelected = selectedRoomId === room.id;
                const pointsAttr = room.polygon.map((p) => `${p.x},${p.y}`).join(' ');
                const cx = room.polygon.reduce((acc, p) => acc + p.x, 0) / (room.polygon.length || 1);
                const cy = room.polygon.reduce((acc, p) => acc + p.y, 0) / (room.polygon.length || 1);

                return (
                  <g
                    key={room.id}
                    onClick={() => onSelectRoom(isSelected ? null : room.id)}
                    className="cursor-pointer"
                  >
                    <polygon
                      points={pointsAttr}
                      fill={isSelected ? 'rgba(217, 119, 6, 0.28)' : palette.fill}
                      stroke={isSelected ? '#F59E0B' : palette.stroke}
                      strokeWidth={isSelected ? 3 : 1.5}
                      strokeDasharray={room.provenance === 'generated_completion' ? '6,4' : undefined}
                    />
                    <rect
                      x={cx - 68}
                      y={cy - 19}
                      width={136}
                      height={38}
                      rx={4}
                      fill="rgba(11, 13, 17, 0.85)"
                      stroke={isSelected ? '#F59E0B' : palette.stroke}
                      strokeWidth={1}
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
                      fill="#38BDF8"
                      fontSize="10"
                      fontFamily="JetBrains Mono, monospace"
                      fontWeight="600"
                    >
                      {room.area_m2.toFixed(1)} m² ({room.width_m.toFixed(1)}×{room.length_m.toFixed(1)}m)
                    </text>
                  </g>
                );
              })}

            {/* 2D Furniture & Bathroom/Kitchen Fixtures Overlay */}
            {showFurniture &&
              furniture.map((item) => {
                const isCompleted = item.provenance === 'generated_completion';
                const strokeColor = isCompleted ? '#F59E0B' : '#10B981';
                const fillColor = isCompleted
                  ? 'rgba(245, 158, 11, 0.18)'
                  : 'rgba(16, 185, 129, 0.18)';

                return (
                  <g
                    key={item.id}
                    transform={`translate(${item.center_px.x}, ${item.center_px.y}) rotate(${item.rotation_deg})`}
                  >
                    <rect
                      x={-item.width_px / 2}
                      y={-item.depth_px / 2}
                      width={item.width_px}
                      height={item.depth_px}
                      rx={4}
                      fill={fillColor}
                      stroke={strokeColor}
                      strokeWidth={1.8}
                      strokeDasharray={isCompleted ? '4,3' : undefined}
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
                  </g>
                );
              })}

            {/* Exterior & Interior Partition Walls */}
            {showVectors &&
              walls.map((wall) => {
                const isCompleted = wall.provenance === 'generated_completion';
                return (
                  <g key={wall.id}>
                    <line
                      x1={wall.start.x}
                      y1={wall.start.y}
                      x2={wall.end.x}
                      y2={wall.end.y}
                      stroke={
                        isCompleted
                          ? '#F59E0B'
                          : wall.is_exterior
                          ? '#38BDF8'
                          : '#CBD5E1'
                      }
                      strokeWidth={Math.max(4, wall.thickness_px * 0.55)}
                      strokeLinecap="square"
                      strokeDasharray={isCompleted ? '8,4' : undefined}
                    />
                  </g>
                );
              })}

            {/* Doors & Windows */}
            {showVectors &&
              openings.map((op) => {
                const wall = walls.find((w) => w.id === op.wall_id);
                if (!wall) return null;
                const dx = wall.end.x - wall.start.x;
                const dy = wall.end.y - wall.start.y;
                const len = Math.hypot(dx, dy) || 1;
                const ux = dx / len;
                const uy = dy / len;
                const cx = wall.start.x + dx * op.position_t;
                const cy = wall.start.y + dy * op.position_t;
                const half = op.width_px / 2;
                const color = op.kind === 'door' ? '#F59E0B' : '#2DD4BF';

                return (
                  <g key={op.id}>
                    <line
                      x1={cx - ux * half}
                      y1={cy - uy * half}
                      x2={cx + ux * half}
                      y2={cy + uy * half}
                      stroke={color}
                      strokeWidth={7}
                      strokeLinecap="round"
                    />
                  </g>
                );
              })}

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
                        setDraggingHandle(idx);
                      }}
                    >
                      <circle cx={pt.x} cy={pt.y} r={11} fill="#D97706" stroke="#F8FAFC" strokeWidth={2} />
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
            <p className="text-xs text-[#94A3B8]">Instant multi-room & 3D furniture reconstruction</p>
          </div>
        )}

        {/* Clean Bottom Action Strip */}
        <div className="absolute bottom-3 left-4 right-4 flex flex-wrap items-center justify-between gap-2 px-3 py-2 rounded-md bg-[#0B0D11]/90 backdrop-blur-md border border-[#222938] text-xs">
          <div className="flex items-center gap-3 text-[#94A3B8]">
            <span className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-xs bg-[#10B981] inline-block" />
              <span>Observed</span>
            </span>
            <span aria-hidden="true">·</span>
            <span className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-xs bg-[#F59E0B] inline-block" />
              <span>AI Completed (PS06)</span>
            </span>
          </div>

          <div className="flex items-center gap-2">
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
              className="px-2.5 py-1 bg-[#181D29] hover:bg-[#222938] text-[#F1F5F9] border border-[#222938] rounded transition-colors flex items-center gap-1.5 whitespace-nowrap"
            >
              <Upload className="w-3.5 h-3.5 text-[#94A3B8]" />
              <span>Upload Plan</span>
            </button>
            <button
              type="button"
              onClick={onRunAiVision}
              disabled={isRunningPipeline}
              className="px-2.5 py-1 bg-[#D97706]/20 hover:bg-[#D97706]/30 text-[#F59E0B] border border-[#D97706]/40 rounded transition-colors flex items-center gap-1.5 whitespace-nowrap disabled:opacity-50"
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>{isRunningPipeline ? 'Refining...' : 'Refine with AI Vision'}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
