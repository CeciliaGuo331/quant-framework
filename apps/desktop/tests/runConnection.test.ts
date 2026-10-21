import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { ConexusClientError, readWithRecovery, resumeRunEvents, submitRunOnce } from "../src/lib/conexus/runConnection.ts"
import type { AgentSessionSnapshot } from "../src/lib/conexus/types.ts"

const encode = new TextEncoder()
function block(sequence: number, status = "running", runId = "run-1") {
  return `id: ${sequence}\ndata: ${JSON.stringify({ sequence, runId, status, type: `run.${status}`, at: "now" })}\n\n`
}
function stream(text: string, broken = false) {
  let delivered = false
  return new ReadableStream<Uint8Array>({ pull(controller) {
    if (!delivered) { delivered = true; controller.enqueue(encode.encode(text)) }
    else if (broken) controller.error(new TypeError("Failed to fetch"))
    else controller.close()
  } })
}
const wait = async () => undefined

describe("Agent connection recovery", () => {
  it("resumes after a mid-stream failure, skips replays and stops on completion", async () => {
    const seen: number[] = [], cursors: number[] = []
    await resumeRunEvents({ runId: "run-1", signal: new AbortController().signal, wait,
      open: async (cursor) => {
        cursors.push(cursor)
        return cursors.length === 1 ? stream(block(1), true)
          : stream(block(1) + block(99, "running", "other-run") + block(2, "completed"))
      }, onEvent: event => { seen.push(event.sequence) },
    })
    assert.deepEqual(cursors, [0, 1])
    assert.deepEqual(seen, [1, 2])
  })
  it("reconnects a clean but premature close and a failed initial fetch", async () => {
    let opens = 0
    await resumeRunEvents({ runId: "run-1", signal: new AbortController().signal, wait,
      open: async () => {
        opens += 1
        if (opens === 1) throw new TypeError("Failed to fetch")
        return stream(opens === 2 ? ": heartbeat\n\n" : block(1, "completed"))
      }, onEvent: () => undefined,
    })
    assert.equal(opens, 3)
  })
  it("does not retry authentication errors or event application errors", async () => {
    let opens = 0
    await assert.rejects(resumeRunEvents({ runId: "run-1", signal: new AbortController().signal, wait,
      open: async () => { opens += 1; throw new ConexusClientError("Sign in", 401) }, onEvent: () => undefined,
    }), /Sign in/)
    assert.equal(opens, 1)
    await assert.rejects(resumeRunEvents({ runId: "run-1", signal: new AbortController().signal, wait,
      open: async () => stream(block(1)), onEvent: () => { throw new TypeError("application error") },
    }), /application error/)
  })
  it("stops reconnecting when the panel is closed", async () => {
    const controller = new AbortController()
    let opens = 0
    await resumeRunEvents({ runId: "run-1", signal: controller.signal,
      open: async () => { opens += 1; return stream(": heartbeat\n\n") },
      wait: async () => { controller.abort() }, onEvent: () => undefined,
    })
    assert.equal(opens, 1)
  })
  it("retries reads with a bound and preserves permanent errors", async () => {
    let attempts = 0
    assert.equal(await readWithRecovery(async () => {
      if (++attempts < 3) throw new TypeError("Failed to fetch")
      return "recovered"
    }, undefined, wait), "recovered")
    assert.equal(attempts, 3)
    attempts = 0
    await assert.rejects(readWithRecovery(async () => { attempts += 1; throw new TypeError("offline") }, undefined, wait), /offline/)
    assert.equal(attempts, 3)
  })
  it("recovers an accepted submission without repeating the billed POST", async () => {
    const session: AgentSessionSnapshot = {
      conversations: [{ id: "chat", title: "check", createdAt: "now", updatedAt: "now", messages: [
        { id: "message", role: "user", content: "check", createdAt: "now", runId: "run-1" },
      ] }], runs: [{ conversationId: "chat", run: { id: "run-1", slug: "agent", version: 1, status: "running", createdAt: "now" } }],
    }
    let posts = 0
    const create = async (): Promise<never> => { posts += 1; throw new TypeError("Failed to fetch") }
    const result = await submitRunOnce(create, async () => session, { id: "chat", messageId: "message" })
    assert.equal(result.run.id, "run-1")
    assert.equal(posts, 1)
    await assert.rejects(submitRunOnce(create, async () => session, { id: "chat", messageId: "not-accepted" }), /Failed to fetch/)
    assert.equal(posts, 2)
  })
})
