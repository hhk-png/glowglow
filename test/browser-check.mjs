// Drives the built editor in a real browser over the DevTools Protocol, with
// real input events — the things happy-dom cannot honestly stand in for
// (Selection, Range, beforeinput, IME, key handling).
//
//   pnpm build && node test/browser-check.mjs
//
// Uses Node's built-in WebSocket (>=22) and a Chrome/Edge already on the machine.

import { spawn } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { createServer } from 'node:http'
import { extname, join, normalize } from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

const root = join(fileURLToPath(new URL('.', import.meta.url)), '..')
const PORT = 8731
const DEBUG_PORT = 8732

const CHROME_CANDIDATES = [
  process.env.CHROME_PATH,
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
].filter(Boolean)

const PAGE = `<!doctype html><meta charset="utf-8"><title>check</title>
<link rel="stylesheet" href="/css/syntax.css">
<pre id="ed"></pre>
<script type="module">
  import { mountGlowEditor } from '/dist/dom.js'
  const el = document.getElementById('ed')
  window.ed = mountGlowEditor(el, { value: 'const a = 1\\nfoo(a)', numbered: true })
  window.__mut = []
  new MutationObserver(ms => { for (const m of ms) window.__mut.push(m.type + ':' + m.addedNodes.length + '+' + m.removedNodes.length) }).observe(el, { childList: true, subtree: true, characterData: true })
  el.focus()
  let snapshot = Array.from(el.children)

  function pointAt (offset) {
    let rem = offset
    for (const d of el.children) {
      const t = d.textContent
      if (rem <= t.length) {
        const w = document.createTreeWalker(d, 4)
        let n; let last = null
        while ((n = w.nextNode())) {
          if (rem <= n.data.length) return { node: n, offset: rem }
          rem -= n.data.length; last = n
        }
        if (last) return { node: last, offset: last.data.length }
        return { node: d, offset: 0 }
      }
      rem -= t.length + 1
    }
    return null
  }
  function caretColumn (offset) {
    const p = pointAt(offset)
    if (!p) return -1
    let d = p.node
    while (d.parentNode !== el) d = d.parentNode
    const r = document.createRange()
    r.selectNodeContents(d); r.setEnd(p.node, p.offset)
    return r.toString().length
  }

  window.__probe = {
    lines: () => el.children.length,
    html: i => el.children[i].innerHTML,
    text: () => Array.from(el.children).map(d => d.textContent).join('\\n'),
    keptFrom: i => Array.from(el.children).slice(i).every((n, k) => snapshot[i + k] === n),
    snap: () => { snapshot = Array.from(el.children) },
    setSelection (from, to) {
      const a = pointAt(from); const b = pointAt(to)
      const r = document.createRange()
      r.setStart(a.node, a.offset); r.setEnd(b.node, b.offset)
      const s = getSelection(); s.removeAllRanges(); s.addRange(r)
    },
    selected: () => String(getSelection()),
    linesPerRow: () => Array.from(el.children).every(d => d.querySelectorAll('.glow-line').length === (d.className === 'glow-row' ? d.querySelectorAll(':scope > .glow-line').length : 0)),
    oneLineFlagPerRow: () => Array.from(el.children).map(d => d.querySelectorAll('.glow-line').length).join(','),
    foldMarkers: () => Array.from(el.querySelectorAll('.glow-fold[data-line]')).map(m => m.dataset.line).join(','),
    lastRowBody: () => el.lastElementChild ? el.lastElementChild.textContent : '',
    setCaret (offset) {
      const p = pointAt(offset)
      const r = document.createRange()
      r.setStart(p.node, p.offset); r.collapse(true)
      const s = getSelection(); s.removeAllRanges(); s.addRange(r)
    },
    caret: () => {
      const r = getSelection().getRangeAt(0)
      let d = r.startContainer
      while (d.parentNode !== el) d = d.parentNode
      const p = document.createRange()
      p.selectNodeContents(d); p.setEnd(r.startContainer, r.startOffset)
      return p.toString().length
    },
  }
</script>`

const MIME = { '.js': 'text/javascript', '.css': 'text/css', '.html': 'text/html', '.json': 'application/json', '.map': 'application/json' }

