import React, { useEffect, useState } from 'react';

export interface SaveProgressInfo {
  isOpen: boolean;
  currentItem: string;
  progress: number;        // 0-100
  totalItems: number;
  completedItems: number;
  startTime: number;
  estimatedTimeRemaining?: number;
}

interface SaveProgressModalProps {
  progressInfo: SaveProgressInfo;
  onCancel?: () => void;
}

/**
 * 保存进度模态框
 * 当保存操作预计超过3秒时显示
 */
export const SaveProgressModal: React.FC<SaveProgressModalProps> = ({
  progressInfo,
  onCancel
}) => {
  const [elapsedTime, setElapsedTime] = useState(0);

  // Update elapsed time every second
  useEffect(() => {
    if (!progressInfo.isOpen) {
      setElapsedTime(0);
      return;
    }

    const interval = setInterval(() => {
      setElapsedTime(Date.now() - progressInfo.startTime);
    }, 1000);

    return () => clearInterval(interval);
  }, [progressInfo.isOpen, progressInfo.startTime]);

  if (!progressInfo.isOpen) return null;

  // Format time as mm:ss
  const formatTime = (ms: number): string => {
    const seconds = Math.floor(ms / 1000);
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  // Calculate estimated time remaining
  const estimatedRemaining = progressInfo.progress > 0
    ? Math.round((elapsedTime / progressInfo.progress) * (100 - progressInfo.progress))
    : 0;

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-[#1a1a1a] border border-white/10 rounded-2xl shadow-2xl p-6 min-w-[420px] max-w-[500px] animate-in zoom-in-95 slide-in-from-bottom-4 duration-300">
        {/* Header */}
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 rounded-xl bg-blue-500/20 flex items-center justify-center">
            <span className="text-xl animate-pulse">💾</span>
          </div>
          <div>
            <h3 className="text-base font-bold text-white">正在保存项目</h3>
            <p className="text-xs text-gray-500">请不要关闭页面</p>
          </div>
        </div>

        {/* Current Item */}
        <div className="bg-[#222] rounded-xl p-4 mb-4 border border-white/5">
          <div className="text-[10px] text-gray-500 mb-1">当前操作</div>
          <div className="text-sm text-gray-300 truncate" title={progressInfo.currentItem}>
            {progressInfo.currentItem || '准备中...'}
          </div>
        </div>

        {/* Progress Bar */}
        <div className="mb-4">
          <div className="flex justify-between items-center mb-2">
            <span className="text-xs text-gray-400">
              进度: {progressInfo.completedItems} / {progressInfo.totalItems}
            </span>
            <span className="text-xs font-bold text-blue-400">
              {Math.round(progressInfo.progress)}%
            </span>
          </div>
          <div className="h-2 bg-[#333] rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-blue-600 to-blue-400 rounded-full transition-all duration-300 ease-out"
              style={{ width: `${progressInfo.progress}%` }}
            />
          </div>
        </div>

        {/* Time Info */}
        <div className="flex justify-between text-[10px] text-gray-500 mb-6">
          <span>已用时间: {formatTime(elapsedTime)}</span>
          {estimatedRemaining > 0 && progressInfo.progress < 100 && (
            <span>预计剩余: ~{formatTime(estimatedRemaining)}</span>
          )}
        </div>

        {/* Progress Steps (optional visualization) */}
        {progressInfo.totalItems <= 10 && progressInfo.totalItems > 1 && (
          <div className="flex gap-1 mb-6">
            {Array.from({ length: progressInfo.totalItems }).map((_, idx) => (
              <div
                key={idx}
                className={`flex-1 h-1 rounded-full transition-all duration-300 ${
                  idx < progressInfo.completedItems
                    ? 'bg-green-500'
                    : idx === progressInfo.completedItems
                    ? 'bg-blue-500 animate-pulse'
                    : 'bg-[#333]'
                }`}
              />
            ))}
          </div>
        )}

        {/* Actions */}
        <div className="flex justify-end gap-3">
          {onCancel && progressInfo.progress < 100 && (
            <button
              onClick={onCancel}
              className="px-4 py-2 text-xs font-medium text-gray-400 hover:text-white bg-[#333] hover:bg-[#444] rounded-lg transition-colors"
            >
              取消保存
            </button>
          )}
          {progressInfo.progress >= 100 && (
            <div className="flex items-center gap-2 text-green-400 text-sm">
              <span>✓</span>
              <span>保存完成</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

// Hook for managing save progress
export const useSaveProgress = () => {
  const [progressInfo, setProgressInfo] = useState<SaveProgressInfo>({
    isOpen: false,
    currentItem: '',
    progress: 0,
    totalItems: 0,
    completedItems: 0,
    startTime: 0
  });

  const startProgress = (totalItems: number) => {
    setProgressInfo({
      isOpen: true,
      currentItem: '准备中...',
      progress: 0,
      totalItems,
      completedItems: 0,
      startTime: Date.now()
    });
  };

  const updateProgress = (currentItem: string, completedItems: number) => {
    setProgressInfo(prev => ({
      ...prev,
      currentItem,
      completedItems,
      progress: prev.totalItems > 0 ? (completedItems / prev.totalItems) * 100 : 0
    }));
  };

  const completeProgress = () => {
    setProgressInfo(prev => ({
      ...prev,
      progress: 100,
      currentItem: '保存完成'
    }));

    // Auto-close after 1 second
    setTimeout(() => {
      setProgressInfo(prev => ({
        ...prev,
        isOpen: false
      }));
    }, 1000);
  };

  const cancelProgress = () => {
    setProgressInfo({
      isOpen: false,
      currentItem: '',
      progress: 0,
      totalItems: 0,
      completedItems: 0,
      startTime: 0
    });
  };

  return {
    progressInfo,
    startProgress,
    updateProgress,
    completeProgress,
    cancelProgress
  };
};

export default SaveProgressModal;


