import React, { useState, useRef, useMemo } from 'react';
import { Project } from '../types';

interface ProjectManagerProps {
  projects: Project[];
  onSelectProject: (id: string) => void;
  onCreateProject: (name: string, cover?: string) => void;
  onDeleteProject: (id: string) => Promise<void>; 
  onUpdateProject: (id: string, name: string, cover?: string) => Promise<void>;
  onOpenSettings: () => void;
  onImportProject: (file: File) => Promise<void>;
  onExportProject: (project: Project) => void;
  // Workspace props
  workspaceName: string;
  hasWorkspace: boolean;
  isWorkspaceLoading: boolean;
  onSelectWorkspace: () => Promise<void>;
  onSwitchWorkspace: () => Promise<void>;
}

// Helper to count total panels across all volumes
const countPanels = (project: Project): number => {
  let count = 0;
  project.volumes?.forEach(vol => {
    Object.values(vol.scriptCache || {}).forEach(script => {
      count += script.panels?.length || 0;
    });
  });
  return count;
};

// Helper to count total episodes across all volumes
const countEpisodes = (project: Project): number => {
  let count = 0;
  project.volumes?.forEach(vol => {
    count += Object.keys(vol.scriptCache || {}).length;
  });
  return count;
};

export const ProjectManager: React.FC<ProjectManagerProps> = ({ 
  projects, 
  onSelectProject, 
  onCreateProject, 
  onDeleteProject,
  onUpdateProject,
  onOpenSettings,
  onImportProject,
  onExportProject,
  workspaceName,
  hasWorkspace,
  isWorkspaceLoading,
  onSelectWorkspace,
  onSwitchWorkspace
}) => {
  // Create State
  const [isCreating, setIsCreating] = useState(false);
  const [newProjectName, setNewProjectName] = useState("");
  const [newProjectCover, setNewProjectCover] = useState<string | undefined>(undefined);
  const [newCoverMode, setNewCoverMode] = useState<'upload' | 'url'>('upload');
  const [newCoverUrl, setNewCoverUrl] = useState<string>('');
  const [newCoverUrlError, setNewCoverUrlError] = useState<string>('');
  
  // Delete State
  const [projectToDelete, setProjectToDelete] = useState<Project | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // Edit State
  const [projectToEdit, setProjectToEdit] = useState<Project | null>(null);
  const [editName, setEditName] = useState("");
  const [editCover, setEditCover] = useState<string | undefined>(undefined);
  const [editCoverMode, setEditCoverMode] = useState<'upload' | 'url'>('upload');
  const [editCoverUrl, setEditCoverUrl] = useState<string>('');
  const [editCoverUrlError, setEditCoverUrlError] = useState<string>('');

  // Search & Sort State
  const [searchQuery, setSearchQuery] = useState("");
  const [sortBy, setSortBy] = useState<'lastModified' | 'name' | 'created'>('lastModified');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');

  // Cover loading failures (e.g., invalid URL, blocked hotlink). Track per project id.
  const [failedCoverIds, setFailedCoverIds] = useState<Set<string>>(new Set());

  const fileInputRef = useRef<HTMLInputElement>(null);
  const coverInputRef = useRef<HTMLInputElement>(null);
  const editCoverInputRef = useRef<HTMLInputElement>(null);

  // Filtered and sorted projects
  const filteredProjects = useMemo(() => {
    let result = [...projects];
    
    // Apply search filter
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase().trim();
      result = result.filter(p => 
        p.name.toLowerCase().includes(query) ||
        p.volumes?.some(v => v.name.toLowerCase().includes(query))
      );
    }
    
    // Apply sorting
    result.sort((a, b) => {
      switch (sortBy) {
        case 'lastModified':
          return (b.lastModified || 0) - (a.lastModified || 0);
        case 'name':
          return a.name.localeCompare(b.name, 'zh-CN');
        case 'created':
          return (b.createdAt || b.lastModified || 0) - (a.createdAt || a.lastModified || 0);
        default:
          return 0;
      }
    });
    
    return result;
  }, [projects, searchQuery, sortBy]);

  // --- Handlers: Create ---
  const handleCreate = () => {
    if (!newProjectName.trim()) return;
    // Ensure URL cover is applied even if user clicks create without blurring the input
    const coverToUse =
      newCoverMode === 'url'
        ? (isValidCoverUrl(newCoverUrl) ? newCoverUrl.trim() : undefined)
        : newProjectCover;
    onCreateProject(newProjectName, coverToUse);
    setNewProjectName("");
    setNewProjectCover(undefined);
    setNewCoverMode('upload');
    setNewCoverUrl('');
    setNewCoverUrlError('');
    setIsCreating(false);
  };

  const isValidCoverUrl = (url: string): boolean => {
    const trimmed = url.trim();
    if (!trimmed) return false;
    if (trimmed.startsWith('data:image/')) return true;
    return /^https?:\/\/.+/i.test(trimmed);
  };

  const applyNewCoverUrl = () => {
    const url = newCoverUrl.trim();
    if (!url) {
      setNewProjectCover(undefined);
      setNewCoverUrlError('');
      return;
    }
    if (!isValidCoverUrl(url)) {
      setNewCoverUrlError('请输入有效的图片地址（http/https），或粘贴 data:image/... 的图片数据。');
      return;
    }
    setNewCoverUrlError('');
    setNewProjectCover(url);
  };

  const handleCoverUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      if (file) {
          const reader = new FileReader();
          reader.onloadend = () => {
              setNewProjectCover(reader.result as string);
              setNewCoverUrl('');
              setNewCoverUrlError('');
          };
          reader.readAsDataURL(file);
      }
  };

  // --- Handlers: Edit ---
  const handleEditClick = (e: React.MouseEvent, project: Project) => {
      e.stopPropagation();
      setProjectToEdit(project);
      setEditName(project.name);
      setEditCover(project.coverImage);
      const isUrl = typeof project.coverImage === 'string' && /^https?:\/\//i.test(project.coverImage);
      setEditCoverMode(isUrl ? 'url' : 'upload');
      setEditCoverUrl(isUrl ? project.coverImage || '' : '');
      setEditCoverUrlError('');
  };

  const handleEditCoverUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      if (file) {
          const reader = new FileReader();
          reader.onloadend = () => {
            setEditCover(reader.result as string);
            setEditCoverUrl('');
            setEditCoverUrlError('');
          };
          reader.readAsDataURL(file);
      }
  };

  const applyEditCoverUrl = () => {
    const url = editCoverUrl.trim();
    if (!url) {
      setEditCover(undefined);
      setEditCoverUrlError('');
      return;
    }
    if (!isValidCoverUrl(url)) {
      setEditCoverUrlError('请输入有效的图片地址（http/https），或粘贴 data:image/... 的图片数据。');
      return;
    }
    setEditCoverUrlError('');
    setEditCover(url);
  };

  const executeEdit = async () => {
      if (!projectToEdit || !editName.trim()) return;
      const coverToUse =
        editCoverMode === 'url'
          ? (isValidCoverUrl(editCoverUrl) ? editCoverUrl.trim() : undefined)
          : editCover;
      await onUpdateProject(projectToEdit.id, editName, coverToUse);
      setProjectToEdit(null);
  };

  // --- Handlers: Import/Export ---
  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file && onImportProject) {
      onImportProject(file);
    }
    if (event.target.value) event.target.value = '';
  };

  const handleExportClick = (e: React.MouseEvent, project: Project) => {
    e.stopPropagation();
    onExportProject(project);
  }

  // --- Handlers: Delete ---
  const handleDeleteClick = (e: React.MouseEvent, project: Project) => {
    e.stopPropagation();
    setProjectToDelete(project);
  };

  const executeDelete = async () => {
    if (!projectToDelete) return;
    setIsDeleting(true);
    try {
        await onDeleteProject(projectToDelete.id);
        setProjectToDelete(null); 
    } catch (error: any) {
        alert(`删除失败: ${error.message}\n可能原因：数据库锁定或权限不足。请刷新页面重试。`);
    } finally {
        setIsDeleting(false);
    }
  };

  const formatDate = (ts: number) => {
    return new Date(ts).toLocaleString('zh-CN', { 
      month: '2-digit', 
      day: '2-digit', 
      hour: '2-digit', 
      minute: '2-digit', 
      hour12: false 
    });
  };

  return (
    <div className="flex flex-col h-full bg-[#121212] text-white p-8 overflow-hidden relative font-sans select-none w-full">
      {/* Background Ambience */}
      <div className="absolute top-0 left-0 w-full h-96 bg-gradient-to-b from-[#1E1E1E] to-transparent pointer-events-none" />
      
      {/* Hidden Import Input */}
      <input 
        type="file" 
        ref={fileInputRef}
        style={{ display: 'none' }} 
        accept=".json,.zip"
        onChange={handleFileChange}
      />

      <div className="max-w-[1600px] mx-auto w-full h-full flex flex-col z-10">
        
        {/* Header Bar */}
        <div className="flex flex-col gap-4 border-b border-white/10 pb-6 mb-6 shrink-0">
          {/* Top row: Title & Actions */}
          <div className="flex justify-between items-end">
            <div>
              <h1 className="text-3xl font-bold tracking-tight text-white flex items-center gap-3">
                <span className="bg-clip-text text-transparent bg-gradient-to-r from-blue-400 to-purple-400">
                  我的项目
                </span>
                <span className="text-sm font-normal text-gray-500 bg-[#1C1C1E] px-2 py-0.5 rounded-full border border-white/5">
                  {projects.length} 个项目
                </span>
              </h1>
              {/* Workspace Info */}
              <div className="flex items-center gap-2 mt-2">
                {hasWorkspace ? (
                  <>
                    <span className="text-green-400 text-xs font-medium flex items-center gap-1">
                      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-3.5 h-3.5">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 12.75V12A2.25 2.25 0 014.5 9.75h15A2.25 2.25 0 0121.75 12v.75m-8.69-6.44l-2.12-2.12a1.5 1.5 0 00-1.061-.44H4.5A2.25 2.25 0 002.25 6v12a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9a2.25 2.25 0 00-2.25-2.25h-5.379a1.5 1.5 0 01-1.06-.44z" />
                      </svg>
                      工作区: {workspaceName}
                    </span>
                    <button
                      onClick={onSwitchWorkspace}
                      className="text-[10px] text-gray-500 hover:text-blue-400 transition-colors underline"
                    >
                      切换
                    </button>
                  </>
                ) : (
                  <span className="text-amber-400 text-xs font-medium flex items-center gap-1">
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-3.5 h-3.5">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
                    </svg>
                    未选择工作区
                  </span>
                )}
              </div>
            </div>
            
            <div className="flex items-center gap-3">
               <button 
                onClick={() => onOpenSettings()}
                className="p-2.5 text-gray-400 hover:text-white hover:bg-white/10 rounded-xl transition-all border border-transparent hover:border-white/10"
                title="全局设置"
              >
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.324.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.24-.438.613-.431.992a6.759 6.759 0 010 .255c-.007.378.138.75.43.99l1.005.828c.424.35.534.954.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.57 6.57 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.28c-.09.543-.56.941-1.11.941h-2.594c-.55 0-1.02-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.992a6.932 6.932 0 010-.255c.007-.378-.138-.75-.43-.99l-1.004-.828a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.087.22-.128.332-.183.581-.495.644-.869l.214-1.281z" />
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
              </button>
               <button 
                onClick={() => fileInputRef.current?.click()}
                className="px-4 py-2.5 bg-[#1C1C1E] hover:bg-[#2C2C2E] rounded-xl text-xs font-bold transition-all border border-white/10 flex items-center gap-2 text-gray-300 hover:text-white"
                disabled={!hasWorkspace}
              >
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
                </svg>
                导入备份
              </button>
              <button 
                onClick={() => setIsCreating(true)}
                disabled={!hasWorkspace}
                className="px-5 py-2.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-xl text-xs font-bold shadow-[0_0_20px_rgba(37,99,235,0.3)] transition-all active:scale-95 flex items-center gap-2 border border-blue-400/20"
              >
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className="w-4 h-4">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                </svg>
                新建项目
              </button>
            </div>
          </div>
          
          {/* Bottom row: Search & Sort */}
          <div className="flex items-center gap-4">
            {/* Search Input */}
            <div className="relative flex-1 max-w-md">
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-500">
                <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
              </svg>
              <input 
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="搜索项目名称或卷名..."
                className="w-full bg-[#1C1C1E] border border-white/10 text-white rounded-xl pl-10 pr-4 py-2.5 text-sm outline-none focus:border-blue-500/50 transition-colors placeholder-gray-600"
              />
              {searchQuery && (
                <button 
                  onClick={() => setSearchQuery("")}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-white"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              )}
            </div>
            
            {/* Sort Buttons */}
            <div className="flex items-center gap-1 bg-[#1C1C1E] rounded-xl p-1 border border-white/5">
              <button 
                onClick={() => setSortBy('lastModified')}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${sortBy === 'lastModified' ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-white hover:bg-white/10'}`}
                title="按最后修改时间排序"
              >
                🕒 最近
              </button>
              <button 
                onClick={() => setSortBy('name')}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${sortBy === 'name' ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-white hover:bg-white/10'}`}
                title="按名称排序"
              >
                🔤 名称
              </button>
              <button 
                onClick={() => setSortBy('created')}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${sortBy === 'created' ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-white hover:bg-white/10'}`}
                title="按创建时间排序"
              >
                📅 创建
              </button>
            </div>

            {/* View Mode Toggle */}
            <div className="flex items-center gap-1 bg-[#1C1C1E] rounded-xl p-1 border border-white/5">
              <button
                onClick={() => setViewMode('grid')}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                  viewMode === 'grid' ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-white hover:bg-white/10'
                }`}
                title="9:16 卡片视图"
              >
                🧾 卡片
              </button>
              <button
                onClick={() => setViewMode('list')}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                  viewMode === 'list' ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-white hover:bg-white/10'
                }`}
                title="列表视图"
              >
                📋 列表
              </button>
            </div>
            
            {/* Result count */}
            {searchQuery && (
              <span className="text-xs text-gray-500">
                找到 {filteredProjects.length} 个项目
              </span>
            )}
          </div>
        </div>

        {/* Create Modal */}
        {isCreating && (
           <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-4 animate-in fade-in duration-200">
             <div className="bg-[#1C1C1E] border border-white/10 rounded-2xl w-[420px] overflow-hidden shadow-2xl scale-100 animate-in zoom-in-95 duration-200">
               <div className="p-6">
                 <h3 className="text-lg font-bold text-white mb-1">新建项目</h3>
                 <p className="text-xs text-gray-500 mb-2">在工作区创建新项目，所有数据保存在本地文件夹。</p>
                 
                 {/* Workspace Info */}
                 <div className="bg-green-500/10 border border-green-500/20 rounded-lg px-3 py-2 mb-6 flex items-center gap-2">
                   <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4 text-green-400">
                     <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 12.75V12A2.25 2.25 0 014.5 9.75h15A2.25 2.25 0 0121.75 12v.75m-8.69-6.44l-2.12-2.12a1.5 1.5 0 00-1.061-.44H4.5A2.25 2.25 0 002.25 6v12a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9a2.25 2.25 0 00-2.25-2.25h-5.379a1.5 1.5 0 01-1.06-.44z" />
                   </svg>
                   <span className="text-xs text-green-400 font-medium">📁 {workspaceName}</span>
                 </div>
                 
                 <div className="space-y-5">
                    {/* Cover Upload */}
                    <div className="space-y-2">
                        <label className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">项目封面 (可选)</label>
                        <div className="flex gap-2">
                          <button
                            type="button"
                            onClick={() => setNewCoverMode('upload')}
                            className={`px-3 py-1 rounded-full text-[10px] border transition-all ${
                              newCoverMode === 'upload'
                                ? 'bg-white text-black border-white'
                                : 'bg-[#252525] text-gray-400 border-white/10 hover:text-white'
                            }`}
                          >
                            上传图片
                          </button>
                          <button
                            type="button"
                            onClick={() => setNewCoverMode('url')}
                            className={`px-3 py-1 rounded-full text-[10px] border transition-all ${
                              newCoverMode === 'url'
                                ? 'bg-white text-black border-white'
                                : 'bg-[#252525] text-gray-400 border-white/10 hover:text-white'
                            }`}
                          >
                            网络地址
                          </button>
                        </div>
                        <div 
                          className="w-full h-40 rounded-xl bg-[#111] border-2 border-dashed border-white/10 flex flex-col items-center justify-center cursor-pointer hover:border-blue-500/50 transition-colors group overflow-hidden relative"
                          onClick={() => {
                            if (newCoverMode === 'upload') coverInputRef.current?.click();
                          }}
                        >
                            {newProjectCover ? (
                                <>
                                    <img src={newProjectCover} className="w-full h-full object-cover" alt="Cover Preview" />
                                    <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                                        <span className="text-xs font-bold text-white">{newCoverMode === 'upload' ? '点击更换' : '预览'}</span>
                                    </div>
                                </>
                            ) : (
                                <>
                                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-8 h-8 text-gray-600 group-hover:text-blue-400 mb-2 transition-colors">
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909m-18 3.75h16.5a1.5 1.5 0 001.5-1.5V6a1.5 1.5 0 00-1.5-1.5H3.75A1.5 1.5 0 002.25 6v12a1.5 1.5 0 001.5 1.5zm10.5-11.25h.008v.008h-.008V8.25zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z" />
                                    </svg>
                                    <span className="text-xs text-gray-500 group-hover:text-gray-300">{newCoverMode === 'upload' ? '点击上传封面' : '输入图片地址'}</span>
                                </>
                            )}
                            <input type="file" ref={coverInputRef} className="hidden" accept="image/*" onChange={handleCoverUpload} />
                        </div>
                        {newCoverMode === 'url' && (
                          <div className="space-y-1">
                            <input
                              value={newCoverUrl}
                              onChange={(e) => {
                                setNewCoverUrl(e.target.value);
                                setNewCoverUrlError('');
                              }}
                              onBlur={applyNewCoverUrl}
                              placeholder="https://example.com/cover.jpg"
                              className="w-full bg-[#111] border border-white/10 rounded px-3 py-2 text-xs text-gray-200 outline-none focus:border-blue-500/50"
                            />
                            {newCoverUrlError && (
                              <div className="text-[10px] text-red-400">{newCoverUrlError}</div>
                            )}
                            <div className="text-[10px] text-gray-600">支持 http/https 图片地址；也支持粘贴 data:image/...（体积较大，不推荐）。</div>
                          </div>
                        )}
                    </div>

                    <div className="space-y-2">
                        <label className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">项目名称 <span className="text-red-400">*</span></label>
                        <input 
                            autoFocus
                            type="text" 
                            value={newProjectName}
                            onChange={(e) => setNewProjectName(e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
                            placeholder="例如：赛博修仙传 第一季"
                            className="w-full bg-[#111] border border-white/10 text-white rounded-xl px-4 py-3 outline-none focus:border-blue-500 transition-colors text-sm placeholder-gray-600"
                        />
                    </div>
                 </div>
               </div>
               
               <div className="bg-[#222] p-4 flex justify-end gap-3 border-t border-white/5">
                  <button 
                    onClick={() => { setIsCreating(false); setNewProjectCover(undefined); setNewProjectName(""); }}
                    className="px-4 py-2 text-xs font-bold text-gray-400 hover:text-white transition-colors"
                  >
                    取消
                  </button>
                  <button 
                    onClick={handleCreate}
                    disabled={!newProjectName.trim()}
                    className="px-6 py-2 bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-blue-500 text-white rounded-lg text-xs font-bold shadow-lg shadow-blue-900/20"
                  >
                    确认创建
                  </button>
               </div>
             </div>
           </div>
        )}

        {/* Edit Project Modal */}
        {projectToEdit && (
           <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-4 animate-in fade-in duration-200">
             <div className="bg-[#1C1C1E] border border-white/10 rounded-2xl w-[420px] overflow-hidden shadow-2xl scale-100 animate-in zoom-in-95 duration-200">
               <div className="p-6">
                 <h3 className="text-lg font-bold text-white mb-4">编辑项目</h3>
                 
                 <div className="space-y-5">
                    <div className="space-y-2">
                        <label className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">项目封面</label>
                        <div className="flex gap-2">
                          <button
                            type="button"
                            onClick={() => setEditCoverMode('upload')}
                            className={`px-3 py-1 rounded-full text-[10px] border transition-all ${
                              editCoverMode === 'upload'
                                ? 'bg-white text-black border-white'
                                : 'bg-[#252525] text-gray-400 border-white/10 hover:text-white'
                            }`}
                          >
                            上传图片
                          </button>
                          <button
                            type="button"
                            onClick={() => setEditCoverMode('url')}
                            className={`px-3 py-1 rounded-full text-[10px] border transition-all ${
                              editCoverMode === 'url'
                                ? 'bg-white text-black border-white'
                                : 'bg-[#252525] text-gray-400 border-white/10 hover:text-white'
                            }`}
                          >
                            网络地址
                          </button>
                        </div>
                        <div 
                          className="w-full h-40 rounded-xl bg-[#111] border-2 border-dashed border-white/10 flex flex-col items-center justify-center cursor-pointer hover:border-blue-500/50 transition-colors group overflow-hidden relative"
                          onClick={() => {
                            if (editCoverMode === 'upload') editCoverInputRef.current?.click();
                          }}
                        >
                            {editCover ? (
                                <>
                                    <img src={editCover} className="w-full h-full object-cover" alt="Cover Preview" />
                                    <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                                        <span className="text-xs font-bold text-white">{editCoverMode === 'upload' ? '点击更换' : '预览'}</span>
                                    </div>
                                </>
                            ) : (
                                <span className="text-xs text-gray-500">点击上传封面</span>
                            )}
                            <input type="file" ref={editCoverInputRef} className="hidden" accept="image/*" onChange={handleEditCoverUpload} />
                        </div>
                        {editCoverMode === 'url' && (
                          <div className="space-y-1">
                            <input
                              value={editCoverUrl}
                              onChange={(e) => {
                                setEditCoverUrl(e.target.value);
                                setEditCoverUrlError('');
                              }}
                              onBlur={applyEditCoverUrl}
                              placeholder="https://example.com/cover.jpg"
                              className="w-full bg-[#111] border border-white/10 rounded px-3 py-2 text-xs text-gray-200 outline-none focus:border-blue-500/50"
                            />
                            {editCoverUrlError && (
                              <div className="text-[10px] text-red-400">{editCoverUrlError}</div>
                            )}
                            <div className="text-[10px] text-gray-600">支持 http/https 图片地址；也支持粘贴 data:image/...（体积较大，不推荐）。</div>
                          </div>
                        )}
                    </div>

                    <div className="space-y-2">
                        <label className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">项目名称</label>
                        <input 
                            type="text" 
                            value={editName}
                            onChange={(e) => setEditName(e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && executeEdit()}
                            className="w-full bg-[#111] border border-white/10 text-white rounded-xl px-4 py-3 outline-none focus:border-blue-500 transition-colors text-sm"
                        />
                    </div>
                 </div>
               </div>
               
               <div className="bg-[#222] p-4 flex justify-end gap-3 border-t border-white/5">
                  <button onClick={() => setProjectToEdit(null)} className="px-4 py-2 text-xs font-bold text-gray-400 hover:text-white">取消</button>
                  <button onClick={executeEdit} disabled={!editName.trim()} className="px-6 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-xs font-bold">保存修改</button>
               </div>
             </div>
           </div>
        )}

        {/* Delete Confirmation Modal */}
        {projectToDelete && (
            <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-in fade-in duration-200">
                <div className="bg-[#1C1C1E] border border-red-500/30 rounded-2xl w-[400px] overflow-hidden shadow-2xl scale-100 animate-in zoom-in-95 duration-200">
                    <div className="p-6 text-center">
                        <div className="w-16 h-16 bg-red-500/10 rounded-full flex items-center justify-center mx-auto mb-4 border border-red-500/20">
                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-8 h-8 text-red-500">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
                            </svg>
                        </div>
                        <h3 className="text-lg font-bold text-white mb-2">确认删除项目？</h3>
                        <p className="text-gray-400 text-sm mb-6 leading-relaxed">
                            您即将删除 <strong>{projectToDelete.name}</strong>。<br/>
                            此操作<span className="text-red-400 font-bold">无法撤销</span>，所有分卷剧本、设定图和资产将永久丢失。
                        </p>
                        <div className="flex gap-3 justify-center">
                            <button 
                                onClick={() => setProjectToDelete(null)} 
                                className="px-5 py-2 bg-[#252525] hover:bg-[#333] text-gray-300 rounded-lg text-xs font-bold transition-colors"
                            >
                                取消
                            </button>
                            <button 
                                onClick={executeDelete} 
                                disabled={isDeleting} 
                                className="px-5 py-2 bg-red-600 hover:bg-red-500 text-white rounded-lg text-xs font-bold shadow-lg shadow-red-900/20 flex items-center gap-2"
                            >
                                {isDeleting ? (
                                    <><span className="w-3 h-3 border-2 border-white/50 border-t-white rounded-full animate-spin"></span> 删除中...</>
                                ) : (
                                    '确认删除'
                                )}
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        )}

        {/* Project List Grid */}
        <div className="flex-1 overflow-y-auto custom-scrollbar pr-2 pb-20">
          {/* Loading State */}
          {isWorkspaceLoading ? (
             <div className="h-full w-full flex flex-col items-center justify-center">
                <div className="w-12 h-12 border-4 border-blue-500/30 border-t-blue-500 rounded-full animate-spin mb-4"></div>
                <p className="text-gray-400 text-sm">正在加载工作区...</p>
             </div>
          ) : !hasWorkspace ? (
             /* No Workspace Selected */
             <div className="h-full w-full flex flex-col items-center justify-center">
                <div className="max-w-lg w-full border-2 border-dashed border-blue-500/30 rounded-3xl bg-blue-500/5 p-10">
                    <div className="w-20 h-20 rounded-full bg-blue-500/10 flex items-center justify-center mb-6 text-4xl shadow-inner mx-auto">📁</div>
                    <h3 className="text-gray-200 font-bold text-xl text-center mb-2">选择工作区文件夹</h3>
                    <p className="text-sm text-gray-400 mb-8 text-center leading-relaxed">
                        所有项目将保存在工作区文件夹中，数据永久保留在您的电脑上。<br/>
                        <span className="text-gray-500">建议选择一个专门的空文件夹，如 "我的动漫项目"</span>
                    </p>
                    
                    <div className="flex justify-center">
                        <button 
                            onClick={onSelectWorkspace}
                            className="px-8 py-4 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-base font-bold shadow-lg shadow-blue-900/30 transition-all active:scale-95 flex items-center gap-3"
                        >
                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 12.75V12A2.25 2.25 0 014.5 9.75h15A2.25 2.25 0 0121.75 12v.75m-8.69-6.44l-2.12-2.12a1.5 1.5 0 00-1.061-.44H4.5A2.25 2.25 0 002.25 6v12a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9a2.25 2.25 0 00-2.25-2.25h-5.379a1.5 1.5 0 01-1.06-.44z" />
                            </svg>
                            选择工作区文件夹
                        </button>
                    </div>
                    
                    <p className="text-xs text-gray-600 text-center mt-6">
                        💡 下次打开时会自动恢复此工作区（需授权）
                    </p>
                </div>
             </div>
          ) : projects.length === 0 ? (
             /* Workspace selected but no projects */
             <div className="h-full w-full flex flex-col items-center justify-center">
                <div className="max-w-lg w-full border-2 border-dashed border-white/10 rounded-3xl bg-white/[0.02] p-10 mb-6">
                    <div className="w-20 h-20 rounded-full bg-[#1C1C1E] flex items-center justify-center mb-6 text-4xl opacity-50 shadow-inner mx-auto">📂</div>
                    <h3 className="text-gray-200 font-bold text-xl text-center">工作区为空</h3>
                    <p className="text-sm text-gray-500 mt-3 mb-8 text-center leading-relaxed">
                        在工作区 <strong className="text-green-400">{workspaceName}</strong> 中没有找到项目。<br/>
                        创建新项目或导入备份开始使用。
                    </p>
                    
                    <div className="flex gap-4 justify-center">
                        <button 
                            onClick={() => setIsCreating(true)}
                            className="px-6 py-3 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-sm font-bold shadow-lg shadow-blue-900/30 transition-all active:scale-95 flex items-center gap-2"
                        >
                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4"><path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" /></svg>
                            新建项目
                        </button>
                        <button 
                            onClick={() => fileInputRef.current?.click()}
                            className="px-6 py-3 bg-[#252525] hover:bg-[#333] border border-white/10 text-gray-300 hover:text-white rounded-xl text-sm font-bold transition-all flex items-center gap-2"
                        >
                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4"><path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" /></svg>
                            导入备份
                        </button>
                    </div>
                </div>
             </div>
          ) : filteredProjects.length === 0 ? (
             <div className="h-[300px] w-full flex flex-col items-center justify-center border-2 border-dashed border-white/5 rounded-3xl bg-white/[0.02]">
                <div className="w-16 h-16 rounded-full bg-[#1C1C1E] flex items-center justify-center mb-4 text-3xl opacity-40 shadow-inner">🔍</div>
                <h3 className="text-gray-300 font-bold text-base">未找到匹配项目</h3>
                <p className="text-xs text-gray-600 mt-2">尝试调整搜索关键词</p>
                <button 
                    onClick={() => setSearchQuery("")}
                    className="mt-4 px-4 py-2 bg-[#252525] hover:bg-[#2C2C2E] border border-white/10 rounded-lg text-xs font-bold text-gray-300 hover:text-white transition-all"
                >
                    清除搜索
                </button>
             </div>
          ) : viewMode === 'list' ? (
            <div className="space-y-3">
              {filteredProjects.map((project) => {
                const panelCount = countPanels(project);
                const episodeCount = countEpisodes(project);

                return (
                  <div
                    key={project.id}
                    onClick={() => onSelectProject(project.id)}
                    className="group bg-[#1C1C1E] rounded-2xl border border-white/5 overflow-hidden hover:border-blue-500/30 transition-all duration-200 cursor-pointer shadow-lg hover:shadow-2xl flex items-center gap-4 p-3"
                  >
                    <div className="w-[72px] shrink-0 rounded-xl overflow-hidden bg-[#111] aspect-[9/16]">
                      {project.coverImage && !failedCoverIds.has(project.id) ? (
                        <img
                          src={project.coverImage}
                          alt={project.name}
                          loading="lazy"
                          className="w-full h-full object-cover opacity-90 group-hover:opacity-100 transition-opacity duration-300"
                          onError={() => {
                            setFailedCoverIds(prev => {
                              const next = new Set(prev);
                              next.add(project.id);
                              return next;
                            });
                          }}
                        />
                      ) : (
                        <div className="w-full h-full bg-gradient-to-br from-[#222] to-[#151515] flex items-center justify-center relative overflow-hidden">
                          <span className="text-2xl font-black text-white/10 select-none">{project.name.charAt(0).toUpperCase()}</span>
                        </div>
                      )}
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="text-base font-bold text-gray-100 truncate group-hover:text-blue-400 transition-colors" title={project.name}>
                            {project.name}
                          </div>
                          <div className="mt-1 flex flex-wrap gap-2">
                            {project.volumes && project.volumes.length > 0 && (
                              <span className="text-[10px] font-medium bg-blue-500/10 text-blue-400 px-2 py-0.5 rounded-md border border-blue-500/20">
                                📚 {project.volumes.length} 卷
                              </span>
                            )}
                            {episodeCount > 0 && (
                              <span className="text-[10px] font-medium bg-green-500/10 text-green-400 px-2 py-0.5 rounded-md border border-green-500/20">
                                📺 {episodeCount} 集
                              </span>
                            )}
                            {panelCount > 0 && (
                              <span className="text-[10px] font-medium bg-orange-500/10 text-orange-400 px-2 py-0.5 rounded-md border border-orange-500/20">
                                🎬 {panelCount} 镜
                              </span>
                            )}
                            {project.assets?.length > 0 && (
                              <span className="text-[10px] font-medium bg-purple-500/10 text-purple-400 px-2 py-0.5 rounded-md border border-purple-500/20">
                                🎭 {project.assets.length} 资产
                              </span>
                            )}
                          </div>
                          <div className="mt-2 text-[10px] text-gray-600">
                            最后更新 {formatDate(project.lastModified || Date.now())}
                          </div>
                        </div>

                        <div className="flex items-center gap-2 shrink-0">
                          <button
                            onClick={(e) => handleExportClick(e, project)}
                            className="p-2 rounded-lg text-gray-400 hover:text-white hover:bg-white/5 border border-transparent hover:border-white/10 transition-colors"
                            title="导出"
                          >
                            ⬇
                          </button>
                          <button
                            onClick={(e) => handleEditClick(e, project)}
                            className="p-2 rounded-lg text-gray-400 hover:text-white hover:bg-white/5 border border-transparent hover:border-white/10 transition-colors"
                            title="编辑"
                          >
                            ✎
                          </button>
                          <button
                            onClick={(e) => handleDeleteClick(e, project)}
                            className="p-2 rounded-lg text-gray-500 hover:text-red-400 hover:bg-red-900/20 border border-transparent hover:border-red-500/20 transition-colors"
                            title="删除"
                          >
                            🗑
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6 gap-6">
                {filteredProjects.map((project) => {
                    const panelCount = countPanels(project);
                    const episodeCount = countEpisodes(project);
                    
                    return (
                    <div 
                        key={project.id}
                        onClick={() => onSelectProject(project.id)}
                        className="group relative bg-[#1C1C1E] rounded-2xl border border-white/5 overflow-hidden hover:border-blue-500/30 hover:-translate-y-1 transition-all duration-300 cursor-pointer shadow-lg hover:shadow-2xl flex flex-col"
                    >
                        {/* Cover Image Area */}
                        <div className="w-full bg-[#111] relative overflow-hidden shrink-0 aspect-[9/16]">
                            {project.coverImage && !failedCoverIds.has(project.id) ? (
                                <img
                                  src={project.coverImage}
                                  alt={project.name}
                                  loading="lazy"
                                  className="w-full h-full object-cover opacity-90 group-hover:opacity-100 transition-opacity duration-500 group-hover:scale-105"
                                  onError={() => {
                                    setFailedCoverIds(prev => {
                                      const next = new Set(prev);
                                      next.add(project.id);
                                      return next;
                                    });
                                  }}
                                />
                            ) : (
                                <div className="w-full h-full bg-gradient-to-br from-[#222] to-[#151515] flex items-center justify-center relative overflow-hidden">
                                    <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/cubes.png')] opacity-5"></div>
                                    <span className="text-6xl font-black text-white/5 select-none">{project.name.charAt(0).toUpperCase()}</span>
                                </div>
                            )}
                            
                            {/* Overlay Gradient */}
                            <div className="absolute inset-0 bg-gradient-to-t from-[#1C1C1E] via-transparent to-transparent opacity-90"></div>

                            {/* Active Style Badge */}
                            {project.activeStyle && (
                                <div className="absolute top-3 left-3">
                                    <span className="text-[9px] font-bold bg-purple-600/80 backdrop-blur-md text-white px-2 py-1 rounded-md border border-purple-400/20 shadow-sm">
                                        🎨 {project.activeStyle.name}
                                    </span>
                                </div>
                            )}
                        </div>

                        {/* Content Area */}
                        <div className="p-4 flex flex-col justify-between relative">
                            <div>
                                <h3 className="text-base font-bold text-gray-100 truncate group-hover:text-blue-400 transition-colors mb-2" title={project.name}>
                                    {project.name}
                                </h3>
                                
                                {/* Stats Row */}
                                <div className="flex flex-wrap gap-2 mb-3">
                                    {project.volumes && project.volumes.length > 0 && (
                                        <span className="text-[10px] font-medium bg-blue-500/10 text-blue-400 px-2 py-0.5 rounded-md border border-blue-500/20">
                                            📚 {project.volumes.length} 卷
                                        </span>
                                    )}
                                    {episodeCount > 0 && (
                                        <span className="text-[10px] font-medium bg-green-500/10 text-green-400 px-2 py-0.5 rounded-md border border-green-500/20">
                                            📺 {episodeCount} 集
                                        </span>
                                    )}
                                    {panelCount > 0 && (
                                        <span className="text-[10px] font-medium bg-orange-500/10 text-orange-400 px-2 py-0.5 rounded-md border border-orange-500/20">
                                            🎬 {panelCount} 镜
                                        </span>
                                    )}
                                    {project.assets && project.assets.length > 0 && (
                                        <span className="text-[10px] font-medium bg-purple-500/10 text-purple-400 px-2 py-0.5 rounded-md border border-purple-500/20">
                                            🎭 {project.assets.length} 资产
                                        </span>
                                    )}
                                </div>
                            </div>
                            
                            <div className="flex items-center justify-between pt-3 border-t border-white/5 mt-auto">
                                <div className="flex flex-col">
                                    <span className="text-[9px] text-gray-600 uppercase tracking-wider font-bold">最后更新</span>
                                    <span className="text-[10px] text-gray-400 font-medium">{formatDate(project.lastModified)}</span>
                                </div>
                                
                                {/* Hover Actions */}
                                <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-all translate-y-2 group-hover:translate-y-0">
                                    <button
                                        onClick={(e) => handleExportClick(e, project)}
                                        className="p-2 bg-[#252525] text-gray-400 hover:text-white rounded-lg hover:bg-[#333] transition-colors border border-white/5 hover:border-white/20"
                                        title="导出完整项目 (ZIP)"
                                    >
                                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4">
                                            <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
                                        </svg>
                                    </button>
                                    <button 
                                        onClick={(e) => handleEditClick(e, project)} 
                                        className="p-2 bg-[#252525] text-gray-400 hover:text-blue-400 rounded-lg hover:bg-blue-500/10 transition-colors border border-white/5 hover:border-blue-500/30" 
                                        title="编辑项目信息"
                                    >
                                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4"><path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10" /></svg>
                                    </button>
                                    <button
                                        onClick={(e) => handleDeleteClick(e, project)}
                                        className="p-2 bg-[#252525] text-gray-400 hover:text-red-400 rounded-lg hover:bg-red-500/10 transition-colors border border-white/5 hover:border-red-500/30"
                                        title="删除项目"
                                    >
                                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4">
                                            <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
                                        </svg>
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                    );
                })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};