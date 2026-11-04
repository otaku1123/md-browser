// Code highlighting languages beyond highlight.js/lib/common (the ~35 bundled with render.ts).
// Each one below is a separate chunk, loaded only when a document has a fenced block in it,
// like Mermaid, PlantUML and KaTeX. renderMarkdown() is synchronous, so the caller awaits
// loadHighlightLanguages(source) first; a language that is unknown or fails to load leaves
// its block plain, as before.
import hljs from 'highlight.js/lib/common';
import type { LanguageFn } from 'highlight.js';

type Loader = () => Promise<{ default: LanguageFn }>;

interface LazyLanguage {
  /** Names a fence may use besides the module name: highlight.js's own aliases, plus a few
   *  GitHub habits (asm, jinja2, nasm). */
  aliases: string[];
  load: Loader;
}

const lazy = (aliases: string[], load: Loader): LazyLanguage => ({ aliases, load });

// Module name (highlight.js/lib/languages/<name>) → aliases and loader.
const LAZY: Record<string, LazyLanguage> = {
  abnf: lazy([], () => import('highlight.js/lib/languages/abnf')),
  accesslog: lazy([], () => import('highlight.js/lib/languages/accesslog')),
  actionscript: lazy(['as'], () => import('highlight.js/lib/languages/actionscript')),
  ada: lazy([], () => import('highlight.js/lib/languages/ada')),
  apache: lazy(['apacheconf'], () => import('highlight.js/lib/languages/apache')),
  applescript: lazy(['osascript'], () => import('highlight.js/lib/languages/applescript')),
  arduino: lazy(['ino'], () => import('highlight.js/lib/languages/arduino')),
  armasm: lazy(['arm'], () => import('highlight.js/lib/languages/armasm')),
  asciidoc: lazy(['adoc'], () => import('highlight.js/lib/languages/asciidoc')),
  autohotkey: lazy(['ahk'], () => import('highlight.js/lib/languages/autohotkey')),
  avrasm: lazy([], () => import('highlight.js/lib/languages/avrasm')),
  awk: lazy([], () => import('highlight.js/lib/languages/awk')),
  basic: lazy([], () => import('highlight.js/lib/languages/basic')),
  bnf: lazy([], () => import('highlight.js/lib/languages/bnf')),
  capnproto: lazy(['capnp'], () => import('highlight.js/lib/languages/capnproto')),
  clojure: lazy(['clj', 'edn'], () => import('highlight.js/lib/languages/clojure')),
  cmake: lazy(['cmake.in'], () => import('highlight.js/lib/languages/cmake')),
  coffeescript: lazy(['coffee', 'cson', 'iced'], () => import('highlight.js/lib/languages/coffeescript')),
  crystal: lazy(['cr'], () => import('highlight.js/lib/languages/crystal')),
  d: lazy([], () => import('highlight.js/lib/languages/d')),
  dart: lazy([], () => import('highlight.js/lib/languages/dart')),
  delphi: lazy(['dpr', 'dfm', 'pas', 'pascal'], () => import('highlight.js/lib/languages/delphi')),
  django: lazy(['jinja', 'jinja2'], () => import('highlight.js/lib/languages/django')),
  dns: lazy(['bind', 'zone'], () => import('highlight.js/lib/languages/dns')),
  dockerfile: lazy(['docker'], () => import('highlight.js/lib/languages/dockerfile')),
  dos: lazy(['bat', 'batch', 'cmd'], () => import('highlight.js/lib/languages/dos')),
  dts: lazy([], () => import('highlight.js/lib/languages/dts')),
  ebnf: lazy([], () => import('highlight.js/lib/languages/ebnf')),
  elixir: lazy(['ex', 'exs'], () => import('highlight.js/lib/languages/elixir')),
  elm: lazy([], () => import('highlight.js/lib/languages/elm')),
  erb: lazy([], () => import('highlight.js/lib/languages/erb')),
  erlang: lazy(['erl'], () => import('highlight.js/lib/languages/erlang')),
  excel: lazy(['xlsx', 'xls'], () => import('highlight.js/lib/languages/excel')),
  fortran: lazy(['f90', 'f95'], () => import('highlight.js/lib/languages/fortran')),
  freedesktop: lazy(['desktop', 'systemd'], () => import('highlight.js/lib/languages/freedesktop')),
  fsharp: lazy(['fs', 'f#'], () => import('highlight.js/lib/languages/fsharp')),
  gcode: lazy(['nc'], () => import('highlight.js/lib/languages/gcode')),
  gherkin: lazy(['feature'], () => import('highlight.js/lib/languages/gherkin')),
  glsl: lazy([], () => import('highlight.js/lib/languages/glsl')),
  gradle: lazy([], () => import('highlight.js/lib/languages/gradle')),
  groovy: lazy([], () => import('highlight.js/lib/languages/groovy')),
  haml: lazy([], () => import('highlight.js/lib/languages/haml')),
  handlebars: lazy(['hbs', 'html.hbs', 'html.handlebars', 'htmlbars'], () => import('highlight.js/lib/languages/handlebars')),
  haskell: lazy(['hs'], () => import('highlight.js/lib/languages/haskell')),
  haxe: lazy(['hx'], () => import('highlight.js/lib/languages/haxe')),
  http: lazy(['https'], () => import('highlight.js/lib/languages/http')),
  julia: lazy([], () => import('highlight.js/lib/languages/julia')),
  latex: lazy(['tex'], () => import('highlight.js/lib/languages/latex')),
  lisp: lazy([], () => import('highlight.js/lib/languages/lisp')),
  livescript: lazy(['ls'], () => import('highlight.js/lib/languages/livescript')),
  llvm: lazy([], () => import('highlight.js/lib/languages/llvm')),
  mathematica: lazy(['mma', 'wl'], () => import('highlight.js/lib/languages/mathematica')),
  matlab: lazy([], () => import('highlight.js/lib/languages/matlab')),
  mipsasm: lazy(['mips'], () => import('highlight.js/lib/languages/mipsasm')),
  nginx: lazy(['nginxconf'], () => import('highlight.js/lib/languages/nginx')),
  nim: lazy([], () => import('highlight.js/lib/languages/nim')),
  nix: lazy(['nixos'], () => import('highlight.js/lib/languages/nix')),
  ocaml: lazy(['ml'], () => import('highlight.js/lib/languages/ocaml')),
  openscad: lazy(['scad'], () => import('highlight.js/lib/languages/openscad')),
  pgsql: lazy(['postgres', 'postgresql'], () => import('highlight.js/lib/languages/pgsql')),
  powershell: lazy(['pwsh', 'ps', 'ps1'], () => import('highlight.js/lib/languages/powershell')),
  processing: lazy(['pde'], () => import('highlight.js/lib/languages/processing')),
  prolog: lazy([], () => import('highlight.js/lib/languages/prolog')),
  properties: lazy([], () => import('highlight.js/lib/languages/properties')),
  protobuf: lazy(['proto'], () => import('highlight.js/lib/languages/protobuf')),
  puppet: lazy(['pp'], () => import('highlight.js/lib/languages/puppet')),
  qml: lazy(['qt'], () => import('highlight.js/lib/languages/qml')),
  reasonml: lazy(['re'], () => import('highlight.js/lib/languages/reasonml')),
  sas: lazy([], () => import('highlight.js/lib/languages/sas')),
  scala: lazy([], () => import('highlight.js/lib/languages/scala')),
  scheme: lazy(['scm'], () => import('highlight.js/lib/languages/scheme')),
  scilab: lazy(['sci'], () => import('highlight.js/lib/languages/scilab')),
  smalltalk: lazy(['st'], () => import('highlight.js/lib/languages/smalltalk')),
  stata: lazy(['do', 'ado'], () => import('highlight.js/lib/languages/stata')),
  stylus: lazy(['styl'], () => import('highlight.js/lib/languages/stylus')),
  tcl: lazy(['tk'], () => import('highlight.js/lib/languages/tcl')),
  thrift: lazy([], () => import('highlight.js/lib/languages/thrift')),
  twig: lazy(['craftcms'], () => import('highlight.js/lib/languages/twig')),
  vbscript: lazy(['vbs'], () => import('highlight.js/lib/languages/vbscript')),
  verilog: lazy(['v', 'sv', 'svh'], () => import('highlight.js/lib/languages/verilog')),
  vhdl: lazy([], () => import('highlight.js/lib/languages/vhdl')),
  vim: lazy([], () => import('highlight.js/lib/languages/vim')),
  x86asm: lazy(['asm', 'nasm'], () => import('highlight.js/lib/languages/x86asm')),
};

