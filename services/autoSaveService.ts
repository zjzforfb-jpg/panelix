/**
 * 防抖自动保存服务
 * 用于实现项目数据的防抖自动保存机制
 */

import { ProjectV2, Volume, PlotBreakdown, WebtoonScript, AlignerReport } from '../types';
import { 
  saveProjectMeta, 
  saveVolumeContent, 
  savePlotBreakdown, 
  saveScript, 
  saveReport 
} from './fileSystem';

// 防抖延迟时间（毫秒）
const DEBOUNCE_DELAY = 2000;

// 保存优先级
// P0: 关键操作（生成、导入）- 最高优先级
// P1: 普通编辑操作
// P2: 后台操作（资产图片）- 最低优先级
export type SavePriority = 'P0' | 'P1' | 'P2';

// 基础保存操作类型
type BaseSaveOperation = 
  | { type: 'projectMeta'; data: ProjectV2 }
  | { type: 'volumeContent'; volumeId: string; data: string }
  | { type: 'plotBreakdown'; volumeId: string; data: PlotBreakdown }
  | { type: 'script'; volumeId: string; episodeNum: number; data: WebtoonScript }
  | { type: 'report'; volumeId: string; episodeNum: number; data: AlignerReport };

// 带优先级和时间戳的保存操作类型
type SaveOperation = BaseSaveOperation & {
  priority: SavePriority;
  timestamp: number;
};

// 优先级权重映射
const PRIORITY_ORDER: Record<SavePriority, number> = {
  'P0': 0,  // 最高优先级
  'P1': 1,
  'P2': 2   // 最低优先级
};

// 保存队列
let saveQueue: SaveOperation[] = [];

// 防抖定时器ID
let debounceTimerId: number | null = null;

// 是否正在保存
let isSaving = false;

// 保存状态监听器
type SaveStatusListener = (isSaving: boolean) => void;
const saveStatusListeners: SaveStatusListener[] = [];

// 保存错误监听器
type SaveErrorListener = (error: Error) => void;
const saveErrorListeners: SaveErrorListener[] = [];

/**
 * 添加保存状态监听器
 */
export const addSaveStatusListener = (listener: SaveStatusListener) => {
  saveStatusListeners.push(listener);
};

/**
 * 移除保存状态监听器
 */
export const removeSaveStatusListener = (listener: SaveStatusListener) => {
  const index = saveStatusListeners.indexOf(listener);
  if (index !== -1) {
    saveStatusListeners.splice(index, 1);
  }
};

/**
 * 添加保存错误监听器
 */
export const addSaveErrorListener = (listener: SaveErrorListener) => {
  saveErrorListeners.push(listener);
};

/**
 * 移除保存错误监听器
 */
export const removeSaveErrorListener = (listener: SaveErrorListener) => {
  const index = saveErrorListeners.indexOf(listener);
  if (index !== -1) {
    saveErrorListeners.splice(index, 1);
  }
};

/**
 * 通知保存状态变化
 */
const notifySaveStatusChange = (saving: boolean) => {
  saveStatusListeners.forEach(listener => {
    try {
      listener(saving);
    } catch (error) {
      console.error("Error in save status listener:", error);
    }
  });
};

/**
 * 通知保存错误
 */
const notifySaveError = (error: Error) => {
  saveErrorListeners.forEach(listener => {
    try {
      listener(error);
    } catch (err) {
      console.error("Error in save error listener:", err);
    }
  });
};

/**
 * 执行保存操作
 */
const executeSaveOperation = async (operation: SaveOperation): Promise<void> => {
  try {
    switch (operation.type) {
      case 'projectMeta':
        await saveProjectMeta(operation.data);
        break;
      case 'volumeContent':
        await saveVolumeContent(operation.volumeId, operation.data);
        break;
      case 'plotBreakdown':
        await savePlotBreakdown(operation.volumeId, operation.data);
        break;
      case 'script':
        await saveScript(operation.volumeId, operation.episodeNum, operation.data);
        break;
      case 'report':
        await saveReport(operation.volumeId, operation.episodeNum, operation.data);
        break;
    }
  } catch (error) {
    console.error(`Failed to execute save operation of type ${operation.type}:`, error);
    throw error;
  }
};

/**
 * 处理保存队列
 */
