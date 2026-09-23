import { describe, expect, it } from 'vitest';
import { expand, parse, ParseError } from '../../../src/term/parse';

describe('parse', () => {
  it('parses a simple command', () => {
    expect(parse('ls -la ~/monitor')).toEqual([{ op: null, pipeline: [['ls', '-la', '~/monitor']] }]);
  });

  it('handles double and single quotes', () => {
    expect(parse(`echo "a b" 'c d'`)[0].pipeline[0]).toEqual(['echo', 'a b', 'c d']);
  });

  it('keeps empty quoted args and joins adjacent quoted parts', () => {
    expect(parse(`echo '' a"b c"'d'`)[0].pipeline[0]).toEqual(['echo', '', 'ab cd']);
  });

  it('handles backslash escapes outside and inside double quotes', () => {
    expect(parse(String.raw`echo a\ b "x\"y" 'p\q'`)[0].pipeline[0]).toEqual(['echo', 'a b', 'x"y', String.raw`p\q`]);
  });

  it('keeps operator characters inside quotes literal', () => {
    expect(parse(`echo "a | b && c; d"`)[0].pipeline[0]).toEqual(['echo', 'a | b && c; d']);
  });

  it('splits && || ; in order', () => {
    const r = parse('a && b || c; d');
    expect(r.map((c) => c.op)).toEqual([null, '&&', '||', ';']);
    expect(r.map((c) => c.pipeline[0][0])).toEqual(['a', 'b', 'c', 'd']);
  });

  it('operators need no surrounding spaces', () => {
    expect(parse('a&&b||c;d|e').map((c) => c.pipeline)).toEqual([[['a']], [['b']], [['c']], [['d'], ['e']]]);
  });

  it('builds pipelines', () => {
    expect(parse('cat x | grep y | wc -l')).toEqual([
      { op: null, pipeline: [['cat', 'x'], ['grep', 'y'], ['wc', '-l']] },
    ]);
  });

  it('throws on an unterminated quote', () => {
    expect(() => parse('echo "abc')).toThrow(ParseError);
    expect(() => parse("echo 'abc")).toThrow('unterminated quote');
  });

  it('returns [] for empty or blank input', () => {
    expect(parse('')).toEqual([]);
    expect(parse('   \t ')).toEqual([]);
  });

  it('ignores a trailing ;', () => {
    expect(parse('ls;')).toEqual([{ op: null, pipeline: [['ls']] }]);
  });

  it('rejects a leading or dangling operator', () => {
    expect(() => parse('&& ls')).toThrow(ParseError);
    expect(() => parse('ls |')).toThrow(ParseError);
    expect(() => parse('ls && || pwd')).toThrow(ParseError);
    expect(() => parse('ls | | wc')).toThrow(ParseError);
  });

  it('treats a lone & as a literal character', () => {
    expect(parse('echo a&b')[0].pipeline[0]).toEqual(['echo', 'a&b']);
  });

  it('is iterative: a huge input does not blow the stack', () => {
    const big = Array.from({ length: 20000 }, () => 'a').join(' && ');
    expect(parse(big)).toHaveLength(20000);
  });

  it('expands $VARS in unquoted and double-quoted text, not in single quotes', () => {
    const env = (n: string) => ({ USER: 'alxnko', '?': '0' })[n];
    const [w1, w2, w3, w4] = parse(`$USER "x $USER" '$USER' \${USER}! $? $NOPE`)[0].pipeline[0].map((w) => expand(w, env));
    expect([w1, w2, w3, w4]).toEqual(['alxnko', 'x alxnko', '$USER', 'alxnko!']);
    const rest = parse('$? $NOPE')[0].pipeline[0].map((w) => expand(w, env));
    expect(rest).toEqual(['0', '']);
  });

  it('keeps a bare $ literal', () => {
    expect(parse('echo $ a$')[0].pipeline[0].map((w) => expand(w, () => 'X'))).toEqual(['echo', '$', 'a$']);
  });
});
