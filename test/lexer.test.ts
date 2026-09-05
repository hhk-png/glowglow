import { describe, expect, test } from 'vitest'
import { lex, tokenText } from '../src/lexer'

function kinds(src: string): string {
  return lex(src)
    .map(t => t.kind)
    .join(' ')
}
function shape(src: string): string {
  return lex(src)
    .map(t => `${t.kind}:${JSON.stringify(tokenText(src, t))}`)
    .join(' ')
}

describe('lex — kinds & boundaries', () => {
  test('tokens fully cover the input without overlap', () => {
    const src = 'const x = foo(1, "hi") // end'
    const toks = lex(src)
    expect(toks[0]!.start).toBe(0)
    expect(toks[toks.length - 1]!.end).toBe(src.length)
    for (let k = 1; k < toks.length; k++) {
      expect(toks[k]!.start).toBe(toks[k - 1]!.end)
    }
  })

  test('identifiers: ascii, $, _, unicode letters, digits inside', () => {
    const toks = lex('abc $x _y a1b 变量')
    const words = toks.filter(t => t.kind === 'word')
    expect(words.length).toBe(5)
    const text = words.map(t => tokenText('abc $x _y a1b 变量', t)).join('|')
    expect(text).toBe('abc|$x|_y|a1b|变量')
  })

  test('operators merge into runs; brackets stay single; </ splits, /> merges', () => {
    expect(shape('a === b')).toBe('word:"a" ws:" " op:"===" ws:" " word:"b"')
    expect(shape('a => b')).toBe('word:"a" ws:" " op:"=>" ws:" " word:"b"')
    expect(shape('a?.b')).toBe('word:"a" op:"?." word:"b"')
    expect(shape('a++ b--')).toContain('op:"++"')
    expect(shape('fn(x)[1]')).toBe('word:"fn" op:"(" word:"x" op:")" op:"[" num:"1" op:"]"')
    expect(shape('</div>')).toBe('op:"<" op:"/" word:"div" op:">"')
    expect(shape('<br/>')).toBe('op:"<" word:"br" op:"/>"')
  })

  test('line comment forms', () => {
    expect(shape('a // b')).toBe('word:"a" ws:" " comment:"// b"')
    expect(kinds('# note\n# x')).toBe('comment ws comment')
  })

  test('# is a comment only before ws/!/EOL — not #fff, #include, #id', () => {
    expect(shape('#fff')).toBe('op:"#" word:"fff"')
    expect(shape('#include')).toBe('op:"#" word:"include"')
    expect(shape('#my-id')).toBe('op:"#" word:"my" op:"-" word:"id"')
    expect(shape('x = #c')).toBe('word:"x" ws:" " op:"=" ws:" " op:"#" word:"c"')
  })

  test('-- is a comment only when standalone — not a-- or --x', () => {
    expect(shape('-- note')).toBe('comment:"-- note"')
    expect(shape('a -- note')).toBe('word:"a" ws:" " comment:"-- note"')
    expect(shape('a--')).toBe('word:"a" op:"--"')
    expect(shape('--x')).toBe('op:"--" word:"x"')
    expect(shape('x = a--')).toBe('word:"x" ws:" " op:"=" ws:" " word:"a" op:"--"')
  })

  test('block and html comments span lines', () => {
    expect(shape('/* a\n b */')).toBe('comment:"/* a\\n b */"')
    expect(shape('<!-- a\n b -->')).toBe('comment:"<!-- a\\n b -->"')
    expect(shape('a /* unterminated')).toBe('word:"a" ws:" " comment:"/* unterminated"')
  })

  test('numbers: bases, separators, decimals, exponents, suffixed', () => {
    expect(shape('0xFF')).toBe('num:"0xFF"')
    expect(shape('0b101 0o17')).toBe('num:"0b101" ws:" " num:"0o17"')
    expect(shape('1_000')).toBe('num:"1_000"')
    expect(shape('.5')).toBe('num:".5"')
    expect(shape('1e-3')).toBe('num:"1e-3"')
    expect(shape('1n')).toBe('num:"1n"')
    expect(shape('10u32')).toBe('num:"10u32"')
    expect(shape('3.14')).toBe('num:"3.14"')
  })

  test('decorators vs email addresses', () => {
    expect(shape('@sealed')).toBe('decor:"@sealed"')
    expect(shape('a @Override b')).toContain('decor:"@Override"')
    expect(shape('email@example.com')).toBe('word:"email" op:"@" word:"example" op:"." word:"com"')
  })

  test('strings escape quotes; unterminated stops at newline', () => {
    expect(shape('s = "a\\"b"')).toBe('word:"s" ws:" " op:"=" ws:" " str:"\\"" str:"a\\\\\\"b" str:"\\""')
    expect(kinds("'abc\nx")).toBe('str str ws word')
  })

  test('double-quoted strings do not interpolate', () => {
    expect(shape('"${a}"')).toBe('str:"\\"" str:"${a}" str:"\\""')
  })

  test('backtick template interpolates ${...} recursively', () => {
    const src = '`a${b ? `x${y}` : c}`'
    const toks = lex(src)
    expect(toks.some(t => t.kind === 'op' && tokenText(src, t) === '${')).toBe(true)
    const s = toks.map(t => `${t.kind}:${JSON.stringify(tokenText(src, t))}`).join(' ')
    expect(s).toContain('str:"`"') // nested template opener inside the interpolation
    expect(s).toContain('word:"y"')
  })

  test('f-string prefix interpolates {…}', () => {
    expect(shape('f"v {x} e"')).toBe('str:"f\\"" str:"v " op:"{" word:"x" op:"}" str:" e" str:"\\""')
  })

  test('c-sharp interpolating string interpolates {…}', () => {
    expect(shape('$"hi {y} bye"')).toBe('str:"$\\"" str:"hi " op:"{" word:"y" op:"}" str:" bye" str:"\\""')
  })

  test('triple-quoted strings are multiline', () => {
    expect(shape('"""doc\nx\n"""')).toBe('str:"\\"\\"\\"" str:"doc\\nx\\n" str:"\\"\\"\\""')
  })
})
