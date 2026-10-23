import React, { useState, useCallback } from 'react';
import { NovelStyle } from '../types';

// ============================================================================
// Types
// ============================================================================

interface StyleManagerProps {
  activeStyle: NovelStyle | null;
  customStyles: NovelStyle[];
  onSelectStyle: (style: NovelStyle | null) => void;
  onAddStyle: (style: NovelStyle) => void;
  onUpdateStyle?: (style: NovelStyle) => void;
  onDeleteStyle: (id: string) => Promise<void>;
  onClose: () => void;
  onAutoDetect: () => void;
  isDetecting: boolean;
  onUpdateStyleImage?: (styleId: string, imageUrl: string) => void;
}

// ============================================================================
// Built-in Styles with Preview Colors (10 Professional Webtoon Styles)
// ============================================================================

export const BUILTIN_STYLES: NovelStyle[] = [
  { 
    id: 'bp-1', 
    name: '韩漫宫廷风',
    genre: '大女主复仇、转生恶役、西幻言情',
    prompt: 'Korean manhwa style, otome game visuals, beautiful nobility, sparkling eyes, ornate dresses, dramatic lighting, webtoon aesthetic',
    isBuiltIn: true, 
    previewColor: '#ec4899',
    previewGradient: 'from-pink-400 via-rose-500 to-purple-600'
  },
  { 
    id: 'bp-2', 
    name: '现代都市言情风',
    genre: '霸总甜宠、都市职场、校园恋爱',
    prompt: 'Modern romance webtoon style, clean lines, bright vibrant colors, fashionable characters, urban setting, K-drama vibes',
    isBuiltIn: true, 
    previewColor: '#f472b6',
    previewGradient: 'from-pink-300 via-rose-400 to-red-400'
  },
  { 
    id: 'bp-3', 
    name: '超写实电影感',
    genre: '深度剧情、悬疑推理、现实题材',
    prompt: 'Cinematic still, photorealistic, film grain, shallow depth of field, dramatic cinematic lighting, raw emotional expression, 4k movie shot',
    isBuiltIn: true, 
    previewColor: '#64748b',
    previewGradient: 'from-slate-400 via-gray-500 to-zinc-700'
  },
  { 
    id: 'bp-4', 
    name: '日系高质量动画风',
    genre: '青春校园、奇幻冒险、热血战斗',
    prompt: 'Anime movie still frame, beautiful detailed background, Makoto Shinkai style lighting, lens flare, emotional atmosphere, vibrant anime colors',
    isBuiltIn: true, 
    previewColor: '#3b82f6',
    previewGradient: 'from-sky-400 via-blue-500 to-indigo-600'
  },
  { 
    id: 'bp-5', 
    name: '新中式古风/仙侠',
    genre: '修仙、古言、玄幻',
    prompt: 'Chinese Xianxia art, ethereal traditional style, flowing robes, ancient architecture, misty mountains, ink wash elements mixed with CG',
    isBuiltIn: true, 
    previewColor: '#10b981',
    previewGradient: 'from-emerald-400 via-teal-500 to-cyan-600'
  },
  { 
    id: 'bp-6', 
    name: '赛博朋克/废土风',
    genre: '未来科幻、末世生存、机甲',
    prompt: 'Cyberpunk anime style, neon noir lighting, rainy futuristic city, high contrast, techwear, gritty sci-fi atmosphere',
    isBuiltIn: true, 
    previewColor: '#0ea5e9',
    previewGradient: 'from-cyan-500 via-blue-600 to-purple-700'
  },
  { 
    id: 'bp-7', 
    name: '二次元厚涂风',
    genre: '史诗奇幻、游戏改、西幻',
    prompt: 'Thick painted anime illustration, rich textures, brushstrokes visible, fantasy game art style, deep colors, concept art',
    isBuiltIn: true, 
    previewColor: '#f59e0b',
    previewGradient: 'from-amber-400 via-orange-500 to-red-600'
  },
  { 
    id: 'bp-8', 
    name: '唯美吉卜力治愈风',
    genre: '田园生活、治愈系、儿童向',
    prompt: 'Studio Ghibli inspired, watercolor texture, soft natural lighting, peaceful countryside, hand drawn feel, warm and cozy',
    isBuiltIn: true, 
    previewColor: '#84cc16',
    previewGradient: 'from-green-400 via-emerald-500 to-teal-500'
  },
  { 
    id: 'bp-9', 
    name: '暗黑哥特/克苏鲁风',
    genre: '恐怖、惊悚、吸血鬼题材',
    prompt: 'Dark fantasy comic style, gothic horror aesthetics, muted earthy tones, heavy shadows, eerie atmosphere, mysterious',
    isBuiltIn: true, 
    previewColor: '#6b21a8',
    previewGradient: 'from-purple-600 via-violet-800 to-slate-900'
  },
  { 
    id: 'bp-10', 
    name: '美漫图像小说风',
    genre: '硬汉侦探、犯罪题材、成人向',
    prompt: 'American graphic novel style, comic book panels, noir lighting style, gritty realism, inked lines, mature themes',
    isBuiltIn: true, 
    previewColor: '#374151',
    previewGradient: 'from-gray-500 via-slate-600 to-stone-800'
  },
];

