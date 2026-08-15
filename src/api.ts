/** Cloud Code Assist streaming implementation for Google Anti Gravity. */

import {
  calculateCost,
  createAssistantMessageEventStream,
} from '@earendil-works/pi-ai'
import type {
  AssistantMessageEventStream,
  AssistantMessage,
  Context,
  Model,
  ProviderStreams,
  SimpleStreamOptions,
  StreamOptions,
  TextContent,
  ThinkingContent,
  ToolCall,
} from '@earendil-works/pi-ai'
import {
  convertMessages,
  convertTools,
  isThinkingPart,
  mapStopReasonString,
  retainThoughtSignature,
} from '@earendil-works/pi-ai/api/google-shared'
import { antiGravityHeaders } from './auth.ts'
import { ENDPOINTS } from './models.ts'
import type { AntiGravityApi } from './models.ts'

interface AntiGravityAuth { token: string; projectId: string }
interface ResponsePart {
  text?: string
  thought?: boolean
  thoughtSignature?: string
  functionCall?: { id?: string; name?: string; args?: Record<string, unknown> }
}
interface ResponseChunk {
  response?: {
    responseId?: string
    candidates?: Array<{ content?: { parts?: ResponsePart[] }; finishReason?: string }>
    usageMetadata?: {
      promptTokenCount?: number
      candidatesTokenCount?: number
      thoughtsTokenCount?: number
      cachedContentTokenCount?: number
      totalTokenCount?: number
    }
  }
}

function parseAuth(value: string | undefined): AntiGravityAuth {
  if (value === undefined) throw new Error('Anti Gravity requires OAuth authentication')
  let parsed: unknown
  try { parsed = JSON.parse(value) } catch { throw new Error('Anti Gravity OAuth request credential is invalid') }
  if (typeof parsed !== 'object' || parsed === null
    || typeof (parsed as { token?: unknown }).token !== 'string'
    || typeof (parsed as { projectId?: unknown }).projectId !== 'string') {
    throw new Error('Anti Gravity OAuth request credential is incomplete')
  }
  return parsed as AntiGravityAuth
}

function requestBody(model: Model<AntiGravityApi>, context: Context, options: StreamOptions, projectId: string): unknown {
  const googleModel = model as unknown as Model<'google-generative-ai'>
  const request: Record<string, unknown> = {
    contents: convertMessages(googleModel, context),
    ...options.sessionId === undefined ? {} : { sessionId: options.sessionId },
  }
  if (context.systemPrompt !== undefined) {
    request.systemInstruction = { role: 'user', parts: [{ text: context.systemPrompt }] }
  }
  const generationConfig: Record<string, unknown> = {}
  if (options.temperature !== undefined) generationConfig.temperature = options.temperature
  if (options.maxTokens !== undefined) generationConfig.maxOutputTokens = options.maxTokens
  if (Object.keys(generationConfig).length > 0) request.generationConfig = generationConfig
  if (context.tools !== undefined && context.tools.length > 0) {
    request.tools = convertTools(context.tools, model.id.startsWith('claude-'))
  }
  return {
    project: projectId,
    model: model.id,
    request,
    requestType: 'agent',
    userAgent: 'antigravity',
    requestId: `agent-${crypto.randomUUID()}`,
  }
}

async function openResponse(
  model: Model<AntiGravityApi>,
  context: Context,
  options: StreamOptions,
  auth: AntiGravityAuth,
): Promise<Response> {
  let payload = requestBody(model, context, options, auth.projectId)
  const replacement = await options.onPayload?.(payload, model)
  if (replacement !== undefined) payload = replacement
  const body = JSON.stringify(payload)
  let lastStatus: number | undefined
  for (const endpoint of ENDPOINTS) {
    const headers = {
      ...Object.fromEntries(Object.entries(options.headers ?? {}).filter((entry): entry is [string, string] => entry[1] !== null)),
      ...antiGravityHeaders(auth.token),
      accept: 'text/event-stream',
      ...model.id.startsWith('claude-')
        ? { 'anthropic-beta': 'interleaved-thinking-2025-05-14' }
        : {},
    }
    const response = await fetch(`${endpoint}/v1internal:streamGenerateContent?alt=sse`, {
      method: 'POST',
      headers,
      body,
      ...options.signal === undefined ? {} : { signal: options.signal },
    })
    await options.onResponse?.({ status: response.status, headers: Object.fromEntries(response.headers) }, model)
    if (response.ok) return response
    lastStatus = response.status
    if (![403, 404, 429, 500, 502, 503, 504].includes(response.status)) break
  }
  throw new Error(`Anti Gravity inference failed with HTTP ${lastStatus ?? 'unknown'}`)
}

/**
 * Native provider stream used by the registered pi-ai provider.
 * @param model - selected Anti Gravity model descriptor.
 * @param context - system prompt, history, and tools for this request.
 * @param options - pi-ai transport, credential, and cancellation options.
 * @returns assistant event stream backed by Cloud Code Assist SSE.
 */