const processSaveQueue = async (): Promise<void> => {
  if (isSaving || saveQueue.length === 0) {
    return;
  }

  isSaving = true;
  notifySaveStatusChange(true);

  try {
    // 复制当前队列并清空原队列
    const operationsToProcess = [...saveQueue];
    saveQueue = [];

    // 按优先级排序（P0 > P1 > P2，相同优先级按时间戳排序）
    operationsToProcess.sort((a, b) => {
      const priorityDiff = PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority];
      if (priorityDiff !== 0) return priorityDiff;
      return a.timestamp - b.timestamp;
    });

    // 按类型分组并合并操作（保留最高优先级的操作）
    const groupedOperations: Map<string, SaveOperation> = new Map();
    
    for (const operation of operationsToProcess) {
      let key: string;
      
      switch (operation.type) {
        case 'projectMeta':
          key = 'projectMeta';
          break;
        case 'volumeContent':
          key = `volumeContent:${operation.volumeId}`;
          break;
        case 'plotBreakdown':
          key = `plotBreakdown:${operation.volumeId}`;
          break;
        case 'script':
          key = `script:${operation.volumeId}:${operation.episodeNum}`;
          break;
        case 'report':
          key = `report:${operation.volumeId}:${operation.episodeNum}`;
          break;
      }
      
      // 保留优先级更高或同优先级更新的操作
      const existing = groupedOperations.get(key);
      if (!existing || 
          PRIORITY_ORDER[operation.priority] < PRIORITY_ORDER[existing.priority] ||
          (operation.priority === existing.priority && operation.timestamp > existing.timestamp)) {
        groupedOperations.set(key, operation);
      }
    }

    // 按优先级顺序执行操作
    const sortedOperations = Array.from(groupedOperations.values()).sort((a, b) => {
      const priorityDiff = PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority];
      if (priorityDiff !== 0) return priorityDiff;
      return a.timestamp - b.timestamp;
    });

    for (const operation of sortedOperations) {
      await executeSaveOperation(operation);
    }

    console.log(`Successfully saved ${sortedOperations.length} operations (by priority: P0=${sortedOperations.filter(o => o.priority === 'P0').length}, P1=${sortedOperations.filter(o => o.priority === 'P1').length}, P2=${sortedOperations.filter(o => o.priority === 'P2').length})`);
  } catch (error) {
    console.error("Error processing save queue:", error);
    notifySaveError(error as Error);
  } finally {
    isSaving = false;
    notifySaveStatusChange(false);
    
    // 如果在处理过程中有新的操作加入，再次处理
    if (saveQueue.length > 0) {
      debounceTimerId = window.setTimeout(processSaveQueue, DEBOUNCE_DELAY);
    }
  }
};

/**
 * 防抖保存
 */
const debounceSave = (): void => {
  if (debounceTimerId !== null) {
    clearTimeout(debounceTimerId);
  }
  
  debounceTimerId = window.setTimeout(() => {
    processSaveQueue();
    debounceTimerId = null;
  }, DEBOUNCE_DELAY);
};

/**
 * 添加保存操作到队列
 */
const addToSaveQueue = (baseOperation: BaseSaveOperation, priority: SavePriority = 'P1'): void => {
  const operation: SaveOperation = {
    ...baseOperation,
    priority,
    timestamp: Date.now()
  };
  saveQueue.push(operation);
  debounceSave();
};

/**
 * 保存项目元数据
 * @param priority 优先级（默认 P1）
 */
export const debouncedSaveProjectMeta = (project: ProjectV2, priority: SavePriority = 'P1'): void => {
  addToSaveQueue({ type: 'projectMeta', data: project }, priority);
};

/**
 * 保存卷内容
 * @param priority 优先级（默认 P1）
 */
export const debouncedSaveVolumeContent = (volumeId: string, content: string, priority: SavePriority = 'P1'): void => {
  addToSaveQueue({ type: 'volumeContent', volumeId, data: content }, priority);
};

/**
 * 保存剧情拆解
 * @param priority 优先级（默认 P0 - 生成操作为高优先级）
 */
export const debouncedSavePlotBreakdown = (volumeId: string, breakdown: PlotBreakdown, priority: SavePriority = 'P0'): void => {
  addToSaveQueue({ type: 'plotBreakdown', volumeId, data: breakdown }, priority);
};

/**
 * 保存剧本
 * @param priority 优先级（默认 P0 - 生成操作为高优先级）
 */
export const debouncedSaveScript = (volumeId: string, episodeNum: number, script: WebtoonScript, priority: SavePriority = 'P0'): void => {
  addToSaveQueue({ type: 'script', volumeId, episodeNum, data: script }, priority);
};

/**
 * 保存报告
 * @param priority 优先级（默认 P1）
 */
export const debouncedSaveReport = (volumeId: string, episodeNum: number, report: AlignerReport, priority: SavePriority = 'P1'): void => {
  addToSaveQueue({ type: 'report', volumeId, episodeNum, data: report }, priority);
};

/**
 * 立即执行所有待保存的操作
 */
export const flushSaveQueue = async (): Promise<void> => {
  if (debounceTimerId !== null) {
    clearTimeout(debounceTimerId);
    debounceTimerId = null;
  }
  
  await processSaveQueue();
};

