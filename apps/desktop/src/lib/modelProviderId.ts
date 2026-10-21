let sequence = 0

/** Settings record identifiers are labels, not authentication credentials. */
export function createModelProviderId(): string {
  sequence += 1
  return `provider-${Date.now().toString(36)}-${sequence.toString(36)}-${Math.random().toString(36).slice(2, 12)}`
}
