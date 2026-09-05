// Regenerates preview/preview.html from preview/samples/*.
//
// Every sample is rendered by glow(code) with NO language argument — the page
// proves the engine is language-free across TS/JS/Python/Go/Rust/SQL/CSS/HTML/
// JSX/C/Java/C#/Kotlin/Swift/Ruby/PHP/Bash/Perl/Lua/Haskell/YAML/TOML/JSON.
// A theme picker switches between ready-made palettes, all built from the same
// CSS variables that css/*.css already expose.
import { readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { glow } from '../dist/index.js'

const root = dirname(fileURLToPath(import.meta.url))
const samplesDir = join(root, 'samples')
const cssDir = join(root, '..', 'css')

const syntax = readFileSync(join(cssDir, 'syntax.css'), 'utf8')
const markers = readFileSync(join(cssDir, 'markers.css'), 'utf8')

const order = [
  'typescript.ts', 'javascript.js', 'jsx.jsx', 'python.py', 'go.go', 'rust.rs',
  'c.c', 'cpp.cpp', 'csharp.cs', 'java.java', 'kotlin.kt', 'swift.swift',
  'ruby.rb', 'php.php', 'bash.sh', 'perl.pl', 'lua.lua', 'haskell.hs',
  'sql.sql', 'css.css', 'html.html', 'yaml.yaml', 'toml.toml', 'json.json',
]
const files = order.filter(f => readdirSync(samplesDir).includes(f))
if (files.length !== order.length) throw new Error(`missing sample: ${order.join(', ')}`)

function esc(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

// ---- theme palettes (CSS variables consumed by css/syntax.css) --------------
const THEMES = [
  {
    id: 'github-dark', label: 'GitHub Dark', page: '#0d1117',
    vars: { bg: '#0d1117', base: '#c9d1d9', primary: '#79c0ff', secondary: '#a5d6ff', accent: '#ff7b72', special: '#d2a8ff', char: '#6e7681', comment: '#8b949e', counter: '#484f58', marked: 'rgba(56,139,253,.4)' },
  },
  {
    id: 'github-light', label: 'GitHub Light', page: '#f6f8fa',
    vars: { bg: '#ffffff', base: '#1f2328', primary: '#0969da', secondary: '#0a3069', accent: '#cf222e', special: '#8250df', char: '#59636e', comment: '#59636e', counter: '#59636e', marked: 'rgba(84,174,255,.4)' },
  },
  {
    id: 'nord-dark', label: 'Nord', page: '#242933',
    vars: { bg: '#2e3440', base: '#d8dee9', primary: '#88c0d0', secondary: '#a3be8c', accent: '#81a1c1', special: '#ebcb8b', char: '#616e88', comment: '#4c566a', counter: '#4c566a', marked: 'rgba(136,192,208,.35)' },
  },
  {
    id: 'solarized-dark', label: 'Solarized Dark', page: '#00212b',
    vars: { bg: '#002b36', base: '#839496', primary: '#268bd2', secondary: '#2aa198', accent: '#859900', special: '#b58900', char: '#586e75', comment: '#586e75', counter: '#073642', marked: 'rgba(42,161,152,.3)' },
  },
  {
    id: 'solarized-light', label: 'Solarized Light', page: '#eee8d5',
    vars: { bg: '#fdf6e3', base: '#586e75', primary: '#268bd2', secondary: '#2aa198', accent: '#859900', special: '#b58900', char: '#93a1a1', comment: '#93a1a1', counter: '#93a1a1', marked: 'rgba(181,137,0,.25)' },
  },
  {
    id: 'one-dark', label: 'One Dark', page: '#21252b',
    vars: { bg: '#282c34', base: '#abb2bf', primary: '#61afef', secondary: '#98c379', accent: '#c678dd', special: '#e5c07b', char: '#5c6370', comment: '#5c6370', counter: '#4b5263', marked: 'rgba(97,175,239,.3)' },
  },
  {
    id: 'one-light', label: 'One Light', page: '#f0f0f1',
    vars: { bg: '#fafafa', base: '#383a42', primary: '#4078f2', secondary: '#50a14f', accent: '#a626a4', special: '#c18401', char: '#a0a1a7', comment: '#a0a1a7', counter: '#a0a1a7', marked: 'rgba(64,120,242,.2)' },
  },
  {
    id: 'monokai', label: 'Monokai', page: '#1e1e1e',
    vars: { bg: '#272822', base: '#f8f8f2', primary: '#66d9ef', secondary: '#e6db74', accent: '#f92672', special: '#ae81ff', char: '#90908a', comment: '#75715e', counter: '#575b61', marked: 'rgba(174,129,255,.3)' },
  },
]

function themeCss() {
  const blocks = THEMES.map(t => {
    const v = t.vars
    const names = [
      ['--glow-bg-color', v.bg], ['--glow-base-color', v.base],
      ['--glow-primary-color', v.primary], ['--glow-secondary-color', v.secondary],
      ['--glow-accent-color', v.accent], ['--glow-special-color', v.special],
      ['--glow-char-color', v.char], ['--glow-comment-color', v.comment],
      ['--glow-counter-color', v.counter], ['--glow-marked-color', v.marked],
    ]
    const decls = names.map(([k, val]) => `  ${k}: ${val};`).join('\n')
    return `[data-theme="${t.id}"]{\n${decls}\n  --glow-page: ${t.page};\n}`
  })
  return blocks.join('\n')
}

function themeOptions() {
  return THEMES.map(t => `<option value="${t.id}">${t.label}</option>`).join('\n')
}

// ---- render every sample once, language-free --------------------------------
const sections = files
  .map(f => {
    const code = readFileSync(join(samplesDir, f), 'utf8')
    const html = glow(code, { numbered: true })
    return `<section class="sect">
  <h2><span class="file">${esc(f)}</span><span class="tag">no language arg</span></h2>
  <pre>${html}</pre>
</section>`
  })
  .join('\n')

const page = `<!doctype html>
<html lang="en" data-theme="github-dark">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>glowglow · language-free highlight preview</title>
<style>
  :root { color-scheme: light dark; }
  body {
    margin: 0; padding: 28px 20px 80px; min-height: 100vh;
    background: var(--glow-page, #0b0f1a); color: var(--glow-base-color);
    font-family: system-ui, -apple-system, "Segoe UI", sans-serif;
    transition: background-color .2s ease;
  }
  .toolbar {
    max-width: 1000px; margin: 0 auto 22px;
    display: flex; flex-wrap: wrap; align-items: center; gap: 10px;
  }
  .toolbar .logo { font-weight: 700; font-size: 18px; margin-right: auto; letter-spacing: .02em; }
  .toolbar .logo b { color: var(--glow-accent-color); }
  .toolbar label { font-size: 12px; opacity: .75; }
  .toolbar select {
    font: inherit; padding: 6px 10px; border-radius: 8px;
    border: 1px solid color-mix(in srgb, var(--glow-base-color) 30%, transparent);
    background: var(--glow-bg-color); color: var(--glow-base-color);
  }
  .sect { max-width: 1000px; margin: 0 auto 30px; }
  .sect h2 {
    display: flex; align-items: center; gap: 10px;
    font-size: 13px; font-weight: 600; margin: 0 0 8px; opacity: .9;
  }
  .sect .file { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; }
  .sect .tag {
    font-size: 10px; font-weight: 500; letter-spacing: .06em; text-transform: uppercase;
    padding: 2px 8px; border-radius: 99px; opacity: .55;
    border: 1px solid currentColor;
  }
  pre { border-radius: 12px; box-shadow: 0 10px 30px rgba(0,0,0,.25); margin: 0; }
  pre code { display: block; }
  ${themeCss()}
  ${syntax}
  ${markers}
</style>
</head>
<body>
  <div class="toolbar">
    <span class="logo">glowglow <b>✳</b> language-free preview</span>
    <label for="theme">theme</label>
    <select id="theme">
${themeOptions()}
    </select>
  </div>
${sections}
<script>
  const sel = document.getElementById('theme');
  sel.value = document.documentElement.dataset.theme;
  sel.addEventListener('change', () => {
    document.documentElement.dataset.theme = sel.value;
    try { localStorage.setItem('glowglow-theme', sel.value); } catch (e) {}
  });
  try {
    const saved = localStorage.getItem('glowglow-theme');
    if (saved) { document.documentElement.dataset.theme = saved; sel.value = saved; }
  } catch (e) {}
</script>
</body>
</html>
`
writeFileSync(join(root, 'preview.html'), page, 'utf8')
console.log(`wrote preview/preview.html — ${sections.length > 0 ? files.length : 0} samples × ${THEMES.length} themes (language-free)`)

// ---- structural sanity check: every rendered block is well-formed -----------
for (const f of files) {
  const code = readFileSync(join(samplesDir, f), 'utf8')
  const html = glow(code)
  const stack = []
  const re = /<\/?([a-zA-Z][a-zA-Z0-9]*)((?:\s[^<>]*?)?)(\/?)>/g
  for (const m of html.matchAll(re)) {
    const [, name, , self] = m
    if (self === '/') continue
    if (m[0].startsWith('</')) {
      const last = stack.pop()
      if (last !== name) throw new Error(`${f}: unbalanced </${name}> (expected </${last}>)`)
    } else stack.push(name)
  }
  if (stack.length) throw new Error(`${f}: unclosed tag(s): ${stack.join(', ')}`)
}
console.log('well-formed check passed for all samples')
