/**
 * 项目状态管理服务
 * 用于整合新架构的文件系统服务和自动保存功能
 */

import { Project, ProjectV2, Volume, VolumeIndex, PlotBreakdown, WebtoonScript, AlignerReport } from '../types';
import { 
  loadProjectIndex, 
  loadVolumeFull, 
  loadScript, 
  loadReport,
  saveProjectMeta,
  saveVolumeContent,
  savePlotBreakdown,
  saveScript,
  saveReport,
  createNewVolume,
  deleteVolume
} from './fileSystem';
import { 
  debouncedSaveProjectMeta,
  debouncedSaveVolumeContent,
  debouncedSavePlotBreakdown,
  debouncedSaveScript,
  debouncedSaveReport,
  flushSaveQueue,
  addSaveStatusListener,
  removeSaveStatusListener,
  addSaveErrorListener,
  removeSaveErrorListener,
  getSaveStatus,
  getPendingSaveCount
} from './autoSaveService';
import { db } from '../db';

// ============================================================================
// Agent debug log (disabled by default)
// To enable in DevTools (DEV only): localStorage.setItem('ENABLE_AGENT_LOG', '1')
// ============================================================================
const agentLog = (payload: Record<string, unknown>) => {
  try {
    if (!(import.meta as any)?.env?.DEV) return;
    if (typeof window === 'undefined') return;
    if (window.localStorage.getItem('ENABLE_AGENT_LOG') !== '1') return;
    // Debug-only: keep local console logging, avoid network logging in production builds
    console.debug('[agentLog]', payload);
  } catch {
    // no-op
  }
};

// 项目状态管理器类
export class ProjectStateManager {
  private currentProject: ProjectV2 | null = null;
  private loadedVolumes: Map<string, Volume> = new Map();
  private loadedScripts: Map<string, Map<number, WebtoonScript>> = new Map();
  private loadedReports: Map<string, Map<number, AlignerReport>> = new Map();
  private listeners: Set<() => void> = new Set();
  private saveStatusListeners: Set<(isSaving: boolean) => void> = new Set();
  private saveErrorListeners: Set<(error: Error) => void> = new Set();

  /**
   * 初始化项目状态管理器
   */
  async initialize(dirHandle?: FileSystemDirectoryHandle): Promise<void> {
    try {
      // 如果提供了目录句柄，则从文件系统加载
      if (dirHandle) {
        // 加载项目索引
        this.currentProject = await loadProjectIndex(dirHandle);
        if (!this.currentProject) {
          throw new Error("Failed to load project index");
        }
      } else {
        // 否则初始化为空状态，等待后续加载
        this.currentProject = null;
      }
      
      // 清空缓存
      this.loadedVolumes.clear();
      this.loadedScripts.clear();
      this.loadedReports.clear();
      
      // 通知监听器
      this.notifyListeners();
    } catch (error) {
      console.error("Failed to initialize project state manager:", error);
      throw error;
    }
  }

  /**
   * 从数据库加载项目
   */
  async loadProjectFromDB(projectId: string): Promise<ProjectV2 | null> {
    try {
      // 从数据库获取项目
      const project = await db.projects.get(projectId);
      if (!project) {
        return null;
      }
      
      // 转换为ProjectV2格式
      const projectV2: ProjectV2 = {
        id: project.id,
        name: project.name,
        coverImage: project.coverImage,
        lastModified: project.lastModified,
        version: '2.0',
        activeVolumeId: project.activeVolumeId,
        storyBible: project.storyBible,
        assets: project.assets,
        activeStyle: project.activeStyle,
        customStyles: project.customStyles,
        volumeIndex: project.volumes.map(v => ({
          id: v.id,
          name: v.name,
          order: v.order
        }))
      };
      
      // 设置为当前项目
      this.currentProject = projectV2;
      
      // 加载所有卷到缓存
      for (const volume of project.volumes) {
        this.loadedVolumes.set(volume.id, volume);
        
        // 加载脚本和报告
        if (!this.loadedScripts.has(volume.id)) {
          this.loadedScripts.set(volume.id, new Map());
        }
        
        if (!this.loadedReports.has(volume.id)) {
          this.loadedReports.set(volume.id, new Map());
        }
        
        // 加载所有脚本
        for (const [episodeNum, script] of Object.entries(volume.scriptCache || {})) {
          this.loadedScripts.get(volume.id)!.set(parseInt(episodeNum), script);
        }
        
        // 加载所有报告
        for (const [episodeNum, report] of Object.entries(volume.reportCache || {})) {
          this.loadedReports.get(volume.id)!.set(parseInt(episodeNum), report);
        }
      }
      
      // 通知监听器
      this.notifyListeners();
      
      return projectV2;
    } catch (error) {
      console.error("Failed to load project from database:", error);
      throw error;
    }
  }

