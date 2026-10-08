/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { BLUEPRINT_PRESETS, renderPresetBlueprintDataUrl } from './pipeline/presets';
import {
  assemblePipelineResult,
  extractInstantCustomGeometry,
  RawPredictionPayload,
  stagePredict,
} from './pipeline/engine';
import {
  BlueprintPreset,
  PipelineConfig,
  Point2D,
} from './types/floorforge';
import { BlueprintCanvas2D } from './components/BlueprintCanvas2D';
import { Viewport3D, Viewport3DHandle } from './components/Viewport3D';
import { InspectorSidebar } from './components/InspectorSidebar';
import { FastApiModal } from './components/FastApiModal';
import { Download, Upload } from 'lucide-react';

export default function App() {
  const viewport3dRef = useRef<Viewport3DHandle | null>(null);
  const headerFileInputRef = useRef<HTMLInputElement | null>(null);

  const [selectedPresetId, setSelectedPresetId] = useState<string>(BLUEPRINT_PRESETS[0].id);
  const [customImage, setCustomImage] = useState<{
    name: string;
    dataUrl: string;
    width: number;
    height: number;
  } | null>(null);

  const [blueprintDataUrl, setBlueprintDataUrl] = useState<string>('');

  const [rawPrediction, setRawPrediction] = useState<RawPredictionPayload>(() => {
    const preset = BLUEPRINT_PRESETS[0];
    return {
      blueprintName: preset.name,
      imageWidth: preset.width_px,
      imageHeight: preset.height_px,
      executionMode: 'deterministic_mock',
      executionBadge: 'Instant Architectural & 3D Object Pipeline',
      walls: structuredClone(preset.walls),
      openings: structuredClone(preset.openings),
      furniture: structuredClone(preset.furniture),
      rooms: structuredClone(preset.rooms),
      suggestedScale: {
        method: 'ocr_dimension',
        meters_per_pixel: preset.default_m_per_px,
        confidence: 0.95,
        reference_label: `Calibrated (${preset.ocr_dimension_text})`,
        detected_dimension_text: preset.ocr_dimension_text,
      },
      warnings: structuredClone(preset.warnings),
      predictElapsedMs: 28,
    };
  });

  const [config, setConfig] = useState<PipelineConfig>({
    wall_height_m: 2.8,
    wall_thickness_m: 0.18,
    default_door_width_m: 0.9,
    scale_override_m_per_px: null,
    simplify_tolerance_px: 2.5,
    manhattan_snap: true,
    include_floor_slabs: true,
    include_openings_3d: true,
    include_furniture_3d: true,
    show_generated_completion: true,
    material_theme: 'studio',
    ablation_mode: 'full_floorforge',
    input_mode: 'mode_a_blueprint',
  });

  const [rulerActive, setRulerActive] = useState<boolean>(false);
  const [rulerPoints, setRulerPoints] = useState<[Point2D, Point2D]>([
    { x: 100, y: 80 },
    { x: 520, y: 80 },
  ]);
  const [rulerDistanceM, setRulerDistanceM] = useState<number>(5.88);
  const [rulerCalibrationMPerPx, setRulerCalibrationMPerPx] = useState<number | null>(null);

  const [selectedRoomId, setSelectedRoomId] = useState<string | null>(null);
  const [isFastApiModalOpen, setIsFastApiModalOpen] = useState<boolean>(false);
  const [isRunningPipeline, setIsRunningPipeline] = useState<boolean>(false);

  useEffect(() => {
    if (customImage) return;
    const preset = BLUEPRINT_PRESETS.find((p) => p.id === selectedPresetId) || BLUEPRINT_PRESETS[0];
    const url = renderPresetBlueprintDataUrl(preset);
    setBlueprintDataUrl(url);
  }, [selectedPresetId, customImage]);

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
      img.onload = async () => {
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
          { x: Math.round(w * 0.12), y: Math.round(h * 0.12) },
          { x: Math.round(w * 0.62), y: Math.round(h * 0.12) },
        ]);

        // Instant (<50ms) multi-room + interior partitions + 3D objects reconstruction!
        const instantPred = await extractInstantCustomGeometry(
          dataUrl,
          customObj.name,
          w,
          h
        );
        setRawPrediction(instantPred);
        setSelectedRoomId(null);
      };
      img.src = dataUrl;
    };
    reader.readAsDataURL(file);
  };

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
      {/* Clean 3-Zone Top Bar */}
      <header className="h-14 shrink-0 flex items-center justify-between px-6 border-b border-[#222938] bg-[#0B0D11]">
        {/* Zone 1: Single Brand Wordmark */}
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

        {/* Zone 2: Clean Navigation Links */}
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
            onClick={() => setIsFastApiModalOpen(true)}
            className="hover:text-[#F8FAFC] transition-colors whitespace-nowrap"
          >
            FastAPI Code
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
            onClick={() => headerFileInputRef.current?.click()}
            className="px-3.5 py-1.5 text-xs font-medium text-[#F8FAFC] bg-[#181D29] hover:bg-[#222938] border border-[#222938] rounded-md transition-colors whitespace-nowrap flex items-center gap-1.5"
          >
            <Upload className="w-3.5 h-3.5 text-[#38BDF8]" />
            <span>Upload Floor Plan</span>
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

      {/* Main Split Workbench */}
      <main className="flex-1 flex flex-col lg:flex-row overflow-hidden">
        <div className="flex-1 grid grid-cols-1 lg:grid-cols-12 min-h-[580px] lg:min-h-0 overflow-hidden">
          <div className="lg:col-span-6 border-r border-[#222938] h-[440px] lg:h-full overflow-hidden">
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

          <div className="lg:col-span-6 h-[460px] lg:h-full overflow-hidden">
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
        </div>

        <InspectorSidebar
          pipelineResult={pipelineResult}
          config={config}
          onChangeConfig={setConfig}
          selectedRoomId={selectedRoomId}
          onSelectRoom={setSelectedRoomId}
          onOpenRuler={() => setRulerActive(true)}
          onOpenFastApiModal={() => setIsFastApiModalOpen(true)}
        />
      </main>

      <FastApiModal
        isOpen={isFastApiModalOpen}
        onClose={() => setIsFastApiModalOpen(false)}
        pipelineResult={pipelineResult}
      />
    </div>
  );
}
