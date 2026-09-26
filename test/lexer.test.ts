import { describe, expect, it } from 'vitest'
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
  it('tokens fully cover the input without overlap', () => {
    const src = 'const x = foo(1, "hi") // end'
    const toks = lex(src)
    expect(toks[0]!.start).toBe(0)
    expect(toks[toks.length - 1]!.end).toBe(src.length)
    for (let k = 1; k < toks.length; k++) {
      expect(toks[k]!.start).toBe(toks[k - 1]!.end)
    }
  })

  it('identifiers: ascii, $, _, unicode letters, digits inside', () => {
    const toks = lex('abc $x _y a1b 变量')
    const words = toks.filter(t => t.kind === 'word')
    expect(words.length).toBe(5)
    const text = words.map(t => tokenText('abc $x _y a1b 变量', t)).join('|')
    expect(text).toBe('abc|$x|_y|a1b|变量')
  })

  it('operators merge into runs; brackets stay single; </ splits, /> merges', () => {
    expect(shape('a === b')).toBe('word:"a" ws:" " op:"===" ws:" " word:"b"')
    expect(shape('a => b')).toBe('word:"a" ws:" " op:"=>" ws:" " word:"b"')
    expect(shape('a?.b')).toBe('word:"a" op:"?." word:"b"')
    expect(shape('a++ b--')).toContain('op:"++"')
    expect(shape('fn(x)[1]')).toBe('word:"fn" op:"(" word:"x" op:")" op:"[" num:"1" op:"]"')
    expect(shape('</div>')).toBe('op:"<" op:"/" word:"div" op:">"')
    expect(shape('<br/>')).toBe('op:"<" word:"br" op:"/>"')
  })

  it('line comment forms', () => {
    expect(shape('a // b')).toBe('word:"a" ws:" " comment:"// b"')
    expect(kinds('# note\n# x')).toBe('comment ws comment')
  })

  it('# is a comment only before ws/!/EOL — not #fff, #include, #id', () => {
    expect(shape('#fff')).toBe('op:"#" word:"fff"')
    expect(shape('#include')).toBe('op:"#" word:"include"')
    expect(shape('#my-id')).toBe('op:"#" word:"my" op:"-" word:"id"')
    expect(shape('x = #c')).toBe('word:"x" ws:" " op:"=" ws:" " op:"#" word:"c"')
  })

  it('-- is a comment only when standalone — not a-- or --x', () => {
    expect(shape('-- note')).toBe('comment:"-- note"')
    expect(shape('a -- note')).toBe('word:"a" ws:" " comment:"-- note"')
    expect(shape('a--')).toBe('word:"a" op:"--"')
    expect(shape('--x')).toBe('op:"--" word:"x"')
    expect(shape('x = a--')).toBe('word:"x" ws:" " op:"=" ws:" " word:"a" op:"--"')
  })

  it('block and html comments span lines', () => {
    expect(shape('/* a\n b */')).toBe('comment:"/* a\\n b */"')
    expect(shape('<!-- a\n b -->')).toBe('comment:"<!-- a\\n b -->"')
    expect(shape('a /* unterminated')).toBe('word:"a" ws:" " comment:"/* unterminated"')
  })

  it('lua long block comment --[[ … ]] spans lines', () => {
    expect(shape('--[[ doc\n still doc ]]')).toBe('comment:"--[[ doc\\n still doc ]]"')
    expect(shape('--[==[ doc\nstill ]]==] end')).toBe(
      'comment:"--[==[ doc\\nstill ]]==]" ws:" " word:"end"',
    )
    // a decrement glued to an index is not a lua comment
    expect(shape('a--[0]')).toBe('word:"a" op:"--" op:"[" num:"0" op:"]"')
  })

  it('numbers: bases, separators, decimals, exponents, suffixed', () => {
    expect(shape('0xFF')).toBe('num:"0xFF"')
    expect(shape('0b101 0o17')).toBe('num:"0b101" ws:" " num:"0o17"')
    expect(shape('1_000')).toBe('num:"1_000"')
    expect(shape('.5')).toBe('num:".5"')
    expect(shape('1e-3')).toBe('num:"1e-3"')
    expect(shape('1n')).toBe('num:"1n"')
    expect(shape('10u32')).toBe('num:"10u32"')
    expect(shape('3.14')).toBe('num:"3.14"')
  })

  it('decorators vs email addresses', () => {
    expect(shape('@sealed')).toBe('decor:"@sealed"')
    expect(shape('a @Override b')).toContain('decor:"@Override"')
    expect(shape('email@example.com')).toBe('word:"email" op:"@" word:"example" op:"." word:"com"')
  })

  it('strings escape quotes; unterminated stops at newline', () => {
    expect(shape('s = "a\\"b"')).toBe('word:"s" ws:" " op:"=" ws:" " str:"\\"" str:"a\\\\\\"b" str:"\\""')
    expect(kinds('\'abc\nx')).toBe('str str ws word')
  })

  it('double-quoted strings do not interpolate', () => {
    expect(shape('"${a}"')).toBe('str:"\\"" str:"${a}" str:"\\""')
  })

  it('backtick template interpolates ${...} recursively', () => {
    const src = '`a${b ? `x${y}` : c}`'
    const toks = lex(src)
    expect(toks.some(t => t.kind === 'op' && tokenText(src, t) === '${')).toBe(true)
    const s = toks.map(t => `${t.kind}:${JSON.stringify(tokenText(src, t))}`).join(' ')
    expect(s).toContain('str:"`"') // nested template opener inside the interpolation
    expect(s).toContain('word:"y"')
  })

  it('f-string prefix interpolates {…}', () => {
    expect(shape('f"v {x} e"')).toBe('str:"f\\"" str:"v " op:"{" word:"x" op:"}" str:" e" str:"\\""')
  })

  it('c-sharp interpolating string interpolates {…}', () => {
    expect(shape('$"hi {y} bye"')).toBe('str:"$\\"" str:"hi " op:"{" word:"y" op:"}" str:" bye" str:"\\""')
  })

  it('triple-quoted strings are multiline', () => {
    expect(shape('"""doc\nx\n"""')).toBe('str:"\\"\\"\\"" str:"doc\\nx\\n" str:"\\"\\"\\""')
  })
})