  /**
   * 从数据库获取所有项目
   */
  async getAllProjectsFromDB(): Promise<ProjectV2[]> {
    try {
      // 从数据库获取所有项目
      const projects = await db.projects.toArray();
      
      // 转换为ProjectV2格式
      return projects.map(project => ({
        id: project.id,
        name: project.name,
        coverImage: project.coverImage,
        lastModified: project.lastModified,
        version: '2.0',
        activeVolumeId: project.activeVolumeId,
        storyBible: project.storyBible,
        assets: project.assets,
        activeStyle: project.activeStyle,
        customStyles: project.customStyles,
        volumeIndex: project.volumes.map(v => ({
          id: v.id,
          name: v.name,
          order: v.order
        }))
      }));
    } catch (error) {
      console.error("Failed to get all projects from database:", error);
      throw error;
    }
  }

  /**
   * 保存项目到数据库
   */
  async saveProjectToDB(project: ProjectV2): Promise<void> {
    try {
      // 获取所有已加载的卷
      const volumes: Volume[] = [];
      
      // 检查 volumeIndex 是否存在
      if (!project.volumeIndex || !Array.isArray(project.volumeIndex)) {
        console.warn('Project volumeIndex is null or not an array, initializing empty array');
        project.volumeIndex = [];
      }
      
      for (const volumeIndex of project.volumeIndex) {
        const volume = this.loadedVolumes.get(volumeIndex.id);
        if (volume) {
          // 获取该卷的所有脚本和报告
          const scripts = this.loadedScripts.get(volumeIndex.id);
          const reports = this.loadedReports.get(volumeIndex.id);
          
          volumes.push({
            ...volume,
            scriptCache: scripts ? Object.fromEntries(scripts) : {},
            reportCache: reports ? Object.fromEntries(reports) : {}
          });
        }
      }
      
      // 转换为旧格式Project对象
      const projectData: Project = {
        id: project.id,
        name: project.name,
        coverImage: project.coverImage,
        lastModified: project.lastModified,
        volumes,
        activeVolumeId: project.activeVolumeId,
        storyBible: project.storyBible,
        assets: project.assets,
        activeStyle: project.activeStyle,
        customStyles: project.customStyles
      };
      
      // 保存到数据库
      await db.projects.put(projectData);
    } catch (error) {
      console.error("Failed to save project to database:", error);
      throw error;
    }
  }

  /**
   * 从数据库删除项目
   */
  async deleteProjectFromDB(projectId: string): Promise<void> {
    try {
      await db.projects.delete(projectId);
    } catch (error) {
      console.error("Failed to delete project from database:", error);
      throw error;
    }
  }

  /**
   * Get project with all volumes (for export)
   */
  async getProjectWithVolumes(projectId: string): Promise<Project | null> {
    try {
      // Get project from database
      const projectRecord = await db.projects.get(projectId);
      if (!projectRecord) {
        return null;
      }
      
      // Create a Project object with all volumes from the record
      const project: Project = {
        id: projectRecord.id,
        name: projectRecord.name,
        coverImage: projectRecord.coverImage,
        lastModified: projectRecord.lastModified,
        volumes: projectRecord.volumes,
        activeVolumeId: projectRecord.activeVolumeId,
        storyBible: projectRecord.storyBible,
        assets: projectRecord.assets,
        activeStyle: projectRecord.activeStyle,
        customStyles: projectRecord.customStyles
      };
      
      return project;
    } catch (error) {
      console.error('Failed to get project with volumes:', error);
      throw error;
    }
  }

