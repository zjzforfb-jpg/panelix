/**
 * 多标签页同步服务
 * 使用 BroadcastChannel 实现标签页间通信和冲突检测
 * 
 * 功能：
 * 1. 检测其他标签页的保存操作
 * 2. 版本冲突提示
 * 3. 自动重新加载或手动合并
 */

import { Project } from '../types';

// 消息类型
interface SyncMessage {
  type: 'project-saved' | 'project-opened' | 'project-closed' | 'heartbeat';
  projectId: string;
  timestamp: number;
  tabId: string;
  lastModified?: number;
}

// 冲突信息
export interface ConflictInfo {
  projectId: string;
  localTimestamp: number;
  remoteTimestamp: number;
  remoteTabId: string;
}

// 冲突处理选项
export type ConflictResolution = 'reload' | 'keep_local' | 'ignore';

// 冲突处理回调
export type ConflictHandler = (conflict: ConflictInfo) => Promise<ConflictResolution>;

// 同步状态
export interface SyncState {
  isConnected: boolean;
  activeTabsCount: number;
  lastSyncTime: number | null;
  hasConflict: boolean;
  conflictInfo: ConflictInfo | null;
}

// 状态监听器类型
export type SyncStateListener = (state: SyncState) => void;

/**
 * 多标签页同步服务类
 */
export class MultiTabSyncService {
  private channel: BroadcastChannel | null = null;
  private tabId: string;
  private currentProjectId: string | null = null;
  private currentProject: (() => Project | null) | null = null;
  private reloadProject: ((projectId: string) => Promise<void>) | null = null;
  private onConflict: ConflictHandler | null = null;
  private listeners: Set<SyncStateListener> = new Set();
  private heartbeatInterval: number | null = null;
  private activeTabs: Map<string, number> = new Map(); // tabId -> lastSeen
  private state: SyncState = {
    isConnected: false,
    activeTabsCount: 1,
    lastSyncTime: null,
    hasConflict: false,
    conflictInfo: null
  };

  constructor() {
    // Generate unique tab ID
    this.tabId = this.generateTabId();
  }

  /**
   * 初始化服务
   */
  initialize(options: {
    getProject: () => Project | null;
    reloadProject: (projectId: string) => Promise<void>;
    onConflict?: ConflictHandler;
  }): void {
    this.currentProject = options.getProject;
    this.reloadProject = options.reloadProject;
    this.onConflict = options.onConflict || null;

    // Create BroadcastChannel
    try {
      this.channel = new BroadcastChannel('automanju-sync');
      this.channel.onmessage = (event) => this.handleMessage(event.data);
      this.updateState({ isConnected: true });
      console.log('[MultiTabSync] Initialized with tab ID:', this.tabId);
    } catch (error) {
      console.warn('[MultiTabSync] BroadcastChannel not supported:', error);
      this.updateState({ isConnected: false });
      return;
    }

    // Start heartbeat
    this.startHeartbeat();

    // Announce presence
    this.broadcast({
      type: 'heartbeat',
      projectId: this.currentProjectId || '',
      timestamp: Date.now(),
      tabId: this.tabId
    });
  }

  /**
   * 设置当前项目
   */
  setCurrentProject(projectId: string): void {
    const oldProjectId = this.currentProjectId;
    this.currentProjectId = projectId;

    // Notify other tabs
    if (oldProjectId) {
      this.broadcast({
        type: 'project-closed',
        projectId: oldProjectId,
        timestamp: Date.now(),
        tabId: this.tabId
      });
    }

    if (projectId) {
      this.broadcast({
        type: 'project-opened',
        projectId,
        timestamp: Date.now(),
        tabId: this.tabId
      });
    }

    // Clear any existing conflict for the old project
    if (this.state.hasConflict && this.state.conflictInfo?.projectId === oldProjectId) {
      this.updateState({
        hasConflict: false,
        conflictInfo: null
      });
    }
  }

  /**
   * 通知项目已保存
   */
  notifyProjectSaved(projectId: string, lastModified: number): void {
    if (!this.channel) return;

    this.broadcast({
      type: 'project-saved',
      projectId,
      timestamp: Date.now(),
      tabId: this.tabId,
      lastModified
    });

    this.updateState({ lastSyncTime: Date.now() });
    console.log('[MultiTabSync] Notified project saved:', projectId);
  }

  /**
   * 处理收到的消息
   */
  private handleMessage(data: SyncMessage): void {
    // Ignore messages from self
    if (data.tabId === this.tabId) return;

    switch (data.type) {
      case 'project-saved':
        this.handleProjectSaved(data);
        break;
      case 'project-opened':
      case 'project-closed':
      case 'heartbeat':
        this.updateActiveTabs(data.tabId);
        break;
    }
  }

