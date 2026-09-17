// Where a model id lives in the YAML source.
//
// Analyzer diagnostics name model entities, not source positions. Most
// ids are declared as mapping keys; program-level ids — a transaction's
// `id:`, a step's `bind:`, an effect's `effect_id:` — are declared as
// the value of those keys instead. The declaring line is found by
// trying key position, then declaring-value position; references fall
// back to the first whole-word occurrence, wherever it is.

export interface SourceRange {
  from: number;
  to: number;
  line: number;
}

const escape = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export function locateId(source: string, id: string): SourceRange | null {
  if (!id) return null;
  const needle = escape(id);

  const asKey = new RegExp(`^[ \\t]*(?:-[ \\t]+)?(["']?)(${needle})\\1[ \\t]*:`, "m");
  const keyMatch = asKey.exec(source);
  if (keyMatch && keyMatch.index !== undefined) {
    const from = keyMatch.index + keyMatch[0].indexOf(keyMatch[2]);
    return { from, to: from + id.length, line: lineAt(source, from) };
  }

  const asDeclaringValue = new RegExp(
    `^[ \\t]*(?:-[ \\t]+)?(?:id|bind|effect_id)[ \\t]*:[ \\t]*(["']?)(${needle})\\1[ \\t]*$`,
    "m",
  );
  const valueMatch = asDeclaringValue.exec(source);
  if (valueMatch && valueMatch.index !== undefined) {
    const from = valueMatch.index + valueMatch[0].indexOf(valueMatch[2]);
    return { from, to: from + id.length, line: lineAt(source, from) };
  }

  const asWord = new RegExp(`(^|[^\\w.])(${needle})(?![\\w.])`, "m");
  const wordMatch = asWord.exec(source);
  if (wordMatch && wordMatch.index !== undefined) {
    const from = wordMatch.index + wordMatch[1].length;
    return { from, to: from + id.length, line: lineAt(source, from) };
  }

  return null;
}

/** 1-based line number of a character offset. */
export function lineAt(source: string, offset: number): number {
  let line = 1;
  for (let i = 0; i < offset && i < source.length; i++) {
    if (source.charCodeAt(i) === 10) line++;
  }
  return line;
}

/**
 * Document offset of a 1-based line and column, clamped to the text.
 *
 * The column counts Unicode characters, as the YAML parser reports them,
 * while a document offset counts UTF-16 code units — so the column is
 * walked by code point. On the overwhelmingly common all-BMP line the two
 * coincide, and the loop simply counts characters.
 */
export function offsetOf(source: string, line: number, column: number): number {
  let offset = 0;
  for (let current = 1; current < line; current++) {
    const next = source.indexOf("\n", offset);
    if (next < 0) return source.length;
    offset = next + 1;
  }

  const end = source.indexOf("\n", offset);
  const lineEnd = end < 0 ? source.length : end;

  let position = offset;
  for (let character = 1; character < column && position < lineEnd; character++) {
    // A surrogate pair is one character but two code units.
    position += source.codePointAt(position)! > 0xffff ? 2 : 1;
  }

  return Math.min(position, lineEnd);
}
