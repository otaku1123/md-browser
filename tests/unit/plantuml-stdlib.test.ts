import { describe, expect, it } from 'vitest';
import { installStdlibBundle, normalizeStdlibUrl, OFFICIAL_STDLIB_URL, parseStdlibBundle } from '../../src/core/plantuml-stdlib';
import { normalizePlantUmlSettings } from '../../src/core/plantuml';

// The shape of the bundles on the official host (awslib.min.js, shortened).
const AWSLIB =
  '(function(){window.PLANTUML_STDLIB_JSON=window.PLANTUML_STDLIB_JSON||{};window.PLANTUML_STDLIB_JSON.awslib=window.PLANTUML_STDLIB_JSON.awslib||{};' +
  'window.PLANTUML_STDLIB_INFO=window.PLANTUML_STDLIB_INFO||{};' +
  'window.PLANTUML_STDLIB_INFO.awslib={name:"awslib",display_name:"Awslib",description:"",author:"",source:"https://github.com/awslabs/aws-icons-for-plantuml",link:"awslib14",origin:""};' +
  'window.PLANTUML_STDLIB=window.PLANTUML_STDLIB||{};window.PLANTUML_STDLIB.awslib=window.PLANTUML_STDLIB.awslib||{};\n' +
  'window.PLANTUML_STDLIB.awslib["_examples_/example"]=\'!include <awslib/AWSCommon>;;Rel(a, b, \\\'\\\');  "\\\\tAZ 1\\\\t"\'.split(";")})();';

describe('parseStdlibBundle', () => {
  it('reads the files, with their escapes, and the info of an official bundle', () => {
    const bundle = parseStdlibBundle(AWSLIB);
    expect(bundle.name).toBe('awslib');
    expect(bundle.info).toEqual({
      name: 'awslib',
      display_name: 'Awslib',
      description: '',
      author: '',
      source: 'https://github.com/awslabs/aws-icons-for-plantuml',
      link: 'awslib14',
      origin: '',
    });
    expect(bundle.files).toEqual({ '_examples_/example': ['!include <awslib/AWSCommon>', '', "Rel(a, b, '')", '  "\\tAZ 1\\t"'] });
    expect(bundle.json).toEqual({});
  });

  it('reads several files in both forms, JSON entries and every kind of string escape', () => {
    const text =
      '(function(){window.PLANTUML_STDLIB_INFO=window.PLANTUML_STDLIB_INFO||{};window.PLANTUML_STDLIB_INFO.c4={name:"C4",description:"say \\"hi\\", it\'s fine"};\n' +
      'window.PLANTUML_STDLIB=window.PLANTUML_STDLIB||\n{};window.PLANTUML_STDLIB.c4=window.PLANTUML_STDLIB.c4||{};\n' +
      'window.PLANTUML_STDLIB.c4["C4"]=\'a;b\\n;\\x41\\u00e9\\u{1F600};tab\\there\'.split(";")\n' +
      "window.PLANTUML_STDLIB.c4['C4_Context']=\"!include <C4/C4>;x\".split(';')\n" +
      'window.PLANTUML_STDLIB.c4.c4=["", \'!global $X ?= 0\', "end"]\n' +
      'window.PLANTUML_STDLIB_JSON=window.PLANTUML_STDLIB_JSON||{};window.PLANTUML_STDLIB_JSON.c4=window.PLANTUML_STDLIB_JSON.c4||{};\n' +
      'window.PLANTUML_STDLIB_JSON.c4["sprites"]={"a":[1,2,{"b":"}]"}],c:null,d:true}\n' +
      'window.PLANTUML_STDLIB_JSON.c4.all="Analytics Compute".split(" ")\n' +
      '})();';
    const bundle = parseStdlibBundle(text);
    expect(bundle.name).toBe('c4');
    expect(bundle.info.description).toBe('say "hi", it\'s fine');
    expect(bundle.files.C4).toEqual(['a', 'b\n', 'Aé😀', 'tab\there']);
    expect(bundle.files.C4_Context).toEqual(['!include <C4/C4>', 'x']);
    expect(bundle.files.c4).toEqual(['', '!global $X ?= 0', 'end']);
    expect(bundle.json.sprites).toEqual({ a: [1, 2, { b: '}]' }], c: null, d: true });
    expect(bundle.json.all).toEqual(['Analytics', 'Compute']);
  });

  it('refuses anything that is not that shape: a script, an error page, a second library', () => {
    expect(() => parseStdlibBundle('alert(1)')).toThrow(/unexpected syntax at offset 0/);
    expect(() => parseStdlibBundle('<!DOCTYPE html><html>')).toThrow(/unexpected syntax/);
    expect(() => parseStdlibBundle('(function(){window.PLANTUML_STDLIB.c4["x"]=fetch("y").split(";")})();')).toThrow(/expected a value/);
    expect(() => parseStdlibBundle('(function(){window.PLANTUML_STDLIB.c4["x"]=[1, 2]})();')).toThrow(/expected the lines of a file/);
    expect(() => parseStdlibBundle('(function(){window.PLANTUML_STDLIB.c4["x"]=["a"].split(";")})();')).toThrow(/split on something else/);
    expect(() => parseStdlibBundle('(function(){window.PLANTUML_STDLIB.c4["x"]=(function(){})()})();')).toThrow(/expected a value/);
    expect(() => parseStdlibBundle('(function(){window.PLANTUML_STDLIB.c4["x"]=\'a\'.split(";");window.PLANTUML_STDLIB.d["y"]=\'b\'.split(";")})();')).toThrow(
      /a second library "d"/,
    );
    expect(() => parseStdlibBundle('(function(){window.PLANTUML_STDLIB_INFO.c4={name:1}})();')).toThrow(/expected a string/);
    expect(() => parseStdlibBundle("(function(){window.PLANTUML_STDLIB.c4['x']='unterminated")).toThrow(/unterminated string/);
    expect(() => parseStdlibBundle('(function(){window.PLANTUML_STDLIB=window.PLANTUML_STDLIB||{};})();')).toThrow(/no library/);
  });
});

