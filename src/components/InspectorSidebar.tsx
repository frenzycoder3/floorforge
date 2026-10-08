import React, { useState } from 'react';
import {
  FloorPlanPipelineResult,
  PipelineConfig,
  PipelineStageId,
} from '../types/floorforge';
import {
  AlertTriangle,
  CheckCircle2,
  Code2,
  Info,
  Play,
  Ruler,
  Sliders,
} from 'lucide-react';

interface InspectorSidebarProps {
  pipelineResult: FloorPlanPipelineResult;
  config: PipelineConfig;
  onChangeConfig: (updater: (prev: PipelineConfig) => PipelineConfig) => void;
  selectedRoomId: string | null;
  onSelectRoom: (roomId: string | null) => void;
  activeStageFilter: PipelineStageId | null;
  onSelectStageFilter: (stage: PipelineStageId | null) => void;
  onOpenRuler: () => void;
  onOpenFastApiModal: () => void;
  onReRunPipeline: (useAiVision: boolean) => void;
  isRunningPipeline: boolean;
}

const PIPELINE_STAGES: { id: PipelineStageId; index: string; label: string; desc: string }[] = [
  {
    id: 'predict',
    index: '01',
    label: 'predict',
    desc: 'Semantic segmentation of walls, doors, windows, and room masks',
  },
  {
    id: 'vectorize',
    index: '02',
    label: 'vectorize',
    desc: 'Planar graph extraction & Manhattan orthogonal wall snapping',
  },
  {
    id: 'solve_scale',
    index: '03',
    label: 'solve_scale',
    desc: 'Metric scale calibration from OCR callouts or door-leaf priors',
  },
  {
    id: 'build_model',
    index: '04',
    label: 'build_model',
    desc: 'Watertight 3D wall extrusion, lintel/sill cutouts & GLB scene graph',
  },
];

