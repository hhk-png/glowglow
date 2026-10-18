// glowglow needs no language hint — strings, templates, comments just work.
import { readFile } from 'node:fs/promises'

const title = "Hello, world"
const n = 0xFF + 1_000 + 0b11

function greet(name, { loud = false } = {}) {
  const msg = `hi ${name}, you have ${n} points`
  return loud ? msg.toUpperCase() : msg
}

const users = [{ name: 'ana' }, { name: 'bob' }]
const first = users?.[0]?.name ?? 'nobody'
const total = users.reduce((sum, u) => sum + u.name.length, 0)

// async/await + errors + object spread
async function load(url) {
  try {
    const res = await fetch(url) // network call
    const data = await res.json()
    const meta = { ...data, cached: false, tags: ['a', 'b'] }
    return meta
  } catch (err) {
    console.error(`failed: ${err}`)
  }
}

/* multi-line
   block comment */
export { greet, load }
