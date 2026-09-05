import { describe, expect, test } from 'vitest'
import { glow, parseRow, parseSyntax, renderRow } from '../src/index'

test('HTML', () => {
  const row = '<div class="hello">'

  // parse
  const [char, prop, ...rest] = parseRow(row)

  expect(char.tag).toBe('i')
  expect(prop.tag).toBe('strong')
  expect(prop.start).toBe(5)
  expect(rest.length).toBeGreaterThan(4)

  // render
  const html = renderRow(row)
  expect(html.startsWith('<i>&lt;</i>')).toBe(true)
  expect(html).toContain('<strong>class</strong>')
  expect(html).toContain('<em>"hello"</em>')
})

test('Emphasis', () => {
  const html = renderRow('Hey •[img]• girl')
  expect(html.startsWith('Hey <mark>')).toBe(true)
  expect(html).toContain('</i></mark> girl')
})

/* multiline comments */
test('parse HTML comment', () => {
  const blocks = parseSyntax(['<div>', '<!--', 'comment', '-->', '</div>'])
  expect(blocks[1].comment![0]).toBe('<!--')
})

test('parse JS comment', () => {
  const blocks = parseSyntax(['/* First */', 'function() {', '/*', 'Second', '*/'])
  expect(blocks[0].comment).toEqual(['/* First */'])
  expect(blocks[2].line).toEqual('/*')
})

/* prefix and mark */
test('disable mark', () => {
  const html = renderRow('Hey •[img]• girl', undefined, false)
  expect(html).toContain('Hey •')
  expect(html).toContain('• girl')
})

test('escape prefixes', () => {
  const blocks = parseSyntax(
    ['\\+ not really adding a line', '\\- not really removing a line', '\\| not really marking a line'],
    'md',
  )

  expect(blocks[0].line).toEqual('+ not really adding a line')
  expect(blocks[1].line).toEqual('- not really removing a line')
  expect(blocks[2].line).toEqual('| not really marking a line')
})

test('disable prefixes', () => {
  const blocks = parseSyntax(['+ not really adding a line', '- not really removing a line', '> not really marking a line'], undefined, false)

  expect(blocks[0].wrap).toEqual(false)
  expect(blocks[1].wrap).toEqual(false)
  expect(blocks[2].wrap).toEqual(false)
})

describe('TypeScript keywords', () => {
  test('type-declaration keywords are highlighted', () => {
    const html = renderRow('type Foo = keyof T extends string ? never : readonly Foo[]', 'ts')
    expect(html).toContain('<strong>type</strong>')
    expect(html).toContain('<strong>keyof</strong>')
    expect(html).toContain('<strong>extends</strong>')
    expect(html).toContain('<strong>readonly</strong>')
    expect(html).toContain('<strong>string</strong>')
  })

  test('enum / namespace / modifiers highlight', () => {
    const html = renderRow('declare enum E { }', 'ts')
    expect(html).toContain('<strong>declare</strong>')
    expect(html).toContain('<strong>enum</strong>')
  })
})

describe('glow', () => {
  test('wraps in code with language', () => {
    const html = glow('const a = 1', { language: 'js' })
    expect(html.startsWith('<code language="js">')).toBe(true)
    expect(html.endsWith('</code>')).toBe(true)
  })

  test('detects html from first char', () => {
    const html = glow('<p>Hello</p>')
    expect(html.startsWith('<code language="html">')).toBe(true)
  })

  test('accepts an array of lines and a string language', () => {
    const html = glow(['const a = 1', 'console.log(a)'], 'js')
    expect(html).toContain('<b>console</b>')
    expect(html).toContain('<b>log</b>')
  })

  test('numbered lines get wrapped in spans', () => {
    const html = glow('const a = 1', { language: 'js', numbered: true })
    expect(html).toContain('<span>')
  })
})
