import React, { useEffect, useMemo, useState } from 'react';
import { Volume, PlotBreakdown, PlotEpisode, NovelStyle, WebtoonScript } from '../types';

interface SourcePanelProps {
  volumes: Volume[];
  activeVolumeId: string;
  onVolumeChange: (id: string) => void;
  onAppendVolume: (name: string, content: string) => void;
  onImportNovel: (name: string, content: string) => void;
  onUpdateContent: (content: string) => void;
  onDeleteVolume: (id: string) => void;
  
  rawText: string;
  plotBreakdown: PlotBreakdown | null;
  selectedEpisode: PlotEpisode | null;
  onSelectEpisode: (ep: PlotEpisode | null) => void;
  onGeneratePlot: () => void;
  isGenerating: boolean;  // Global: true during plot breakdown
  
  // Script cache to check if episode already has script
  scriptCache?: Record<number | string, WebtoonScript>;
  
  // New: Track which episodes are currently generating (for parallel generation UI)
  generatingEpisodes?: Set<number>;
  
  onUpdateEpisode: (ep: PlotEpisode) => void;
  onRunBreakdownQA: () => void;
  onGenerateScript: (ep: PlotEpisode) => void; // New prop for individual generation
  onBackToProjects: () => void;
  
  // Props for styles (stubbed in interface to satisfy TS, though component logic below uses what is needed)
  activeStyle: any;
  customStyles: any;
  onSelectStyle: any;
  onAddStyle: any;
  onDeleteStyle: any;
  onAutoDetectStyle: any;
  onBatchGenerate: any;
  onBatchExport: any;
}

