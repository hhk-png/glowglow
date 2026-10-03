// A single self-contained browser bundle for the live-editor preview.
//
// preview/editor.html is opened straight from disk, and browsers refuse to load
// ES modules over file:// — so this is built as one classic IIFE script that
// puts everything on `window.glowglow`.
export { mountGlowEditor } from '../src/dom'
export { glow, glowDocument, glowInner, glowSource } from '../src/index'
// the lower-level pieces the demos reach for too
export { foldMap } from '../src/fold'
