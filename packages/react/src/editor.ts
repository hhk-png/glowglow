import type { GlowMark } from 'glowglow'
import type { GlowEditorOptions, GlowEditor as MountedGlowEditor } from 'glowglow/dom'
import type { GlowDocument, GlowFold } from 'glowglow/incremental'
import type { HTMLAttributes } from 'react'
import { mountGlowEditor } from 'glowglow/dom'
import { createElement, forwardRef, useEffect, useImperativeHandle, useRef } from 'react'

/** What a React ref receives after the editor mounts. */
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

export interface GlowEditorProps
  extends Omit<HTMLAttributes<HTMLPreElement>, 'children' | 'dangerouslySetInnerHTML' | 'onChange'>,
  GlowEditorOptions {
  /**
   * Called once the editor is mounted. React StrictMode mounts effects twice in
   * development, so this can fire twice there.
   */
  onReady?: (editor: GlowEditorHandle) => void
}

function handleOf(editor: () => MountedGlowEditor | null, fallback: string): GlowEditorHandle {
  return {
    get element() {
      return editor()?.element ?? null
    },
    get document() {
      return editor()?.document ?? null
    },
    get value() {
      return editor()?.value ?? fallback
    },
    get folds() {
      return editor()?.folds ?? []
    },
    setValue: value => editor()?.setValue(value),
    setMarks: marks => editor()?.setMarks(marks),
    setFolds: folds => editor()?.setFolds(folds),
    focus: () => editor()?.element.focus(),
  }
}

/**
 * A contenteditable code editor. `value` is the initial text and also syncs
 * later changes; `numbered` and `indent` are initial-only (use a new `key` to
 * change them). SSR renders an empty `<pre>`; the editor mounts on the client.
 */
export const GlowEditor = forwardRef<GlowEditorHandle, GlowEditorProps>((
  { value, numbered = false, indent, onChange, onFoldToggle, onReady, ...rest },
  ref,
) => {
  const hostRef = useRef<HTMLPreElement | null>(null)
  const editorRef = useRef<MountedGlowEditor | null>(null)
  const initialRef = useRef({ indent, numbered, value })
  const callbacksRef = useRef({ onChange, onFoldToggle, onReady })

  useEffect(() => {
    callbacksRef.current = { onChange, onFoldToggle, onReady }
  }, [onChange, onFoldToggle, onReady])

  useEffect(() => {
    const host = hostRef.current
    if (!host)
      return

    const editor = mountGlowEditor(host, {
      value: initialRef.current.value,
      numbered: initialRef.current.numbered,
      indent: initialRef.current.indent,
      onChange: text => callbacksRef.current.onChange?.(text),
      onFoldToggle: line => callbacksRef.current.onFoldToggle?.(line),
    })
    editorRef.current = editor
    callbacksRef.current.onReady?.(handleOf(() => editorRef.current, initialRef.current.value ?? ''))

    return () => {
      editor.destroy()
      editorRef.current = null
    }
  }, [])

  useEffect(() => {
    const editor = editorRef.current
    if (editor && value !== undefined && editor.value !== value)
      editor.setValue(value)
  }, [value])

  useImperativeHandle(
    ref,
    () => handleOf(() => editorRef.current, value ?? ''),
    [value],
  )

  return createElement('pre', { ...rest, ref: hostRef })
})

GlowEditor.displayName = 'GlowEditor'
