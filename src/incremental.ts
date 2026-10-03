/*
  The lower-level half of glowglow, for building tools that are not a plain
  editor: a token-level renderer, a minimap, semantic search, a custom patch
  application.

    glowglow            one-shot `glow()` plus `glowDocument()`
    glowglow/incremental  the same engine, taken apart
    glowglow/dom          one editor built on `glowDocument()`

  These are the parts `glowDocument()` is assembled from, so they are more
  coupled to the implementation than the public entry points are: the shapes
  here can change in a minor release. Everything is DOM-free.
*/

// --- colouring: tokens in, colour tags out ----------------------------------
export {
  classify,
  classifyWindow,
  countNames,
  decideRegions,
  detectRegions,
} from './classify'
export type {
  ClassifiedToken,
  NameCounts,
  Region,
  SourceText,
} from './classify'

// --- the document the editor drives -----------------------------------------
export { GlowDocument, glowDocument, sameState } from './document'
export type { GlowPatch } from './document'

// --- folding: which lines a renderer draws ----------------------------------
export { foldMap, shiftFolds } from './fold'
export type { GlowFold, GlowFoldMap } from './fold'

// --- lexing: resumable, one segment at a time -------------------------------
export { lex, lexSegment, tokenText } from './lexer'
export type { Frame, Kind, LexRun, LexState, Token } from './lexer'

// --- rendering: a line's tokens to a line's markup --------------------------
export { esc, renderLine } from './render'
export type { GlowMark, RenderToken } from './render'
