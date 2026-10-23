/**
 * 保存协调器
 * 实现双存储事务性保存，确保数据一致性
 * 
 * 核心功能：
 * 1. 双写策略：并行保存到文件系统和 IndexedDB
 * 2. 重试机制：自动重试失败的保存操作
 * 3. 状态通知：实时通知 UI 保存状态
 * 4. 内存缓存：乐观 UI 更新
 */

import { Project } from '../types';
import { saveProject } from '../db';
import { saveProjectToDirWithHandle } from './fileSystem';
import { RetryService, RetryOptions } from './retryService';

// 保存状态类型
export interface SaveStatus {
  isSaving: boolean;
  lastSavedTime: number | null;
  pendingChanges: number;
  lastError: string | null;
  partialFailure: boolean;
}

// 保存结果类型
export interface SaveResult {
  success: boolean;
  partialFailure: boolean;
  errors: SaveError[];
  savedTo: ('fileSystem' | 'indexedDB')[];
}

// 保存错误类型
export interface SaveError {
  target: 'fileSystem' | 'indexedDB';
  error: Error;
  retryable: boolean;
}

// 状态监听器类型
export type SaveStatusListener = (status: SaveStatus) => void;

// 保存协调器配置
export interface SaveCoordinatorConfig {
  enableDualWrite: boolean;       // 启用双写（默认 true）
  enableRetry: boolean;           // 启用重试（默认 true）
  retryOptions: Partial<RetryOptions>;  // 重试配置
}

// 默认配置
const DEFAULT_CONFIG: SaveCoordinatorConfig = {
  enableDualWrite: true,
  enableRetry: true,
  retryOptions: {
    maxRetries: 3,
    baseDelay: 1000,
    maxDelay: 5000
  }
};

/**
 * 保存协调器类
 */
export class SaveCoordinator {
  private config: SaveCoordinatorConfig;
  private retryService: RetryService;
  private status: SaveStatus;
  private listeners: Set<SaveStatusListener> = new Set();
  private memoryCache: Project | null = null;
  private pendingOperations: number = 0;
  // Coalesced FileSystem save to avoid swap-file conflicts and retry storms
  private fsInFlight: Promise<void> | null = null;
  private fsQueued: { project: Project; dirHandle: FileSystemDirectoryHandle } | null = null;
  private fsDisabledUntilTs: number = 0;

  constructor(config?: Partial<SaveCoordinatorConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.retryService = new RetryService(this.config.retryOptions);
    this.status = {
      isSaving: false,
      lastSavedTime: null,
      pendingChanges: 0,
      lastError: null,
      partialFailure: false
    };
  }

  /**
   * 获取当前保存状态
   */
  getStatus(): SaveStatus {
    return { ...this.status };
  }

  /**
   * 订阅保存状态变化
   * @returns 取消订阅函数
   */
  subscribe(listener: SaveStatusListener): () => void {
    this.listeners.add(listener);
    // 立即发送当前状态
    listener(this.getStatus());
    return () => this.listeners.delete(listener);
  }

  /**
   * 更新内存缓存（乐观 UI）
   */
  updateMemoryCache(project: Project): void {
    this.memoryCache = project;
    this.pendingOperations++;
    this.updateStatus({ pendingChanges: this.pendingOperations });
  }

  /**
   * 获取内存缓存
   */
  getMemoryCache(): Project | null {
    return this.memoryCache;
  }

