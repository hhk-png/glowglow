// Verifies the built package on Node versions the development toolchain cannot
// run: pnpm 11 needs Node >= 22.13 and Vitest 5 needs Node >= 22.12. The full
// suite runs on 22/24; this checks the engines claim (Node >= 18) against dist/
// without installing any development dependencies.

import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import process from 'node:process'
import {
  buildFoldMap,
  classifyTokenWindow,
  countTagNames,
  findTagCandidates,
  lex,
  lexSegment,
  tokenText,
} from '../dist/incremental.js'
import { glow, glowDocument, glowInner, glowSource } from '../dist/index.js'

const require = createRequire(import.meta.url)

// --- one-shot rendering ------------------------------------------------------
const html = glow('const a = 1')
assert.match(html, /^<code>/)
assert.match(html, /<strong>const<\/strong>/)
assert.doesNotMatch(glowInner('x'), /<code>/)

const mapped = glowSource('a\r\nb')
assert.equal(mapped.text, 'a\nb')
assert.equal(mapped.offset(3), 2)

// --- incremental document ----------------------------------------------------
const doc = glowDocument('const a = 1')
const patch = doc.applyEdit(6, 7, 'b')
assert.equal(doc.value, 'const b = 1')
assert.ok(patch.lines.length > 0)
assert.match(doc.lineHtml(0), /<strong>const<\/strong>/)

// --- the low-level entry -----------------------------------------------------
const src = 'const a = 1'
const toks = lex(src)
assert.equal(toks.map(token => tokenText(src, token)).join(''), src)

const counts = countTagNames(findTagCandidates(src, toks))
assert.equal(classifyTokenWindow(src, toks, counts, false, false)[0].tag, 'strong')

const head = lexSegment(src, 0, 6, [])
const tail = lexSegment(src, 6, src.length, head.state)
assert.equal([...head.tokens, ...tail.tokens].map(token => tokenText(src, token)).join(''), src)

const map = buildFoldMap([{ from: 1, to: 3 }], 5)
assert.equal(map.visibleCount, 3)
assert.equal(map.lineIndexAt(2), 4)

// --- CommonJS entry ----------------------------------------------------------
const cjs = require('../dist/index.cjs')

assert.equal(typeof cjs.glow, 'function')
assert.match(cjs.glow('let x = 1'), /<code>/)

process.stdout.write('runtime smoke ok\n')
