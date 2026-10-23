import { AppSettings } from "../../types";
import { WriterAgent } from "./agents/text/WriterAgent";
import { ImageGenAgent } from "./agents/visual/ImageGenAgent";
import { GeminiProvider } from "./providers/geminiProvider";
import { HttpImageProvider } from "./providers/httpImageProvider";
import { HttpLLMProvider } from "./providers/httpLLMProvider";

export class AIServiceFactory {
  
  private static getProviderForText(settings: AppSettings, modelName: string) {
    // Check if using a custom base URL (e.g. WhatAI, OpenRouter)
    // If so, we bypass the Google SDK even for 'gemini' named models.
    const isCustomBaseUrl = settings.apiBaseUrl && 
                           !settings.apiBaseUrl.includes('googleapis.com') && 
                           !settings.apiBaseUrl.includes('generativelanguage.google.com');

    // 1. Use Google SDK for Gemini models ONLY if we are hitting Google directly
    if (modelName.toLowerCase().includes('gemini') && !isCustomBaseUrl) {
       return new GeminiProvider(settings.apiKey, modelName);
    }
    // 2. Use Generic HTTP for others (Shenma, OpenAI, DeepSeek, etc.) or proxied Gemini
    return new HttpLLMProvider(settings.apiKey, settings.apiBaseUrl, modelName);
  }

  static getTextAgent(type: 'writer', settings: AppSettings) {
    const modelName = settings.writerModel || 'gpt-4o';
    const provider = this.getProviderForText(settings, modelName);
    
    switch (type) {
      case 'writer':
        return new WriterAgent(provider);
      default:
        throw new Error(`Unknown text agent type: ${type}`);
    }
  }

  static getVisualAgent(type: 'image', settings: AppSettings) {
    const provider = new HttpImageProvider(
        settings.apiKey, 
        settings.apiBaseUrl, 
        settings.imageModel
    );

    switch (type) {
      case 'image':
        return new ImageGenAgent(provider);
      default:
        throw new Error(`Unknown visual agent type: ${type}`);
    }
  }
}
