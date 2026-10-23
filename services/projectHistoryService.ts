/**
 * 项目历史服务
 * 提供撤销/重做功能，支持持久化到 IndexedDB
 * 
 * 功能：
 * 1. 内存历史栈管理
 * 2. 持久化到 IndexedDB
 * 3. 快捷键支持 (Ctrl+Z / Ctrl+Shift+Z)
 * 4. 关键操作自动创建快照
 */

import { Project } from '../types';
import { db, ProjectHistory } from '../db';

// 历史配置
export interface HistoryConfig {
  maxStackSize: number;          // 最大历史记录数
  persistToDb: boolean;          // 是否持久化到数据库
}

// 默认配置
export const DEFAULT_HISTORY_CONFIG: HistoryConfig = {
  maxStackSize: 20,
  persistToDb: true
};

// 历史状态
export interface HistoryState {
  canUndo: boolean;
  canRedo: boolean;
  undoCount: number;
  redoCount: number;
  currentDescription: string | null;
}

// 状态监听器类型
export type HistoryStateListener = (state: HistoryState) => void;

/**
 * 项目历史服务类
 */
export class ProjectHistoryService {
  private config: HistoryConfig;
  private undoStack: ProjectHistory[] = [];
  private redoStack: ProjectHistory[] = [];
  private currentProjectId: string | null = null;
  private listeners: Set<HistoryStateListener> = new Set();
  private isProcessing: boolean = false; // 防止重入

  constructor(config?: Partial<HistoryConfig>) {
    this.config = { ...DEFAULT_HISTORY_CONFIG, ...config };
  }

  /**
   * 初始化历史服务
   * @param projectId 当前项目ID
   */
  async initialize(projectId: string): Promise<void> {
    this.currentProjectId = projectId;
    this.undoStack = [];
    this.redoStack = [];

    if (this.config.persistToDb) {
      try {
        // 从数据库加载历史记录
        const history = await db.history
          .where('projectId')
          .equals(projectId)
          .sortBy('timestamp');

        // 只保留最近的 maxStackSize 条
        this.undoStack = history.slice(-this.config.maxStackSize);
        
        console.log(`[History] Loaded ${this.undoStack.length} history entries for project ${projectId}`);
      } catch (error) {
        console.error('[History] Failed to load history from DB:', error);
      }
    }

    this.notifyListeners();
  }

  /**
   * 添加历史快照
   * @param project 项目数据
   * @param description 操作描述
   */
  async addSnapshot(project: Project, description: string): Promise<void> {
    if (!this.currentProjectId || this.isProcessing) return;
    
    // 防止在 undo/redo 过程中添加快照
    if (this.isProcessing) {
      console.log('[History] Skipping snapshot during undo/redo');
      return;
    }

    try {
      const snapshot: ProjectHistory = {
        id: `history_${project.id}_${Date.now()}`,
        projectId: project.id,
        project: JSON.parse(JSON.stringify(project)), // 深拷贝
        timestamp: Date.now(),
        description
      };

      // 添加到撤销栈
      this.undoStack.push(snapshot);
      
      // 新操作清空重做栈
      if (this.redoStack.length > 0) {
        // 从数据库删除重做栈的记录
        if (this.config.persistToDb) {
          const idsToDelete = this.redoStack.map(h => h.id);
          await db.history.bulkDelete(idsToDelete).catch(() => {});
        }
        this.redoStack = [];
      }

      // 限制栈大小
      if (this.undoStack.length > this.config.maxStackSize) {
        const removed = this.undoStack.shift();
        // 从数据库删除旧记录
        if (this.config.persistToDb && removed) {
          await db.history.delete(removed.id).catch(() => {});
        }
      }

      // 持久化到数据库
      if (this.config.persistToDb) {
        await db.history.put(snapshot);
      }

      console.log(`[History] Added snapshot: ${description}`);
      this.notifyListeners();

    } catch (error) {
      console.error('[History] Failed to add snapshot:', error);
    }
  }

