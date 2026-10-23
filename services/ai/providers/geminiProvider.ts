import { GoogleGenAI } from "@google/genai";
import { ILLMProvider } from "../core/types";

export class GeminiProvider implements ILLMProvider {
  id = 'gemini';
  private client: GoogleGenAI;
  private modelName: string;

  constructor(apiKey: string, modelName: string) {
    this.client = new GoogleGenAI({ apiKey });
    this.modelName = modelName;
  }

  async generateText(prompt: string, config?: any): Promise<string> {
    try {
      const response = await this.client.models.generateContent({
        model: this.modelName,
        contents: prompt,
        config: {
          responseMimeType: 'application/json',
          ...config
        }
      });
      
      if (!response.text) {
        throw new Error("Gemini returned empty text");
      }
      return response.text;
    } catch (e: any) {
      throw new Error(`Gemini API Error: ${e.message}`);
    }
  }
}
