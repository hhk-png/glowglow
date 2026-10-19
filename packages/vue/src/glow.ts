import type { PropType } from 'vue'
import { glowInner } from '@glowglow/core'
import { defineComponent, h } from 'vue'

/**
 * Renders highlighted source as semantic HTML. `innerHTML` is produced during
 * render on both the server and the client, so SSR and hydration match.
 */
export const Glow = defineComponent({
  name: 'Glow',
  inheritAttrs: false,
  props: {
    /** Source to highlight. */
    code: {
      type: [String, Array] as PropType<string | readonly string[]>,
      required: true,
    },
    /** Written to the element as `language="…"`; metadata only. */
    language: {
      type: String,
      default: undefined,
    },
    /** Wrap each line in `<span class="glow-line">` for numbering. */
    numbered: {
      type: Boolean,
      default: false,
    },
    /** Element to render. Defaults to `code`. */
    as: {
      type: String,
      default: 'code',
    },
  },
  setup(props, { attrs }) {
    return () => {
      const data: Record<string, unknown> = {
        ...attrs,
        innerHTML: glowInner(props.code, { numbered: props.numbered }),
      }
      if (props.language)
        data.language = props.language
      return h(props.as, data)
    }
  },
})
