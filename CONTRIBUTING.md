# Contributing to react-native-system-llm

Thanks for considering a contribution! This library is small enough that
almost any improvement — from a typo fix to a new runtime adapter — is
welcome.

## Ways to help

- **Bug reports.** Open an issue with the RN version, iOS / Android version,
  device, and a minimal repro. If the model returned something unexpected,
  paste the raw model output too.
- **Docs.** README improvements, better examples, clarifications.
- **Real-device testing.** Especially valuable — the OS models can only be
  tested on eligible hardware, and coverage matrix reports (device × iOS /
  Android version × model behaviour) help pin the roadmap.
- **Code.** See open issues; the `good first issue` label lists items that
  are self-contained.

## Development setup

```bash
git clone https://github.com/mobigaurav/react-native-system-llm.git
cd react-native-system-llm
yarn install
yarn typecheck
yarn lint
yarn test
```

To try changes against a real app, use `yarn link` or the `example/` app
once it lands (v0.1 roadmap item).

## PR checklist

- [ ] Types compile: `yarn typecheck`
- [ ] Lint clean: `yarn lint`
- [ ] Tests pass: `yarn test`
- [ ] If you touched Swift or Kotlin, describe the manual real-device test
      you ran (device, OS version, what you saw)
- [ ] Update `CHANGELOG.md` under `[Unreleased]`
- [ ] If you added a new public API, update the README

## Code style

- TypeScript strict mode; no `any` unless clearly justified in a comment
- Swift: match Apple sample conventions; keep FoundationModels-touching code
  inside `#if canImport(FoundationModels)` guards so older SDK builds still
  compile
- Kotlin: match Google's ML Kit sample conventions

## The tool-call protocol

The prompt-engineered protocol (`<tool_call>{...}</tool_call>` blocks) is
core to the API surface — changes to it must:

- Keep both platform bridges in lock-step
- Preserve the `RuntimeStep` return shape
- Include a test in `MockRuntime` covering the new behaviour
- Note the change in `CHANGELOG.md`

## Licensing

By contributing, you agree that your contributions will be licensed under
the MIT License (see [LICENSE](LICENSE)).

## Code of Conduct

Be kind. Assume good intent. Give clear feedback. We follow the
[Contributor Covenant](https://www.contributor-covenant.org/version/2/1/code_of_conduct/)
v2.1.