  /**
   * 获取当前项目
   */
  getProject(): ProjectV2 | null {
    return this.currentProject;
  }

  /**
   * 设置当前项目（用于初始化）
   */
  setCurrentProject(project: ProjectV2): void {
    this.currentProject = project;
  }

  /**
   * 获取项目索引（不包含完整卷数据）
   */
  getProjectIndex(): ProjectV2 | null {
    if (!this.currentProject) return null;
    
    // 返回项目索引，不包含完整卷数据
    return {
      ...this.currentProject,
      volumeIndex: [...this.currentProject.volumeIndex]
    };
  }

  /**
   * 获取完整项目数据（兼容旧接口）
   */
  getFullProject(): Project | null {
    if (!this.currentProject) return null;
    
    // 获取所有已加载的卷
    const volumes: Volume[] = [];
    for (const volumeIndex of this.currentProject.volumeIndex) {
      const volume = this.loadedVolumes.get(volumeIndex.id);
      if (volume) {
        volumes.push(volume);
      }
    }
    
    // 构建旧格式Project对象
    return {
      id: this.currentProject.id,
      name: this.currentProject.name,
      coverImage: this.currentProject.coverImage,
      lastModified: this.currentProject.lastModified,
      volumes,
      activeVolumeId: this.currentProject.activeVolumeId,
      storyBible: this.currentProject.storyBible,
      assets: this.currentProject.assets,
      activeStyle: this.currentProject.activeStyle,
      customStyles: this.currentProject.customStyles
    };
  }

  /**
   * 加载完整项目数据（设置 currentProject 并加载所有卷到内存）
   * 这是 App.tsx 加载 V2 项目时调用的方法
   */
  async loadFullProject(projectV2: ProjectV2): Promise<Project> {
    // 1. 设置当前项目
    this.currentProject = projectV2;
    
    // 2. 从数据库获取完整项目数据（包含卷内容）
    const projectRecord = await db.projects.get(projectV2.id);
    if (!projectRecord) {
      throw new Error(`Project not found in database: ${projectV2.id}`);
    }
    
    // 3. 加载所有卷到内存缓存
    for (const volume of projectRecord.volumes) {
      this.loadedVolumes.set(volume.id, volume);
      
      // 加载脚本缓存
      if (!this.loadedScripts.has(volume.id)) {
        this.loadedScripts.set(volume.id, new Map());
      }
      for (const [episodeNum, script] of Object.entries(volume.scriptCache || {})) {
        this.loadedScripts.get(volume.id)!.set(parseInt(episodeNum), script);
      }
      
      // 加载报告缓存
      if (!this.loadedReports.has(volume.id)) {
        this.loadedReports.set(volume.id, new Map());
      }
      for (const [episodeNum, report] of Object.entries(volume.reportCache || {})) {
        this.loadedReports.get(volume.id)!.set(parseInt(episodeNum), report);
      }
    }
    
    // 4. 通知监听器
    this.notifyListeners();
    
    // 5. 返回完整项目数据
    return projectRecord;
  }

  /**
   * 获取卷索引列表
   */
  getVolumeIndexes(): VolumeIndex[] {
    if (!this.currentProject) return [];
    return [...this.currentProject.volumeIndex];
  }

  /**
   * 获取特定卷（按需加载）
   */
  async getVolume(volumeId: string): Promise<Volume | null> {
    // 如果已缓存，直接返回
    if (this.loadedVolumes.has(volumeId)) {
      return this.loadedVolumes.get(volumeId)!;
    }
    
    // 按需加载
    const volume = await loadVolumeFull(volumeId);
    if (volume) {
      this.loadedVolumes.set(volumeId, volume);
    }
    
    return volume;
  }

  /**
   * 获取当前活动卷
   */
  async getActiveVolume(): Promise<Volume | null> {
    if (!this.currentProject?.activeVolumeId) return null;
    return this.getVolume(this.currentProject.activeVolumeId);
  }

