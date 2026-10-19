# 教程：用 glowglow 构建一个代码编辑器

[English](tutorial.md) | **中文**

这篇教程会一步步实现一个真正可用的代码编辑器：实时语法高亮、行号、折叠、
搜索高亮和小地图；然后把同样的组件拆开，演示怎样构建自己的输入层，以及怎样
为超大文件做虚拟化渲染。

全部代码只使用公开 API。最终成品也以可运行 demo 的形式放在
[`preview/`](../packages/glowglow/preview/) 中。

## 你需要什么

- Node.js ≥ 22.13 和 pnpm（这是本仓库的工具链；发布出去的包本身仍支持 Node ≥ 18）
- 能处理 TypeScript 与 CSS import 的打包器（下面用 Vite）
- 完整实现主编辑器大约需要 15 分钟

```bash
pnpm create vite glow-editor --template vanilla-ts
cd glow-editor
pnpm install
pnpm add @glowglow/core
```

随着教程推进，替换 `src/main.ts` 的内容即可。`index.html` 里保留一个
`<pre id="editor"></pre>`（或者每一步里给出的容器）。

## 第一步 — 五分钟编辑器

`mountGlowEditor()` 会把一个元素变成 `contenteditable` 代码编辑器。它自己持有
文档、输入处理、光标、撤销历史和 patch 应用。

```ts
import { mountGlowEditor } from '@glowglow/core/dom'
import '@glowglow/core/css/editor.css'
import '@glowglow/core/css/syntax.css'

const source = `function greet(name: string) {
  return 'hello ' + name
}

console.log(greet('world'))`

const editor = mountGlowEditor(document.querySelector('#editor')!, {
  value: source,
  numbered: true,
  onChange: text => localStorage.setItem('glowglow:draft', text),
})

editor.element.focus()
```

这已经是一个可用的编辑器：

- 输入时只重新高亮受影响的行；
- patch 不会重建光标和选区周围的节点，所以光标位置和选中内容能保留；
- 粘贴按纯文本处理；
- **Ctrl+Z / Ctrl+Shift+Z / Ctrl+Y** 使用编辑器自己的历史栈；
- **Tab / Shift+Tab** 缩进或反缩进选中行；
- **Esc** 释放焦点，避免 Tab 把键盘困在编辑器里。

### 恢复草稿

挂载前读出保存的文本即可。`value` 是初始文本；文档不会规范化换行符，所以你
存进去什么，拿回来就是什么。

```ts
import { mountGlowEditor } from '@glowglow/core/dom'
import '@glowglow/core/css/editor.css'
import '@glowglow/core/css/syntax.css'

const saved = localStorage.getItem('glowglow:draft')

const editor = mountGlowEditor(document.querySelector('#editor')!, {
  value: saved ?? 'const answer = 42',
  numbered: true,
  onChange: text => localStorage.setItem('glowglow:draft', text),
})

editor.element.focus()
```

## 第二步 — 用自己的规则折叠

折叠是视图层的事情。glowglow 不决定“什么是一个折叠块”；你算出区间，交给
`setFolds()` 即可。

一个简单的、基于 token 的括号匹配器：

```ts
import type { GlowDocument, GlowFold } from '@glowglow/core/incremental'
import { mountGlowEditor } from '@glowglow/core/dom'
import '@glowglow/core/css/editor.css'
import '@glowglow/core/css/syntax.css'

const editor = mountGlowEditor(document.querySelector('#editor')!, {
  value: source,
  numbered: true,
})

function braceFolds(doc: GlowDocument): GlowFold[] {
  const src = doc.value
  const stack: number[] = []
  const folds: GlowFold[] = []

  for (let line = 0; line < doc.lineCount; line++) {
    for (const token of doc.lineTokens(line)) {
      // 只看长度为 1 的运算符，字符串/注释里的花括号是 str/comment token，会被忽略
      if (token.kind !== 'op' || token.end - token.start !== 1)
        continue
      const ch = src[token.start]
      if (ch === '{') {
        stack.push(line)
      }
      else if (ch === '}' && stack.length > 0) {
        const from = stack.pop()!
        if (line > from)
          folds.push({ from, to: line })
      }
    }
  }
  return folds
}

editor.setFolds(braceFolds(editor.document))
```