describe('installStdlibBundle', () => {
  it("fills the engine's globals, keeping other libraries", () => {
    const g: Parameters<typeof installStdlibBundle>[1] = { PLANTUML_STDLIB: { other: { f: ['x'] } } };
    installStdlibBundle(parseStdlibBundle(AWSLIB), g);
    expect(Object.keys(g.PLANTUML_STDLIB!)).toEqual(['other', 'awslib']);
    expect(g.PLANTUML_STDLIB!.awslib['_examples_/example'][0]).toBe('!include <awslib/AWSCommon>');
    expect(g.PLANTUML_STDLIB_INFO!.awslib.link).toBe('awslib14');
    expect(g.PLANTUML_STDLIB_JSON!.awslib).toEqual({});
  });
});

describe('normalizeStdlibUrl', () => {
  it('accepts an https prefix and adds the trailing slash', () => {
    expect(normalizeStdlibUrl(OFFICIAL_STDLIB_URL)).toBe(OFFICIAL_STDLIB_URL);
    expect(normalizeStdlibUrl(' https://example.com/libs ')).toBe('https://example.com/libs/');
  });

  it('turns everything else into "off"', () => {
    for (const raw of ['', '  ', 'http://example.com/', 'ftp://x/', 'javascript:alert(1)', 'not a url', 'https://x/?q', 'https://x/#f', 42, null]) {
      expect(normalizeStdlibUrl(raw), String(raw)).toBe('');
    }
    expect(normalizePlantUmlSettings({ stdlibUrl: 'http://x/' })).toEqual({ stdlibUrl: '' });
    expect(normalizePlantUmlSettings(undefined)).toEqual({ stdlibUrl: '' });
  });
});
