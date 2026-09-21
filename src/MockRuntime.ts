/**
 * MockRuntime — scriptable stand-in for a real OS-native runtime.
 *
 * Public use case: unit tests + simulator smoke tests. Install via
 * SystemLLM.install(MockRuntime) and load a script of canned responses.
 */

import type { Runtime, RuntimeStep, RuntimeStepInput } from './types';

interface ScriptEntry {
  content?: string;
  toolCalls?: Array<{ id?: string; name: string; args?: Record<string, unknown> }>;
}

let script: ScriptEntry[] = [];
let cursor = 0;
let loaded = false;

export function loadScript(steps: ScriptEntry[]): void {
  script = Array.isArray(steps) ? steps.slice() : [];
  cursor = 0;
}

export function reset(): void {
  script = [];
  cursor = 0;
  loaded = false;
}

const rt: Runtime & { loadScript: typeof loadScript; reset: typeof reset } = {
  backendId: 'mock',

  loadScript,
  reset,

  async isAvailable(): Promise<boolean> {
    return true;
  },

  isLoadedSync(): boolean {
    return loaded;
  },

  async init(): Promise<void> {
    loaded = true;
  },

  async step(_input: RuntimeStepInput): Promise<RuntimeStep> {
    if (cursor >= script.length) {
      throw new Error(
        `MockRuntime: script exhausted (${script.length} steps consumed, ` +
          `hop ${cursor + 1} requested)`,
      );
    }
    const entry = script[cursor];
    cursor += 1;
    const rawCalls = Array.isArray(entry.toolCalls) ? entry.toolCalls : [];
    return {
      role: 'assistant',
      content: entry.content ?? '',
      toolCalls: rawCalls.map((tc, idx) => ({
        id: tc.id ?? `mock_${cursor}_${idx}`,
        name: tc.name,
        args: (tc.args ?? {}) as Record<string, unknown>,
      })),
    };
  },

  async unload(): Promise<void> {
    loaded = false;
  },
};

export default rt;
