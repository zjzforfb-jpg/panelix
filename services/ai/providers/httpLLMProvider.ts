import { ILLMProvider } from "../core/types";

export class HttpLLMProvider implements ILLMProvider {
  id = 'http-llm';
  private apiKey: string;
  private baseUrl: string;
  private modelName: string;

  constructor(apiKey: string, baseUrl: string, modelName: string) {
    this.apiKey = apiKey;
    this.baseUrl = baseUrl;
    this.modelName = modelName;
  }

  async generateText(prompt: string, config?: any): Promise<string> {
    if (!this.apiKey || !this.baseUrl) {
        throw new Error("请在设置中配置 API Key 和 接口地址");
    }

    const isJsonMode = config?.responseMimeType === 'application/json';
    
    const payload: any = {
      model: this.modelName,
      messages: [
        { role: "user", content: prompt }
      ],
      stream: false
    };

    // Map Gemini config to OpenAI/Shenma compatible config
    if (isJsonMode) {
      payload.response_format = { type: "json_object" };
    }

    try {
      const response = await fetch(this.baseUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`
        },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
          const errText = await response.text();
          throw new Error(`API 请求失败 (${response.status}): ${errText}`);
      }

      const data = await response.json();
      const content = data.choices?.[0]?.message?.content;
      
      if (!content) {
         console.error("Empty response from API:", data);
         throw new Error("API 返回内容为空");
      }

      return content;
    } catch (error: any) {
      throw new Error(`LLM 生成失败: ${error.message}`);
    }
  }
}
