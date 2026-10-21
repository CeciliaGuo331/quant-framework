import assert from "node:assert/strict"
import test from "node:test"
import { createModelProviderId } from "../src/lib/modelProviderId.ts"

test("provider IDs work without browser crypto and stay distinct within one clock tick", context => {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, "crypto")
  Object.defineProperty(globalThis, "crypto", { configurable: true, value: undefined })
  context.mock.method(Date, "now", () => 1700000000000)
  context.mock.method(Math, "random", () => 0.5)
  try {
    const ids = Array.from({ length: 100 }, createModelProviderId)
    assert.equal(new Set(ids).size, ids.length)
    for (const id of ids) {
      assert.match(id, /^[a-z0-9][a-z0-9_-]{0,63}$/)
    }
  } finally {
    if (descriptor) Object.defineProperty(globalThis, "crypto", descriptor)
    else Reflect.deleteProperty(globalThis, "crypto")
  }
})