export const SourcePanel: React.FC<SourcePanelProps> = ({
  volumes,
  activeVolumeId,
  onVolumeChange,
  onAppendVolume,
  onImportNovel,
  onUpdateContent,
  onDeleteVolume,
  rawText,
  plotBreakdown,
  selectedEpisode,
  onSelectEpisode,
  onGeneratePlot,
  isGenerating,
  scriptCache,
  generatingEpisodes,
  onGenerateScript,
  onBackToProjects
}) => {
  // Preview/edit mode for large rawText to avoid heavy controlled textarea rendering
  const [isEditingRaw, setIsEditingRaw] = useState(false);
  const [draftRawText, setDraftRawText] = useState(rawText);

  useEffect(() => {
    // Sync draft when not editing, to follow external updates (volume switch/import)
    if (!isEditingRaw) {
      setDraftRawText(rawText);
    }
  }, [rawText, isEditingRaw]);

  // Helper to check if episode has script
  const hasScript = (epNum: number): boolean => {
    if (!scriptCache) return false;
    const script = scriptCache[epNum] || scriptCache[String(epNum)];
    return !!(script && script.panels && script.panels.length > 0);
  };

  const previewText = useMemo(() => {
    const MAX_CHARS = 6000;
    if (!rawText) return '';
    if (rawText.length <= MAX_CHARS) return rawText;
    return `${rawText.slice(0, MAX_CHARS)}\n\n……（已截断，点击“编辑全文”查看/修改）`;
  }, [rawText]);

  const enterEditRawText = () => {
    setDraftRawText(rawText);
    setIsEditingRaw(true);
  };

  const saveAndExitEdit = () => {
    setIsEditingRaw(false);
    onUpdateContent(draftRawText);
  };

  return (
    <div className="flex flex-col h-full bg-[#1E1E1E] text-white overflow-hidden">
      {/* Header */}
      <div className="h-14 px-4 bg-[#252525] border-b border-white/5 flex items-center justify-between shrink-0">
         <div className="flex items-center gap-2">
            <button onClick={onBackToProjects} className="text-gray-400 hover:text-white mr-2" title="返回项目列表">
               ←
            </button>
            <h2 className="text-sm font-bold text-gray-100">剧本工程 (Source)</h2>
         </div>
      </div>

      {/* Volume Selector */}
      <div className="p-4 border-b border-white/5 space-y-3">
          <div className="flex items-center gap-2">
              <select 
                value={activeVolumeId}
                onChange={(e) => onVolumeChange(e.target.value)}
                className="flex-1 bg-[#1C1C1E] text-gray-200 text-xs border border-[#3A3A3C] rounded px-2 py-1.5 outline-none focus:border-blue-500"
              >
                {volumes.map(v => (
                  <option key={v.id} value={v.id}>
                    {v.name} ({(v.content || "").length.toLocaleString()} 字)
                  </option>
                ))}
              </select>
              <button 
                  onClick={(e) => {
                      e.stopPropagation(); // Stop select focus stealing
                      if (volumes.length > 0 && activeVolumeId) {
                          const volName = volumes.find(v => v.id === activeVolumeId)?.name || '当前卷';
                          if (window.confirm(`确认要删除 "${volName}" 吗？\n\n注意：此操作将永久删除该卷下的所有剧情拆解和生成的剧本数据，且无法恢复。`)) {
                              onDeleteVolume(activeVolumeId);
                          }
                      }
                  }}
                  className="p-1.5 bg-[#2C2C2E] hover:bg-red-900/50 hover:text-red-300 rounded text-gray-500 transition-colors"
                  title="删除当前卷"
              >
                  🗑️
              </button>
          </div>
          <button
              onClick={() => {
                  const input = document.createElement('input');
                  input.type = 'file';
                  input.accept = '.txt';
                  input.onchange = (e: any) => {
                      const file = e.target.files[0];
                      if(file) {
                          const reader = new FileReader();
                          reader.onload = (re) => onImportNovel(file.name.replace('.txt',''), re.target?.result as string);
                          reader.readAsText(file);
                      }
                  }
                  input.click();
              }}
              className="w-full py-2 bg-blue-600/20 text-blue-300 border border-blue-500/30 hover:bg-blue-600/30 rounded text-xs font-bold"
          >
              + 导入小说文本 (.txt)
          </button>
      </div>

      {/* Novel Text Area (smaller height + preview mode for performance) */}
      <div className="h-1/4 flex flex-col min-h-0 border-b border-white/5">
          <div className="px-4 py-2 bg-[#202020] text-[10px] font-bold text-gray-500 uppercase flex justify-between items-center">
              <span>小说原文 (Source Text)</span>
              <div className="flex items-center gap-2">
                <span>{rawText.length} 字</span>
                {!isEditingRaw ? (
                  <button
                    type="button"
                    onClick={enterEditRawText}
                    className="px-2 py-0.5 rounded bg-[#2C2C2E] hover:bg-blue-600/30 border border-white/10 text-gray-300 text-[10px] transition-colors"
                    title="编辑全文（大文本可能会略卡，仅在需要时开启）"
                  >
                    编辑全文
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={saveAndExitEdit}
                    className="px-2 py-0.5 rounded bg-blue-600/20 hover:bg-blue-600/30 border border-blue-500/30 text-blue-200 text-[10px] transition-colors"
                    title="保存并退出编辑"
                  >
                    保存并退出
                  </button>
                )}
              </div>
          </div>
          {!isEditingRaw ? (
            <pre className="flex-1 bg-[#151515] p-4 text-xs text-gray-400 font-mono whitespace-pre-wrap overflow-y-auto custom-scrollbar leading-relaxed">
              {previewText || '请导入或粘贴小说原文...'}
            </pre>
          ) : (
            <textarea
              value={draftRawText}
              onChange={(e) => setDraftRawText(e.target.value)}
              className="flex-1 bg-[#151515] p-4 text-xs text-gray-400 font-mono resize-none outline-none leading-relaxed"
              placeholder="请导入或粘贴小说原文..."
            />
          )}
      </div>

      {/* Plot Breakdown */}
      <div className="flex-1 flex flex-col min-h-0 bg-[#1A1A1A]">
          <div className="px-4 py-2 bg-[#202020] border-t border-b border-white/5 flex justify-between items-center">
             <div className="flex items-center gap-2">
                <span className="text-[10px] font-bold text-gray-500 uppercase">剧情大纲</span>
                
                {/* Parallel generation status indicator */}
                {generatingEpisodes && generatingEpisodes.size > 0 && (
                    <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-blue-500/10 border border-blue-500/20">
                        <div className="flex -space-x-1">
                            {Array.from(generatingEpisodes).slice(0, 3).map(epNum => (
                                <span 
                                    key={epNum}
                                    className="w-4 h-4 rounded-full bg-blue-600 border border-blue-400 flex items-center justify-center text-[8px] text-white font-bold animate-pulse"
                                >
                                    {epNum}
                                </span>
                            ))}
                            {generatingEpisodes.size > 3 && (
                                <span className="w-4 h-4 rounded-full bg-blue-800 border border-blue-500 flex items-center justify-center text-[8px] text-blue-300">
                                    +{generatingEpisodes.size - 3}
                                </span>
                            )}
                        </div>
                        <span className="text-[9px] text-blue-300 font-medium">
                            {generatingEpisodes.size} 集生成中
                        </span>
                    </div>
                )}
             </div>
             <button 
                onClick={onGeneratePlot}
                disabled={isGenerating || !rawText || (generatingEpisodes?.size || 0) > 0}
                className={`text-[10px] px-2 py-0.5 rounded font-bold transition-all ${
                    isGenerating || (generatingEpisodes?.size || 0) > 0
                        ? 'bg-gray-700 text-gray-500 cursor-not-allowed' 
                        : 'bg-purple-600 text-white hover:bg-purple-500'
                }`}
             >
                {isGenerating ? '拆解中...' : 'AI 剧情拆解'}
             </button>
          </div>
          
          <div className="flex-1 overflow-y-auto custom-scrollbar p-2 space-y-2">
             {plotBreakdown && plotBreakdown.episodes && plotBreakdown.episodes.length > 0 ? (
                 plotBreakdown.episodes.map((ep, idx) => {
                     const epHasScript = hasScript(ep.episode_number);
                     const isThisEpGenerating = generatingEpisodes?.has(ep.episode_number) || false;
                     
                     return (
                     <div 
                        key={idx}
                        onClick={() => onSelectEpisode(ep)}
                        className={`
                            relative overflow-hidden
                            p-3 rounded-lg border cursor-pointer transition-all duration-300 flex flex-col gap-2
                            ${selectedEpisode?.episode_number === ep.episode_number 
                                ? 'bg-blue-900/20 border-blue-500/50' 
                                : isThisEpGenerating
                                  ? 'border-blue-500/50 bg-gradient-to-r from-blue-900/20 via-purple-900/20 to-blue-900/20 animate-gradient-flow animate-pulse-border'
                                  : epHasScript 
                                    ? 'bg-green-900/10 border-green-500/30 hover:border-green-500/50'
                                    : 'bg-[#222] border-white/5 hover:border-white/20'
                            }
                        `}
                     >
                        {/* Progress bar for generating episodes */}
                        {isThisEpGenerating && (
                            <div className="absolute inset-x-0 bottom-0 h-1 bg-blue-900/30 overflow-hidden">
                                <div className="h-full w-1/3 bg-gradient-to-r from-transparent via-blue-500 to-transparent animate-progress-slide" />
                            </div>
                        )}
                        
                        {/* Background glow for generating */}
                        {isThisEpGenerating && (
                            <div className="absolute inset-0 bg-gradient-to-r from-blue-500/5 via-purple-500/10 to-blue-500/5 animate-breathe pointer-events-none" />
                        )}
                        
                        <div className="relative z-10 flex justify-between items-start">
                            <div>
                                <div className="flex gap-2 items-center mb-1">
                                    <span className={`text-[10px] font-bold ${isThisEpGenerating ? 'text-blue-300' : 'text-blue-400'}`}>
                                        EP.{ep.episode_number}
                                    </span>
                                    
                                    {/* Status badge */}
                                    {isThisEpGenerating ? (
                                        <span className="flex items-center gap-1.5 text-[9px] px-2 py-0.5 rounded-full bg-blue-500/20 text-blue-300 font-bold">
                                            <span className="w-1.5 h-1.5 bg-blue-400 rounded-full animate-pulse" />
                                            生成中
                                        </span>
                                    ) : epHasScript ? (
                                        <span className="text-[9px] px-1.5 py-0.5 rounded bg-green-500/20 text-green-400 font-bold">
                                            ✓ 已生成
                                        </span>
                                    ) : null}
                                    
                                    <span className="text-[10px] font-mono text-gray-600">{ep.hook_type} (Lv.{ep.hook_intensity})</span>
                                </div>
                                <h4 className={`text-xs font-bold ${isThisEpGenerating ? 'text-blue-100' : 'text-gray-200'}`}>
                                    {ep.title}
                                </h4>
                            </div>
                            
                            {/* Generate Button */}
                            <button
                                onClick={(e) => {
                                    e.stopPropagation();
                                    if (isThisEpGenerating) return;
                                    if (epHasScript && !window.confirm(`EP.${ep.episode_number} 已有剧本，确定要重新生成吗？`)) {
                                      return;
                                    }
                                    onGenerateScript(ep);
                                }}
                                disabled={isThisEpGenerating || isGenerating}
                                className={`
                                    flex items-center gap-1.5 px-2.5 py-1.5 border rounded-lg text-[9px] font-bold
                                    transition-all duration-300 whitespace-nowrap
                                    ${isThisEpGenerating
                                        ? 'bg-blue-600/20 border-blue-500/50 text-blue-300 cursor-wait'
                                        : isGenerating
                                          ? 'bg-gray-800 border-gray-700 text-gray-500 cursor-not-allowed'
                                          : epHasScript 
                                            ? 'bg-[#252525] hover:bg-amber-600/30 border-amber-500/30 text-amber-300 hover:text-amber-200 hover:scale-105 active:scale-95'
                                            : 'bg-[#333] hover:bg-blue-600 border-white/10 text-gray-300 hover:text-white hover:scale-105 active:scale-95'
                                    }
                                `}
                                title={isThisEpGenerating ? "正在生成中..." : epHasScript ? "重新生成分镜脚本" : "为此集生成分镜脚本"}
                            >
                                {isThisEpGenerating ? (
                                    <>
                                        <svg className="w-3 h-3 animate-spin-slow" viewBox="0 0 24 24" fill="none">
                                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
                                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                                        </svg>
                                        <span>生成中...</span>
                                    </>
                                ) : epHasScript ? (
                                    <>
                                        <span>🔄</span>
                                        <span>重新生成</span>
                                    </>
                                ) : (
                                    <>
                                        <span>✨</span>
                                        <span>生成脚本</span>
                                    </>
                                )}
                            </button>
                        </div>
                        <p className={`relative z-10 text-[10px] line-clamp-2 ${isThisEpGenerating ? 'text-blue-200/60' : 'text-gray-500'}`}>
                            {ep.core_conflict}
                        </p>
                     </div>
                     );
                 })
             ) : (
                 <div className="flex flex-col items-center justify-center h-full text-gray-600 gap-2">
                     <span className="text-2xl">🧩</span>
                     <span className="text-xs">
                        {isGenerating ? 'AI 正在分析文本...' : '暂无剧情拆解'}
                     </span>
                 </div>
             )}
          </div>
      </div>
    </div>
  );
};