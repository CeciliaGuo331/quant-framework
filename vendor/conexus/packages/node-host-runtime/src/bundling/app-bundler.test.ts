import assert from 'node:assert/strict'
import { cpSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { rm } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import test from 'node:test'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { buildTailwindCss, createAppBundler } from './app-bundler.js'

const require = createRequire(import.meta.url)

test('bundles a React App and its generated utility CSS for a browser iframe', async () => {
  const temporary = mkdtempSync(join(tmpdir(), 'conexus-app-bundler-test-'))
  try {
    const bundler = createAppBundler({
      dependencyRoot: join(temporary, 'dependencies'),
      packageRoots: [
        resolve(dirname(fileURLToPath(import.meta.url)), '../..'),
        resolve(dirname(fileURLToPath(import.meta.url)), '../../../..')
      ]
    })
    const result = await bundler.bundle({
      code: `
import React from 'react'
export default function App({ props }) {
  return <main className="p-4 text-blue-500">Hello {props.name}</main>
}`
    })

    assert.equal(result.ok, true, result.error)
    assert.match(result.js ?? '', /Hello/)
    assert.match(result.css ?? '', /padding: calc\(var\(--spacing\) \* 4\)/)
  } finally {
    rmSync(temporary, { recursive: true, force: true })
  }
})

test('bundles Apps using only the external compiler and React packages beside an archive', async () => {
  const temporary = mkdtempSync(join(tmpdir(), 'conexus-packaged-app-test-'))
  const packageRoot = join(temporary, 'resources', 'app-runtime')
  const esbuildModulePath = join(packageRoot, 'node_modules', 'esbuild', 'lib', 'main.js')
  let compiler: typeof import('esbuild') | undefined
  try {
    for (const name of ['esbuild', `@esbuild/${process.platform}-${process.arch}`, 'react', 'react-dom', 'scheduler']) {
      cpSync(dirname(require.resolve(`${name}/package.json`)), join(packageRoot, 'node_modules', name), {
        recursive: true
      })
    }
    // Native processes cannot treat an ASAR file as a directory.
    writeFileSync(join(temporary, 'resources', 'app.asar'), '')
    compiler = await import(pathToFileURL(esbuildModulePath).href) as typeof import('esbuild')
    const bundler = createAppBundler({
      dependencyRoot: join(temporary, 'dependencies'),
      packageRoots: [packageRoot],
      esbuildModulePath
    })
    for (let attempt = 0; attempt < 2; attempt++) {
      const result = await bundler.bundle({
        code: 'export default function App() { return <main className="p-4">Getting Started</main> }'
      })
      assert.equal(result.ok, true, result.error)
      assert.match(result.js ?? '', /Getting Started/)
      assert.match(result.css ?? '', /padding: calc\(var\(--spacing\) \* 4\)/)
      assert.deepEqual(result.installed, [])
    }
  } finally {
    await compiler?.stop()
    await rm(temporary, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 })
  }
})

test('embedded App CSS preserves utilities, surface colors and integer opacity without preflight', async () => {
  const css = await buildTailwindCss('<div className="flex bg-surface-1 opacity-37 p-4 hover:bg-surface-3" />')
  assert.match(css, /\.flex\s*\{/)
  assert.match(css, /--color-surface-1:\s*#0f0f17/)
  assert.match(css, /\.bg-surface-1\s*\{/)
  assert.match(css, /\.opacity-37\s*\{/)
  assert.match(css, /opacity:\s*(?:37%|0\.37)/)
  assert.match(css, /\.p-4\s*\{/)
  assert.doesNotMatch(css, /box-sizing:\s*border-box/)
})

test('embedded App scans only its own source and does not retain another App candidates', async () => {
  const first = await buildTailwindCss('<div className="grid-cols-7" />')
  assert.match(first, /\.grid-cols-7\s*\{/)
  const second = await buildTailwindCss('<div className="flex" />')
  assert.match(second, /\.flex\s*\{/)
  assert.doesNotMatch(second, /\.grid-cols-7\s*\{/)
})
