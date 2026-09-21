import { buildInstructions, parseToolCalls, splitSystemAndTurns } from '../toolProtocol';
import type { ChatMessage, ToolSchema } from '../types';

const TOOLS: ToolSchema[] = [
  {
    name: 'get_weather',
    description: 'Return current weather for a city.',
    parameters: {
      type: 'object',
      properties: { city: { type: 'string' } },
      required: ['city'],
    },
  },
];

describe('splitSystemAndTurns', () => {
  test('separates system prompts from user/assistant/tool turns', () => {
    const messages: ChatMessage[] = [
      { role: 'system', content: 'You are helpful.' },
      { role: 'user', content: 'hi' },
      { role: 'assistant', content: 'hello!' },
      { role: 'user', content: 'what time is it?' },
    ];
    const { system, turns } = splitSystemAndTurns(messages);
    expect(system).toBe('You are helpful.');
    expect(turns).toHaveLength(3);
    expect(turns[0].role).toBe('user');
    expect(turns[2].content).toBe('what time is it?');
  });

  test('concatenates multiple system messages with a blank line', () => {
    const { system } = splitSystemAndTurns([
      { role: 'system', content: 'A' },
      { role: 'system', content: 'B' },
      { role: 'user', content: 'hi' },
    ]);
    expect(system).toBe('A\n\nB');
  });

  test('empty input yields empty system + no turns', () => {
    const { system, turns } = splitSystemAndTurns([]);
    expect(system).toBe('');
    expect(turns).toHaveLength(0);
  });
});

describe('buildInstructions', () => {
  test('returns system prompt unchanged when no tools', () => {
    expect(buildInstructions('be nice', [])).toBe('be nice');
  });

  test('appends tool catalogue + <tool_call> format', () => {
    const out = buildInstructions('be nice', TOOLS);
    expect(out).toContain('be nice');
    expect(out).toContain('## Available tools');
    expect(out).toContain('<tool_call>');
    expect(out).toContain('get_weather');
    expect(out).toContain('Return current weather for a city.');
    expect(out).toContain('"required":["city"]');
  });
});

describe('parseToolCalls', () => {
  test('plain natural-language reply → content only, no tool calls', () => {
    const out = parseToolCalls('Hello there!');
    expect(out.content).toBe('Hello there!');
    expect(out.toolCalls).toHaveLength(0);
  });

  test('single tool call block → parsed, content stripped', () => {
    const raw = '<tool_call>{"name":"get_weather","arguments":{"city":"Paris"}}</tool_call>';
    const out = parseToolCalls(raw);
    expect(out.content).toBe('');
    expect(out.toolCalls).toHaveLength(1);
    expect(out.toolCalls[0]).toMatchObject({
      name: 'get_weather',
      args: { city: 'Paris' },
    });
    expect(out.toolCalls[0].id).toMatch(/^parsed_/);
  });

  test('multiple tool call blocks are all parsed in order', () => {
    const raw =
      '<tool_call>{"name":"a","arguments":{}}</tool_call>\n' +
      '<tool_call>{"name":"b","arguments":{"x":1}}</tool_call>';
    const out = parseToolCalls(raw);
    expect(out.toolCalls).toHaveLength(2);
    expect(out.toolCalls[0].name).toBe('a');
    expect(out.toolCalls[1]).toMatchObject({ name: 'b', args: { x: 1 } });
  });

  test('malformed JSON is ignored, other calls still parse', () => {
    const raw =
      '<tool_call>not-json</tool_call>' + '<tool_call>{"name":"ok","arguments":{}}</tool_call>';
    const out = parseToolCalls(raw);
    expect(out.toolCalls).toHaveLength(1);
    expect(out.toolCalls[0].name).toBe('ok');
  });

  test('tool call with missing name is skipped', () => {
    const raw = '<tool_call>{"arguments":{}}</tool_call>';
    const out = parseToolCalls(raw);
    expect(out.toolCalls).toHaveLength(0);
  });

  test('prose + tool call → content keeps prose, toolCalls populated', () => {
    const raw = 'thinking...\n' + '<tool_call>{"name":"x","arguments":{}}</tool_call>\n' + 'done.';
    const out = parseToolCalls(raw);
    expect(out.toolCalls).toHaveLength(1);
    expect(out.content).toContain('thinking...');
    expect(out.content).toContain('done.');
    expect(out.content).not.toContain('<tool_call>');
  });

  test('trims leading/trailing whitespace on the content field', () => {
    expect(parseToolCalls('   hi   ').content).toBe('hi');
  });
});
