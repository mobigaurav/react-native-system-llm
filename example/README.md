# react-native-system-llm — example

Placeholder for the todo-bot demo app. See the parent
[../README.md](../README.md) roadmap → v0.1.

Planned shape once the API is stable:

```
example/
├── App.tsx              — one-screen todo bot
├── package.json         — pins react-native-system-llm via file: link
├── ios/                 — RN template + `pod install` step
└── android/             — RN template + gradle changes
```

The demo shows:

- Capability probe on mount → falls back to a stub reply on ineligible devices
- A single `add_todo` tool executed against local state
- Loop terminating on assistant reply

Contributions welcome — this is a good "first PR" target. See [../CONTRIBUTING.md](../CONTRIBUTING.md).