// ============================================================================
// Main Component
// ============================================================================

export const StyleManager: React.FC<StyleManagerProps> = ({
  activeStyle,
  customStyles,
  onSelectStyle,
  onAddStyle,
  onUpdateStyle,
  onDeleteStyle,
  onClose,
  onAutoDetect,
  isDetecting,
  onUpdateStyleImage
}) => {
  const [mode, setMode] = useState<'list' | 'editor'>('list');
  const [editingStyle, setEditingStyle] = useState<NovelStyle | null>(null);
  const [formData, setFormData] = useState({ name: '', prompt: '', previewColor: '#6366f1' });
  const [deleteConfirm, setDeleteConfirm] = useState<NovelStyle | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  // All styles combined
  const allStyles = [...customStyles.filter(s => !s.isBuiltIn), ...BUILTIN_STYLES];
  
  // Filtered styles
  const filteredStyles = searchQuery 
    ? allStyles.filter(s => 
        s.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        s.prompt.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : allStyles;

  // Start editing
  const handleEdit = useCallback((style: NovelStyle, isClone = false) => {
    setEditingStyle(isClone ? null : style);
    setFormData({
      name: isClone ? `${style.name} (副本)` : style.name,
      prompt: style.prompt,
      previewColor: style.previewColor || '#6366f1'
    });
    setMode('editor');
  }, []);

  // Start new
  const handleNew = useCallback(() => {
    setEditingStyle(null);
    setFormData({ name: '', prompt: '', previewColor: '#6366f1' });
    setMode('editor');
  }, []);

  // Save style
  const handleSave = useCallback(() => {
    if (!formData.name.trim() || !formData.prompt.trim()) return;

    const style: NovelStyle = {
      id: editingStyle?.id || `custom-${Date.now()}`,
      name: formData.name.trim(),
      prompt: formData.prompt.trim(),
      previewColor: formData.previewColor,
      isBuiltIn: false
    };

    if (editingStyle && onUpdateStyle) {
      onUpdateStyle(style);
    } else {
      onAddStyle(style);
    }

    // Auto-select the new/updated style
    onSelectStyle(style);
    setMode('list');
    setEditingStyle(null);
  }, [formData, editingStyle, onAddStyle, onUpdateStyle, onSelectStyle]);

  // Delete style
  const handleDelete = useCallback(async () => {
    if (!deleteConfirm) return;
    setIsDeleting(true);
    try {
      await onDeleteStyle(deleteConfirm.id);
      setDeleteConfirm(null);
    } catch (e: any) {
      alert(`删除失败: ${e.message}`);
    } finally {
      setIsDeleting(false);
    }
  }, [deleteConfirm, onDeleteStyle]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
      <div className="w-full max-w-5xl h-[85vh] bg-[#141414] border border-white/10 rounded-2xl shadow-2xl flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        
        {/* Header */}
        <header className="h-16 px-6 bg-[#1A1A1A] border-b border-white/5 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-purple-500 to-pink-600 flex items-center justify-center shadow-lg">
              <span className="text-xl">🎨</span>
            </div>
            <div>
              <h2 className="text-base font-bold text-white">艺术风格管理</h2>
              <p className="text-[10px] text-gray-500">定义全局视觉风格，影响所有 AI 生成内容</p>
            </div>
          </div>
          <button 
            onClick={onClose} 
            className="w-10 h-10 rounded-xl flex items-center justify-center bg-[#252525] text-gray-400 hover:text-white hover:bg-[#333] transition-all"
          >
            ✕
          </button>
        </header>

        {/* Content */}
        <div className="flex-1 flex min-h-0">
          
          {/* Sidebar */}
          <aside className="w-72 bg-[#181818] border-r border-white/5 flex flex-col p-4 gap-4 shrink-0">
            {/* Action Buttons */}
            <button
              onClick={onAutoDetect}
              disabled={isDetecting}
              className={`w-full py-3 rounded-xl text-sm font-bold transition-all flex items-center justify-center gap-2 ${
                isDetecting
                  ? 'bg-purple-900/30 text-purple-400 cursor-wait'
                  : 'bg-gradient-to-r from-purple-600 to-pink-600 text-white hover:brightness-110 active:scale-[0.98]'
              }`}
            >
              {isDetecting ? (
                <><span className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" /> 分析中...</>
              ) : (
                <>✨ AI 自动识别</>
              )}
            </button>
            
            <button
              onClick={handleNew}
              className="w-full py-3 rounded-xl text-sm font-bold bg-[#252525] text-gray-300 hover:text-white hover:bg-[#333] border border-white/5 transition-all flex items-center justify-center gap-2"
            >
              + 新建风格
            </button>

            <div className="h-px bg-white/5" />

            {/* Current Style */}
            <div className="space-y-2">
              <label className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">当前风格</label>
              {activeStyle ? (
                <div className="p-3 rounded-xl bg-gradient-to-br from-blue-600/20 to-purple-600/20 border border-blue-500/30 relative overflow-hidden">
                  <div className="flex items-center gap-2 mb-2">
                    <div 
                      className="w-4 h-4 rounded-full shadow-lg" 
                      style={{ backgroundColor: activeStyle.previewColor || '#3b82f6' }}
                    />
                    <span className="text-sm font-bold text-blue-100 truncate">{activeStyle.name}</span>
                  </div>
                  <p className="text-[10px] text-blue-200/60 line-clamp-2 font-mono">{activeStyle.prompt}</p>
                  <button
                    onClick={() => onSelectStyle(null)}
                    className="mt-2 text-[10px] text-blue-400 hover:text-white underline"
                  >
                    清除选择
                  </button>
                </div>
              ) : (
                <div className="p-4 rounded-xl bg-[#111] border border-dashed border-white/10 text-center">
                  <span className="text-2xl opacity-30">🎨</span>
                  <p className="text-xs text-gray-600 mt-1">未选择风格</p>
                </div>
              )}
            </div>

            {/* Statistics */}
            <div className="mt-auto space-y-2 text-[10px] text-gray-600">
              <div className="flex justify-between">
                <span>自定义风格</span>
                <span className="text-gray-400">{customStyles.filter(s => !s.isBuiltIn).length}</span>
              </div>
              <div className="flex justify-between">
                <span>系统预设</span>
                <span className="text-gray-400">{BUILTIN_STYLES.length}</span>
              </div>
            </div>
          </aside>

          {/* Main Content */}
          <main className="flex-1 flex flex-col min-w-0 bg-[#121212]">
            {mode === 'list' ? (
              <>
                {/* Search Bar */}
                <div className="p-4 border-b border-white/5">
                  <div className="relative">
                    <input
                      type="text"
                      placeholder="搜索风格..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="w-full bg-[#1A1A1A] border border-white/10 rounded-xl px-4 py-2.5 pl-10 text-sm text-white placeholder-gray-600 focus:border-blue-500 outline-none transition-all"
                    />
                    <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-600">🔍</span>
                    {searchQuery && (
                      <button
                        onClick={() => setSearchQuery('')}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-white"
                      >
                        ✕
                      </button>
                    )}
                  </div>
                </div>

                {/* Style Grid */}
                <div className="flex-1 overflow-y-auto custom-scrollbar p-4">
                  {/* Custom Styles Section */}
                  {customStyles.filter(s => !s.isBuiltIn).length > 0 && (
                    <div className="mb-6">
                      <h3 className="text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-3 flex items-center gap-2">
                        <span>👤</span> 我的风格
                      </h3>
                      <div className="grid grid-cols-2 xl:grid-cols-3 gap-3">
                        {customStyles.filter(s => !s.isBuiltIn).map(style => (
                          <StyleCard
                            key={style.id}
                            style={style}
                            isActive={activeStyle?.id === style.id}
                            onSelect={() => onSelectStyle(style)}
                            onEdit={() => handleEdit(style)}
                            onDelete={() => setDeleteConfirm(style)}
                            canDelete
                            onUpdateImage={onUpdateStyleImage}
                          />
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Built-in Styles */}
                  <div>
                    <h3 className="text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-3 flex items-center gap-2">
                      <span>💎</span> 系统预设
                    </h3>
                    <div className="grid grid-cols-2 xl:grid-cols-3 gap-3">
                      {filteredStyles.filter(s => s.isBuiltIn).map(style => (
                        <StyleCard
                          key={style.id}
                          style={style}
                          isActive={activeStyle?.id === style.id}
                          onSelect={() => onSelectStyle(style)}
                          onEdit={() => handleEdit(style, true)}
                          canDelete={false}
                          onUpdateImage={onUpdateStyleImage}
                        />
                      ))}
                    </div>
                  </div>

                  {filteredStyles.length === 0 && searchQuery && (
                    <div className="py-12 text-center text-gray-600">
                      <span className="text-3xl">🔍</span>
                      <p className="text-sm mt-2">未找到匹配的风格</p>
                    </div>
                  )}
                </div>
              </>
            ) : (
              /* Editor Mode */
              <div className="flex-1 p-6 flex flex-col animate-in slide-in-from-right-4 duration-200">
                <div className="flex items-center gap-3 mb-6 pb-4 border-b border-white/5">
                  <button 
                    onClick={() => { setMode('list'); setEditingStyle(null); }}
                    className="text-gray-500 hover:text-white flex items-center gap-1 text-sm"
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                    </svg>
                    返回
                  </button>
                  <h3 className="text-lg font-bold text-white">
                    {editingStyle ? '编辑风格' : '新建风格'}
                  </h3>
                </div>

                <div className="flex-1 space-y-5">
                  {/* Name */}
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-gray-400">风格名称</label>
                    <input
                      value={formData.name}
                      onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                      className="w-full bg-[#1A1A1A] border border-white/10 rounded-xl px-4 py-3 text-sm text-white focus:border-blue-500 outline-none transition-all"
                      placeholder="例如：暗黑油画风"
                    />
                  </div>

                  {/* Color */}
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-gray-400">预览颜色</label>
                    <div className="flex items-center gap-3">
                      <input
                        type="color"
                        value={formData.previewColor}
                        onChange={(e) => setFormData(prev => ({ ...prev, previewColor: e.target.value }))}
                        className="w-12 h-12 rounded-xl cursor-pointer border-0 bg-transparent"
                      />
                      <input
                        value={formData.previewColor}
                        onChange={(e) => setFormData(prev => ({ ...prev, previewColor: e.target.value }))}
                        className="flex-1 bg-[#1A1A1A] border border-white/10 rounded-xl px-4 py-3 text-sm text-white font-mono focus:border-blue-500 outline-none"
                        placeholder="#6366f1"
                      />
                    </div>
                  </div>

                  {/* Prompt */}
                  <div className="space-y-2 flex-1 flex flex-col">
                    <label className="text-xs font-bold text-gray-400">Prompt 提示词 (英文推荐)</label>
                    <textarea
                      value={formData.prompt}
                      onChange={(e) => setFormData(prev => ({ ...prev, prompt: e.target.value }))}
                      className="flex-1 bg-[#1A1A1A] border border-white/10 rounded-xl px-4 py-3 text-sm text-gray-300 font-mono focus:border-blue-500 outline-none resize-none leading-relaxed min-h-[160px]"
                      placeholder="Enter style keywords in English for best results. e.g., dramatic lighting, muted colors, cinematic, high detail..."
                    />
                    <p className="text-[10px] text-gray-600">这些关键词会自动添加到每次 AI 绘图请求中</p>
                  </div>
                </div>

                {/* Actions */}
                <div className="flex justify-end gap-3 pt-4 border-t border-white/5">
                  <button
                    onClick={() => { setMode('list'); setEditingStyle(null); }}
                    className="px-6 py-2.5 text-gray-400 hover:text-white rounded-xl text-sm font-medium transition-colors"
                  >
                    取消
                  </button>
                  <button
                    onClick={handleSave}
                    disabled={!formData.name.trim() || !formData.prompt.trim()}
                    className="px-8 py-2.5 bg-blue-600 hover:bg-blue-500 text-white rounded-xl font-bold text-sm shadow-lg disabled:opacity-50 disabled:cursor-not-allowed transition-all active:scale-[0.98]"
                  >
                    保存并应用
                  </button>
                </div>
              </div>
            )}
          </main>
        </div>

        {/* Delete Confirmation */}
        {deleteConfirm && (
          <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm animate-in fade-in duration-150">
            <div className="bg-[#1A1A1A] border border-red-500/30 rounded-2xl p-6 w-80 shadow-2xl animate-in zoom-in-95 duration-200">
              <h4 className="text-white font-bold mb-2">确认删除？</h4>
              <p className="text-gray-400 text-xs mb-4">
                即将删除风格 "{deleteConfirm.name}"<br />
                此操作无法撤销
              </p>
              <div className="flex gap-2 justify-end">
                <button
                  onClick={() => setDeleteConfirm(null)}
                  className="px-4 py-2 text-sm text-gray-400 hover:text-white transition-colors"
                >
                  取消
                </button>
                <button
                  onClick={handleDelete}
                  disabled={isDeleting}
                  className="px-4 py-2 bg-red-600 hover:bg-red-500 text-white rounded-lg text-sm font-bold transition-all"
                >
                  {isDeleting ? '删除中...' : '确认删除'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

// ============================================================================
// Style Card Component
// ============================================================================

const StyleCard: React.FC<{
  style: NovelStyle;
  isActive: boolean;
  onSelect: () => void;
  onEdit: () => void;
  onDelete?: () => void;
  canDelete: boolean;
  onUpdateImage?: (styleId: string, imageUrl: string) => void;
}> = ({ style, isActive, onSelect, onEdit, onDelete, canDelete, onUpdateImage }) => {
  const gradientClass = style.previewGradient || 'from-gray-600 to-gray-800';
  const hasPreviewImage = !!style.previewImage;
  
  // Handle image upload
  const handleImageUpload = (e: React.MouseEvent) => {
    e.stopPropagation();
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.onchange = (ev: Event) => {
      const file = (ev.target as HTMLInputElement).files?.[0];
      if (file && onUpdateImage) {
        const reader = new FileReader();
        reader.onload = (re) => {
          onUpdateImage(style.id, re.target?.result as string);
        };
        reader.readAsDataURL(file);
      }
    };
    input.click();
  };

  // Handle URL input
  const handleUrlInput = (e: React.MouseEvent) => {
    e.stopPropagation();
    const url = prompt('请输入图片 URL:');
    if (url && onUpdateImage) {
      onUpdateImage(style.id, url);
    }
  };
  
  return (
    <div
      className={`group relative rounded-xl border overflow-hidden cursor-pointer transition-all duration-200 hover:scale-[1.02] hover:shadow-xl ${
        isActive
          ? 'border-blue-500 ring-2 ring-blue-500/30 shadow-lg shadow-blue-500/10'
          : 'border-white/5 hover:border-white/20 bg-[#1A1A1A]'
      }`}
      onClick={onSelect}
    >
      {/* Preview Header - Image or Gradient */}
      <div 
        className={`h-24 relative overflow-hidden ${!hasPreviewImage ? `bg-gradient-to-br ${gradientClass}` : ''}`}
        style={!hasPreviewImage && !style.previewGradient ? { background: `linear-gradient(135deg, ${style.previewColor || '#555'}, ${style.previewColor || '#333'}80)` } : undefined}
      >
        {/* Preview Image */}
        {hasPreviewImage ? (
          <img 
            src={style.previewImage} 
            alt={style.name}
            className="w-full h-full object-cover"
          />
        ) : (
          /* Decorative Elements for gradient */
          <div className="absolute inset-0 opacity-30">
            <div className="absolute top-2 left-2 w-8 h-8 border border-white/30 rounded" />
            <div className="absolute bottom-2 right-2 w-4 h-4 bg-white/20 rounded-full" />
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-12 h-[1px] bg-white/30 rotate-45" />
          </div>
        )}
        
        {/* Actions */}
        <div className="absolute top-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          {/* Upload Image Button */}
          {onUpdateImage && (
            <>
              <button
                onClick={handleImageUpload}
                className="w-6 h-6 rounded-full bg-black/50 backdrop-blur-sm flex items-center justify-center text-white/70 hover:text-green-400 hover:bg-black/70 transition-all"
                title="上传本地图片"
              >
                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
              </button>
              <button
                onClick={handleUrlInput}
                className="w-6 h-6 rounded-full bg-black/50 backdrop-blur-sm flex items-center justify-center text-white/70 hover:text-cyan-400 hover:bg-black/70 transition-all"
                title="输入图片 URL"
              >
                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
                </svg>
              </button>
            </>
          )}
          <button
            onClick={(e) => { e.stopPropagation(); onEdit(); }}
            className="w-6 h-6 rounded-full bg-black/50 backdrop-blur-sm flex items-center justify-center text-white/70 hover:text-white hover:bg-black/70 transition-all"
            title={style.isBuiltIn ? '创建副本' : '编辑'}
          >
            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
            </svg>
          </button>
          {canDelete && onDelete && (
            <button
              onClick={(e) => { e.stopPropagation(); onDelete(); }}
              className="w-6 h-6 rounded-full bg-black/50 backdrop-blur-sm flex items-center justify-center text-white/70 hover:text-red-400 hover:bg-black/70 transition-all"
              title="删除"
            >
              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>

        {/* Active Badge */}
        {isActive && (
          <div className="absolute top-2 left-2 px-2 py-0.5 bg-blue-500 rounded-full text-[9px] font-bold text-white shadow-lg">
            使用中
          </div>
        )}
        
        {/* Built-in Badge */}
        {style.isBuiltIn && !isActive && (
          <div className="absolute bottom-2 left-2 px-1.5 py-0.5 bg-black/40 backdrop-blur-sm rounded text-[8px] text-white/70">
            预设
          </div>
        )}
      </div>

      {/* Info */}
      <div className="p-3 bg-[#161616]">
        <div className="flex items-center gap-2 mb-1">
          <div 
            className="w-2.5 h-2.5 rounded-full shadow shrink-0" 
            style={{ backgroundColor: style.previewColor || '#555' }}
          />
          <span className={`text-xs font-bold truncate ${isActive ? 'text-blue-300' : 'text-gray-200'}`}>
            {style.name}
          </span>
        </div>
        
        {/* Genre Tag */}
        {style.genre && (
          <div className="mb-1.5 flex flex-wrap gap-1">
            {style.genre.split('、').slice(0, 3).map((g, i) => (
              <span 
                key={i}
                className="px-1.5 py-0.5 rounded text-[8px] bg-white/5 text-gray-400 border border-white/5"
              >
                {g}
              </span>
            ))}
          </div>
        )}
        
        <p className="text-[9px] text-gray-500 line-clamp-2 leading-relaxed font-mono">
          {style.prompt}
        </p>
      </div>
    </div>
  );
};

export default StyleManager;
