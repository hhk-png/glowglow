/*
  Cross-language keyword table for the universal (language-free) engine.

  The engine never guesses the language, so it highlights any identifier that
  is a reserved word in *any* common language. Matching is case-insensitive
  (covers SQL / Pascal / VB-style keywords) and guarded so that an identifier
  used as a property (`obj.type`) or as an HTML attribute is not mis-colored.

  Recall is favoured over precision on purpose: a rare false positive is
  preferable to a missing keyword. Property access is de-emphasized by the
  dot-guard in classify.ts.
*/

const RAW = `
  // ECMAScript / TypeScript
  break case catch class const continue debugger default delete do else
  enum export extends false finally for function if import in instanceof new
  null return super switch this throw true try typeof var void while with
  yield async await let static get set of as interface implements private
  protected public readonly declare module namespace abstract type keyof infer
  satisfies asserts override accessor require using from of symbol bigint
  number string boolean undefined object any unknown never

  // Python
  and as assert async await break class continue def del elif else except
  finally for from global if import in is lambda nonlocal not or pass raise
  return try while with yield None True False match case self

  // Java
  abstract assert boolean byte char double final float goto int long native
  package short strictfp synchronized throws transient volatile record sealed
  permits opens exports opens to transitive uses provides requires with
  open module

  // C / C++
  alignas alignof asm auto bitand bitor bool compl concept const consteval
  constexpr constinit const_cast continue decltype dynamic_cast explicit
  export friend inline mutable namespace new noexcept not not_eq nullptr
  operator or or_eq register reinterpret_cast requires static static_assert
  static_cast struct template thread_local typedef typeid typename union
  unsigned using virtual wchar_t xor xor_eq char8_t char16_t char32_t
  co_await co_return co_yield

  // C#
  base checked decimal delegate event fixed foreach goto implicit internal
  is lock object out override params ref sbyte sealed sizeof stackalloc
  string unchecked unsafe ushort record init required lock when where get
  add remove set value

  // Go
  chan defer fallthrough func go goto map package range select

  // Rust
  as async await dyn fn impl let loop match mod move mut pub ref trait use
  where dyn

  // Ruby
  BEGIN END alias and begin def defined else elsif end ensure module next
  not redo rescue retry self super then undef unless until when

  // PHP
  array as break callable case catch class clone const continue declare die
  echo empty enddeclare endfor endforeach endif endswitch endwhile eval exit
  extends final finally fn foreach function global goto implements include
  include_once instanceof insteadof interface isset list match namespace
  print require require_once return static switch throw trait try unset var
  while xor yield

  // Swift
  associatedtype class deinit enum extension fileprivate import init inout
  let open operator protocol rethrows subscript typealias var
  didSet willSet some any

  // Kotlin
  as break class continue do else for fun if in interface is null object
  package return super this throw true try typealias typeof val var when
  while by catch constructor delegate dynamic field file finally get import
  init param property receiver set setparam where actual annotation companion
  const crossinline data enum expect external final infix inline inner
  internal lateinit noinline open out override private protected public
  reified sealed suspend tailrec vararg

  // Shell / generic control words
  if then elif else fi case esac for while until do done function in select
  time local readonly export unset shift return exit bg fg

  // SQL (subset)
  select from where insert update delete into values join inner left right
  outer full cross on group by order having limit offset exists union
  intersect except create alter drop table index view primary foreign key
  unique constraint default check references cascade distinct as asc desc
  case when end null is not and or all any in like between cast add column
  constraint database procedure

  // Small shared / legacy blocks
  begin end nil
`

export const KEYWORDS: ReadonlySet<string> = new Set(RAW.split(/\s+/).filter(Boolean))

export function isKeyword(word: string): boolean {
  return KEYWORDS.has(word.toLowerCase())
}

// Standard HTML5 element names (plus a few common XML / component names).
const HTML_RAW = `
  a abbr address area article aside audio b base bdi bdo blockquote body br
  button canvas caption cite code col colgroup data datalist dd del details
  dfn dialog div dl dt em embed fieldset figcaption figure footer form h1 h2
  h3 h4 h5 h6 head header hgroup hr html i iframe img input ins kbd label
  legend li link main map mark menu meta meter nav noscript object ol optgroup
  option output p param picture pre progress q rp rt ruby s samp script search
  section select slot small source span strong style sub summary sup table
  tbody td template textarea tfoot th thead time title tr track u ul var video
  wbr svg path circle rect g text tspan linearGradient stop defs use symbol
  pattern filter mask title xml stylesheet
`

export const HTML_TAGS: ReadonlySet<string> = new Set(HTML_RAW.split(/\s+/).filter(Boolean))
