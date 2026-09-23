// Tokenizer + command-list/pipeline parser. Iterative single pass, no recursion.
//
// Grammar (subset of bash): list := pipeline ((';' | '&&' | '||') pipeline)* [';']
//                           pipeline := command ('|' command)*
// Quotes: '...' literal, "..." with \" \\ \$ escapes, backslash escapes outside quotes.
// `$NAME`, `${NAME}` and `$?` outside single quotes become markers that `expand()` fills
// at execution time (so `$?` sees the status of the previous command).

export type Pipeline = string[][];
export interface Chain {
  op: ';' | '&&' | '||' | null;
  pipeline: Pipeline;
}

export class ParseError extends Error {
  constructor(
    message: string,
    /** The offending token, or the open quote char for 'unterminated quote'. */
    public token = '',
  ) {
    super(message);
    this.name = 'ParseError';
  }
}

const VO = '';
const VC = '';
const NAME_START = /[A-Za-z_]/;
const NAME_CHAR = /[A-Za-z0-9_]/;

type Op = ';' | '&&' | '||' | '|';

export function parse(raw: string): Chain[] {
  const input = raw.replace(/[]/g, '');
  const chains: Chain[] = [];
  let pipeline: Pipeline = [];
  let cmd: string[] = [];
  let word = '';
  let inWord = false;
  let pendingOp: Chain['op'] = null;
  let lastOp: Op | null = null; // operator seen with no command after it yet

  const endWord = () => {
    if (inWord) cmd.push(word);
    word = '';
    inWord = false;
  };
  const endCommand = (op: Op) => {
    endWord();
    if (cmd.length === 0) throw new ParseError(`syntax error near unexpected token \`${op}'`, op);
    pipeline.push(cmd);
    cmd = [];
    lastOp = op;
  };
  const endPipeline = (op: Exclude<Op, '|'>) => {
    endCommand(op);
    chains.push({ op: pendingOp, pipeline });
    pipeline = [];
    pendingOp = op;
  };
  // Reads $NAME / ${NAME} / $? at i (input[i] === '$'); returns the new index or -1.
  const readVar = (i: number): number => {
    const n = input[i + 1];
    if (n === '?') {
      word += VO + '?' + VC;
      return i + 2;
    }
    if (n === '{') {
      const close = input.indexOf('}', i + 2);
      const name = close > 0 ? input.slice(i + 2, close) : '';
      if (name && NAME_START.test(name[0]) && [...name].every((c) => NAME_CHAR.test(c))) {
        word += VO + name + VC;
        return close + 1;
      }
      return -1;
    }
    if (n && NAME_START.test(n)) {
      let j = i + 1;
      while (j < input.length && NAME_CHAR.test(input[j])) j++;
      word += VO + input.slice(i + 1, j) + VC;
      return j;
    }
    return -1;
  };

  let i = 0;
  while (i < input.length) {
    const c = input[i];
    if (c === ' ' || c === '\t' || c === '\n') {
      endWord();
      i++;
    } else if (c === '|' && input[i + 1] === '|') {
      endPipeline('||');
      i += 2;
    } else if (c === '&' && input[i + 1] === '&') {
      endPipeline('&&');
      i += 2;
    } else if (c === '|') {
      endCommand('|');
      i++;
    } else if (c === ';') {
      endPipeline(';');
      i++;
    } else if (c === "'") {
      const close = input.indexOf("'", i + 1);
      if (close < 0) throw new ParseError('unterminated quote', "'");
      word += input.slice(i + 1, close);
      inWord = true;
      i = close + 1;
      lastOp = null;
    } else if (c === '"') {
      inWord = true;
      lastOp = null;
      i++;
      let closed = false;
      while (i < input.length) {
        const d = input[i];
        if (d === '"') {
          closed = true;
          i++;
          break;
        }
        if (d === '\\' && i + 1 < input.length && '"\\$'.includes(input[i + 1])) {
          word += input[i + 1];
          i += 2;
        } else if (d === '$') {
          const j = readVar(i);
          if (j < 0) {
            word += '$';
            i++;
          } else i = j;
        } else {
          word += d;
          i++;
        }
      }
      if (!closed) throw new ParseError('unterminated quote', '"');
    } else if (c === '\\') {
      if (i + 1 < input.length) word += input[i + 1];
      inWord = true;
      lastOp = null;
      i += 2;
    } else if (c === '$') {
      const j = readVar(i);
      inWord = true;
      lastOp = null;
      if (j < 0) {
        word += '$';
        i++;
      } else i = j;
    } else {
      word += c;
      inWord = true;
      lastOp = null;
      i++;
    }
  }

  endWord();
  if (cmd.length) {
    pipeline.push(cmd);
    chains.push({ op: pendingOp, pipeline });
  } else if (lastOp && lastOp !== ';') {
    throw new ParseError(`syntax error near unexpected token \`${lastOp}'`, lastOp);
  }
  return chains;
}

/** Replaces variable markers left by `parse` with values from `env` (unknown → ''). */
export function expand(word: string, env: (name: string) => string | undefined): string {
  if (!word.includes(VO)) return word;
  return word.replace(/([^]*)/g, (_, name: string) => env(name) ?? '');
}