  /**
   * 获取特定剧本（按需加载）
   */
  async getScript(volumeId: string, episodeNum: number): Promise<WebtoonScript | null> {
    // 检查是否已缓存
    if (this.loadedScripts.has(volumeId) && this.loadedScripts.get(volumeId)!.has(episodeNum)) {
      return this.loadedScripts.get(volumeId)!.get(episodeNum)!;
    }
    
    // 按需加载
    const script = await loadScript(volumeId, episodeNum);
    if (script) {
      if (!this.loadedScripts.has(volumeId)) {
        this.loadedScripts.set(volumeId, new Map());
      }
      this.loadedScripts.get(volumeId)!.set(episodeNum, script);
    }
    
    return script;
  }

  /**
   * 获取特定报告（按需加载）
   */
  async getReport(volumeId: string, episodeNum: number): Promise<AlignerReport | null> {
    // 检查是否已缓存
    if (this.loadedReports.has(volumeId) && this.loadedReports.get(volumeId)!.has(episodeNum)) {
      return this.loadedReports.get(volumeId)!.get(episodeNum)!;
    }
    
    // 按需加载
    const report = await loadReport(volumeId, episodeNum);
    if (report) {
      if (!this.loadedReports.has(volumeId)) {
        this.loadedReports.set(volumeId, new Map());
      }
      this.loadedReports.get(volumeId)!.set(episodeNum, report);
    }
    
    return report;
  }

  /**
   * 更新项目元数据
   */
  async updateProject(projectId: string, updates: Partial<ProjectV2>): Promise<void> {
    agentLog({
      location: 'projectStateManager.ts:updateProject:entry',
      message: 'updateProject called',
      data: {
        projectId,
        hasCurrentProject: !!this.currentProject,
        updatesHasVolumes: 'volumes' in updates,
        volumeCount: (updates as any).volumes?.length || 0,
      },
      timestamp: Date.now(),
    });
    
    if (!this.currentProject) {
      agentLog({
        location: 'projectStateManager.ts:updateProject:noCurrentProject',
        message: 'EARLY RETURN: currentProject is null',
        data: { projectId },
        timestamp: Date.now(),
      });
      return;
    }
    
    this.currentProject = {
      ...this.currentProject,
      ...updates,
      lastModified: Date.now()
    };
    
    // 保存到数据库 - 使用 put 而不是 update 以确保完整保存
    agentLog({
      location: 'projectStateManager.ts:updateProject:beforeDbUpdate',
      message: 'About to call db.projects.update',
      data: { projectId },
      timestamp: Date.now(),
    });
    
    await db.projects.update(projectId, updates);
    
    // 通知监听器
    this.notifyListeners();
  }

  /**
   * 更新卷数据
   */
  async updateVolume(projectId: string, volumeId: string, volume: Volume): Promise<void> {
    agentLog({
      location: 'projectStateManager.ts:updateVolume:entry',
      message: 'updateVolume called',
      data: {
        projectId,
        volumeId,
        contentLength: volume.content?.length || 0,
        hasCurrentProject: !!this.currentProject,
        currentProjectId: this.currentProject?.id,
        volumeIndexLength: this.currentProject?.volumeIndex?.length || 0,
      },
      timestamp: Date.now(),
    });
    try {
      // 更新内存中的卷数据
      this.loadedVolumes.set(volumeId, volume);
      
      // 更新脚本和报告缓存
      if (!this.loadedScripts.has(volumeId)) {
        this.loadedScripts.set(volumeId, new Map());
      }
      
      if (!this.loadedReports.has(volumeId)) {
        this.loadedReports.set(volumeId, new Map());
      }
      
      // 加载所有脚本
      for (const [episodeNum, script] of Object.entries(volume.scriptCache || {})) {
        this.loadedScripts.get(volumeId)!.set(parseInt(episodeNum), script);
      }
      
      // 加载所有报告
      for (const [episodeNum, report] of Object.entries(volume.reportCache || {})) {
        this.loadedReports.get(volumeId)!.set(parseInt(episodeNum), report);
      }
      
      // 保存到数据库
      if (!this.currentProject) {
        agentLog({
          location: 'projectStateManager.ts:updateVolume:noCurrentProject',
          message: 'CRITICAL: currentProject is NULL!',
          data: { projectId, volumeId },
          timestamp: Date.now(),
        });
        console.warn('Cannot save project: currentProject is null');
        throw new Error('Current project is not initialized');
      }
      
      agentLog({
        location: 'projectStateManager.ts:updateVolume:beforeSave',
        message: 'About to call saveProjectToDB',
        data: {
          currentProjectId: this.currentProject.id,
          volumeIndexIds: this.currentProject.volumeIndex?.map(v => v.id) || [],
          loadedVolumesKeys: Array.from(this.loadedVolumes.keys()),
        },
        timestamp: Date.now(),
      });
      
      await this.saveProjectToDB(this.currentProject);
      
      agentLog({
        location: 'projectStateManager.ts:updateVolume:afterSave',
        message: 'saveProjectToDB completed',
        data: { projectId },
        timestamp: Date.now(),
      });
      
      // 通知监听器
      this.notifyListeners();
    } catch (error) {
      agentLog({
        location: 'projectStateManager.ts:updateVolume:error',
        message: 'updateVolume FAILED',
        data: { error: String(error) },
        timestamp: Date.now(),
      });
      console.error("Failed to update volume:", error);
      throw error;
    }
  }

