// PlantUML's standard library (!include <C4/C4_Context>, <awslib/…>, <kubernetes/…>, …) is not
// bundled: one library is up to tens of megabytes. When the user names a host in the settings,
// plantuml.ts fetches "<lib>.min.js" from it on demand. Those bundles are scripts, which neither
// the extension (store rules) nor the web viewer (CSP) may run, but they are written in one
// fixed shape, a list of assignments of string literals:
//
//   (function(){window.PLANTUML_STDLIB_INFO=window.PLANTUML_STDLIB_INFO||{};
//   window.PLANTUML_STDLIB_INFO.c4={name:"C4",display_name:"C4 (C4-PlantUML)",…};
//   window.PLANTUML_STDLIB=window.PLANTUML_STDLIB||{};window.PLANTUML_STDLIB.c4=window.PLANTUML_STDLIB.c4||{};
//   window.PLANTUML_STDLIB.c4["C4_Context"]='!include <C4/C4>;…'.split(";")
//   window.PLANTUML_STDLIB.c4.c4=["","!global $NEW_C4_STYLE ?= 0",…]
//   …})();
//
// so this file reads them as data: string, array and object literals only, nothing is
// evaluated, and any other syntax is an error. The result goes into the globals the engine reads.

export interface StdlibBundle {
  /** The library name as the bundle itself calls it (the key in the engine's globals). */
  name: string;
  /** Each file's lines, by its path inside the library ("C4_Context"). */
  files: Record<string, string[]>;
  /** Files the bundle keeps as JSON (sprites), by path. */
  json: Record<string, unknown>;
  /** The library's description: name, display_name, link (another bundle to load instead), … */
  info: Record<string, string>;
}

/** The official host of the bundles, offered in the settings. */
export const OFFICIAL_STDLIB_URL = 'https://plantuml.github.io/plantuml/js-plantuml/';

/** A usable host: https, ending with "/" (the engine appends "<lib>.min.js"). Empty means off. */
export function normalizeStdlibUrl(raw: unknown): string {
  if (typeof raw !== 'string') return '';
  const url = raw.trim();
  if (!url) return '';
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'https:' || parsed.hash || parsed.search) return '';
    return parsed.href.endsWith('/') ? parsed.href : `${parsed.href}/`;
  } catch {
    return '';
  }
}

class Scanner {
  pos = 0;
  constructor(readonly text: string) {}

  fail(what: string): never {
    throw new Error(`${what} at offset ${this.pos}`);
  }

  skipSpace(): void {
    while (this.pos < this.text.length && /[\s;]/.test(this.text[this.pos])) this.pos++;
  }

  /** Consumes `literal` if it is next; says whether it was. */
  take(literal: string): boolean {
    if (!this.text.startsWith(literal, this.pos)) return false;
    this.pos += literal.length;
    return true;
  }

  expect(literal: string): void {
    if (!this.take(literal)) this.fail(`expected ${JSON.stringify(literal)}`);
  }

  /** Consumes a regular expression anchored here; returns the match or null. */
  match(re: RegExp): RegExpExecArray | null {
    re.lastIndex = this.pos;
    const m = re.exec(this.text);
    if (!m) return null;
    this.pos += m[0].length;
    return m;
  }

  /** A JavaScript string literal ('…' or "…") with its escapes resolved. */
  string(): string {
    const quote = this.text[this.pos];
    if (quote !== "'" && quote !== '"') this.fail('expected a string');
    this.pos++;
    let out = '';
    for (;;) {
      if (this.pos >= this.text.length) this.fail('unterminated string');
      const c = this.text[this.pos++];
      if (c === quote) return out;
      if (c === '\n' || c === '\r') this.fail('newline in string');
      if (c !== '\\') {
        out += c;
        continue;
      }
      const e = this.text[this.pos++];
      switch (e) {
        case 'n': out += '\n'; break;
        case 'r': out += '\r'; break;
        case 't': out += '\t'; break;
        case 'b': out += '\b'; break;
        case 'f': out += '\f'; break;
        case 'v': out += '\v'; break;
        case '0': out += '\0'; break;
        case 'x': out += this.hex(2); break;
        case 'u':
          if (this.take('{')) {
            const m = this.match(/[0-9a-fA-F]{1,6}\}/y);
            if (!m) this.fail('bad \\u{…} escape');
            out += String.fromCodePoint(parseInt(m[0], 16));
          } else out += this.hex(4);
          break;
        case '\r': this.take('\n'); break; // line continuation
        case '\n': case ' ': case ' ': break;
        case undefined: this.fail('unterminated string');
        default: out += e; // \' \" \\ and any other character stands for itself
      }
    }
  }

  private hex(digits: number): string {
    const m = this.match(new RegExp(`[0-9a-fA-F]{${digits}}`, 'y'));
    if (!m) this.fail('bad hex escape');
    return String.fromCharCode(parseInt(m[0], 16));
  }

  /** An object literal of string values: {name:"C4",display_name:"…"}. */
  stringObject(): Record<string, string> {
    this.expect('{');
    const out: Record<string, string> = {};
    this.skipSpace();
    if (this.take('}')) return out;
    for (;;) {
      this.skipSpace();
      const key = this.match(/[A-Za-z_$][\w$]*/y)?.[0] ?? (this.text[this.pos] === '"' || this.text[this.pos] === "'" ? this.string() : this.fail('expected a key'));
      this.skipSpace();
      this.expect(':');
      this.skipSpace();
      out[key] = this.string();
      this.skipSpace();
      if (this.take('}')) return out;
      this.expect(',');
    }
  }

  /**
   * A literal value: a string ('…' or "…"), number, true / false / null, an array of values or
   * an object of them (keys as words or strings). Nothing that could run.
   */
  value(): unknown {
    this.skipSpace();
    const c = this.text[this.pos];
    if (c === '"' || c === "'") return this.string();
    if (c === '[') {
      this.pos++;
      const out: unknown[] = [];
      this.skipSpace();
      if (this.take(']')) return out;
      for (;;) {
        out.push(this.value());
        this.skipSpace();
        if (this.take(']')) return out;
        this.expect(',');
      }
    }
    if (c === '{') {
      this.pos++;
      const out: Record<string, unknown> = {};
      this.skipSpace();
      if (this.take('}')) return out;
      for (;;) {
        this.skipSpace();
        const key = this.match(/[A-Za-z_$][\w$]*/y)?.[0] ?? (this.text[this.pos] === '"' || this.text[this.pos] === "'" ? this.string() : this.fail('expected a key'));
        this.skipSpace();
        this.expect(':');
        out[key] = this.value();
        this.skipSpace();
        if (this.take('}')) return out;
        this.expect(',');
      }
    }
    const word = this.match(/-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?|true|false|null/y)?.[0];
    if (word === undefined) this.fail('expected a value');
    return word === 'true' ? true : word === 'false' ? false : word === 'null' ? null : Number(word);
  }
}

