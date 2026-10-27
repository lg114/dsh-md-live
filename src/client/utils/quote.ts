/**
 * Turning a text selection into a blockquote for the composer.
 *
 * The panel does not type into the composer itself: it hands one string to the
 * Session input facade, and the facade inserts it at the caret in a single undo
 * step. That means the string has to be finished here — the excerpt quoted
 * line by line, a blank line, the source line, and the spacing that keeps the
 * caret on a fresh line whether the insertion lands at the end of a draft or in
 * the middle of a sentence.
 */

/** Collapse CRLF, trim trailing whitespace, and drop leading/trailing blank lines. */
function cleanExcerpt(excerpt: string): string[] {
  const lines = excerpt.replace(/\r\n?/g, '\n').split('\n').map((line) => line.replace(/\s+$/, ''));
  let start = 0;
  let end = lines.length;
  while (start < end && lines[start].trim() === '') start += 1;
  while (end > start && lines[end - 1].trim() === '') end -= 1;
  return lines.slice(start, end);
}

/**
 * Render the excerpt as one blockquote.
 *
 * Empty lines become `>`, so a quote that spans paragraphs stays a single quote
 * block instead of breaking into loose text.
 *
 * @param excerpt - the selected text.
 * @returns the quoted lines, or an empty string when nothing is left.
 */
export function quoteExcerpt(excerpt: string): string {
  return cleanExcerpt(excerpt)
    .map((line) => (line.length === 0 ? '>' : `> ${line}`))
    .join('\n');
}

/**
 * Build the string to insert into the draft.
 *
 * @param excerpt - the selected text.
 * @param attribution - the already-localized source line (e.g. "— from `a.md`").
 * @param draft - the draft the insertion lands in, for spacing.
 * @param start - caret/selection start offset in `draft`.
 * @param end - selection end offset in `draft`.
 * @returns the text to insert, ending with a newline.
 */
export function quoteInsertion(
  excerpt: string,
  attribution: string,
  draft: string,
  start: number,
  end: number,
): string {
  const quoted = quoteExcerpt(excerpt);
  if (!quoted) return '';
  const before = draft.slice(0, start);
  const after = draft.slice(end);
  // A quote after a newline starts on its own line; after text it needs the
  // blank line that keeps it a blockquote rather than a lazy continuation.
  const lead = before === '' || before.endsWith('\n') ? '' : '\n\n';
  // Leave the caret on a fresh line; when text follows the caret, keep a blank
  // line between the quote and it so neither swallows the other.
  const tail = after === '' ? '\n' : '\n\n';
  return `${lead}${quoted}\n\n${attribution}${tail}`;
}
