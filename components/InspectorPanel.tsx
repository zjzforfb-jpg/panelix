import React from 'react';
import { AlignerReport, BreakdownReport, PipelineStatus, NovelStyle } from '../types';

// Checkpoint 名称映射（英文 → 中文）
const CHECKPOINT_LABELS: Record<string, string> = {
  plot_fidelity: '剧情还原',
  pacing_control: '节奏控制',
  visual_impact: '视觉冲击',
  format_compliance: '格式规范',
};

// Issue Type 映射（英文 → 中文）
const ISSUE_TYPE_LABELS: Record<string, string> = {
  // 剧本质量报告的 issue types
  'Pacing_Too_Slow': '节奏拖沓',
  'Too_Much_Thought': '心理描写过多',
  'Low_Conflict': '冲突不足',
  'Format_Error': '格式错误',
  'Logic_Loop': '逻辑矛盾',
  'Visual_Style': '视觉风格问题',
  'Character_OOC': '角色行为失调',
  // 剧情质量报告的 issue types
  'Conflict_Intensity': '冲突强度',
  'Hook_Density': '钩子密度',
  'Split_Rationality': '拆分合理性',
  'Compression_Strategy': '压缩策略',
  'Original_Fidelity': '原著还原度',
  'Methodology': '方法论问题',
};

// 辅助函数：将 issue_type 翻译为中文
const translateIssueType = (type: string): string => {
  return ISSUE_TYPE_LABELS[type] || type.replace(/_/g, ' ');
};

// 辅助函数：将 checkpoint key 翻译为中文
const translateCheckpoint = (key: string): string => {
  return CHECKPOINT_LABELS[key] || key.replace(/_/g, ' ');
};

interface InspectorPanelProps {
  report: AlignerReport | null;
  breakdownReport: BreakdownReport | null;
  pipelineStatus: PipelineStatus;
  onAcceptSuggestion: (panelId: number, suggestion: string) => void;
  onRevertFix: (panelId: number) => void;
  onRunQA: () => void;
  onRevertBreakdownIssue: (index: number) => void;
  activeStyle: NovelStyle | null;
  onOpenStyleManager: () => void;
  onInspectIssue: (panelId: number) => void;
}

