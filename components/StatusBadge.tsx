import React from 'react';
import { PipelineStatus } from '../types';

interface StatusBadgeProps {
  status: PipelineStatus;
}

// Adjusted colors for Dark Mode background
const statusMap: Record<PipelineStatus, { label: string; color: string; dot: string }> = {
  IDLE: { label: '就绪', color: 'bg-gray-800 text-gray-400 border-gray-700', dot: 'bg-gray-500' },
  SPLITTING: { label: '剧情拆解中...', color: 'bg-blue-900/30 text-blue-300 border-blue-800/50', dot: 'bg-blue-400 animate-pulse' },
  BREAKDOWN_ALIGNING: { label: '剧情质检中...', color: 'bg-cyan-900/30 text-cyan-300 border-cyan-800/50', dot: 'bg-cyan-400 animate-pulse' },
  WRITING: { label: '剧本生成中...', color: 'bg-purple-900/30 text-purple-300 border-purple-800/50', dot: 'bg-purple-400 animate-pulse' },
  ALIGNING: { label: '质量核查中...', color: 'bg-yellow-900/30 text-yellow-300 border-yellow-800/50', dot: 'bg-yellow-400 animate-pulse' },
  AUTO_FIXING: { label: '自动修复中...', color: 'bg-orange-900/30 text-orange-300 border-orange-800/50', dot: 'bg-orange-400 animate-bounce' },
  SUCCESS: { label: '生成成功', color: 'bg-green-900/30 text-green-300 border-green-800/50', dot: 'bg-green-400' },
  NEEDS_REVIEW: { label: '需人工介入', color: 'bg-red-900/30 text-red-300 border-red-800/50', dot: 'bg-red-500' },
  ERROR: { label: '系统错误', color: 'bg-red-900/50 text-red-200 border-red-800', dot: 'bg-red-600' },
  ARCHIVING: { label: '剧情归档中...', color: 'bg-indigo-900/30 text-indigo-300 border-indigo-800/50', dot: 'bg-indigo-400 animate-pulse' },
  // Fix: Added missing GENERATING_IMAGE status
  GENERATING_IMAGE: { label: '正在绘图...', color: 'bg-pink-900/30 text-pink-300 border-pink-800/50', dot: 'bg-pink-400 animate-pulse' },
};

export const StatusBadge: React.FC<StatusBadgeProps> = ({ status }) => {
  const config = statusMap[status];

  return (
    <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium border ${config.color}`}>
      <span className={`w-2 h-2 rounded-full ${config.dot}`} />
      {config.label}
    </div>
  );
};