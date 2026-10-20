import { beforeAll, describe, expect, test } from 'bun:test'

import { loadExtractor } from '../../src/symbols/extract-symbols'
import { GRAMMARS, grammarFor, symbolLanguages } from '../../src/symbols/grammars'
import type { GrammarId, SymbolExtractor } from '../../src/symbols/symbols.types'

let extract: SymbolExtractor

beforeAll(async () => {
  extract = (await loadExtractor(Object.keys(GRAMMARS) as GrammarId[])).unwrap()
})

function names(grammar: GrammarId, source: string): string[] {
  return extract(grammar, source).map(symbol => `${symbol.kind} ${symbol.name}`)
}

describe('extracting definitions', () => {
  test('JavaScript', () => {
    const source = [
      'function a() {}',
      'function* gen() {}',
      'class B { constructor() {} m() {} #p() {} f = () => 1 }',
      'const c = () => {}, d = function () {}',
      'const E = class {}',
      'exports.g = function () {}',
      'const o = { h: () => {} }',
      'export const LIMIT = 10',
      'let counter = 0',
      'call(() => {})',
    ].join('\n')
    expect(names('javascript', source)).toEqual([
      'function a',
      'function gen',
      'class B',
      'method m',
      'method #p',
      'method f',
      'function c',
      'function d',
      'class E',
      'function g',
      'constant o',
      'function h',
      'constant LIMIT',
    ])
  })

  test('TypeScript', () => {
    const source = [
      'export interface Props { a: string; m(): void; constructor(): void }',
      'export type Id = string',
      'enum Color { Red }',
      'declare function f(x: number): void',
      'abstract class Base { abstract run(): void; field = (): void => {} }',
      'namespace NS.Inner {}',
      "declare module 'pkg' {}",
      'export function useCounter(): number { return 0 }',
    ].join('\n')
    expect(names('typescript', source)).toEqual([
      'interface Props',
      'method m',
      'type Id',
      'enum Color',
      'function f',
      'class Base',
      'method run',
      'method field',
      'module NS.Inner',
      'module pkg',
      'function useCounter',
    ])
    expect(names('tsx', 'export const App = () => <div />\n')).toEqual(['function App'])
  })

  test('Python', () => {
    const source = ['MAX = 3', 'def f():', '  pass', 'class C:', '  def m(self): pass', '  @staticmethod', '  def s(): pass'].join('\n')
    expect(names('python', source)).toEqual(['constant MAX', 'function f', 'class C', 'method m', 'method s'])
  })

  test('Go', () => {
    const source = [
      'package main',
      'const Max, Min = 1, 0',
      'var debug, _ = false, 0',
      'type Reader interface { Read() }',
      'type Point struct { X int }',
      'type ID string',
      'type Alias = int',
      'func Run() {}',
      'func (p Point) Len() int { return 0 }',
    ].join('\n')
    expect(names('go', source)).toEqual([
      'constant Max',
      'constant Min',
      'variable debug',
      'interface Reader',
      'struct Point',
      'type ID',
      'type Alias',
      'function Run',
      'method Len',
    ])
  })

  test('Rust', () => {
    const source = [
      'struct S;',
      'enum E { A }',
      'trait T { fn req(&self); fn provided(&self) {} }',
      'impl S { fn new() -> S { S } }',
      'mod m { fn inner() {} }',
      'fn free() {}',
      'type Alias = u8;',
      'const MAX: u8 = 1;',
      'static NAME: &str = "";',
      'macro_rules! mac { () => {} }',
    ].join('\n')
    expect(names('rust', source)).toEqual([
      'struct S',
      'enum E',
      'trait T',
      'method req',
      'method provided',
      'method new',
      'module m',
      'function inner',
      'function free',
      'type Alias',
      'constant MAX',
      'constant NAME',
      'macro mac',
    ])
  })

  test('Java', () => {
    const source = 'class A { void run() {} }\ninterface I {}\nenum E { X }\nrecord R(int x) {}\n@interface Note {}\n'
    expect(names('java', source)).toEqual(['class A', 'method run', 'interface I', 'enum E', 'class R', 'interface Note'])
  })

  test('C and C++', () => {
    const c = '#define MAX 1\n#define SQ(x) ((x)*(x))\nstruct point { int x; };\ntypedef int id;\nenum color { RED };\nint add(int a, int b);\nstatic char *name(void) { return 0; }\n'
    expect(names('c', c)).toEqual(['macro MAX', 'macro SQ', 'struct point', 'type id', 'enum color', 'function add', 'function name'])
    const cpp = [
      'namespace ns { class Widget { void draw(); ~Widget(); bool operator==(const Widget&); }; }',
      'void Widget::draw() { std::string s(name); Widget copy(*this); }',
      'void ns::Widget::draw() {}',
      'Widget::~Widget() {}',
      'namespace a::b {}',
      'using Size = int;',
    ].join('\n')
    expect(names('cpp', cpp)).toEqual([
      'module ns',
      'class Widget',
      'method draw',
      'method ~Widget',
      'method operator==',
      'method draw',
      'method draw',
      'method ~Widget',
      'module a::b',
      'type Size',
    ])
  })

  test('Ruby', () => {
    const source = 'module Util\n  VERSION = "1"\n  class Base\n    def run; end\n    def self.build; end\n    alias go run\n  end\nend\nclass A::B; end\n'
    expect(names('ruby', source)).toEqual(['module Util', 'constant VERSION', 'class Base', 'method run', 'method build', 'method go', 'class B'])
  })

  test('C#', () => {
    const source = 'namespace App.Core { class A { void Run() {} } struct P {} interface I {} enum E { X } record R(int X); delegate void D(); }\n'
    expect(names('csharp', source)).toEqual(['module App.Core', 'class A', 'method Run', 'struct P', 'interface I', 'enum E', 'class R', 'type D'])
  })
})