  /**
   * 撤销操作
   * @returns 撤销后的项目数据，如果无法撤销则返回 null
   */
  async undo(): Promise<Project | null> {
    if (this.undoStack.length < 2) {
      console.log('[History] Cannot undo: not enough history');
      return null;
    }

    this.isProcessing = true;

    try {
      // 将当前状态移到重做栈
      const current = this.undoStack.pop()!;
      this.redoStack.push(current);

      // 获取上一个状态
      const previous = this.undoStack[this.undoStack.length - 1];
      
      console.log(`[History] Undo to: ${previous.description}`);
      this.notifyListeners();

      return previous.project;

    } finally {
      this.isProcessing = false;
    }
  }

  /**
   * 重做操作
   * @returns 重做后的项目数据，如果无法重做则返回 null
   */
  async redo(): Promise<Project | null> {
    if (this.redoStack.length === 0) {
      console.log('[History] Cannot redo: redo stack is empty');
      return null;
    }

    this.isProcessing = true;

    try {
      // 将重做栈顶部移到撤销栈
      const next = this.redoStack.pop()!;
      this.undoStack.push(next);

      console.log(`[History] Redo to: ${next.description}`);
      this.notifyListeners();

      return next.project;

    } finally {
      this.isProcessing = false;
    }
  }

  /**
   * 获取历史记录列表
   */
  getHistory(): ProjectHistory[] {
    return [...this.undoStack];
  }

  /**
   * 获取当前状态
   */
  getState(): HistoryState {
    return {
      canUndo: this.undoStack.length > 1,
      canRedo: this.redoStack.length > 0,
      undoCount: Math.max(0, this.undoStack.length - 1),
      redoCount: this.redoStack.length,
      currentDescription: this.undoStack.length > 0 
        ? this.undoStack[this.undoStack.length - 1].description 
        : null
    };
  }

  /**
   * 跳转到特定历史版本
   * @param historyId 历史记录ID
   */
  async jumpToHistory(historyId: string): Promise<Project | null> {
    const index = this.undoStack.findIndex(h => h.id === historyId);
    if (index === -1) {
      console.log('[History] History entry not found:', historyId);
      return null;
    }

    this.isProcessing = true;

    try {
      // 将后面的记录移到重做栈
      const toRedo = this.undoStack.splice(index + 1);
      this.redoStack = [...toRedo.reverse(), ...this.redoStack];

      const target = this.undoStack[this.undoStack.length - 1];
      console.log(`[History] Jumped to: ${target.description}`);
      this.notifyListeners();

      return target.project;

    } finally {
      this.isProcessing = false;
    }
  }

  /**
   * 订阅状态变化
   */
  subscribe(listener: HistoryStateListener): () => void {
    this.listeners.add(listener);
    listener(this.getState());
    return () => this.listeners.delete(listener);
  }

  /**
   * 通知所有监听器
   */
  private notifyListeners(): void {
    const state = this.getState();
    this.listeners.forEach(listener => {
      try {
        listener(state);
      } catch (error) {
        console.error('[History] Listener error:', error);
      }
    });
  }

  /**
   * 清除历史记录
   */
  async clearHistory(): Promise<void> {
    if (this.config.persistToDb && this.currentProjectId) {
      try {
        const allHistory = await db.history
          .where('projectId')
          .equals(this.currentProjectId)
          .toArray();
        
        const idsToDelete = allHistory.map(h => h.id);
        await db.history.bulkDelete(idsToDelete);
      } catch (error) {
        console.error('[History] Failed to clear history from DB:', error);
      }
    }

    this.undoStack = [];
    this.redoStack = [];
    this.notifyListeners();
    
    console.log('[History] History cleared');
  }

  /**
   * 清理资源
   */
  dispose(): void {
    this.listeners.clear();
    this.undoStack = [];
    this.redoStack = [];
    this.currentProjectId = null;
  }

  /**
   * 检查是否正在处理中（用于防止重入）
   */
  isInProgress(): boolean {
    return this.isProcessing;
  }
}

// 导出单例实例
export const projectHistoryService = new ProjectHistoryService();


