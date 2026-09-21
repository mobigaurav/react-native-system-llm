/**
 * GeminiNanoRuntime — TS side of the AICore + Gemini Nano native bridge.
 * See `android/.../SystemLLMGeminiNanoModule.kt` for the Kotlin counterpart.
 */

import { NativeModules, Platform } from 'react-native';
import type { Runtime, RuntimeStep, RuntimeStepInput } from './types';

const NM: any = (NativeModules as any).SystemLLMGeminiNano;

let loaded = false;

const rt: Runtime = {
  backendId: 'gemini-nano',

  async isAvailable(): Promise<boolean> {
    if (Platform.OS !== 'android') return false;
    if (!NM) return false;
    try {
      return !!(await NM.isAvailable());
    } catch {
      return false;
    }
  },

  isLoadedSync(): boolean {
    return loaded;
  },

  async init(): Promise<void> {
    if (!NM) throw new Error('SystemLLMGeminiNano native module not linked');
    if (loaded) return;
    await NM.createSession();
    loaded = true;
  },

  async step(input: RuntimeStepInput): Promise<RuntimeStep> {
    if (!NM) throw new Error('SystemLLMGeminiNano native module not linked');
    if (!loaded) await this.init();

    const out = await NM.generate({
      messages: input.messages,
      tools: input.tools ?? [],
      maxOutputTokens: input.maxOutputTokens ?? 512,
      temperature: input.temperature ?? 0.2,
    });

    const toolCalls = Array.isArray(out?.toolCalls)
      ? out.toolCalls.map((tc: any, idx: number) => ({
          id: tc.id ?? `gemini_${Date.now()}_${idx}`,
          name: String(tc.name ?? ''),
          args: (tc.arguments ?? {}) as Record<string, unknown>,
        }))
      : [];

    return {
      role: 'assistant',
      content: typeof out?.content === 'string' ? out.content : '',
      toolCalls,
    };
  },

  async unload(): Promise<void> {
    if (!NM) return;
    try { await NM.releaseSession(); } catch { /* ignore */ }
    loaded = false;
  },
};

export default rt;
