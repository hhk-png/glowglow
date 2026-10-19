import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { detectLanguage } from '../src/detect'

function sample(name: string): string {
  return readFileSync(new URL(`../preview/samples/${name}`, import.meta.url), 'utf8')
}

const CASES: Array<[file: string, language: string]> = [
  ['bash.sh', 'bash'],
  ['c.c', 'c'],
  ['cpp.cpp', 'cpp'],
  ['csharp.cs', 'csharp'],
  ['css.css', 'css'],
  ['go.go', 'go'],
  ['haskell.hs', 'haskell'],
  ['html.html', 'html'],
  ['java.java', 'java'],
  ['javascript.js', 'javascript'],
  ['json.json', 'json'],
  ['jsx.jsx', 'jsx'],
  ['kotlin.kt', 'kotlin'],
  ['lua.lua', 'lua'],
  ['perl.pl', 'perl'],
  ['php.php', 'php'],
  ['python.py', 'python'],
  ['ruby.rb', 'ruby'],
  ['rust.rs', 'rust'],
  ['sql.sql', 'sql'],
  ['swift.swift', 'swift'],
  ['toml.toml', 'toml'],
  ['typescript.ts', 'typescript'],
  ['yaml.yaml', 'yaml'],
]

describe('detectLanguage', () => {
  it.each(CASES)('detects %s as %s', (file, language) => {
    expect(detectLanguage(sample(file))?.language).toBe(language)
  })

  it.each([
    ['#!/usr/bin/env bash', 'bash'],
    ['#!/usr/bin/env python3', 'python'],
    ['#!/usr/bin/env ruby', 'ruby'],
    ['#!/usr/bin/perl', 'perl'],
    ['#!/usr/bin/env node', 'javascript'],
    ['<?php echo 1;', 'php'],
    ['<!doctype html><html></html>', 'html'],
    ['package main\n\nfunc main() {}', 'go'],
    ['fn main() {}', 'rust'],
    ['import Foundation\nstruct P {}', 'swift'],
    ['import kotlin.math.sqrt', 'kotlin'],
    ['using System;\nclass P {}', 'csharp'],
    ['module Main where\nx = 1', 'haskell'],
    ['--[[ a comment ]]', 'lua'],
  ])('uses a decisive signal for %s', (src, language) => {
    expect(detectLanguage(src)).toEqual({ language, confidence: 1 })
  })

  it('accepts an array of lines', () => {
    expect(detectLanguage(['const a = 1', 'console.log(a)'])?.language).toBe('javascript')
  })

  it('returns null for empty input and plain prose', () => {
    expect(detectLanguage('')).toBeNull()
    expect(detectLanguage('   \n\t ')).toBeNull()
    expect(detectLanguage('hello there, this is just a sentence.')).toBeNull()
    expect(detectLanguage('echo hello')).toBeNull() // one weak signal is not enough
  })

  it('recognises JSON objects and arrays', () => {
    expect(detectLanguage('{"name":"glowglow"}')?.language).toBe('json')
    expect(detectLanguage('[1, 2, 3]')?.language).toBe('json')
    expect(detectLanguage('{ not: "json" }')).toBeNull()
  })

  it('reports a confidence between 0 and 1', () => {
    const guess = detectLanguage(sample('typescript.ts'))
    expect(guess).not.toBeNull()
    expect(guess!.confidence).toBeGreaterThan(0)
    expect(guess!.confidence).toBeLessThanOrEqual(1)
  })
})