`from` 行保持可见并承载折叠标记；`from + 1 … to` 行被隐藏。文档本身完全不动，
所以搜索偏移、marks 和编辑都不受影响。

如果提供了 `onFoldToggle(line)`，点击标记时会回调：

```ts
let folds: GlowFold[] = []

const editor = mountGlowEditor(document.querySelector('#editor')!, {
  value: source,
  numbered: true,
  onFoldToggle(line) {
    folds = folds.filter(f => f.from !== line)
    editor.setFolds(folds)
  },
})

folds = braceFolds(editor.document)
editor.setFolds(folds)
```

这段代码能工作是因为回调在 `editor` 初始化完成之后才会执行。想一次性展开全部，
调用 `editor.setFolds([])` 即可。

## 第三步 — 用 marks 标出搜索命中

`setMarks()` 把你自己的区间叠加到渲染结果上。marks 使用绝对文本偏移，和
`Token.start` / `Token.end` 是同一套数字，所以搜索结果和语言服务器诊断可以
直接传进来。

```ts
import type { GlowMark } from '@glowglow/core'
import { mountGlowEditor } from '@glowglow/core/dom'
import { buildFoldMap } from '@glowglow/core/incremental'
import '@glowglow/core/css/editor.css'
import '@glowglow/core/css/syntax.css'

const editor = mountGlowEditor(document.querySelector('#editor')!, {
  value: source,
  numbered: true,
})

function search(query: string): void {
  if (!query) {
    editor.setMarks([])
    return
  }

  const haystack = editor.value.toLowerCase()
  const needle = query.toLowerCase()
  const marks: GlowMark[] = []

  for (
    let at = haystack.indexOf(needle);
    at !== -1;
    at = haystack.indexOf(needle, at + needle.length)
  ) {
    marks.push({ from: at, to: at + needle.length, cls: 'hit' })
  }

  editor.setMarks(marks)

  // 通过折叠映射把第一个命中滚动到视野内
  const first = marks[0]
  if (first) {
    const doc = editor.document
    const row = buildFoldMap(editor.folds, doc.lineCount)
      .rowIndexAt(doc.lineIndexAt(first.from))
    if (row >= 0)
      editor.element.children[row]?.scrollIntoView({ block: 'center' })
  }
}

document.querySelector('#search')!.addEventListener('input', (event) => {
  search((event.target as HTMLInputElement).value)
})
```

给你传入的 class 加上样式：

```css
.glow-editor mark.hit {
  background: #facc1533;
  border-radius: 2px;
}
```

mark 会把落点所在的 token 切开，所以 token 自己的颜色仍然保留在两侧：

```html
<strong><mark class="hit">const</mark></strong>
```

`setMarks()` 会保留光标，因为文本没有移动。区间会自动排序并裁剪；重叠时靠前
的 mark 优先。

## 第四步 — 用文档 API 画小地图

小地图不需要解析渲染后的 HTML。它向文档查询每一行的 token 和标签，然后在
canvas 上画矩形。

