/**
 * RuntimeDispatch — picks the best available on-device LLM runtime for the
 * current platform, once, and caches the choice.
 *
 * Kept deliberately platform-only here — anything tool-schema / app-specific
 * belongs in the consumer app, not in the library.
 */

import { Platform } from 'react-native';
import AppleFoundationModels from './AppleFoundationModelsRuntime';
import GeminiNano from './GeminiNanoRuntime';
import type { Runtime, WarmUpResult } from './types';

const CANDIDATES: Runtime[] =
  Platform.select({
    ios: [AppleFoundationModels],
    android: [GeminiNano],
    default: [] as Runtime[],
  }) ?? [];

let active: Runtime | null = null;
let picked = false;
let pickPromise: Promise<Runtime | null> | null = null;

export async function pickRuntime(): Promise<Runtime | null> {
  if (picked) return active;
  if (pickPromise) return pickPromise;

  pickPromise = (async () => {
    for (const rt of CANDIDATES) {
      try {
        if (await rt.isAvailable()) {
          active = rt;
          break;
        }
      } catch {
        // capability probe threw — try the next one
      }
    }
    picked = true;
    return active;
  })();

  return pickPromise;
}

export function currentRuntime(): Runtime | null {
  return active;
}

export function isReadySync(): boolean {
  return active != null && active.isLoadedSync();
}

export async function warmUp(): Promise<WarmUpResult> {
  const rt = await pickRuntime();
  if (!rt) return { ok: false, reason: 'no-runtime' };
  try {
    await rt.init();
    return { ok: true, backend: rt.backendId };
  } catch (err) {
    return { ok: false, reason: `init-failed: ${(err as Error)?.message}` };
  }
}

export async function unload(): Promise<void> {
  if (active) {
    try { await active.unload(); } catch { /* ignore */ }
  }
}

export function reset(): void {
  active = null;
  picked = false;
  pickPromise = null;
}

/**
 * Force-install a runtime, bypassing the platform pick. Used by tests
 * (see MockRuntime) and by simulator dev where neither Apple Foundation
 * Models nor Gemini Nano is functional.
 */
export function install(runtime: Runtime): void {
  active = runtime;
  picked = true;
  pickPromise = null;
}

export default {
  pickRuntime,
  currentRuntime,
  isReadySync,
  warmUp,
  unload,
  reset,
  install,
};
