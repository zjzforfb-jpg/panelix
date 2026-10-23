/**
 * 自动备份服务
 * 提供可配置的项目自动备份功能
 * 
 * 功能：
 * 1. 定时自动备份
 * 2. 可配置备份间隔和保留数量
 * 3. 手动创建快照
 * 4. 备份恢复功能
 */

import { Project } from '../types';
import { db, ProjectBackup } from '../db';

// 备份配置
export interface BackupConfig {
  enabled: boolean;              // 是否启用自动备份
  intervalMinutes: number;       // 备份间隔（分钟）
  maxBackups: number;            // 最大保留数量
  backupOnImportantChanges: boolean;  // 重要操作后自动备份
}

// 默认备份配置
export const DEFAULT_BACKUP_CONFIG: BackupConfig = {
  enabled: true,
  intervalMinutes: 5,
  maxBackups: 10,
  backupOnImportantChanges: true
};

// 备份状态监听器类型
export type BackupStatusListener = (status: BackupStatus) => void;

// 备份状态
export interface BackupStatus {
  isRunning: boolean;
  lastBackupTime: number | null;
  nextBackupTime: number | null;
  backupCount: number;
  error: string | null;
}

/**
 * 自动备份服务类
 */
export class AutoBackupService {
  private config: BackupConfig;
  private intervalId: number | null = null;
  private currentProjectId: string | null = null;
  private getProject: (() => Project | null) | null = null;
  private listeners: Set<BackupStatusListener> = new Set();
  private status: BackupStatus = {
    isRunning: false,
    lastBackupTime: null,
    nextBackupTime: null,
    backupCount: 0,
    error: null
  };

  constructor(config?: Partial<BackupConfig>) {
    this.config = { ...DEFAULT_BACKUP_CONFIG, ...config };
  }

  /**
   * 初始化备份服务
   * @param projectId 当前项目ID
   * @param getProject 获取当前项目的函数
   */
  initialize(projectId: string, getProject: () => Project | null): void {
    this.currentProjectId = projectId;
    this.getProject = getProject;
    
    // 获取当前备份数量
    this.updateBackupCount();
    
    // 如果配置启用了自动备份，则启动定时器
    if (this.config.enabled) {
      this.start();
    }
  }

  /**
   * 更新配置
   */
  updateConfig(config: Partial<BackupConfig>): void {
    const wasEnabled = this.config.enabled;
    this.config = { ...this.config, ...config };
    
    // 如果启用状态变化，重新启动或停止
    if (wasEnabled !== this.config.enabled) {
      if (this.config.enabled) {
        this.start();
      } else {
        this.stop();
      }
    } else if (this.config.enabled) {
      // 如果只是间隔变化，重启定时器
      this.stop();
      this.start();
    }
  }

  /**
   * 获取当前配置
   */
  getConfig(): BackupConfig {
    return { ...this.config };
  }

  /**
   * 启动自动备份
   */
  start(): void {
    this.stop(); // 先清除旧定时器
    
    if (!this.config.enabled) {
      console.log('[AutoBackup] Service is disabled');
      return;
    }
    
    const intervalMs = this.config.intervalMinutes * 60 * 1000;
    
    // 计算下次备份时间
    this.updateStatus({
      isRunning: true,
      nextBackupTime: Date.now() + intervalMs
    });
    
    this.intervalId = window.setInterval(async () => {
      await this.createBackup('自动备份');
      
      // 更新下次备份时间
      this.updateStatus({
        nextBackupTime: Date.now() + intervalMs
      });
    }, intervalMs);
    
    console.log(`[AutoBackup] Started with ${this.config.intervalMinutes}min interval`);
  }

  /**
   * 停止自动备份
   */
  stop(): void {
    if (this.intervalId !== null) {
      window.clearInterval(this.intervalId);
      this.intervalId = null;
    }
    
    this.updateStatus({
      isRunning: false,
      nextBackupTime: null
    });
    
    console.log('[AutoBackup] Stopped');
  }

  /**
   * 创建备份
   * @param description 备份描述
   * @returns 备份ID
   */
  async createBackup(description: string): Promise<string | null> {
    if (!this.currentProjectId || !this.getProject) {
      console.warn('[AutoBackup] No project initialized');
      return null;
    }
    
    const project = this.getProject();
    if (!project) {
      console.warn('[AutoBackup] Could not get current project');
      return null;
    }
    
    try {
      const backupId = `backup_${project.id}_${Date.now()}`;
      
      const backup: ProjectBackup = {
        id: backupId,
        projectId: project.id,
        project: JSON.parse(JSON.stringify(project)), // 深拷贝
        createdAt: Date.now(),
        description
      };
      
      await db.backups.put(backup);
      
      // 清理旧备份
      await this.cleanOldBackups(project.id);
      
      // 更新状态
      await this.updateBackupCount();
      this.updateStatus({
        lastBackupTime: Date.now(),
        error: null
      });
      
      console.log(`[AutoBackup] Created backup: ${description}`);
      return backupId;
      
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error('[AutoBackup] Failed to create backup:', errorMessage);
      this.updateStatus({ error: errorMessage });
      return null;
    }
  }