function serve() {
  const server = createServer((req, res) => {
    const url = (req.url || '/').split('?')[0]
    if (url === '/' || url === '/check.html') {
      res.writeHead(200, { 'content-type': 'text/html' })
      res.end(PAGE)
      return
    }
    const file = join(root, normalize(url).replace(/^(\.\.[/\\])+/, ''))
    if (!file.startsWith(root) || !existsSync(file) || !extname(file)) {
      res.writeHead(404)
      res.end('nope')
      return
    }
    res.writeHead(200, { 'content-type': MIME[extname(file)] ?? 'application/octet-stream' })
    res.end(readFileSync(file))
  })
  return new Promise(r => server.listen(PORT, '127.0.0.1', () => r(server)))
}

async function launchChrome() {
  const bin = CHROME_CANDIDATES.find(p => existsSync(p))
  if (!bin)
    throw new Error(`no Chrome/Edge found; set CHROME_PATH. Tried:\n${CHROME_CANDIDATES.join('\n')}`)
  const userDir = join(root, 'node_modules/.cache/browser-check')
  const proc = spawn(bin, [
    '--headless=new',
    `--remote-debugging-port=${DEBUG_PORT}`,
    `--user-data-dir=${userDir}`,
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-gpu',
    '--disable-extensions',
    `http://127.0.0.1:${PORT}/check.html`,
  ], { stdio: 'ignore' })
  return proc
}

async function pageTarget() {
  for (let i = 0; i < 100; i++) {
    try {
      const res = await fetch(`http://127.0.0.1:${DEBUG_PORT}/json`)
      const list = await res.json()
      const page = list.find(t => t.type === 'page' && t.webSocketDebuggerUrl)
      if (page)
        return page.webSocketDebuggerUrl
    }
    catch {}
    await new Promise(r => setTimeout(r, 150))
  }
  throw new Error('the browser never exposed a page target')
}

function connect(url) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url)
    let id = 0
    const pending = new Map()
    ws.addEventListener('open', () => resolve({
      send(method, params = {}) {
        const mid = ++id
        return new Promise((res, rej) => {
          pending.set(mid, { res, rej })
          ws.send(JSON.stringify({ id: mid, method, params }))
        })
      },
      close: () => ws.close(),
    }))
    ws.addEventListener('error', reject)
    ws.addEventListener('message', (e) => {
      const msg = JSON.parse(e.data)
      const p = pending.get(msg.id)
      if (!p)
        return
      pending.delete(msg.id)
      if (msg.error)
        p.rej(new Error(`${msg.error.message}`))
      else
        p.res(msg.result)
    })
  })
}

const failures = []
function check(name, ok, detail = '') {
  const line = `${ok ? '  ok  ' : ' FAIL '} ${name}${detail ? ` — ${detail}` : ''}`
  process.stdout.write(`${line}\n`)
  if (!ok)
    failures.push(name)
}

