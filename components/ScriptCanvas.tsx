import React, { useState, useCallback } from 'react';
import { WebtoonScript, ScriptPanel, PipelineStatus, PanelShot, ShotSize } from '../types';

interface ScriptCanvasProps {
  script: WebtoonScript | null;
  status: PipelineStatus;
  onGenerateScript: (count: number) => Promise<void>;
  onUpdateScript: (script: WebtoonScript) => void;
  onExportScript: () => void;
  selectedEpisodeTitle?: string;
  suggestedPanelCount: number;
  highlightedPanelId: number | null;
}

export const ScriptCanvas: React.FC<ScriptCanvasProps> = ({
  script,
  status,
  onGenerateScript,
  onUpdateScript,
  onExportScript,
  selectedEpisodeTitle,
  suggestedPanelCount,
  highlightedPanelId
}) => {
  const panels = script?.panels || [];
  const isGenerating = status === 'WRITING' || status === 'ALIGNING' || status === 'SPLITTING';

  // --- Logic: Empty or Loading State ---
  if (!script || (panels.length === 0 && isGenerating)) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-gray-500 bg-[#121212] relative overflow-hidden">
        <div className="text-4xl mb-4 opacity-20 animate-pulse">
          {status === 'WRITING' || status === 'ALIGNING' ? '⏳' : '📝'}
        </div>
        <h2 className="text-lg font-bold mb-2 text-gray-300">
          {status === 'WRITING' ? 'AI 正在构思剧本...' : 
           status === 'ALIGNING' ? '正在进行一致性检查...' : 
           status === 'SPLITTING' ? '正在拆解剧情...' : '剧本工作区'}
        </h2>
        <p className="text-xs mb-6 text-gray-600 max-w-md text-center leading-relaxed">
          {status === 'WRITING' ? '正在根据剧情大纲拆解分镜，识别视觉重点，请稍候...' : 
           status === 'ALIGNING' ? '正在优化剧本细节，确保逻辑连贯...' : 
           status === 'SPLITTING' ? '正在分析小说文本...' : '请在左侧选择一集，或者点击下方按钮开始创作。'}
        </p>
        
        {!isGenerating && (
          <button
            onClick={() => onGenerateScript(suggestedPanelCount)}
            className="px-6 py-2.5 bg-blue-600 hover:bg-blue-500 text-white rounded-xl font-bold text-xs transition-all shadow-lg hover:shadow-blue-900/30 active:scale-95 flex items-center gap-2"
          >
            <span>✨</span> 自动生成剧本 ({suggestedPanelCount} 镜)
          </button>
        )}

        {isGenerating && (
          <div className="w-48 h-1.5 bg-[#222] rounded-full overflow-hidden mt-4">
            <div className="h-full bg-blue-500 w-1/3 rounded-full animate-progress-infinite"></div>
          </div>
        )}

        <style>{`
          @keyframes progress-infinite {
            0% { transform: translateX(-100%); }
            100% { transform: translateX(300%); }
          }
          .animate-progress-infinite {
            animation: progress-infinite 1.5s infinite linear;
          }
        `}</style>
      </div>
    );
  }

  // --- Handlers ---

  const handleUpdatePanel = (panelId: number, field: keyof ScriptPanel, value: string) => {
    const updatedPanels = panels.map(p => 
      p.panel_id === panelId ? { ...p, [field]: value } : p
    );
    onUpdateScript({ ...script, panels: updatedPanels });
  };

  const handleAddPanel = () => {
    const nextId = panels.length > 0 
      ? Math.max(...panels.map(p => p.panel_id)) + 1 
      : 1;
      
    const newPanel: ScriptPanel = {
      panel_id: nextId,
      script_content: "▲[景别] [角色]（[视觉细节]） [动作]：",
      duration: "5s",
      scene_name: panels.length > 0 ? panels[panels.length - 1].scene_name : "新场景",
      active_characters_str: "",
      props: "",
      visual: "",
      composition: "Close-up",
      dialogue: []
    };
    onUpdateScript({ ...script, panels: [...panels, newPanel] });
  };

  const handleDeletePanel = (panelId: number) => {
    if (!window.confirm("确定删除此分镜吗？")) return;
    const updatedPanels = panels.filter(p => p.panel_id !== panelId);
    onUpdateScript({ ...script, panels: updatedPanels });
  };

  const handleMovePanel = (index: number, direction: 'up' | 'down') => {
    const newPanels = [...panels];
    if (direction === 'up') {
        if (index === 0) return;
        [newPanels[index], newPanels[index - 1]] = [newPanels[index - 1], newPanels[index]];
    } else {
        if (index === newPanels.length - 1) return;
        [newPanels[index], newPanels[index + 1]] = [newPanels[index + 1], newPanels[index]];
    }
    onUpdateScript({ ...script, panels: newPanels });
  };

  return (
    <div className="flex flex-col h-full bg-[#121212] text-white overflow-hidden relative">
      {/* Header Bar */}
      <div className="h-14 px-6 border-b border-white/5 flex items-center justify-between bg-[#1E1E1E] shrink-0 z-10 shadow-sm">
         <div>
            <h2 className="text-sm font-bold text-gray-200 flex items-center gap-2">
                {selectedEpisodeTitle || '未命名剧集'}
                {isGenerating && <span className="w-1.5 h-1.5 bg-blue-500 rounded-full animate-pulse"></span>}
            </h2>
            <div className="text-[10px] text-gray-500 font-mono mt-0.5">
                {panels.length} 个分镜 • 预估时长: {panels.reduce((acc, p) => acc + parseInt(p.duration || '0'), 0)}s
            </div>
         </div>
         <div className="flex gap-2">
            {isGenerating && (
              <div className="flex items-center gap-2 px-3 py-1.5 bg-blue-900/10 border border-blue-500/20 rounded text-[10px] text-blue-300 font-medium select-none">
                AI 正在优化...
              </div>
            )}
            <button 
                onClick={onExportScript} 
                className="p-2 hover:bg-white/5 rounded-lg text-gray-400 hover:text-white transition-colors border border-transparent hover:border-white/10" 
                title="导出剧本"
            >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
            </button>
            <button 
                onClick={handleAddPanel} 
                className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold rounded-lg shadow-lg hover:shadow-blue-900/20 active:scale-95 transition-all"
            >
                + 新增分镜
            </button>
         </div>
      </div>
      
      {/* Scrollable Canvas */}
      <div className="flex-1 overflow-y-auto custom-scrollbar p-6 space-y-4 pb-20">
          {panels.map((panel, idx) => (
             <div 
                key={panel.panel_id} 
                id={`panel-${panel.panel_id}`}
                className={`bg-[#1E1E1E] rounded-xl border p-4 transition-all group hover:shadow-xl relative ${
                    highlightedPanelId === panel.panel_id 
                    ? 'border-yellow-500/50 ring-1 ring-yellow-500/30 shadow-yellow-900/10 bg-yellow-900/5' 
                    : 'border-white/5 hover:border-white/10 hover:bg-[#222]'
                }`}
             >
                {/* Panel Header: Scene Info & Tools */}
                <div className="flex justify-between items-start mb-3">
                    <div className="flex items-center gap-3">
                        <span className="text-xs font-black text-gray-600 font-mono w-6">#{idx + 1}</span>
                        <input 
                            value={panel.scene_name}
                            onChange={(e) => handleUpdatePanel(panel.panel_id, 'scene_name', e.target.value)}
                            className="bg-transparent text-xs font-bold text-blue-300 outline-none border-b border-transparent focus:border-blue-500/50 transition-colors placeholder-gray-700 min-w-[100px]"
                            placeholder="场景名称"
                        />
                    </div>
                    <div className="flex items-center gap-1 opacity-40 group-hover:opacity-100 transition-opacity">
                        <input 
                            value={panel.duration}
                            onChange={(e) => handleUpdatePanel(panel.panel_id, 'duration', e.target.value)}
                            className="w-10 bg-[#111] text-[10px] text-center text-gray-400 border border-white/10 rounded py-0.5 focus:border-blue-500 outline-none"
                            placeholder="3s"
                        />
                        <div className="w-px h-3 bg-white/10 mx-1"></div>
                        <button onClick={() => handleMovePanel(idx, 'up')} disabled={idx === 0} className="p-1 hover:bg-white/10 rounded text-gray-400 disabled:opacity-30" title="上移">↑</button>
                        <button onClick={() => handleMovePanel(idx, 'down')} disabled={idx === panels.length - 1} className="p-1 hover:bg-white/10 rounded text-gray-400 disabled:opacity-30" title="下移">↓</button>
                        <div className="w-px h-3 bg-white/10 mx-1"></div>
                        <button 
                            onClick={() => handleDeletePanel(panel.panel_id)}
                            className="text-gray-500 hover:text-red-400 p-1 hover:bg-red-900/20 rounded transition-colors"
                            title="删除"
                        >
                            ✕
                        </button>
                    </div>
                </div>
                
                {/* Script Content (Visual Track) */}
                <textarea 
                    value={panel.script_content}
                    onChange={(e) => handleUpdatePanel(panel.panel_id, 'script_content', e.target.value)}
                    className="w-full min-h-[90px] bg-[#151515] text-sm text-gray-300 p-3 rounded-lg border border-white/5 focus:border-blue-500/50 outline-none resize-none font-mono leading-relaxed tracking-wide shadow-inner"
                    placeholder="▲[景别] [角色]（[细节]） [动作]..."
                />
                
                {/* NarrationZh Display (Second-Person Narration Track) */}
                {panel.narrationZh && (
                  <div className="bg-gradient-to-r from-orange-500/10 to-amber-500/10 rounded-lg border border-orange-500/20 p-3 mt-2">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-[10px] font-bold text-orange-400 uppercase tracking-wider flex items-center gap-1">
                        🎙️ 第二人称讲解
                      </span>
                      <button
                        onClick={() => {
                          navigator.clipboard.writeText(panel.narrationZh || '');
                          // Toast or visual feedback could be added here
                        }}
                        className="text-[10px] text-orange-300 hover:text-orange-200 bg-orange-500/20 hover:bg-orange-500/30 px-2 py-1 rounded transition-colors"
                      >
                        📋 复制
                      </button>
                    </div>
                    <p className="text-sm text-orange-100/90 leading-relaxed whitespace-pre-wrap">
                      {panel.narrationZh}
                    </p>
                    {panel.narrationHook && (
                      <div className="mt-2 pt-2 border-t border-orange-500/20">
                        <span className="text-[10px] text-orange-400">💎 钩子: </span>
                        <span className="text-[10px] text-orange-200">{panel.narrationHook}</span>
                      </div>
                    )}
                  </div>
                )}
                
                {/* Structured Shots Editor (collapsible) */}
                <ShotsEditor 
                  panel={panel}
                  onUpdatePanel={(updates) => {
                    const updatedPanels = panels.map(p => 
                      p.panel_id === panel.panel_id ? { ...p, ...updates } : p
                    );
                    onUpdateScript({ ...script, panels: updatedPanels });
                  }}
                />
             </div>
          ))}
          
          {/* Add Button at bottom */}
          {panels.length > 0 && (
              <button 
                onClick={handleAddPanel}
                className="w-full py-4 border-2 border-dashed border-white/5 rounded-xl text-xs font-bold text-gray-600 hover:text-gray-400 hover:border-white/10 hover:bg-white/[0.02] transition-all flex items-center justify-center gap-2"
              >
                  + 添加下一个分镜
              </button>
          )}
      </div>

      {/* Generating Overlay Indicator */}
      {isGenerating && panels.length > 0 && (
        <div className="absolute inset-x-0 bottom-6 flex justify-center pointer-events-none z-20">
           <div className="bg-[#1E1E1E]/90 backdrop-blur-md border border-blue-500/30 pl-4 pr-5 py-2 rounded-full shadow-2xl flex items-center gap-3 animate-in slide-in-from-bottom-4 fade-in duration-300">
              <div className="flex gap-1">
                <div className="w-1.5 h-1.5 bg-blue-500 rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></div>
                <div className="w-1.5 h-1.5 bg-blue-500 rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></div>
                <div className="w-1.5 h-1.5 bg-blue-500 rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></div>
              </div>
              <span className="text-[10px] font-bold text-blue-200 uppercase tracking-wider">AI Updating Script...</span>
           </div>
        </div>
      )}
    </div>
  );
};

