import React, { useState, useEffect, useMemo } from 'react';
import { PipelineStatus, GenerationTask, MessageLog } from '../types';
import { SaveStatus, formatTimeAgo } from '../services/saveCoordinator';

interface StatusBarProps {
  status: PipelineStatus;
  generatingItemIds: Set<string>;
  tasks?: GenerationTask[];
  saveStatus?: SaveStatus;
  activeModelLabel?: string;
  allModelsHint?: string;
  // Operation logs (moved from App.tsx floating button)
  logs?: MessageLog[];
  onClearLogs?: () => void;
}

const statusMap: Record<PipelineStatus, { label: string; icon: string }> = {
  IDLE: { label: '就绪', icon: '✅' },
  SPLITTING: { label: '正在拆解剧情...', icon: '🧩' },
  BREAKDOWN_ALIGNING: { label: '正在质检剧情...', icon: '⚖️' },
  WRITING: { label: '正在生成剧本...', icon: '✍️' },
  ALIGNING: { label: '正在核查剧本...', icon: '🔍' },
  AUTO_FIXING: { label: '正在自动修复...', icon: '🔧' },
  SUCCESS: { label: '任务完成', icon: '🎉' },
  NEEDS_REVIEW: { label: '需人工介入', icon: '⚠️' },
  ERROR: { label: '发生错误', icon: '❌' },
  ARCHIVING: { label: '正在归档记忆...', icon: '📚' },
  GENERATING_IMAGE: { label: '正在生成图像...', icon: '🎨' },
};

const EMPTY_TASKS: GenerationTask[] = [];

