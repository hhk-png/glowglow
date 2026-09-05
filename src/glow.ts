// Glow: CSS-first, language-agnostic syntax highlighting.
// Forked from nuejs/nue nue-glow (index.js) and ported to TypeScript.
// The rendering logic is kept verbatim to preserve byte-for-byte output parity.

const MIXED_HTML = ['html', 'jsx', 'php', 'astro', 'dhtml', 'vue', 'svelte', 'hb']
const LINE_COMMENT: Record<string, string> = { clojure: ';;', lua: '--', python: '#' }
const PREFIXES: Record<string, string> = { '+': 'ins', '-': 'del', '>': 'dfn' }
const MARK = /(••?)([^•]+)\1/g // ALT + q
const NL = '\n'

const COMMON_WORDS = 'null|true|false|undefined|import|from|async|await|package|begin|interface|class|new|int|func|function|get|set|export|default|const|var|let|return|yield|for|while|defer|if|then|else|elif|fi|int|string|number|def|public|static|void|continue|break|switch|case|final|finally|try|catch|while|super|long|float|throw|fun|val|use|fn|my|end|local|until|next|bool|ns|defn|puts|require|each'

// Implement most~50% of words to cover 95% of cases
const SPECIAL_WORDS: Record<string, string> = {
  cpp: 'cout|cin|using|namespace',
  python: 'None|nonlocal|lambda',
  go: 'chan|fallthrough',
}

interface GlowRule {
  tag: string
  re: RegExp
  lang?: string[]
  shift?: boolean
  is_string?: boolean
}

