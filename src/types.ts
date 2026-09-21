/**
 * Public types for react-native-system-llm.
 */

/**
 * Message roles supported by the tool-loop protocol. Same shape as the
 * OpenAI / Anthropic chat completions "messages" array so that consumer code
 * can pass its existing conversation transcript through unchanged.
 */
export type Role = 'system' | 'user' | 'assistant' | 'tool';

export interface ChatMessage {
  role: Role;
  content?: string;
  /** Present on assistant messages that emitted tool calls. */
  tool_calls?: Array<{
    id: string;
    function: { name: string; arguments: string };
  }>;
  /** Present on tool result messages. */
  tool_call_id?: string;
  /** Present on tool result messages. */
  name?: string;
}

/**
 * JSON-schema description of the tool's argument object. The runtime lowers
 * this into either a native typed Tool (when Apple / Google typed APIs are
 * available in a future version) or into a prompt-engineered instruction.
 */
export interface ToolSchema {
  name: string;
  description: string;
  parameters: {
    type: 'object';
    properties?: Record<string, unknown>;
    required?: string[];
  };
}

export interface RuntimeStepInput {
  messages: ChatMessage[];
  tools?: ToolSchema[];
  maxOutputTokens?: number;
  /** Range [0..2]; the runtime clamps to the underlying model's supported range. */
  temperature?: number;
}

export interface RuntimeToolCall {
  id: string;
  name: string;
  args: Record<string, unknown>;
}

export interface RuntimeStep {
  role: 'assistant';
  /** Terminal reply from the model. Empty string when only tool calls were emitted. */
  content: string;
  /** One or more tool calls the caller must dispatch before the next step(). */
  toolCalls: RuntimeToolCall[];
}

export type BackendId =
  | 'apple-foundation-models'
  | 'gemini-nano'
  | 'mock';

/**
 * A concrete runtime — one per platform (or a mock for tests / simulator).
 * Runtimes are stateless from the consumer's perspective; step() takes the
 * full transcript.
 */
export interface Runtime {
  readonly backendId: BackendId;
  isAvailable(): Promise<boolean>;
  isLoadedSync(): boolean;
  init(): Promise<void>;
  step(input: RuntimeStepInput): Promise<RuntimeStep>;
  unload(): Promise<void>;
}

export interface WarmUpResult {
  ok: boolean;
  backend?: BackendId;
  reason?: string;
}
