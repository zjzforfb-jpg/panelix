/**
 * Sound Notification Service
 * 使用 Web Audio API 生成不同音调的声音提醒
 */

export type SoundType = 'asset' | 'panel' | 'video' | 'error';

interface SoundConfig {
  frequency: number;  // 频率 (Hz)
  duration: number;   // 时长 (ms)
  volume: number;     // 音量 (0-1)
}

const SOUND_PRESETS: Record<SoundType, SoundConfig> = {
  asset: { frequency: 800, duration: 200, volume: 0.3 },      // 资产：高音短促
  panel: { frequency: 600, duration: 300, volume: 0.3 },     // 分镜：中音中等
  video: { frequency: 400, duration: 500, volume: 0.4 },      // 视频：低音长音
  error: { frequency: 200, duration: 100, volume: 0.5 },      // 错误：低音短促
};

let audioContext: AudioContext | null = null;

function getAudioContext(): AudioContext | null {
  try {
    if (!audioContext) {
      audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
    }
    // 如果上下文被暂停（浏览器策略），尝试恢复
    if (audioContext.state === 'suspended') {
      audioContext.resume().catch(() => {
        // 忽略恢复失败
      });
    }
    return audioContext;
  } catch (error) {
    console.warn('AudioContext not available:', error);
    return null;
  }
}

/**
 * 播放单个音调
 */
export function playSound(type: SoundType, enabled: boolean = true, volume: number = 1.0): void {
  if (!enabled) return;
  
  const ctx = getAudioContext();
  if (!ctx) return;
  
  try {
    const config = SOUND_PRESETS[type];
    const oscillator = ctx.createOscillator();
    const gainNode = ctx.createGain();
    
    oscillator.connect(gainNode);
    gainNode.connect(ctx.destination);
    
    oscillator.frequency.value = config.frequency;
    oscillator.type = 'sine'; // 正弦波，声音更柔和
    
    const now = ctx.currentTime;
    gainNode.gain.setValueAtTime(0, now);
    gainNode.gain.linearRampToValueAtTime(config.volume * volume, now + 0.01);
    gainNode.gain.exponentialRampToValueAtTime(0.01, now + config.duration / 1000);
    
    oscillator.start(now);
    oscillator.stop(now + config.duration / 1000);
  } catch (error) {
    console.warn('Failed to play sound:', error);
  }
}

/**
 * 播放成功提示音（多音调组合，形成"叮咚"效果）
 */
export function playSuccessSound(type: 'asset' | 'panel' | 'video', enabled: boolean = true, volume: number = 1.0): void {
  if (!enabled) return;
  
  // 播放两次，形成"叮咚"效果
  playSound(type, true, volume * 0.8);
  setTimeout(() => {
    playSound(type, true, volume * 0.6);
  }, 150);
}

