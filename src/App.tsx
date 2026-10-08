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
  snapOpeningToClosestWall,
  stagePredict,
} from './pipeline/engine';
import {
  BlueprintPreset,
  EditorToolMode,
  OverlayColorMode,
  PipelineConfig,
  Point2D,
  RoomCategory,
  SelectedElementRef,
  ValidationIssue,
  WorkflowStepId,
} from './types/floorforge';
import { BlueprintCanvas2D } from './components/BlueprintCanvas2D';
import { Viewport3D, Viewport3DHandle } from './components/Viewport3D';
import { InspectorSidebar, InspectorTabId } from './components/InspectorSidebar';
import { FastApiModal } from './components/FastApiModal';
import { ChevronRight, Download, Upload } from 'lucide-react';

const WORKFLOW_STEPS: { id: WorkflowStepId; label: string }[] = [
  { id: 'upload', label: '1. Upload Floor Plan' },
  { id: 'detect', label: '2. Detect Geometry' },
  { id: 'review_confidence', label: '3. Review Confidence' },
  { id: 'correct', label: '4. Correct Elements' },
  { id: 'validate', label: '5. Validate' },
  { id: 'explore_3d', label: '6. Explore 3D Model' },
  { id: 'report', label: '7. View Report' },
];

function createInitialPrediction(preset: BlueprintPreset): RawPredictionPayload {
  const gtArea = preset.rooms.reduce((acc, r) => acc + r.area_px2, 0);
  return {
    blueprintName: preset.name,
    imageWidth: preset.width_px,
    imageHeight: preset.height_px,
    executionMode: 'deterministic_mock',
    executionBadge: 'Architectural Blueprint Preset',
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
    referenceWidthM: preset.reference_width_m,
    hasGroundTruth: preset.has_ground_truth,
    groundTruthAreaPx2: gtArea,
    warnings: structuredClone(preset.warnings),
    predictElapsedMs: 24,
  };
}

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

  // History stack of RawPredictionPayloads for Undo / Redo + Original vs Corrected comparison
  const [history, setHistory] = useState<RawPredictionPayload[]>(() => [
    createInitialPrediction(BLUEPRINT_PRESETS[0]),
  ]);
  const [historyIndex, setHistoryIndex] = useState<number>(0);
  const [isComparingOriginal, setIsComparingOriginal] = useState<boolean>(false);

  const currentPrediction = history[historyIndex] || history[0];
  const originalPrediction = history[0];

  const [config, setConfig] = useState<PipelineConfig>({
    wall_height_m: 2.8,
    wall_thickness_m: 0.18,
    default_door_width_m: 0.9,
    scale_override_m_per_px: null,
    simplify_tolerance_px: 2.5,
    manhattan_snap: false, // False by default so intentional validation warnings are visible until fixed!
    include_floor_slabs: true,
    include_openings_3d: true,
    include_furniture_3d: true,
    show_generated_completion: false,
    material_theme: 'studio',
    overlay_2d_mode: 'confidence',
    ablation_mode: 'full_floorforge',
    input_mode: 'mode_a_blueprint',
  });

  const [activeWorkflowStep, setActiveWorkflowStep] = useState<WorkflowStepId>('review_confidence');
  const [activeInspectorTab, setActiveInspectorTab] = useState<InspectorTabId>('correct');
  const [editorTool, setEditorTool] = useState<EditorToolMode>('select');
  const [selectedElement, setSelectedElement] = useState<SelectedElementRef | null>(null);

  const [rulerActive, setRulerActive] = useState<boolean>(false);
  const [rulerPoints, setRulerPoints] = useState<[Point2D, Point2D]>([
    { x: 100, y: 80 },
    { x: 520, y: 80 },
  ]);
  const [rulerDistanceM, setRulerDistanceM] = useState<number>(5.88);
  const [rulerCalibrationMPerPx, setRulerCalibrationMPerPx] = useState<number | null>(null);

  const [isFastApiModalOpen, setIsFastApiModalOpen] = useState<boolean>(false);
  const [isRunningPipeline, setIsRunningPipeline] = useState<boolean>(false);

  useEffect(() => {
    if (customImage) return;
    const preset = BLUEPRINT_PRESETS.find((p) => p.id === selectedPresetId) || BLUEPRINT_PRESETS[0];
    const url = renderPresetBlueprintDataUrl(preset);
    setBlueprintDataUrl(url);
  }, [selectedPresetId, customImage]);

  const pushCorrectionState = (updater: (prev: RawPredictionPayload) => RawPredictionPayload) => {
    setIsComparingOriginal(false);
    setHistory((prevHistory) => {
      const base = structuredClone(prevHistory[historyIndex] || prevHistory[0]);
      const next = updater(base);
      const sliced = prevHistory.slice(0, historyIndex + 1);
      return [...sliced, next];
    });
    setHistoryIndex((idx) => idx + 1);
  };

  const resetHistoryWithPrediction = (pred: RawPredictionPayload) => {
    setHistory([structuredClone(pred)]);
    setHistoryIndex(0);
    setIsComparingOriginal(false);
    setSelectedElement(null);
  };

  const handleUndo = () => {
    if (historyIndex > 0) {
      setHistoryIndex((idx) => idx - 1);
      setIsComparingOriginal(false);
    }
  };

  const handleRedo = () => {
    if (historyIndex < history.length - 1) {
      setHistoryIndex((idx) => idx + 1);
      setIsComparingOriginal(false);
    }
  };

  const runFullPipeline = async (options: {
    preset?: BlueprintPreset;
    customImg?: { name: string; dataUrl: string; width: number; height: number } | null;
    useAiVision: boolean;
  }) => {
    setIsRunningPipeline(true);
    setActiveWorkflowStep('detect');
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

      resetHistoryWithPrediction(pred);
      setActiveWorkflowStep('review_confidence');
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
    setActiveWorkflowStep('upload');
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

        // 1. Instant (<30ms) CV contour pass
        const instantPred = await extractInstantCustomGeometry(
          dataUrl,
          customObj.name,
          w,
          h
        );
        resetHistoryWithPrediction(instantPred);

        // 2. Automatically run Gemini Vision grounding in the background
        runFullPipeline({ customImg: customObj, useAiVision: true });
      };
      img.src = dataUrl;
    };
    reader.readAsDataURL(file);
  };

  // Interactive Correction Handlers (All update 2D + 3D immediately)
  const handleMoveWallEndpoint = (
    wallId: string,
    endpoint: 'start' | 'end',
    newPt: Point2D
  ) => {
    pushCorrectionState((draft) => {
      const wall = draft.walls.find((w) => w.id === wallId);
      if (wall) {
        wall[endpoint] = { x: Math.round(newPt.x), y: Math.round(newPt.y) };
        wall.provenance = 'user_corrected';
        wall.confidence = 0.99;
      }
      return draft;
    });
  };

  const handleAddMissingWall = (start: Point2D, end: Point2D) => {
    const newId = `W-USER-${historyIndex + 1}`;
    pushCorrectionState((draft) => {
      // Snap near-horizontal or near-vertical new walls
      const dx = Math.abs(end.x - start.x);
      const dy = Math.abs(end.y - start.y);
      const snappedEnd =
        dx > dy * 2.5
          ? { x: end.x, y: start.y }
          : dy > dx * 2.5
          ? { x: start.x, y: end.y }
          : end;

      draft.walls.push({
        id: newId,
        start: { x: Math.round(start.x), y: Math.round(start.y) },
        end: { x: Math.round(snappedEnd.x), y: Math.round(snappedEnd.y) },
        thickness_px: 10,
        is_exterior: false,
        confidence: 0.99,
        provenance: 'user_corrected',
      });
      return draft;
    });
    setEditorTool('select');
    setSelectedElement({ kind: 'wall', id: newId });
  };

  const handleAddMissingOpeningAtPoint = (kind: 'door' | 'window', pt: Point2D) => {
    const newId = `${kind === 'door' ? 'D' : 'WIN'}-USER-${historyIndex + 1}`;
    pushCorrectionState((draft) => {
      const snapped = snapOpeningToClosestWall(pt.x, pt.y, draft.walls);
      draft.openings.push({
        id: newId,
        kind,
        wall_id: snapped.wall_id,
        position_t: snapped.position_t,
        width_px: kind === 'door' ? 64 : 88,
        sill_height_m: kind === 'door' ? 0 : 0.9,
        head_height_m: 2.1,
        confidence: 0.99,
        provenance: 'user_corrected',
      });
      return draft;
    });
    setEditorTool('select');
    setSelectedElement({ kind: 'opening', id: newId });
  };

  const handleConfirmElement = (el: SelectedElementRef) => {
    pushCorrectionState((draft) => {
      if (el.kind === 'wall') {
        const w = draft.walls.find((x) => x.id === el.id);
        if (w) {
          w.provenance = 'user_corrected';
          w.confidence = 0.99;
        }
      } else if (el.kind === 'opening') {
        const o = draft.openings.find((x) => x.id === el.id);
        if (o) {
          o.provenance = 'user_corrected';
          o.confidence = 0.99;
        }
      } else if (el.kind === 'room') {
        const r = draft.rooms.find((x) => x.id === el.id);
        if (r) {
          r.provenance = 'user_corrected';
          r.confidence = 0.99;
        }
      } else if (el.kind === 'furniture') {
        const f = draft.furniture.find((x) => x.id === el.id);
        if (f) {
          f.provenance = 'user_corrected';
          f.confidence = 0.99;
        }
      }
      return draft;
    });
  };

  const handleRejectElement = (el: SelectedElementRef) => {
    pushCorrectionState((draft) => {
      if (el.kind === 'wall') {
        draft.walls = draft.walls.filter((w) => w.id !== el.id);
        draft.openings = draft.openings.filter((o) => o.wall_id !== el.id);
      } else if (el.kind === 'opening') {
        draft.openings = draft.openings.filter((o) => o.id !== el.id);
      } else if (el.kind === 'room') {
        draft.rooms = draft.rooms.filter((r) => r.id !== el.id);
      } else if (el.kind === 'furniture') {
        draft.furniture = draft.furniture.filter((f) => f.id !== el.id);
      }
      return draft;
    });
    setSelectedElement(null);
  };

  const handleUpdateWallGeometry = (
    wallId: string,
    updates: {
      start?: { x: number; y: number };
      end?: { x: number; y: number };
      thickness_px?: number;
      orthogonalize?: boolean;
      targetLengthM?: number;
    }
  ) => {
    const mPerPx =
      config.scale_override_m_per_px ||
      rulerCalibrationMPerPx ||
      currentPrediction.suggestedScale?.meters_per_pixel ||
      0.014;

    pushCorrectionState((draft) => {
      const w = draft.walls.find((x) => x.id === wallId);
      if (!w) return draft;
      if (updates.start) w.start = updates.start;
      if (updates.end) w.end = updates.end;
      if (updates.thickness_px !== undefined) w.thickness_px = updates.thickness_px;
      if (updates.orthogonalize) {
        const dx = Math.abs(w.end.x - w.start.x);
        const dy = Math.abs(w.end.y - w.start.y);
        if (dx >= dy) {
          w.end.y = w.start.y;
        } else {
          w.end.x = w.start.x;
        }
      }
      if (updates.targetLengthM && updates.targetLengthM > 0.2) {
        const dx = w.end.x - w.start.x;
        const dy = w.end.y - w.start.y;
        const curLen = Math.hypot(dx, dy) || 1;
        const newLenPx = updates.targetLengthM / mPerPx;
        w.end = {
          x: Math.round(w.start.x + (dx / curLen) * newLenPx),
          y: Math.round(w.start.y + (dy / curLen) * newLenPx),
        };
      }
      w.provenance = 'user_corrected';
      w.confidence = 0.99;
      return draft;
    });
  };

  const handleUpdateOpeningGeometry = (
    openingId: string,
    updates: {
      position_t?: number;
      width_px?: number;
      kind?: 'door' | 'window';
    }
  ) => {
    pushCorrectionState((draft) => {
      const o = draft.openings.find((x) => x.id === openingId);
      if (!o) return draft;
      if (updates.position_t !== undefined) o.position_t = updates.position_t;
      if (updates.width_px !== undefined) o.width_px = updates.width_px;
      if (updates.kind !== undefined) o.kind = updates.kind;
      o.provenance = 'user_corrected';
      o.confidence = 0.99;
      return draft;
    });
  };

  const handleUpdateRoomMeta = (
    roomId: string,
    updates: { name?: string; category?: RoomCategory }
  ) => {
    pushCorrectionState((draft) => {
      const r = draft.rooms.find((x) => x.id === roomId);
      if (!r) return draft;
      if (updates.name !== undefined) r.name = updates.name;
      if (updates.category !== undefined) r.category = updates.category;
      r.provenance = 'user_corrected';
      r.confidence = 0.99;
      return draft;
    });
  };

  const applySingleFixToDraft = (draft: RawPredictionPayload, issue: ValidationIssue) => {
    const act = issue.fix_action;
    if (!act) return;
    if (act.type === 'snap_wall_endpoint') {
      const w = draft.walls.find((x) => x.id === act.wall_id);
      if (w) {
        w[act.endpoint] = { x: act.target.x, y: act.target.y };
        w.provenance = 'user_corrected';
        w.confidence = 0.99;
      }
    } else if (act.type === 'orthogonalize_wall') {
      const w = draft.walls.find((x) => x.id === act.wall_id);
      if (w) {
        const dx = Math.abs(w.end.x - w.start.x);
        const dy = Math.abs(w.end.y - w.start.y);
        if (dx >= dy) w.end.y = w.start.y;
        else w.end.x = w.start.x;
        w.provenance = 'user_corrected';
        w.confidence = 0.99;
      }
    } else if (act.type === 'remove_duplicate_wall') {
      draft.walls = draft.walls.filter((w) => w.id !== act.wall_id);
    } else if (act.type === 'clamp_opening') {
      const o = draft.openings.find((x) => x.id === act.opening_id);
      if (o) {
        o.wall_id = act.wall_id;
        o.position_t = act.position_t;
        o.width_px = act.width_px;
        o.provenance = 'user_corrected';
        o.confidence = 0.99;
      }
    } else if (act.type === 'close_room_boundary') {
      const r = draft.rooms.find((x) => x.id === act.room_id);
      if (r) {
        r.provenance = 'user_corrected';
        r.confidence = 0.99;
      }
    }
  };

  const handleApplyValidationFix = (issue: ValidationIssue) => {
    pushCorrectionState((draft) => {
      applySingleFixToDraft(draft, issue);
      return draft;
    });
  };

  const originalResult = useMemo(() => {
    return assemblePipelineResult(
      originalPrediction,
      config,
      rulerCalibrationMPerPx,
      rulerCalibrationMPerPx ? rulerDistanceM : null,
      0
    );
  }, [originalPrediction, config, rulerCalibrationMPerPx, rulerDistanceM]);

  const currentResult = useMemo(() => {
    return assemblePipelineResult(
      currentPrediction,
      config,
      rulerCalibrationMPerPx,
      rulerCalibrationMPerPx ? rulerDistanceM : null,
      historyIndex
    );
  }, [currentPrediction, config, rulerCalibrationMPerPx, rulerDistanceM, historyIndex]);

  const activePipelineResult = isComparingOriginal ? originalResult : currentResult;

  const handleAutoFixAllIssues = () => {
    const issuesToFix = currentResult.model3d.validation_issues;
    if (issuesToFix.length === 0) return;
    pushCorrectionState((draft) => {
      for (const iss of issuesToFix) {
        applySingleFixToDraft(draft, iss);
      }
      return draft;
    });
  };

  const handleApplyRulerCalibration = () => {
    const pxDist = Math.hypot(
      rulerPoints[1].x - rulerPoints[0].x,
      rulerPoints[1].y - rulerPoints[0].y
    );
    if (pxDist > 5 && rulerDistanceM > 0.1) {
      setRulerCalibrationMPerPx(rulerDistanceM / pxDist);
    }
  };

  const handleWorkflowStepClick = (step: WorkflowStepId) => {
    setActiveWorkflowStep(step);
    if (step === 'upload') {
      headerFileInputRef.current?.click();
    } else if (step === 'detect') {
      runFullPipeline({ useAiVision: true });
    } else if (step === 'review_confidence') {
      setConfig((prev) => ({
        ...prev,
        overlay_2d_mode: 'confidence',
        material_theme: 'confidence_overlay',
      }));
      setActiveInspectorTab('correct');
    } else if (step === 'correct') {
      setActiveInspectorTab('correct');
    } else if (step === 'validate') {
      setActiveInspectorTab('validate');
    } else if (step === 'explore_3d') {
      setConfig((prev) => ({ ...prev, material_theme: 'studio' }));
      viewport3dRef.current?.resetCamera();
    } else if (step === 'report') {
      setActiveInspectorTab('report');
    }
  };

  return (
    <div className="min-h-screen lg:h-screen w-screen flex flex-col bg-[#0B0D11] text-[#F1F5F9] overflow-x-hidden lg:overflow-hidden">
      {/* Top Header */}
      <header className="h-13 shrink-0 flex items-center justify-between px-5 border-b border-[#222938] bg-[#0B0D11]">
        <div className="flex items-center gap-4">
          <a
            href="#top"
            onClick={(e) => {
              e.preventDefault();
              handleSelectPreset(BLUEPRINT_PRESETS[0]);
            }}
            className="text-base font-bold tracking-tight text-[#F8FAFC] font-display whitespace-nowrap"
          >
            FloorForge
          </a>

          <nav className="hidden md:flex items-center gap-4 text-xs font-medium text-[#94A3B8]">
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
          </nav>
        </div>

        <div className="flex items-center gap-2">
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
            className="px-3 py-1.5 text-xs font-medium text-[#F8FAFC] bg-[#181D29] hover:bg-[#222938] border border-[#222938] rounded-md transition-colors whitespace-nowrap flex items-center gap-1.5"
          >
            <Upload className="w-3.5 h-3.5 text-[#38BDF8]" />
            <span>Upload Floor Plan</span>
          </button>
          <button
            type="button"
            onClick={() => viewport3dRef.current?.exportGLB()}
            className="px-3.5 py-1.5 text-xs font-semibold text-[#F8FAFC] bg-[#D97706] hover:bg-[#F59E0B] rounded-md transition-colors whitespace-nowrap flex items-center gap-1.5"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Export .GLB</span>
          </button>
        </div>
      </header>

      {/* 7-Step Guided Workflow Strip */}
      <div className="shrink-0 px-5 py-1.5 bg-[#12161F] border-b border-[#222938] flex items-center justify-between gap-2 overflow-x-auto">
        <div className="flex items-center gap-1">
          {WORKFLOW_STEPS.map((step, idx) => {
            const isActive = activeWorkflowStep === step.id;
            return (
              <React.Fragment key={step.id}>
                <button
                  type="button"
                  onClick={() => handleWorkflowStepClick(step.id)}
                  className={`px-2.5 py-1 rounded text-xs font-medium transition-colors whitespace-nowrap ${
                    isActive
                      ? 'bg-[#D97706] text-[#F8FAFC] font-semibold'
                      : 'text-[#94A3B8] hover:text-[#F8FAFC] hover:bg-[#181D29]'
                  }`}
                >
                  {step.label}
                </button>
                {idx < WORKFLOW_STEPS.length - 1 && (
                  <ChevronRight className="w-3.5 h-3.5 text-[#475569] shrink-0" />
                )}
              </React.Fragment>
            );
          })}
        </div>

        {isComparingOriginal && (
          <span className="px-2 py-0.5 rounded bg-[#F59E0B]/20 text-[#F59E0B] border border-[#F59E0B]/40 text-[11px] font-semibold whitespace-nowrap">
            Comparing: Initial AI Reconstruction (Before User Corrections)
          </span>
        )}
      </div>

      {/* Main Split Workbench */}
      <main className="flex-1 flex flex-col lg:flex-row overflow-hidden">
        <div className="flex-1 grid grid-cols-1 lg:grid-cols-12 min-h-[560px] lg:min-h-0 overflow-hidden">
          <div className="lg:col-span-6 border-r border-[#222938] h-[440px] lg:h-full overflow-hidden">
            <BlueprintCanvas2D
              imageDataUrl={blueprintDataUrl}
              pipelineResult={activePipelineResult}
              selectedElement={selectedElement}
              onSelectElement={(el) => {
                setSelectedElement(el);
                if (el) setActiveInspectorTab('correct');
              }}
              editorTool={editorTool}
              onChangeEditorTool={setEditorTool}
              overlayColorMode={config.overlay_2d_mode}
              onChangeOverlayColorMode={(mode: OverlayColorMode) =>
                setConfig((prev) => ({ ...prev, overlay_2d_mode: mode }))
              }
              onMoveWallEndpoint={handleMoveWallEndpoint}
              onAddMissingWall={handleAddMissingWall}
              onAddMissingOpeningAtPoint={handleAddMissingOpeningAtPoint}
              canUndo={historyIndex > 0}
              canRedo={historyIndex < history.length - 1}
              onUndo={handleUndo}
              onRedo={handleRedo}
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
              pipelineResult={activePipelineResult}
              config={config}
              selectedElement={selectedElement}
              onSelectElement={(el) => {
                setSelectedElement(el);
                if (el) setActiveInspectorTab('correct');
              }}
              onChangeMaterialTheme={(theme) =>
                setConfig((prev) => ({ ...prev, material_theme: theme }))
              }
            />
          </div>
        </div>

        <InspectorSidebar
          pipelineResult={activePipelineResult}
          originalResult={originalResult}
          isComparingOriginal={isComparingOriginal}
          onToggleCompareOriginal={() => setIsComparingOriginal((v) => !v)}
          activeTab={activeInspectorTab}
          onChangeTab={setActiveInspectorTab}
          config={config}
          onChangeConfig={setConfig}
          selectedElement={selectedElement}
          onSelectElement={setSelectedElement}
          editorTool={editorTool}
          onChangeEditorTool={setEditorTool}
          overlayColorMode={config.overlay_2d_mode}
          onChangeOverlayColorMode={(mode) =>
            setConfig((prev) => ({ ...prev, overlay_2d_mode: mode }))
          }
          onConfirmElement={handleConfirmElement}
          onRejectElement={handleRejectElement}
          onUpdateWallGeometry={handleUpdateWallGeometry}
          onUpdateOpeningGeometry={handleUpdateOpeningGeometry}
          onUpdateRoomMeta={handleUpdateRoomMeta}
          onApplyValidationFix={handleApplyValidationFix}
          onAutoFixAllIssues={handleAutoFixAllIssues}
          canUndo={historyIndex > 0}
          canRedo={historyIndex < history.length - 1}
          onUndo={handleUndo}
          onRedo={handleRedo}
          onOpenRuler={() => setRulerActive(true)}
          onOpenFastApiModal={() => setIsFastApiModalOpen(true)}
        />
      </main>

      <FastApiModal
        isOpen={isFastApiModalOpen}
        onClose={() => setIsFastApiModalOpen(false)}
        pipelineResult={activePipelineResult}
      />
    </div>
  );
}
