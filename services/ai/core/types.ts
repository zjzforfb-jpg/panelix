import { AppSettings, Asset, WebtoonScript } from '../../../types';

// --- Provider Interfaces (The "How") ---

export interface IAIProvider {
  id: string;
}

export interface ILLMProvider extends IAIProvider {
  generateText(prompt: string, config?: any): Promise<string>;
}

export interface IImageProvider extends IAIProvider {
  generateImage(prompt: string, config?: any): Promise<string>;
}

// --- Agent Interfaces (The "What") ---

export interface IAgentContext {
  settings: AppSettings;
  signal?: AbortSignal;
}

export interface IAgent<TInput, TOutput> {
  execute(input: TInput, context: IAgentContext): Promise<TOutput>;
}

// --- Specific Input/Output Schemas ---

export interface WriterInput {
  episode: any; // PlotEpisode
  breakdownIssueText?: string;
  panelCount: number;
}

export interface WriterOutput {
  script: WebtoonScript;
  newAssets: Asset[];
}

export interface ImageGenInput {
  prompt: string;
  aspectRatio: string;
  negativePrompt?: string;
}

export interface ImageGenOutput {
  url: string;
  provider: string;
}
