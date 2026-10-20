import assert from "node:assert/strict"
import test from "node:test"
import { cn } from "../src/lib/utils.ts"

test("component overrides keep independent Tailwind 4 size, spacing and theme classes", () => {
  assert.equal(cn("size-4 px-2 py-1", "size-6 px-3"), "py-1 size-6 px-3")
  assert.equal(cn("rounded-md bg-primary text-primary-foreground", "rounded-lg bg-muted"),
    "text-primary-foreground rounded-lg bg-muted")
  assert.equal(cn("outline-hidden focus:ring-1", "focus:ring-2"), "outline-hidden focus:ring-2")
})
