//
// SystemLLMFoundationModels.swift
//
// iOS native bridge for the on-device LLM.
//
// The class itself is available on ALL iOS versions because React Native's
// ObjC bridge (RCT_EXTERN_MODULE) registers it at app startup regardless of
// the device's iOS version. All FoundationModels-touching code lives behind:
//
//   #if canImport(FoundationModels)   ← compile-time (only compiled when built
//                                       against the iOS 26+ SDK)
//   if #available(iOS 26.0, *)        ← runtime (only executed on iOS 26+)
//
// So this file compiles cleanly under Xcode 15 (no FoundationModels SDK) and
// Xcode 26 (with SDK), and links safely with a `Weak` linkage on
// FoundationModels.framework so pre-iOS-26 devices can still install the app.
//
// History handling: we fold the entire conversation into a single prompt
// string on each generate() hop instead of using Apple's Transcript API.
// Reasons: (a) Transcript.Entry's case names aren't stable in the GA docs
// and vary by Xcode point release; (b) our JS caller already tracks the full
// history and passes it every hop, so session-level memory is redundant.
// The prompt uses <user>/<assistant>/<tool> tags — same shape as the Kotlin
// bridge.
//
// Public method surface (called from SystemLLMFoundationModels.m):
//
//   isAvailable()   -> Bool
//   createSession() -> Void
//   generate(...)   -> JSON
//   releaseSession()-> Void
//

import Foundation
#if canImport(FoundationModels)
import FoundationModels
#endif

@objc(SystemLLMFoundationModels)
class SystemLLMFoundationModels: NSObject {

  @objc static func requiresMainQueueSetup() -> Bool { return false }

  // MARK: - isAvailable

  @objc
  func isAvailable(_ resolve: @escaping RCTPromiseResolveBlock,
                   rejecter reject: @escaping RCTPromiseRejectBlock) {
    #if canImport(FoundationModels)
    if #available(iOS 26.0, *) {
      let model = SystemLanguageModel.default
      switch model.availability {
      case .available:
        resolve(true)
      default:
        // .unavailable(reason) — device not eligible, model downloading, or
        // Apple Intelligence disabled by user.
        resolve(false)
      }
    } else {
      resolve(false)
    }
    #else
    resolve(false)
    #endif
  }

  // MARK: - createSession

  @objc
  func createSession(_ resolve: @escaping RCTPromiseResolveBlock,
                     rejecter reject: @escaping RCTPromiseRejectBlock) {
    // No-op — a fresh session is built inside generate(). Kept as an @objc
    // entry point so the JS side can still call it during warm-up.
    resolve(nil)
  }

  // MARK: - generate  (one tool-loop hop)

  // Payload shape (from JS):
  //   {
  //     messages: [{ role, content, tool_calls?, tool_call_id?, name? }],
  //     tools:    [{ name, description, parameters: <JSON schema> }],
  //     maxOutputTokens: 512,
  //     temperature: 0.2
  //   }
  //
  // Return shape:
  //   {
  //     content:   String,
  //     toolCalls: [{ id, name, arguments: Object }]
  //   }

  @objc(generate:withResolver:withRejecter:)
  func generate(_ payload: NSDictionary,
                resolve: @escaping RCTPromiseResolveBlock,
                reject: @escaping RCTPromiseRejectBlock) {
    #if canImport(FoundationModels)
    if #available(iOS 26.0, *) {
      Task {
        await Self.runGenerateIOS26(payload, resolve: resolve, reject: reject)
      }
    } else {
      reject("os-too-old", "Foundation Models requires iOS 26.0 or later", nil)
    }
    #else
    reject("no-framework", "FoundationModels framework unavailable at build time", nil)
    #endif
  }

  // MARK: - releaseSession

  @objc
  func releaseSession(_ resolve: @escaping RCTPromiseResolveBlock,
                      rejecter reject: @escaping RCTPromiseRejectBlock) {
    resolve(nil)
  }
}

// MARK: - iOS 26 implementation

#if canImport(FoundationModels)

@available(iOS 26.0, *)
private extension SystemLLMFoundationModels {

  static func runGenerateIOS26(_ payload: NSDictionary,
                               resolve: @escaping RCTPromiseResolveBlock,
                               reject: @escaping RCTPromiseRejectBlock) async {
    do {
      let messages = payload["messages"] as? [[String: Any]] ?? []
      let tools = payload["tools"] as? [[String: Any]] ?? []
      let maxTokens = payload["maxOutputTokens"] as? Int ?? 512
      let temperature = payload["temperature"] as? Double ?? 0.2

      let (systemPrompt, turns) = splitSystemAndTurns(messages)
      let instructions = buildInstructions(systemPrompt: systemPrompt, tools: tools)
      let fullPrompt = buildFullPrompt(instructions: instructions, turns: turns)

      let session = LanguageModelSession(model: SystemLanguageModel.default)
      let options = GenerationOptions(
        temperature: temperature,
        maximumResponseTokens: maxTokens
      )

      let response = try await session.respond(to: fullPrompt, options: options)
      let raw = response.content

      let parsed = parseToolCalls(raw)
      resolve([
        "content": parsed.content,
        "toolCalls": parsed.toolCalls.map { $0.asDict() }
      ])
    } catch {
      reject("generate-failed", error.localizedDescription, error)
    }
  }
}

