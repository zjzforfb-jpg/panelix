import React, { useEffect, useState, useCallback, useRef } from 'react';
import { MessageLog } from '../types';

interface ToastProps {
  log: MessageLog;
  onClose: (id: string) => void;
}

const TOAST_DURATION = 3000; // 3 seconds

export const Toast: React.FC<ToastProps> = ({ log, onClose }) => {
  const [visible, setVisible] = useState(false);
  const [isHovered, setIsHovered] = useState(false);
  const [progress, setProgress] = useState(100);
  const startTimeRef = useRef<number>(Date.now());
  const pausedTimeRef = useRef<number>(0);
  const animationFrameRef = useRef<number | null>(null);

  const handleClose = useCallback(() => {
    setVisible(false);
    setTimeout(() => onClose(log.id), 200);
  }, [onClose, log.id]);

  // Entry animation
  useEffect(() => {
    requestAnimationFrame(() => setVisible(true));
    startTimeRef.current = Date.now();
  }, []);

  // Progress animation using RAF for smooth animation
  useEffect(() => {
    if (isHovered) {
      pausedTimeRef.current = Date.now() - startTimeRef.current;
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
      return;
    }

    startTimeRef.current = Date.now() - pausedTimeRef.current;

    const animate = () => {
      const elapsed = Date.now() - startTimeRef.current;
      const remaining = Math.max(0, 100 - (elapsed / TOAST_DURATION) * 100);
      
      if (remaining <= 0) {
        handleClose();
        return;
      }
      
      setProgress(remaining);
      animationFrameRef.current = requestAnimationFrame(animate);
    };

    animationFrameRef.current = requestAnimationFrame(animate);

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [isHovered, handleClose]);

  const getStyles = () => {
    switch (log.type) {
      case 'error':
        return {
          bg: 'bg-red-950/95',
          border: 'border-red-800/50',
          icon: '✕',
          iconBg: 'bg-red-500/30 text-red-400',
          progress: 'bg-red-500'
        };
      case 'success':
        return {
          bg: 'bg-green-950/95',
          border: 'border-green-800/50',
          icon: '✓',
          iconBg: 'bg-green-500/30 text-green-400',
          progress: 'bg-green-500'
        };
      case 'warning':
        return {
          bg: 'bg-yellow-950/95',
          border: 'border-yellow-800/50',
          icon: '!',
          iconBg: 'bg-yellow-500/30 text-yellow-400',
          progress: 'bg-yellow-500'
        };
      default:
        return {
          bg: 'bg-[#1a1a1a]/95',
          border: 'border-white/10',
          icon: 'i',
          iconBg: 'bg-blue-500/30 text-blue-400',
          progress: 'bg-blue-500'
        };
    }
  };

  const styles = getStyles();
  const timeStr = new Date(log.timestamp).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });

  return (
    <div
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      className={`
        relative w-[260px] rounded-lg border backdrop-blur-md overflow-hidden pointer-events-auto
        transition-all duration-200 ease-out transform shadow-lg
        ${visible ? 'opacity-100 translate-x-0' : 'opacity-0 translate-x-4'}
        ${styles.bg} ${styles.border}
      `}
    >
      {/* Content */}
      <div className="px-2.5 py-2 flex items-start gap-2">
        {/* Icon */}
        <div className={`w-5 h-5 ${styles.iconBg} rounded flex items-center justify-center shrink-0 text-[10px] font-bold`}>
          {styles.icon}
        </div>
        
        {/* Text */}
        <div className="flex-1 min-w-0">
          <div className="text-[11px] font-medium leading-snug text-white/90 line-clamp-2">
            {log.text}
          </div>
          <div className="text-[9px] text-gray-500 mt-0.5 flex items-center gap-1.5">
            <span>{timeStr}</span>
            {isHovered && (
              <span className="text-yellow-500/80 flex items-center gap-0.5">
                <span className="w-0.5 h-0.5 bg-yellow-500 rounded-full animate-pulse" />
                暂停
              </span>
            )}
          </div>
        </div>
        
        {/* Close Button */}
        <button
          onClick={handleClose}
          className="w-5 h-5 rounded flex items-center justify-center text-gray-500 hover:text-white hover:bg-white/10 shrink-0 transition-colors -mr-0.5"
        >
          <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
      
      {/* Progress Bar */}
      <div className="h-[2px] bg-black/30">
        <div 
          className={`h-full ${styles.progress} transition-none`}
          style={{ width: `${progress}%` }}
        />
      </div>
    </div>
  );
};
