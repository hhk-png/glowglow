import type { GlowMark } from 'glowglow'
import type { GlowEditor as MountedGlowEditor } from 'glowglow/dom'
import type { GlowDocument, GlowFold } from 'glowglow/incremental'
import { mountGlowEditor } from 'glowglow/dom'
import { defineComponent, h, onBeforeUnmount, onMounted, shallowRef, watch } from 'vue'

/** What a template ref receives after the editor mounts. */
export interface GlowEditorHandle {
  readonly element: HTMLElement | null
  readonly document: GlowDocument | null
  readonly value: string
  readonly folds: readonly GlowFold[]
  setValue: (value: string) => void
  setMarks: (marks: readonly GlowMark[]) => void
  setFolds: (folds: readonly GlowFold[]) => void
  focus: () => void
}

/**
 * A contenteditable code editor. `value` is the initial text and also syncs
 * later changes; `numbered` and `indent` are initial-only (use a new `key` to
 * change them). SSR renders an empty `<pre>`; the editor mounts on the client.
 */
export const GlowEditor = defineComponent({
  name: 'GlowEditor',
  inheritAttrs: false,
  props: {
    value: {
      type: String,
      default: undefined,
    },
    numbered: {
      type: Boolean,
      default: false,
    },
    indent: {
      type: String,
      default: undefined,
    },
  },
  emits: {
    'change': (value: string) => typeof value === 'string',
    'fold-toggle': (line: number) => typeof line === 'number',
    'ready': (editor: GlowEditorHandle) => !!editor,
  },
  setup(props, { attrs, emit, expose }) {
    const host = shallowRef<HTMLPreElement | null>(null)
    const editor = shallowRef<MountedGlowEditor | null>(null)

    const handle: GlowEditorHandle = {
      get element() {
        return editor.value?.element ?? null
      },
      get document() {
        return editor.value?.document ?? null
      },
      get value() {
        return editor.value?.value ?? props.value ?? ''
      },
      get folds() {
        return editor.value?.folds ?? []
      },
      setValue: value => editor.value?.setValue(value),
      setMarks: marks => editor.value?.setMarks(marks),
      setFolds: folds => editor.value?.setFolds(folds),
      focus: () => editor.value?.element.focus(),
    }

    expose(handle)

    onMounted(() => {
      if (!host.value)
        return
      editor.value = mountGlowEditor(host.value, {
        value: props.value,
        numbered: props.numbered,
        indent: props.indent,
        onChange: value => emit('change', value),
        onFoldToggle: line => emit('fold-toggle', line),
      })
      emit('ready', handle)
    })

    watch(() => props.value, (value) => {
      const instance = editor.value
      if (instance && value !== undefined && instance.value !== value)
        instance.setValue(value)
    })

    onBeforeUnmount(() => {
      editor.value?.destroy()
      editor.value = null
    })

    return () => h('pre', { ...attrs, ref: host })
  },
})
