import React, { useState, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { loadAssetImage } from '../services/fileSystem';
import { Asset, AssetType, AssetOptimizationProposal, FieldChange } from '../types';

// ============================================================================
// Proposal Card Component
// ============================================================================

const ProposalCard: React.FC<{
  proposal: AssetOptimizationProposal;
  isExpanded: boolean;
  isSelected: boolean;
  onToggleExpand: () => void;
  onToggleSelect: () => void;
  onAccept: () => void;
  onDismiss: () => void;
}> = ({ proposal, isExpanded, isSelected, onToggleExpand, onToggleSelect, onAccept, onDismiss }) => {
  const riskColors = {
    low: 'border-green-500/30 bg-green-500/5',
    medium: 'border-yellow-500/30 bg-yellow-500/5',
    high: 'border-red-500/30 bg-red-500/5',
  };

  const sourceLabel = proposal.source === 'local_rule' ? '📐 规则' : '🤖 AI';

  return (
    <div className={`rounded-lg border ${riskColors[proposal.riskLevel]} overflow-hidden`}>
      {/* Header - Always visible */}
      <div 
        className="p-3 flex items-center gap-3 cursor-pointer hover:bg-white/5 transition-colors"
        onClick={onToggleExpand}
      >
        {/* Checkbox */}
        <button
          onClick={(e) => { e.stopPropagation(); onToggleSelect(); }}
          className={`w-5 h-5 rounded border-2 flex items-center justify-center shrink-0 transition-colors ${
            isSelected 
              ? 'bg-blue-500 border-blue-500 text-white' 
              : 'border-gray-600 hover:border-gray-400'
          }`}
        >
          {isSelected && <span className="text-xs">✓</span>}
        </button>

        {/* Asset Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-bold text-white text-sm truncate">{proposal.assetName}</span>
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-700 text-gray-300 uppercase">
              {proposal.assetType}
            </span>
            <span className="text-[10px] text-gray-500">{sourceLabel}</span>
          </div>
          <p className="text-xs text-gray-400 mt-0.5 line-clamp-1">{proposal.reason}</p>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={(e) => { e.stopPropagation(); onAccept(); }}
            className="px-2 py-1 bg-green-600/20 text-green-400 text-[10px] font-bold rounded hover:bg-green-600/30 transition-colors"
          >
            采纳
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); onDismiss(); }}
            className="px-2 py-1 bg-gray-700/50 text-gray-400 text-[10px] rounded hover:bg-gray-700 transition-colors"
          >
            忽略
          </button>
          <span className={`text-gray-500 transition-transform ${isExpanded ? 'rotate-180' : ''}`}>
            ▼
          </span>
        </div>
      </div>

      {/* Expanded Content - Comparison View */}
      {isExpanded && (
        <div className="border-t border-white/10 p-4 space-y-4 bg-black/20">
          {proposal.changes.map((change, idx) => (
            <FieldChangeView key={idx} change={change} />
          ))}
        </div>
      )}
    </div>
  );
};

// ============================================================================
// Field Change View Component
// ============================================================================

const FieldChangeView: React.FC<{ change: FieldChange }> = ({ change }) => {
  const fieldLabels: Record<string, string> = {
    prompt: 'Prompt (提示词)',
    description: '描述',
    aspectRatio: '比例',
  };

  return (
    <div className="space-y-2">
      <h4 className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">
        {fieldLabels[change.field] || change.field}
      </h4>
      <div className="grid grid-cols-2 gap-3">
        {/* Before */}
        <div className="space-y-1">
          <span className="text-[10px] text-red-400 font-bold">原来</span>
          <div className="bg-red-500/10 border border-red-500/20 rounded p-2 text-xs text-gray-300 font-mono break-words max-h-32 overflow-y-auto">
            {change.before || '(空)'}
          </div>
        </div>
        {/* After */}
        <div className="space-y-1">
          <span className="text-[10px] text-green-400 font-bold">建议</span>
          <div className="bg-green-500/10 border border-green-500/20 rounded p-2 text-xs text-gray-300 font-mono break-words max-h-32 overflow-y-auto">
            {change.after || '(空)'}
          </div>
        </div>
      </div>
    </div>
  );
};

export interface AssetLibraryProps {
  assets: Asset[];
  onAddAsset: (asset: Asset) => void;
  onUpdateAsset: (asset: Asset) => void;
  onDeleteAsset: (id: string) => void;
  onGenerateImage: (assetId: string) => void;
  onSelectHistoryImage: (assetId: string, url: string) => void;
  onAutoExtract: () => void;
  onCleanupNames?: () => void; // Clean up asset names (remove trailing parenthesis, merge duplicates)
  isGenerating: boolean;
  generatingItemIds: Set<string>;
  // Optimization props
  optimizationProposals?: AssetOptimizationProposal[];
  isOptimizing?: boolean;
  onGenerateOptimizations?: () => void;
  onAcceptProposal?: (proposal: AssetOptimizationProposal) => void;
  onAcceptAllProposals?: (proposals: AssetOptimizationProposal[]) => void;
  onDismissProposal?: (proposalId: string) => void;
  onClearProposals?: () => void;
}

export const AssetLibrary: React.FC<AssetLibraryProps> = ({ 
  assets = [], 
  onAddAsset, 
  onUpdateAsset, 
  onDeleteAsset,
  onGenerateImage,
  onSelectHistoryImage,
  onAutoExtract,
  onCleanupNames,
  isGenerating,
  generatingItemIds = new Set(),
  // Optimization props
  optimizationProposals = [],
  isOptimizing = false,
  onGenerateOptimizations,
  onAcceptProposal,
  onAcceptAllProposals,
  onDismissProposal,
  onClearProposals,
}) => {
  const [filter, setFilter] = useState<AssetType | 'all'>('all');
  const [activeAssetId, setActiveAssetId] = useState<string | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [editForm, setEditForm] = useState<Asset | null>(null);
  const [assetImageUrls, setAssetImageUrls] = useState<Record<string, string>>({});
  const [historyImageUrls, setHistoryImageUrls] = useState<Record<string, string[]>>({});
  const [showOptimizationPanel, setShowOptimizationPanel] = useState(false);
  const [expandedProposalId, setExpandedProposalId] = useState<string | null>(null);
  const [selectedProposalIds, setSelectedProposalIds] = useState<Set<string>>(new Set());
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  // Show optimization panel when proposals arrive
  useEffect(() => {
    if (optimizationProposals.length > 0) {
      setShowOptimizationPanel(true);
    }
  }, [optimizationProposals.length]);

  // Group proposals by risk level for display
  const groupedProposals = useMemo(() => {
    const groups = {
      low: [] as AssetOptimizationProposal[],
      medium: [] as AssetOptimizationProposal[],
      high: [] as AssetOptimizationProposal[],
    };
    for (const p of optimizationProposals) {
      groups[p.riskLevel].push(p);
    }
    return groups;
  }, [optimizationProposals]);

  // Toggle proposal selection
  const toggleProposalSelection = (proposalId: string) => {
    setSelectedProposalIds(prev => {
      const next = new Set(prev);
      if (next.has(proposalId)) {
        next.delete(proposalId);
      } else {
        next.add(proposalId);
      }
      return next;
    });
  };

  // Select all low-risk proposals
  const selectAllLowRisk = () => {
    const lowRiskIds = groupedProposals.low.map(p => p.id);
    setSelectedProposalIds(new Set(lowRiskIds));
  };

  // Accept selected proposals
  const handleAcceptSelected = () => {
    const selectedProposals = optimizationProposals.filter(p => selectedProposalIds.has(p.id));
    if (selectedProposals.length > 0 && onAcceptAllProposals) {
      onAcceptAllProposals(selectedProposals);
      setSelectedProposalIds(new Set());
    }
  };

  // Load asset images from OPFS
  useEffect(() => {
    const loadImages = async () => {
      const urls: Record<string, string> = {};
      const historyUrls: Record<string, string[]> = {};
      
      for (const asset of assets) {
        if (asset.imagePath) {
          try {
            urls[asset.id] = await loadAssetImage(asset.imagePath);
          } catch (e) {
            console.warn('Failed to load asset image:', asset.id);
          }
        }
        if (asset.imageHistory?.length) {
          try {
            const loadedUrls = await Promise.all(
              asset.imageHistory.map(p => loadAssetImage(p).catch(() => ''))
            );
            historyUrls[asset.id] = loadedUrls.filter(Boolean);
          } catch (e) {
            console.warn('Failed to load history images:', asset.id);
          }
        }
      }
      setAssetImageUrls(urls);
      setHistoryImageUrls(historyUrls);
    };
    loadImages();
  }, [assets]);

  // Filter assets
  const displayAssets = assets.filter(a => filter === 'all' || a.type === filter);

  const handleEditClick = (asset: Asset) => {
    setActiveAssetId(asset.id);
    setEditForm({ ...asset });
    setIsEditing(true);
  };

  const handleSaveEdit = () => {
    if (editForm) {
      onUpdateAsset(editForm);
      setIsEditing(false);
      setEditForm(null);
    }
  };

  const handleCreateNew = () => {
      // Determine type and default aspect ratio for 16:9 video workflow
      const assetType = filter === 'all' ? 'character' : filter;
      // scene assets should be 16:9 to match video output, others 1:1
      const defaultAspectRatio = assetType === 'scene' ? '16:9' : '1:1';
      
      const newAsset: Asset = {
          id: `asset_${Date.now()}`,
          type: assetType,
          name: 'New Asset',
          description: '',
          prompt: '',
          aspectRatio: defaultAspectRatio
      };
      onAddAsset(newAsset);
      handleEditClick(newAsset);
  };

  return (
    <div className="flex h-full bg-[#121212] overflow-hidden">
      {/* Left Sidebar: List & Filters */}
      <div className="w-80 border-r border-white/5 flex flex-col bg-[#1E1E1E]">
        <div className="p-4 border-b border-white/5 space-y-4">
           <div className="flex justify-between items-center">
               <h2 className="text-sm font-bold text-gray-200">资产库 (Assets)</h2>
               <div className="flex gap-1">
                 {onCleanupNames && (
                   <button 
                     onClick={onCleanupNames}
                     disabled={isGenerating || isOptimizing}
                     className="text-[10px] bg-orange-600/20 text-orange-300 px-2 py-1 rounded hover:bg-orange-600/30 transition-colors disabled:opacity-50"
                     title="去除资产名称末尾的括号后缀，合并重复资产"
                   >
                     🧹 清理
                   </button>
                 )}
                 <button 
                   onClick={onAutoExtract}
                   disabled={isGenerating || isOptimizing}
                   className="text-[10px] bg-blue-600/20 text-blue-300 px-2 py-1 rounded hover:bg-blue-600/30 transition-colors disabled:opacity-50"
                 >
                   {isGenerating ? '提取中...' : 'AI 补全'}
                 </button>
                 {onGenerateOptimizations && (
                   <button 
                     onClick={onGenerateOptimizations}
                     disabled={isGenerating || isOptimizing || assets.length === 0}
                     className="text-[10px] bg-purple-600/20 text-purple-300 px-2 py-1 rounded hover:bg-purple-600/30 transition-colors disabled:opacity-50"
                     title="分析现有资产并生成优化建议"
                   >
                     {isOptimizing ? '分析中...' : '✨ 优化建议'}
                   </button>
                 )}
               </div>
           </div>
           
           <div className="flex gap-1 bg-[#121212] p-1 rounded-lg">
              {(['all', 'character', 'scene', 'item'] as const).map(t => (
                  <button
                    key={t}
                    onClick={() => setFilter(t)}
                    className={`flex-1 py-1 text-[10px] rounded font-medium capitalize transition-all ${filter === t ? 'bg-[#333] text-white shadow' : 'text-gray-500 hover:text-gray-300'}`}
                  >
                    {t}
                  </button>
              ))}
           </div>
        </div>

        <div className="flex-1 overflow-y-auto custom-scrollbar p-3 space-y-2">
            <button 
                onClick={handleCreateNew}
                className="w-full py-2 border border-dashed border-white/10 rounded-lg text-xs text-gray-500 hover:text-white hover:border-white/30 hover:bg-white/5 transition-all"
            >
                + 手动添加资产
            </button>
            
            {displayAssets.map(asset => (
                <div 
                   key={asset.id}
                   onClick={() => setActiveAssetId(asset.id)}
                   className={`p-3 rounded-lg border cursor-pointer flex gap-3 items-center transition-all ${
                       activeAssetId === asset.id 
                       ? 'bg-blue-900/10 border-blue-500/50' 
                       : 'bg-[#252525] border-white/5 hover:border-white/20'
                   }`}
                >
                    <div className="w-10 h-10 rounded bg-[#111] overflow-hidden flex-shrink-0">
                        {assetImageUrls[asset.id] ? (
                            <img src={assetImageUrls[asset.id]} alt={asset.name} className="w-full h-full object-cover" />
                        ) : (
                            <div className="w-full h-full flex items-center justify-center text-[8px] text-gray-600">No Img</div>
                        )}
                    </div>
                    <div className="flex-1 min-w-0">
                        <div className="text-xs font-bold text-gray-200 truncate">{asset.name}</div>
                        <div className="text-[10px] text-gray-500 truncate">{asset.type}</div>
                    </div>
                </div>
            ))}
        </div>
      </div>

      {/* Main Area: Detail View */}
      <div className="flex-1 bg-[#121212] flex flex-col relative">
          {/* Optimization Proposals Panel */}
          {showOptimizationPanel && optimizationProposals.length > 0 && (
            <div className="absolute inset-0 z-20 bg-[#121212] flex flex-col animate-in fade-in slide-in-from-right-4 duration-300">
              {/* Header */}
              <div className="shrink-0 px-6 py-4 border-b border-white/10 bg-[#1a1a1a] flex items-center justify-between">
                <div>
                  <h2 className="text-lg font-bold text-white flex items-center gap-2">
                    ✨ 资产优化建议
                    <span className="text-xs font-normal text-gray-400">
                      ({optimizationProposals.length} 条)
                    </span>
                  </h2>
                  <p className="text-xs text-gray-500 mt-1">
                    以下资产可以通过优化提示词来提高生成质量
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  {selectedProposalIds.size > 0 && (
                    <button
                      onClick={handleAcceptSelected}
                      className="px-3 py-1.5 bg-green-600 hover:bg-green-500 text-white text-xs font-bold rounded transition-colors"
                    >
                      ✓ 采纳所选 ({selectedProposalIds.size})
                    </button>
                  )}
                  <button
                    onClick={selectAllLowRisk}
                    className="px-3 py-1.5 bg-blue-600/20 text-blue-300 text-xs rounded hover:bg-blue-600/30 transition-colors"
                  >
                    全选低风险
                  </button>
                  <button
                    onClick={() => {
                      setShowOptimizationPanel(false);
                      onClearProposals?.();
                    }}
                    className="px-3 py-1.5 bg-gray-700 text-gray-300 text-xs rounded hover:bg-gray-600 transition-colors"
                  >
                    关闭
                  </button>
                </div>
              </div>

              {/* Proposals List */}
              <div className="flex-1 overflow-y-auto custom-scrollbar p-4 space-y-3">
                {/* Low Risk Group */}
                {groupedProposals.low.length > 0 && (
                  <div className="space-y-2">
                    <h3 className="text-xs font-bold text-green-400 uppercase tracking-wider flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-green-500" />
                      低风险 ({groupedProposals.low.length})
                    </h3>
                    {groupedProposals.low.map(proposal => (
                      <ProposalCard
                        key={proposal.id}
                        proposal={proposal}
                        isExpanded={expandedProposalId === proposal.id}
                        isSelected={selectedProposalIds.has(proposal.id)}
                        onToggleExpand={() => setExpandedProposalId(expandedProposalId === proposal.id ? null : proposal.id)}
                        onToggleSelect={() => toggleProposalSelection(proposal.id)}
                        onAccept={() => onAcceptProposal?.(proposal)}
                        onDismiss={() => onDismissProposal?.(proposal.id)}
                      />
                    ))}
                  </div>
                )}

                {/* Medium Risk Group */}
                {groupedProposals.medium.length > 0 && (
                  <div className="space-y-2">
                    <h3 className="text-xs font-bold text-yellow-400 uppercase tracking-wider flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-yellow-500" />
                      中风险 - 建议审查 ({groupedProposals.medium.length})
                    </h3>
                    {groupedProposals.medium.map(proposal => (
                      <ProposalCard
                        key={proposal.id}
                        proposal={proposal}
                        isExpanded={expandedProposalId === proposal.id}
                        isSelected={selectedProposalIds.has(proposal.id)}
                        onToggleExpand={() => setExpandedProposalId(expandedProposalId === proposal.id ? null : proposal.id)}
                        onToggleSelect={() => toggleProposalSelection(proposal.id)}
                        onAccept={() => onAcceptProposal?.(proposal)}
                        onDismiss={() => onDismissProposal?.(proposal.id)}
                      />
                    ))}
                  </div>
                )}

                {/* High Risk Group */}
                {groupedProposals.high.length > 0 && (
                  <div className="space-y-2">
                    <h3 className="text-xs font-bold text-red-400 uppercase tracking-wider flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-red-500" />
                      高风险 - 需要手动审查 ({groupedProposals.high.length})
                    </h3>
                    {groupedProposals.high.map(proposal => (
                      <ProposalCard
                        key={proposal.id}
                        proposal={proposal}
                        isExpanded={expandedProposalId === proposal.id}
                        isSelected={selectedProposalIds.has(proposal.id)}
                        onToggleExpand={() => setExpandedProposalId(expandedProposalId === proposal.id ? null : proposal.id)}
                        onToggleSelect={() => toggleProposalSelection(proposal.id)}
                        onAccept={() => onAcceptProposal?.(proposal)}
                        onDismiss={() => onDismissProposal?.(proposal.id)}
                      />
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {activeAssetId ? (
              (() => {
                  const asset = assets.find(a => a.id === activeAssetId);
                  if (!asset) return <div>Asset not found</div>;
                  
                  return (
                      <div className="flex-1 overflow-y-auto custom-scrollbar p-8">
                         {isEditing && editForm ? (
                             <div className="max-w-2xl mx-auto space-y-6">
                                <h3 className="text-lg font-bold text-white mb-6">编辑资产</h3>
                                <div className="grid grid-cols-2 gap-4">
                                    <div className="space-y-1">
                                        <label className="text-[10px] font-bold text-gray-500 uppercase">名称</label>
                                        <input 
                                          value={editForm.name}
                                          onChange={e => setEditForm({...editForm, name: e.target.value})}
                                          className="w-full bg-[#181818] border border-[#333] rounded px-3 py-2 text-sm text-white focus:border-blue-500 outline-none"
                                        />
                                    </div>
                                    <div className="space-y-1">
                                        <label className="text-[10px] font-bold text-gray-500 uppercase">类型</label>
                                        <select 
                                          value={editForm.type}
                                          onChange={e => setEditForm({...editForm, type: e.target.value as any})}
                                          className="w-full bg-[#181818] border border-[#333] rounded px-3 py-2 text-sm text-white focus:border-blue-500 outline-none"
                                        >
                                            <option value="character">角色</option>
                                            <option value="scene">场景</option>
                                            <option value="item">道具</option>
                                        </select>
                                    </div>
                                </div>
                                <div className="space-y-1">
                                    <label className="text-[10px] font-bold text-gray-500 uppercase">描述 (中文)</label>
                                    <textarea 
                                        value={editForm.description}
                                        onChange={e => setEditForm({...editForm, description: e.target.value})}
                                        className="w-full h-24 bg-[#181818] border border-[#333] rounded px-3 py-2 text-sm text-white focus:border-blue-500 outline-none resize-none"
                                    />
                                </div>
                                <div className="space-y-1">
                                    <label className="text-[10px] font-bold text-gray-500 uppercase">Prompt (英文提示词)</label>
                                    <textarea 
                                        value={editForm.prompt}
                                        onChange={e => setEditForm({...editForm, prompt: e.target.value})}
                                        className="w-full h-32 bg-[#181818] border border-[#333] rounded px-3 py-2 text-sm text-gray-300 focus:border-blue-500 outline-none resize-none font-mono"
                                    />
                                </div>
                                <div className="flex gap-3 justify-end pt-4">
                                    <button onClick={() => setIsEditing(false)} className="px-4 py-2 text-xs text-gray-400 hover:text-white">取消</button>
                                    <button onClick={handleSaveEdit} className="px-6 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded text-xs font-bold">保存</button>
                                </div>
                             </div>
                         ) : (
                             <div className="max-w-3xl mx-auto space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-300">
                                 {/* Header */}
                                 <div className="flex justify-between items-start">
                                     <div>
                                         <h1 className="text-3xl font-bold text-white mb-2">{asset.name}</h1>
                                         <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${asset.type === 'character' ? 'bg-blue-900/30 text-blue-300' : 'bg-gray-800 text-gray-400'}`}>
                                            {asset.type}
                                         </span>
                                     </div>
                                     <div className="flex gap-2">
                                         <button onClick={() => handleEditClick(asset)} className="p-2 bg-[#252525] border border-white/10 rounded hover:text-blue-400 transition-colors">
                                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                                         </button>
                                         <button onClick={() => { if(window.confirm('Confirm delete?')) onDeleteAsset(asset.id); }} className="p-2 bg-[#252525] border border-white/10 rounded hover:text-red-400 transition-colors">
                                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                                         </button>
                                     </div>
                                 </div>

                                 <div className="grid grid-cols-[300px_1fr] gap-8">
                                     {/* Left: Image Area */}
                                     <div className="space-y-4">
                                        <div
                                          className={`aspect-square bg-[#111] rounded-xl border border-white/10 overflow-hidden relative group ${assetImageUrls[asset.id] ? 'cursor-pointer hover:border-white/20' : ''}`}
                                          onClick={() => assetImageUrls[asset.id] && setPreviewUrl(assetImageUrls[asset.id])}
                                        >
                                             {assetImageUrls[asset.id] ? (
                                                <img src={assetImageUrls[asset.id]} alt={asset.name} className="w-full h-full object-cover" />
                                            ) : (
                                                <div className="w-full h-full flex flex-col items-center justify-center text-gray-600 gap-2">
                                                     <span className="text-4xl">🖼️</span>
                                                     <span className="text-xs">暂无画像</span>
                                                 </div>
                                             )}
                                             
                                             {/* Gen Button Overlay */}
                                             <div className="absolute inset-x-4 bottom-4">
                                                 <button 
                                                  onClick={(e) => { e.stopPropagation(); onGenerateImage(asset.id); }}
                                                   disabled={generatingItemIds.has(asset.id)}
                                                   className="w-full py-3 bg-blue-600/90 hover:bg-blue-500 backdrop-blur-sm text-white rounded-lg font-bold text-xs shadow-lg flex items-center justify-center gap-2 transition-all"
                                                 >
                                                   {generatingItemIds.has(asset.id) ? (
                                                       <><span className="w-3 h-3 border-2 border-white/50 border-t-white rounded-full animate-spin"></span> 生成中...</>
                                                   ) : (
                                                       <>✨ {asset.imagePath ? '重新生成' : '生成画像'}</>
                                                   )}
                                                 </button>
                                             </div>
                                            {assetImageUrls[asset.id] && (
                                              <div className="absolute inset-0 bg-black/0 group-hover:bg-black/25 transition-colors pointer-events-none">
                                                <div className="absolute bottom-16 left-1/2 -translate-x-1/2 px-3 py-1 rounded-full bg-black/60 text-white text-[11px] opacity-0 group-hover:opacity-100 transition-opacity">
                                                  🔍 点击放大
                                                </div>
                                              </div>
                                            )}
                                         </div>

                                         {/* History */}
                                         {historyImageUrls[asset.id]?.length > 0 && (
                                             <div>
                                                 <label className="text-[10px] font-bold text-gray-500 uppercase mb-2 block">历史版本</label>
                                                 <div className="grid grid-cols-4 gap-2">
                                                     {historyImageUrls[asset.id].map((url, idx) => (
                                                         <div 
                                                            key={idx} 
                                                            onClick={() => onSelectHistoryImage(asset.id, asset.imageHistory?.[idx] || url)}
                                                            className={`aspect-square bg-[#222] rounded border overflow-hidden cursor-pointer hover:border-blue-500 ${asset.imageHistory?.[idx] === asset.imagePath ? 'border-blue-500 ring-1 ring-blue-500/30' : 'border-white/10'}`}
                                                         >
                                                             <img src={url} className="w-full h-full object-cover" />
                                                         </div>
                                                     ))}
                                                 </div>
                                             </div>
                                         )}
                                     </div>

                                     {/* Right: Info Area */}
                                     <div className="space-y-6">
                                         <div>
                                             <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">详细设定</h3>
                                             <p className="text-sm text-gray-300 leading-relaxed bg-[#181818] p-4 rounded-xl border border-white/5">
                                                 {asset.description || "暂无描述"}
                                             </p>
                                         </div>
                                         <div>
                                             <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Prompt (AI指令)</h3>
                                             <div className="text-xs text-gray-400 font-mono bg-[#181818] p-4 rounded-xl border border-white/5 break-words">
                                                 {asset.prompt || "暂无 Prompt"}
                                             </div>
                                         </div>
                                         {asset.attributes && (
                                             <div>
                                                 <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">属性表</h3>
                                                 <div className="grid grid-cols-2 gap-2">
                                                     {Object.entries(asset.attributes).map(([key, val]) => (
                                                         <div key={key} className="bg-[#181818] p-2 rounded border border-white/5 flex flex-col">
                                                             <span className="text-[9px] text-gray-500 uppercase">{key}</span>
                                                             <span className="text-xs text-gray-300">{val}</span>
                                                         </div>
                                                     ))}
                                                 </div>
                                             </div>
                                         )}
                                     </div>
                                 </div>
                             </div>
                         )}
                      </div>
                  );
              })()
          ) : (
              <div className="flex-1 flex flex-col items-center justify-center text-gray-600">
                  <span className="text-4xl mb-4 opacity-30">📂</span>
                  <p className="text-sm">请选择或新建一个资产</p>
              </div>
          )}
          {previewUrl && createPortal(
            <div
              className="fixed inset-0 z-[100] bg-black/90 flex items-center justify-center p-6"
              onClick={() => setPreviewUrl(null)}
            >
              <img src={previewUrl} className="max-w-[90vw] max-h-[90vh] object-contain rounded-lg shadow-2xl" />
              <button
                className="absolute top-6 right-6 px-3 py-1.5 rounded bg-white/10 text-white text-xs border border-white/20 hover:bg-white/20 transition-colors"
                onClick={(e) => { e.stopPropagation(); setPreviewUrl(null); }}
              >
                ✕ 关闭
              </button>
            </div>,
            document.body
          )}
      </div>
    </div>
  );
};