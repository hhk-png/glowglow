// Regenerates preview/preview.html from preview/samples/* — every sample is
// rendered by glow(code) with NO language argument, proving the engine needs
// no language hint for ts/js/py/go/rs/sql/css/html/jsx alike.
import { readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { glow } from '../dist/index.js'

const root = dirname(fileURLToPath(import.meta.url))
const samplesDir = join(root, 'samples')
const cssDir = join(root, '..', 'css')

const syntax = readFileSync(join(cssDir, 'syntax.css'), 'utf8')
const markers = readFileSync(join(cssDir, 'markers.css'), 'utf8')
const light = readFileSync(join(cssDir, 'light.css'), 'utf8')

const order = ['typescript.ts', 'javascript.js', 'python.py', 'go.go', 'rust.rs', 'sql.sql', 'css.css', 'html.html', 'jsx.jsx']
const files = order.filter(f => readdirSync(samplesDir).includes(f))
if (files.length !== order.length) throw new Error(`missing a sample file: ${order.join(', ')}`)

function esc(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

// language *is* allowed as output metadata: <code language="…"> for css scope
const blocks = files
  .map(f => {
    const lang = f.slice(f.lastIndexOf('.') + 1)
    const code = readFileSync(join(samplesDir, f), 'utf8')
    const dark = glow(code, { language: lang, numbered: true })
    const lightHtml = glow(code, { language: lang })
    return { f, lang, dark, lightHtml }
  })
  .map(({ f, lang, dark, lightHtml }) => `
  <div class="sect">
    <h2>${esc(f)}</h2>
    <pre>${dark}</pre>
    <pre class="is-light">${lightHtml}</pre>
  </div>`)
  .join('\n')

const page = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>glowglow · language-free highlight preview</title>
<style>
  body { margin: 0; padding: 24px; background: #111729; font-family: system-ui, sans-serif; }
  .sect { max-width: 960px; margin: 0 auto 28px; }
  .sect h2 { color: #93a4bf; font-weight: 500; font-size: 14px; letter-spacing: .05em; margin: 0 0 6px; }
  pre { border-radius: 8px; margin: 0 0 14px; }
  pre.is-light {
    background-color: var(--glow-bg-color, #f9f9f9);
    color: var(--glow-base-color, #555);
  }
  pre.is-light b { color: #0068d6; }
  pre.is-light em { color: #bd2864; }
  pre.is-light strong { color: #456aff; }
  pre.is-light i { color: #8e989c; }
  pre.is-light sup { color: #9aa1a3; }
  pre.is-light label { color: #7820bc; }
  pre.is-light span:before { color: #bbb; }
  ${syntax}
  ${markers}
  ${light}
</style>
</head>
<body>
${blocks}
</body>
</html>
`
writeFileSync(join(root, 'preview.html'), page, 'utf8')
console.log(`wrote preview/preview.html (${files.length} samples, language-free)`)

// short excerpt of markup for quick inspection in the terminal
console.log('\n--- rendered markup excerpt (typescript.ts) ---\n')
console.log(glow(['type Primitive = string | number | boolean', 'const conf = { port: 3000 } satisfies Partial<Config>', 'const el = <div data-id={1}>hi</div>']))
