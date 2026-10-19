import assert from 'node:assert/strict'
import { test } from 'node:test'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { configuredCompletion } from '../integrations/conexus/model-providers.mjs'

test('new runs use a saved provider while an active run keeps its captured model and key', async () => {
  const root = await mkdtemp(join(tmpdir(), 'alphalab-provider-'))
  const path = join(root, 'settings.json')
  const calls = []
  const complete = configuredCompletion(path, profile => async request => {
    calls.push({ profile, model: request.model }); return { content: 'OK' }
  }, {})
  const save = model => writeFile(path, JSON.stringify({ active_id: 'one', profiles: [
    { id: 'one', base_url: 'https://model.example/v1', model, api_key: model + '-key' },
  ] }))
  try {
    const first = new AbortController().signal
    await save('first')
    await complete({ model: 'alias', signal: first })
    await save('second')
    await complete({ model: 'alias', signal: first })
    await complete({ model: 'alias', signal: new AbortController().signal })
    assert.deepEqual(calls.map(row => row.model), ['first', 'first', 'second'])
    assert.deepEqual(calls.map(row => row.profile.apiKey), ['first-key', 'first-key', 'second-key'])
  } finally { await rm(root, { recursive: true, force: true }) }
})

test('provider tools retain conditional optional fields without implicit strict conversion', async () => {
  let actual
  const complete = configuredCompletion('/nonexistent/alphalab-provider.json', () => async request => {
    actual = request
    return { content: 'OK' }
  }, { CONEXUS_MODEL_BASE_URL: 'http://localhost:9999/v1', CONEXUS_MODEL_ID: 'test' })
  const tools = [
    { type: 'function', function: { name: 'complete', parameters: {
      type: 'object', properties: { status: { type: 'string' }, summary: { type: 'string' }, blocker: { type: 'string' } },
      required: ['status', 'summary'], additionalProperties: false,
    } } },
    { type: 'function', function: { name: 'explicit_strict', strict: true, parameters: { type: 'object' } } },
  ]
  await complete({ model: 'alias', signal: new AbortController().signal, tools })
  assert.equal(actual.tools[0].function.strict, false)
  assert.deepEqual(actual.tools[0].function.parameters.required, ['status', 'summary'])
  assert.equal(actual.tools[1].function.strict, true)
  assert.equal(tools[0].function.strict, undefined)
  assert.notEqual(actual.tools[0], tools[0])
})