// Fence name (lowercase) → module name.
const BY_NAME = new Map<string, string>();
for (const [name, { aliases }] of Object.entries(LAZY)) {
  BY_NAME.set(name, name);
  for (const alias of aliases) BY_NAME.set(alias, name);
}

/** Every module name known here, for documentation and tests. */
export const LAZY_LANGUAGES: readonly string[] = Object.keys(LAZY);

/** The lazily loaded module that handles this fence language, if any. */
export function lazyLanguageFor(lang: string): string | undefined {
  return BY_NAME.get(lang.toLowerCase());
}

// A fence opener: up to three spaces, ``` or ~~~ (three or more), then the info string, whose
// first word names the language. Matching inside code blocks only loads a language for nothing.
const FENCE = /^ {0,3}(?:`{3,}|~{3,})[ \t]*([^\s`]+)/gm;

/** The languages of the fenced code blocks in a Markdown source, lowercase, in order of first use. */
export function fenceLanguages(src: string): string[] {
  const seen = new Set<string>();
  for (const m of src.matchAll(FENCE)) seen.add(m[1].toLowerCase());
  return Array.from(seen);
}

const loading = new Map<string, Promise<void>>();

function loadLanguage(name: string): Promise<void> {
  let p = loading.get(name);
  if (!p) {
    p = LAZY[name]
      .load()
      .then((m) => {
        hljs.registerLanguage(name, m.default);
      })
      .catch(() => {
        // Not cached: the next document with this language tries again.
        loading.delete(name);
      });
    loading.set(name, p);
  }
  return p;
}

/**
 * Registers every lazily loaded language the fenced blocks of this source need, so that the
 * synchronous highlighter in renderMarkdown() finds them. Resolves when they are all registered
 * (or have failed to load).
 */
export async function loadHighlightLanguages(src: string): Promise<void> {
  const wanted = new Set<string>();
  for (const lang of fenceLanguages(src)) {
    if (hljs.getLanguage(lang)) continue;
    const name = lazyLanguageFor(lang);
    if (name) wanted.add(name);
  }
  await Promise.all(Array.from(wanted, loadLanguage));
}
