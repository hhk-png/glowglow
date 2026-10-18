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
  classifyTokens,
  classifyTokenWindow,
  countTagNames,
  findTagCandidates,
  selectMarkupRegions,
} from './classify'
export type {
  SourceText,
  TaggedToken,
  TagNameCounts,
  TagRegion,
} from './classify'

// --- the document the editor drives -----------------------------------------
export { GlowDocument, glowDocument, sameLexState } from './document'
export type { GlowPatch } from './document'

// --- folding: which lines a renderer draws ----------------------------------
export { buildFoldMap, shiftFolds } from './fold'
export type { GlowFold, GlowFoldMap } from './fold'

// --- lexing: resumable, one segment at a time -------------------------------
export { lex, lexSegment, tokenText } from './lexer'
export type { LexFrame, LexSegmentResult, LexState, Token, TokenKind } from './lexer'

// --- rendering: a line's tokens to a line's markup --------------------------
export { escapeHtml, renderLine } from './render'
export type { GlowMark, RenderToken } from './render'
