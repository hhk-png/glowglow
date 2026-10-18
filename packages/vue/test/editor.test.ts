// @vitest-environment happy-dom

import type { Ref } from 'vue'
import type { GlowEditorHandle } from '../src'
import { afterEach, describe, expect, it } from 'vitest'
import { createApp, createSSRApp, h, nextTick, ref } from 'vue'
import { renderToString } from 'vue/server-renderer'
import { GlowEditor } from '../src'

interface EditorProps {
  value?: string
  numbered?: boolean
  indent?: string
  onChange?: (value: string) => void
  onFoldToggle?: (line: number) => void
  onReady?: (editor: GlowEditorHandle) => void
}

interface Mounted {
  container: HTMLElement
  handle: Ref<GlowEditorHandle | null>
  unmount: () => void
}

const cleanups: Array<() => void> = []

afterEach(() => {
  for (const cleanup of cleanups.splice(0))
    cleanup()
})

async function mount(props: EditorProps): Promise<Mounted> {
  const container = document.createElement('div')
  document.body.append(container)
  // Vue types a component ref as its public instance; the exposed API is
  // reached through that instance, so the handle is cast at the boundary.
  const instance = ref<InstanceType<typeof GlowEditor> | null>(null)
  const app = createApp({
    render: () => h(GlowEditor, { ...props, ref: instance }),
  })
  app.mount(container)
  await nextTick()
  const unmount = (): void => {
    app.unmount()
    container.remove()
  }
  cleanups.push(unmount)
  return { container, handle: instance as unknown as Ref<GlowEditorHandle | null>, unmount }
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
  it('renders an empty pre on the server', async () => {
    const html = await renderToString(createSSRApp({
      render: () => h(GlowEditor, { value: 'x' }),
    }))
    expect(html).toContain('<pre')
    expect(html).not.toContain('contenteditable')
  })

  it('mounts, exposes the handle and syncs value changes', async () => {
    const value = ref('const a = 1')
    const instance = ref<InstanceType<typeof GlowEditor> | null>(null)
    const container = document.createElement('div')
    document.body.append(container)
    const app = createApp({
      render: () => h(GlowEditor, { ref: instance, value: value.value }),
    })
    app.mount(container)
    await nextTick()

    const handle = instance.value as unknown as GlowEditorHandle
    const pre = container.querySelector('pre')!
    expect(pre.getAttribute('contenteditable')).toBe('plaintext-only')
    expect(pre.textContent).toContain('const a = 1')
    expect(handle.element).toBe(pre)
    expect(handle.value).toBe('const a = 1')
    expect(handle.document?.lineCount).toBe(1)
    expect(handle.folds).toEqual([])

    value.value = 'let b = 2'
    await nextTick()
    expect(handle.value).toBe('let b = 2')
    expect(pre.textContent).toContain('let b = 2')

    app.unmount()
    container.remove()
  })

  it('emits change for edits', async () => {
    const changes: string[] = []
    const { container } = await mount({
      value: 'const a = 1',
      onChange: value => changes.push(value),
    })
    const pre = container.querySelector('pre')!

    beforeInput(pre, 'X', rangeAt(pre, 5))

    expect(changes.at(-1)).toBe('constX a = 1')
    expect(pre.textContent).toContain('constX a = 1')
  })

  it('emits ready with the mounted editor', async () => {
    const ready: GlowEditorHandle[] = []
    await mount({
      value: 'x',
      onReady: editor => ready.push(editor),
    })
    expect(ready).toHaveLength(1)
    expect(ready[0]?.value).toBe('x')
  })

  it('emits fold-toggle when a marker is clicked', async () => {
    const lines: number[] = []
    const { container, handle } = await mount({
      value: 'a\nb\nc',
      onFoldToggle: line => lines.push(line),
    })

    handle.value?.setFolds([{ from: 0, to: 2 }])
    await nextTick()
    container.querySelector('.glow-fold')!.dispatchEvent(new MouseEvent('click', { bubbles: true }))

    expect(lines).toEqual([0])
  })

  it('exposes marks, folds and focus', async () => {
    const { container, handle } = await mount({ value: 'const a = 1' })
    const pre = container.querySelector('pre')!

    handle.value?.setValue('let b = 2')
    expect(handle.value?.value).toBe('let b = 2')
    expect(pre.textContent).toContain('let b = 2')

    handle.value?.setMarks([{ from: 0, to: 3, cls: 'hit' }])
    expect(pre.innerHTML).toContain('class="hit"')

    handle.value?.setFolds([])
    expect(handle.value?.folds).toEqual([])

    handle.value?.focus()
    expect(document.activeElement).toBe(pre)
  })

  it('destroys the editor on unmount', async () => {
    const { container, unmount } = await mount({ value: 'x' })
    const pre = container.querySelector('pre')!

    unmount()
    expect(pre.getAttribute('contenteditable')).toBeNull()
    expect(container.childElementCount).toBe(0)
  })
})
