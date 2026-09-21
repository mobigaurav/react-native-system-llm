# react-native-system-llm

> Unified React Native API for the **OS-provided on-device LLM**: Apple Foundation Models on iOS 26+, Gemini Nano via AICore on Android.
> Zero bundled weights, ~50 KB of native bridge code, no download flow — the model already lives on the device.

[![npm](https://img.shields.io/npm/v/react-native-system-llm.svg)](https://www.npmjs.com/package/react-native-system-llm)
[![license](https://img.shields.io/npm/l/react-native-system-llm.svg)](LICENSE)
[![PRs welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](CONTRIBUTING.md)

**Status: pre-alpha (v0.0.0-pre).** Public JS + TS API is in place, native bridges ship as skeletons that call the reference implementation for the tool-loop protocol. See [Roadmap](#roadmap) for what needs to happen before v0.1.

---

## Why this exists

Every RN "run an LLM on device" library today either:

- Bundles a 1-2 GB model in your app (huge install size), or
- Downloads it on first launch (Wi-Fi guard, progress bar, storage permission dance), or
- Compiles down `llama.cpp` / `MLC` / `executorch` runtimes (heavy build config).

Meanwhile, iOS 26+ and modern Android ship an **~3 B parameter LLM as part of the OS** — accessible via `LanguageModelSession` on iOS and `GenAiInference` on Android. You get a competent instruction-tuned model, tuned for the Neural Engine / TPU, for zero install-size cost.

This library is the thin, opinionated wrapper that gives you one API for both.

## What you get

| | Bundled model | This library |
|---|---|---|
| App install size delta | +30-50 MB library + 1.8 GB weights | +~50 KB native bridge, zero weights |
| First-launch UX | Download prompt + progress bar + Wi-Fi guard | Nothing — model already on device |
| Runs on | iPhone 12+ / most Android | iPhone 15 Pro+ (iOS 26) + Pixel 8 Pro+ / Galaxy S24+ (Android) |
| Turn latency (~3 B model) | ~3-5 s | ~2-4 s (OS-tuned) |
| Privacy story | Weights ship with app | "Uses Apple Intelligence" / "Uses Gemini Nano" |
| Cloud infra | S3 + CDN | None |

On ineligible devices the library's capability probe returns `false` and your code falls back to whatever cloud path you want (OpenAI, Anthropic, self-hosted, etc.). Nothing breaks — the premium experience is just gated to modern hardware.

## Requirements

**iOS**

- Xcode 26 or later (iOS 26 SDK required for `FoundationModels.framework`)
- Physical device: iPhone 15 Pro / 16 / 17, running iOS 26 with Apple Intelligence enabled
- Deployment target: iOS 15+ works if you weak-link the framework and use `#available(iOS 26.0, *)` gates; simpler to bump to iOS 26 if you don't need older devices
- **The iOS simulator does not support Foundation Models.** Use `MockRuntime` for simulator development (see [Testing](#testing))

**Android**

- `compileSdk` 34+ (Android 14)
- `minSdk` 24+ recommended
- Physical device with AICore installed: Pixel 8 Pro, Pixel 9 family, Samsung Galaxy S24/S25, some Xiaomi/OnePlus flagships
- ML Kit GenAI SDK (`com.google.mlkit:genai-generation`)
- **The Android emulator does not support Gemini Nano.** Use `MockRuntime` for emulator development

## Install

```bash
npm install react-native-system-llm
# or
yarn add react-native-system-llm
```

**iOS**

```bash
cd ios && pod install
```

Add `FoundationModels.framework` to your app target under **Frameworks and Libraries** and mark it as **Optional** (weak-linked) if your deployment target is below iOS 26.

**Android**

Add the ML Kit GenAI deps to `android/app/build.gradle`:

```gradle
dependencies {
    implementation "com.google.mlkit:genai-common:0.1.0"
    implementation "com.google.mlkit:genai-generation:0.1.0"
}
```

The library is autolinked; no MainApplication edits needed for RN 0.72+.

## Usage

```ts
import SystemLLM, { ChatMessage, ToolSchema } from 'react-native-system-llm';

// 1. Capability probe on chat mount — cheap, safe to call anywhere
const status = await SystemLLM.warmUp();
if (!status.ok) {
  // Ineligible device (e.g. iOS 25 / no AICore) — fall back to your cloud path
  return runCloudChat();
}

// 2. Set up your tool schemas + system prompt
const tools: ToolSchema[] = [
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

const messages: ChatMessage[] = [
  { role: 'system', content: 'You are a helpful assistant.' },
  { role: 'user', content: 'What is the weather in Paris?' },
];

// 3. Multi-hop tool loop
for (let hop = 0; hop < 4; hop++) {
  const step = await SystemLLM.step({ messages, tools });

  if (step.toolCalls.length === 0) {
    console.log('Final answer:', step.content);
    break;
  }

  messages.push({
    role: 'assistant',
    content: step.content,
    tool_calls: step.toolCalls.map(tc => ({
      id: tc.id,
      function: { name: tc.name, arguments: JSON.stringify(tc.args) },
    })),
  });

  for (const tc of step.toolCalls) {
    const result = await runTool(tc.name, tc.args); // your app's tool runtime
    messages.push({
      role: 'tool',
      name: tc.name,
      tool_call_id: tc.id,
      content: JSON.stringify(result),
    });
  }
}

// 4. On chat unmount (optional)
await SystemLLM.unload();
```

## How tool calling works

The OS-native models don't (yet) expose a stable *runtime-defined* typed Tool API — Apple's `@Generable` requires compile-time argument types, and Android's typed function-calling for Gemini Nano is still evolving.

This library uses a **prompt-engineered tool-calling protocol** instead:

1. Your tool schemas get folded into the session instructions.
2. The model is told to reply either with a natural-language answer OR with strict-JSON tool-call blocks in `<tool_call>{"name":"...","arguments":{...}}</tool_call>` format.
3. The bridge parses those blocks out and returns them to your JS code as `RuntimeStep.toolCalls`.

This gives you portable, runtime-defined tool calling that works identically on iOS and Android. When Apple / Google stabilise their typed dynamic Tool APIs, we'll add opt-in typed bridges — the public JS surface won't change.

See [`src/toolProtocol.ts`](src/toolProtocol.ts) for the shared parser.

## API

```ts
import SystemLLM from 'react-native-system-llm';

SystemLLM.warmUp(): Promise<WarmUpResult>
SystemLLM.step(input: RuntimeStepInput): Promise<RuntimeStep>
SystemLLM.unload(): Promise<void>
SystemLLM.isReadySync(): boolean
SystemLLM.install(runtime: Runtime): void  // for tests + simulator dev
```

Full types in [`src/types.ts`](src/types.ts).

## Testing

Neither the iOS simulator nor the Android emulator supports the native models. For dev without a device, install `MockRuntime`:

```ts
import SystemLLM, { MockRuntime } from 'react-native-system-llm';

if (__DEV__ && isSimulatorOrEmulator()) {
  MockRuntime.loadScript([
    { toolCalls: [{ name: 'get_weather', args: { city: 'Paris' } }] },
    { content: 'It\'s 18°C and cloudy in Paris.' },
  ]);
  SystemLLM.install(MockRuntime);
}
```

Unit tests use the same mock — see the roadmap item for the reference test suite (planned v0.1).

## Roadmap

- [ ] **v0.1 — reference implementation ported in**: fully-fleshed Swift + Kotlin bridges implementing the tool-call protocol end-to-end. Currently the bridges are skeletons that reject with `not-implemented`.
- [ ] **v0.1 — CI**: GitHub Actions with lint, TypeScript typecheck, Jest against the mock runtime.
- [ ] **v0.1 — example app**: a small todo-bot in `example/` that uses `SystemLLM.step()` with a single `add_todo` tool. Real-device tested.
- [ ] **v0.2 — API stabilisation**: bake in a v1 API after real-app usage.
- [ ] **v0.3 — typed Tool bridges**: opt-in typed variants surfacing Apple's `@Generable` and Android's typed function-calling for apps whose tool schemas are known at compile time.
- [ ] **v0.4 — pluggable cloud fallback runtimes**: `SystemLLM.registerFallback(...)` adapters so the same call site can transparently fall back to OpenAI / Anthropic / self-hosted when no OS-native model is available.

## Related work

- Apple, **Foundation Models framework** (iOS 26 release notes) — https://developer.apple.com/documentation/foundationmodels
- Google, **ML Kit GenAI** — https://developers.google.com/ml-kit/genai
- `react-native-executorch` — bundled-model alternative for older devices
- `llama.cpp` bindings for RN — same tradeoffs, larger build config

## Contributing

PRs welcome — see [CONTRIBUTING.md](CONTRIBUTING.md). Issues and feature requests via GitHub.

## License

MIT — see [LICENSE](LICENSE).