  /**
   * 保存项目（双存储事务性保存）
   * @param project 要保存的项目
   * @param dirHandle 文件系统目录句柄（可选）
   * @returns 保存结果
   */
  async saveProject(
    project: Project,
    dirHandle?: FileSystemDirectoryHandle
  ): Promise<SaveResult> {
    const startTime = Date.now();
    const errors: SaveError[] = [];
    const savedTo: ('fileSystem' | 'indexedDB')[] = [];

    // 更新状态：正在保存
    this.updateStatus({
      isSaving: true,
      lastError: null,
      partialFailure: false
    });

    // 更新内存缓存
    this.memoryCache = project;

    try {
      // 创建保存任务
      const savePromises: Promise<{ target: 'fileSystem' | 'indexedDB'; success: boolean; error?: Error }>[] = [];

      // 1. 保存到 IndexedDB（始终执行）
      savePromises.push(this.saveToIndexedDB(project));

      // 2. 保存到文件系统（如果有 dirHandle）
      if (dirHandle && this.config.enableDualWrite) {
        savePromises.push(this.saveToFileSystem(project, dirHandle));
      }

      // 并行执行保存
      const results = await Promise.allSettled(savePromises);

      // 收集结果
      for (const result of results) {
        if (result.status === 'fulfilled') {
          const { target, success, error } = result.value;
          if (success) {
            savedTo.push(target);
          } else if (error) {
            errors.push({
              target,
              error,
              retryable: this.retryService.isRetryable(error)
            });
          }
        } else {
          // Promise rejected（不应该发生，因为我们在内部捕获了错误）
          console.error('[SaveCoordinator] Unexpected rejection:', result.reason);
        }
      }

      // 判断结果
      const success = savedTo.length > 0;
      const partialFailure = success && errors.length > 0;

      // 更新状态
      const duration = Date.now() - startTime;
      console.log(`[SaveCoordinator] Save completed in ${duration}ms. Saved to: ${savedTo.join(', ')}`);

      if (success) {
        this.pendingOperations = Math.max(0, this.pendingOperations - 1);
        this.updateStatus({
          isSaving: false,
          lastSavedTime: Date.now(),
          pendingChanges: this.pendingOperations,
          partialFailure,
          lastError: partialFailure ? `部分保存失败: ${errors.map(e => e.target).join(', ')}` : null
        });
      } else {
        // 全部失败
        const errorMessage = errors.map(e => `${e.target}: ${e.error.message}`).join('; ');
        this.updateStatus({
          isSaving: false,
          lastError: `保存失败: ${errorMessage}`,
          partialFailure: false
        });
        throw new AggregateError(errors.map(e => e.error), '所有存储位置保存失败');
      }

      return { success, partialFailure, errors, savedTo };

    } catch (error) {
      // 未预期的错误
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.updateStatus({
        isSaving: false,
        lastError: errorMessage
      });
      throw error;
    }
  }

  /**
   * 保存到 IndexedDB（带重试）
   */
  private async saveToIndexedDB(
    project: Project
  ): Promise<{ target: 'indexedDB'; success: boolean; error?: Error }> {
    const target = 'indexedDB' as const;
    
    try {
      if (this.config.enableRetry) {
        await this.retryService.executeWithRetry(
          () => saveProject(project),
          {
            onRetry: (attempt, error, delay) => {
              console.warn(`[SaveCoordinator] IndexedDB save retry ${attempt}, waiting ${delay}ms...`);
            }
          }
        );
      } else {
        await saveProject(project);
      }
      
      return { target, success: true };
    } catch (error) {
      console.error('[SaveCoordinator] IndexedDB save failed:', error);
      return {
        target,
        success: false,
        error: error instanceof Error ? error : new Error(String(error))
      };
    }
  }

  /**
   * 保存到文件系统（带重试）
   */
  private async saveToFileSystem(
    project: Project,
    dirHandle: FileSystemDirectoryHandle
  ): Promise<{ target: 'fileSystem'; success: boolean; error?: Error }> {
    const target = 'fileSystem' as const;
    
    try {
      // Cooldown window after swap-file storm: skip FileSystem to prevent UI meltdown.
      if (Date.now() < this.fsDisabledUntilTs) {
        return {
          target,
          success: false,
          error: new Error('FileSystem save temporarily disabled (cooldown)')
        };
      }

      await this.enqueueFileSystemSave(project, dirHandle);
      
      return { target, success: true };
    } catch (error) {
      console.error('[SaveCoordinator] FileSystem save failed:', error);
      return {
        target,
        success: false,
        error: error instanceof Error ? error : new Error(String(error))
      };
    }
  }

