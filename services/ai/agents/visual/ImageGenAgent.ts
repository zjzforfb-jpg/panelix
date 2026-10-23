import { BaseAgent } from "../../core/base";
import { IImageProvider, ImageGenInput, ImageGenOutput, IAgentContext } from "../../core/types";

export class ImageGenAgent extends BaseAgent<ImageGenInput, ImageGenOutput, IImageProvider> {
  
  // Override callProvider because standard is generateText
  protected async callProvider(prompt: string, context: IAgentContext): Promise<string> {
      return await this.provider.generateImage(prompt, context.settings);
  }

  protected buildPrompt(input: ImageGenInput, context: IAgentContext): string {
    // Inject Safety & Style Context
    const safetyKeywords = ", fantasy art style, illustration, safe for work, pg-13";
    const cleanPrompt = input.prompt + safetyKeywords;

    const augmentedPrompt = input.aspectRatio 
        ? `${cleanPrompt} --aspect-ratio ${input.aspectRatio}` 
        : cleanPrompt;
        
    return augmentedPrompt;
  }

  protected async parseResponse(rawResponse: string, input: ImageGenInput): Promise<ImageGenOutput> {
    // Validate URL format
    if (!rawResponse.startsWith('http') && !rawResponse.startsWith('data:')) {
        throw new Error("Invalid image URL returned from provider");
    }
    return {
        url: rawResponse,
        provider: this.provider.id
    };
  }
}
