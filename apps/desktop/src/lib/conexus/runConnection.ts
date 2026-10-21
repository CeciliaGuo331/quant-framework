import { isTerminalRun, parseRunEventBlock } from "./runState.ts"
import type { AgentConversation, AgentSessionSnapshot, PublishedHarnessRun, PublishedHarnessRunEvent } from "./types.ts"

export class ConexusClientError extends Error {
  readonly status: number
  constructor(message: string, status: number) {
    super(message)
    this.status = status
    this.name = "ConexusClientError"
  }
}

export function isConnectionError(reason: unknown): boolean {
  return reason instanceof TypeError
    || (reason instanceof ConexusClientError && [429, 502, 503, 504].includes(reason.status))
}

export function connectionDelay(milliseconds: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) { reject(signal.reason); return }
    const abort = () => { clearTimeout(timer); reject(signal?.reason) }
    const timer = setTimeout(() => { signal?.removeEventListener("abort", abort); resolve() }, milliseconds)
    signal?.addEventListener("abort", abort, { once: true })
  })
}

// Reads may retry after a temporary network failure. Mutations are sent once.
export async function readWithRecovery<T>(
  read: () => Promise<T>, signal?: AbortSignal,
  wait = connectionDelay,
): Promise<T> {
  for (let attempt = 0; ; attempt += 1) {
    try { return await read() }
    catch (reason) {
      if (signal?.aborted || !isConnectionError(reason) || attempt >= 2) throw reason
      await wait(500 * 2 ** attempt, signal)
    }
  }
}

export async function submitRunOnce(
  create: () => Promise<{ run: PublishedHarnessRun; conversation: AgentConversation }>,
  readSession: () => Promise<AgentSessionSnapshot>,
  identity: { id: string; messageId: string },
): Promise<{ run: PublishedHarnessRun; conversation: AgentConversation }> {
  try { return await create() }
  catch (reason) {
    if (isConnectionError(reason)) {
      const session = await readSession().catch(() => null)
      const conversation = session?.conversations.find((item) => item.id === identity.id)
      const message = conversation?.messages.find((item) => item.id === identity.messageId)
      const recovered = session?.runs.find((item) => item.conversationId === conversation?.id && item.run.id === message?.runId)
      if (conversation && recovered) return { conversation, run: recovered.run }
    }
    throw reason
  }
}

export async function resumeRunEvents(params: {
  runId: string
  signal: AbortSignal
  open: (lastSequence: number) => Promise<ReadableStream<Uint8Array>>
  onEvent: (event: PublishedHarnessRunEvent) => void | Promise<void>
  wait?: typeof connectionDelay
}): Promise<void> {
  let lastSequence = 0
  let failures = 0
  while (!params.signal.aborted) {
    let reader: ReadableStreamDefaultReader<Uint8Array> | undefined
    let applying = false
    try {
      reader = (await params.open(lastSequence)).getReader()
      const decoder = new TextDecoder()
      let buffer = ""
      const deliver = async (block: string) => {
        const event = parseRunEventBlock(block)
        if (!event || event.runId !== params.runId || !Number.isSafeInteger(event.sequence) || event.sequence <= lastSequence) return false
        applying = true
        await params.onEvent(event)
        applying = false
        lastSequence = event.sequence
        failures = 0
        return isTerminalRun(event)
      }
      while (!params.signal.aborted) {
        const chunk = await reader.read()
        buffer = `${buffer}${decoder.decode(chunk.value, { stream: !chunk.done })}`.replace(/\r\n/g, "\n")
        let boundary = buffer.indexOf("\n\n")
        while (boundary >= 0) {
          const block = buffer.slice(0, boundary)
          buffer = buffer.slice(boundary + 2)
          if (await deliver(block)) return
          boundary = buffer.indexOf("\n\n")
        }
        if (chunk.done) {
          if (await deliver(buffer.trim())) return
          break
        }
      }
    } catch (reason) {
      if (params.signal.aborted) return
      if (applying || !isConnectionError(reason)) throw reason
    } finally {
      await reader?.cancel().catch(() => undefined)
      reader?.releaseLock()
    }
    if (!params.signal.aborted) {
      await (params.wait ?? connectionDelay)(Math.min(1000 * 2 ** Math.min(failures++, 4), 15000), params.signal)
    }
  }
}