// ============================================================================
// Shots Editor Component (Collapsible 3-shot editor for each panel)
// ============================================================================

const SHOT_SIZE_OPTIONS: { value: ShotSize; label: string; icon: string }[] = [
  { value: 'WS', label: '全景', icon: '🏞️' },
  { value: 'MS', label: '中景', icon: '👤' },
  { value: 'CU', label: '特写', icon: '🔍' },
];

interface ShotsEditorProps {
  panel: ScriptPanel;
  onUpdatePanel: (updates: Partial<ScriptPanel>) => void;
}

const ShotsEditor: React.FC<ShotsEditorProps> = ({ panel, onUpdatePanel }) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const hasShots = panel.shots && panel.shots.length === 3;
  
  // Initialize shots from existing data or create empty structure
  const getOrCreateShots = useCallback((): [PanelShot, PanelShot, PanelShot] => {
    if (panel.shots && panel.shots.length === 3) {
      return panel.shots;
    }
    
    // Create default shots from script_content if available
    const lines = panel.script_content?.split('\n')
      .filter(l => l.trim().startsWith('▲'))
      .map(l => l.replace(/^▲/, '').trim()) || [];
    
    const createDefaultShot = (index: 1 | 2 | 3, visual: string): PanelShot => ({
      index,
      dialogue: panel.dialogue?.[index - 1] || '',
      action: '',
      visual,
      characterAssetIds: [],
      sceneAssetId: null,
      propAssetIds: [],
      shotSize: index === 1 ? 'WS' : index === 2 ? 'MS' : 'CU',
      composition: '三分法',
      camera: '平视',
      light: '自然光',
    });
    
    return [
      createDefaultShot(1, lines[0] || ''),
      createDefaultShot(2, lines[1] || ''),
      createDefaultShot(3, lines[2] || ''),
    ];
  }, [panel]);
  
  const handleUpdateShot = useCallback((shotIndex: number, field: keyof PanelShot, value: string | ShotSize) => {
    const shots = getOrCreateShots();
    const updatedShot = { ...shots[shotIndex], [field]: value };
    const updatedShots = [...shots] as [PanelShot, PanelShot, PanelShot];
    updatedShots[shotIndex] = updatedShot;
    onUpdatePanel({ shots: updatedShots });
  }, [getOrCreateShots, onUpdatePanel]);
  
  const handleInitializeShots = useCallback(() => {
    const shots = getOrCreateShots();
    onUpdatePanel({ shots });
    setIsExpanded(true);
  }, [getOrCreateShots, onUpdatePanel]);
  
  if (!isExpanded) {
    return (
      <button
        onClick={() => hasShots ? setIsExpanded(true) : handleInitializeShots()}
        className={`mt-3 w-full py-2 text-[10px] font-medium rounded-lg border transition-all flex items-center justify-center gap-2 ${
          hasShots 
            ? 'border-green-500/20 text-green-400 hover:bg-green-900/10 hover:border-green-500/30' 
            : 'border-white/5 text-gray-500 hover:bg-white/5 hover:text-gray-400'
        }`}
      >
        <span>{hasShots ? '🎬' : '➕'}</span>
        <span>{hasShots ? `查看 3-Shot 结构 (已配置)` : '添加 3-Shot 结构化数据'}</span>
        <span className="text-[9px] opacity-50">▼</span>
      </button>
    );
  }
  
  const shots = getOrCreateShots();
  
  return (
    <div className="mt-3 border border-white/10 rounded-lg bg-[#0a0a0a] overflow-hidden">
      {/* Header */}
      <div 
        className="px-3 py-2 bg-[#151515] border-b border-white/5 flex items-center justify-between cursor-pointer hover:bg-[#1a1a1a]"
        onClick={() => setIsExpanded(false)}
      >
        <span className="text-[10px] font-bold text-gray-400 flex items-center gap-2">
          <span>🎬</span> 3-Shot 结构化数据
        </span>
        <span className="text-[9px] text-gray-600">▲ 收起</span>
      </div>
      
      {/* Shots Grid */}
      <div className="p-3 space-y-3">
        {shots.map((shot, idx) => (
          <div key={idx} className="bg-[#151515] rounded-lg p-3 border border-white/5">
            {/* Shot Header */}
            <div className="flex items-center justify-between mb-2">
              <span className="text-[10px] font-bold text-gray-300 flex items-center gap-2">
                <span className={`w-5 h-5 rounded flex items-center justify-center text-[10px] ${
                  idx === 0 ? 'bg-blue-900/50 text-blue-300' :
                  idx === 1 ? 'bg-purple-900/50 text-purple-300' :
                  'bg-orange-900/50 text-orange-300'
                }`}>
                  {idx + 1}
                </span>
                Shot {idx + 1}
              </span>
              
              {/* Shot Size Selector */}
              <div className="flex gap-1">
                {SHOT_SIZE_OPTIONS.map(opt => (
                  <button
                    key={opt.value}
                    onClick={() => handleUpdateShot(idx, 'shotSize', opt.value)}
                    className={`px-2 py-0.5 text-[9px] rounded transition-all ${
                      shot.shotSize === opt.value
                        ? 'bg-blue-600 text-white'
                        : 'bg-white/5 text-gray-500 hover:bg-white/10'
                    }`}
                    title={opt.label}
                  >
                    {opt.icon} {opt.value}
                  </button>
                ))}
              </div>
            </div>
            
            {/* Visual & Action */}
            <div className="grid grid-cols-2 gap-2 mb-2">
              <div>
                <label className="text-[9px] text-gray-600 mb-1 block">视觉描述</label>
                <input
                  value={shot.visual}
                  onChange={(e) => handleUpdateShot(idx, 'visual', e.target.value)}
                  className="w-full text-[11px] bg-[#0a0a0a] text-gray-300 px-2 py-1.5 rounded border border-white/5 focus:border-blue-500/50 outline-none"
                  placeholder="画面描述..."
                />
              </div>
              <div>
                <label className="text-[9px] text-gray-600 mb-1 block">动作</label>
                <input
                  value={shot.action}
                  onChange={(e) => handleUpdateShot(idx, 'action', e.target.value)}
                  className="w-full text-[11px] bg-[#0a0a0a] text-gray-300 px-2 py-1.5 rounded border border-white/5 focus:border-blue-500/50 outline-none"
                  placeholder="角色动作..."
                />
              </div>
            </div>
            
            {/* Dialogue */}
            <div className="mb-2">
              <label className="text-[9px] text-gray-600 mb-1 block">台词</label>
              <input
                value={shot.dialogue}
                onChange={(e) => handleUpdateShot(idx, 'dialogue', e.target.value)}
                className="w-full text-[11px] bg-[#0a0a0a] text-gray-300 px-2 py-1.5 rounded border border-white/5 focus:border-blue-500/50 outline-none"
                placeholder="该镜头的台词..."
              />
            </div>
            
            {/* Camera, Light, Composition Row */}
            <div className="grid grid-cols-3 gap-2">
              <div>
                <label className="text-[9px] text-gray-600 mb-1 block">构图</label>
                <input
                  value={shot.composition}
                  onChange={(e) => handleUpdateShot(idx, 'composition', e.target.value)}
                  className="w-full text-[10px] bg-[#0a0a0a] text-gray-400 px-2 py-1 rounded border border-white/5 focus:border-blue-500/50 outline-none"
                  placeholder="三分法..."
                />
              </div>
              <div>
                <label className="text-[9px] text-gray-600 mb-1 block">机位</label>
                <input
                  value={shot.camera}
                  onChange={(e) => handleUpdateShot(idx, 'camera', e.target.value)}
                  className="w-full text-[10px] bg-[#0a0a0a] text-gray-400 px-2 py-1 rounded border border-white/5 focus:border-blue-500/50 outline-none"
                  placeholder="平视..."
                />
              </div>
              <div>
                <label className="text-[9px] text-gray-600 mb-1 block">光影</label>
                <input
                  value={shot.light}
                  onChange={(e) => handleUpdateShot(idx, 'light', e.target.value)}
                  className="w-full text-[10px] bg-[#0a0a0a] text-gray-400 px-2 py-1 rounded border border-white/5 focus:border-blue-500/50 outline-none"
                  placeholder="自然光..."
                />
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};