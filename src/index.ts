/**
 * Public API for react-native-system-llm.
 *
 * The default export dispatches to whichever OS-native runtime is available
 * on the current device, or throws if none is. Call `warmUp()` on chat mount
 * to gate features behind capability + init.
 *
 * See ../README.md for the shape of a consumer app's tool loop and the
 * install steps for each platform's native bridge.
 */

import RuntimeDispatch from './RuntimeDispatch';
import type { RuntimeStep, RuntimeStepInput, WarmUpResult } from './types';

export { default as MockRuntime } from './MockRuntime';
export { default as AppleFoundationModelsRuntime } from './AppleFoundationModelsRuntime';
export { default as GeminiNanoRuntime } from './GeminiNanoRuntime';
export { buildInstructions, parseToolCalls, splitSystemAndTurns } from './toolProtocol';

export type {
  ChatMessage,
  Role,
  ToolSchema,
  RuntimeStep,
  RuntimeStepInput,
  RuntimeToolCall,
  Runtime,
  WarmUpResult,
  BackendId,
} from './types';

/**
 * Cheap synchronous readiness gate — returns true only when a runtime has
 * already been picked AND its underlying model session is loaded. Safe to
 * call on chat mount.
 */
export function isReadySync(): boolean {
  return RuntimeDispatch.isReadySync();
}

/**
 * Idempotent init. Picks a runtime for the platform (Apple Foundation Models
 * on iOS 26+, Gemini Nano on Android when AICore is available) and loads its
 * session so the first user turn doesn't pay init cost.
 */
export async function warmUp(): Promise<WarmUpResult> {
  return RuntimeDispatch.warmUp();
}

/**
 * Run one tool-loop hop. The caller is responsible for dispatching the
 * returned tool calls and appending their results as `{ role: 'tool', ... }`
 * messages before the next `step()` call.
 */
export async function step(input: RuntimeStepInput): Promise<RuntimeStep> {
  const rt = await RuntimeDispatch.pickRuntime();
  if (!rt) {
    throw new Error(
      'react-native-system-llm: no runtime available on this device. ' +
        'Call warmUp() first and check its result — the caller should fall ' +
        'back to the cloud path when ok=false.',
    );
  }
  if (!rt.isLoadedSync()) await rt.init();
  return rt.step(input);
}

/**
 * Release the underlying model's RAM. Call on chat unmount, low-memory
 * warnings, or before app background if the transcript is stashed on disk.
 */
export async function unload(): Promise<void> {
  return RuntimeDispatch.unload();
}

/**
 * Advanced — swap in a custom runtime (see MockRuntime). Used by tests and
 * simulator development where the OS-native runtimes are unavailable.
 */
export const install = RuntimeDispatch.install;

const SystemLLM = {
  isReadySync,
  warmUp,
  step,
  unload,
  install,
};

export default SystemLLM;