describe('qualified names', () => {
  function qualified(grammar: GrammarId, source: string): string[] {
    return extract(grammar, source).map(symbol => symbol.qualified ?? symbol.name)
  }

  test('members are named after the definitions around them', () => {
    expect(qualified('typescript', 'class Svc { run() {} f = () => 1 }\ninterface I { go(): void }\nnamespace N.M { function f() {} }')).toEqual([
      'Svc',
      'Svc.run',
      'Svc.f',
      'I',
      'I.go',
      'N.M',
      'N.M.f',
    ])
    expect(qualified('python', 'class A:\n  class B:\n    def m(self): pass\n  def n(self): pass\ndef f(): pass\n')).toEqual([
      'A',
      'A.B',
      'A.B.m',
      'A.n',
      'f',
    ])
    expect(qualified('java', 'class O { class In { void m() {} } void n() {} }')).toEqual(['O', 'O.In', 'O.In.m', 'O.n'])
    expect(qualified('csharp', 'namespace A.B { class C { void M() {} } }')).toEqual(['A.B', 'A.B.C', 'A.B.C.M'])
  })

  test('Go methods are named after their receiver, and Rust ones after their impl', () => {
    expect(qualified('go', 'package p\nfunc (m *Maint) deleteRows() {}\nfunc (s Set[T]) Add(v T) {}\nfunc Top() {}\n')).toEqual([
      'Maint.deleteRows',
      'Set.Add',
      'Top',
    ])
    expect(qualified('rust', 'mod m { impl<T> Foo<T> { fn new() {} } }\nimpl Display for &mut Bar { fn fmt() {} }\ntrait T { fn d() {} }')).toEqual([
      'm',
      'm::Foo::new',
      'Bar::fmt',
      'T',
      'T::d',
    ])
  })

  test('scopes written before a name count, at any depth', () => {
    expect(qualified('cpp', 'namespace ns { class K { void m(); }; }\nvoid A::B::C::d() {}\ntemplate<> void Foo<int>::bar() {}')).toEqual([
      'ns',
      'ns::K',
      'ns::K::m',
      'A::B::C::d',
      'Foo::bar',
    ])
    expect(qualified('ruby', 'module M\n  class A::B\n    def y; end\n  end\nend\n')).toEqual(['M', 'M::A::B', 'M::A::B::y'])
    expect(extract('ruby', 'class A::B; end').map(symbol => symbol.name)).toEqual(['B'])
  })
})

describe('positions', () => {
  test('lines are 1-based and columns count UTF-16 code units', () => {
    expect(extract('typescript', 'let s = "한글😀"; function 이름() {}\n\nclass B {}\n')).toEqual([
      { name: '이름', kind: 'function', line: 1, column: 25 },
      { name: 'B', kind: 'class', line: 3, column: 6 },
    ])
  })

  test('a file that does not parse still yields what it could read', () => {
    expect(names('go', 'package main\nfunc Ok() {}\nfunc (( {\n')).toContain('function Ok')
  })
})

describe('grammars', () => {
  test('a path picks its grammar by language', () => {
    expect(grammarFor('src/a.ts')).toBe('typescript')
    expect(grammarFor('src/a.tsx')).toBe('tsx')
    expect(grammarFor('a.mjs')).toBe('javascript')
    expect(grammarFor('lib/a.c')).toBe('c')
    expect(grammarFor('include/a.h')).toBe('cpp')
    expect(grammarFor('Rakefile')).toBe('ruby')
    expect(grammarFor('README.md')).toBeUndefined()
    expect(grammarFor('Main.kt')).toBeUndefined()
  })

  test('the languages symbol: covers', () => {
    expect(symbolLanguages()).toEqual(['C', 'C#', 'C++', 'Go', 'Java', 'JavaScript', 'Python', 'Ruby', 'Rust', 'TSX', 'TypeScript'])
  })
})