  /**
   * Serialize and coalesce FileSystem saves to avoid concurrent createWritable() swap-file conflicts.
   * - Always keeps the latest project snapshot in queue.
   * - Ensures at most ONE FileSystem write pipeline in-flight at any time.
   * - Circuit-breaks for a short cooldown when swap-file errors happen.
   */
  private enqueueFileSystemSave(
    project: Project,
    dirHandle: FileSystemDirectoryHandle
  ): Promise<void> {
    if (Date.now() < this.fsDisabledUntilTs) {
      return Promise.resolve();
    }

    // Always keep the latest snapshot only.
    this.fsQueued = { project, dirHandle };

    if (!this.fsInFlight) {
      this.fsInFlight = (async () => {
        while (this.fsQueued) {
          const next = this.fsQueued;
          this.fsQueued = null;

          if (this.config.enableRetry) {
            await this.retryService.executeWithRetry(
              () => saveProjectToDirWithHandle(next.project, next.dirHandle),
              {
                onRetry: (attempt, error, delay) => {
                  console.warn(`[SaveCoordinator] FileSystem save retry ${attempt}, waiting ${delay}ms...`);
                }
              }
            );
          } else {
            await saveProjectToDirWithHandle(next.project, next.dirHandle);
          }
        }
      })()
        .catch((err: unknown) => {
          const message = err instanceof Error ? err.message : String(err);
          // Swap-file storms are usually caused by rapid concurrent writes; cooldown avoids meltdown.
          if (
            message.includes('Failed to create swap file') ||
            message.includes("createWritable")
          ) {
            this.fsDisabledUntilTs = Date.now() + 10_000; // 10s cooldown
            this.fsQueued = null; // drop backlog; IndexedDB save still protects data
          }
          throw err;
        })
        .finally(() => {
          this.fsInFlight = null;
        });
    }

    return this.fsInFlight;
  }

  /**
   * 立即强制保存（绕过防抖）
   */
  async forceSave(
    project: Project,
    dirHandle?: FileSystemDirectoryHandle
  ): Promise<SaveResult> {
    return this.saveProject(project, dirHandle);
  }

  /**
   * 更新状态并通知监听器
   */
  private updateStatus(updates: Partial<SaveStatus>): void {
    this.status = { ...this.status, ...updates };
    this.notifyListeners();
  }

  /**
   * 通知所有监听器
   */
  private notifyListeners(): void {
    const statusCopy = this.getStatus();
    this.listeners.forEach(listener => {
      try {
        listener(statusCopy);
      } catch (error) {
        console.error('[SaveCoordinator] Listener error:', error);
      }
    });
  }

  /**
   * 重置状态
   */
  reset(): void {
    this.memoryCache = null;
    this.pendingOperations = 0;
    this.updateStatus({
      isSaving: false,
      lastSavedTime: null,
      pendingChanges: 0,
      lastError: null,
      partialFailure: false
    });
  }

  /**
   * 清理资源
   */
  dispose(): void {
    this.listeners.clear();
    this.reset();
  }
}

// 导出单例实例
export const saveCoordinator = new SaveCoordinator();

// 导出便捷函数
export const coordinatedSave = async (
  project: Project,
  dirHandle?: FileSystemDirectoryHandle
): Promise<SaveResult> => {
  return saveCoordinator.saveProject(project, dirHandle);
};

// 导出时间格式化工具函数
export const formatTimeAgo = (timestamp: number | null): string => {
  if (!timestamp) return '从未保存';
  
  const seconds = Math.floor((Date.now() - timestamp) / 1000);
  
  if (seconds < 5) return '刚刚';
  if (seconds < 60) return `${seconds}秒前`;
  
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}分钟前`;
  
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}小时前`;
  
  const days = Math.floor(hours / 24);
  return `${days}天前`;
};


