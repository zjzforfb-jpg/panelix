import React, { useState, useEffect } from 'react';
import { AppSettings, VeoModel } from '../types';
import { VEO_MODELS } from '../services/veoService';
import { VOLC_ARK_VIDEO_MODELS } from '../services/volcArkService';
import { SORA2_MODELS } from '../services/sora2Service';
import { BackupConfig, DEFAULT_BACKUP_CONFIG } from '../services/autoBackupService';
import { ProjectBackup } from '../db';

// All video models for unified selection
const ALL_VIDEO_MODELS = [
  // Veo models
  ...VEO_MODELS.map(m => ({ ...m, provider: 'veo' as const, icon: '🎬' })),
  // Sora models
  { id: 'sora2' as VeoModel, name: 'Sora 2', desc: '高质量视频生成', provider: 'sora' as const, icon: '🟢', maxImages: 1 },
  { id: 'sora2-turbo' as VeoModel, name: 'Sora 2 Turbo', desc: '快速生成', provider: 'sora' as const, icon: '🟢', maxImages: 1 },
  // Kling models
  { id: 'kling-v1' as VeoModel, name: '可灵 v1', desc: '标准版', provider: 'kling' as const, icon: '🎯', maxImages: 1 },
  { id: 'kling-v1.5' as VeoModel, name: '可灵 v1.5', desc: '增强版', provider: 'kling' as const, icon: '🎯', maxImages: 1 },
  // VolcEngine Seedance models
  ...VOLC_ARK_VIDEO_MODELS.map(m => ({ ...m, id: m.id as VeoModel, provider: 'volc' as const, icon: '🌋', maxImages: 2 })),
];

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  settings: AppSettings;
  onSave: (newSettings: AppSettings) => void;
  onChangeStorage?: () => void;
  // Backup configuration
  backupConfig?: BackupConfig;
  onUpdateBackupConfig?: (config: Partial<BackupConfig>) => void;
  onCreateBackup?: (description: string) => Promise<void>;
  getBackups?: () => Promise<ProjectBackup[]>;
  onRestoreBackup?: (backupId: string) => Promise<void>;
  onDeleteBackup?: (backupId: string) => Promise<void>;
}

// Model configurations with descriptions
const MODEL_PRESETS = {
  text: [
    { id: 'gemini-3-flash-preview-nothinking', name: 'Gemini 3 Flash (推荐)', desc: '⭐ 默认模型，速度快效果好' },
    { id: 'gemini-2.5-flash-nothinking', name: 'Gemini 2.5 Flash', desc: '稳定版本' },
    { id: 'gemini-1.5-pro', name: 'Gemini 1.5 Pro', desc: '长文本处理' },
    { id: 'gpt-4o', name: 'GPT-4o', desc: '最强大，适合复杂任务' },
    { id: 'gpt-4o-mini', name: 'GPT-4o Mini', desc: '性价比高，速度快' },
    { id: 'gpt-4-turbo', name: 'GPT-4 Turbo', desc: '稳定可靠' },
    { id: 'claude-3-5-sonnet', name: 'Claude 3.5 Sonnet', desc: '创意写作强' },
    { id: 'deepseek-chat', name: 'DeepSeek Chat', desc: '国产优选' },
    { id: 'qwen-max', name: '通义千问 Max', desc: '阿里云大模型' },
  ],
  // Text-to-Image models (文生图 - no reference images)
  txt2img: [
    { id: 'nano-banana-2-2k', name: 'Nano-Banana 2K (推荐)', desc: '🍌 文生图专用，2K分辨率' },
    { id: 'nano-banana-2-4k', name: 'Nano-Banana 4K', desc: '🍌 文生图专用，4K超高清' },
    { id: 'nano-banana-hd', name: 'Nano-Banana HD', desc: '🍌 高清版4K画质' },
    { id: 'nano-banana', name: 'Nano-Banana 基础', desc: '🍌 基础文生图' },
    { id: 'doubao-seedream-4-5-251128', name: 'Seedream 4.5 (火山)', desc: '🌋 最新款，支持组图/单图，多图融合' },
    { id: 'doubao-seedream-4-0-250828', name: 'Seedream 4.0 (火山)', desc: '🌋 支持组图/单图，多图融合' },
    { id: 'doubao-seedream-3-0-t2i-250415', name: 'Seedream 3.0 T2I (火山)', desc: '🌋 文生图专用' },
    { id: 'gemini-2.5-flash-image-preview', name: 'Gemini 图像', desc: 'Google Gemini 图像生成' },
    { id: 'dall-e-3', name: 'DALL-E 3', desc: '创意图像生成' },
    { id: 'midjourney-v6', name: 'Midjourney V6', desc: '艺术风格' },
    { id: 'stable-diffusion-xl', name: 'SD XL', desc: '开源可控' },
  ],
  // Image-to-Image models (图生图 - with reference images)
  img2img: [
    { id: 'nano-banana-2-2k', name: 'Nano-Banana 2K (推荐)', desc: '🍌 图生图专用，2K分辨率' },
    { id: 'nano-banana-2-4k', name: 'Nano-Banana 4K', desc: '🍌 图生图专用，4K超高清' },
    { id: 'nano-banana-hd', name: 'Nano-Banana HD', desc: '🍌 高清版4K画质' },
    { id: 'nano-banana', name: 'Nano-Banana 基础', desc: '🍌 基础图生图' },
    { id: 'doubao-seedream-4-5-251128', name: 'Seedream 4.5 (火山)', desc: '🌋 最新款，支持多图融合' },
    { id: 'doubao-seedream-4-0-250828', name: 'Seedream 4.0 (火山)', desc: '🌋 支持多图融合' },
    { id: 'doubao-seededit-3-0-i2i-250628', name: 'Seededit 3.0 I2I (火山)', desc: '🌋 图生图专用（待下线）' },
    { id: 'gemini-2.5-flash-image-preview', name: 'Gemini 图像', desc: 'Google Gemini (不支持图生图)' },
    { id: 'gpt-4o-image', name: 'GPT-4o 图像', desc: '高质量图像生成' },
  ],
  // Legacy 'image' for backward compatibility
  image: [
    { id: 'gemini-2.5-flash-image-preview', name: 'Gemini 图像 (推荐)', desc: '⭐ 默认图像模型' },
    { id: 'nano-banana-2-2k', name: 'Nano-Banana 2K', desc: '🍌 支持图生图，2K分辨率' },
    { id: 'nano-banana-2-4k', name: 'Nano-Banana 4K', desc: '🍌 支持图生图，4K超高清' },
    { id: 'nano-banana-hd', name: 'Nano-Banana HD', desc: '🍌 高清版4K画质' },
    { id: 'gpt-4o-image', name: 'GPT-4o 图像', desc: '高质量图像生成' },
    { id: 'dall-e-3', name: 'DALL-E 3', desc: '创意图像生成' },
    { id: 'midjourney-v6', name: 'Midjourney V6', desc: '艺术风格' },
    { id: 'stable-diffusion-xl', name: 'SD XL', desc: '开源可控' },
  ]
};

// Prompt configurations
const PROMPT_CONFIGS = [
  { 
    key: 'splitterPrompt', 
    label: '剧情拆解提示词', 
    desc: '用于将小说内容拆解为章节剧情大纲',
    icon: '📖',
    category: 'core'
  },
  { 
    key: 'breakdownPrompt', 
    label: '分镜生成提示词', 
    desc: '用于将剧情大纲转换为详细分镜描述',
    icon: '🎬',
    category: 'core'
  },
  { 
    key: 'writerPrompt', 
    label: '剧本生成提示词', 
    desc: '用于生成完整的漫画剧本内容',
    icon: '✍️',
    category: 'core'
  },
  { 
    key: 'alignerPrompt', 
    label: '一致性质检提示词', 
    desc: '用于检查剧本中的角色、场景一致性',
    icon: '🔍',
    category: 'core'
  },
  { 
    key: 'assetPrompt', 
    label: '资产描述提示词', 
    desc: '用于生成角色/场景/道具的视觉描述',
    icon: '🎨',
    category: 'visual'
  },
  { 
    key: 'stylePrompt', 
    label: '风格定义提示词', 
    desc: '用于定义整体画面风格和美术方向',
    icon: '🖌️',
    category: 'visual'
  },
  { 
    key: 'archivistPrompt', 
    label: '归档整理提示词', 
    desc: '用于整理和归档项目内容',
    icon: '📁',
    category: 'util'
  },
];

