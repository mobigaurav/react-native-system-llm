# Changelog

All notable changes to `react-native-system-llm` are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Initial `v0.0.0-pre` scaffolding.
- Public TypeScript API: `SystemLLM.warmUp / step / unload / isReadySync / install`.
- Public types in `src/types.ts` (`ChatMessage`, `Role`, `ToolSchema`, `RuntimeStep`, `Runtime`, `WarmUpResult`, `BackendId`).
- `RuntimeDispatch` — platform picker + cache + `install()` hook for tests / simulator dev.
- `AppleFoundationModelsRuntime` (iOS 26+, wraps `LanguageModelSession`).
- `GeminiNanoRuntime` (Android, wraps ML Kit GenAI Generation client).
- `MockRuntime` — scriptable stand-in for tests and simulator / emulator dev.
- `toolProtocol.ts` — shared prompt-engineered `<tool_call>` builder + parser.
- iOS native bridge (`ios/SystemLLMFoundationModels.swift` + `.m`) implementing the full tool-call protocol against Apple's Foundation Models framework.
- Android native bridge (`android/.../SystemLLMGeminiNanoModule.kt` + `Package.kt`) implementing the tool-call protocol; ML Kit GenAI call site behind a `TODO(v0.1)` until the SDK stabilises.
- README with API, install steps, usage example, roadmap, and requirements.
- MIT LICENSE.

### Known limitations

- Not yet published to npm. Consume from git for now.
- Android bridge's `isAvailable()` returns `false` until the ML Kit GenAI dependency is on the classpath and the real `getFeatureStatus` call site is wired in — see the `TODO(v0.1)` comment in `SystemLLMGeminiNanoModule.kt`.
- No CI yet.
- No example app yet.

See the [roadmap](README.md#roadmap) in the README for what's planned.
