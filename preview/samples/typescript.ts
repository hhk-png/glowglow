/* TypeScript kitchen-sink sample for the glowglow highlighter demo */

// import forms
import fs, { readFile, promises as fsp } from 'node:fs'
import type { Readable } from 'node:stream'
import data from './data.json' with { type: 'json' }
export * as utils from './utils.js'

// basic types
const num: number = 1
const big: bigint = 1n
const sym: symbol = Symbol('s')
let str: string = 'text'
let template = `interpolate ${num} and ${str}`
const bool: boolean = true

// literal & union types
type Primitive = string | number | boolean | null | undefined
type Status = 'idle' | 'loading' | 'done'
type Color = 1 | 2 | 3

// interface + generics
interface Point { x: number; y: number }
interface Named<T = string> { name: T }
interface Employee extends Point, Named { id: string }

// mapped / conditional / template-literal types
type DeepReadonly<T> = { readonly [K in keyof T]: DeepReadonly<T[K]> }
type Getters<T> = { [K in keyof T as `get${Capitalize<K & string>}`]: () => T[K] }
type IsNever<T> = [T] extends [never] ? true : false
type Unwrap<T> = T extends Promise<infer U> ? Unwrap<U> : T
type Greet<T extends string> = `hello ${T}`
type Route = `/user/${string}/post/${number}`

// enums & namespaces
enum Direction { Up, Down, Left = 10, Right = 'right' }
const enum Pixel { None = 0, One = 1 }
namespace MyNS { export const v = 1; export interface Inner { x: number } }

// assertions, narrowing, type predicates
declare const some: unknown
function isString(x: unknown): x is string { return typeof x === 'string' }
function assertNumber(x: unknown): asserts x is number { if (typeof x !== 'number') throw new Error() }
if (isString(some)) some.trim()

// functions: overloads, generics, destructuring, this
function combine(a: string, b: string): string
function combine(a: number, b: number): number
function combine(a: unknown, b: unknown): unknown { return (a as any) + (b as any) }

const pick = <T,>(list: readonly T[], index: number): T | undefined => list[index]
async function fetchAll<T>(...urls: string[]): Promise<Awaited<T>[]> {
  return (await Promise.all(urls.map(u => fetch(u)))).map(r => r.json())
}

// class: decorators, static, #private, accessor, get/set, generics
@sealed
class Service<D = Record<string, never>> extends BaseService implements Runnable {
  #secret = 'hidden'
  static instances: number = 0
  public readonly name: string
  protected accessor cache = new Map<string, unknown>()

  constructor(private data: D, public version = '1.0') { super() }

  async run(...args: unknown[]): Promise<void> {
    const { a, b = 2, ...rest } = this.data as Record<string, any>
    for (const [k, v] of Object.entries(rest)) {
      if (k.startsWith('_')) continue
      void a; void b; void v
    }
    console.log(...args)
  }

  override toString() { return this.name }
  get id() { return `${this.name}:${this.version}` }
  set id(_v: string) {}
  get [Symbol.toStringTag]() { return 'Service' }
}

// abstract classes
abstract class Animal { abstract speak(): void; move(): void {} }
class Dog extends Animal { override speak(): void {} }

// control flow with labeled loops + switch
outer: for (const it of items) {
  if (it.skip) continue
  if (it.stop) break outer
  switch (it.type) {
    case 'a': { const a = it; break }
    default: throw new Error('bad')
  }
}
try { await risky() } catch (err) { console.error(err) } finally { cleanup() }

// modern runtime: optional chaining, nullish coalescing, as const, satisfies
const conf = { port: 3000 } satisfies Partial<Config>
const cfg = Object.freeze({ mode: 'fast' as const })
let res = (await fetchData())?.result?.data ?? fallback

// destructuring rest/spread & explicit resource management
const [head, ...tail] = list
const { a, b = 2, ...rest2 } = obj
using handle = openResource()
await using stream = getStream()
