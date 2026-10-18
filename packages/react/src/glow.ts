import type { HTMLAttributes } from 'react'
import { glowInner } from 'glowglow'
import { createElement, forwardRef, useMemo } from 'react'

export interface GlowProps extends Omit<HTMLAttributes<HTMLElement>, 'children' | 'dangerouslySetInnerHTML'> {
  /** Source to highlight. */
  code: string | readonly string[]
  /** Written to the element as `language="…"`; metadata only, never read by the engine. */
  language?: string
  /** Wrap each line in `<span class="glow-line">` for css/syntax.css numbering. */
  numbered?: boolean
  /** Element to render. Defaults to `code`. */
  as?: string
}

/**
 * Renders highlighted source as semantic HTML. No DOM access happens during
 * render, so this is safe to use in server rendering and hydration.
 */
export const Glow = forwardRef<HTMLElement, GlowProps>((
  { code, language, numbered = false, as = 'code', ...rest },
  ref,
) => {
  const html = useMemo(() => glowInner(code, { numbered }), [code, numbered])
  return createElement(as, {
    ...rest,
    ref,
    ...(language ? { language } : {}),
    dangerouslySetInnerHTML: { __html: html },
  })
})

Glow.displayName = 'Glow'