async function main() {
  const server = await serve()
  const chrome = await launchChrome()
  let cdp
  try {
    cdp = await connect(await pageTarget())
    const evaluate = async (expression) => {
      const r = await cdp.send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true })
      if (r.exceptionDetails)
        throw new Error(r.exceptionDetails.exception?.description ?? 'evaluate failed')
      return r.result.value
    }
    // wait for the module to run
    for (let i = 0; i < 60; i++) {
      if (await evaluate('!!window.__probe'))
        break
      await new Promise(r => setTimeout(r, 100))
    }

    check('mounts with one element per line', await evaluate('__probe.lines()') === 2)
    check('renders highlighted markup', (await evaluate('__probe.html(0)')).includes('<strong>const</strong>'))
    check('caret is in the editor', await evaluate('document.activeElement.id') === 'ed')

    // --- a keystroke must touch a couple of nodes, not the whole document ---
    const big = Array.from({ length: 50 }, (_, i) => `const v${i} = ${i}`).join('\n')
    await evaluate(`ed.setValue(${JSON.stringify(big)}); ed.element.focus(); __probe.setCaret(5)`)
    await evaluate('__mut.length = 0')
    await cdp.send('Input.insertText', { text: 'x' })
    const mut = await evaluate('__mut.join(",")') || ''
    const touched = (mut.match(/(\d+)\+(\d+)/g) || []).reduce((n, m) => {
      const [a, b] = m.split('+').map(Number)
      return n + a + b
    }, 0)
    check('typing updates the value', (await evaluate('ed.value')).startsWith('constx v0'), mut)
    check('typing updates the DOM', await evaluate('__probe.text()') === await evaluate('ed.value'))
    check('caret lands after the typed text', await evaluate('__probe.caret()') === 6)
    check('a keystroke touches only its own line', touched <= 2 && await evaluate('__probe.lines()') === 50, `${touched} nodes changed`)

    // --- a real Backspace key ---
    await cdp.send('Input.dispatchKeyEvent', { type: 'rawKeyDown', windowsVirtualKeyCode: 8, key: 'Backspace', code: 'Backspace' })
    await cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', windowsVirtualKeyCode: 8, key: 'Backspace', code: 'Backspace' })
    check('Backspace deletes', (await evaluate('ed.value')).startsWith(`const v0 = 0\n`), await evaluate('ed.value.split("\\n")[0]'))
    check('Backspace keeps the DOM in step', await evaluate('__probe.text()') === await evaluate('ed.value'))
    check('Backspace restores the caret', await evaluate('__probe.caret()') === 5)

    // --- a real Enter key: a line appears ---
    await evaluate('ed.setValue("ab"); ed.element.focus(); __probe.setCaret(1)')
    await cdp.send('Input.dispatchKeyEvent', { type: 'rawKeyDown', windowsVirtualKeyCode: 13, key: 'Enter', code: 'Enter', text: '\r' })
    await cdp.send('Input.dispatchKeyEvent', { type: 'char', text: '\r', key: 'Enter', code: 'Enter' })
    await cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', windowsVirtualKeyCode: 13, key: 'Enter', code: 'Enter' })
    check('Enter inserts a line', await evaluate('ed.value') === 'a\nb', await evaluate('JSON.stringify(ed.value)'))
    check('Enter keeps the DOM in step', await evaluate('__probe.lines()') === 2 && await evaluate('__probe.text()') === 'a\nb')

    // --- each row carries exactly one line-number flag ---
    await evaluate('ed.setValue("a\\nb\\nc"); ed.element.focus()')
    check('one line flag per row (no double numbering)', await evaluate('__probe.oneLineFlagPerRow()') === '1,1,1', await evaluate('__probe.oneLineFlagPerRow()'))

    // --- Ctrl+Backspace deletes a whole word ---
    await evaluate('ed.setValue("const alpha beta"); ed.element.focus(); __probe.setCaret(16)')
    await cdp.send('Input.dispatchKeyEvent', { type: 'rawKeyDown', windowsVirtualKeyCode: 8, key: 'Backspace', code: 'Backspace', modifiers: 2 })
    await cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', windowsVirtualKeyCode: 8, key: 'Backspace', code: 'Backspace', modifiers: 2 })
    check('Ctrl+Backspace deletes a word', await evaluate('ed.value') === 'const alpha ', await evaluate('JSON.stringify(ed.value)'))

    // --- Backspace over a selection deletes it ---
    await evaluate('ed.setValue("keep DELETE keep"); ed.element.focus(); __probe.setSelection(5, 12)')
    await cdp.send('Input.dispatchKeyEvent', { type: 'rawKeyDown', windowsVirtualKeyCode: 8, key: 'Backspace', code: 'Backspace' })
    await cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', windowsVirtualKeyCode: 8, key: 'Backspace', code: 'Backspace' })
    check('Backspace removes the selection', await evaluate('ed.value') === 'keep keep', await evaluate('JSON.stringify(ed.value)'))
    check('selection delete keeps the DOM in step', await evaluate('__probe.text()') === await evaluate('ed.value'))

    // --- typing over a selection replaces it ---
    await evaluate('ed.setValue("say hello now"); ed.element.focus(); __probe.setSelection(4, 9)')
    await cdp.send('Input.insertText', { text: 'bye' })
    check('typing replaces the selection', await evaluate('ed.value') === 'say bye now', await evaluate('JSON.stringify(ed.value)'))

    // --- undo / redo ---
    await evaluate('ed.setValue("one two"); ed.element.focus(); __probe.setCaret(7)')
    await cdp.send('Input.insertText', { text: 'X' })
    check('edit applied before undo', await evaluate('ed.value') === 'one twoX')
    await cdp.send('Input.dispatchKeyEvent', { type: 'rawKeyDown', windowsVirtualKeyCode: 90, key: 'z', code: 'KeyZ', modifiers: 2 })
    await cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', windowsVirtualKeyCode: 90, key: 'z', code: 'KeyZ', modifiers: 2 })
    check('Ctrl+Z undoes', await evaluate('ed.value') === 'one two', await evaluate('JSON.stringify(ed.value)'))
    await cdp.send('Input.dispatchKeyEvent', { type: 'rawKeyDown', windowsVirtualKeyCode: 90, key: 'z', code: 'KeyZ', modifiers: 10 })
    await cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', windowsVirtualKeyCode: 90, key: 'z', code: 'KeyZ', modifiers: 10 })
    check('Ctrl+Shift+Z redoes', await evaluate('ed.value') === 'one twoX', await evaluate('JSON.stringify(ed.value)'))
    check('undo keeps the DOM in step', await evaluate('__probe.text()') === await evaluate('ed.value'))

    // --- Tab indents, Shift+Tab outdents ---
    await evaluate('ed.setValue("aa\\nbb"); ed.element.focus(); __probe.setSelection(0, 5)')
    await cdp.send('Input.dispatchKeyEvent', { type: 'rawKeyDown', windowsVirtualKeyCode: 9, key: 'Tab', code: 'Tab' })
    check('Tab indents every line of the selection', await evaluate('ed.value') === '  aa\n  bb', await evaluate('JSON.stringify(ed.value)'))
    await evaluate('__probe.setSelection(0, 7)')
    await cdp.send('Input.dispatchKeyEvent', { type: 'rawKeyDown', windowsVirtualKeyCode: 9, key: 'Tab', code: 'Tab', modifiers: 8 })
    check('Shift+Tab outdents', await evaluate('ed.value') === 'aa\nbb', await evaluate('JSON.stringify(ed.value)'))

    // --- folding: collapsed lines leave the DOM, the document keeps them ---
    await evaluate(`ed.setValue(${JSON.stringify('a\nb\nc\nd\ne')}); ed.element.focus()`)
    const beforeFold = await evaluate('ed.value')
    await evaluate('ed.setFolds([{ from: 1, to: 3 }])')
    // 5 lines, 2 of them (b, c) folded away -> 3 rows drawn
    check('folding removes rows from the DOM', await evaluate('__probe.lines()') === 3, await evaluate('__probe.lines()'))
    check('folding leaves the text alone', await evaluate('ed.value') === beforeFold, await evaluate('JSON.stringify(ed.value)'))
    check('the collapsed row carries a marker', await evaluate('__probe.foldMarkers()') === '1', await evaluate('__probe.foldMarkers()'))
    check('the row after the fold is drawn', await evaluate('__probe.lastRowBody()') === 'e', await evaluate('JSON.stringify(__probe.lastRowBody())'))

    // typing in the first line while a block below it is folded
    await evaluate('__probe.setCaret(1)')
    await cdp.send('Input.insertText', { text: 'X' })
    check('typing above a fold still edits the document', await evaluate('ed.value') === `aX${beforeFold.slice(1)}`, await evaluate('JSON.stringify(ed.value)'))
    check('the fold survives that edit', await evaluate('__probe.lines()') === 3, await evaluate('__probe.lines()'))

    // an edit that moves lines around keeps the fold on its own text
    await evaluate('ed.setFolds([])')
    check('unfolding brings every row back', await evaluate('__probe.lines()') === 5, await evaluate('__probe.lines()'))

    // --- typing inside a multi-line comment keeps the whole comment coloured ---
    await evaluate('ed.setValue("/* a\\nb */\\nconst z = 1"); ed.element.focus()')
    await cdp.send('Input.insertText', { text: 'Z' })
    check('comment stays coloured across an edit', (await evaluate('__probe.html(0)')).includes('<sup>'))
    check('comment edit keeps the DOM in step', await evaluate('__probe.text()') === await evaluate('ed.value'))
  }
  finally {
    cdp?.close()
    chrome.kill()
    server.close()
  }

  process.stdout.write(failures.length ? `\n${failures.length} failed\n` : '\nbrowser check passed\n')
  process.exit(failures.length ? 1 : 0)
}

main().catch((e) => {
  process.stdout.write(`\nbrowser check could not run: ${e.message}\n`)
  process.exit(2)
})