export function streamAntiGravity(
  model: Model<AntiGravityApi>,
  context: Context,
  options: StreamOptions = {},
): AssistantMessageEventStream {
  const stream = createAssistantMessageEventStream()
  const output: AssistantMessage = {
    role: 'assistant',
    content: [],
    api: model.api,
    provider: model.provider,
    model: model.id,
    usage: {
      input: 0,
      output: 0,
      cacheRead: 0,
      cacheWrite: 0,
      totalTokens: 0,
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
    },
    stopReason: 'stop',
    timestamp: Date.now(),
  }
  void (async () => {
    try {
      const auth = parseAuth(options.apiKey)
      const response = await openResponse(model, context, options, auth)
      if (response.body === null) throw new Error('Anti Gravity returned no response stream')
      const reader = response.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''
      let started = false
      let current: TextContent | ThinkingContent | undefined
      const ensureStarted = (): void => {
        if (started) return
        started = true
        stream.push({ type: 'start', partial: output })
      }
      const closeCurrent = (): void => {
        if (current === undefined) return
        const index = output.content.length - 1
        if (current.type === 'text') stream.push({ type: 'text_end', contentIndex: index, content: current.text, partial: output })
        else stream.push({ type: 'thinking_end', contentIndex: index, content: current.thinking, partial: output })
        current = undefined
      }
      const consume = (chunk: ResponseChunk): void => {
        const data = chunk.response
        if (data === undefined) return
        if (output.responseId === undefined && data.responseId !== undefined) output.responseId = data.responseId
        const candidate = data.candidates?.[0]
        for (const part of candidate?.content?.parts ?? []) {
          if (part.text !== undefined) {
            const thinking = isThinkingPart(part)
            let active = current
            if (current === undefined || (thinking && current.type !== 'thinking') || (!thinking && current.type !== 'text')) {
              closeCurrent()
              const created: TextContent | ThinkingContent = thinking
                ? {
                  type: 'thinking',
                  thinking: '',
                  ...part.thoughtSignature === undefined ? {} : { thinkingSignature: part.thoughtSignature },
                }
                : { type: 'text', text: '' }
              current = created
              active = created
              output.content.push(created)
              ensureStarted()
              const index = output.content.length - 1
              stream.push(thinking
                ? { type: 'thinking_start', contentIndex: index, partial: output }
                : { type: 'text_start', contentIndex: index, partial: output })
            }
            const index = output.content.length - 1
            if (active === undefined) throw new Error('Anti Gravity stream block was not initialized')
            if (active.type === 'thinking') {
              active.thinking += part.text
              const signature = retainThoughtSignature(active.thinkingSignature, part.thoughtSignature)
              if (signature !== undefined) active.thinkingSignature = signature
              stream.push({ type: 'thinking_delta', contentIndex: index, delta: part.text, partial: output })
            } else {
              active.text += part.text
              stream.push({ type: 'text_delta', contentIndex: index, delta: part.text, partial: output })
            }
          }
          if (part.functionCall !== undefined) {
            closeCurrent()
            const toolCall: ToolCall = {
              type: 'toolCall',
              id: part.functionCall.id ?? `${part.functionCall.name ?? 'tool'}_${crypto.randomUUID()}`,
              name: part.functionCall.name ?? '',
              arguments: part.functionCall.args ?? {},
              ...part.thoughtSignature === undefined ? {} : { thoughtSignature: part.thoughtSignature },
            }
            output.content.push(toolCall)
            ensureStarted()
            const index = output.content.length - 1
            stream.push({ type: 'toolcall_start', contentIndex: index, partial: output })
            stream.push({ type: 'toolcall_delta', contentIndex: index, delta: JSON.stringify(toolCall.arguments), partial: output })
            stream.push({ type: 'toolcall_end', contentIndex: index, toolCall, partial: output })
          }
        }
        if (candidate?.finishReason !== undefined) output.stopReason = mapStopReasonString(candidate.finishReason)
        if (output.content.some(block => block.type === 'toolCall')) output.stopReason = 'toolUse'
        const usage = data.usageMetadata
        if (usage !== undefined) {
          const cacheRead = usage.cachedContentTokenCount ?? 0
          output.usage = {
            input: Math.max(0, (usage.promptTokenCount ?? 0) - cacheRead),
            output: (usage.candidatesTokenCount ?? 0) + (usage.thoughtsTokenCount ?? 0),
            reasoning: usage.thoughtsTokenCount ?? 0,
            cacheRead,
            cacheWrite: 0,
            totalTokens: usage.totalTokenCount ?? 0,
            cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
          }
          calculateCost(model, output.usage)
        }
      }
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() ?? ''
        for (const line of lines) {
          if (!line.startsWith('data:')) continue
          const text = line.slice(5).trim()
          if (text.length === 0) continue
          consume(JSON.parse(text) as ResponseChunk)
        }
      }
      closeCurrent()
      if (output.content.length === 0) throw new Error('Anti Gravity returned an empty response')
      const reason = output.stopReason === 'toolUse' || output.stopReason === 'length' ? output.stopReason : 'stop'
      stream.push({ type: 'done', reason, message: output })
      stream.end()
    } catch (error) {
      output.stopReason = options.signal?.aborted ? 'aborted' : 'error'
      output.errorMessage = error instanceof Error ? error.message : String(error)
      stream.push({ type: 'error', reason: output.stopReason, error: output })
      stream.end()
    }
  })()
  return stream
}

const streamSimple = (model: Model<AntiGravityApi>, context: Context, options?: SimpleStreamOptions) =>
  streamAntiGravity(model, context, options)

/** Provider stream pair supplied to `createProvider`. */
export const antiGravityApi: ProviderStreams = {
  stream: (model, context, options) => streamAntiGravity(model as Model<AntiGravityApi>, context, options),
  streamSimple: (model, context, options) => streamSimple(model as Model<AntiGravityApi>, context, options),
}