export const InspectorSidebar: React.FC<InspectorSidebarProps> = ({
  pipelineResult,
  config,
  onChangeConfig,
  selectedRoomId,
  onSelectRoom,
  activeStageFilter,
  onSelectStageFilter,
  onOpenRuler,
  onOpenFastApiModal,
  onReRunPipeline,
  isRunningPipeline,
}) => {
  const [activeTab, setActiveTab] = useState<'parameters' | 'measurements' | 'warnings'>('parameters');
  const { scale, rooms, warnings, stage_timings_ms } = pipelineResult;

  const scaleConfidencePct = Math.round(scale.confidence * 100);
  const scaleStatusLabel =
    scaleConfidencePct >= 85
      ? 'High Confidence'
      : scaleConfidencePct >= 70
      ? 'Moderate Estimate'
      : 'Fallback Estimate';

  return (
    <aside className="w-full lg:w-[390px] xl:w-[420px] shrink-0 bg-[#12161F] border-l border-[#222938] flex flex-col h-full overflow-y-auto">
      {/* Section 01: Pipeline Stage Stepper (`predict -> vectorize -> solve_scale -> build_model`) */}
      <div className="p-4 border-b border-[#222938]">
        <div className="flex items-center justify-between gap-2 mb-2.5">
          <h2 className="text-xs font-semibold text-[#F1F5F9] tracking-tight">
            01. Pipeline Execution Stages
          </h2>
          <button
            type="button"
            onClick={onOpenFastApiModal}
            className="text-xs text-[#38BDF8] hover:underline flex items-center gap-1 whitespace-nowrap"
          >
            <Code2 className="w-3.5 h-3.5" />
            <span>FastAPI & JSON</span>
          </button>
        </div>

        {/* Active Execution Mode Banner (Clearly labels Mock vs AI Vision per user prompt) */}
        <div className="mb-3 px-3 py-2 rounded bg-[#0B0D11] border border-[#222938] flex items-center justify-between gap-2 text-xs">
          <div className="truncate">
            <span className="text-[#94A3B8]">Engine: </span>
            <span className="font-medium text-[#F1F5F9]">{pipelineResult.execution_badge}</span>
          </div>
          <button
            type="button"
            onClick={() => onReRunPipeline(true)}
            disabled={isRunningPipeline}
            className="px-2 py-0.5 rounded bg-[#181D29] hover:bg-[#222938] text-[#F59E0B] border border-[#222938] font-medium transition-colors whitespace-nowrap shrink-0 flex items-center gap-1"
            title="Run full pipeline with Gemini Vision analysis"
          >
            <Play className="w-3 h-3" />
            <span>{isRunningPipeline ? 'Running...' : 'Run AI'}</span>
          </button>
        </div>

        {/* 4-Stage Pipeline Grid */}
        <div className="grid grid-cols-2 gap-1.5">
          {PIPELINE_STAGES.map((st) => {
            const isSelected = activeStageFilter === st.id;
            const ms = stage_timings_ms[st.id] || 15;
            return (
              <button
                key={st.id}
                type="button"
                onClick={() => onSelectStageFilter(isSelected ? null : st.id)}
                className={`p-2.5 rounded text-left border transition-colors ${
                  isSelected
                    ? 'bg-[#181D29] border-[#D97706] text-[#F8FAFC]'
                    : 'bg-[#0B0D11] border-[#222938] hover:border-[#334155] text-[#F1F5F9]'
                }`}
                title={st.desc}
              >
                <div className="flex items-center justify-between gap-1 text-[11px] text-[#94A3B8]">
                  <span className="font-mono">{st.index}. Stage</span>
                  <span className="font-mono text-[#10B981] tabular-nums">{ms}ms</span>
                </div>
                <div className="mt-0.5 font-mono text-xs font-semibold text-[#F8FAFC] truncate">
                  {st.label}
                </div>
              </button>
            );
          })}
        </div>

        {activeStageFilter && (
          <div className="mt-2 px-3 py-2 rounded bg-[#0B0D11] border border-[#222938] text-xs text-[#94A3B8]">
            <span className="font-mono text-[#F59E0B] font-semibold">{activeStageFilter}: </span>
            <span>
              {PIPELINE_STAGES.find((s) => s.id === activeStageFilter)?.desc}
            </span>
          </div>
        )}
      </div>

      {/* Section 02: Scale Confidence Telemetry Summary */}
      <div className="p-4 border-b border-[#222938] bg-[#0B0D11]/40">
        <div className="flex items-center justify-between gap-2 mb-1.5">
          <span className="text-xs font-semibold text-[#F1F5F9]">
            02. Real-World Scale Estimation
          </span>
          <span
            className={`text-xs font-mono font-semibold tabular-nums ${
              scaleConfidencePct >= 85
                ? 'text-[#10B981]'
                : scaleConfidencePct >= 70
                ? 'text-[#F59E0B]'
                : 'text-[#EF4444]'
            }`}
          >
            {scaleConfidencePct}% ({scaleStatusLabel})
          </span>
        </div>

        {/* Confidence Bar */}
        <div className="w-full h-1.5 bg-[#0B0D11] rounded-full overflow-hidden border border-[#222938] mb-2">
          <div
            className="h-full transition-transform duration-150 origin-left"
            style={{
              backgroundColor:
                scaleConfidencePct >= 85
                  ? '#10B981'
                  : scaleConfidencePct >= 70
                  ? '#F59E0B'
                  : '#EF4444',
              transform: `scaleX(${Math.min(1, Math.max(0.05, scale.confidence))})`,
            }}
          />
        </div>

        <div className="flex items-center justify-between text-xs text-[#94A3B8]">
          <span className="truncate">{scale.reference_label}</span>
          <span className="font-mono text-[#F8FAFC] font-semibold tabular-nums shrink-0 ml-2">
            {scale.meters_per_pixel.toFixed(4)} m/px
          </span>
        </div>
      </div>

      {/* Interactive Inspector Mode Tabs */}
      <div className="px-4 pt-3 pb-2 border-b border-[#222938] bg-[#12161F]">
        <div className="grid grid-cols-3 gap-1 p-1 bg-[#0B0D11] rounded-md border border-[#222938]">
          <button
            type="button"
            onClick={() => setActiveTab('parameters')}
            className={`py-1.5 px-2 text-xs font-medium rounded transition-colors whitespace-nowrap ${
              activeTab === 'parameters'
                ? 'bg-[#181D29] text-[#F8FAFC] shadow-xs'
                : 'text-[#94A3B8] hover:text-[#F1F5F9]'
            }`}
          >
            Parameters
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('measurements')}
            className={`py-1.5 px-2 text-xs font-medium rounded transition-colors whitespace-nowrap ${
              activeTab === 'measurements'
                ? 'bg-[#181D29] text-[#F8FAFC] shadow-xs'
                : 'text-[#94A3B8] hover:text-[#F1F5F9]'
            }`}
          >
            Rooms ({rooms.length})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('warnings')}
            className={`py-1.5 px-2 text-xs font-medium rounded transition-colors whitespace-nowrap ${
              activeTab === 'warnings'
                ? 'bg-[#181D29] text-[#F8FAFC] shadow-xs'
                : 'text-[#94A3B8] hover:text-[#F1F5F9]'
            }`}
          >
            Warnings ({warnings.length})
          </button>
        </div>
      </div>

      {/* Tab Content Area */}
      <div className="p-4 flex-1 space-y-5">
        {activeTab === 'parameters' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-[#F1F5F9] flex items-center gap-1.5">
                <Sliders className="w-3.5 h-3.5 text-[#D97706]" />
                <span>3D Geometry & Scale Controls</span>
              </span>
              <button
                type="button"
                onClick={() =>
                  onChangeConfig((prev) => ({
                    ...prev,
                    wall_height_m: 2.8,
                    wall_thickness_m: 0.18,
                    default_door_width_m: 0.9,
                    scale_override_m_per_px: null,
                    manhattan_snap: true,
                    include_floor_slabs: true,
                    include_openings_3d: true,
                  }))
                }
                className="text-xs text-[#94A3B8] hover:text-[#F1F5F9]"
              >
                Reset Defaults
              </button>
            </div>

            {/* Wall Extrusion Height */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-xs">
                <label htmlFor="wall-height-slider" className="text-[#94A3B8]">
                  Ceiling / Wall Extrusion Height
                </label>
                <span className="font-mono text-[#F8FAFC] font-semibold tabular-nums">
                  {config.wall_height_m.toFixed(2)} m
                </span>
              </div>
              <input
                id="wall-height-slider"
                type="range"
                min="2.2"
                max="4.5"
                step="0.05"
                value={config.wall_height_m}
                onChange={(e) =>
                  onChangeConfig((prev) => ({
                    ...prev,
                    wall_height_m: Number(e.target.value),
                  }))
                }
                className="w-full accent-[#D97706] cursor-pointer"
              />
            </div>

            {/* Structural Wall Thickness */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-xs">
                <label htmlFor="wall-thickness-slider" className="text-[#94A3B8]">
                  Interior Partition Thickness
                </label>
                <span className="font-mono text-[#F8FAFC] font-semibold tabular-nums">
                  {config.wall_thickness_m.toFixed(2)} m (Ext {(config.wall_thickness_m * 1.25).toFixed(2)}m)
                </span>
              </div>
              <input
                id="wall-thickness-slider"
                type="range"
                min="0.10"
                max="0.36"
                step="0.02"
                value={config.wall_thickness_m}
                onChange={(e) =>
                  onChangeConfig((prev) => ({
                    ...prev,
                    wall_thickness_m: Number(e.target.value),
                  }))
                }
                className="w-full accent-[#D97706] cursor-pointer"
              />
            </div>

            {/* Reference Door Leaf Prior (`solve_scale`) */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-xs">
                <label htmlFor="door-prior-slider" className="text-[#94A3B8]">
                  Reference Door Width Prior (solve_scale)
                </label>
                <span className="font-mono text-[#F8FAFC] font-semibold tabular-nums">
                  {config.default_door_width_m.toFixed(2)} m
                </span>
              </div>
              <input
                id="door-prior-slider"
                type="range"
                min="0.70"
                max="1.15"
                step="0.02"
                value={config.default_door_width_m}
                onChange={(e) =>
                  onChangeConfig((prev) => ({
                    ...prev,
                    default_door_width_m: Number(e.target.value),
                    scale_override_m_per_px: null,
                  }))
                }
                className="w-full accent-[#38BDF8] cursor-pointer"
              />
            </div>

            {/* Direct Manual Scale Override or Interactive 2D Ruler */}
            <div className="pt-2 border-t border-[#222938] space-y-2">
              <div className="flex items-center justify-between text-xs">
                <label htmlFor="manual-scale-input" className="text-[#94A3B8]">
                  Manual Scale Override (m/px)
                </label>
                <button
                  type="button"
                  onClick={onOpenRuler}
                  className="text-xs text-[#F59E0B] hover:underline flex items-center gap-1"
                >
                  <Ruler className="w-3 h-3" />
                  <span>Use 2D Ruler</span>
                </button>
              </div>
              <div className="flex items-center gap-2">
                <input
                  id="manual-scale-input"
                  type="number"
                  step="0.0005"
                  min="0.002"
                  max="0.1"
                  placeholder={scale.meters_per_pixel.toFixed(4)}
                  value={config.scale_override_m_per_px ?? ''}
                  onChange={(e) => {
                    const val = e.target.value ? Number(e.target.value) : null;
                    onChangeConfig((prev) => ({
                      ...prev,
                      scale_override_m_per_px: val && val > 0 ? val : null,
                    }));
                  }}
                  className="flex-1 px-2.5 py-1.5 bg-[#0B0D11] border border-[#222938] rounded font-mono text-xs text-[#F1F5F9] tabular-nums focus:outline-none focus:border-[#D97706]"
                />
                {config.scale_override_m_per_px !== null && (
                  <button
                    type="button"
                    onClick={() =>
                      onChangeConfig((prev) => ({ ...prev, scale_override_m_per_px: null }))
                    }
                    className="px-2.5 py-1.5 text-xs bg-[#181D29] hover:bg-[#222938] text-[#94A3B8] rounded border border-[#222938]"
                  >
                    Auto
                  </button>
                )}
              </div>
            </div>

            {/* Vectorization & Geometry Checkboxes */}
            <div className="pt-2 border-t border-[#222938] space-y-2.5 text-xs">
              <label className="flex items-center justify-between cursor-pointer">
                <span className="text-[#94A3B8]">Orthogonal Manhattan Wall Snapping</span>
                <input
                  type="checkbox"
                  checked={config.manhattan_snap}
                  onChange={(e) =>
                    onChangeConfig((prev) => ({ ...prev, manhattan_snap: e.target.checked }))
                  }
                  className="accent-[#D97706] w-4 h-4 rounded"
                />
              </label>

              <label className="flex items-center justify-between cursor-pointer">
                <span className="text-[#94A3B8]">Generate 3D Door & Window Cutouts</span>
                <input
                  type="checkbox"
                  checked={config.include_openings_3d}
                  onChange={(e) =>
                    onChangeConfig((prev) => ({
                      ...prev,
                      include_openings_3d: e.target.checked,
                    }))
                  }
                  className="accent-[#D97706] w-4 h-4 rounded"
                />
              </label>

              <label className="flex items-center justify-between cursor-pointer">
                <span className="text-[#94A3B8]">Extrude Room Floor Slabs</span>
                <input
                  type="checkbox"
                  checked={config.include_floor_slabs}
                  onChange={(e) =>
                    onChangeConfig((prev) => ({
                      ...prev,
                      include_floor_slabs: e.target.checked,
                    }))
                  }
                  className="accent-[#D97706] w-4 h-4 rounded"
                />
              </label>
            </div>
          </div>
        )}

        {activeTab === 'measurements' && (
          <div className="space-y-3">
            <div className="flex items-center justify-between text-xs text-[#94A3B8]">
              <span>Click any room row to highlight in 2D & 3D</span>
              <span className="font-mono text-[#F8FAFC] font-semibold tabular-nums">
                Total: {pipelineResult.model3d.total_floor_area_m2.toFixed(1)} m²
              </span>
            </div>

            <div className="border border-[#222938] rounded-md overflow-hidden bg-[#0B0D11]">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-[#222938] text-[#94A3B8] bg-[#12161F]">
                    <th className="py-2 px-2.5 font-medium">Room</th>
                    <th className="py-2 px-2 font-medium text-right">Span (m)</th>
                    <th className="py-2 px-2.5 font-medium text-right">Area</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#222938]">
                  {rooms.map((room) => {
                    const isSelected = selectedRoomId === room.id;
                    return (
                      <tr
                        key={room.id}
                        onClick={() => onSelectRoom(isSelected ? null : room.id)}
                        className={`cursor-pointer transition-colors ${
                          isSelected
                            ? 'bg-[#D97706]/20 text-[#F8FAFC]'
                            : 'hover:bg-[#181D29] text-[#F1F5F9]'
                        }`}
                      >
                        <td className="py-2 px-2.5">
                          <div className="font-medium truncate max-w-[140px]">{room.name}</div>
                          <div className="text-[11px] text-[#64748B] font-mono">
                            {room.id} · {room.category} · {Math.round(room.confidence * 100)}%
                          </div>
                        </td>
                        <td className="py-2 px-2 text-right font-mono text-[#94A3B8] tabular-nums whitespace-nowrap">
                          {room.width_m.toFixed(2)} × {room.length_m.toFixed(2)}
                        </td>
                        <td className="py-2 px-2.5 text-right font-mono font-semibold text-[#38BDF8] tabular-nums whitespace-nowrap">
                          {room.area_m2.toFixed(2)} m²
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {activeTab === 'warnings' && (
          <div className="space-y-2.5">
            <div className="text-xs text-[#94A3B8]">
              Pipeline verification log across <span className="font-mono text-[#F1F5F9]">predict → vectorize → solve_scale → build_model</span>:
            </div>

            {warnings.length === 0 ? (
              <div className="p-3 rounded bg-[#0B0D11] border border-[#222938] flex items-center gap-2 text-xs text-[#10B981]">
                <CheckCircle2 className="w-4 h-4 shrink-0" />
                <span>Zero geometry or scale warnings detected.</span>
              </div>
            ) : (
              warnings.map((w, idx) => {
                const isWarn = w.severity === 'warning' || w.severity === 'critical';
                return (
                  <div
                    key={`${w.code}-${idx}`}
                    className={`p-3 rounded bg-[#0B0D11] border text-xs space-y-1 ${
                      isWarn ? 'border-[#F59E0B]/40' : 'border-[#222938]'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span
                        className={`font-mono font-semibold flex items-center gap-1.5 ${
                          isWarn ? 'text-[#F59E0B]' : 'text-[#38BDF8]'
                        }`}
                      >
                        {isWarn ? (
                          <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                        ) : (
                          <Info className="w-3.5 h-3.5 shrink-0" />
                        )}
                        <span>{w.code}</span>
                      </span>
                      <span className="text-[11px] font-mono text-[#64748B]">
                        stage: {w.stage}
                      </span>
                    </div>
                    <p className="text-[#94A3B8] leading-relaxed">{w.message}</p>
                  </div>
                );
              })
            )}
          </div>
        )}
      </div>
    </aside>
  );
};