describe('lex — boundary guards', () => {
  it('a quote prefix must start a fresh word', () => {
    // 10u32 ends a number immediately before $", so the $ is not a C# string prefix
    expect(shape('10u32$"x"')).toBe('num:"10u32" word:"$" str:"\\"" str:"x" str:"\\""')
    // a 2-letter run that is not r/f/b/u is a plain word, not a prefix
    expect(shape('ab"x"')).toBe('word:"ab" str:"\\"" str:"x" str:"\\""')
  })

  it('non-interpolating prefixes r/b/u do not open a brace interpolation', () => {
    expect(shape('r"a"')).toBe('str:"r\\"" str:"a" str:"\\""')
    expect(shape('r"""a"""')).toBe('str:"r\\"\\"\\"" str:"a" str:"\\"\\"\\""')
  })

  it('{{ }} escapes a literal brace inside an interpolating prefix', () => {
    expect(shape('f"a{{b}}c"')).toBe('str:"f\\"" str:"a{{b}}c" str:"\\""')
  })

  it('a lone quote inside a triple-quoted literal does not close it', () => {
    expect(shape('"""a"b"""')).toBe('str:"\\"\\"\\"" str:"a\\"b" str:"\\"\\"\\""')
  })

  it('an unterminated string at end of input still emits its text', () => {
    expect(shape('"abc')).toBe('str:"\\"" str:"abc"')
  })

  it('@ not followed by an identifier is an operator', () => {
    expect(shape('@ x')).toBe('op:"@" ws:" " word:"x"')
  })

  it('nested braces inside ${} track interpolation depth', () => {
    expect(shape('`${{a}}`')).toBe('str:"`" op:"${" op:"{" word:"a" op:"}" op:"}" str:"`"')
  })

  it('a comment marker inside an operator run ends the run', () => {
    expect(shape('a =// b')).toBe('word:"a" ws:" " op:"=" comment:"// b"')
    expect(shape('a =<!-- x -->')).toBe('word:"a" ws:" " op:"=" comment:"<!-- x -->"')
  })

  it('an unterminated lua long comment runs to end of input', () => {
    expect(shape('--[[ doc')).toBe('comment:"--[[ doc"')
  })

  it('an unterminated html comment runs to end of input', () => {
    expect(shape('<!-- doc')).toBe('comment:"<!-- doc"')
  })

  it('numbers at the end of input never overrun the source', () => {
    for (const s of ['0', '0.5', '09', '1e+', '42']) {
      for (const t of lex(s)) {
        expect(t.end).toBeLessThanOrEqual(s.length)
        expect(t.start).toBeLessThan(t.end)
      }
      expect(lex(s).map(t => tokenText(s, t)).join('')).toBe(s)
    }
  })

  it('exponents with and without a sign or digits', () => {
    expect(shape('1e5')).toBe('num:"1e5"')
    expect(shape('1e+5')).toBe('num:"1e+5"')
    expect(shape('1e+')).toBe('num:"1e" op:"+"')
  })

  it('underscores are part of a numeric literal on both sides of the dot', () => {
    expect(shape('1_0.5')).toBe('num:"1_0.5"')
    expect(shape('1.5_0')).toBe('num:"1.5_0"')
  })
})
