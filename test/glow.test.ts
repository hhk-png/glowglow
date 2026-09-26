import type { GlowOptions } from '../src/index'
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { glow, glowInner, glowSource } from '../src/index'

/** strip the outer <code…> wrapper so assertions read the inner body */
function body(input: string | readonly string[], opts?: GlowOptions): string {
  return glow(input, opts).replace(/^<code[^>]*>/, '').replace(/<\/code>$/, '')
}

describe('glow', () => {
  it('wraps output in <code>, language is metadata only', () => {
    expect(glow('const a = 1')).toBe('<code><strong>const</strong> <b>a</b> <i>=</i> <em>1</em></code>')
    const lang = glow('x', { language: 'ts' })
    expect(lang.startsWith('<code language="ts">')).toBe(true)
    expect(lang.endsWith('</code>')).toBe(true)
    // the same engine output regardless of language metadata
    expect(body('x', { language: 'ts' })).toBe(body('x', { language: 'ruby' }))
  })

  it('accepts an array of lines', () => {
    expect(glow(['a', 'b'])).toBe('<code><b>a</b>\n<b>b</b></code>')
  })

  it('numbered wraps each line in a classed <span>', () => {
    const html = glow('a\nb', { numbered: true })
    expect(html).toContain('<span class="glow-line"><b>a</b></span>')
    expect(html).toContain('<span class="glow-line"><b>b</b></span>')
  })

  it('normalises CRLF line endings', () => {
    expect(body('const a = 1\r\nconst b = 2')).toBe('<strong>const</strong> <b>a</b> <i>=</i> <em>1</em>\n<strong>const</strong> <b>b</b> <i>=</i> <em>2</em>')
  })

  it('escapes html special characters', () => {
    // <code> tags are recognised as markup; the ampersand and prose stay escaped
    const html = glow('a = "x & y"')
    expect(html).toContain('&amp;')
    expect(html).not.toContain('x & y')
    // no raw & < > remain except the ones that start entities
    expect(html).not.toMatch(/&(?![a-z#0-9]+;)/i)
    expect(html).not.toMatch(/<(?!\/?(?:code|strong|b|em|sup|label|i|span)>)/)
    // a bare run of operators becomes a single escaped token
    expect(glow('&<>')).toBe('<code><i>&amp;&lt;&gt;</i></code>')
  })

  it('language attribute value is escaped', () => {
    expect(glow('a', { language: 'x"y' })).toBe('<code language="x&quot;y"><b>a</b></code>')
  })

  it('empty input renders nothing', () => {
    expect(glow('')).toBe('')
    expect(glow('\n\n')).toBe('')
  })

  it('single-line output never splits one identifier across spans', () => {
    const html = glow('const abcd = efgh')
    expect(html).toContain('<strong>const</strong>')
    expect(html).toContain('<b>abcd</b>')
    expect(html).toContain('<b>efgh</b>')
  })
})

describe('semantic keywords (language-free)', () => {
  it('type-declaration and TS keywords are highlighted whole-word', () => {
    const html = glow('type Foo = keyof T extends string ? never : readonly Foo[]')
    expect(html).toContain('<strong>type</strong>')
    expect(html).toContain('<strong>keyof</strong>')
    expect(html).toContain('<strong>extends</strong>')
    expect(html).toContain('<strong>readonly</strong>')
    expect(html).toContain('<strong>string</strong>')
    expect(html).toContain('<strong>never</strong>')
  })

  it('enum/namespace/modifiers/declare highlight', () => {
    const html = glow('declare enum E {} export namespace N {}')
    expect(html).toContain('<strong>declare</strong>')
    expect(html).toContain('<strong>enum</strong>')
    expect(html).toContain('<strong>export</strong>')
    expect(html).toContain('<strong>namespace</strong>')
  })

  it('keywords across languages highlight the same way', () => {
    const py = glow('def f(): return x and not y')
    expect(py).toContain('<strong>def</strong>')
    expect(py).toContain('<strong>return</strong>')
    expect(py).toContain('<strong>and</strong>')
    expect(py).toContain('<strong>not</strong>')
    const go = glow('package main func main()')
    expect(go).toContain('<strong>package</strong>')
    expect(go).toContain('<strong>func</strong>')
    const rust = glow('fn main() { let mut x = 0u32; }')
    expect(rust).toContain('<strong>fn</strong>')
    expect(rust).toContain('<strong>let</strong>')
    expect(rust).toContain('<strong>mut</strong>')
    expect(rust).toContain('<em>0u32</em>')
  })

  it('property access after a dot is not a keyword (obj.type)', () => {
    const html = glow('obj.type\nstr.match')
    expect(html).toContain('<b>type</b>')
    expect(html).toContain('<b>match</b>')
    expect(html).not.toContain('<strong>type</strong>')
    expect(html).not.toContain('<strong>match</strong>')
  })

  it('case-insensitive keywords but whole word only', () => {
    expect(glow('RETURN return returned')).toBe('<code><strong>RETURN</strong> <strong>return</strong> <b>returned</b></code>')
  })
})

describe('numbers', () => {
  it('bases, separators, decimals, exponents, suffixes all become <em>', () => {
    expect(glow('0xFF 0b101 0o17')).toBe('<code><em>0xFF</em> <em>0b101</em> <em>0o17</em></code>')
    expect(glow('1_000 .5 1e-3 1n 10u32 3.14')).toBe(
      '<code><em>1_000</em> <em>.5</em> <em>1e-3</em> <em>1n</em> <em>10u32</em> <em>3.14</em></code>',
    )
  })

  it('a number after an identifier stays one word apart', () => {
    expect(glow('const x = 42')).toContain('<b>x</b> <i>=</i> <em>42</em>')
  })
})

describe('comments', () => {
  it('hash comment vs css colour vs preprocessor include', () => {
    const html = glow('# note\ncolor: #fff;\n#include <stdio.h>')
    const lines = html.split('\n')
    expect(lines[0]!).toContain('<sup># note</sup>')
    expect(lines[1]!).toContain('<i>#</i><b>fff</b>')
    // #include is not a comment: the include becomes a plain identifier, <stdio.h> non-tag code
    expect(lines[2]!).not.toContain('comment')
  })

  it('shebang is a comment', () => {
    expect(glow('#!/usr/bin/env node')).toBe('<code><sup>#!/usr/bin/env node</sup></code>')
  })

  it('double-slash and block comments', () => {
    expect(glow('a // note')).toBe('<code><b>a</b> <sup>// note</sup></code>')
    expect(glow('/* hi */ a')).toBe('<code><sup>/* hi */</sup> <b>a</b></code>')
  })

  it('html comment is a comment', () => {
    expect(glow('<!-- hi -->\nx')).toBe('<code><sup>&lt;!-- hi --&gt;</sup>\n<b>x</b></code>')
  })

  it('sQL/Lua -- comment only when standalone', () => {
    expect(glow('-- note\nSELECT a')).toBe('<code><sup>-- note</sup>\n<strong>SELECT</strong> <b>a</b></code>')
    expect(glow('x = 1 -- note')).toBe('<code><b>x</b> <i>=</i> <em>1</em> <sup>-- note</sup></code>')
  })

  it('decrement operators are not comments', () => {
    expect(glow('a--')).toBe('<code><b>a</b><i>--</i></code>')
    expect(glow('--x')).toBe('<code><i>--</i><b>x</b></code>')
    expect(glow('x = a-- + --b')).toBe('<code><b>x</b> <i>=</i> <b>a</b><i>--</i> <i>+</i> <i>--</i><b>b</b></code>')
  })

  it('multiline block comment spans lines as one <sup>', () => {
    const html = body('/* one\ntwo */\nx')
    expect(html).toBe('<sup>/* one</sup>\n<sup>two */</sup>\n<b>x</b>')
  })
})

describe('strings & templates', () => {
  it('escaped quote inside a string', () => {
    expect(glow('s = "a\\"b"')).toBe('<code><b>s</b> <i>=</i> <em>"</em><em>a\\"b</em><em>"</em></code>')
  })

  it('url stays inside the string and is escaped, not a comment', () => {
    expect(glow('u = "http://x.com/a?b=1&c=2"')).toBe(
      '<code><b>u</b> <i>=</i> <em>"</em><em>http://x.com/a?b=1&amp;c=2</em><em>"</em></code>',
    )
  })

  it('double-quoted strings do not interpolate ${}', () => {
    expect(glow('x = "${a}"')).toBe('<code><b>x</b> <i>=</i> <em>"</em><em>${a}</em><em>"</em></code>')
  })

  it('backtick template interpolates ${...} with nested templates', () => {
    const html = glow('`a${b ? `x${y}` : c}d`')
    // interpolation braces are <i>, inner code is coloured normally
    expect(html).toContain('<i>${</i>')
    expect(html).toContain('<b>b</b>')
    expect(html).toContain('<b>c</b>')
    expect(html).toContain('<b>y</b>')
    expect(html).not.toContain('<b>a</b>') // literal text is <em>, not <b>
  })

  it('python f-string and c-sharp interpolating string', () => {
    expect(glow('f"value {x} end"')).toBe('<code><em>f"</em><em>value </em><i>{</i><b>x</b><i>}</i><em> end</em><em>"</em></code>')
    expect(glow('$"hi {y} bye"')).toBe('<code><em>$"</em><em>hi </em><i>{</i><b>y</b><i>}</i><em> bye</em><em>"</em></code>')
  })

  it('triple-quoted string spans lines', () => {
    expect(glow('"""doc\nline\n"""')).toBe('<code><em>"""</em><em>doc</em>\n<em>line</em>\n<em>"""</em></code>')
  })

  it('unterminated single-line quote stops at end of line', () => {
    expect(glow('const s = \'abc\nconst y = 2')).toBe(
      '<code><strong>const</strong> <b>s</b> <i>=</i> <em>\'</em><em>abc</em>\n<strong>const</strong> <b>y</b> <i>=</i> <em>2</em></code>',
    )
  })
})

describe('json keys vs string values', () => {
  it('quoted keys are identifiers, values keep the string colour', () => {
    const html = glow('{ "name": "ana", "ok": true }')
    expect(html).toContain('<b>"</b><b>name</b><b>"</b>')
    expect(html).toContain('<em>ana</em>')
    expect(html).toContain('<strong>true</strong>')
  })
})

describe('markup vs code disambiguation', () => {
  it('known html tags and their close tags become markup', () => {
    const html = glow('<div class="x">Hello</div>')
    expect(html).toContain('<strong>div</strong>')
    expect(html).toContain('<b>class</b>')
    expect(html).toContain('<em>x</em>')
    // prose inside a real tag pair is left uncoloured
    expect(html).toContain('>Hello<')
  })

  it('self-closing tags are markup even with unknown names', () => {
    expect(glow('<img src="a.png" />')).toContain('<strong>img</strong>')
  })

  it('matched custom component pair is markup', () => {
    const html = glow('<MyComp a={1}>text</MyComp>')
    expect(html).toContain('<strong>MyComp</strong>')
    expect(html).toContain('<b>a</b><i>=</i><i>{</i><em>1</em><i>}</i>') // JSX expression keeps code colours
  })

  it('ts generics and comparisons are not markup', () => {
    const generic = glow('foo<T>(x)\nlet b: Array<string> = []')
    expect(generic).not.toContain('<strong>T</strong>')
    expect(generic).not.toContain('"<')
    const compare = glow('if (a < b && x <= y)')
    expect(compare).not.toContain('<strong>b</strong>')
    expect(compare).not.toContain('<strong>y</strong>')
  })

  it('unmatched custom element (a lone Foo<T>) is not markup', () => {
    expect(glow('Foo<T>')).toBe('<code><b>Foo</b><i>&lt;</i><b>T</b><i>&gt;</i></code>')
  })
})

describe('decorators and unicode', () => {
  it('@decorator / annotation becomes <label>', () => {
    expect(glow('@sealed\nclass Foo')).toBe('<code><label>@sealed</label>\n<strong>class</strong> <b>Foo</b></code>')
    expect(glow('email@example.com')).not.toContain('<label>')
  })

  it('cjk identifiers and comments highlight', () => {
    expect(glow('变量 = 值\n// 中文注释')).toBe(
      '<code><b>变量</b> <i>=</i> <b>值</b>\n<sup>// 中文注释</sup></code>',
    )
  })
})

describe('line handling', () => {
  it('trailing and leading blank lines are trimmed', () => {
    expect(glow('a\n')).toBe('<code><b>a</b></code>')
    expect(glow('\na')).toBe('<code><b>a</b></code>')
  })

  it('blank lines in the middle are preserved', () => {
    expect(glow('a\n\nb')).toBe('<code><b>a</b>\n\n<b>b</b></code>')
    expect(glow('a\n \nb')).toBe('<code><b>a</b>\n \n<b>b</b></code>')
  })

  it('a lone zero is one number token, not an overruning radix literal', () => {
    expect(glow('0')).toBe('<code><em>0</em></code>')
    expect(glow('x = 0')).toBe('<code><b>x</b> <i>=</i> <em>0</em></code>')
  })
})

describe('glowInner & glowSource', () => {
  /** the text a piece of highlighted markup reproduces, tags stripped */
  function textOf(html: string): string {
    return html
      .replace(/<\/?[a-z][^>]*>/g, '')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&amp;/g, '&')
  }

  it('glowInner is exactly the markup glow wraps in <code>', () => {
    const code = 'const a = 1'
    expect(glow(code)).toBe(`<code>${glowInner(code)}</code>`)
    // language only annotates the <code> element, so the inner markup is identical
    expect(glow(code, { language: 'ts' })).toBe(`<code language="ts">${glowInner(code)}</code>`)
    expect(glowInner(code, { language: 'ts' })).toBe(glowInner(code))
  })

  it('glowInner returns nothing for blank input', () => {
    expect(glowInner('')).toBe('')
    expect(glowInner('\n\n')).toBe('')
    expect(glow('\n\n')).toBe('')
  })

  it('numbered lines carry a class, so a caller\'s own spans are left alone', () => {
    expect(glowInner('a\nb', { numbered: true })).toBe(
      '<span class="glow-line"><b>a</b></span>\n<span class="glow-line"><b>b</b></span>',
    )
  })

  it('glowSource reports the text that is actually rendered', () => {
    expect(glowSource('a\r\nb').text).toBe('a\nb')
    expect(glowSource('\n\n a \n\n').text).toBe(' a ')
    expect(glowSource(['x', 'y']).text).toBe('x\ny')
    expect(glowSource('').text).toBe('')
  })

  it('the rendered markup always reproduces glowSource().text verbatim', () => {
    const sources = [
      'const a = 1',
      'a = "x & y < z"',
      'a\r\nb\r\n\r\nc',
      '\n\n  indented\n  ',
      'a\n\nb',
      '`t${x}` @dec // c',
      '中文 = 值',
    ]
    for (const src of sources) {
      expect(textOf(glowInner(src))).toBe(glowSource(src).text)
      expect(textOf(glowInner(src, { numbered: true }))).toBe(glowSource(src).text)
    }
  })

  it('maps offsets through CRLF normalisation', () => {
    const { offset } = glowSource('a\r\nb\r\nc')
    expect(offset(0)).toBe(0) // a
    expect(offset(1)).toBe(1)
    expect(offset(3)).toBe(2) // b, one character shorter than its raw index
    expect(offset(4)).toBe(3)
    expect(offset(6)).toBe(4) // c
    expect(offset(7)).toBe(5) // end of text
  })

  it('maps offsets through the blank-line trim', () => {
    const { text, offset } = glowSource('\n\na\nb')
    expect(text).toBe('a\nb')
    expect(offset(0)).toBe(0) // inside the trimmed leading blank lines
    expect(offset(1)).toBe(0)
    expect(offset(2)).toBe(0) // a
    expect(offset(4)).toBe(2) // b
    expect(offset(5)).toBe(3)
  })

  it('clamps offsets that fall outside the text', () => {
    const { text, offset } = glowSource('a\n\n')
    expect(text).toBe('a')
    expect(offset(-5)).toBe(0)
    expect(offset(99)).toBe(text.length)
  })

  it('the class the stylesheet numbers is the one we emit', () => {
    const css = readFileSync(new URL('../css/syntax.css', import.meta.url), 'utf8')
    const numbered = glowInner('a', { numbered: true })
    // the stylesheet numbers `.glow-line`, and that is what a numbered line is
    expect(css).toContain('.glow-line')
    expect(numbered).toContain('class="glow-line"')
    // without `numbered` no span is emitted at all, so a caller's own spans can
    // never be picked up by the numbering rules
    expect(glowInner('a')).not.toContain('<span')
  })
})