/**
 * 清空保存队列（不执行保存操作）
 */
export const clearSaveQueue = (): void => {
  if (debounceTimerId !== null) {
    clearTimeout(debounceTimerId);
    debounceTimerId = null;
  }
  
  saveQueue = [];
};

/**
 * 获取当前保存状态
 */
export const getSaveStatus = (): boolean => {
  return isSaving;
};

/**
 * 获取待保存操作数量
 */
export const getPendingSaveCount = (): number => {
  return saveQueue.length;
};

/**
 * 自动保存服务类
 */
export class AutoSaveService {
  constructor(private stateManager: any) {
    // 初始化时可以存储 stateManager 引用
  }

  /**
   * 保存项目
   */
  public saveProject(projectId: string): void {
    // 使用 stateManager 获取当前项目并保存
    const project = this.stateManager.getProject();
    if (project && project.id === projectId) {
      debouncedSaveProjectMeta(project);
    }
  }

  /**
   * 保存卷内容
   */
  public saveVolumeContent(projectId: string, volumeId: string): void {
    const project = this.stateManager.getProject();
    if (project && project.id === projectId) {
      const volume = project.volumes.find((v: Volume) => v.id === volumeId);
      if (volume?.content) {
        debouncedSaveVolumeContent(volumeId, volume.content);
      }
    }
  }

  /**
   * 保存剧情拆解
   */
  public savePlotBreakdown(projectId: string, volumeId: string): void {
    const project = this.stateManager.getProject();
    if (project && project.id === projectId) {
      const volume = project.volumes.find((v: Volume) => v.id === volumeId);
      if (volume?.plotBreakdown) {
        debouncedSavePlotBreakdown(volumeId, volume.plotBreakdown);
      }
    }
  }

  /**
   * 保存剧本
   */
  public saveScript(projectId: string, volumeId: string, episodeNumber: number): void {
    const project = this.stateManager.getProject();
    if (project && project.id === projectId) {
      const volume = project.volumes.find((v: Volume) => v.id === volumeId);
      const episode = volume?.plotBreakdown?.episodes.find((e: any) => e.number === episodeNumber);
      if (episode?.script) {
        debouncedSaveScript(volumeId, episodeNumber, episode.script);
      }
    }
  }

  /**
   * 保存报告
   */
  public saveReport(projectId: string, volumeId: string, episodeNumber: number): void {
    const project = this.stateManager.getProject();
    if (project && project.id === projectId) {
      const volume = project.volumes.find((v: Volume) => v.id === volumeId);
      const episode = volume?.plotBreakdown?.episodes.find((e: any) => e.number === episodeNumber);
      if (episode?.report) {
        debouncedSaveReport(volumeId, episodeNumber, episode.report);
      }
    }
  }

  /**
   * 保存卷
   */
  public saveVolume(projectId: string, volumeId: string): void {
    const project = this.stateManager.getProject();
    if (project && project.id === projectId) {
      const volume = project.volumes.find((v: Volume) => v.id === volumeId);
      if (volume?.content) {
        debouncedSaveVolumeContent(volumeId, volume.content);
      }
      if (volume?.plotBreakdown) {
        debouncedSavePlotBreakdown(volumeId, volume.plotBreakdown);
      }
    }
  }

  /**
   * 立即执行所有待保存的操作
   */
  public flushSaveQueue(): Promise<void> {
    return flushSaveQueue();
  }

  /**
   * 清空保存队列（不执行保存操作）
   */
  public clearSaveQueue(): void {
    clearSaveQueue();
  }

  /**
   * 获取当前保存状态
   */
  public getSaveStatus(): boolean {
    return getSaveStatus();
  }

  /**
   * 获取待保存操作数量
   */
  public getPendingSaveCount(): number {
    return getPendingSaveCount();
  }
}

/**
 * 初始化自动保存服务
 */
export const initAutoSaveService = (): void => {
  // 添加页面卸载前的保存处理
  window.addEventListener('beforeunload', async (event) => {
    if (saveQueue.length > 0 || isSaving) {
      // 尝试在页面卸载前保存
      try {
        await flushSaveQueue();
      } catch (error) {
        console.error("Failed to save before unload:", error);
        // 提示用户可能有未保存的更改
        event.preventDefault();
        event.returnValue = '';
      }
    }
  });
  
  // 添加页面隐藏时的保存处理
  document.addEventListener('visibilitychange', async () => {
    if (document.hidden && saveQueue.length > 0) {
      try {
        await flushSaveQueue();
      } catch (error) {
        console.error("Failed to save when page hidden:", error);
      }
    }
  });
  
  console.log("Auto-save service initialized");
};

// 在模块加载时初始化服务
initAutoSaveService();