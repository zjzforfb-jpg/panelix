import { IAgent, IAgentContext } from './types';

/**
 * Abstract Base Agent
 * TInput: The typed input data (e.g., PlotEpisode)
 * TOutput: The strictly typed output data (e.g., WebtoonScript)
 * TProvider: The type of provider this agent uses (ILLMProvider | IImageProvider)
 */
export abstract class BaseAgent<TInput, TOutput, TProvider> implements IAgent<TInput, TOutput> {
  protected provider: TProvider;

  constructor(provider: TProvider) {
    this.provider = provider;
  }

  /**
   * 1. Build the prompt string from structured input
   */
  protected abstract buildPrompt(input: TInput, context: IAgentContext): string;

  /**
   * 2. Parse and Validate the raw response from Provider
   */
  protected abstract parseResponse(rawResponse: string, input: TInput): Promise<TOutput>;

  /**
   * 3. (Optional) Call the provider. Default implementation assumes LLM text gen.
   * Override this for Image/Video generation.
   */
  protected async callProvider(prompt: string, context: IAgentContext): Promise<string> {
    // @ts-ignore - We assume TProvider has generateText by default, specific agents override this
    if (typeof (this.provider as any).generateText === 'function') {
        // @ts-ignore
        return await (this.provider as any).generateText(prompt, context.settings);
    }
    throw new Error("Provider does not support generateText");
  }

  /**
   * Main Execution Flow
   */
  public async execute(input: TInput, context: IAgentContext): Promise<TOutput> {
    try {
      // A. Construct Prompt
      const prompt = this.buildPrompt(input, context);
      
      // B. Call API
      const rawResponse = await this.callProvider(prompt, context);

      // C. Parse & Validate
      const result = await this.parseResponse(rawResponse, input);

      // D. Hook: Save History (Optional implementation)
      this.saveHistory(input, prompt, rawResponse, result);

      return result;

    } catch (error: any) {
      console.error(`[Agent Error] ${this.constructor.name}:`, error);
      // Enhance error with agent context
      throw new Error(`[${this.constructor.name}] Failed: ${error.message}`);
    }
  }

  protected saveHistory(input: TInput, prompt: string, rawResponse: string, result: TOutput) {
    // This is a hook for the architecture to log operations.
    // In a real DB scenario, we would write to an 'InteractionLog' table here.
    // console.debug(`[History] ${this.constructor.name} executed.`);
  }

  // Helper: Clean JSON markdown fences
  protected cleanJson(text: string): string {
    return text.replace(/```json\n|```json|```/g, '').trim();
  }
}
