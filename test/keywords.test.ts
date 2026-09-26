import { describe, expect, it } from 'vitest'
import { isKeyword, KEYWORDS } from '../src/keywords'

describe('keywords — section comments are not keywords', () => {
  it('prose from the `//` headings never reaches the set', () => {
    // NB: `go`, `chan`, `select` and `func` are real Go keywords and belong in
    // the set — they are deliberately absent from this list.
    for (const w of [
      'c',
      'rust',
      'ruby',
      'php',
      'swift',
      'kotlin',
      'shell',
      'sql',
      'java',
      'python',
      'typescript',
      'ecmascript',
      'shared',
      'legacy',
      'blocks',
      'generic',
      'control',
      'words',
      'subset',
    ]) {
      expect(isKeyword(w), `${w} should not be a keyword`).toBe(false)
    }
  })

  it('real keywords from every section survive', () => {
    for (const w of ['const', 'def', 'chan', 'fn', 'func', 'select', 'val', 'then']) {
      expect(isKeyword(w), `${w} should be a keyword`).toBe(true)
    }
  })

  it('no entry contains a comment marker or stray punctuation', () => {
    for (const w of KEYWORDS) {
      expect(w).toMatch(/^[A-Z_]\w*$/i)
    }
  })

  it('table stays plausible in size', () => {
    expect(KEYWORDS.size).toBeGreaterThan(300)
  })
})
