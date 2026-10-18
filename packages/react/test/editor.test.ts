// @vitest-environment happy-dom

import type { RefObject } from 'react'
import type { GlowEditorHandle, GlowEditorProps } from '../src'
import { createElement, createRef } from 'react'
import { createRoot } from 'react-dom/client'
import { renderToStaticMarkup } from 'react-dom/server'
import { act } from 'react-dom/test-utils'
import { afterEach, describe, expect, it } from 'vitest'
import { GlowEditor } from '../src'

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

interface Mounted {
  container: HTMLElement
  ref: RefObject<GlowEditorHandle>
  render: (props: GlowEditorProps) => void
  unmount: () => void
}

const cleanups: Array<() => void> = []

afterEach(() => {
  for (const cleanup of cleanups.splice(0))
    cleanup()
})

function mount(props: GlowEditorProps): Mounted {
  const container = document.createElement('div')
  document.body.append(container)
  const root = createRoot(container)
  const ref = createRef<GlowEditorHandle>()
  const render = (next: GlowEditorProps): void => {
    act(() => {
      root.render(createElement(GlowEditor, { ...next, ref }))
    })
  }
  const unmount = (): void => {
    act(() => {
      root.unmount()
    })
    container.remove()
  }

  render(props)
  cleanups.push(unmount)
  return { container, ref, render, unmount }
}

function pointAt(el: HTMLElement, offset: number): { node: Node, offset: number } {
  let remaining = offset
  for (const row of Array.from(el.children) as HTMLElement[]) {
    const text = row.textContent ?? ''
    if (remaining <= text.length) {
      const walker = document.createTreeWalker(row, 4 /* SHOW_TEXT */)
      let node = walker.nextNode() as Text | null
      while (node) {
        if (remaining <= node.data.length)
          return { node, offset: remaining }
        remaining -= node.data.length
        node = walker.nextNode() as Text | null
      }
      return { node: row, offset: 0 }
    }
    remaining -= text.length + 1
  }
  return { node: el, offset: 0 }
}

function rangeAt(el: HTMLElement, from: number, to = from): Range {
  const start = pointAt(el, from)
  const end = pointAt(el, to)
  const range = document.createRange()
  range.setStart(start.node, start.offset)
  range.setEnd(end.node, end.offset)
  return range
}

function beforeInput(el: HTMLElement, data: string, range: Range): void {
  const event = new Event('beforeinput', { cancelable: true }) as Event & {
    data: string
    getTargetRanges: () => Range[]
    inputType: string
  }
  event.inputType = 'insertText'
  event.data = data
  event.getTargetRanges = () => [range]
  el.dispatchEvent(event)
}

describe('glowEditor', () => {
  it('renders an empty pre on the server', () => {
    const html = renderToStaticMarkup(createElement(GlowEditor, { value: 'x' }))
    expect(html).toBe('<pre></pre>')
  })

  it('mounts, exposes the handle and syncs value changes', () => {
    const { container, ref, render } = mount({ value: 'const a = 1' })
    const pre = container.querySelector('pre')!

    expect(pre.getAttribute('contenteditable')).toBe('plaintext-only')
    expect(pre.textContent).toContain('const a = 1')
    expect(ref.current?.element).toBe(pre)
    expect(ref.current?.value).toBe('const a = 1')
    expect(ref.current?.document?.lineCount).toBe(1)
    expect(ref.current?.folds).toEqual([])

    render({ value: 'let b = 2' })
    expect(ref.current?.value).toBe('let b = 2')
    expect(pre.textContent).toContain('let b = 2')
  })

  it('reports edits through onChange', () => {
    const changes: string[] = []
    const { container } = mount({
      value: 'const a = 1',
      onChange: value => changes.push(value),
    })
    const pre = container.querySelector('pre')!

    act(() => {
      beforeInput(pre, 'X', rangeAt(pre, 5))
    })

    expect(changes.at(-1)).toBe('constX a = 1')
    expect(pre.textContent).toContain('constX a = 1')
  })

  it('exposes marks, folds and focus', () => {
    const { container, ref } = mount({ value: 'const a = 1' })
    const pre = container.querySelector('pre')!

    ref.current?.setValue('let b = 2')
    expect(ref.current?.value).toBe('let b = 2')
    expect(pre.textContent).toContain('let b = 2')

    ref.current?.setMarks([{ from: 0, to: 3, cls: 'hit' }])
    expect(pre.innerHTML).toContain('class="hit"')

    ref.current?.setFolds([])
    expect(ref.current?.folds).toEqual([])

    ref.current?.focus()
    expect(document.activeElement).toBe(pre)
  })

  it('reports fold marker clicks', () => {
    const lines: number[] = []
    const { container, ref } = mount({
      value: 'a\nb\nc',
      onFoldToggle: line => lines.push(line),
    })

    ref.current?.setFolds([{ from: 0, to: 2 }])
    container.querySelector('.glow-fold')!.dispatchEvent(new MouseEvent('click', { bubbles: true }))

    expect(lines).toEqual([0])
  })

  it('calls onReady after mounting', () => {
    let ready = 0
    mount({
      value: 'x',
      onReady: () => {
        ready++
      },
    })
    expect(ready).toBe(1)
  })

  it('destroys the editor on unmount', () => {
    const { container, unmount } = mount({ value: 'x' })
    const pre = container.querySelector('pre')!

    unmount()
    expect(pre.getAttribute('contenteditable')).toBeNull()
    expect(container.childElementCount).toBe(0)
  })
})
