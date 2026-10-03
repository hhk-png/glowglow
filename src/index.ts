export { glowDocument } from './document'
export type { GlowPatch } from './document'
// Public API of glowglow: one one-shot entry point, no language required, plus
// an incremental document for editing code live.
export { glow, glowInner, glowSource } from './glow'
export type { GlowOptions, GlowSource } from './glow'
export type { GlowMark } from './render'
