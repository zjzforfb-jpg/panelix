import { BaseAgent } from "../../core/base";
import { ILLMProvider, WriterInput, WriterOutput, IAgentContext } from "../../core/types";
import { WebtoonScript, ScriptPanel, Asset } from "../../../../types";

export class WriterAgent extends BaseAgent<WriterInput, WriterOutput, ILLMProvider> {
  
  protected buildPrompt(input: WriterInput, context: IAgentContext): string {
    const { episode, breakdownIssueText, panelCount } = input;
    const { settings } = context;

    let prompt = settings.writerPrompt;
    prompt += `\n\n【TARGET EPISODE】\nTitle: ${episode.title}\nConflict: ${episode.core_conflict}\nHook: ${episode.hook_type}\nVisual Summary: ${JSON.stringify(episode.scenes_summary)}`;
    
    if (breakdownIssueText) {
      prompt += `\n\n【QA ISSUES TO FIX】\n${breakdownIssueText}`;
    }
    
    prompt += `\n\n【CONSTRAINT】\nGenerate exactly ${panelCount} key panels.`;
    return prompt;
  }

  protected async parseResponse(rawResponse: string, input: WriterInput): Promise<WriterOutput> {
    // 1. Robust JSON Cleaning (Fixes the UI bug where markdown breaks parsing)
    const cleanJson = this.cleanJson(rawResponse);
    let data;
    try {
        data = JSON.parse(cleanJson);
    } catch (e) {
        console.error("JSON Parse Error. Raw:", rawResponse);
        throw new Error("AI 返回的数据格式错误，无法解析为 JSON。");
    }

    // 2. Transform to WebtoonScript
    const script: WebtoonScript = {
      episode_number: input.episode.episode_number,
      panels: (data.storyboard || []).map((b: any) => ({
        panel_id: b.id,
        script_content: b.script_content,
        duration: b.duration,
        active_characters_str: b.active_characters,
        scene_name: b.scene_name,
        props: b.props,
        composition: "Close-up",
        visual: "",
        dialogue: []
      } as ScriptPanel))
    };

    // 3. Transform to Assets
    const newAssets: Asset[] = [];
    if (data.characters) {
      data.characters.forEach((c: any) => {
        newAssets.push({
          id: `char_${Date.now()}_${Math.random().toString(36).substr(2,5)}`,
          type: 'character',
          name: c.name,
          description: c.description,
          prompt: c.description,
          aspectRatio: '9:16'
        });
      });
    }
    if (data.scenes) {
      data.scenes.forEach((s: any) => {
        newAssets.push({
          id: `scene_${Date.now()}_${Math.random().toString(36).substr(2,5)}`,
          type: 'scene',
          name: s.name,
          description: s.description,
          prompt: s.description,
          aspectRatio: '16:9'
        });
      });
    }

    return { script, newAssets };
  }
}
