// @vitest-environment node
import { mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { build } from 'vite'
import { afterAll, describe, expect, it } from 'vitest'

// Strings that only exist in the browser-demo code (src/demo).
const DEMO_MARKERS = ['kadkerja-browser-demo-v1', 'demo-kadkerja', 'Browser-only demo']
const dirs: string[] = []

async function bundle(mode: string): Promise<string> {
  const outDir = mkdtempSync(join(tmpdir(), `kadkerja-${mode}-`))
  dirs.push(outDir)
  await build({ root: import.meta.dirname, mode, logLevel: 'silent', build: { outDir, emptyOutDir: true } })
  const assets = join(outDir, 'assets')
  return readdirSync(assets)
    .filter((f) => f.endsWith('.js'))
    .map((f) => readFileSync(join(assets, f), 'utf8'))
    .join('\n')
}

afterAll(() => dirs.forEach((d) => rmSync(d, { recursive: true, force: true })))

describe('build targets', () => {
  it('the real build has no demo backend, demo password or demo banner in it', async () => {
    const js = await bundle('production')
    for (const marker of DEMO_MARKERS) expect(js).not.toContain(marker)
  }, 60_000)

  it('the demo build has them (so the check above can fail)', async () => {
    const js = await bundle('demo')
    for (const marker of DEMO_MARKERS) expect(js).toContain(marker)
  }, 60_000)
})
