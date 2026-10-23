import { IImageProvider } from "../core/types";
import { AppSettings } from "../../../types";

export class HttpImageProvider implements IImageProvider {
  id = 'http-image';
  private apiKey: string;
  private baseUrl: string;
  private modelName: string;

  constructor(apiKey: string, baseUrl: string, modelName: string) {
    this.apiKey = apiKey;
    this.baseUrl = baseUrl;
    this.modelName = modelName;
  }

  async generateImage(prompt: string, config?: AppSettings): Promise<string> {
    if (!this.apiKey || !this.baseUrl) {
        throw new Error("请在设置中配置 API Key 和 接口地址");
    }

    const payload = {
        model: this.modelName,
        prompt: prompt,
        n: 1,
        size: "1024x1024",
        response_format: "url"
    };

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
            const err = await response.text();
            throw new Error(`Image API Error: ${err}`);
        }

        const data = await response.json();
        
        if (!data) throw new Error("API returned empty/invalid JSON response");

        // Case A: Standard Image Response (DALL-E)
        if (data.data && Array.isArray(data.data) && data.data.length > 0) {
            const item = data.data[0];
            if (item.b64_json) {
                return `data:image/png;base64,${item.b64_json}`;
            }
            if (item.url) return item.url;
        }

        // Case B: Chat Completion Response (Proxy wrapper fallback)
        if (data.choices && data.choices[0]?.message?.content) {
             const content = data.choices[0].message.content;
             if (content.startsWith('http')) return content;
        }

        throw new Error("Could not parse image URL from response");
    } catch (e: any) {
        throw new Error(`Image Generation Failed: ${e.message}`);
    }
  }
}