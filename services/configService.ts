import configData from '../config.json';
import { AppSettings } from '../types';

interface ConfigData {
  apiConfiguration: {
    apiKey: string;
    apiBaseUrl: string;
    volcArkApiKey?: string;
  };
  modelSelection: {
    splitterModel: string;
    writerModel: string;
    alignerModel: string;
    imageModel: string;
    customModels: string[];
  };
  prompts: {
    splitterPrompt: string;
    writerPrompt: string;
    alignerPrompt: string;
    breakdownPrompt: string;
    assetPrompt: string;
    stylePrompt: string;
    archivistPrompt: string;
  };
}

// 从 config.json 加载配置并转换为 AppSettings
export const loadConfigFromJSON = (): AppSettings => {
  const config = configData as ConfigData;
  
  return {
    // API Configuration
    apiKey: config.apiConfiguration.apiKey || '',
    apiBaseUrl: config.apiConfiguration.apiBaseUrl || '',
    volcArkApiKey: config.apiConfiguration.volcArkApiKey,
    
    // Model Selection
    splitterModel: config.modelSelection.splitterModel || 'gemini-3-flash-preview-nothinking',
    writerModel: config.modelSelection.writerModel || 'gemini-3-flash-preview-nothinking',
    alignerModel: config.modelSelection.alignerModel || 'gemini-3-flash-preview-nothinking',
    imageModel: config.modelSelection.imageModel || 'gemini-2.5-flash-image-preview',
    customModels: config.modelSelection.customModels || [],
    
    // Prompts
    splitterPrompt: config.prompts.splitterPrompt || '',
    writerPrompt: config.prompts.writerPrompt || '',
    alignerPrompt: config.prompts.alignerPrompt || '',
    breakdownPrompt: config.prompts.breakdownPrompt || '',
    assetPrompt: config.prompts.assetPrompt || '',
    stylePrompt: config.prompts.stylePrompt || '',
    archivistPrompt: config.prompts.archivistPrompt || '',
    
    // Storage
    storageKeyPrefix: 'automanju_projects'
  };
};

// 将 AppSettings 转换为 JSON 格式（用于导出）
export const exportSettingsToJSON = (settings: AppSettings): ConfigData => {
  return {
    apiConfiguration: {
      apiKey: settings.apiKey,
      apiBaseUrl: settings.apiBaseUrl,
      volcArkApiKey: settings.volcArkApiKey
    },
    modelSelection: {
      splitterModel: settings.splitterModel,
      writerModel: settings.writerModel,
      alignerModel: settings.alignerModel,
      imageModel: settings.imageModel,
      customModels: settings.customModels
    },
    prompts: {
      splitterPrompt: settings.splitterPrompt,
      writerPrompt: settings.writerPrompt,
      alignerPrompt: settings.alignerPrompt,
      breakdownPrompt: settings.breakdownPrompt,
      assetPrompt: settings.assetPrompt,
      stylePrompt: settings.stylePrompt,
      archivistPrompt: settings.archivistPrompt
    }
  };
};

// 从导入的 JSON 文件加载配置
export const importConfigFromJSON = async (file: File): Promise<AppSettings> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const json = JSON.parse(e.target?.result as string) as ConfigData;
        const settings = {
          apiKey: json.apiConfiguration.apiKey || '',
          apiBaseUrl: json.apiConfiguration.apiBaseUrl || '',
          volcArkApiKey: json.apiConfiguration.volcArkApiKey,
          splitterModel: json.modelSelection.splitterModel || 'gemini-3-flash-preview-nothinking',
          writerModel: json.modelSelection.writerModel || 'gemini-3-flash-preview-nothinking',
          alignerModel: json.modelSelection.alignerModel || 'gemini-3-flash-preview-nothinking',
          imageModel: json.modelSelection.imageModel || 'gemini-2.5-flash-image-preview',
          customModels: json.modelSelection.customModels || [],
          splitterPrompt: json.prompts.splitterPrompt || '',
          writerPrompt: json.prompts.writerPrompt || '',
          alignerPrompt: json.prompts.alignerPrompt || '',
          breakdownPrompt: json.prompts.breakdownPrompt || '',
          assetPrompt: json.prompts.assetPrompt || '',
          stylePrompt: json.prompts.stylePrompt || '',
          archivistPrompt: json.prompts.archivistPrompt || '',
          storageKeyPrefix: 'automanju_projects'
        };
        resolve(settings);
      } catch (error) {
        reject(new Error('无效的 JSON 配置文件'));
      }
    };
    reader.onerror = () => reject(new Error('读取文件失败'));
    reader.readAsText(file);
  });
};

// 下载配置为 JSON 文件
export const downloadConfigAsJSON = (settings: AppSettings) => {
  const jsonData = exportSettingsToJSON(settings);
  const jsonString = JSON.stringify(jsonData, null, 2);
  const blob = new Blob([jsonString], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'config.json';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
};