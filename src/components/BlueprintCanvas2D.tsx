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
  const [showWalls, setShowWalls] = useState(true);
  const [showOpenings, setShowOpenings] = useState(true);
  const [showRooms, setShowRooms] = useState(true);
  const [draggingHandle, setDraggingHandle] = useState<0 | 1 | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);

  const { image_width_px: width, image_height_px: height, walls, openings, rooms, scale } = pipelineResult;

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
    const next: [Point2D, Point2D] = [
      draggingHandle === 0 ? pt : rulerPoints[0],
      draggingHandle === 1 ? pt : rulerPoints[1],
    ];
    onChangeRulerPoints(next);
  };

  const handlePointerUp = () => {
    setDraggingHandle(null);
  };

  const rulerPxDist = Math.hypot(
    rulerPoints[1].x - rulerPoints[0].x,
    rulerPoints[1].y - rulerPoints[0].y
  );

  const roomColorMap: Record<string, { fill: string; stroke: string }> = {
    living: { fill: 'rgba(56, 189, 248, 0.16)', stroke: '#38BDF8' },
    bedroom: { fill: 'rgba(129, 140, 248, 0.18)', stroke: '#818CF8' },
    kitchen: { fill: 'rgba(245, 158, 11, 0.16)', stroke: '#F59E0B' },
    bathroom: { fill: 'rgba(45, 212, 191, 0.16)', stroke: '#2DD4BF' },
    hallway: { fill: 'rgba(148, 163, 184, 0.16)', stroke: '#94A3B8' },
    office: { fill: 'rgba(167, 139, 250, 0.16)', stroke: '#A78BFA' },
    utility: { fill: 'rgba(100, 116, 139, 0.18)', stroke: '#64748B' },
    balcony: { fill: 'rgba(52, 211, 153, 0.16)', stroke: '#34D399' },
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
      {/* Pane Sub-Header: 2D Input & Vector Segmentation Controls */}
      <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 bg-[#12161F] border-b border-[#222938]">
        <div className="flex items-center gap-3">
          <span className="text-xs font-semibold text-[#F1F5F9] tracking-tight">
            2D Floor-Plan & Segmentation Overlay
          </span>
          <span className="text-xs text-[#64748B]" aria-hidden="true">·</span>
          <span className="text-xs font-mono text-[#94A3B8] tabular-nums">
            {width}×{height}px
          </span>
          <span className="text-xs text-[#64748B]" aria-hidden="true">·</span>
          <span className="text-xs font-mono text-[#D97706] tabular-nums">
            {scale.meters_per_pixel.toFixed(4)} m/px
          </span>
        </div>

        {/* Interactive Overlay Layer Toggles */}
        <div className="flex items-center gap-1 bg-[#0B0D11] p-1 rounded-md border border-[#222938]">
          <button
            type="button"
            onClick={() => setShowRaster((v) => !v)}
            className={`px-2 py-1 text-xs font-medium rounded transition-colors whitespace-nowrap flex items-center gap-1 ${
              showRaster ? 'bg-[#181D29] text-[#F1F5F9]' : 'text-[#64748B] hover:text-[#94A3B8]'
            }`}
            title="Toggle original 2D floor-plan image"
          >
            {showRaster ? <Eye className="w-3 h-3" /> : <EyeOff className="w-3 h-3" />}
            <span>Plan</span>
          </button>
          <button
            type="button"
            onClick={() => setShowRooms((v) => !v)}
            className={`px-2 py-1 text-xs font-medium rounded transition-colors whitespace-nowrap ${
              showRooms ? 'bg-[#818CF8]/20 text-[#818CF8]' : 'text-[#64748B] hover:text-[#94A3B8]'
            }`}
          >
            Rooms ({rooms.length})
          </button>
          <button
            type="button"
            onClick={() => setShowWalls((v) => !v)}
            className={`px-2 py-1 text-xs font-medium rounded transition-colors whitespace-nowrap ${
              showWalls ? 'bg-[#38BDF8]/20 text-[#38BDF8]' : 'text-[#64748B] hover:text-[#94A3B8]'
            }`}
          >
            Walls ({walls.length})
          </button>
          <button
            type="button"
            onClick={() => setShowOpenings((v) => !v)}
            className={`px-2 py-1 text-xs font-medium rounded transition-colors whitespace-nowrap ${
              showOpenings ? 'bg-[#F59E0B]/20 text-[#F59E0B]' : 'text-[#64748B] hover:text-[#94A3B8]'
            }`}
          >
            Openings ({openings.length})
          </button>
          <button
            type="button"
            onClick={onToggleRuler}
            className={`px-2 py-1 text-xs font-medium rounded transition-colors whitespace-nowrap flex items-center gap-1 ${
              rulerActive || isRulerCalibrated
                ? 'bg-[#D97706] text-[#F8FAFC]'
                : 'text-[#94A3B8] hover:text-[#F1F5F9]'
            }`}
            title="Interactive 2-point scale calibration ruler"
          >
            <Ruler className="w-3 h-3" />
            <span>Scale Ruler</span>
          </button>
        </div>
      </div>

      {/* Interactive Calibration Bar when Scale Ruler is toggled open */}
      {rulerActive && (
        <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-2 bg-[#181D29] border-b border-[#222938] text-xs">
          <div className="flex items-center gap-2 text-[#94A3B8]">
            <span>Drag endpoints A & B on the floor plan:</span>
            <span className="font-mono text-[#F1F5F9] tabular-nums">
              {Math.round(rulerPxDist)} px
            </span>
          </div>
          <div className="flex items-center gap-2">
            <label className="text-[#94A3B8]" htmlFor="ruler-dist-input">
              Known Span (m):
            </label>
            <input
              id="ruler-dist-input"
              type="number"
              step="0.1"
              min="0.3"
              max="50"
              value={rulerDistanceM}
              onChange={(e) => onChangeRulerDistanceM(Math.max(0.2, Number(e.target.value) || 1))}
              className="w-20 px-2 py-1 bg-[#0B0D11] border border-[#222938] rounded font-mono text-xs text-[#F1F5F9] tabular-nums focus:outline-none focus:border-[#D97706]"
            />
            <button
              type="button"
              onClick={onApplyRulerCalibration}
              className="px-2.5 py-1 bg-[#D97706] hover:bg-[#F59E0B] text-[#F8FAFC] font-medium rounded transition-colors whitespace-nowrap"
            >
              Apply Scale ({((rulerDistanceM || 1) / Math.max(1, rulerPxDist)).toFixed(4)} m/px)
            </button>
            {isRulerCalibrated && (
              <button
                type="button"
                onClick={onClearRulerCalibration}
                className="px-2 py-1 text-[#94A3B8] hover:text-[#F1F5F9] border border-[#222938] rounded transition-colors whitespace-nowrap"
              >
                Reset Auto
              </button>
            )}
          </div>
        </div>
      )}

      {/* Main 2D Blueprint Canvas Area */}
      <div className="relative flex-1 flex items-center justify-center p-4 overflow-hidden">
        {/* CAD Drafting Background Grid */}
        <div
          className="absolute inset-0 pointer-events-none opacity-25"
          style={{
            backgroundImage:
              'linear-gradient(to right, #1E293B 1px, transparent 1px), linear-gradient(to bottom, #1E293B 1px, transparent 1px)',
            backgroundSize: '24px 24px',
          }}
        />

        <div className="relative w-full h-full flex items-center justify-center">
          <svg
            ref={svgRef}
            viewBox={`0 0 ${width} ${height}`}
            className="max-w-full max-h-full w-auto h-auto rounded border border-[#222938] shadow-2xl bg-[#12161F]"
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerLeave={handlePointerUp}
          >
            {/* Base Raster Floor Plan Image */}
            {imageDataUrl && (
              <image
                href={imageDataUrl}
                x={0}
                y={0}
                width={width}
                height={height}
                opacity={showRaster ? 0.92 : 0.12}
                preserveAspectRatio="none"
              />
            )}

            {/* Segmented Room Polygons */}
            {showRooms &&
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
                    className="cursor-pointer transition-opacity"
                  >
                    <polygon
                      points={pointsAttr}
                      fill={isSelected ? 'rgba(217, 119, 6, 0.34)' : palette.fill}
                      stroke={isSelected ? '#F59E0B' : palette.stroke}
                      strokeWidth={isSelected ? 3 : 1.75}
                      strokeDasharray={isSelected ? undefined : '5,3'}
                    />
                    {/* Room Metric Tag */}
                    <rect
                      x={cx - 72}
                      y={cy - 22}
                      width={144}
                      height={44}
                      rx={4}
                      fill="rgba(11, 13, 17, 0.86)"
                      stroke={isSelected ? '#F59E0B' : palette.stroke}
                      strokeWidth={1.2}
                    />
                    <text
                      x={cx}
                      y={cy - 5}
                      textAnchor="middle"
                      fill="#F8FAFC"
                      fontSize="11"
                      fontFamily="Plus Jakarta Sans, sans-serif"
                      fontWeight="600"
                    >
                      {room.name}
                    </text>
                    <text
                      x={cx}
                      y={cy + 12}
                      textAnchor="middle"
                      fill="#38BDF8"
                      fontSize="11"
                      fontFamily="JetBrains Mono, monospace"
                      fontWeight="600"
                    >
                      {room.area_m2.toFixed(1)} m² · {room.width_m.toFixed(1)}×{room.length_m.toFixed(1)}m
                    </text>
                  </g>
                );
              })}

            {/* Vectorized Structural & Partition Walls */}
            {showWalls &&
              walls.map((wall) => {
                const mx = (wall.start.x + wall.end.x) / 2;
                const my = (wall.start.y + wall.end.y) / 2;
                const lenM = (
                  Math.hypot(wall.end.x - wall.start.x, wall.end.y - wall.start.y) *
                  scale.meters_per_pixel
                ).toFixed(2);

                return (
                  <g key={wall.id}>
                    <line
                      x1={wall.start.x}
                      y1={wall.start.y}
                      x2={wall.end.x}
                      y2={wall.end.y}
                      stroke={wall.is_exterior ? '#38BDF8' : '#94A3B8'}
                      strokeWidth={Math.max(4, wall.thickness_px * 0.55)}
                      strokeLinecap="square"
                      opacity={0.9}
                    />
                    {/* Endpoint vertices */}
                    <circle
                      cx={wall.start.x}
                      cy={wall.start.y}
                      r={4}
                      fill="#0B0D11"
                      stroke="#38BDF8"
                      strokeWidth={2}
                    />
                    <circle
                      cx={wall.end.x}
                      cy={wall.end.y}
                      r={4}
                      fill="#0B0D11"
                      stroke="#38BDF8"
                      strokeWidth={2}
                    />
                    <title>{`${wall.id} (${wall.is_exterior ? 'Exterior' : 'Partition'}): ${lenM}m · Conf ${(wall.confidence * 100).toFixed(0)}%`}</title>
                  </g>
                );
              })}

            {/* Detected Doors & Windows */}
            {showOpenings &&
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
                const x1 = cx - ux * half;
                const y1 = cy - uy * half;
                const x2 = cx + ux * half;
                const y2 = cy + uy * half;

                const isDoor = op.kind === 'door';
                const color = isDoor ? '#F59E0B' : '#2DD4BF';

                return (
                  <g key={op.id}>
                    <line
                      x1={x1}
                      y1={y1}
                      x2={x2}
                      y2={y2}
                      stroke={color}
                      strokeWidth={8}
                      strokeLinecap="round"
                    />
                    <circle
                      cx={cx}
                      cy={cy}
                      r={10}
                      fill="#0B0D11"
                      stroke={color}
                      strokeWidth={2}
                    />
                    <text
                      x={cx}
                      y={cy + 3.5}
                      textAnchor="middle"
                      fill={color}
                      fontSize="9"
                      fontFamily="JetBrains Mono, monospace"
                      fontWeight="600"
                    >
                      {isDoor ? 'D' : 'W'}
                    </text>
                  </g>
                );
              })}

            {/* Interactive 2-Point Scale Calibration Ruler */}
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
                      <circle
                        cx={pt.x}
                        cy={pt.y}
                        r={12}
                        fill="#D97706"
                        stroke="#F8FAFC"
                        strokeWidth={2.5}
                      />
                      <text
                        x={pt.x}
                        y={pt.y + 4}
                        textAnchor="middle"
                        fill="#F8FAFC"
                        fontSize="10"
                        fontFamily="JetBrains Mono, monospace"
                        fontWeight="600"
                      >
                        {idx === 0 ? 'A' : 'B'}
                      </text>
                    </g>
                  );
                })}
                {/* Midpoint label */}
                <rect
                  x={(rulerPoints[0].x + rulerPoints[1].x) / 2 - 58}
                  y={(rulerPoints[0].y + rulerPoints[1].y) / 2 - 26}
                  width={116}
                  height={22}
                  rx={4}
                  fill="#D97706"
                />
                <text
                  x={(rulerPoints[0].x + rulerPoints[1].x) / 2}
                  y={(rulerPoints[0].y + rulerPoints[1].y) / 2 - 11}
                  textAnchor="middle"
                  fill="#F8FAFC"
                  fontSize="11"
                  fontFamily="JetBrains Mono, monospace"
                  fontWeight="600"
                >
                  {rulerDistanceM.toFixed(2)}m ({Math.round(rulerPxDist)}px)
                </text>
              </g>
            )}
          </svg>
        </div>

        {/* Drag-and-Drop Overlay */}
        {isDragOver && (
          <div className="absolute inset-4 rounded-lg bg-[#0B0D11]/90 border-2 border-dashed border-[#D97706] flex flex-col items-center justify-center gap-2 z-20">
            <Upload className="w-8 h-8 text-[#D97706]" />
            <p className="text-sm font-semibold text-[#F1F5F9]">
              Drop 2D Floor-Plan Image (PNG, JPG, WebP)
            </p>
            <p className="text-xs text-[#94A3B8]">
              Automatically triggers predict → vectorize → solve_scale → build_model
            </p>
          </div>
        )}

        {/* Bottom Floating Legend & Upload / Vision Trigger Bar */}
        <div className="absolute bottom-3 left-4 right-4 flex flex-wrap items-center justify-between gap-2 px-3 py-2 rounded-md bg-[#0B0D11]/85 backdrop-blur-md border border-[#222938] text-xs">
          <div className="flex items-center gap-3 text-[#94A3B8]">
            <span className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-xs bg-[#38BDF8] inline-block" />
              <span>Exterior Wall</span>
            </span>
            <span aria-hidden="true">·</span>
            <span className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-xs bg-[#F59E0B] inline-block" />
              <span>Door</span>
            </span>
            <span aria-hidden="true">·</span>
            <span className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-xs bg-[#2DD4BF] inline-block" />
              <span>Window</span>
            </span>
            <span aria-hidden="true">·</span>
            <span className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-xs bg-[#818CF8] inline-block" />
              <span>Room Polygon</span>
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
              <span>Upload 2D Plan</span>
            </button>
            <button
              type="button"
              onClick={onRunAiVision}
              disabled={isRunningPipeline}
              className="px-2.5 py-1 bg-[#D97706]/20 hover:bg-[#D97706]/30 text-[#F59E0B] border border-[#D97706]/40 rounded transition-colors flex items-center gap-1.5 whitespace-nowrap disabled:opacity-50"
              title="Run server-side Gemini Vision segmentation on current 2D floor plan"
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>{isRunningPipeline ? 'Segmenting...' : 'AI Vision Re-Scan'}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
