/*
  Optional language detection. The highlighter itself never uses this: Glowglow
  is still language-free. This helper exists for labels, icons, editor modes and
  analytics, where knowing the likely language is useful.

  Detection is a weighted evidence table. Every rule lists structural signals —
  keywords, shebangs, type syntax, markup — and the language with the highest
  total weight wins. The first rules are the most specific, so ties resolve
  towards JSON, HTML, CSS and the other formats that would otherwise be mistaken
  for a general-purpose language.
*/

export type LanguageId
  = | 'bash'
    | 'c'
    | 'cpp'
    | 'csharp'
    | 'css'
    | 'go'
    | 'haskell'
    | 'html'
    | 'java'
    | 'javascript'
    | 'jsx'
    | 'json'
    | 'kotlin'
    | 'lua'
    | 'perl'
    | 'php'
    | 'python'
    | 'ruby'
    | 'rust'
    | 'sql'
    | 'swift'
    | 'toml'
    | 'typescript'
    | 'yaml'

export interface LanguageGuess {
  language: LanguageId
  /** How much of the winning language's evidence matched, from 0 to 1. */
  confidence: number
}

interface Rule {
  language: LanguageId
  /** [pattern, weight] pairs. A pattern counts once no matter how often it matches. */
  patterns: ReadonlyArray<readonly [RegExp, number]>
}

/** A language needs at least this much evidence before it is reported. */
const MIN_SCORE = 2

