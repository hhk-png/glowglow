import { describe, expect, test } from 'vitest'
import { glow } from '../src/index'
import type { GlowOptions } from '../src/index'

/** strip the outer <code…> wrapper so assertions read the inner body */
function body(input: string | readonly string[], opts?: GlowOptions): string {
  return glow(input, opts).replace(/^<code[^>]*>/, '').replace(/<\/code>$/, '')
}

describe('glow', () => {
  test('wraps output in <code>, language is metadata only', () => {
    expect(glow('const a = 1')).toBe('<code><strong>const</strong> <b>a</b> <i>=</i> <em>1</em></code>')
    const lang = glow('x', { language: 'ts' })
    expect(lang.startsWith('<code language="ts">')).toBe(true)
    expect(lang.endsWith('</code>')).toBe(true)
    // the same engine output regardless of language metadata
    expect(body('x', { language: 'ts' })).toBe(body('x', { language: 'ruby' }))
  })

  test('accepts an array of lines', () => {
    expect(glow(['a', 'b'])).toBe('<code><b>a</b>\n<b>b</b></code>')
  })

  test('numbered wraps each line in a <span>', () => {
    const html = glow('a\nb', { numbered: true })
    expect(html).toContain('<span><b>a</b></span>')
    expect(html).toContain('<span><b>b</b></span>')
  })

  test('normalises CRLF line endings', () => {
    expect(body('const a = 1\r\nconst b = 2')).toBe('<strong>const</strong> <b>a</b> <i>=</i> <em>1</em>\n<strong>const</strong> <b>b</b> <i>=</i> <em>2</em>')
  })

  test('escapes html special characters', () => {
    // <code> tags are recognised as markup; the ampersand and prose stay escaped
    const html = glow('a = "x & y"')
    expect(html).toContain('&amp;')
    expect(html).not.toContain('x & y')
    // no raw & < > remain except the ones that start entities
    expect(html).not.toMatch(/&(?![a-zA-Z#0-9]+;)/)
    expect(html).not.toMatch(/<(?!\/?(?:code|strong|b|em|sup|label|i|span)>)/)
    // a bare run of operators becomes a single escaped token
    expect(glow('&<>')).toBe('<code><i>&amp;&lt;&gt;</i></code>')
  })

  test('language attribute value is escaped', () => {
    expect(glow('a', { language: 'x"y' })).toBe('<code language="x&quot;y"><b>a</b></code>')
  })

  test('empty input renders nothing', () => {
    expect(glow('')).toBe('')
    expect(glow('\n\n')).toBe('')
  })

  test('single-line output never splits one identifier across spans', () => {
    const html = glow('const abcd = efgh')
    expect(html).toContain('<strong>const</strong>')
    expect(html).toContain('<b>abcd</b>')
    expect(html).toContain('<b>efgh</b>')
  })
})

describe('semantic keywords (language-free)', () => {
  test('type-declaration and TS keywords are highlighted whole-word', () => {
    const html = glow('type Foo = keyof T extends string ? never : readonly Foo[]')
    expect(html).toContain('<strong>type</strong>')
    expect(html).toContain('<strong>keyof</strong>')
    expect(html).toContain('<strong>extends</strong>')
    expect(html).toContain('<strong>readonly</strong>')
    expect(html).toContain('<strong>string</strong>')
    expect(html).toContain('<strong>never</strong>')
  })

  test('enum/namespace/modifiers/declare highlight', () => {
    const html = glow('declare enum E {} export namespace N {}')
    expect(html).toContain('<strong>declare</strong>')
    expect(html).toContain('<strong>enum</strong>')
    expect(html).toContain('<strong>export</strong>')
    expect(html).toContain('<strong>namespace</strong>')
  })

  test('keywords across languages highlight the same way', () => {
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

  test('property access after a dot is not a keyword (obj.type)', () => {
    const html = glow('obj.type\nstr.match')
    expect(html).toContain('<b>type</b>')
    expect(html).toContain('<b>match</b>')
    expect(html).not.toContain('<strong>type</strong>')
    expect(html).not.toContain('<strong>match</strong>')
  })

  test('case-insensitive keywords but whole word only', () => {
    expect(glow('RETURN return returned')).toBe('<code><strong>RETURN</strong> <strong>return</strong> <b>returned</b></code>')
  })
})

describe('numbers', () => {
  test('bases, separators, decimals, exponents, suffixes all become <em>', () => {
    expect(glow('0xFF 0b101 0o17')).toBe('<code><em>0xFF</em> <em>0b101</em> <em>0o17</em></code>')
    expect(glow('1_000 .5 1e-3 1n 10u32 3.14')).toBe(
      '<code><em>1_000</em> <em>.5</em> <em>1e-3</em> <em>1n</em> <em>10u32</em> <em>3.14</em></code>',
    )
  })

  test('a number after an identifier stays one word apart', () => {
    expect(glow('const x = 42')).toContain('<b>x</b> <i>=</i> <em>42</em>')
  })
})

describe('comments', () => {
  test('hash comment vs css colour vs preprocessor include', () => {
    const html = glow('# note\ncolor: #fff;\n#include <stdio.h>')
    const lines = html.split('\n')
    expect(lines[0]!).toContain('<sup># note</sup>')
    expect(lines[1]!).toContain('<i>#</i><b>fff</b>')
    // #include is not a comment: the include becomes a plain identifier, <stdio.h> non-tag code
    expect(lines[2]!).not.toContain('comment')
  })

  test('shebang is a comment', () => {
    expect(glow('#!/usr/bin/env node')).toBe('<code><sup>#!/usr/bin/env node</sup></code>')
  })

  test('double-slash and block comments', () => {
    expect(glow('a // note')).toBe('<code><b>a</b> <sup>// note</sup></code>')
    expect(glow('/* hi */ a')).toBe('<code><sup>/* hi */</sup> <b>a</b></code>')
  })

  test('html comment is a comment', () => {
    expect(glow('<!-- hi -->\nx')).toBe('<code><sup>&lt;!-- hi --&gt;</sup>\n<b>x</b></code>')
  })

  test('SQL/Lua -- comment only when standalone', () => {
    expect(glow('-- note\nSELECT a')).toBe('<code><sup>-- note</sup>\n<strong>SELECT</strong> <b>a</b></code>')
    expect(glow('x = 1 -- note')).toBe('<code><b>x</b> <i>=</i> <em>1</em> <sup>-- note</sup></code>')
  })

  test('decrement operators are not comments', () => {
    expect(glow('a--')).toBe('<code><b>a</b><i>--</i></code>')
    expect(glow('--x')).toBe('<code><i>--</i><b>x</b></code>')
    expect(glow('x = a-- + --b')).toBe('<code><b>x</b> <i>=</i> <b>a</b><i>--</i> <i>+</i> <i>--</i><b>b</b></code>')
  })

  test('multiline block comment spans lines as one <sup>', () => {
    const html = body('/* one\ntwo */\nx')
    expect(html).toBe('<sup>/* one</sup>\n<sup>two */</sup>\n<b>x</b>')
  })
})

describe('strings & templates', () => {
  test('escaped quote inside a string', () => {
    expect(glow('s = "a\\"b"')).toBe('<code><b>s</b> <i>=</i> <em>"</em><em>a\\"b</em><em>"</em></code>')
  })

  test('url stays inside the string and is escaped, not a comment', () => {
    expect(glow('u = "http://x.com/a?b=1&c=2"')).toBe(
      '<code><b>u</b> <i>=</i> <em>"</em><em>http://x.com/a?b=1&amp;c=2</em><em>"</em></code>',
    )
  })

  test('double-quoted strings do not interpolate ${}', () => {
    expect(glow('x = "${a}"')).toBe('<code><b>x</b> <i>=</i> <em>"</em><em>${a}</em><em>"</em></code>')
  })

  test('backtick template interpolates ${...} with nested templates', () => {
    const html = glow('`a${b ? `x${y}` : c}d`')
    // interpolation braces are <i>, inner code is coloured normally
    expect(html).toContain('<i>${</i>')
    expect(html).toContain('<b>b</b>')
    expect(html).toContain('<b>c</b>')
    expect(html).toContain('<b>y</b>')
    expect(html).not.toContain('<b>a</b>') // literal text is <em>, not <b>
  })

  test('python f-string and c-sharp interpolating string', () => {
    expect(glow('f"value {x} end"')).toBe('<code><em>f"</em><em>value </em><i>{</i><b>x</b><i>}</i><em> end</em><em>"</em></code>')
    expect(glow('$"hi {y} bye"')).toBe('<code><em>$"</em><em>hi </em><i>{</i><b>y</b><i>}</i><em> bye</em><em>"</em></code>')
  })

  test('triple-quoted string spans lines', () => {
    expect(glow('"""doc\nline\n"""')).toBe('<code><em>"""</em><em>doc</em>\n<em>line</em>\n<em>"""</em></code>')
  })

  test('unterminated single-line quote stops at end of line', () => {
    expect(glow("const s = 'abc\nconst y = 2")).toBe(
      '<code><strong>const</strong> <b>s</b> <i>=</i> <em>\'</em><em>abc</em>\n<strong>const</strong> <b>y</b> <i>=</i> <em>2</em></code>',
    )
  })
})

describe('json keys vs string values', () => {
  test('quoted keys are identifiers, values keep the string colour', () => {
    const html = glow('{ "name": "ana", "ok": true }')
    expect(html).toContain('<b>"</b><b>name</b><b>"</b>')
    expect(html).toContain('<em>ana</em>')
    expect(html).toContain('<strong>true</strong>')
  })
})

describe('markup vs code disambiguation', () => {
  test('known html tags and their close tags become markup', () => {
    const html = glow('<div class="x">Hello</div>')
    expect(html).toContain('<strong>div</strong>')
    expect(html).toContain('<b>class</b>')
    expect(html).toContain('<em>x</em>')
    // prose inside a real tag pair is left uncoloured
    expect(html).toContain('>Hello<')
  })

  test('self-closing tags are markup even with unknown names', () => {
    expect(glow('<img src="a.png" />')).toContain('<strong>img</strong>')
  })

  test('matched custom component pair is markup', () => {
    const html = glow('<MyComp a={1}>text</MyComp>')
    expect(html).toContain('<strong>MyComp</strong>')
    expect(html).toContain('<b>a</b><i>=</i><i>{</i><em>1</em><i>}</i>') // JSX expression keeps code colours
  })

  test('ts generics and comparisons are not markup', () => {
    const generic = glow('foo<T>(x)\nlet b: Array<string> = []')
    expect(generic).not.toContain('<strong>T</strong>')
    expect(generic).not.toContain('"<')
    const compare = glow('if (a < b && x <= y)')
    expect(compare).not.toContain('<strong>b</strong>')
    expect(compare).not.toContain('<strong>y</strong>')
  })

  test('unmatched custom element (a lone Foo<T>) is not markup', () => {
    expect(glow('Foo<T>')).toBe('<code><b>Foo</b><i>&lt;</i><b>T</b><i>&gt;</i></code>')
  })
})

describe('decorators and unicode', () => {
  test('@decorator / annotation becomes <label>', () => {
    expect(glow('@sealed\nclass Foo')).toBe('<code><label>@sealed</label>\n<strong>class</strong> <b>Foo</b></code>')
    expect(glow('email@example.com')).not.toContain('<label>')
  })

  test('cjk identifiers and comments highlight', () => {
    expect(glow('变量 = 值\n// 中文注释')).toBe(
      '<code><b>变量</b> <i>=</i> <b>值</b>\n<sup>// 中文注释</sup></code>',
    )
  })
})
