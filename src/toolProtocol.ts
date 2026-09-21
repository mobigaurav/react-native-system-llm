/**
 * toolProtocol — helpers for the prompt-engineered tool-calling protocol
 * both native bridges (Swift + Kotlin) implement. Ported here so a v0.2
 * pure-JS runtime (e.g. WebLLM) can reuse the same parser.
 *
 * Wire format (model output):
 *   Either a natural-language reply, OR one or more strict-JSON blocks:
 *     <tool_call>{"name":"<tool>","arguments":{...}}</tool_call>
 *   Nothing else is allowed in a tool-calling reply.
 */

import type { ChatMessage, RuntimeToolCall, ToolSchema } from './types';

const TOOL_CALL_RE = /<tool_call>\s*(\{[\s\S]*?\})\s*<\/tool_call>/g;

export function buildInstructions(systemPrompt: string, tools: ToolSchema[] = []): string {
  if (tools.length === 0) return systemPrompt;
  const lines: string[] = [systemPrompt, ''];
  lines.push('## Available tools');
  lines.push(
    'You may call the following tools. To call a tool, reply with ONE OR MORE tool_call blocks and nothing else — no prose before or after. Each block must be strict JSON on its own line, wrapped in <tool_call>...</tool_call>. If you don\'t need a tool, reply with the final answer for the user in plain prose. Never mix a tool_call block with prose in the same reply.'
  );
  lines.push('');
  lines.push('Format for calling a tool:');
  lines.push('<tool_call>{"name":"<tool_name>","arguments":{...}}</tool_call>');
  lines.push('');
  lines.push('Tools:');
  for (const t of tools) {
    let line = `- ${t.name}: ${t.description}`;
    if (t.parameters) {
      line += `\n    arguments schema: ${JSON.stringify(t.parameters)}`;
    }
    lines.push(line);
  }
  return lines.join('\n');
}

export function parseToolCalls(raw: string): { content: string; toolCalls: RuntimeToolCall[] } {
  TOOL_CALL_RE.lastIndex = 0;
  const calls: RuntimeToolCall[] = [];
  let match: RegExpExecArray | null;
  let idx = 0;
  const ts = Date.now();
  // eslint-disable-next-line no-cond-assign
  while ((match = TOOL_CALL_RE.exec(raw)) !== null) {
    try {
      const obj = JSON.parse(match[1]);
      const name = String(obj.name ?? '');
      if (!name) continue;
      const args = (obj.arguments ?? {}) as Record<string, unknown>;
      calls.push({ id: `parsed_${ts}_${idx}`, name, args });
    } catch {
      // ignore malformed blocks; the model will retry on the next hop
    }
    idx += 1;
  }
  const stripped = raw.replace(TOOL_CALL_RE, '').trim();
  return { content: stripped, toolCalls: calls };
}

/**
 * Split conversation into a system prompt (concatenated) and the ordered
 * user/assistant/tool turns. Consumer code that flattens messages into a
 * single prompt string (e.g. Android's Gemini Nano public inference API)
 * uses this to know where system content ends.
 */
export function splitSystemAndTurns(
  messages: ChatMessage[]
): { system: string; turns: ChatMessage[] } {
  const systemParts: string[] = [];
  const turns: ChatMessage[] = [];
  for (const m of messages) {
    if (m.role === 'system') {
      if (m.content) systemParts.push(m.content);
    } else {
      turns.push(m);
    }
  }
  return { system: systemParts.join('\n\n'), turns };
}
