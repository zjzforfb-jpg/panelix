import React, { useState, useEffect } from 'react';
import { StoryBible } from '../types';

interface StoryBibleModalProps {
  isOpen: boolean;
  onClose: () => void;
  bible: StoryBible | null;
  onSave: (newBible: StoryBible) => void;
  onAutoGenerate: () => Promise<void>; // New callback
}

export const StoryBibleModal: React.FC<StoryBibleModalProps> = ({ 
  isOpen, 
  onClose, 
  bible, 
  onSave,
  onAutoGenerate 
}) => {
  const [formData, setFormData] = useState<StoryBible>({
    summary: '',
    last_plot_point: '',
    characters: {},
    updatedAt: Date.now()
  });

  const [charText, setCharText] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);

  useEffect(() => {
    if (bible) {
      setFormData(bible);
      setCharText(JSON.stringify(bible.characters || {}, null, 2));
    } else {
        setFormData({
            summary: "暂无故事记忆。",
            last_plot_point: "暂无。",
            characters: {},
            updatedAt: Date.now()
        });
        setCharText("{}");
    }
  }, [bible, isOpen]);

  if (!isOpen) return null;

  const handleSave = () => {
    try {
      const parsedChars = JSON.parse(charText);
      const newBible = {
        ...formData,
        characters: parsedChars,
        updatedAt: Date.now()
      };
      onSave(newBible);
      onClose();
    } catch (e) {
      alert("角色 JSON 格式错误，请检查语法。");
    }
  };

  const handleAutoGenerateClick = async () => {
    setIsGenerating(true);
    try {
      await onAutoGenerate();
      // Parent component updates 'bible' prop, useEffect will sync it to local state
    } catch (error) {
      // Error handled in parent usually
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 backdrop-blur-sm">
      <div className="w-[600px] bg-[#2C2C2E] border border-white/10 rounded-2xl shadow-2xl flex flex-col max-h-[85vh]">
        {/* Header */}
        <div className="h-14 px-6 bg-[#252525] border-b border-white/5 flex items-center justify-between shrink-0 rounded-t-2xl">
          <div className="flex items-center gap-2">
              <span className="text-lg">🧠</span>
              <h2 className="text-sm font-bold text-gray-100">剧情记忆库 (Story Bible)</h2>
          </div>
          <button onClick={onClose} className="text-gray-500 hover:text-white transition-colors">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-5 overflow-y-auto custom-scrollbar flex-1">
          
          {/* AI Auto-Generate Section */}
          <div className="bg-blue-900/10 border border-blue-500/20 rounded-lg p-4 flex flex-col sm:flex-row justify-between items-center gap-4">
             <div className="text-xs text-blue-200 leading-relaxed">
               <span className="font-bold">💡 记忆过期？</span> 让 Agent (Archivist) 阅读当前剧情拆解并重新总结。
             </div>
             <button
               onClick={handleAutoGenerateClick}
               disabled={isGenerating}
               className={`shrink-0 px-3 py-2 rounded-lg text-xs font-bold flex items-center gap-2 transition-all border shadow-lg ${
                 isGenerating 
                   ? 'bg-gray-700 text-gray-400 border-transparent cursor-not-allowed' 
                   : 'bg-blue-600/20 text-blue-300 border-blue-500/30 hover:bg-blue-600/30 hover:shadow-blue-500/20'
               }`}
             >
               {isGenerating ? (
                 <>
                   <span className="w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin"></span>
                   读取分析中...
                 </>
               ) : (
                 <>✨ AI 立即刷新记忆</>
               )}
             </button>
          </div>

          <div className="text-xs text-gray-500 bg-[#1E1E1E] border border-white/5 p-3 rounded-lg leading-relaxed">
            此数据用于在多卷之间保持剧情连贯性。您可以手动修正偏差。
          </div>

          <div>
            <label className="block text-xs font-bold text-gray-400 mb-2 uppercase">全书剧情摘要 (Summary)</label>
            <textarea 
              value={formData.summary}
              onChange={(e) => setFormData({...formData, summary: e.target.value})}
              className="w-full h-32 bg-[#1C1C1E] border border-[#3A3A3C] text-sm text-gray-200 rounded-lg p-3 outline-none focus:border-purple-500 resize-none"
              placeholder="全书主线摘要..."
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-gray-400 mb-2 uppercase">最新剧情节点 (Last Cliffhanger)</label>
            <textarea 
              value={formData.last_plot_point}
              onChange={(e) => setFormData({...formData, last_plot_point: e.target.value})}
              className="w-full h-20 bg-[#1C1C1E] border border-[#3A3A3C] text-sm text-gray-200 rounded-lg p-3 outline-none focus:border-purple-500 resize-none"
              placeholder="上一卷/集的结尾状态..."
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-gray-400 mb-2 uppercase">角色状态表 (JSON)</label>
            <textarea 
              value={charText}
              onChange={(e) => setCharText(e.target.value)}
              className="w-full h-40 bg-[#1C1C1E] border border-[#3A3A3C] text-xs font-mono text-gray-300 rounded-lg p-3 outline-none focus:border-purple-500 resize-none"
              placeholder='{ "Name": "Status" }'
            />
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 bg-[#252525]/50 border-t border-white/5 flex justify-end gap-3 rounded-b-2xl">
          <button 
            onClick={onClose}
            className="px-4 py-2 text-xs font-medium text-gray-400 hover:text-white transition-colors"
          >
            取消
          </button>
          <button 
            onClick={handleSave}
            className="px-4 py-2 bg-purple-600 hover:bg-purple-500 text-white text-xs font-bold rounded-lg shadow-lg transition-all active:scale-95"
          >
            保存记忆修正
          </button>
        </div>
      </div>
    </div>
  );
};