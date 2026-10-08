/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { BLUEPRINT_PRESETS, renderPresetBlueprintDataUrl } from './pipeline/presets';
import {
  assemblePipelineResult,
  RawPredictionPayload,
  stagePredict,
} from './pipeline/engine';
import {
  BlueprintPreset,
  PipelineConfig,
  PipelineStageId,
  Point2D,
} from './types/floorforge';
import { BlueprintCanvas2D } from './components/BlueprintCanvas2D';
import { Viewport3D, Viewport3DHandle } from './components/Viewport3D';
import { InspectorSidebar } from './components/InspectorSidebar';
import { FastApiModal } from './components/FastApiModal';
import { Download, Sparkles } from 'lucide-react';

export default function App() {
  const viewport3dRef = useRef<Viewport3DHandle | null>(null);
  const headerFileInputRef = useRef<HTMLInputElement | null>(null);

  // Active preset or custom uploaded floor plan state
  const [selectedPresetId, setSelectedPresetId] = useState<string>(BLUEPRINT_PRESETS[0].id);
  const [customImage, setCustomImage] = useState<{
    name: string;
    dataUrl: string;
    width: number;
    height: number;
  } | null>(null);

  // Generated 2D raster floor-plan data URL for preset or custom image
  const [blueprintDataUrl, setBlueprintDataUrl] = useState<string>('');

  // Stage 1 raw prediction state (`predict`)
  const [rawPrediction, setRawPrediction] = useState<RawPredictionPayload>(() => {
    const preset = BLUEPRINT_PRESETS[0];
    return {
      blueprintName: preset.name,
      imageWidth: preset.width_px,
      imageHeight: preset.height_px,
      executionMode: 'deterministic_mock',
      executionBadge: 'Mock Reference Segmentation (FastAPI Compatible)',
      walls: structuredClone(preset.walls),
      openings: structuredClone(preset.openings),
      rooms: structuredClone(preset.rooms),
      suggestedScale: {
        method: 'ocr_dimension',
        meters_per_pixel: preset.default_m_per_px,
        confidence: 0.94,
        reference_label: `OCR callout & door prior (${preset.ocr_dimension_text})`,
        detected_dimension_text: preset.ocr_dimension_text,
      },
      warnings: structuredClone(preset.warnings),
      predictElapsedMs: 52,
    };
  });

  // Real-time adjustable parameters (`vectorize -> solve_scale -> build_model`)
  const [config, setConfig] = useState<PipelineConfig>({
    wall_height_m: 2.8,
    wall_thickness_m: 0.18,
    default_door_width_m: 0.9,
    scale_override_m_per_px: null,
    simplify_tolerance_px: 2.5,
    manhattan_snap: true,
    include_floor_slabs: true,
    include_openings_3d: true,
    material_theme: 'clay',
  });

  // Interactive 2-Point Scale Calibration Ruler state
  const [rulerActive, setRulerActive] = useState<boolean>(false);
  const [rulerPoints, setRulerPoints] = useState<[Point2D, Point2D]>([
    { x: 100, y: 80 },
    { x: 520, y: 80 },
  ]);
  const [rulerDistanceM, setRulerDistanceM] = useState<number>(5.88);
  const [rulerCalibrationMPerPx, setRulerCalibrationMPerPx] = useState<number | null>(null);

  // Selection & UI state
  const [selectedRoomId, setSelectedRoomId] = useState<string | null>(null);
  const [activeStageFilter, setActiveStageFilter] = useState<PipelineStageId | null>(null);
  const [isFastApiModalOpen, setIsFastApiModalOpen] = useState<boolean>(false);
  const [isRunningPipeline, setIsRunningPipeline] = useState<boolean>(false);
  const [workspaceLayout, setWorkspaceLayout] = useState<'split' | '2d' | '3d'>('split');

  // Render preset 2D architectural blueprint whenever preset changes
  useEffect(() => {
    if (customImage) return;
    const preset = BLUEPRINT_PRESETS.find((p) => p.id === selectedPresetId) || BLUEPRINT_PRESETS[0];
    const url = renderPresetBlueprintDataUrl(preset);
    setBlueprintDataUrl(url);
  }, [selectedPresetId, customImage]);

  // Execute Stage 1 (`predict`) when switching presets or triggering AI Vision
  const runFullPipeline = async (options: {
    preset?: BlueprintPreset;
    customImg?: { name: string; dataUrl: string; width: number; height: number } | null;
    useAiVision: boolean;
  }) => {
    setIsRunningPipeline(true);
    try {
      const targetCustom = options.customImg !== undefined ? options.customImg : customImage;
      const targetPreset =
        options.preset ||
        (!targetCustom
          ? BLUEPRINT_PRESETS.find((p) => p.id === selectedPresetId) || BLUEPRINT_PRESETS[0]
          : undefined);

      const imgUrl = targetCustom
        ? targetCustom.dataUrl
        : targetPreset
        ? renderPresetBlueprintDataUrl(targetPreset)
        : blueprintDataUrl;

      const pred = await stagePredict({
        preset: targetPreset,
        uploadedImageDataUrl: imgUrl,
        uploadedFileName: targetCustom?.name || targetPreset?.name,
        imageWidth: targetCustom?.width || targetPreset?.width_px || 1000,
        imageHeight: targetCustom?.height || targetPreset?.height_px || 750,
        useAiVision: options.useAiVision,
      });

      setRawPrediction(pred);
      setSelectedRoomId(null);
    } finally {
      setIsRunningPipeline(false);
    }
  };

  const handleSelectPreset = (preset: BlueprintPreset) => {
    setCustomImage(null);
    setSelectedPresetId(preset.id);
    setRulerCalibrationMPerPx(null);
    const url = renderPresetBlueprintDataUrl(preset);
    setBlueprintDataUrl(url);
    runFullPipeline({ preset, customImg: null, useAiVision: false });
  };

  const handleUploadFloorPlanFile = (file: File) => {
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = String(reader.result || '');
      const img = new Image();
      img.onload = () => {
        const w = img.naturalWidth || 1000;
        const h = img.naturalHeight || 750;
        const customObj = {
          name: file.name.replace(/\.[^.]+$/, ''),
          dataUrl,
          width: w,
          height: h,
        };
        setCustomImage(customObj);
        setBlueprintDataUrl(dataUrl);
        setRulerCalibrationMPerPx(null);
        setRulerPoints([
          { x: Math.round(w * 0.15), y: Math.round(h * 0.15) },
          { x: Math.round(w * 0.65), y: Math.round(h * 0.15) },
        ]);
        // Automatically attempt AI Vision segmentation first, with instant fallback to local CV/mock
        runFullPipeline({ customImg: customObj, useAiVision: true });
      };
      img.src = dataUrl;
    };
    reader.readAsDataURL(file);
  };

  // Real-time synchronous assembly of stages 2, 3, 4 (`vectorize -> solve_scale -> build_model`)
  const pipelineResult = useMemo(() => {
    return assemblePipelineResult(rawPrediction, config, rulerCalibrationMPerPx);
  }, [rawPrediction, config, rulerCalibrationMPerPx]);

  const handleApplyRulerCalibration = () => {
    const pxDist = Math.hypot(
      rulerPoints[1].x - rulerPoints[0].x,
      rulerPoints[1].y - rulerPoints[0].y
    );
    if (pxDist > 5 && rulerDistanceM > 0.1) {
      setRulerCalibrationMPerPx(rulerDistanceM / pxDist);
    }
  };

  return (
    <div className="min-h-screen lg:h-screen w-screen flex flex-col bg-[#0B0D11] text-[#F1F5F9] overflow-x-hidden lg:overflow-hidden">
      {/* Top Bar Contract: Zone 1 (Single Brand Wordmark) — Zone 2 (4-5 Clean Nav Links) — Zone 3 (Primary Actions) */}
      <header className="h-14 shrink-0 flex items-center justify-between px-6 border-b border-[#222938] bg-[#0B0D11]">
        {/* Zone 1: Single text element wordmark */}
        <a
          href="#top"
          onClick={(e) => {
            e.preventDefault();
            handleSelectPreset(BLUEPRINT_PRESETS[0]);
          }}
          className="text-lg font-bold tracking-tight text-[#F8FAFC] font-display whitespace-nowrap"
        >
          FloorForge
        </a>

        {/* Zone 2: 5 clean text navigation links */}
        <nav className="hidden md:flex items-center gap-6 text-xs font-medium text-[#94A3B8]">
          {BLUEPRINT_PRESETS.map((preset) => {
            const isActive = !customImage && selectedPresetId === preset.id;
            return (
              <button
                key={preset.id}
                type="button"
                onClick={() => handleSelectPreset(preset)}
                className={`transition-colors whitespace-nowrap hover:text-[#F8FAFC] ${
                  isActive
                    ? 'text-[#F8FAFC] underline underline-offset-8 decoration-[#D97706] decoration-2'
                    : ''
                }`}
              >
                {preset.name}
              </button>
            );
          })}
          <button
            type="button"
            onClick={() => headerFileInputRef.current?.click()}
            className={`transition-colors whitespace-nowrap hover:text-[#F8FAFC] ${
              customImage
                ? 'text-[#F8FAFC] underline underline-offset-8 decoration-[#D97706] decoration-2'
                : ''
            }`}
          >
            {customImage ? `Uploaded: ${customImage.name}` : 'Upload Floor Plan'}
          </button>
          <button
            type="button"
            onClick={() => setIsFastApiModalOpen(true)}
            className="hover:text-[#F8FAFC] transition-colors whitespace-nowrap"
          >
            FastAPI Backend
          </button>
        </nav>

        {/* Zone 3: 2 Primary Actions */}
        <div className="flex items-center gap-2.5">
          <input
            ref={headerFileInputRef}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) handleUploadFloorPlanFile(file);
              e.target.value = '';
            }}
          />
          <button
            type="button"
            onClick={() => runFullPipeline({ useAiVision: true })}
            disabled={isRunningPipeline}
            className="px-3.5 py-1.5 text-xs font-medium text-[#F8FAFC] bg-[#181D29] hover:bg-[#222938] border border-[#222938] rounded-md transition-colors whitespace-nowrap flex items-center gap-1.5 disabled:opacity-50"
          >
            <Sparkles className="w-3.5 h-3.5 text-[#F59E0B]" />
            <span>{isRunningPipeline ? 'Segmenting...' : 'AI Segment'}</span>
          </button>
          <button
            type="button"
            onClick={() => viewport3dRef.current?.exportGLB()}
            className="px-4 py-1.5 text-xs font-semibold text-[#F8FAFC] bg-[#D97706] hover:bg-[#F59E0B] rounded-md transition-colors whitespace-nowrap flex items-center gap-1.5"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Export .GLB</span>
          </button>
        </div>
      </header>

      {/* Secondary Architectural Context Strip: Project HNX26EPS06 & Viewport Layout Switcher */}
      <div className="flex flex-wrap items-center justify-between gap-3 px-6 py-2 bg-[#12161F] border-b border-[#222938] text-xs">
        <div className="flex flex-wrap items-center gap-2 text-[#94A3B8]">
          <span className="font-mono text-[#F8FAFC] font-semibold">HNX26EPS06</span>
          <span aria-hidden="true">·</span>
          <span>Pipeline: predict → vectorize → solve_scale → build_model</span>
          <span aria-hidden="true">·</span>
          <span className="text-[#F1F5F9] font-medium">{pipelineResult.blueprint_name}</span>
          {pipelineResult.scale.detected_dimension_text && (
            <>
              <span aria-hidden="true">·</span>
              <span className="font-mono text-[#38BDF8]">
                {pipelineResult.scale.detected_dimension_text}
              </span>
            </>
          )}
        </div>

        {/* Viewport Split Switcher */}
        <div className="flex items-center gap-1 bg-[#0B0D11] p-0.5 rounded border border-[#222938]">
          <button
            type="button"
            onClick={() => setWorkspaceLayout('split')}
            className={`px-2.5 py-1 rounded text-xs font-medium transition-colors whitespace-nowrap ${
              workspaceLayout === 'split'
                ? 'bg-[#181D29] text-[#F8FAFC]'
                : 'text-[#64748B] hover:text-[#94A3B8]'
            }`}
          >
            Split 2D / 3D
          </button>
          <button
            type="button"
            onClick={() => setWorkspaceLayout('2d')}
            className={`px-2.5 py-1 rounded text-xs font-medium transition-colors whitespace-nowrap ${
              workspaceLayout === '2d'
                ? 'bg-[#181D29] text-[#F8FAFC]'
                : 'text-[#64748B] hover:text-[#94A3B8]'
            }`}
          >
            2D Blueprint Only
          </button>
          <button
            type="button"
            onClick={() => setWorkspaceLayout('3d')}
            className={`px-2.5 py-1 rounded text-xs font-medium transition-colors whitespace-nowrap ${
              workspaceLayout === '3d'
                ? 'bg-[#181D29] text-[#F8FAFC]'
                : 'text-[#64748B] hover:text-[#94A3B8]'
            }`}
          >
            3D Model Only
          </button>
        </div>
      </div>

      {/* Main Architectural Workbench: Dual 2D/3D Canvas + Right Inspector */}
      <main className="flex-1 flex flex-col lg:flex-row overflow-hidden">
        {/* Left & Center Dual Spatial Canvases */}
        <div className="flex-1 grid grid-cols-1 lg:grid-cols-12 min-h-[580px] lg:min-h-0 overflow-hidden">
          {/* 2D Floor-Plan & Segmentation Overlay Pane */}
          {workspaceLayout !== '3d' && (
            <div
              className={`${
                workspaceLayout === 'split' ? 'lg:col-span-6 border-r border-[#222938]' : 'lg:col-span-12'
              } h-[440px] lg:h-full overflow-hidden`}
            >
              <BlueprintCanvas2D
                imageDataUrl={blueprintDataUrl}
                pipelineResult={pipelineResult}
                selectedRoomId={selectedRoomId}
                onSelectRoom={setSelectedRoomId}
                rulerActive={rulerActive}
                onToggleRuler={() => setRulerActive((v) => !v)}
                rulerPoints={rulerPoints}
                onChangeRulerPoints={setRulerPoints}
                rulerDistanceM={rulerDistanceM}
                onChangeRulerDistanceM={setRulerDistanceM}
                onApplyRulerCalibration={handleApplyRulerCalibration}
                onClearRulerCalibration={() => setRulerCalibrationMPerPx(null)}
                isRulerCalibrated={rulerCalibrationMPerPx !== null}
                onUploadFile={handleUploadFloorPlanFile}
                onRunAiVision={() => runFullPipeline({ useAiVision: true })}
                isRunningPipeline={isRunningPipeline}
              />
            </div>
          )}

          {/* 3D Interactive Three.js Layout Pane */}
          {workspaceLayout !== '2d' && (
            <div
              className={`${
                workspaceLayout === 'split' ? 'lg:col-span-6' : 'lg:col-span-12'
              } h-[460px] lg:h-full overflow-hidden`}
            >
              <Viewport3D
                ref={viewport3dRef}
                pipelineResult={pipelineResult}
                config={config}
                selectedRoomId={selectedRoomId}
                onSelectRoom={setSelectedRoomId}
                onChangeMaterialTheme={(theme) =>
                  setConfig((prev) => ({ ...prev, material_theme: theme }))
                }
              />
            </div>
          )}
        </div>

        {/* Right Architectural Parameter & Telemetry Inspector Sidebar */}
        <InspectorSidebar
          pipelineResult={pipelineResult}
          config={config}
          onChangeConfig={setConfig}
          selectedRoomId={selectedRoomId}
          onSelectRoom={setSelectedRoomId}
          activeStageFilter={activeStageFilter}
          onSelectStageFilter={setActiveStageFilter}
          onOpenRuler={() => {
            if (workspaceLayout === '3d') setWorkspaceLayout('split');
            setRulerActive(true);
          }}
          onOpenFastApiModal={() => setIsFastApiModalOpen(true)}
          onReRunPipeline={(useAiVision) => runFullPipeline({ useAiVision })}
          isRunningPipeline={isRunningPipeline}
        />
      </main>

      {/* FastAPI Source & Live Pipeline JSON Modal */}
      <FastApiModal
        isOpen={isFastApiModalOpen}
        onClose={() => setIsFastApiModalOpen(false)}
        pipelineResult={pipelineResult}
      />
    </div>
  );
}