const RULES: readonly Rule[] = [
  {
    language: 'html',
    patterns: [
      [/<!(?:doctype\s+html|--)/i, 3],
      [/<\/?(?:html|head|body|meta|title|header|main|footer|section|div|span|p|a|ul|li|script|style)\b/i, 2],
      [/<\/[a-z][\w-]*\s*>/i, 2],
      [/\b(?:href|src|class|id|charset|lang)=["']/i, 1],
    ],
  },
  {
    language: 'css',
    patterns: [
      [/^\s*(?:@(?:media|import|supports|keyframes|font-face)|:root)\b/m, 3],
      [/^\s*[.#][\w-]+\s*\{/m, 2],
      [/^\s*[a-z][\w-]*\s*\{\s*$/m, 1],
      [/^\s*--[\w-]+\s*:/m, 2],
      [/\b\d+(?:\.\d+)?(?:px|rem|em|%|vh|vw|ch|fr)\b/, 1],
      [/^\s*[\w-]+\s*:[^;\n]*;/m, 1],
    ],
  },
  {
    language: 'yaml',
    patterns: [
      [/^---\s*$/m, 3],
      [/^\s*-\s+\S/m, 1],
      [/^\s*[\w.-]+\s*:\s*[|>][+-]?\s*$/m, 3],
      [/^\s*[\w.-]+\s*:\s*\S/m, 1],
    ],
  },
  {
    language: 'toml',
    patterns: [
      [/^\s*\[\[?[\w.-]+\]\]?\s*$/m, 3],
      [/^\s*[\w.-]+\s*=\s*\S/m, 1],
      [/\b\d{4}-\d{2}-\d{2}(?:T[\d:.Z+-]+)?\b/, 2],
    ],
  },
  {
    language: 'bash',
    patterns: [
      [/^#!.*\b(?:bash|sh|zsh)\b/m, 4],
      [/^\s*set\s+-[a-z]+\b/m, 2],
      [/^\s*(?:local|export|readonly)\s+\w/m, 1],
      [/\$\{[^}]*\}/, 1],
      [/\b(?:fi|then|elif|esac)\b/, 2],
      [/\becho\s+/, 1],
    ],
  },
  {
    language: 'python',
    patterns: [
      [/^#!.*\bpython[0-9.]*\b/m, 4],
      [/^\s*def\s+\w+\s*\(/m, 2],
      [/^\s*(?:from\s+[\w.]+\s+import|import\s+[\w.]+)/m, 1],
      [/^\s*class\s+\w+\s*:/m, 1],
      [/\b(?:elif|lambda|None|True|False)\b/, 1],
      [/^\s*@\w+/m, 1],
      [/\bf["']/, 1],
    ],
  },
  {
    language: 'ruby',
    patterns: [
      [/^#!.*\bruby\b/m, 4],
      [/^\s*def\s+\w+[?!]?/m, 2],
      [/\bputs\s+/, 2],
      [/\bdo\s*\|[^|]*\|/, 3],
      [/^\s*end\b/m, 2],
      [/#\{[^}]*\}/, 2],
      [/^\s*class\s+\w+/m, 1],
      [/\battr_(?:reader|writer|accessor)\b/, 2],
    ],
  },
  {
    language: 'perl',
    patterns: [
      [/^#!.*\bperl\b/m, 4],
      [/^\s*use\s+(?:strict|warnings)\b/m, 3],
      [/\bmy\s+[$@%]\w+/, 3],
      [/\bsub\s+\w+/, 2],
      [/\bqw\s*\(/, 3],
      [/=~\s*\//, 2],
    ],
  },
  {
    language: 'php',
    patterns: [
      [/<\?php/, 6],
      [/\$\w+/, 1],
      [/->\w+/, 1],
      [/^\s*(?:namespace|use)\s+[A-Z]/m, 1],
      [/\bfunction\s+\w+/, 1],
    ],
  },
  {
    language: 'lua',
    patterns: [
      [/^\s*local\s+\w+/m, 3],
      [/\bfunction\s+[\w.:]+\s*\(/, 1],
      [/\b(?:nil|then|elseif)\b/, 1],
      [/--\[\[?/, 3],
      [/\bend\b/, 1],
      [/\brequire\s*\(?["']/, 1],
    ],
  },
  {
    language: 'haskell',
    patterns: [
      [/^\s*module\s+[\w.]+\s+where/m, 5],
      [/^\s*[a-z]\w*\s*::\s*/m, 3],
      [/^\s*(?:data|newtype|type)\s+\w+/m, 2],
      [/\blet\s+\w+\s*=.*\bin\b/, 2],
      [/\bwhere\b/, 1],
      [/--\s*\|/, 2],
    ],
  },
  {
    language: 'sql',
    patterns: [
      [/\bSELECT\b[^;]+?\bFROM\b/i, 3],
      [/\b(?:INSERT\s+INTO|CREATE\s+TABLE|UPDATE\s+\w+\s+SET|DELETE\s+FROM)\b/i, 3],
      [/\b(?:PRIMARY\s+KEY|NOT\s+NULL|FOREIGN\s+KEY|DEFAULT\s+\w+)\b/i, 1],
      [/\b(?:WHERE|JOIN|GROUP\s+BY|ORDER\s+BY)\b/i, 1],
      [/;\s*$/m, 1],
    ],
  },
  {
    language: 'go',
    patterns: [
      [/^\s*package\s+\w+/m, 4],
      [/^\s*func\s+(?:\([^)]*\)\s*)?\w+\s*\(/m, 3],
      [/\b\w+\s*:=\s*/, 3],
      [/\bfmt\.\w+/, 2],
      [/^\s*import\s*\(/m, 2],
      [/\bdefer\b/, 1],
    ],
  },
  {
    language: 'rust',
    patterns: [
      [/^\s*fn\s+\w+/m, 3],
      [/\blet\s+mut\b/, 2],
      [/^\s*use\s+std::/m, 3],
      [/\bimpl\b/, 2],
      [/\bprintln!\s*\(/, 3],
      [/^\s*#\[derive\(/m, 3],
      [/\b(?:Option|Result)<[^>]+>/, 1],
      [/\b(?:None|Some)\b/, 1],
    ],
  },
  {
    language: 'kotlin',
    patterns: [
      [/^\s*import\s+kotlin\./m, 4],
      [/^\s*(?:data\s+class|sealed\s+(?:class|interface))\b/m, 4],
      [/^\s*fun\s+\w+/m, 2],
      [/\b(?:val|var)\s+\w+\s*:/, 2],
      [/\b(?:println|when)\s*\(?/, 1],
      [/\?:|\?\.|!!/, 1],
      [/^\s*package\s+[\w.]+/m, 1],
    ],
  },
  {
    language: 'swift',
    patterns: [
      [/^\s*import\s+(?:Foundation|UIKit|SwiftUI|Combine)\b/m, 5],
      [/^\s*func\s+\w+/m, 2],
      [/\b(?:guard|if)\s+let\b/, 3],
      [/\b(?:struct|protocol|extension)\s+\w+/, 1],
      [/\b(?:let|var)\s+\w+\s*:/, 1],
      [/->\s*\w+/, 1],
      [/@(?:escaping|objc|State)\b/, 2],
    ],
  },
  {
    language: 'csharp',
    patterns: [
      [/^\s*using\s+System(?:\.\w+)*\s*;/m, 5],
      [/\bConsole\.(?:Write|Read)\w*/, 3],
      [/\$"[^"]*\{/, 2],
      [/^\s*namespace\s+[\w.]+;/m, 2],
      [/\b(?:record|init|required)\b/, 1],
      [/\b(?:string|int|double|float|bool)\?/, 1],
      [/^\s*public\s+(?:record|class)\b/m, 1],
    ],
  },
  {
    language: 'java',
    patterns: [
      [/^\s*import\s+java\./m, 5],
      [/^\s*package\s+[\w.]+;/m, 2],
      [/\bSystem\.out\./, 4],
      [/@(?:Override|Deprecated|SuppressWarnings)\b/, 2],
      [/^\s*public\s+(?:class|record|interface|enum)\b/m, 1],
      [/\b(?:String\[\]|public\s+static\s+void\s+main)\b/, 2],
    ],
  },
  {
    language: 'cpp',
    patterns: [
      [/\bstd::/, 4],
      [/^\s*#include\s*<[^>]+>/m, 1],
      [/^\s*(?:using\s+namespace|namespace\s+\w+)/m, 2],
      [/\btemplate\s*</, 3],
      [/\b(?:cout|cin|cerr|endl)\b/, 2],
      [/\b(?:vector|string|map|unique_ptr|shared_ptr)<[^>]*>/, 2],
      [/\bnullptr\b/, 2],
      [/\b(?:class|virtual)\b|public:|private:|protected:/, 1],
    ],
  },
  {
    language: 'c',
    patterns: [
      [/^\s*#define\s+\w+/m, 2],
      [/^\s*#include\s*<[^>]+>/m, 1],
      [/\b(?:printf|scanf|malloc|free|calloc|realloc)\s*\(/, 2],
      [/\btypedef\s+struct\b/, 2],
      [/\b(?:NULL|size_t|FILE)\b/, 1],
      [/^\s*(?:int|char|float|double|void|unsigned|long|short)\s+\w+/m, 1],
    ],
  },
  {
    language: 'jsx',
    patterns: [
      [/<\/?[A-Z][\w.]*/, 4],
      [/\b(?:React|useState|useEffect|useRef|useMemo|Fragment)\b/, 2],
      [/\bclassName=/, 2],
      [/\breturn\s*\(\s*<[\w.]/, 2],
      [/<\/?[a-z][\w-]*(?:\s[^>]*)?>/, 1],
    ],
  },
  {
    language: 'typescript',
    patterns: [
      [/\binterface\s+\w+/, 3],
      [/\btype\s+\w+\s*=/, 3],
      [/\benum\s+\w+/, 2],
      [/\bimplements\s+\w+/, 2],
      [/:\s*(?:string|number|boolean|void|any|unknown|never|bigint|symbol|object)\b/, 2],
      [/\b(?:readonly|declare|namespace|abstract)\b/, 1],
      [/\bas\s+(?:const|unknown|any|[A-Z]\w*)/, 1],
      [/\bimport\s+type\b/, 2],
    ],
  },
  {
    language: 'javascript',
    patterns: [
      [/^\s*(?:const|let|var)\s+\w+/m, 1],
      [/\bfunction\s+\w+\s*\(/, 1],
      [/=>/, 1],
      [/\bconsole\.\w+/, 2],
      [/\brequire\s*\(/, 1],
      [/\bmodule\.exports\b/, 2],
      [/\bimport\s+(?:\{|\*\s+as|\w+\s+from)/, 1],
      [/\bdocument\.\w+/, 2],
    ],
  },
]

interface QuickRule {
  language: LanguageId
  pattern: RegExp
}

/**
 * Decisive signals. These are checked before the weighted table: a shebang, a
 * PHP opening tag or `package main` already names the language, so there is no
 * reason to run all 140 patterns. A match here is treated as confidence 1.
 */
const QUICK_RULES: readonly QuickRule[] = [
  { language: 'bash', pattern: /^#!.*\b(?:bash|sh|zsh)\b/m },
  { language: 'python', pattern: /^#!.*\bpython[0-9.]*\b/m },
  { language: 'ruby', pattern: /^#!.*\bruby\b/m },
  { language: 'perl', pattern: /^#!.*\bperl\b/m },
  { language: 'javascript', pattern: /^#!.*\bnode\b/m },
  { language: 'php', pattern: /<\?php/ },
  { language: 'html', pattern: /<!doctype\s+html/i },
  { language: 'go', pattern: /^\s*package\s+main\s*$/m },
  { language: 'rust', pattern: /^\s*fn\s+main\b/m },
  { language: 'swift', pattern: /^\s*import\s+Foundation\b/m },
  { language: 'kotlin', pattern: /^\s*import\s+kotlin\./m },
  { language: 'csharp', pattern: /^\s*using\s+System\b/m },
  { language: 'haskell', pattern: /^\s*module\s+[\w.]+\s+where/m },
  { language: 'lua', pattern: /--\[\[?/ },
]

function quickLanguage(text: string): LanguageId | null {
  for (const rule of QUICK_RULES) {
    if (rule.pattern.test(text))
      return rule.language
  }
  return null
}

/** True when the text is a complete JSON object or array. */
function isJson(text: string): boolean {
  const first = text[0]
  if (first !== '{' && first !== '[')
    return false
  try {
    JSON.parse(text)
    return true
  }
  catch {
    return false
  }
}

/**
 * Guess the language of `input` from its structure. Returns `null` when no
 * language has enough evidence, so plain prose and tiny snippets stay
 * unclassified.
 *
 * This is optional metadata: `glow()` and the document never call it, and the
 * highlighter behaves exactly the same with or without the guess.
 */
export function detectLanguage(input: string | readonly string[]): LanguageGuess | null {
  const text = typeof input === 'string' ? input : input.join('\n')
  const trimmed = text.trim()
  if (!trimmed)
    return null

  if (isJson(trimmed))
    return { language: 'json', confidence: 1 }

  const quick = quickLanguage(text)
  if (quick)
    return { language: quick, confidence: 1 }

  let best: LanguageGuess | null = null
  let bestScore = 0

  for (const rule of RULES) {
    let score = 0
    let total = 0
    for (const [pattern, weight] of rule.patterns) {
      total += weight
      if (pattern.test(text))
        score += weight
    }
    if (score < MIN_SCORE)
      continue
    if (score <= bestScore)
      continue
    best = { language: rule.language, confidence: score / total }
    bestScore = score
  }

  return best
}