  /**
   * 更新卷内容
   */
  async updateVolumeContent(projectId: string, volumeId: string, content: string): Promise<void> {
    // 更新内存中的卷数据
    const volume = await this.getVolume(volumeId);
    if (volume) {
      volume.content = content;
      this.loadedVolumes.set(volumeId, volume);
    }
    
    // 保存到数据库
      await this.saveProjectToDB(this.currentProject!);
    
    // 通知监听器
    this.notifyListeners();
  }

  /**
   * 更新剧情拆解
   */
  async updatePlotBreakdown(projectId: string, volumeId: string, breakdown: PlotBreakdown): Promise<void> {
    // 更新内存中的卷数据
    const volume = await this.getVolume(volumeId);
    if (volume) {
      volume.plotBreakdown = breakdown;
      this.loadedVolumes.set(volumeId, volume);
    }
    
    // 保存到数据库
      await this.saveProjectToDB(this.currentProject!);
    
    // 通知监听器
    this.notifyListeners();
  }

  /**
   * 更新剧本
   */
  async updateScript(projectId: string, volumeId: string, episodeNum: number, script: WebtoonScript): Promise<void> {
    // 更新内存中的卷数据
    const volume = await this.getVolume(volumeId);
    if (volume) {
      volume.scriptCache[episodeNum] = script;
      this.loadedVolumes.set(volumeId, volume);
    }
    
    // 更新内存中的剧本缓存
    if (!this.loadedScripts.has(volumeId)) {
      this.loadedScripts.set(volumeId, new Map());
    }
    this.loadedScripts.get(volumeId)!.set(episodeNum, script);
    
    // 保存到数据库
      await this.saveProjectToDB(this.currentProject!);
    
    // 通知监听器
    this.notifyListeners();
  }

  /**
   * 更新报告
   */
  async updateReport(projectId: string, volumeId: string, episodeNum: number, report: AlignerReport): Promise<void> {
    // 更新内存中的卷数据
    const volume = await this.getVolume(volumeId);
    if (volume) {
      volume.reportCache[episodeNum] = report;
      this.loadedVolumes.set(volumeId, volume);
    }
    
    // 更新内存中的报告缓存
    if (!this.loadedReports.has(volumeId)) {
      this.loadedReports.set(volumeId, new Map());
    }
    this.loadedReports.get(volumeId)!.set(episodeNum, report);
    
    // 保存到数据库
    if (this.currentProject?.volumeIndex) {
      await db.projects.update(projectId, {
        volumeIndex: this.currentProject.volumeIndex
      } as any); // Type assertion needed due to Dexie type limitations
    }
    
    // 通知监听器
    this.notifyListeners();
  }

  /**
   * 设置活动卷ID
   */
  async setActiveVolumeId(projectId: string, volumeId: string): Promise<void> {
    if (!this.currentProject) return;
    
    this.currentProject.activeVolumeId = volumeId;
    this.currentProject.lastModified = Date.now();
    
    // 保存到数据库
    await db.projects.update(projectId, {
      activeVolumeId: this.currentProject.activeVolumeId,
      lastModified: this.currentProject.lastModified
    });
    
    // 通知监听器
    this.notifyListeners();
  }