export const InspectorPanel: React.FC<InspectorPanelProps> = ({
  report,
  breakdownReport,
  pipelineStatus,
  onAcceptSuggestion,
  onRevertFix,
  onRunQA,
  onRevertBreakdownIssue,
  activeStyle,
  onOpenStyleManager,
  onInspectIssue
}) => {
  return (
    <div className="flex flex-col h-full bg-[#181818] overflow-hidden">
      {/* Style Header */}
      <div className="p-4 border-b border-white/5 bg-[#202020]">
          <div className="flex justify-between items-center mb-2">
              <h3 className="text-xs font-bold text-gray-400 uppercase tracking-widest">艺术风格 (Art Style)</h3>
              <button onClick={onOpenStyleManager} className="text-[10px] text-blue-400 hover:text-white transition-colors">管理</button>
          </div>
          {activeStyle ? (
             <div className="bg-blue-900/20 border border-blue-500/30 rounded p-2 flex items-center gap-2">
                 <div className="w-2 h-2 rounded-full" style={{ backgroundColor: activeStyle.previewColor || '#3b82f6' }}></div>
                 <span className="text-xs font-bold text-blue-200 truncate">{activeStyle.name}</span>
             </div>
          ) : (
             <div className="bg-[#111] border border-white/5 rounded p-2 text-xs text-gray-500 text-center">默认通用风格</div>
          )}
      </div>

      <div className="flex-1 overflow-y-auto custom-scrollbar p-4 space-y-6">
          {/* Breakdown Report Section */}
          <div>
              <div className="flex justify-between items-center mb-3">
                  <h3 className="text-xs font-bold text-purple-300 uppercase tracking-widest">剧情质量报告</h3>
                  <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${breakdownReport ? (breakdownReport.score >= 80 ? 'bg-green-900 text-green-300' : 'bg-yellow-900 text-yellow-300') : 'bg-gray-800 text-gray-500'}`}>
                      {breakdownReport ? `评分: ${breakdownReport.score}` : 'N/A'}
                  </span>
              </div>
              
              {breakdownReport && breakdownReport.issues && breakdownReport.issues.length > 0 ? (
                  <div className="space-y-3">
                      {breakdownReport.issues.map((issue, idx) => (
                          <div key={idx} className={`relative border rounded-xl overflow-hidden transition-all ${issue.is_fixed ? 'bg-emerald-900/10 border-emerald-500/20' : 'bg-purple-900/10 border-purple-500/20'}`}>
                              <div className={`h-1 w-full ${issue.is_fixed ? 'bg-emerald-500' : 'bg-purple-500'}`}></div>
                              <div className="p-3">
                                  <div className="flex justify-between items-start mb-1">
                                      <span className="text-[9px] font-bold uppercase tracking-wider text-gray-500">{translateIssueType(issue.issue_type)}</span>
                                      {issue.is_fixed && (
                                          <button onClick={() => onRevertBreakdownIssue(idx)} className="text-[9px] text-red-400 hover:underline">撤销</button>
                                      )}
                                  </div>
                                  <p className="text-xs text-gray-300 mb-2">{issue.description}</p>
                                  {issue.is_fixed && (
                                      <div className="text-[10px] bg-emerald-900/20 text-emerald-200 p-2 rounded border border-emerald-500/10">
                                          已自动修复: {typeof issue.suggestion === 'string' ? issue.suggestion.substring(0, 60) + '...' : 'Applied'}
                                      </div>
                                  )}
                              </div>
                          </div>
                      ))}
                  </div>
              ) : (
                  <div className="text-xs text-gray-600 text-center py-4 bg-[#151515] rounded-lg border border-white/5">未发现剧情逻辑问题。</div>
              )}
          </div>

          {/* Script Report Section */}
          <div>
              <div className="flex justify-between items-center mb-3">
                  <h3 className="text-xs font-bold text-cyan-300 uppercase tracking-widest">剧本质量报告</h3>
                  <button
                    onClick={onRunQA}
                    className="text-[10px] bg-cyan-900/30 hover:bg-cyan-800/40 border border-cyan-500/20 text-cyan-100 px-2 py-0.5 rounded transition-colors"
                  >
                    运行检查并自动修复
                  </button>
              </div>

              {report ? (
                  <div className="space-y-3">
                      <div className="grid grid-cols-2 gap-2 mb-2">
                          {report.checkpoints && Object.entries(report.checkpoints).map(([k, v]) => (
                              <div key={k} className="flex items-center gap-2 text-[10px] text-gray-400 bg-[#222] p-1.5 rounded">
                                  <span className={v ? 'text-green-500' : 'text-red-500'}>{v ? '✔' : '✘'}</span>
                                  <span>{translateCheckpoint(k)}</span>
                              </div>
                          ))}
                      </div>

                      {report.critical_issues && report.critical_issues.length > 0 ? (
                           report.critical_issues.map((issue, idx) => (
                               <div
                                 key={idx}
                                 className={`relative rounded-xl border overflow-hidden ${
                                   issue.is_fixed ? 'bg-emerald-900/10 border-emerald-500/20' : 'bg-cyan-900/10 border-cyan-500/20'
                                 }`}
                               >
                                   <div className={`h-1 w-full ${issue.is_fixed ? 'bg-emerald-500' : 'bg-cyan-500'}`}></div>
                                   <div className="p-3">
                                   <div className="flex justify-between items-start mb-1">
                                       <span className="text-[10px] font-bold text-cyan-200">{translateIssueType(issue.issue_type)}</span>
                                       <button onClick={() => onInspectIssue(issue.panel_id)} className="text-[9px] bg-[#333] px-1.5 py-0.5 rounded text-white hover:bg-blue-600">
                                          分镜 #{issue.panel_id}
                                       </button>
                                   </div>
                                   <p className="text-xs text-gray-300 mb-2">{issue.description}</p>
                                   
                                   {/* Show before/after when auto-fixed */}
                                   {issue.is_fixed && (
                                      <div className="mt-2 space-y-2">
                                          <div className="text-[10px] text-gray-400">原内容（已保留）</div>
                                          <pre className="text-[10px] bg-black/20 border border-white/5 rounded p-2 text-gray-300 whitespace-pre-wrap max-h-24 overflow-y-auto custom-scrollbar">
{issue.original_visual || ''}
                                          </pre>
                                          <div className="text-[10px] text-emerald-300">替换后（已应用）</div>
                                          <pre className="text-[10px] bg-emerald-900/10 border border-emerald-500/10 rounded p-2 text-emerald-100 whitespace-pre-wrap max-h-24 overflow-y-auto custom-scrollbar">
{issue.suggestion || ''}
                                          </pre>
                                      </div>
                                   )}
                                   
                                   {!issue.is_fixed ? (
                                       <button
                                          onClick={() => onAcceptSuggestion(issue.panel_id, issue.suggestion)}
                                          className="w-full py-1.5 bg-cyan-600 hover:bg-cyan-500 text-white text-[10px] font-bold rounded"
                                       >
                                          应用修复
                                       </button>
                                   ) : (
                                       <button
                                          onClick={() => onRevertFix(issue.panel_id)}
                                          className="mt-2 w-full py-1.5 bg-red-900/20 hover:bg-red-900/30 border border-red-500/20 text-red-200 text-[10px] font-bold rounded"
                                       >
                                          撤销本次修复
                                       </button>
                                   )}
                                   </div>
                               </div>
                           ))
                      ) : (
                          <div className="text-xs text-green-500 text-center py-4 bg-green-900/10 rounded-lg border border-green-500/20">质量检测通过！</div>
                      )}
                  </div>
              ) : (
                  <div className="text-xs text-gray-600 text-center py-4 bg-[#151515] rounded-lg border border-white/5">点击运行检查以生成报告</div>
              )}
          </div>
      </div>
    </div>
  );
};