export const StatusBar: React.FC<StatusBarProps> = ({ 
  status, 
  generatingItemIds, 
  tasks, 
  saveStatus, 
  activeModelLabel, 
  allModelsHint,
  logs = [],
  onClearLogs,
}) => {
  const config = statusMap[status];
  const isBusy = status !== 'IDLE' && status !== 'SUCCESS' && status !== 'ERROR' && status !== 'NEEDS_REVIEW';
  const safeTasks = tasks ?? EMPTY_TASKS;
  
  // Popover states (mutually exclusive)
  const [showHistory, setShowHistory] = useState(false);      // 生成记录
  const [showOpHistory, setShowOpHistory] = useState(false);  // 操作历史
  const [processingCount, setProcessingCount] = useState(0);

  useEffect(() => {
      const next = safeTasks.filter(t => t.status === 'processing').length;
      setProcessingCount(prev => (prev === next ? prev : next));
  }, [safeTasks]);

  // Helper for wait time
  const getWaitTime = (start: number, end?: number) => {
      const duration = (end || Date.now()) - start;
      const seconds = Math.floor(duration / 1000);
      const minutes = Math.floor(seconds / 60);
      const secs = seconds % 60;
      return `${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  // Re-render timer every second if open and processing
  const [tick, setTick] = useState(0);
  useEffect(() => {
      if (!showHistory) return;
      const timer = setInterval(() => setTick(t => t + 1), 1000);
      return () => clearInterval(timer);
  }, [showHistory]);

  // Update save status display every second for relative time
  const [saveTick, setSaveTick] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => setSaveTick(t => t + 1), 1000);
    return () => clearInterval(timer);
  }, []);

  // Compute save status display
  const saveStatusDisplay = useMemo(() => {
    if (!saveStatus) return null;
    
    if (saveStatus.isSaving) {
      return {
        icon: '●',
        text: '正在保存...',
        color: 'text-yellow-400',
        bgColor: 'bg-yellow-500/10'
      };
    }
    
    if (saveStatus.lastError) {
      return {
        icon: '✗',
        text: `保存失败`,
        color: 'text-red-400',
        bgColor: 'bg-red-500/10',
        tooltip: saveStatus.lastError
      };
    }
    
    if (saveStatus.partialFailure) {
      return {
        icon: '⚠',
        text: `部分保存 · ${formatTimeAgo(saveStatus.lastSavedTime)}`,
        color: 'text-orange-400',
        bgColor: 'bg-orange-500/10'
      };
    }
    
    if (saveStatus.lastSavedTime) {
      return {
        icon: '✓',
        text: `已保存 · ${formatTimeAgo(saveStatus.lastSavedTime)}`,
        color: 'text-green-400',
        bgColor: 'bg-green-500/10'
      };
    }
    
    return {
      icon: '○',
      text: '未保存',
      color: 'text-gray-500',
      bgColor: 'bg-gray-500/10'
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [saveStatus, saveTick]);

  // Toggle handlers with mutual exclusion
  const toggleHistory = () => {
    setShowHistory(prev => !prev);
    setShowOpHistory(false);  // Close the other
  };

  const toggleOpHistory = () => {
    setShowOpHistory(prev => !prev);
    setShowHistory(false);  // Close the other
  };

  return (
    <div className="h-9 bg-[#161616] border-t border-white/5 flex items-center justify-between px-4 text-[10px] text-gray-400 select-none shrink-0 relative z-[60]">
      
      {/* Left: Global Status */}
      <div className="flex items-center gap-3">
        <span className="flex items-center gap-1.5 font-medium text-gray-300">
          <span>{config.icon}</span>
          <span>{config.label}</span>
        </span>
        {isBusy && (
           <div className="flex gap-1 items-center">
             <span className="w-1 h-1 bg-blue-500 rounded-full animate-bounce [animation-delay:0ms]" />
             <span className="w-1 h-1 bg-blue-500 rounded-full animate-bounce [animation-delay:100ms]" />
             <span className="w-1 h-1 bg-blue-500 rounded-full animate-bounce [animation-delay:200ms]" />
           </div>
        )}
      </div>
      
      {/* Right: Save Status + Buttons + Version */}
      <div className="flex items-center gap-3">
         {/* Save Status Indicator */}
         {saveStatusDisplay && (
           <div 
             className={`flex items-center gap-1.5 px-2 py-0.5 rounded ${saveStatusDisplay.bgColor} ${saveStatusDisplay.color} transition-all`}
             title={saveStatusDisplay.tooltip || saveStatusDisplay.text}
           >
             <span className={saveStatus?.isSaving ? 'animate-pulse' : ''}>{saveStatusDisplay.icon}</span>
             <span>{saveStatusDisplay.text}</span>
             {saveStatus?.pendingChanges && saveStatus.pendingChanges > 0 && (
               <span className="text-[9px] opacity-60">({saveStatus.pendingChanges}项)</span>
             )}
           </div>
         )}

         {/* 生成记录 Button */}
         <button 
           onClick={toggleHistory}
           className={`flex items-center gap-1.5 px-2 py-0.5 rounded transition-all border ${
             showHistory
               ? 'bg-[#2C2C2E] text-white border-white/10'
               : 'border-transparent hover:bg-[#2C2C2E] hover:text-gray-200'
           }`}
           title="查看生成记录"
         >
           <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-3.5 h-3.5">
             <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
           </svg>
           <span className="hidden sm:inline">生成记录</span>
           {processingCount > 0 && (
             <span className="bg-green-600/20 text-green-400 border border-green-500/30 px-1.5 rounded text-[9px] font-bold">
               {processingCount}
             </span>
           )}
         </button>

         {/* 操作历史 Button */}
         <button 
           onClick={toggleOpHistory}
           className={`flex items-center gap-1.5 px-2 py-0.5 rounded transition-all border ${
             showOpHistory
               ? 'bg-[#2C2C2E] text-white border-white/10'
               : 'border-transparent hover:bg-[#2C2C2E] hover:text-gray-200'
           }`}
           title="查看操作历史"
         >
           <span>📋</span>
           <span className="hidden sm:inline">操作历史</span>
           {logs.length > 0 && (
             <span className="bg-blue-600/20 text-blue-300 border border-blue-500/30 px-1.5 rounded text-[9px] font-bold">
               {logs.length}
             </span>
           )}
         </button>
         
         {/* Keyboard Shortcut Hint */}
         <span className="text-gray-600 hidden lg:inline" title="按 Ctrl+S 或 Cmd+S 手动保存">
           ⌘S
         </span>
         
         <span className="text-gray-600">|</span>

         {/* Model Display (pill style) */}
         <span 
           title={allModelsHint || undefined}
           className="px-2 py-0.5 rounded bg-white/5 border border-white/5 text-gray-300"
         >
           {activeModelLabel || '—'}
         </span>

         <span className="text-gray-600">v1.2.0</span>
      </div>

      {/* --- 生成记录 Popover --- */}
      {showHistory && (
          <div className="absolute bottom-10 right-4 w-[800px] bg-[#222224]/95 backdrop-blur-xl border border-white/10 rounded-xl shadow-2xl overflow-hidden flex flex-col animate-in slide-in-from-bottom-2 duration-200">
              {/* Header */}
              <div className="h-10 px-4 border-b border-white/5 flex items-center justify-between bg-[#2C2C2E]/80">
                  <h3 className="font-bold text-gray-200 text-xs">图片生成队列</h3>
                  <button onClick={() => setShowHistory(false)} className="text-gray-500 hover:text-white">✕</button>
              </div>
              
              {/* Table */}
              <div className="max-h-[300px] overflow-y-auto custom-scrollbar p-1">
                  <table className="w-full text-left border-collapse">
                      <thead className="bg-[#1C1C1E] sticky top-0 z-10 text-gray-500">
                          <tr>
                              <th className="p-2 font-medium w-24 pl-4">编号</th>
                              <th className="p-2 font-medium">所属分镜/素材</th>
                              <th className="p-2 font-medium w-16">类型</th>
                              <th className="p-2 font-medium w-32">模型</th>
                              <th className="p-2 font-medium w-20">创建时间</th>
                              <th className="p-2 font-medium w-20">等待时间</th>
                              <th className="p-2 font-medium w-20">状态</th>
                          </tr>
                      </thead>
                      <tbody className="text-gray-300">
                          {safeTasks.length === 0 ? (
                              <tr>
                                  <td colSpan={7} className="p-8 text-center text-gray-600">暂无生成记录</td>
                              </tr>
                          ) : (
                              safeTasks.map(task => (
                                  <tr key={task.id} className="border-b border-white/5 hover:bg-white/5 transition-colors">
                                      <td className="p-2 pl-4 font-mono text-gray-500">{task.id.slice(-8)}</td>
                                      <td className="p-2 truncate max-w-[200px]" title={task.source}>{task.source}</td>
                                      <td className="p-2">{task.type === 'image' ? '图片' : '文本'}</td>
                                      <td className="p-2 text-gray-500 truncate max-w-[120px]" title={task.model}>{task.model.split('-')[0]}..</td>
                                      <td className="p-2 text-gray-500">{new Date(task.createdAt).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit', hour12: false})}</td>
                                      <td className="p-2 font-mono text-gray-400">{getWaitTime(task.createdAt, task.finishedAt)}</td>
                                      <td className="p-2">
                                          {task.status === 'processing' && <span className="text-green-400 animate-pulse">处理中</span>}
                                          {task.status === 'success' && <span className="text-gray-500">完成</span>}
                                          {task.status === 'error' && <span className="text-red-400">失败</span>}
                                          {task.status === 'pending' && <span className="text-gray-600">排队</span>}
                                      </td>
                                  </tr>
                              ))
                          )}
                      </tbody>
                  </table>
              </div>
          </div>
      )}

      {/* --- 操作历史 Popover --- */}
      {showOpHistory && (
        <div className="absolute bottom-10 right-4 w-[480px] bg-[#222224]/95 backdrop-blur-xl border border-white/10 rounded-xl shadow-2xl overflow-hidden animate-in slide-in-from-bottom-2 duration-200">
          {/* Header */}
          <div className="h-10 px-4 border-b border-white/5 flex items-center justify-between bg-[#2C2C2E]/80">
            <h3 className="font-bold text-gray-200 text-xs">操作历史</h3>
            <div className="flex items-center gap-2">
              {logs.length > 0 && (
                <button
                  onClick={() => onClearLogs?.()}
                  className="text-[10px] text-gray-400 hover:text-red-300 transition-colors"
                >
                  清空
                </button>
              )}
              <button
                onClick={() => setShowOpHistory(false)}
                className="text-gray-500 hover:text-white"
              >
                ✕
              </button>
            </div>
          </div>

          {/* Log List */}
          <div className="max-h-[320px] overflow-y-auto custom-scrollbar p-2 space-y-1">
            {logs.length === 0 ? (
              <div className="p-8 text-center text-gray-600 text-xs">暂无操作记录</div>
            ) : (
              [...logs].reverse().map(log => (
                <div
                  key={log.id}
                  className={`flex items-start gap-2 px-2.5 py-2 rounded text-[11px] ${
                    log.type === 'error' ? 'bg-red-500/10 text-red-300' :
                    log.type === 'warning' ? 'bg-yellow-500/10 text-yellow-300' :
                    log.type === 'success' ? 'bg-green-500/10 text-green-300' :
                    'bg-white/5 text-gray-300'
                  }`}
                >
                  <span className="shrink-0 mt-0.5">
                    {log.type === 'error' ? '❌' :
                     log.type === 'warning' ? '⚠️' :
                     log.type === 'success' ? '✓' : 'ℹ️'}
                  </span>
                  <span className="flex-1 break-words leading-relaxed">{log.text}</span>
                  <span className="shrink-0 text-[9px] text-gray-500 mt-0.5">
                    {new Date(log.timestamp).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
};