#endif

// MARK: - helpers (available on all iOS versions — only touch Foundation)

private extension SystemLLMFoundationModels {

  struct ParsedToolCall {
    let id: String
    let name: String
    let arguments: [String: Any]

    func asDict() -> [String: Any] {
      return ["id": id, "name": name, "arguments": arguments]
    }
  }

  struct ParsedResponse {
    let content: String
    let toolCalls: [ParsedToolCall]
  }

  static func splitSystemAndTurns(_ messages: [[String: Any]])
    -> (system: String, turns: [[String: Any]]) {
    var system = ""
    var turns: [[String: Any]] = []
    for m in messages {
      let role = m["role"] as? String ?? ""
      if role == "system" {
        if let content = m["content"] as? String {
          system += (system.isEmpty ? "" : "\n\n") + content
        }
      } else {
        turns.append(m)
      }
    }
    return (system, turns)
  }

  static func buildInstructions(systemPrompt: String, tools: [[String: Any]]) -> String {
    var out = systemPrompt
    guard !tools.isEmpty else { return out }
    out += "\n\n## Available tools\n"
    out += "You may call the following tools. To call a tool, reply with ONE OR MORE tool_call blocks and nothing else — no prose before or after. Each block must be strict JSON on its own line, wrapped in <tool_call>...</tool_call>. If you don't need a tool, reply with the final answer for the user in plain prose. Never mix a tool_call block with prose in the same reply.\n\n"
    out += "Format for calling a tool:\n"
    out += "<tool_call>{\"name\":\"<tool_name>\",\"arguments\":{...}}</tool_call>\n\n"
    out += "Tools:\n"
    for tool in tools {
      let name = tool["name"] as? String ?? "?"
      let desc = tool["description"] as? String ?? ""
      var line = "- \(name): \(desc)"
      if let params = tool["parameters"],
         let data = try? JSONSerialization.data(withJSONObject: params, options: []),
         let json = String(data: data, encoding: .utf8) {
        line += "\n    arguments schema: \(json)"
      }
      out += line + "\n"
    }
    return out
  }

  static func buildFullPrompt(instructions: String, turns: [[String: Any]]) -> String {
    var sb = instructions
    sb += "\n\n---\n"
    for m in turns {
      guard let role = m["role"] as? String else { continue }
      let content = m["content"] as? String ?? ""
      switch role {
      case "user":
        sb += "<user>\n\(content)\n</user>\n"
      case "assistant":
        sb += "<assistant>\n\(content)\n</assistant>\n"
      case "tool":
        let name = m["name"] as? String ?? "tool"
        sb += "<tool name=\"\(name)\">\n\(content)\n</tool>\n"
      default:
        break
      }
    }
    // Prime the model for its next response.
    sb += "<assistant>\n"
    return sb
  }

  static func parseToolCalls(_ raw: String) -> ParsedResponse {
    let pattern = "<tool_call>\\s*(\\{[\\s\\S]*?\\})\\s*</tool_call>"
    guard let regex = try? NSRegularExpression(pattern: pattern, options: []) else {
      return ParsedResponse(content: raw, toolCalls: [])
    }
    let nsRaw = raw as NSString
    let matches = regex.matches(in: raw, options: [],
                                range: NSRange(location: 0, length: nsRaw.length))
    guard !matches.isEmpty else {
      return ParsedResponse(content: raw.trimmingCharacters(in: .whitespacesAndNewlines),
                            toolCalls: [])
    }

    var calls: [ParsedToolCall] = []
    for (idx, match) in matches.enumerated() {
      guard match.numberOfRanges >= 2 else { continue }
      let jsonRange = match.range(at: 1)
      let jsonString = nsRaw.substring(with: jsonRange)
      guard let data = jsonString.data(using: .utf8) else { continue }
      // Parens matter — without them Swift parses this as
      // `try?(jsonObject as? [String:Any])` and hands back a double optional.
      guard let raw = try? JSONSerialization.jsonObject(with: data, options: []),
            let obj = raw as? [String: Any]
      else { continue }
      let name = obj["name"] as? String ?? ""
      guard !name.isEmpty else { continue }
      let args = (obj["arguments"] as? [String: Any]) ?? [:]
      let ts = Int(Date().timeIntervalSince1970 * 1000)
      calls.append(ParsedToolCall(id: "apple_\(ts)_\(idx)", name: name, arguments: args))
    }

    let stripped = regex.stringByReplacingMatches(
      in: raw, options: [],
      range: NSRange(location: 0, length: nsRaw.length),
      withTemplate: ""
    ).trimmingCharacters(in: .whitespacesAndNewlines)

    return ParsedResponse(content: stripped, toolCalls: calls)
  }
}