```ts
import type { GlowDocument, GlowFold } from '@glowglow/core/incremental'
import { mountGlowEditor } from '@glowglow/core/dom'
import { buildFoldMap } from '@glowglow/core/incremental'
import '@glowglow/core/css/editor.css'
import '@glowglow/core/css/syntax.css'

const COLORS: Record<string, string> = {
  strong: '#419fff',
  b: '#7dd3fc',
  em: '#f472b6',
  i: '#64748b',
  label: '#fff',
  sup: '#6f7a7d',
}

const canvas = document.querySelector('canvas')!

const editor = mountGlowEditor(document.querySelector('#editor')!, {
  value: source,
  numbered: true,
})

function draw(doc: GlowDocument, folds: readonly GlowFold[]): void {
  const ctx = canvas.getContext('2d')
  if (!ctx)
    return

  const map = buildFoldMap(folds, doc.lineCount)
  const ratio = window.devicePixelRatio || 1
  const width = canvas.clientWidth
  const height = canvas.clientHeight
  canvas.width = Math.round(width * ratio)
  canvas.height = Math.round(height * ratio)
  ctx.setTransform(ratio, 0, 0, ratio, 0, 0)
  ctx.clearRect(0, 0, width, height)

  let longest = 1
  for (let line = 0; line < doc.lineCount; line++)
    longest = Math.max(longest, doc.lineText(line).length)

  const rowHeight = height / Math.max(1, map.visibleCount)

  for (let row = 0; row < map.visibleCount; row++) {
    const line = map.lineIndexAt(row)
    const base = doc.lineStart(line)
    const tokens = doc.lineTokens(line)
    const tags = doc.lineTags(line)

    for (let i = 0; i < tokens.length; i++) {
      const token = tokens[i]!
      const tag = tags[i]
      if (!tag)
        continue
      const x = ((token.start - base) / longest) * width
      const w = Math.max(1, ((token.end - token.start) / longest) * width)
      ctx.fillStyle = COLORS[tag] ?? '#a2aab1'
      ctx.fillRect(x, row * rowHeight, w, Math.max(1, rowHeight - 0.5))
    }
  }
}

// 编辑器每次 patch 行元素时重画
const observer = new MutationObserver(() => draw(editor.document, editor.folds))
observer.observe(editor.element, { childList: true, subtree: true, characterData: true })

draw(editor.document, editor.folds)
```

给 canvas 设置 CSS 尺寸，因为绘制代码读取的正是 `clientWidth` 和
`clientHeight`：

```html
<canvas id="minimap" style="display: block; width: 96px; height: 100vh"></canvas>
```

要点：

- `lineTokens(line)` 返回绝对偏移；减去 `lineStart(line)` 得到绘制用的列位置。
- `lineTags(line)` 与 `lineTokens(line)` 平行；`null` 表示纯文本或空白，跳过。
- `buildFoldMap()` 让小地图和折叠保持一致：`row` 是可见行号，
  `lineIndexAt(row)` 是它对应的文档行。

想要带视口框和点击跳转的小地图，见
[`preview/minimap.html`](../packages/glowglow/preview/minimap.html)。

## 第五步 — 构建自己的输入层

`mountGlowLines()` 只负责渲染行和应用 patch，不处理输入。当你需要不同的编辑
表面时就用它：textarea 覆盖层、框架组件，或移动端专用输入。

textarea 覆盖层把光标留在 `<textarea>` 里，下面渲染彩色行，所以重建行元素
永远不会打断选区。

```html
<div class="shell">
  <pre id="view"></pre>
  <textarea id="input" spellcheck="false" autocapitalize="off" autocomplete="off">const answer = 42</textarea>
</div>
```

```css
.shell {
  position: relative;
  height: 100vh;
}

#view,
#input {
  position: absolute;
  inset: 0;
  margin: 0;
  padding: 1em 1.25em;
  font: 14px/1.5 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  tab-size: 2;
  white-space: pre;
  overflow: auto;
}

#view {
  overflow: hidden;
  pointer-events: none;
}

#input {
  color: transparent;
  background: transparent;
  caret-color: #a2aab1;
  resize: none;
}
```

```ts
import { commonEdit, mountGlowLines } from '@glowglow/core/dom'
import '@glowglow/core/css/syntax.css'

const input = document.querySelector('textarea')!
const view = mountGlowLines(document.querySelector('#view')!, {
  value: input.value,
  // textarea 没有行号槽；想要行号就用现成编辑器，或者给两层加相同的左内边距
  numbered: false,
})

input.addEventListener('input', () => {
  const { from, to, insert } = commonEdit(view.document.value, input.value)
  view.apply(view.document.applyEdit(from, to, insert))
})

input.addEventListener('scroll', () => {
  view.element.scrollTop = input.scrollTop
  view.element.scrollLeft = input.scrollLeft
})
```

`commonEdit()` 通过公共前缀/后缀扫描求出新旧文本之间的最小替换。大多数按键
得到的就是用户刚输入的那一个字符，所以文档只会重新 lex 一行。