const GLOBAL = /window\.(PLANTUML_STDLIB(?:_JSON|_INFO)?)/y;

/**
 * Reads a "<lib>.min.js" bundle as data. Throws on anything but the shape described above, so a
 * host serving something else (an error page, a script) is refused rather than run.
 */
export function parseStdlibBundle(text: string): StdlibBundle {
  const s: Scanner = new Scanner(text); // the annotation lets fail()'s `never` narrow below
  const bundle: StdlibBundle = { name: '', files: Object.create(null), json: Object.create(null), info: {} };
  s.skipSpace();
  s.take('(function(){');
  for (;;) {
    s.skipSpace();
    if (s.pos >= s.text.length || s.take('})();') || s.take('})()')) break;
    const target = s.match(GLOBAL)?.[1];
    if (!target) s.fail('unexpected syntax');
    const lib = s.match(/\.([A-Za-z0-9_$]+)/y)?.[1];
    if (lib) {
      if (bundle.name && lib !== bundle.name) s.fail(`a second library "${lib}"`);
      bundle.name = lib;
    }
    s.skipSpace();
    if (s.take('=')) {
      s.skipSpace();
      // window.X=window.X||{} and window.X.lib=window.X.lib||{}: the engine's globals created.
      if (s.match(new RegExp(`window\\.${target}${lib ? `\\.${lib}` : ''}\\s*\\|\\|\\s*\\{\\s*\\}`, 'y'))) continue;
      if (target === 'PLANTUML_STDLIB_INFO' && lib) {
        bundle.info = s.stringObject();
        continue;
      }
      s.fail('unexpected assignment');
    }
    if (!lib) s.fail('expected a library name');
    // The file's path: ["dir/name"] or, when it is a plain word, .name
    let path: string;
    if (s.take('[')) {
      s.skipSpace();
      path = s.string();
      s.skipSpace();
      s.expect(']');
    } else {
      s.expect('.');
      path = s.match(/[A-Za-z_$][\w$]*/y)?.[0] ?? s.fail('expected a path');
    }
    s.skipSpace();
    s.expect('=');
    s.skipSpace();
    // The value: a literal, or a string split into an array ('a;b'.split(";")).
    let value = s.value();
    s.skipSpace();
    const split = s.match(/\.split\((["'])(.*?)\1\)/y);
    if (split) {
      if (typeof value !== 'string') s.fail('.split on something else than a string');
      value = value.split(split[2]);
    }
    if (target === 'PLANTUML_STDLIB') {
      if (!Array.isArray(value) || !value.every((l) => typeof l === 'string')) s.fail('expected the lines of a file');
      bundle.files[path] = value as string[];
    } else if (target === 'PLANTUML_STDLIB_JSON') {
      bundle.json[path] = value;
    } else s.fail('unexpected index on PLANTUML_STDLIB_INFO');
  }
  if (!bundle.name) throw new Error('no library in the bundle');
  return bundle;
}

type Globals = {
  PLANTUML_STDLIB?: Record<string, Record<string, string[]>>;
  PLANTUML_STDLIB_JSON?: Record<string, Record<string, unknown>>;
  PLANTUML_STDLIB_INFO?: Record<string, Record<string, string>>;
};

/** Hands a parsed bundle to the engine through the globals it reads. */
export function installStdlibBundle(bundle: StdlibBundle, g: Globals = globalThis as Globals): void {
  (g.PLANTUML_STDLIB ??= {})[bundle.name] = bundle.files;
  (g.PLANTUML_STDLIB_JSON ??= {})[bundle.name] = bundle.json;
  (g.PLANTUML_STDLIB_INFO ??= {})[bundle.name] = bundle.info;
}