  /**
   * 创建新卷
   */
  async createVolume(projectId: string, name: string, content: string = ""): Promise<string> {
    if (!this.currentProject) throw new Error("No active project");
    
    // 生成唯一ID
    const volumeId = `vol_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const order = this.currentProject.volumeIndex.length + 1;
    
    // 创建文件系统中的卷
    await createNewVolume(volumeId, name, order, content);
    
    // 更新项目索引
    const newVolumeIndex: VolumeIndex = { id: volumeId, name, order };
    this.currentProject.volumeIndex.push(newVolumeIndex);
    this.currentProject.lastModified = Date.now();
    
    // 保存到数据库
    await this.saveProjectToDB(this.currentProject!);
    
    // 通知监听器
    this.notifyListeners();
    
    return volumeId;
  }

  /**
   * 删除卷
   */
  async deleteVolume(projectId: string, volumeId: string): Promise<void> {
    if (!this.currentProject) throw new Error("No active project");
    
    // 从文件系统删除
    await deleteVolume(volumeId);
    
    // 从项目索引中移除
    this.currentProject.volumeIndex = this.currentProject.volumeIndex.filter(
      v => v.id !== volumeId
    );
    
    // 如果删除的是活动卷，重置活动卷ID
    if (this.currentProject.activeVolumeId === volumeId) {
      this.currentProject.activeVolumeId = this.currentProject.volumeIndex.length > 0 
        ? this.currentProject.volumeIndex[0].id 
        : "";
    }
    
    this.currentProject.lastModified = Date.now();
    
    // 清除内存缓存
    this.loadedVolumes.delete(volumeId);
    this.loadedScripts.delete(volumeId);
    this.loadedReports.delete(volumeId);
    
    // 保存到数据库
    await this.saveProjectToDB(this.currentProject!);
    
    // 通知监听器
    this.notifyListeners();
  }

  /**
   * 立即保存所有待保存的数据
   */
  async flushSaves(): Promise<void> {
    await flushSaveQueue();
  }

  /**
   * 获取保存状态
   */
  isSaving(): boolean {
    return getSaveStatus();
  }

  /**
   * 获取待保存操作数量
   */
  getPendingSaveCount(): number {
    return getPendingSaveCount();
  }

  /**
   * 添加状态变化监听器
   */
  addListener(listener: () => void): void {
    this.listeners.add(listener);
  }

  /**
   * 移除状态变化监听器
   */
  removeListener(listener: () => void): void {
    this.listeners.delete(listener);
  }

  /**
   * 添加保存状态监听器
   */
  addSaveStatusListener(listener: (isSaving: boolean) => void): void {
    this.saveStatusListeners.add(listener);
    addSaveStatusListener(listener);
  }

  /**
   * 移除保存状态监听器
   */
  removeSaveStatusListener(listener: (isSaving: boolean) => void): void {
    this.saveStatusListeners.delete(listener);
    removeSaveStatusListener(listener);
  }

  /**
   * 添加保存错误监听器
   */
  addSaveErrorListener(listener: (error: Error) => void): void {
    this.saveErrorListeners.add(listener);
    addSaveErrorListener(listener);
  }

  /**
   * 移除保存错误监听器
   */
  removeSaveErrorListener(listener: (error: Error) => void): void {
    this.saveErrorListeners.delete(listener);
    removeSaveErrorListener(listener);
  }

  /**
   * 通知所有监听器
   */
  private notifyListeners(): void {
    this.listeners.forEach(listener => {
      try {
        listener();
      } catch (error) {
        console.error("Error in project state listener:", error);
      }
    });
  }

  /**
   * 清理资源
   */
  dispose(): void {
    // 移除所有监听器
    this.listeners.clear();
    
    // 移除自动保存服务的监听器
    this.saveStatusListeners.forEach(listener => {
      removeSaveStatusListener(listener);
    });
    this.saveStatusListeners.clear();
    
    this.saveErrorListeners.forEach(listener => {
      removeSaveErrorListener(listener);
    });
    this.saveErrorListeners.clear();
    
    // 清空缓存
    this.loadedVolumes.clear();
    this.loadedScripts.clear();
    this.loadedReports.clear();
  }
}

// 导出单例实例
export const projectStateManager = new ProjectStateManager();