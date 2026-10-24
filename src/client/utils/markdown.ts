import { marked } from 'marked';
import hljs from 'highlight.js';

// Configure marked with GFM and code highlighting
marked.setOptions({
  gfm: true,
  breaks: false,
  highlight: (code: string, lang: string) => {
    if (lang && hljs.getLanguage(lang)) {
      try {
        return hljs.highlight(code, { language: lang }).value;
      } catch (err) {
        console.error('[dsh-md-live] Highlight error:', err);
      }
    }
    return hljs.highlightAuto(code).value;
  },
});

export interface TOCItem {
  level: number;
  text: string;
  id: string;
}

export function renderMarkdown(content: string): string {
  return marked.parse(content) as string;
}

export function extractTOC(content: string): TOCItem[] {
  const headings: TOCItem[] = [];
  const used = new Map<string, number>();
  const lines = content.split('\n');
  const headingRegex = /^(#{1,6})\s+(.+)$/;

  for (const line of lines) {
    const match = line.match(headingRegex);
    if (match) {
      const level = match[1].length;
      const text = match[2].trim();
      const slug = text
        .toLowerCase()
        .replace(/[^\w\u4e00-\u9fa5\s-]/g, '')
        .replace(/\s+/g, '-') || 'section';

      // Duplicate headings must still get distinct anchors, or the TOC would
      // scroll every entry to the first one.
      const seen = used.get(slug) ?? 0;
      used.set(slug, seen + 1);
      const id = seen === 0 ? slug : `${slug}-${seen}`;

      headings.push({ level, text, id });
    }
  }

  return headings;
}

/**
 * Attach the TOC's anchors to the rendered headings.
 *
 * `marked` emits `<h1>`…`<h6>` without ids, so the TOC could not scroll to
 * anything. Headings appear in the same order in the source and in the output,
 * which lets the two lists line up positionally.
 *
 * @param html - rendered Markdown.
 * @param headings - the same document's TOC entries.
 * @returns html whose headings carry the TOC's ids.
 */
export function withHeadingIds(html: string, headings: TOCItem[]): string {
  let index = 0;
  return html.replace(/<h([1-6])([^>]*)>/g, (whole, level: string, attrs: string) => {
    const heading = headings[index];
    index += 1;
    if (!heading || /\sid=/.test(attrs)) return whole;
    return `<h${level}${attrs} id="${heading.id}">`;
  });
}

export function sanitizeHtml(html: string): string {
  // Basic sanitization - in production, use DOMPurify
  return html
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/on\w+="[^"]*"/gi, '')
    .replace(/on\w+='[^']*'/gi, '');
}
