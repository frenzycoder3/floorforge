import React, { useEffect, useState } from 'react';
import { FloorPlanPipelineResult } from '../types/floorforge';
import { X, Copy, Check, Terminal, FileCode } from 'lucide-react';

interface FastApiModalProps {
  isOpen: boolean;
  onClose: () => void;
  pipelineResult: FloorPlanPipelineResult;
}

export const FastApiModal: React.FC<FastApiModalProps> = ({
  isOpen,
  onClose,
  pipelineResult,
}) => {
  const [sourceFiles, setSourceFiles] = useState<Record<string, string>>({});
  const [selectedFile, setSelectedFile] = useState<string>('live_pipeline_json');
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    fetch('/api/fastapi-source')
      .then((r) => r.json())
      .then((data) => {
        if (data?.files) {
          setSourceFiles(data.files);
        }
      })
      .catch(() => {
        // Ignore if offline
      });
  }, [isOpen]);

  if (!isOpen) return null;

  const currentCode =
    selectedFile === 'live_pipeline_json'
      ? JSON.stringify(pipelineResult, null, 2)
      : sourceFiles[selectedFile] || '# Loading Python FastAPI module...';

  const handleCopy = () => {
    navigator.clipboard.writeText(currentCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };

  const fileList = [
    { key: 'live_pipeline_json', label: 'Live Pipeline Output (.json)' },
    { key: 'backend/main.py', label: 'backend/main.py (FastAPI Entry)' },
    { key: 'backend/schemas.py', label: 'backend/schemas.py (Pydantic)' },
    { key: 'backend/pipeline/predict.py', label: 'pipeline/predict.py (Stage 1)' },
    { key: 'backend/pipeline/vectorize.py', label: 'pipeline/vectorize.py (Stage 2)' },
    { key: 'backend/pipeline/solve_scale.py', label: 'pipeline/solve_scale.py (Stage 3)' },
    { key: 'backend/pipeline/build_model.py', label: 'pipeline/build_model.py (Stage 4)' },
    { key: 'backend/requirements.txt', label: 'backend/requirements.txt' },
  ];

  return (
    <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="w-full max-w-5xl h-[82vh] bg-[#12161F] border border-[#222938] rounded-lg shadow-2xl flex flex-col overflow-hidden">
        {/* Modal Header */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-[#222938] bg-[#0B0D11]">
          <div className="flex items-center gap-2.5">
            <Terminal className="w-4 h-4 text-[#D97706]" />
            <h3 className="text-sm font-semibold text-[#F8FAFC]">
              FloorForge (HNX26EPS06) — Python FastAPI Integration & Pipeline Schema
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 text-[#94A3B8] hover:text-[#F8FAFC] rounded transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 flex flex-col md:flex-row overflow-hidden">
          {/* Left File Tree */}
          <div className="w-full md:w-64 shrink-0 border-b md:border-b-0 md:border-r border-[#222938] bg-[#0B0D11]/60 p-3 space-y-1 overflow-y-auto">
            <div className="text-[11px] font-semibold text-[#64748B] px-2 py-1">
              Pipeline Modules
            </div>
            {fileList.map((item) => (
              <button
                key={item.key}
                type="button"
                onClick={() => setSelectedFile(item.key)}
                className={`w-full text-left px-2.5 py-2 rounded text-xs font-mono flex items-center gap-2 transition-colors ${
                  selectedFile === item.key
                    ? 'bg-[#D97706]/20 text-[#F59E0B] border border-[#D97706]/40'
                    : 'text-[#94A3B8] hover:bg-[#181D29] hover:text-[#F1F5F9]'
                }`}
              >
                <FileCode className="w-3.5 h-3.5 shrink-0" />
                <span className="truncate">{item.label}</span>
              </button>
            ))}
          </div>

          {/* Code Viewer */}
          <div className="flex-1 flex flex-col overflow-hidden bg-[#0B0D11]">
            <div className="flex items-center justify-between px-4 py-2 border-b border-[#222938] bg-[#12161F] text-xs">
              <span className="font-mono text-[#94A3B8]">{selectedFile}</span>
              <button
                type="button"
                onClick={handleCopy}
                className="px-2.5 py-1 rounded bg-[#181D29] hover:bg-[#222938] text-[#F1F5F9] border border-[#222938] flex items-center gap-1.5 transition-colors"
              >
                {copied ? <Check className="w-3.5 h-3.5 text-[#10B981]" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copied ? 'Copied' : 'Copy Code'}</span>
              </button>
            </div>
            <pre className="flex-1 p-4 overflow-auto text-xs font-mono text-[#E2E8F0] leading-relaxed">
              <code>{currentCode}</code>
            </pre>
          </div>
        </div>
      </div>
    </div>
  );
};
