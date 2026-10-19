import assert from 'node:assert/strict'
import { test } from 'node:test'
import { configuredWebSearch } from '../integrations/conexus/web-search.mjs'

const path = '/nonexistent/alphalab-search-provider.json'
const profileEnv = { ALPHALAB_WEB_SEARCH_PROVIDER: 'openrouter', CONEXUS_MODEL_BASE_URL: 'https://openrouter.ai/api/v1', CONEXUS_MODEL_ID: 'test-model', CONEXUS_MODEL_API_KEY: 'fixture-model-key' }
const request = input => ({ input, signal: new AbortController().signal })
const reply = data => new Response(JSON.stringify(data), { headers: { 'Content-Type': 'application/json' } })

test('missing search setup is non-retryable and makes no network request', async () => {
  const search = configuredWebSearch(path, { env: {}, fetchImpl: () => { throw new Error('Unexpected request') } })
  const { result } = await search(request({ query: 'query' }))
  assert.equal(result.code, 'search_not_configured')
  assert.equal(result.retryable, false)
})

test('OpenRouter search uses the active private profile and bounds searches and results', async () => {
  let body
  const search = configuredWebSearch(path, { env: profileEnv, fetchImpl: async (url, options) => {
    assert.equal(url, 'https://openrouter.ai/api/v1/chat/completions')
    assert.equal(options.headers.Authorization, 'Bearer fixture-model-key')
    body = JSON.parse(options.body)
    return reply({ usage: { server_tool_use: { web_search_requests: 1 } }, choices: [{ message: { annotations: [
      { type: 'url_citation', url_citation: { url: 'https://example.com/paper', title: 'Paper', content: 'Source excerpt' } },
      { type: 'url_citation', url_citation: { url: 'https://example.com/paper', title: 'Duplicate' } },
      { type: 'url_citation', url_citation: { url: 'javascript:bad', title: 'Reject' } },
    ] } }] })
  } })
  const { result } = await search(request({ query: 'original query', count: 999 }))
  assert.equal(result.success, true)
  assert.equal(result.provider, 'openrouter')
  assert.deepEqual(result.results, [{ url: 'https://example.com/paper', title: 'Paper', snippet: 'Source excerpt' }])
  assert.equal(JSON.stringify(result).includes('fixture-model-key'), false)
  assert.equal(body.model, 'test-model')
  assert.equal(body.max_tool_calls, 1)
  assert.equal(body.tools[0].parameters.max_uses, 1)
  assert.equal(body.tools[0].parameters.max_results, 10)
  assert.equal(body.tools[0].parameters.max_total_results, 10)
  assert.equal(body.messages[1].content, 'original query')
  assert.equal(body.messages.length, 2)
})

test('OpenRouter search refuses another endpoint without transmitting its key', async () => {
  const search = configuredWebSearch(path, { env: { ...profileEnv, CONEXUS_MODEL_BASE_URL: 'https://another.example/v1' }, fetchImpl: () => { throw new Error('Unexpected request') } })
  assert.equal((await search(request({ query: 'query' }))).result.code, 'search_not_configured')
})

test('search does not return provider error bodies or credentials', async () => {
  const search = configuredWebSearch(path, { env: profileEnv, fetchImpl: async () => new Response('sensitive provider body', { status: 401 }) })
  const { result } = await search(request({ query: 'query' }))
  assert.equal(result.success, false)
  assert.equal(result.retryable, false)
  assert.match(result.error, /HTTP 401/)
  assert.equal(JSON.stringify(result).includes('sensitive provider body'), false)
})

test('answers without search citations or with zero executed searches are not search evidence', async () => {
  for (const payload of [{ choices: [{ message: { content: 'Unverified answer' } }] }, { usage: { server_tool_use: { web_search_requests: 0 } }, choices: [] }]) {
    const search = configuredWebSearch(path, { env: profileEnv, fetchImpl: async () => reply(payload) })
    assert.equal((await search(request({ query: 'query' }))).result.code, 'search_no_sources')
  }
})

test('Brave configuration remains supported independently of model selection', async () => {
  const search = configuredWebSearch(path, { env: { BRAVE_SEARCH_API_KEY: 'fixture-brave-key' }, fetchImpl: async (url, options) => {
    assert.equal(url.hostname, 'api.search.brave.com')
    assert.equal(url.searchParams.get('q'), 'query')
    assert.equal(url.searchParams.get('freshness'), 'pw')
    assert.equal(options.headers['X-Subscription-Token'], 'fixture-brave-key')
    return reply({ web: { results: [{ title: 'Source', url: 'https://example.com', description: 'Excerpt' }] } })
  } })
  assert.deepEqual((await search(request({ query: 'query', freshness: 'pw' }))).result.results, [{ title: 'Source', url: 'https://example.com', snippet: 'Excerpt' }])
})

test('oversized queries are rejected before model or search traffic', async () => {
  const search = configuredWebSearch(path, { env: profileEnv, fetchImpl: () => { throw new Error('Unexpected request') } })
  assert.equal((await search(request({ query: 'a'.repeat(2001) }))).result.code, 'invalid_query')
})
