//
// SystemLLMGeminiNanoModule.kt
//
// Android native bridge for react-native-system-llm. Wraps Google's
// AICore + Gemini Nano via ML Kit GenAI. Exposes the same four-method
// surface as the iOS Foundation Models bridge:
//
//   isAvailable()   -> Boolean       AICore + Gemini Nano capability check
//   createSession() -> Unit          clear cached session; a fresh one is built on next generate()
//   generate(...)   -> WritableMap   one tool-loop hop
//   releaseSession()-> Unit          free RAM
//
// Tool-calling strategy is identical to the iOS bridge (kept in lock-step so
// both platforms feed the same JS tool loop): the model replies either with a
// natural-language answer, or with strict-JSON
// <tool_call>{"name":"...","arguments":{...}}</tool_call> blocks that this
// module parses out and hands back to JS.

package com.reactnativesystemllm

import com.facebook.react.bridge.*
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import org.json.JSONArray
import org.json.JSONObject

class SystemLLMGeminiNanoModule(reactContext: ReactApplicationContext)
  : ReactContextBaseJavaModule(reactContext) {

  override fun getName(): String = "SystemLLMGeminiNano"

  // ------ isAvailable ------

  @ReactMethod
  fun isAvailable(promise: Promise) {
    CoroutineScope(Dispatchers.IO).launch {
      try {
        // TODO(v0.1): switch to real ML Kit GenAI availability check once
        // the SDK is stable. Reference call site:
        //   val options = GenerativeAiInferenceOptions
        //     .Builder(reactApplicationContext, GenerativeAiInferenceOptions.GENERATIVE_AI_MODEL)
        //     .build()
        //   val status = GenAiInference.getFeatureStatus(options).await()
        //   promise.resolve(status == FeatureStatus.AVAILABLE)
        //
        // Safe default (false) means the caller's fallback path runs.
        promise.resolve(false)
      } catch (t: Throwable) {
        promise.resolve(false)
      }
    }
  }

  // ------ createSession ------

  @ReactMethod
  fun createSession(promise: Promise) {
    CoroutineScope(Dispatchers.IO).launch {
      try {
        // Client is created on the first generate() call so we have the
        // tool catalogue and can fold it into the prompt.
        promise.resolve(null)
      } catch (t: Throwable) {
        promise.reject("session-init", t.message ?: "createSession failed", t)
      }
    }
  }

  // ------ generate ------

  // Payload / return shapes identical to the iOS bridge:
  //   in:  { messages, tools, maxOutputTokens, temperature }
  //   out: { content: String, toolCalls: [{ id, name, arguments }] }
  @ReactMethod
  fun generate(payload: ReadableMap, promise: Promise) {
    CoroutineScope(Dispatchers.IO).launch {
      try {
        val messages = payload.getArray("messages")?.let { readListOfMaps(it) } ?: emptyList()
        val tools = payload.getArray("tools")?.let { readListOfMaps(it) } ?: emptyList()
        val maxTokens = if (payload.hasKey("maxOutputTokens")) payload.getInt("maxOutputTokens") else 512
        val temperature = if (payload.hasKey("temperature")) payload.getDouble("temperature") else 0.2

        val (systemPrompt, turns) = splitSystemAndTurns(messages)
        val instructions = buildInstructions(systemPrompt, tools)
        val prompt = buildFullPrompt(instructions, turns)

        // TODO(v0.1): real inference. Reference call site (waiting on stable SDK):
        //   val request = GenerateContentRequest.Builder()
        //     .setPrompt(prompt)
        //     .setMaxOutputTokens(maxTokens)
        //     .setTemperature(temperature.toFloat())
        //     .build()
        //   val response = client.generateContent(request).await()
        //   val raw = response.candidates.firstOrNull()?.content ?: ""
        val raw = generatePlaceholder(prompt, maxTokens, temperature)

        val parsed = parseToolCalls(raw)
        val out = Arguments.createMap().apply {
          putString("content", parsed.content)
          val callsArr = Arguments.createArray()
          parsed.toolCalls.forEach { tc ->
            val m = Arguments.createMap().apply {
              putString("id", tc.id)
              putString("name", tc.name)
              putMap("arguments", jsonObjectToWritableMap(tc.arguments))
            }
            callsArr.pushMap(m)
          }
          putArray("toolCalls", callsArr)
        }
        promise.resolve(out)
      } catch (t: Throwable) {
        promise.reject("generate-failed", t.message ?: "generate failed", t)
      }
    }
  }

  // ------ releaseSession ------

  @ReactMethod
  fun releaseSession(promise: Promise) {
    promise.resolve(null)
  }

  // ------ helpers ------

  private data class ParsedToolCall(
    val id: String,
    val name: String,
    val arguments: JSONObject,
  )

  private data class ParsedResponse(
    val content: String,
    val toolCalls: List<ParsedToolCall>,
  )

  private fun readListOfMaps(arr: ReadableArray): List<Map<String, Any?>> {
    val out = mutableListOf<Map<String, Any?>>()
    for (i in 0 until arr.size()) {
      when (arr.getType(i)) {
        ReadableType.Map -> arr.getMap(i)?.let { out.add(readableMapToMap(it)) }
        else -> {}
      }
    }
    return out
  }

  private fun readableMapToMap(m: ReadableMap): Map<String, Any?> {
    val out = mutableMapOf<String, Any?>()
    val it = m.keySetIterator()
    while (it.hasNextKey()) {
      val k = it.nextKey()
      out[k] = when (m.getType(k)) {
        ReadableType.Null -> null
        ReadableType.Boolean -> m.getBoolean(k)
        ReadableType.Number -> m.getDouble(k)
        ReadableType.String -> m.getString(k)
        ReadableType.Map -> m.getMap(k)?.let { readableMapToMap(it) }
        ReadableType.Array -> m.getArray(k)?.let { readableArrayToList(it) }
      }
    }
    return out
  }

  private fun readableArrayToList(arr: ReadableArray): List<Any?> {
    val out = mutableListOf<Any?>()
    for (i in 0 until arr.size()) {
      out.add(when (arr.getType(i)) {
        ReadableType.Null -> null
        ReadableType.Boolean -> arr.getBoolean(i)
        ReadableType.Number -> arr.getDouble(i)
        ReadableType.String -> arr.getString(i)
        ReadableType.Map -> arr.getMap(i)?.let { readableMapToMap(it) }
        ReadableType.Array -> arr.getArray(i)?.let { readableArrayToList(it) }
      })
    }
    return out
  }

  private fun splitSystemAndTurns(messages: List<Map<String, Any?>>)
    : Pair<String, List<Map<String, Any?>>> {
    val system = StringBuilder()
    val turns = mutableListOf<Map<String, Any?>>()
    for (m in messages) {
      val role = m["role"] as? String ?: ""
      if (role == "system") {
        val content = m["content"] as? String
        if (content != null) {
          if (system.isNotEmpty()) system.append("\n\n")
          system.append(content)
        }
      } else {
        turns.add(m)
      }
    }
    return Pair(system.toString(), turns)
  }

  private fun buildInstructions(systemPrompt: String, tools: List<Map<String, Any?>>): String {
    val sb = StringBuilder(systemPrompt)
    if (tools.isEmpty()) return sb.toString()
    sb.append("\n\n## Available tools\n")
    sb.append("You may call the following tools. To call a tool, reply with ONE OR MORE tool_call blocks and nothing else — no prose before or after. Each block must be strict JSON on its own line, wrapped in <tool_call>...</tool_call>. If you don't need a tool, reply with the final answer for the user in plain prose. Never mix a tool_call block with prose in the same reply.\n\n")
    sb.append("Format for calling a tool:\n")
    sb.append("<tool_call>{\"name\":\"<tool_name>\",\"arguments\":{...}}</tool_call>\n\n")
    sb.append("Tools:\n")
    for (tool in tools) {
      val name = tool["name"] as? String ?: "?"
      val desc = tool["description"] as? String ?: ""
      sb.append("- ").append(name).append(": ").append(desc)
      val params = tool["parameters"]
      if (params != null) {
        val json = try { JSONObject(params as Map<String, Any?>).toString() } catch (_: Throwable) { null }
        if (json != null) sb.append("\n    arguments schema: ").append(json)
      }
      sb.append("\n")
    }
    return sb.toString()
  }

  private fun buildFullPrompt(instructions: String, turns: List<Map<String, Any?>>): String {
    val sb = StringBuilder()
    sb.append(instructions).append("\n\n---\n")
    for (m in turns) {
      val role = m["role"] as? String ?: continue
      val content = m["content"] as? String ?: ""
      when (role) {
        "user" -> sb.append("<user>\n").append(content).append("\n</user>\n")
        "assistant" -> sb.append("<assistant>\n").append(content).append("\n</assistant>\n")
        "tool" -> {
          val name = m["name"] as? String ?: "tool"
          sb.append("<tool name=\"").append(name).append("\">\n")
            .append(content).append("\n</tool>\n")
        }
        else -> {}
      }
    }
    sb.append("<assistant>\n")
    return sb.toString()
  }

  private fun generatePlaceholder(
    @Suppress("UNUSED_PARAMETER") prompt: String,
    @Suppress("UNUSED_PARAMETER") maxTokens: Int,
    @Suppress("UNUSED_PARAMETER") temperature: Double,
  ): String {
    // Until ML Kit GenAI is added to the classpath, return an empty answer.
    // isAvailable() returns false in the same state so this path is normally
    // short-circuited before reaching generate().
    return ""
  }

  private fun parseToolCalls(raw: String): ParsedResponse {
    val regex = Regex("<tool_call>\\s*(\\{[\\s\\S]*?\\})\\s*</tool_call>")
    val matches = regex.findAll(raw).toList()
    if (matches.isEmpty()) {
      return ParsedResponse(raw.trim(), emptyList())
    }
    val calls = mutableListOf<ParsedToolCall>()
    val ts = System.currentTimeMillis()
    matches.forEachIndexed { idx, match ->
      val jsonStr = match.groupValues.getOrNull(1) ?: return@forEachIndexed
      val obj = try { JSONObject(jsonStr) } catch (_: Throwable) { return@forEachIndexed }
      val name = obj.optString("name")
      if (name.isNullOrEmpty()) return@forEachIndexed
      val args = obj.optJSONObject("arguments") ?: JSONObject()
      calls.add(ParsedToolCall(id = "gemini_${ts}_$idx", name = name, arguments = args))
    }
    val stripped = raw.replace(regex, "").trim()
    return ParsedResponse(stripped, calls)
  }

  private fun jsonObjectToWritableMap(obj: JSONObject): WritableMap {
    val out = Arguments.createMap()
    val keys = obj.keys()
    while (keys.hasNext()) {
      val k = keys.next()
      when (val v = obj.opt(k)) {
        null, JSONObject.NULL -> out.putNull(k)
        is Boolean -> out.putBoolean(k, v)
        is Int -> out.putInt(k, v)
        is Long -> out.putDouble(k, v.toDouble())
        is Double -> out.putDouble(k, v)
        is Float -> out.putDouble(k, v.toDouble())
        is String -> out.putString(k, v)
        is JSONObject -> out.putMap(k, jsonObjectToWritableMap(v))
        is JSONArray -> out.putArray(k, jsonArrayToWritableArray(v))
        else -> out.putString(k, v.toString())
      }
    }
    return out
  }

  private fun jsonArrayToWritableArray(arr: JSONArray): WritableArray {
    val out = Arguments.createArray()
    for (i in 0 until arr.length()) {
      when (val v = arr.opt(i)) {
        null, JSONObject.NULL -> out.pushNull()
        is Boolean -> out.pushBoolean(v)
        is Int -> out.pushInt(v)
        is Long -> out.pushDouble(v.toDouble())
        is Double -> out.pushDouble(v)
        is Float -> out.pushDouble(v.toDouble())
        is String -> out.pushString(v)
        is JSONObject -> out.pushMap(jsonObjectToWritableMap(v))
        is JSONArray -> out.pushArray(jsonArrayToWritableArray(v))
        else -> out.pushString(v.toString())
      }
    }
    return out
  }
}
