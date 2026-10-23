import React, { useState } from 'react';
import { Project } from '../types';

interface DashboardProps {
  currentProject: Project | null;
  projects: Project[];
  onOpenFolder: () => void;
  onInitializeProject: (name: string) => void;
  onImportProject: (file: File) => void;
  onSelectProject: (id: string) => void;
  onDeleteProject: (id: string) => void;
  onUpdateProject: (id: string, name: string, cover?: string) => void;
  onExportProject: (project: Project) => void;
  onOpenSettings: () => void;
}

export const Dashboard: React.FC<DashboardProps> = ({ 
  currentProject, 
  projects = [],
  onOpenFolder, 
  onInitializeProject, 
  onImportProject,
  onSelectProject,
  onDeleteProject,
  onUpdateProject,
  onExportProject,
  onOpenSettings
}) => {
  const [newProjectName, setNewProjectName] = useState("");
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      onImportProject(file);
    }
    if (event.target.value) event.target.value = '';
  };

  return (
    <div className="flex flex-col h-full bg-[#121212] items-center justify-center p-8 text-white relative overflow-hidden">
        {/* Background Accents */}
        <div className="absolute top-0 left-0 w-full h-full overflow-hidden pointer-events-none">
            <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-blue-600/10 rounded-full blur-[100px]"></div>
            <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-purple-600/10 rounded-full blur-[100px]"></div>
        </div>

        <div className="z-10 max-w-2xl w-full flex flex-col items-center text-center space-y-8 animate-in fade-in slide-in-from-bottom-8 duration-500">
            {/* Logo / Branding */}
            <div className="w-24 h-24 bg-gradient-to-br from-blue-600 to-indigo-600 rounded-3xl flex items-center justify-center shadow-2xl shadow-blue-900/20 mb-4">
                <span className="text-4xl">📚</span>
            </div>
            
            <div>
                <h1 className="text-4xl font-bold tracking-tight mb-2">Auto-Manju Adapter</h1>
                <p className="text-gray-400 text-sm">专业的网文转漫剧/短剧辅助工作台</p>
            </div>

            {/* Main Action Card */}
            <div className="w-full bg-[#1C1C1E] border border-white/10 rounded-2xl p-8 shadow-2xl backdrop-blur-xl">
                <div className="flex flex-col gap-4">
                    <div className="space-y-2 text-left">
                        <label className="text-xs font-bold text-gray-500 uppercase tracking-wider ml-1">开始新项目 (Initialize)</label>
                        <div className="flex gap-2">
                            <input 
                                value={newProjectName}
                                onChange={(e) => setNewProjectName(e.target.value)}
                                placeholder="输入项目名称..."
                                className="flex-1 bg-[#111] border border-white/10 rounded-xl px-4 py-3 text-sm focus:border-blue-500 outline-none transition-all"
                            />
                            <button 
                                onClick={() => onInitializeProject(newProjectName)}
                                disabled={!newProjectName.trim()}
                                className="px-6 py-3 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-xl text-xs font-bold transition-all shadow-lg shadow-blue-900/20"
                            >
                                创建项目文件夹
                            </button>
                        </div>
                    </div>

                    <div className="relative flex items-center py-4">
                        <div className="flex-grow border-t border-white/5"></div>
                        <span className="flex-shrink-0 mx-4 text-gray-600 text-xs font-mono">OR</span>
                        <div className="flex-grow border-t border-white/5"></div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <button 
                            onClick={onOpenFolder}
                            className="p-4 bg-[#252525] hover:bg-[#2C2C2E] border border-white/5 rounded-xl text-left transition-all group"
                        >
                            <div className="w-8 h-8 rounded-full bg-white/5 flex items-center justify-center mb-3 group-hover:bg-blue-500/20 group-hover:text-blue-400 transition-colors text-gray-400">
                                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4"><path strokeLinecap="round" strokeLinejoin="round" d="M2.25 12.75V12A2.25 2.25 0 014.5 9.75h15A2.25 2.25 0 0121.75 12v.75m-8.69-6.44l-2.12-2.12a1.5 1.5 0 00-1.061-.44H4.5A2.25 2.25 0 002.25 6v12a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9a2.25 2.25 0 00-2.25-2.25h-5.379a1.5 1.5 0 01-1.06-.44z" /></svg>
                            </div>
                            <h3 className="text-sm font-bold text-gray-200">打开项目文件夹</h3>
                            <p className="text-[10px] text-gray-500 mt-1">加载本地文件系统中的现有项目</p>
                        </button>
                        
                        <button 
                            onClick={() => fileInputRef.current?.click()}
                            className="p-4 bg-[#252525] hover:bg-[#2C2C2E] border border-white/5 rounded-xl text-left transition-all group"
                        >
                            <div className="w-8 h-8 rounded-full bg-white/5 flex items-center justify-center mb-3 group-hover:bg-purple-500/20 group-hover:text-purple-400 transition-colors text-gray-400">
                                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4"><path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" /></svg>
                            </div>
                            <h3 className="text-sm font-bold text-gray-200">导入 ZIP 备份</h3>
                            <p className="text-[10px] text-gray-500 mt-1">从备份包恢复完整项目数据</p>
                            <input 
                                type="file" 
                                ref={fileInputRef}
                                style={{ display: 'none' }} 
                                accept=".zip"
                                onChange={handleFileChange}
                            />
                        </button>
                    </div>
                </div>
            </div>

            <div className="text-xs text-gray-600 font-mono">
                v1.2.0 • Local First Architecture
            </div>
        </div>
    </div>
  );
};