export const SettingsModal: React.FC<SettingsModalProps> = ({ 
  isOpen, 
  onClose, 
  settings, 
  onSave, 
  onChangeStorage,
  backupConfig = DEFAULT_BACKUP_CONFIG,
  onUpdateBackupConfig,
  onCreateBackup,
  getBackups,
  onRestoreBackup,
  onDeleteBackup
}) => {
  const [formData, setFormData] = useState<AppSettings>({
    ...settings,
    customModels: settings.customModels || []
  });
  const [newModelName, setNewModelName] = useState("");
  const [activeTab, setActiveTab] = useState<'models' | 'video' | 'prompts' | 'backup'>('models');
  const [videoProviderTab, setVideoProviderTab] = useState<'veo' | 'sora' | 'volc'>('veo');
  const [promptCategory, setPromptCategory] = useState<'all' | 'core' | 'visual' | 'util'>('all');
  const [expandedPrompt, setExpandedPrompt] = useState<string | null>(null);
  
  // Backup state
  const [localBackupConfig, setLocalBackupConfig] = useState<BackupConfig>(backupConfig);
  const [backups, setBackups] = useState<ProjectBackup[]>([]);
  const [loadingBackups, setLoadingBackups] = useState(false);
  const [creatingBackup, setCreatingBackup] = useState(false);
  
  // Load backups when tab is selected
  useEffect(() => {
    if (activeTab === 'backup' && getBackups) {
      setLoadingBackups(true);
      getBackups().then(setBackups).finally(() => setLoadingBackups(false));
    }
  }, [activeTab, getBackups]);
  
  // Sync backup config
  useEffect(() => {
    setLocalBackupConfig(backupConfig);
  }, [backupConfig]);

  useEffect(() => {
    if (isOpen) {
      setFormData({ ...settings, customModels: settings.customModels || [] });
    }
  }, [isOpen, settings]);

  if (!isOpen) return null;

  const handleChange = (key: keyof AppSettings, value: string | string[] | boolean) => {
    setFormData(prev => ({ ...prev, [key]: value }));
  };

  const handleAddCustomModel = () => {
    if (!newModelName.trim()) return;
    setFormData(prev => ({
      ...prev,
      customModels: [...prev.customModels, newModelName.trim()]
    }));
    setNewModelName("");
  };

  const handleRemoveCustomModel = (model: string) => {
    setFormData(prev => ({
      ...prev,
      customModels: prev.customModels.filter(m => m !== model)
    }));
  };

  const filteredPrompts = promptCategory === 'all' 
    ? PROMPT_CONFIGS 
    : PROMPT_CONFIGS.filter(p => p.category === promptCategory);

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 backdrop-blur-md">
      <div className="w-[900px] h-[85vh] bg-[#1a1a1a] border border-white/10 rounded-2xl shadow-2xl flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        
        {/* Header */}
        <div className="h-16 px-8 bg-gradient-to-r from-[#252525] to-[#1f1f1f] border-b border-white/5 flex items-center justify-between shrink-0">
          <h2 className="text-lg font-bold text-gray-100 flex items-center gap-3">
            <span className="w-8 h-8 bg-blue-600/20 rounded-lg flex items-center justify-center">⚙️</span>
            全局设置
          </h2>
          <div className="flex gap-2">
            <button 
              onClick={onChangeStorage}
              className="px-4 py-2 bg-[#333] hover:bg-[#444] text-gray-300 text-xs rounded-lg transition-colors flex items-center gap-2"
            >
              <span>💾</span> 切换存储模式
            </button>
            <button 
              onClick={onClose} 
              className="w-8 h-8 rounded-lg flex items-center justify-center bg-[#333] text-gray-400 hover:text-white hover:bg-red-500/20 transition-colors"
            >
              ✕
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-white/5 bg-[#1f1f1f]">
          <button 
            onClick={() => setActiveTab('models')}
            className={`flex-1 py-4 text-sm font-bold transition-all flex items-center justify-center gap-2 ${
              activeTab === 'models' 
                ? 'text-blue-400 border-b-2 border-blue-500 bg-[#252525]' 
                : 'text-gray-500 hover:text-gray-300 hover:bg-white/5'
            }`}
          >
            <span>🤖</span> 模型配置
          </button>
          <button 
            onClick={() => setActiveTab('video')}
            className={`flex-1 py-4 text-sm font-bold transition-all flex items-center justify-center gap-2 ${
              activeTab === 'video' 
                ? 'text-purple-400 border-b-2 border-purple-500 bg-[#252525]' 
                : 'text-gray-500 hover:text-gray-300 hover:bg-white/5'
            }`}
          >
            <span>🎬</span> 视频生成
          </button>
          <button 
            onClick={() => setActiveTab('prompts')}
            className={`flex-1 py-4 text-sm font-bold transition-all flex items-center justify-center gap-2 ${
              activeTab === 'prompts' 
                ? 'text-blue-400 border-b-2 border-blue-500 bg-[#252525]' 
                : 'text-gray-500 hover:text-gray-300 hover:bg-white/5'
            }`}
          >
            <span>📝</span> 提示词工程
          </button>
          <button 
            onClick={() => setActiveTab('backup')}
            className={`flex-1 py-4 text-sm font-bold transition-all flex items-center justify-center gap-2 ${
              activeTab === 'backup' 
                ? 'text-green-400 border-b-2 border-green-500 bg-[#252525]' 
                : 'text-gray-500 hover:text-gray-300 hover:bg-white/5'
            }`}
          >
            <span>💾</span> 备份管理
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto custom-scrollbar">
          
          {/* Models Tab */}
          {activeTab === 'models' && (
            <div className="p-8 space-y-8">
              {/* Text Models Section */}
              <div className="space-y-6">
                <div className="flex items-center gap-3 pb-3 border-b border-white/5">
                  <span className="w-8 h-8 bg-purple-500/20 rounded-lg flex items-center justify-center text-purple-300">💬</span>
                  <div>
                    <h3 className="text-sm font-bold text-white">文本生成模型</h3>
                    <p className="text-[10px] text-gray-500">用于剧情拆解、剧本生成、质量检查等文本处理任务</p>
                  </div>
                </div>
                
                <div className="grid grid-cols-2 gap-4">
                  {/* Splitter Model */}
                  <div className="bg-[#222] rounded-xl p-4 border border-white/5 hover:border-white/10 transition-colors">
                    <label className="flex items-center gap-2 text-xs font-bold text-gray-300 mb-3">
                      <span className="w-5 h-5 bg-blue-500/20 rounded flex items-center justify-center text-[10px]">📖</span>
                      剧情拆解模型
                    </label>
                    <select 
                      value={formData.splitterModel}
                      onChange={(e) => handleChange('splitterModel', e.target.value)}
                      className="w-full bg-[#111] border border-white/10 rounded-lg px-3 py-2.5 text-sm text-white focus:border-blue-500 outline-none cursor-pointer"
                    >
                      <optgroup label="预设模型">
                        {MODEL_PRESETS.text.map(m => (
                          <option key={m.id} value={m.id}>{m.name} - {m.desc}</option>
                        ))}
                      </optgroup>
                      {formData.customModels.length > 0 && (
                        <optgroup label="自定义模型">
                          {formData.customModels.map(m => (
                            <option key={m} value={m}>{m}</option>
                          ))}
                        </optgroup>
                      )}
                    </select>
                  </div>

                  {/* Writer Model */}
                  <div className="bg-[#222] rounded-xl p-4 border border-white/5 hover:border-white/10 transition-colors">
                    <label className="flex items-center gap-2 text-xs font-bold text-gray-300 mb-3">
                      <span className="w-5 h-5 bg-green-500/20 rounded flex items-center justify-center text-[10px]">✍️</span>
                      剧本生成模型
                    </label>
                    <select 
                      value={formData.writerModel}
                      onChange={(e) => handleChange('writerModel', e.target.value)}
                      className="w-full bg-[#111] border border-white/10 rounded-lg px-3 py-2.5 text-sm text-white focus:border-blue-500 outline-none cursor-pointer"
                    >
                      <optgroup label="预设模型">
                        {MODEL_PRESETS.text.map(m => (
                          <option key={m.id} value={m.id}>{m.name} - {m.desc}</option>
                        ))}
                      </optgroup>
                      {formData.customModels.length > 0 && (
                        <optgroup label="自定义模型">
                          {formData.customModels.map(m => (
                            <option key={m} value={m}>{m}</option>
                          ))}
                        </optgroup>
                      )}
                    </select>
                  </div>

                  {/* Aligner Model */}
                  <div className="bg-[#222] rounded-xl p-4 border border-white/5 hover:border-white/10 transition-colors">
                    <label className="flex items-center gap-2 text-xs font-bold text-gray-300 mb-3">
                      <span className="w-5 h-5 bg-yellow-500/20 rounded flex items-center justify-center text-[10px]">🔍</span>
                      一致性质检模型
                    </label>
                    <select 
                      value={formData.alignerModel}
                      onChange={(e) => handleChange('alignerModel', e.target.value)}
                      className="w-full bg-[#111] border border-white/10 rounded-lg px-3 py-2.5 text-sm text-white focus:border-blue-500 outline-none cursor-pointer"
                    >
                      <optgroup label="预设模型">
                        {MODEL_PRESETS.text.map(m => (
                          <option key={m.id} value={m.id}>{m.name} - {m.desc}</option>
                        ))}
                      </optgroup>
                      {formData.customModels.length > 0 && (
                        <optgroup label="自定义模型">
                          {formData.customModels.map(m => (
                            <option key={m} value={m}>{m}</option>
                          ))}
                        </optgroup>
                      )}
                    </select>
                  </div>

                  {/* Aligner Model placeholder - grid needs 4 items */}
                </div>
              </div>

              {/* Second-Person Explain Mode Section */}
              <div className="space-y-4">
                <div className="flex items-center gap-3 pb-3 border-b border-white/5">
                  <span className="w-8 h-8 bg-orange-500/20 rounded-lg flex items-center justify-center text-orange-300">🎙️</span>
                  <div>
                    <h3 className="text-sm font-bold text-white">第二人称讲解模式</h3>
                    <p className="text-[10px] text-gray-500">启用后，剧本生成将采用双 Agent 链（讲解 → 分镜），输出第二人称口播稿 + 结构化分镜</p>
                  </div>
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Enable Toggle */}
                  <div className="bg-[#222] rounded-xl p-4 border border-white/5 hover:border-white/10 transition-colors">
                    <label className="flex items-center gap-3 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={formData.enableSecondPersonExplain === true}
                        onChange={(e) => setFormData(prev => ({ ...prev, enableSecondPersonExplain: e.target.checked }))}
                        className="w-5 h-5 rounded bg-[#111] border border-white/20 text-orange-500 focus:ring-orange-500"
                      />
                      <div>
                        <span className="text-sm font-bold text-white">启用第二人称讲解</span>
                        <p className="text-[10px] text-gray-500 mt-0.5">生成"你"视角的沉浸式讲解稿 + 视觉分镜</p>
                      </div>
                    </label>
                  </div>
                  
                  {/* Explain Model (optional override) */}
                  <div className="bg-[#222] rounded-xl p-4 border border-white/5 hover:border-white/10 transition-colors">
                    <label className="flex items-center gap-2 text-xs font-bold text-gray-300 mb-3">
                      <span className="w-5 h-5 bg-orange-500/20 rounded flex items-center justify-center text-[10px]">🤖</span>
                      讲解 Agent 模型（可选）
                    </label>
                    <select 
                      value={formData.explainModel || ''}
                      onChange={(e) => setFormData(prev => ({ ...prev, explainModel: e.target.value || undefined }))}
                      className="w-full bg-[#111] border border-white/10 rounded-lg px-3 py-2.5 text-sm text-white focus:border-orange-500 outline-none cursor-pointer"
                    >
                      <option value="">使用剧本生成模型</option>
                      <optgroup label="预设模型">
                        {MODEL_PRESETS.text.map(m => (
                          <option key={m.id} value={m.id}>{m.name}</option>
                        ))}
                      </optgroup>
                      {formData.customModels.length > 0 && (
                        <optgroup label="自定义模型">
                          {formData.customModels.map(m => (
                            <option key={m} value={m}>{m}</option>
                          ))}
                        </optgroup>
                      )}
                    </select>
                    <p className="text-[10px] text-gray-500 mt-2">留空则使用"剧本生成模型"</p>
                  </div>
                  
                  {/* Beats Count */}
                  <div className="bg-[#222] rounded-xl p-4 border border-white/5 hover:border-white/10 transition-colors">
                    <label className="flex items-center gap-2 text-xs font-bold text-gray-300 mb-3">
                      <span className="w-5 h-5 bg-orange-500/20 rounded flex items-center justify-center text-[10px]">🎯</span>
                      推荐 Beats 数量
                    </label>
                    <input
                      type="number"
                      min={4}
                      max={12}
                      value={formData.explainBeatsCount || 8}
                      onChange={(e) => setFormData(prev => ({ ...prev, explainBeatsCount: parseInt(e.target.value) || 8 }))}
                      className="w-full bg-[#111] border border-white/10 rounded-lg px-3 py-2.5 text-sm text-white focus:border-orange-500 outline-none"
                    />
                    <p className="text-[10px] text-gray-500 mt-2">每个 beat 约对应 1 个分镜（推荐 6-10）</p>
                  </div>
                  
                  {/* Panel Count */}
                  <div className="bg-[#222] rounded-xl p-4 border border-white/5 hover:border-white/10 transition-colors">
                    <label className="flex items-center gap-2 text-xs font-bold text-gray-300 mb-3">
                      <span className="w-5 h-5 bg-orange-500/20 rounded flex items-center justify-center text-[10px]">📊</span>
                      推荐分镜数量
                    </label>
                    <input
                      type="number"
                      min={4}
                      max={16}
                      value={formData.explainPanelCount || 8}
                      onChange={(e) => setFormData(prev => ({ ...prev, explainPanelCount: parseInt(e.target.value) || 8 }))}
                      className="w-full bg-[#111] border border-white/10 rounded-lg px-3 py-2.5 text-sm text-white focus:border-orange-500 outline-none"
                    />
                    <p className="text-[10px] text-gray-500 mt-2">剧本生成时的默认分镜数量（推荐 6-12）</p>
                  </div>
                </div>
              </div>

              {/* Video Models Section */}
              <div className="space-y-6">
                <div className="flex items-center gap-3 pb-3 border-b border-white/5">
                  <span className="w-8 h-8 bg-purple-500/20 rounded-lg flex items-center justify-center text-purple-300">🎬</span>
                  <div>
                    <h3 className="text-sm font-bold text-white">视频生成模型</h3>
                    <p className="text-[10px] text-gray-500">选择默认的视频生成模型，支持 Veo、Sora、可灵、火山引擎</p>
                  </div>
                </div>
                
                <div className="bg-[#222] rounded-xl p-4 border border-white/5 hover:border-white/10 transition-colors">
                  <label className="flex items-center gap-2 text-xs font-bold text-gray-300 mb-3">
                    <span className="w-5 h-5 bg-purple-500/20 rounded flex items-center justify-center text-[10px]">🎥</span>
                    默认视频模型
                  </label>
                  <select 
                    value={formData.veoModel || 'veo3.1'}
                    onChange={(e) => handleChange('veoModel', e.target.value as VeoModel)}
                    className="w-full bg-[#111] border border-white/10 rounded-lg px-3 py-2.5 text-sm text-white focus:border-purple-500 outline-none cursor-pointer"
                  >
                    <optgroup label="Veo (Google)">
                      {VEO_MODELS.map(m => (
                        <option key={m.id} value={m.id}>{m.name} - {m.desc}</option>
                      ))}
                    </optgroup>
                    <optgroup label="Sora (OpenAI)">
                      <option value="sora2">Sora 2 - 高质量视频生成</option>
                      <option value="sora2-turbo">Sora 2 Turbo - 快速生成</option>
                    </optgroup>
                    <optgroup label="可灵 (快手)">
                      <option value="kling-v1">可灵 v1 - 标准版</option>
                      <option value="kling-v1.5">可灵 v1.5 - 增强版</option>
                    </optgroup>
                    <optgroup label="火山引擎 Seedance (字节)">
                      {VOLC_ARK_VIDEO_MODELS.map(m => (
                        <option key={m.id} value={m.id}>{m.name} - {m.desc}</option>
                      ))}
                    </optgroup>
                  </select>
                  <div className="flex items-center gap-2 text-[9px] text-gray-600 mt-2">
                    <span className={`px-1.5 py-0.5 rounded ${
                      (formData.veoModel || 'veo3.1').startsWith('veo') ? 'bg-blue-500/20 text-blue-400' :
                      (formData.veoModel || 'veo3.1').startsWith('sora') ? 'bg-green-500/20 text-green-400' :
                      (formData.veoModel || 'veo3.1').startsWith('kling') ? 'bg-orange-500/20 text-orange-400' :
                      (formData.veoModel || 'veo3.1').startsWith('doubao') ? 'bg-red-500/20 text-red-400' :
                      'bg-gray-500/20 text-gray-400'
                    }`}>
                      {(formData.veoModel || 'veo3.1').startsWith('veo') ? 'VEO' :
                       (formData.veoModel || 'veo3.1').startsWith('sora') ? 'SORA' :
                       (formData.veoModel || 'veo3.1').startsWith('kling') ? 'KLING' :
                       (formData.veoModel || 'veo3.1').startsWith('doubao') ? 'VOLCENGINE' :
                       'OTHER'}
                    </span>
                    <span>此模型将同步到视频生成页面</span>
                  </div>
                </div>
              </div>

              {/* Image Models Section */}
              <div className="space-y-6">
                <div className="flex items-center gap-3 pb-3 border-b border-white/5">
                  <span className="w-8 h-8 bg-pink-500/20 rounded-lg flex items-center justify-center text-pink-300">🎨</span>
                  <div>
                    <h3 className="text-sm font-bold text-white">图像生成模型</h3>
                    <p className="text-[10px] text-gray-500">文生图（无参考图）和图生图（有参考图）使用不同的接口</p>
                  </div>
                </div>
                
                <div className="grid grid-cols-2 gap-4">
                  {/* Text-to-Image Model (文生图) */}
                  <div className="bg-[#222] rounded-xl p-4 border border-white/5 hover:border-white/10 transition-colors">
                    <label className="flex items-center gap-2 text-xs font-bold text-gray-300 mb-3">
                      <span className="w-5 h-5 bg-blue-500/20 rounded flex items-center justify-center text-[10px]">✏️</span>
                      文生图模型
                      <span className="text-[9px] text-gray-600 font-normal">无参考图</span>
                    </label>
                    <select 
                      value={formData.txt2imgModel || 'nano-banana-2-2k'}
                      onChange={(e) => handleChange('txt2imgModel', e.target.value)}
                      className="w-full bg-[#111] border border-white/10 rounded-lg px-3 py-2.5 text-sm text-white focus:border-blue-500 outline-none cursor-pointer"
                    >
                      <optgroup label="Nano-Banana 系列 (推荐)">
                        {MODEL_PRESETS.txt2img.filter(m => m.id.startsWith('nano-banana')).map(m => (
                          <option key={m.id} value={m.id}>{m.name} - {m.desc}</option>
                        ))}
                      </optgroup>
                      <optgroup label="其他模型">
                        {MODEL_PRESETS.txt2img.filter(m => !m.id.startsWith('nano-banana')).map(m => (
                          <option key={m.id} value={m.id}>{m.name} - {m.desc}</option>
                        ))}
                      </optgroup>
                      {formData.customModels.length > 0 && (
                        <optgroup label="自定义模型">
                          {formData.customModels.map(m => (
                            <option key={m} value={m}>{m}</option>
                          ))}
                        </optgroup>
                      )}
                    </select>
                    <p className="text-[9px] text-gray-600 mt-2">
                      💡 使用 /v1/images/generations (JSON)
                    </p>
                  </div>

                  {/* Image-to-Image Model (图生图) */}
                  <div className="bg-[#222] rounded-xl p-4 border border-white/5 hover:border-white/10 transition-colors">
                    <label className="flex items-center gap-2 text-xs font-bold text-gray-300 mb-3">
                      <span className="w-5 h-5 bg-pink-500/20 rounded flex items-center justify-center text-[10px]">🖼️</span>
                      图生图模型
                      <span className="text-[9px] text-gray-600 font-normal">有参考图</span>
                    </label>
                    <select 
                      value={formData.imageModel}
                      onChange={(e) => handleChange('imageModel', e.target.value)}
                      className="w-full bg-[#111] border border-white/10 rounded-lg px-3 py-2.5 text-sm text-white focus:border-blue-500 outline-none cursor-pointer"
                    >
                      <optgroup label="Nano-Banana 系列 (推荐)">
                        {MODEL_PRESETS.img2img.filter(m => m.id.startsWith('nano-banana')).map(m => (
                          <option key={m.id} value={m.id}>{m.name} - {m.desc}</option>
                        ))}
                      </optgroup>
                      <optgroup label="其他模型">
                        {MODEL_PRESETS.img2img.filter(m => !m.id.startsWith('nano-banana')).map(m => (
                          <option key={m.id} value={m.id}>{m.name} - {m.desc}</option>
                        ))}
                      </optgroup>
                      {formData.customModels.length > 0 && (
                        <optgroup label="自定义模型">
                          {formData.customModels.map(m => (
                            <option key={m} value={m}>{m}</option>
                          ))}
                        </optgroup>
                      )}
                    </select>
                    <p className="text-[9px] text-gray-600 mt-2">
                      💡 使用 /v1/images/edits (multipart/form-data)
                    </p>
                  </div>
                </div>

                {/* Storyboard / Shot Prompt Language */}
                <div className="bg-[#222] rounded-xl p-4 border border-white/5 hover:border-white/10 transition-colors">
                  <label className="flex items-center gap-2 text-xs font-bold text-gray-300 mb-3">
                    <span className="w-5 h-5 bg-purple-500/20 rounded flex items-center justify-center text-[10px]">🈶</span>
                    分镜提示词语言（Shot）
                  </label>
                  <select
                    value={formData.shotPromptLanguage || 'bilingual'}
                    onChange={(e) => handleChange('shotPromptLanguage', e.target.value)}
                    className="w-full bg-[#111] border border-white/10 rounded-lg px-3 py-2.5 text-sm text-white focus:border-blue-500 outline-none cursor-pointer"
                  >
                    <option value="bilingual">中文正文 + 英文硬约束（推荐）</option>
                    <option value="zh">全中文（不推荐，可能降低禁令服从度）</option>
                  </select>
                  <p className="text-[10px] text-gray-600 mt-2">
                    说明：画面内容可中文描述；“禁止文字/禁止分镜格/单帧输出”等硬约束建议保留英文以提高模型遵循度。
                  </p>
                </div>

                {/* Sound Notifications */}
                <div className="bg-[#222] rounded-xl p-4 border border-white/5 hover:border-white/10 transition-colors">
                  <label className="flex items-center gap-2 text-xs font-bold text-gray-300 mb-3">
                    <span className="w-5 h-5 bg-green-500/20 rounded flex items-center justify-center text-[10px]">🔔</span>
                    声音提醒
                  </label>
                  <label className="flex items-center gap-3 cursor-pointer mb-3">
                    <input 
                      type="checkbox"
                      checked={formData.soundEnabled ?? true}
                      onChange={(e) => handleChange('soundEnabled', e.target.checked)}
                      className="w-5 h-5 rounded bg-[#111] border border-white/20 text-green-500 focus:ring-green-500"
                    />
                    <span className="text-sm text-white">启用生成完成声音提醒</span>
                  </label>
                  {formData.soundEnabled && (
                    <div className="mt-3">
                      <label className="text-[10px] text-gray-500 block mb-2">音量</label>
                      <input
                        type="range"
                        min="0"
                        max="1"
                        step="0.1"
                        value={formData.soundVolume ?? 1.0}
                        onChange={(e) => handleChange('soundVolume', parseFloat(e.target.value))}
                        className="w-full h-2 bg-[#111] rounded-lg appearance-none cursor-pointer accent-green-500"
                      />
                      <div className="flex justify-between text-[9px] text-gray-600 mt-1">
                        <span>静音</span>
                        <span className="font-medium">{Math.round((formData.soundVolume ?? 1.0) * 100)}%</span>
                        <span>最大</span>
                      </div>
                    </div>
                  )}
                  <p className="text-[10px] text-gray-600 mt-2">
                    资产、分镜图、视频生成完成时会播放不同音调的声音提醒
                  </p>
                </div>
              </div>

              {/* Custom Models Section */}
              <div className="space-y-4">
                <div className="flex items-center gap-3 pb-3 border-b border-white/5">
                  <span className="w-8 h-8 bg-orange-500/20 rounded-lg flex items-center justify-center text-orange-300">➕</span>
                  <div>
                    <h3 className="text-sm font-bold text-white">自定义模型</h3>
                    <p className="text-[10px] text-gray-500">添加不在预设列表中的模型名称</p>
                  </div>
                </div>

                <div className="flex gap-3">
                  <input 
                    value={newModelName}
                    onChange={(e) => setNewModelName(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleAddCustomModel()}
                    className="flex-1 bg-[#111] border border-white/10 rounded-lg px-4 py-2.5 text-sm text-white outline-none focus:border-blue-500"
                    placeholder="输入模型名称，例如: gpt-4-turbo-2024-04-09"
                  />
                  <button 
                    onClick={handleAddCustomModel}
                    disabled={!newModelName.trim()}
                    className="px-6 py-2.5 bg-blue-600 hover:bg-blue-500 disabled:bg-gray-700 disabled:text-gray-500 text-white rounded-lg text-sm font-bold transition-colors"
                  >
                    添加
                  </button>
                </div>

                {/* Custom Models List */}
                {formData.customModels.length > 0 && (
                  <div className="flex flex-wrap gap-2 mt-3">
                    {formData.customModels.map(model => (
                      <div 
                        key={model}
                        className="flex items-center gap-2 bg-[#333] px-3 py-1.5 rounded-lg text-xs text-gray-300 group"
                      >
                        <span>{model}</span>
                        <button 
                          onClick={() => handleRemoveCustomModel(model)}
                          className="w-4 h-4 rounded-full bg-red-500/20 text-red-400 hover:bg-red-500 hover:text-white flex items-center justify-center text-[10px] opacity-0 group-hover:opacity-100 transition-opacity"
                        >
                          ×
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Video Tab - with Provider Sub-tabs */}
          {activeTab === 'video' && (
            <div className="flex flex-col h-full">
              {/* Auto Director (稳高级自动镜头) */}
              <div className="px-6 pt-4">
                <div className="bg-[#181818] rounded-xl border border-white/5 p-4 space-y-3">
                  <div className="flex items-center gap-2">
                    <span className="text-sm">🎬</span>
                    <div>
                      <h3 className="text-sm font-bold text-white">自动导演（稳高级）</h3>
                      <p className="text-[10px] text-gray-500">一键生成镜头计划→时间轴→视频，镜头更稳、运镜克制</p>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <label className="text-[11px] text-gray-400">单个分镜默认时长（秒）</label>
                      <input
                        type="number"
                        min={2}
                        max={30}
                        value={formData.autoVideoPanelDurationSec ?? 10}
                        onChange={(e) => setFormData(prev => ({ ...prev, autoVideoPanelDurationSec: Number(e.target.value) || 10 }))}
                        className="w-full bg-[#111] border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:border-blue-500 outline-none"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[11px] text-gray-400">镜头数量范围（最少-最多）</label>
                      <div className="grid grid-cols-2 gap-2">
                        <input
                          type="number"
                          min={3}
                          max={20}
                          value={formData.autoVideoShotCountMin ?? 6}
                          onChange={(e) => setFormData(prev => ({ ...prev, autoVideoShotCountMin: Number(e.target.value) || 6 }))}
                          className="w-full bg-[#111] border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:border-blue-500 outline-none"
                        />
                        <input
                          type="number"
                          min={3}
                          max={20}
                          value={formData.autoVideoShotCountMax ?? 10}
                          onChange={(e) => setFormData(prev => ({ ...prev, autoVideoShotCountMax: Number(e.target.value) || 10 }))}
                          className="w-full bg-[#111] border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:border-blue-500 outline-none"
                        />
                      </div>
                      <p className="text-[10px] text-gray-600">默认 6-10，运镜偏稳、动态镜头不超过2个</p>
                    </div>
                    <div className="space-y-1">
                      <label className="text-[11px] text-gray-400">生成前确认镜头计划</label>
                      <label className="flex items-center gap-2 text-sm text-white">
                        <input
                          type="checkbox"
                          checked={formData.autoVideoConfirmBeforeGenerate !== false}
                          onChange={(e) => setFormData(prev => ({ ...prev, autoVideoConfirmBeforeGenerate: e.target.checked }))}
                          className="w-4 h-4 rounded bg-[#111] border border-white/20 text-blue-500 focus:ring-blue-500"
                        />
                        生成前弹出镜头表与提示词预览
                      </label>
                    </div>
                  </div>
                </div>
              </div>

              {/* Provider Sub-tabs */}
              <div className="flex border-b border-white/10 bg-[#1a1a1a] px-6 pt-4">
                {[
                  { id: 'veo', label: 'Veo', icon: '🎬', color: 'purple' },
                  { id: 'sora', label: 'Sora', icon: '🟢', color: 'green' },
                  { id: 'volc', label: '火山', icon: '🌋', color: 'orange' },
                ].map(t => (
                  <button
                    key={t.id}
                    onClick={() => setVideoProviderTab(t.id as 'veo' | 'sora' | 'volc')}
                    className={`px-5 py-2.5 text-sm font-bold rounded-t-lg transition-all flex items-center gap-2 ${
                      videoProviderTab === t.id
                        ? `bg-[#252525] text-${t.color}-400 border-t border-x border-white/10`
                        : 'text-gray-500 hover:text-gray-300 hover:bg-white/5'
                    }`}
                  >
                    <span>{t.icon}</span>
                    {t.label}
                  </button>
                ))}
              </div>

              {/* Veo Tab Content */}
              {videoProviderTab === 'veo' && (
                <div className="p-8 space-y-8 overflow-y-auto custom-scrollbar">
                  {/* API Configuration */}
                  <div className="space-y-6">
                    <div className="flex items-center gap-3 pb-3 border-b border-white/5">
                      <span className="w-8 h-8 bg-purple-500/20 rounded-lg flex items-center justify-center text-purple-300">🎬</span>
                      <div>
                        <h3 className="text-sm font-bold text-white">Veo API 配置</h3>
                        <p className="text-[10px] text-gray-500">配置神马 API 用于 Google Veo 视频生成</p>
                      </div>
                    </div>
                    
                    {/* API Key */}
                    <div className="bg-[#222] rounded-xl p-4 border border-white/5 space-y-3">
                      <label className="flex items-center gap-2 text-xs font-bold text-gray-300">
                        <span className="w-5 h-5 bg-yellow-500/20 rounded flex items-center justify-center text-[10px]">🔑</span>
                        Veo API Key
                      </label>
                      <input 
                        type="password"
                        value={formData.veoApiKey || ''}
                        onChange={(e) => handleChange('veoApiKey', e.target.value)}
                        className="w-full bg-[#111] border border-white/10 rounded-lg px-4 py-2.5 text-sm text-white focus:border-purple-500 outline-none"
                        placeholder="留空则使用通用 API Key"
                      />
                      <p className="text-[10px] text-gray-600">如果为空，将使用模型配置中的通用 API Key</p>
                    </div>
                    
                    {/* API Base URL */}
                    <div className="bg-[#222] rounded-xl p-4 border border-white/5 space-y-3">
                      <label className="flex items-center gap-2 text-xs font-bold text-gray-300">
                        <span className="w-5 h-5 bg-blue-500/20 rounded flex items-center justify-center text-[10px]">🌐</span>
                        API Base URL
                      </label>
                      <input 
                        type="text"
                        value={formData.veoApiBaseUrl || ''}
                        onChange={(e) => handleChange('veoApiBaseUrl', e.target.value)}
                        className="w-full bg-[#111] border border-white/10 rounded-lg px-4 py-2.5 text-sm text-white focus:border-purple-500 outline-none"
                        placeholder="https://api.shenma.ai"
                      />
                      <p className="text-[10px] text-gray-600">神马 API 默认地址：https://api.shenma.ai</p>
                    </div>
                  </div>

                  {/* Model Selection */}
                  <div className="space-y-6">
                    <div className="flex items-center gap-3 pb-3 border-b border-white/5">
                      <span className="w-8 h-8 bg-pink-500/20 rounded-lg flex items-center justify-center text-pink-300">🤖</span>
                      <div>
                        <h3 className="text-sm font-bold text-white">默认 Veo 模型</h3>
                        <p className="text-[10px] text-gray-500">选择默认使用的 Veo 模型</p>
                      </div>
                    </div>
                    
                    <div className="bg-[#222] rounded-xl p-4 border border-white/5 space-y-3">
                      <label className="flex items-center gap-2 text-xs font-bold text-gray-300">
                        <span className="w-5 h-5 bg-purple-500/20 rounded flex items-center justify-center text-[10px]">🎥</span>
                        Veo 模型
                      </label>
                      <select 
                        value={formData.veoModel || 'veo3.1'}
                        onChange={(e) => handleChange('veoModel', e.target.value as VeoModel)}
                        className="w-full bg-[#111] border border-white/10 rounded-lg px-3 py-2.5 text-sm text-white focus:border-purple-500 outline-none cursor-pointer"
                      >
                        {VEO_MODELS.map(m => (
                          <option key={m.id} value={m.id}>{m.name} - {m.desc}</option>
                        ))}
                      </select>
                    </div>

                    {/* Model Reference Table */}
                    <div className="bg-[#181818] rounded-xl border border-white/5 overflow-hidden">
                      <div className="px-4 py-3 bg-[#222] border-b border-white/5">
                        <h4 className="text-xs font-bold text-gray-400">📋 模型参考</h4>
                      </div>
                      <div className="divide-y divide-white/5">
                        {VEO_MODELS.map(m => (
                          <div key={m.id} className="px-4 py-3 flex items-center justify-between hover:bg-white/5 transition-colors">
                            <div>
                              <span className="text-xs font-bold text-white">{m.name}</span>
                              <p className="text-[10px] text-gray-500">{m.desc}</p>
                            </div>
                            <span className="text-[10px] text-gray-600 bg-[#333] px-2 py-1 rounded">
                              最多 {m.maxImages} 张图
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* Generation Options */}
                  <div className="space-y-6">
                    <div className="flex items-center gap-3 pb-3 border-b border-white/5">
                      <span className="w-8 h-8 bg-green-500/20 rounded-lg flex items-center justify-center text-green-300">⚙️</span>
                      <div>
                        <h3 className="text-sm font-bold text-white">Veo 生成选项</h3>
                        <p className="text-[10px] text-gray-500">配置视频生成的默认参数</p>
                      </div>
                    </div>
                    
                    <div className="grid grid-cols-2 gap-4">
                      {/* Aspect Ratio */}
                      <div className="bg-[#222] rounded-xl p-4 border border-white/5 space-y-3">
                        <label className="flex items-center gap-2 text-xs font-bold text-gray-300">
                          <span className="w-5 h-5 bg-blue-500/20 rounded flex items-center justify-center text-[10px]">📐</span>
                          视频比例
                        </label>
                        <select 
                          value={formData.veoAspectRatio || '16:9'}
                          onChange={(e) => handleChange('veoAspectRatio', e.target.value as '9:16' | '16:9')}
                          className="w-full bg-[#111] border border-white/10 rounded-lg px-3 py-2.5 text-sm text-white focus:border-purple-500 outline-none cursor-pointer"
                        >
                          <option value="16:9">16:9 (横屏)</option>
                          <option value="9:16">9:16 (竖屏)</option>
                        </select>
                        <p className="text-[10px] text-gray-600">不传此参数时会根据参考图自动匹配</p>
                      </div>

                      {/* Enhance Prompt */}
                      <div className="bg-[#222] rounded-xl p-4 border border-white/5 space-y-3">
                        <label className="flex items-center gap-2 text-xs font-bold text-gray-300">
                          <span className="w-5 h-5 bg-yellow-500/20 rounded flex items-center justify-center text-[10px]">✨</span>
                          提示词优化
                        </label>
                        <label className="flex items-center gap-3 cursor-pointer">
                          <input 
                            type="checkbox"
                            checked={formData.veoEnhancePrompt || false}
                            onChange={(e) => handleChange('veoEnhancePrompt', e.target.checked)}
                            className="w-5 h-5 rounded bg-[#111] border border-white/20 text-purple-500 focus:ring-purple-500"
                          />
                          <span className="text-sm text-white">启用 AI 优化提示词</span>
                        </label>
                        <p className="text-[10px] text-gray-600">Veo 只支持英文，开启后会自动翻译中文提示词</p>
                      </div>
                    </div>
                  </div>

                  {/* API Info */}
                  <div className="bg-gradient-to-br from-purple-500/10 to-pink-500/10 rounded-xl p-4 border border-purple-500/20">
                    <h4 className="text-xs font-bold text-purple-300 mb-2">💡 Veo 使用说明</h4>
                    <ul className="text-[10px] text-gray-400 space-y-1">
                      <li>• veo3.1 / veo3.1-pro 支持首尾帧，自带音频生成</li>
                      <li>• veo2-fast-frames 最多支持 2 张图（首尾帧）</li>
                      <li>• veo2-fast-components 最多支持 3 张图作为视频元素</li>
                      <li>• 详细文档请参考神马 API 官方说明</li>
                    </ul>
                  </div>
                </div>
              )}

              {/* Sora Tab Content */}
              {videoProviderTab === 'sora' && (
                <div className="p-8 space-y-8 overflow-y-auto custom-scrollbar">
                  {/* Sora2 API Configuration */}
                  <div className="space-y-6">
                    <div className="flex items-center gap-3 pb-3 border-b border-white/5">
                      <span className="w-8 h-8 bg-green-500/20 rounded-lg flex items-center justify-center text-green-300">🟢</span>
                      <div>
                        <h3 className="text-sm font-bold text-white">Sora2 API 配置</h3>
                        <p className="text-[10px] text-gray-500">配置 OpenAI Sora2 图生视频 API（神马代理）</p>
                      </div>
                    </div>
                    
                    {/* Sora2 API Key */}
                    <div className="bg-[#222] rounded-xl p-4 border border-white/5 space-y-3">
                      <label className="flex items-center gap-2 text-xs font-bold text-gray-300">
                        <span className="w-5 h-5 bg-green-500/20 rounded flex items-center justify-center text-[10px]">🔑</span>
                        Sora2 API Key
                      </label>
                      <input 
                        type="password"
                        value={formData.sora2ApiKey || ''}
                        onChange={(e) => handleChange('sora2ApiKey', e.target.value)}
                        className="w-full bg-[#111] border border-white/10 rounded-lg px-4 py-2.5 text-sm text-white focus:border-green-500 outline-none"
                        placeholder="留空则使用 Veo API Key"
                      />
                      <p className="text-[10px] text-gray-600">如果为空，将使用 Veo 或通用 API Key</p>
                    </div>
                    
                    {/* Sora2 API Base URL */}
                    <div className="bg-[#222] rounded-xl p-4 border border-white/5 space-y-3">
                      <label className="flex items-center gap-2 text-xs font-bold text-gray-300">
                        <span className="w-5 h-5 bg-green-500/20 rounded flex items-center justify-center text-[10px]">🌐</span>
                        Sora2 API Base URL
                      </label>
                      <input 
                        type="text"
                        value={formData.sora2ApiBaseUrl || ''}
                        onChange={(e) => handleChange('sora2ApiBaseUrl', e.target.value)}
                        className="w-full bg-[#111] border border-white/10 rounded-lg px-4 py-2.5 text-sm text-white focus:border-green-500 outline-none"
                        placeholder="https://api.whatai.cc"
                      />
                      <p className="text-[10px] text-gray-600">神马 Sora2 API 默认地址：https://api.whatai.cc</p>
                    </div>
                  </div>

                  {/* Model Selection - NEW */}
                  <div className="space-y-6">
                    <div className="flex items-center gap-3 pb-3 border-b border-white/5">
                      <span className="w-8 h-8 bg-green-500/20 rounded-lg flex items-center justify-center text-green-300">🤖</span>
                      <div>
                        <h3 className="text-sm font-bold text-white">默认 Sora 模型</h3>
                        <p className="text-[10px] text-gray-500">选择默认使用的 Sora 模型</p>
                      </div>
                    </div>
                    
                    <div className="bg-[#222] rounded-xl p-4 border border-white/5 space-y-3">
                      <label className="flex items-center gap-2 text-xs font-bold text-gray-300">
                        <span className="w-5 h-5 bg-green-500/20 rounded flex items-center justify-center text-[10px]">🎥</span>
                        Sora 模型
                      </label>
                      <select 
                        value={formData.sora2Model || 'sora-2'}
                        onChange={(e) => handleChange('sora2Model', e.target.value as 'sora-2' | 'sora-2-pro')}
                        className="w-full bg-[#111] border border-white/10 rounded-lg px-3 py-2.5 text-sm text-white focus:border-green-500 outline-none cursor-pointer"
                      >
                        <option value="sora-2">sora-2 - 标准版（10s/15s）</option>
                        <option value="sora-2-pro">sora-2-pro - 高级版（支持HD/25s）</option>
                      </select>
                      <p className="text-[10px] text-gray-600">sora-2-pro 支持更长时长和高清输出</p>
                    </div>

                    {/* Model Comparison */}
                    <div className="bg-[#181818] rounded-xl border border-white/5 overflow-hidden">
                      <div className="px-4 py-3 bg-[#222] border-b border-white/5">
                        <h4 className="text-xs font-bold text-gray-400">📋 模型对比</h4>
                      </div>
                      <div className="divide-y divide-white/5">
                        <div className="px-4 py-3 flex items-center justify-between hover:bg-white/5 transition-colors">
                          <div>
                            <span className="text-xs font-bold text-white">sora-2</span>
                            <p className="text-[10px] text-gray-500">标准模式，速度快</p>
                          </div>
                          <span className="text-[10px] text-gray-600 bg-[#333] px-2 py-1 rounded">
                            10s / 15s
                          </span>
                        </div>
                        <div className="px-4 py-3 flex items-center justify-between hover:bg-white/5 transition-colors">
                          <div>
                            <span className="text-xs font-bold text-white">sora-2-pro</span>
                            <p className="text-[10px] text-gray-500">高级模式，支持 HD 和长视频</p>
                          </div>
                          <span className="text-[10px] text-green-400 bg-green-500/20 px-2 py-1 rounded">
                            10s / 15s / 25s + HD
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Sora2 Generation Options */}
                  <div className="space-y-6">
                    <div className="flex items-center gap-3 pb-3 border-b border-white/5">
                      <span className="w-8 h-8 bg-green-500/20 rounded-lg flex items-center justify-center text-green-300">⚙️</span>
                      <div>
                        <h3 className="text-sm font-bold text-white">Sora2 生成选项</h3>
                        <p className="text-[10px] text-gray-500">配置 Sora2 视频生成的默认参数</p>
                      </div>
                    </div>
                    
                    <div className="grid grid-cols-2 gap-4">
                      {/* Duration */}
                      <div className="bg-[#222] rounded-xl p-4 border border-white/5 space-y-3">
                        <label className="flex items-center gap-2 text-xs font-bold text-gray-300">
                          <span className="w-5 h-5 bg-green-500/20 rounded flex items-center justify-center text-[10px]">⏱️</span>
                          视频时长
                        </label>
                        <select 
                          value={formData.sora2Duration || '10'}
                          onChange={(e) => handleChange('sora2Duration', e.target.value as '10' | '15' | '25')}
                          className="w-full bg-[#111] border border-white/10 rounded-lg px-3 py-2.5 text-sm text-white focus:border-green-500 outline-none cursor-pointer"
                        >
                          <option value="10">10 秒</option>
                          <option value="15">15 秒</option>
                          <option value="25">25 秒 (仅 sora-2-pro)</option>
                        </select>
                        <p className="text-[10px] text-gray-600">15s +2分钟耗时，25s 仅 sora-2-pro 支持</p>
                      </div>

                      {/* HD Mode */}
                      <div className="bg-[#222] rounded-xl p-4 border border-white/5 space-y-3">
                        <label className="flex items-center gap-2 text-xs font-bold text-gray-300">
                          <span className="w-5 h-5 bg-green-500/20 rounded flex items-center justify-center text-[10px]">📺</span>
                          高清模式
                        </label>
                        <label className="flex items-center gap-3 cursor-pointer">
                          <input 
                            type="checkbox"
                            checked={formData.sora2Hd || false}
                            onChange={(e) => handleChange('sora2Hd', e.target.checked)}
                            className="w-5 h-5 rounded bg-[#111] border border-white/20 text-green-500 focus:ring-green-500"
                          />
                          <span className="text-sm text-white">启用 HD 高清输出</span>
                        </label>
                        <p className="text-[10px] text-gray-600">高清会导致生成速度更慢（+8分钟），仅 sora-2-pro 支持</p>
                      </div>

                      {/* Watermark */}
                      <div className="bg-[#222] rounded-xl p-4 border border-white/5 space-y-3">
                        <label className="flex items-center gap-2 text-xs font-bold text-gray-300">
                          <span className="w-5 h-5 bg-green-500/20 rounded flex items-center justify-center text-[10px]">💧</span>
                          水印设置
                        </label>
                        <label className="flex items-center gap-3 cursor-pointer">
                          <input 
                            type="checkbox"
                            checked={formData.sora2Watermark || false}
                            onChange={(e) => handleChange('sora2Watermark', e.target.checked)}
                            className="w-5 h-5 rounded bg-[#111] border border-white/20 text-green-500 focus:ring-green-500"
                          />
                          <span className="text-sm text-white">添加水印</span>
                        </label>
                        <p className="text-[10px] text-gray-600">是否在生成的视频中添加水印</p>
                      </div>

                      {/* Private */}
                      <div className="bg-[#222] rounded-xl p-4 border border-white/5 space-y-3">
                        <label className="flex items-center gap-2 text-xs font-bold text-gray-300">
                          <span className="w-5 h-5 bg-green-500/20 rounded flex items-center justify-center text-[10px]">🔒</span>
                          隐私设置
                        </label>
                        <label className="flex items-center gap-3 cursor-pointer">
                          <input 
                            type="checkbox"
                            checked={formData.sora2Private || false}
                            onChange={(e) => handleChange('sora2Private', e.target.checked)}
                            className="w-5 h-5 rounded bg-[#111] border border-white/20 text-green-500 focus:ring-green-500"
                          />
                          <span className="text-sm text-white">设为私有</span>
                        </label>
                        <p className="text-[10px] text-gray-600">是否将生成的视频设为私有</p>
                      </div>
                    </div>
                    
                    {/* Notify Hook (optional) */}
                    <div className="bg-[#222] rounded-xl p-4 border border-white/5 space-y-3">
                      <label className="flex items-center gap-2 text-xs font-bold text-gray-300">
                        <span className="w-5 h-5 bg-green-500/20 rounded flex items-center justify-center text-[10px]">🔔</span>
                        通知 Webhook (可选)
                      </label>
                      <input 
                        type="text"
                        value={formData.sora2NotifyHook || ''}
                        onChange={(e) => handleChange('sora2NotifyHook', e.target.value)}
                        className="w-full bg-[#111] border border-white/10 rounded-lg px-4 py-2.5 text-sm text-white focus:border-green-500 outline-none"
                        placeholder="https://your-webhook-url.com/notify"
                      />
                      <p className="text-[10px] text-gray-600">视频生成完成后会发送 POST 请求到此 URL</p>
                    </div>
                  </div>

                  {/* Sora2 API Info */}
                  <div className="bg-gradient-to-br from-green-500/10 to-teal-500/10 rounded-xl p-4 border border-green-500/20">
                    <h4 className="text-xs font-bold text-green-300 mb-2">💡 Sora2 使用说明</h4>
                    <ul className="text-[10px] text-gray-400 space-y-1">
                      <li>• sora-2：标准模式，支持 10s/15s 时长</li>
                      <li>• sora-2-pro：高级模式，支持 HD、25s 时长</li>
                      <li>• 图片不能包含真人或非常像真人的内容</li>
                      <li>• 提示词不能包含暴力、色情、版权、名人相关内容</li>
                      <li>• 生成预计耗时：10s 约1-3分钟，15s +2分钟，HD +8分钟</li>
                    </ul>
                  </div>
                </div>
              )}

              {/* 火山 Tab Content - Placeholder */}
              {videoProviderTab === 'volc' && (
                <div className="p-8 space-y-8 overflow-y-auto custom-scrollbar">
                  {/* API Configuration */}
                  <div className="space-y-6">
                    <div className="flex items-center gap-3 pb-3 border-b border-white/5">
                      <span className="w-8 h-8 bg-orange-500/20 rounded-lg flex items-center justify-center text-orange-300">🌋</span>
                      <div>
                        <h3 className="text-sm font-bold text-white">火山方舟 Ark API 配置</h3>
                        <p className="text-[10px] text-gray-500">配置火山方舟 Ark API 用于图片和视频生成</p>
                      </div>
                    </div>
                    
                    {/* API Key */}
                    <div className="bg-[#222] rounded-xl p-4 border border-white/5 space-y-3">
                      <label className="flex items-center gap-2 text-xs font-bold text-gray-300">
                        <span className="w-5 h-5 bg-yellow-500/20 rounded flex items-center justify-center text-[10px]">🔑</span>
                        Ark API Key
                      </label>
                      <input 
                        type="password"
                        value={formData.volcArkApiKey || ''}
                        onChange={(e) => handleChange('volcArkApiKey', e.target.value)}
                        className="w-full bg-[#111] border border-white/10 rounded-lg px-4 py-2.5 text-sm text-white focus:border-orange-500 outline-none"
                        placeholder="输入火山方舟 Ark API Key"
                      />
                      <p className="text-[10px] text-gray-600">Base URL 固定为：https://ark.cn-beijing.volces.com</p>
                    </div>
                  </div>

                  {/* Video Model Selection */}
                  <div className="space-y-6">
                    <div className="flex items-center gap-3 pb-3 border-b border-white/5">
                      <span className="w-8 h-8 bg-pink-500/20 rounded-lg flex items-center justify-center text-pink-300">🎬</span>
                      <div>
                        <h3 className="text-sm font-bold text-white">视频生成模型</h3>
                        <p className="text-[10px] text-gray-500">选择默认使用的 Seedance 模型</p>
                      </div>
                    </div>
                    
                    <div className="bg-[#222] rounded-xl p-4 border border-white/5 space-y-3">
                      <label className="flex items-center gap-2 text-xs font-bold text-gray-300">
                        <span className="w-5 h-5 bg-orange-500/20 rounded flex items-center justify-center text-[10px]">🎥</span>
                        Seedance 模型
                      </label>
                      <select 
                        value={formData.veoModel || 'doubao-seedance-1-5-pro-251215'}
                        onChange={(e) => handleChange('veoModel', e.target.value as VeoModel)}
                        className="w-full bg-[#111] border border-white/10 rounded-lg px-3 py-2.5 text-sm text-white focus:border-orange-500 outline-none cursor-pointer"
                      >
                        {VOLC_ARK_VIDEO_MODELS.map(m => (
                          <option key={m.id} value={m.id}>{m.name} - {m.desc}</option>
                        ))}
                      </select>
                    </div>

                    {/* Model Reference Table */}
                    <div className="bg-[#181818] rounded-xl border border-white/5 overflow-hidden">
                      <div className="px-4 py-3 bg-[#222] border-b border-white/5">
                        <h4 className="text-xs font-bold text-gray-400">📋 模型参考</h4>
                      </div>
                      <div className="divide-y divide-white/5">
                        {VOLC_ARK_VIDEO_MODELS.map(m => (
                          <div key={m.id} className="px-4 py-3 flex items-center justify-between hover:bg-white/5 transition-colors">
                            <div>
                              <span className="text-xs font-bold text-white">{m.name}</span>
                              <p className="text-[10px] text-gray-500">{m.desc}</p>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* Video Generation Options */}
                  <div className="space-y-6">
                    <div className="flex items-center gap-3 pb-3 border-b border-white/5">
                      <span className="w-8 h-8 bg-green-500/20 rounded-lg flex items-center justify-center text-green-300">⚙️</span>
                      <div>
                        <h3 className="text-sm font-bold text-white">视频生成选项</h3>
                        <p className="text-[10px] text-gray-500">配置视频生成的默认参数</p>
                      </div>
                    </div>

                    {/* Resolution */}
                    <div className="bg-[#222] rounded-xl p-4 border border-white/5 space-y-3">
                      <label className="flex items-center gap-2 text-xs font-bold text-gray-300">
                        <span className="w-5 h-5 bg-blue-500/20 rounded flex items-center justify-center text-[10px]">📐</span>
                        分辨率
                      </label>
                      <select 
                        value={formData.volcVideoResolution || '720p'}
                        onChange={(e) => handleChange('volcVideoResolution', e.target.value)}
                        className="w-full bg-[#111] border border-white/10 rounded-lg px-3 py-2.5 text-sm text-white focus:border-orange-500 outline-none cursor-pointer"
                      >
                        <option value="480p">480p</option>
                        <option value="720p">720p (推荐)</option>
                        <option value="1080p">1080p</option>
                      </select>
                    </div>

                    {/* Duration */}
                    <div className="bg-[#222] rounded-xl p-4 border border-white/5 space-y-3">
                      <label className="flex items-center gap-2 text-xs font-bold text-gray-300">
                        <span className="w-5 h-5 bg-purple-500/20 rounded flex items-center justify-center text-[10px]">⏱️</span>
                        时长（秒）
                      </label>
                      <input 
                        type="number"
                        min="2"
                        max="12"
                        value={formData.volcVideoDuration || 5}
                        onChange={(e) => handleChange('volcVideoDuration', parseInt(e.target.value) || 5)}
                        className="w-full bg-[#111] border border-white/10 rounded-lg px-4 py-2.5 text-sm text-white focus:border-orange-500 outline-none"
                      />
                      <p className="text-[10px] text-gray-600">范围：2-12 秒（Seedance 1.5 pro 支持 4-12 秒）</p>
                    </div>

                    {/* Generate Audio (only for Seedance 1.5 pro) */}
                    <div className="bg-[#222] rounded-xl p-4 border border-white/5 space-y-3">
                      <label className="flex items-center gap-2 text-xs font-bold text-gray-300 mb-3">
                        <span className="w-5 h-5 bg-green-500/20 rounded flex items-center justify-center text-[10px]">🔊</span>
                        生成音频
                      </label>
                      <label className="flex items-center gap-3 cursor-pointer">
                        <input 
                          type="checkbox"
                          checked={formData.volcVideoGenerateAudio !== false}
                          onChange={(e) => handleChange('volcVideoGenerateAudio', e.target.checked)}
                          className="w-5 h-5 rounded bg-[#111] border border-white/20 text-green-500 focus:ring-green-500"
                        />
                        <span className="text-sm text-white">生成与画面同步的声音（仅 Seedance 1.5 pro 支持）</span>
                      </label>
                    </div>
                  </div>

                  {/* Image Generation Options */}
                  <div className="space-y-6">
                    <div className="flex items-center gap-3 pb-3 border-b border-white/5">
                      <span className="w-8 h-8 bg-pink-500/20 rounded-lg flex items-center justify-center text-pink-300">🎨</span>
                      <div>
                        <h3 className="text-sm font-bold text-white">图片生成选项</h3>
                        <p className="text-[10px] text-gray-500">配置图片生成的默认参数</p>
                      </div>
                    </div>

                    {/* Default Size */}
                    <div className="bg-[#222] rounded-xl p-4 border border-white/5 space-y-3">
                      <label className="flex items-center gap-2 text-xs font-bold text-gray-300">
                        <span className="w-5 h-5 bg-blue-500/20 rounded flex items-center justify-center text-[10px]">📐</span>
                        默认尺寸
                      </label>
                      <input 
                        type="text"
                        value={formData.volcImageDefaultSize || ''}
                        onChange={(e) => handleChange('volcImageDefaultSize', e.target.value)}
                        className="w-full bg-[#111] border border-white/10 rounded-lg px-4 py-2.5 text-sm text-white focus:border-orange-500 outline-none"
                        placeholder="例如: 2048x2048, 2K, 4K, adaptive"
                      />
                      <p className="text-[10px] text-gray-600">留空则根据宽高比自动选择</p>
                    </div>

                    {/* Watermark */}
                    <div className="bg-[#222] rounded-xl p-4 border border-white/5 space-y-3">
                      <label className="flex items-center gap-2 text-xs font-bold text-gray-300 mb-3">
                        <span className="w-5 h-5 bg-yellow-500/20 rounded flex items-center justify-center text-[10px]">💧</span>
                        水印
                      </label>
                      <label className="flex items-center gap-3 cursor-pointer">
                        <input 
                          type="checkbox"
                          checked={formData.volcImageWatermark !== false}
                          onChange={(e) => handleChange('volcImageWatermark', e.target.checked)}
                          className="w-5 h-5 rounded bg-[#111] border border-white/20 text-yellow-500 focus:ring-yellow-500"
                        />
                        <span className="text-sm text-white">在生成的图片中添加水印（默认：开启）</span>
                      </label>
                    </div>
                  </div>
                </div>
              )}

              {/* Video Concat Service - Shared across all providers */}
              <div className="px-8 pb-8 pt-4 border-t border-white/10 mt-4">
                <div className="space-y-6">
                  <div className="flex items-center gap-3 pb-3 border-b border-white/5">
                    <span className="w-8 h-8 bg-cyan-500/20 rounded-lg flex items-center justify-center text-cyan-300">🔗</span>
                    <div>
                      <h3 className="text-sm font-bold text-white">视频拼接服务</h3>
                      <p className="text-[10px] text-gray-500">配置本地 Python 后端用于视频片段拼接（三段首尾帧模式）</p>
                    </div>
                  </div>
                  
                  <div className="bg-[#222] rounded-xl p-4 border border-white/5 space-y-3">
                    <label className="flex items-center gap-2 text-xs font-bold text-gray-300">
                      <span className="w-5 h-5 bg-cyan-500/20 rounded flex items-center justify-center text-[10px]">🌐</span>
                      拼接服务 URL
                    </label>
                    <input 
                      type="text"
                      value={formData.videoConcatBaseUrl || ''}
                      onChange={(e) => handleChange('videoConcatBaseUrl', e.target.value)}
                      className="w-full bg-[#111] border border-white/10 rounded-lg px-4 py-2.5 text-sm text-white focus:border-cyan-500 outline-none"
                      placeholder="http://127.0.0.1:8008"
                    />
                    <p className="text-[10px] text-gray-600">
                      默认地址：http://127.0.0.1:8008 · 启动命令：<code className="bg-[#111] px-1 rounded">cd python_backend && python main.py</code>
                    </p>
                  </div>
                  
                  <div className="bg-gradient-to-br from-cyan-500/10 to-blue-500/10 rounded-xl p-4 border border-cyan-500/20">
                    <h4 className="text-xs font-bold text-cyan-300 mb-2">💡 三段首尾帧模式说明</h4>
                    <ul className="text-[10px] text-gray-400 space-y-1">
                      <li>• <strong>Segment 0 (p3→1):</strong> 上分镜Shot3 → 当前Shot1 (跨分镜过渡)</li>
                      <li>• <strong>Segment 1 (1→2):</strong> 当前Shot1 → Shot2</li>
                      <li>• <strong>Segment 2 (2→3):</strong> 当前Shot2 → Shot3</li>
                      <li>• 三段视频自动拼接，确保画面连贯无跳变</li>
                      <li>• 需先启动本地 Python 后端服务</li>
                    </ul>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Prompts Tab */}
          {activeTab === 'prompts' && (
            <div className="p-8 space-y-6">
              {/* Category Filter */}
              <div className="flex items-center gap-3 pb-4 border-b border-white/5">
                <span className="text-xs text-gray-500">筛选类别：</span>
                <div className="flex gap-2">
                  {[
                    { id: 'all', label: '全部', icon: '📋' },
                    { id: 'core', label: '核心流程', icon: '⚡' },
                    { id: 'visual', label: '视觉生成', icon: '🎨' },
                    { id: 'util', label: '工具辅助', icon: '🔧' },
                  ].map(cat => (
                    <button
                      key={cat.id}
                      onClick={() => setPromptCategory(cat.id as typeof promptCategory)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-medium flex items-center gap-1.5 transition-colors ${
                        promptCategory === cat.id
                          ? 'bg-blue-600 text-white'
                          : 'bg-[#333] text-gray-400 hover:text-white hover:bg-[#444]'
                      }`}
                    >
                      <span>{cat.icon}</span>
                      {cat.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Prompt Editors */}
              <div className="space-y-4">
                {filteredPrompts.map(item => {
                  const isExpanded = expandedPrompt === item.key;
                  const promptValue = (formData as Record<string, string | string[] | boolean>)[item.key] as string || '';
                  
                  return (
                    <div 
                      key={item.key} 
                      className={`bg-[#222] rounded-xl border transition-all ${
                        isExpanded ? 'border-blue-500/50' : 'border-white/5 hover:border-white/10'
                      }`}
                    >
                      {/* Header */}
                      <div 
                        className="flex items-center justify-between p-4 cursor-pointer"
                        onClick={() => setExpandedPrompt(isExpanded ? null : item.key)}
                      >
                        <div className="flex items-center gap-3">
                          <span className="w-10 h-10 bg-[#333] rounded-lg flex items-center justify-center text-lg">
                            {item.icon}
                          </span>
                          <div>
                            <h4 className="text-sm font-bold text-white">{item.label}</h4>
                            <p className="text-[10px] text-gray-500">{item.desc}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-3">
                          <span className={`text-[10px] px-2 py-0.5 rounded ${
                            item.category === 'core' ? 'bg-blue-500/20 text-blue-300' :
                            item.category === 'visual' ? 'bg-purple-500/20 text-purple-300' :
                            'bg-gray-500/20 text-gray-400'
                          }`}>
                            {item.category === 'core' ? '核心' : item.category === 'visual' ? '视觉' : '工具'}
                          </span>
                          <span className={`text-gray-500 transition-transform ${isExpanded ? 'rotate-180' : ''}`}>
                            ▼
                          </span>
                        </div>
                      </div>
                      
                      {/* Editor */}
                      {isExpanded && (
                        <div className="px-4 pb-4 space-y-3 animate-in slide-in-from-top-2 duration-200">
                          <div className="flex items-center justify-between">
                            <span className="text-[10px] text-gray-500">
                              {typeof promptValue === 'string' ? promptValue.length : 0} 字符
                            </span>
                            <button 
                              onClick={() => handleChange(item.key as keyof AppSettings, '')}
                              className="text-[10px] text-red-400 hover:text-red-300"
                            >
                              清空
                            </button>
                          </div>
                          <textarea 
                            value={typeof promptValue === 'string' ? promptValue : ''}
                            onChange={(e) => handleChange(item.key as keyof AppSettings, e.target.value)}
                            className="w-full h-48 bg-[#111] border border-white/10 rounded-xl p-4 text-xs text-gray-300 font-mono leading-relaxed outline-none focus:border-blue-500 resize-y"
                            placeholder={`请输入${item.label}...`}
                          />
                          <div className="flex items-center gap-2 text-[10px] text-gray-600">
                            <span>💡</span>
                            <span>提示：可使用变量如 {'{characters}'}, {'{scene}'}, {'{style}'} 等动态占位符</span>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
          
          {/* Backup Tab */}
          {activeTab === 'backup' && (
            <div className="p-8 space-y-8">
              {/* Backup Configuration */}
              <div className="space-y-6">
                <div className="flex items-center gap-3 pb-3 border-b border-white/5">
                  <span className="w-8 h-8 bg-green-500/20 rounded-lg flex items-center justify-center text-green-300">⚙️</span>
                  <div>
                    <h3 className="text-sm font-bold text-white">自动备份配置</h3>
                    <p className="text-[10px] text-gray-500">配置自动备份的频率和保留策略</p>
                  </div>
                </div>
                
                <div className="grid grid-cols-2 gap-6">
                  {/* Enable Toggle */}
                  <div className="bg-[#222] rounded-xl p-4 border border-white/5">
                    <label className="flex items-center justify-between cursor-pointer">
                      <div>
                        <div className="text-xs font-bold text-gray-300 mb-1">启用自动备份</div>
                        <div className="text-[10px] text-gray-500">定时自动创建项目快照</div>
                      </div>
                      <div className="relative">
                        <input
                          type="checkbox"
                          checked={localBackupConfig.enabled}
                          onChange={(e) => {
                            const updated = { ...localBackupConfig, enabled: e.target.checked };
                            setLocalBackupConfig(updated);
                            onUpdateBackupConfig?.(updated);
                          }}
                          className="sr-only peer"
                        />
                        <div className="w-11 h-6 bg-gray-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-green-600"></div>
                      </div>
                    </label>
                  </div>
                  
                  {/* Important Changes Toggle */}
                  <div className="bg-[#222] rounded-xl p-4 border border-white/5">
                    <label className="flex items-center justify-between cursor-pointer">
                      <div>
                        <div className="text-xs font-bold text-gray-300 mb-1">重要操作后备份</div>
                        <div className="text-[10px] text-gray-500">导入、生成等操作后自动备份</div>
                      </div>
                      <div className="relative">
                        <input
                          type="checkbox"
                          checked={localBackupConfig.backupOnImportantChanges}
                          onChange={(e) => {
                            const updated = { ...localBackupConfig, backupOnImportantChanges: e.target.checked };
                            setLocalBackupConfig(updated);
                            onUpdateBackupConfig?.(updated);
                          }}
                          className="sr-only peer"
                        />
                        <div className="w-11 h-6 bg-gray-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-green-600"></div>
                      </div>
                    </label>
                  </div>
                  
                  {/* Interval */}
                  <div className="bg-[#222] rounded-xl p-4 border border-white/5">
                    <label className="text-xs font-bold text-gray-300 mb-3 block">备份间隔（分钟）</label>
                    <select
                      value={localBackupConfig.intervalMinutes}
                      onChange={(e) => {
                        const updated = { ...localBackupConfig, intervalMinutes: Number(e.target.value) };
                        setLocalBackupConfig(updated);
                        onUpdateBackupConfig?.(updated);
                      }}
                      className="w-full bg-[#111] border border-white/10 rounded-lg px-3 py-2.5 text-sm text-white focus:border-green-500 outline-none cursor-pointer"
                    >
                      <option value={1}>1 分钟</option>
                      <option value={3}>3 分钟</option>
                      <option value={5}>5 分钟（推荐）</option>
                      <option value={10}>10 分钟</option>
                      <option value={15}>15 分钟</option>
                      <option value={30}>30 分钟</option>
                    </select>
                  </div>
                  
                  {/* Max Backups */}
                  <div className="bg-[#222] rounded-xl p-4 border border-white/5">
                    <label className="text-xs font-bold text-gray-300 mb-3 block">最大保留数量</label>
                    <select
                      value={localBackupConfig.maxBackups}
                      onChange={(e) => {
                        const updated = { ...localBackupConfig, maxBackups: Number(e.target.value) };
                        setLocalBackupConfig(updated);
                        onUpdateBackupConfig?.(updated);
                      }}
                      className="w-full bg-[#111] border border-white/10 rounded-lg px-3 py-2.5 text-sm text-white focus:border-green-500 outline-none cursor-pointer"
                    >
                      <option value={5}>5 个</option>
                      <option value={10}>10 个（推荐）</option>
                      <option value={20}>20 个</option>
                      <option value={50}>50 个</option>
                    </select>
                  </div>
                </div>
              </div>
              
              {/* Backup List */}
              <div className="space-y-6">
                <div className="flex items-center justify-between pb-3 border-b border-white/5">
                  <div className="flex items-center gap-3">
                    <span className="w-8 h-8 bg-blue-500/20 rounded-lg flex items-center justify-center text-blue-300">📋</span>
                    <div>
                      <h3 className="text-sm font-bold text-white">备份列表</h3>
                      <p className="text-[10px] text-gray-500">查看和管理项目备份</p>
                    </div>
                  </div>
                  <button
                    onClick={async () => {
                      if (onCreateBackup) {
                        setCreatingBackup(true);
                        await onCreateBackup('手动快照');
                        // Refresh backups list
                        if (getBackups) {
                          const newBackups = await getBackups();
                          setBackups(newBackups);
                        }
                        setCreatingBackup(false);
                      }
                    }}
                    disabled={creatingBackup}
                    className="px-4 py-2 bg-green-600 hover:bg-green-500 text-white text-xs rounded-lg transition-colors flex items-center gap-2 disabled:opacity-50"
                  >
                    {creatingBackup ? (
                      <>
                        <span className="animate-spin">⏳</span> 创建中...
                      </>
                    ) : (
                      <>
                        <span>📸</span> 创建手动快照
                      </>
                    )}
                  </button>
                </div>
                
                <div className="bg-[#222] rounded-xl border border-white/5 overflow-hidden">
                  {loadingBackups ? (
                    <div className="p-8 text-center text-gray-500">
                      <span className="animate-spin inline-block mr-2">⏳</span>
                      加载备份列表...
                    </div>
                  ) : backups.length === 0 ? (
                    <div className="p-8 text-center text-gray-500">
                      <div className="text-4xl mb-2">📦</div>
                      <div>暂无备份</div>
                      <div className="text-[10px] mt-1">启用自动备份或点击"创建手动快照"</div>
                    </div>
                  ) : (
                    <div className="divide-y divide-white/5 max-h-[300px] overflow-y-auto custom-scrollbar">
                      {backups.map((backup) => (
                        <div key={backup.id} className="p-4 hover:bg-white/5 transition-colors">
                          <div className="flex items-center justify-between">
                            <div>
                              <div className="text-sm text-white font-medium">{backup.description}</div>
                              <div className="text-[10px] text-gray-500 mt-1">
                                {new Date(backup.createdAt).toLocaleString('zh-CN', {
                                  year: 'numeric',
                                  month: '2-digit',
                                  day: '2-digit',
                                  hour: '2-digit',
                                  minute: '2-digit'
                                })}
                                <span className="ml-2">· {backup.project.volumes?.length || 0} 卷</span>
                              </div>
                            </div>
                            <div className="flex items-center gap-2">
                              <button
                                onClick={() => onRestoreBackup?.(backup.id)}
                                className="px-3 py-1.5 bg-blue-600/20 hover:bg-blue-600/30 text-blue-400 text-[10px] rounded-lg transition-colors"
                              >
                                恢复
                              </button>
                              <button
                                onClick={() => {
                                  if (confirm('确定要删除此备份吗？')) {
                                    onDeleteBackup?.(backup.id);
                                    setBackups(prev => prev.filter(b => b.id !== backup.id));
                                  }
                                }}
                                className="px-3 py-1.5 bg-red-600/20 hover:bg-red-600/30 text-red-400 text-[10px] rounded-lg transition-colors"
                              >
                                删除
                              </button>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-6 bg-[#252525] border-t border-white/5 flex items-center justify-between shrink-0">
          <div className="text-[10px] text-gray-600">
            <span className="text-gray-500">提示：</span> 修改后点击保存生效
          </div>
          <div className="flex gap-3">
            <button 
              onClick={onClose}
              className="px-6 py-2.5 text-sm font-medium text-gray-400 hover:text-white transition-colors"
            >
              取消
            </button>
            <button 
              onClick={() => { onSave(formData); onClose(); }}
              className="px-8 py-2.5 bg-gradient-to-r from-blue-600 to-blue-500 hover:from-blue-500 hover:to-blue-400 text-white rounded-xl text-sm font-bold shadow-lg transition-all active:scale-95"
            >
              💾 保存所有设置
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