// special rules (growing list)
const RULES: Record<string, GlowRule[]> = {
  css: [
    { tag: 'strong', re: /#[0-9a-f]{3,7}/gi },
    { tag: 'label', re: /!important/gi },
    { tag: 'em', re: /--[\w\d\-]+/gi },
  ],

  json: [{ tag: 'b', re: /(".+"):/gi }],
  yaml: [{ tag: 'b', re: /([\w ]+):/gi }],
}

const HTML_TAGS: GlowRule[] = [
  // line comment
  { tag: 'sup', re: /# .+/ },

  { tag: 'label', re: /\[([a-z\-]+)/g, lang: ['md', 'toml'], shift: true },

  // string value (keep second on the list)
  { tag: 'em', re: /'[^']*'|"[^"]*"/g, is_string: true },

  // HTML tag name
  { tag: 'strong', re: /<([\w\-]+ )/g, shift: true, lang: MIXED_HTML },
  { tag: 'strong', re: /<\/?([\w\-]+)>/g, shift: true, lang: MIXED_HTML },

  // ALL CAPS (constants)
  // { tag: 'b', re: /\b[A-Z]{2,}\b/g },

  // @special
  { tag: 'label', re: /\B@[\w\-]+/gi },

  // char
  { tag: 'i', re: /[^\w •]/g },

  // variable name
  { tag: 'b', re: /\b([a-z][\w\-]+)\s*[:=\(!\[]/gi },

  // property name
  { tag: 'b', re: /"\w+":/g },

  // function name
  { tag: 'b', re: /([\w]+)\(/gi },

  // numeric value
  { tag: 'em', re: /\b\d+\.?[%\w\b]*/g },

  // variable name
  { tag: 'b', re: /([\w]+)\./g, lang: ['js'] },
]

interface Token extends GlowRule {
  start: number
  end: number
}

function getTags(lang?: string): GlowRule[] {
  const tags = HTML_TAGS.filter(el => !el.lang || (el.lang as string[]).includes(lang as string))

  // custom keywords
  if (!['yaml', 'html', 'json'].includes(lang as string)) {
    const w = SPECIAL_WORDS[lang as string]
    const words = (w ? w + '|' : '') + COMMON_WORDS
    const re = new RegExp(`\\b(${words})\\b`, 'gi')
    tags.splice(4, 0, { tag: 'strong', re })
  }

  // custom rules
  const rules = RULES[lang as string]
  if (rules) tags.unshift(...rules)

  return tags
}

function encode(str: string): string {
  return str.replaceAll('<', '&lt;').replaceAll('>', '&gt;')
}

// wrap token
function elem(name: string, str: string): string {
  if (str == '<') str = '&lt;'
  else if (str == '>') str = '&gt;'
  return `<${name}>${str}</${name}>`
}

/*
  Markdown/MDX requires a special treatment, because it's so
  different from others (not a programming language)
*/
function isMD(lang?: string): boolean {
  return ['md', 'mdx', 'nuemark'].includes(lang as string)
}

function getMDTags(str: string): GlowRule[] {
  const s = str.trim()
  const c = s[0]

  // divider
  if (s.startsWith('---')) return [{ tag: 'i', re: /-+/ }]

  // line comment
  if (s.startsWith('// ')) return [{ tag: 'sup', re: /.+/ }]

  if (['![', '[!'].includes(s.slice(0, 2))) return [{ tag: 'em', re: /.+/ }]

  if (['import', 'export'].includes(s.slice(0, 6))) return getTags('js')

  // HTML
  if (c == '<') return getTags('html')

  // heading
  if (c == '#') return [{ tag: 'label', re: /.+/ }]

  // quote
  if (c == '>') return [{ tag: 'i', re: />/ }, { tag: 'sup', re: / .+/ }]

  // front matter / yaml
  if (/^\w+: /.exec(s)) return getTags('yaml')

  // component
  if (c == '[' && s.endsWith(']')) {
    return s[1] == '.' ? [{ tag: 'label', re: /\w+/g }] : getTags('md')
  }

  // lists, links, images, fenced code
  return [
    // inline code
    { tag: 'strong', re: /\`.+\`/g },

    // image
    { tag: 'em', re: /^(!.+)/g, shift: true },

    // list
    { tag: 'b', re: /[\*\_\[\]\(\)<>]+/g },
  ]
}

export function parseRow(row: string, lang?: string): Token[] {
  const tags = isMD(lang) ? getMDTags(row) : getTags(lang)
  const tokens: Token[] = []

  // line comment (language specific)
  const re = new RegExp(`${LINE_COMMENT[lang as string] || '//'} .+`)
  tags.unshift({ tag: 'sup', re })

  for (const el of tags) {
    const { re, shift } = el

    row.replace(re, (...args: any[]) => {
      let match: any = args[0]
      let start: any = args[1]
      const n: any = args[2]

      if (args.length == 4) {
        const more = shift ? match.indexOf(start) : 0
        match = start
        start = n + more
      }

      const end = start + match.length
      tokens.push({ start, end, ...el })
      // replacement string is discarded; returning the original match is a no-op
      return args[0]
    })
  }
  return tokens.sort((a, b) => a.start - b.start)
}

function renderString(str: string): string {
  return encode(str).replace(/\$?\{([^\}]+)\}/g, function (_, content) {
    return elem('i', _.replace(content, elem('b', content)))
  })
}

// exported for testing purposes
export function renderRow(row: string, lang?: string, mark = true): string {
  if (!row) return ''

  const els = parseRow(row, lang)
  const ret: string[] = []
  let index = 0

  for (let i = 0, max = 0; i < els.length; i++) {
    const el = els[i]!
    const { start, end } = el
    const next: any = els[i + 1] || []

    // skip overlappings
    if (start < max) continue
    if (start == next[0] && next[1] > end) continue
    if (end > max) max = end
    else continue

    // construct final result
    ret.push(row.substring(index, start))
    const code = row.substring(start, end)
    ret.push(elem(el.tag, el.is_string ? renderString(code) : code))

    index = end
  }

  ret.push(row.substring(index))
  const res = ret.join('')

  return !mark ? res : res.replace(MARK, (_: any, marker: any, content: any) => {
    return elem(marker[1] ? 'u' : 'mark', content)
  })
}

// comment start & end
const COMMENT: [RegExp, RegExp] = [/(\/\* |^ *{# |<!--|'''|=begin)/, /(\*\/|#}|-->|'''|=end)$/]

export interface LineBlock {
  line?: string
  wrap?: string | false | null
  comment?: string[]
}

export function parseSyntax(lines: string[], lang?: string, prefix = true): LineBlock[] {
  const [comm_start, comm_end] = COMMENT
  const html: LineBlock[] = []

  // multi-line comment
  let comment: string[] | null

  function endComment() {
    html.push({ comment: comment! })
    comment = null
  }

  lines.forEach((line, i) => {
    if (!comment) {
      if (comm_start.test(line)) {
        comment = [line]
        if (comm_end.test(line) && line?.trim() != "'''") endComment()
      } else {
        // highlighted line
        const is_md = isMD(lang)
        const c = line[0]
        let wrap: string | false | null = prefix && (is_md ? (c == '|' && 'dfn') : PREFIXES[c]) as string | false
        if (wrap && is_md && line == '---') wrap = null
        if (wrap) line = (line[1] == ' ' ? ' ' : '') + line.slice(1)

        // escape character
        if (prefix && c == '\\') line = line.slice(1)

        html.push({ line, wrap })
      }
    } else {
      comment.push(line)
      if (comm_end.test(line)) endComment()
    }
  })

  return html
}

export interface GlowOptions {
  language?: string
  numbered?: boolean
  prefix?: boolean
  mark?: boolean
}

// code, { language: 'js', numbered: true }
export function glow(str: string | string[], opts: GlowOptions | string = { prefix: true, mark: true }): string {
  const options: GlowOptions = typeof opts == 'string' ? { language: opts } : opts
  const lines = Array.isArray(str) ? str : str.trim().split(/\r?\n/)

  if (!lines[0]) return ''

  // language
  let lang = options.language
  if (!lang && lines[0][0] == '<') lang = 'html'
  const html: string[] = []

  function push(line: string) {
    html.push(options.numbered ? elem('span', line) : line)
  }

  parseSyntax(lines, lang, options.prefix).forEach(function (block) {
    let { line, comment, wrap } = block

    // EOL comment
    if (comment) {
      return comment.forEach(el => push(elem('sup', encode(el))))
    } else {
      line = renderRow(line as string, lang, options.mark)
    }

    if (wrap) line = elem(wrap, line)
    push(line)
  })

  return `<code language="${lang || '*'}">${html.join(NL)}</code>`
}