  /**
   * 处理项目保存消息
   */
  private async handleProjectSaved(data: SyncMessage): Promise<void> {
    // Only care about the current project
    if (data.projectId !== this.currentProjectId) return;

    const localProject = this.currentProject?.();
    if (!localProject) return;

    const localLastModified = localProject.lastModified;
    const remoteLastModified = data.lastModified || data.timestamp;

    console.log('[MultiTabSync] Received project-saved:', {
      projectId: data.projectId,
      localLastModified,
      remoteLastModified,
      fromTab: data.tabId
    });

    // Check for conflict
    if (localLastModified > remoteLastModified) {
      // Local version is newer - potential conflict
      const conflictInfo: ConflictInfo = {
        projectId: data.projectId,
        localTimestamp: localLastModified,
        remoteTimestamp: remoteLastModified,
        remoteTabId: data.tabId
      };

      this.updateState({
        hasConflict: true,
        conflictInfo
      });

      // Call conflict handler if provided
      if (this.onConflict) {
        const resolution = await this.onConflict(conflictInfo);
        await this.resolveConflict(resolution, conflictInfo);
      }
    } else {
      // Remote version is newer - auto reload
      console.log('[MultiTabSync] Remote version is newer, reloading...');
      if (this.reloadProject) {
        await this.reloadProject(data.projectId);
      }
    }
  }

  /**
   * 解决冲突
   */
  private async resolveConflict(
    resolution: ConflictResolution,
    conflict: ConflictInfo
  ): Promise<void> {
    switch (resolution) {
      case 'reload':
        // Reload from storage
        if (this.reloadProject) {
          await this.reloadProject(conflict.projectId);
        }
        break;
      case 'keep_local':
        // Keep local version - notify other tabs
        const localProject = this.currentProject?.();
        if (localProject) {
          this.notifyProjectSaved(localProject.id, localProject.lastModified);
        }
        break;
      case 'ignore':
        // Do nothing
        break;
    }

    // Clear conflict state
    this.updateState({
      hasConflict: false,
      conflictInfo: null
    });
  }

  /**
   * 更新活跃标签页
   */
  private updateActiveTabs(tabId: string): void {
    this.activeTabs.set(tabId, Date.now());

    // Clean up stale tabs (not seen in 30 seconds)
    const now = Date.now();
    const staleThreshold = 30000;
    for (const [id, lastSeen] of this.activeTabs.entries()) {
      if (now - lastSeen > staleThreshold) {
        this.activeTabs.delete(id);
      }
    }

    this.updateState({
      activeTabsCount: this.activeTabs.size + 1 // +1 for self
    });
  }

  /**
   * 开始心跳
   */
  private startHeartbeat(): void {
    this.stopHeartbeat();

    this.heartbeatInterval = window.setInterval(() => {
      this.broadcast({
        type: 'heartbeat',
        projectId: this.currentProjectId || '',
        timestamp: Date.now(),
        tabId: this.tabId
      });
    }, 10000); // Every 10 seconds
  }

  /**
   * 停止心跳
   */
  private stopHeartbeat(): void {
    if (this.heartbeatInterval !== null) {
      window.clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
  }

  /**
   * 广播消息
   */
  private broadcast(message: SyncMessage): void {
    if (!this.channel) return;

    try {
      this.channel.postMessage(message);
    } catch (error) {
      console.warn('[MultiTabSync] Failed to broadcast:', error);
    }
  }

  /**
   * 生成唯一标签页ID
   */
  private generateTabId(): string {
    let tabId = sessionStorage.getItem('multiTabSyncId');
    if (!tabId) {
      tabId = `tab_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      sessionStorage.setItem('multiTabSyncId', tabId);
    }
    return tabId;
  }

  /**
   * 获取当前状态
   */
  getState(): SyncState {
    return { ...this.state };
  }

  /**
   * 订阅状态变化
   */
  subscribe(listener: SyncStateListener): () => void {
    this.listeners.add(listener);
    listener(this.getState());
    return () => this.listeners.delete(listener);
  }

  /**
   * 更新状态并通知监听器
   */
  private updateState(updates: Partial<SyncState>): void {
    this.state = { ...this.state, ...updates };
    this.notifyListeners();
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
        console.error('[MultiTabSync] Listener error:', error);
      }
    });
  }

  /**
   * 手动触发重新加载
   */
  async forceReload(): Promise<void> {
    if (this.currentProjectId && this.reloadProject) {
      await this.reloadProject(this.currentProjectId);
      this.updateState({
        hasConflict: false,
        conflictInfo: null
      });
    }
  }

  /**
   * 忽略当前冲突
   */
  dismissConflict(): void {
    this.updateState({
      hasConflict: false,
      conflictInfo: null
    });
  }

  /**
   * 清理资源
   */
  dispose(): void {
    this.stopHeartbeat();
    
    if (this.channel) {
      // Notify other tabs that this tab is closing
      if (this.currentProjectId) {
        this.broadcast({
          type: 'project-closed',
          projectId: this.currentProjectId,
          timestamp: Date.now(),
          tabId: this.tabId
        });
      }
      
      this.channel.close();
      this.channel = null;
    }

    this.listeners.clear();
    this.activeTabs.clear();
    this.currentProject = null;
    this.reloadProject = null;
    this.onConflict = null;
  }
}

// 导出单例实例
export const multiTabSyncService = new MultiTabSyncService();