  /**
   * 清理旧备份
   */
  private async cleanOldBackups(projectId: string): Promise<void> {
    try {
      const backups = await db.backups
        .where('projectId')
        .equals(projectId)
        .sortBy('createdAt');
      
      if (backups.length > this.config.maxBackups) {
        const toDelete = backups.slice(0, backups.length - this.config.maxBackups);
        const idsToDelete = toDelete.map(b => b.id);
        await db.backups.bulkDelete(idsToDelete);
        console.log(`[AutoBackup] Cleaned ${idsToDelete.length} old backups`);
      }
    } catch (error) {
      console.error('[AutoBackup] Failed to clean old backups:', error);
    }
  }

  /**
   * 获取备份列表
   */
  async getBackups(projectId?: string): Promise<ProjectBackup[]> {
    const targetId = projectId || this.currentProjectId;
    if (!targetId) return [];
    
    try {
      const backups = await db.backups
        .where('projectId')
        .equals(targetId)
        .reverse()
        .sortBy('createdAt');
      
      return backups;
    } catch (error) {
      console.error('[AutoBackup] Failed to get backups:', error);
      return [];
    }
  }

  /**
   * 恢复备份
   * @param backupId 备份ID
   * @returns 恢复的项目数据
   */
  async restoreBackup(backupId: string): Promise<Project | null> {
    try {
      const backup = await db.backups.get(backupId);
      if (!backup) {
        console.error('[AutoBackup] Backup not found:', backupId);
        return null;
      }
      
      console.log(`[AutoBackup] Restored backup: ${backup.description}`);
      return backup.project;
      
    } catch (error) {
      console.error('[AutoBackup] Failed to restore backup:', error);
      return null;
    }
  }

  /**
   * 删除备份
   */
  async deleteBackup(backupId: string): Promise<boolean> {
    try {
      await db.backups.delete(backupId);
      await this.updateBackupCount();
      console.log('[AutoBackup] Deleted backup:', backupId);
      return true;
    } catch (error) {
      console.error('[AutoBackup] Failed to delete backup:', error);
      return false;
    }
  }

  /**
   * 删除项目的所有备份
   */
  async deleteAllBackups(projectId: string): Promise<void> {
    try {
      const backups = await db.backups
        .where('projectId')
        .equals(projectId)
        .toArray();
      
      const idsToDelete = backups.map(b => b.id);
      await db.backups.bulkDelete(idsToDelete);
      
      await this.updateBackupCount();
      console.log(`[AutoBackup] Deleted all ${idsToDelete.length} backups for project ${projectId}`);
    } catch (error) {
      console.error('[AutoBackup] Failed to delete all backups:', error);
    }
  }

  /**
   * 更新备份数量
   */
  private async updateBackupCount(): Promise<void> {
    if (!this.currentProjectId) return;
    
    try {
      const count = await db.backups
        .where('projectId')
        .equals(this.currentProjectId)
        .count();
      
      this.updateStatus({ backupCount: count });
    } catch (error) {
      console.error('[AutoBackup] Failed to get backup count:', error);
    }
  }

  /**
   * 获取当前状态
   */
  getStatus(): BackupStatus {
    return { ...this.status };
  }

  /**
   * 订阅状态变化
   */
  subscribe(listener: BackupStatusListener): () => void {
    this.listeners.add(listener);
    listener(this.getStatus());
    return () => this.listeners.delete(listener);
  }

  /**
   * 更新状态并通知监听器
   */
  private updateStatus(updates: Partial<BackupStatus>): void {
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
        console.error('[AutoBackup] Listener error:', error);
      }
    });
  }

  /**
   * 重要操作后自动备份（如果配置启用）
   */
  async backupOnImportantChange(description: string): Promise<void> {
    if (this.config.backupOnImportantChanges) {
      await this.createBackup(description);
    }
  }

  /**
   * 清理资源
   */
  dispose(): void {
    this.stop();
    this.listeners.clear();
    this.currentProjectId = null;
    this.getProject = null;
  }
}

// 导出单例实例
export const autoBackupService = new AutoBackupService();