主题、marks 和 token 颜色都照常工作，因为这里渲染的行和 `mountGlowEditor`
使用的是同一套。

## 第六步 — 虚拟化超大文件

渲染器不必为文档的每一行都创建 DOM 节点。`buildFoldMap()` 给出 行 ↔ 可见 row
的投影，只画视口内的 row 即可。

```html
<div id="scroller" style="height: 100vh; overflow: auto">
  <div id="view" style="position: relative"></div>
</div>
```

```ts
import { buildFoldMap, glowDocument } from '@glowglow/core/incremental'

const doc = glowDocument(source)
const folds = [{ from: 12, to: 30 }]
const map = buildFoldMap(folds, doc.lineCount)

const scroller = document.querySelector('#scroller')!
const host = document.querySelector('#view')!
const rowHeight = 20
const overscan = 8

function drawVirtual(topRow: number, height: number): void {
  const first = Math.max(0, Math.floor(topRow) - overscan)
  const last = Math.min(
    map.visibleCount,
    first + Math.ceil(height / rowHeight) + overscan * 2,
  )

  host.textContent = ''
  host.style.height = `${map.visibleCount * rowHeight}px`

  for (let row = first; row < last; row++) {
    const el = document.createElement('div')
    el.className = 'glow-row'
    el.style.position = 'absolute'
    el.style.top = `${row * rowHeight}px`
    el.style.left = '0'
    el.style.right = '0'
    // lineHtml() 已经完成转义和标签包裹
    el.innerHTML = doc.lineHtml(map.lineIndexAt(row))
    host.append(el)
  }
}

scroller.addEventListener('scroll', () => {
  drawVirtual(scroller.scrollTop / rowHeight, scroller.clientHeight)
})

drawVirtual(0, scroller.clientHeight)
```

`visibleCount` 是要画的 row 数，不是文档行数。被折叠的行根本不会进入 DOM，
`lineIndexAt(row)` 给出该 row 应该画哪一行。

`packages/glowglow/preview/virtual.html` 就是用这个办法处理 100,000 行文件的。

## 经验规则

下面这些是最容易把集成写错的地方。

1. **patch 以整行为单位。** `patch.lines` 替换从 `patch.startLine` 开始的
   `patch.removed` 行。每个可见行保留一个元素。
2. **不要把渲染后的 HTML 当成源码。** `lineHtml()` 是输出；文档的 `value`
   才是唯一事实来源。
3. **偏移都是绝对偏移。** 编辑、marks 和 token 都使用绝对文本偏移；只在绘制
   时换算成列。
4. **尊重 `patch.marks`。** `marks: true` 表示文本没有移动；不要平移折叠这类
   与行号绑定的视图状态。
5. **文档不做规范化。** CRLF 和空行原样保留。`glow()` / `glowInner()` 会做
   规范化，`GlowDocument` 不会。
6. **标签配对是文档级的。** 一个名字只要在文件某处同时有开标签和闭标签，或者
   是已知 HTML 标签，或者自闭合，就会被当作 markup。因此编辑可能触发全量重建。
7. **只给 marks 传可信的元素名。** `GlowMark.cls` 会转义；`GlowMark.tag`
   会直接作为外层元素名使用，不做清洗。
8. **不要在热循环里调用 `doc.value`。** 它会把所有行 join 起来。逐行处理请用
   `lineText()`、`lineTokens()`、`lineTags()`。
9. **字符串和注释里可能出现定界符时，用 token 而不是原始文本来算折叠。**
   `lineTokens()` 已经区分了 `str`、`comment` 和 `op`。

## 下一步

- [API 参考](api.md) — 每个导出的精确签名
- [增量编辑原理](incremental.md) — 为什么只重着色一个窗口，以及何时退回全量重建
- [DOM 层](dom.md) — 挂载选项、折叠、marks 和 sidecar 的更多细节
- [`preview/editor.html`](../packages/glowglow/preview/editor.html) — 带搜索框的编辑器
- [`preview/minimap.html`](../packages/glowglow/preview/minimap.html) — 小地图和视口
- [`preview/virtual.html`](../packages/glowglow/preview/virtual.html) — 100,000 行、可折叠
