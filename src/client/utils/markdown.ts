import { marked } from 'marked';
import DOMPurifyImport from 'dompurify';
import hljs from 'highlight.js/lib/core';

// Only the languages a Markdown document realistically carries. The full
// highlight.js bundle is ~1.6 MB; this keeps the plugin bundle an order of
// magnitude smaller. An unregistered language simply renders unstyled.
import bash from 'highlight.js/lib/languages/bash';
import c from 'highlight.js/lib/languages/c';
import cpp from 'highlight.js/lib/languages/cpp';
import csharp from 'highlight.js/lib/languages/csharp';
import css from 'highlight.js/lib/languages/css';
import diff from 'highlight.js/lib/languages/diff';
import go from 'highlight.js/lib/languages/go';
import ini from 'highlight.js/lib/languages/ini';
import java from 'highlight.js/lib/languages/java';
import javascript from 'highlight.js/lib/languages/javascript';
import json from 'highlight.js/lib/languages/json';
import kotlin from 'highlight.js/lib/languages/kotlin';
import lua from 'highlight.js/lib/languages/lua';
import markdown from 'highlight.js/lib/languages/markdown';
import perl from 'highlight.js/lib/languages/perl';
import php from 'highlight.js/lib/languages/php';
import python from 'highlight.js/lib/languages/python';
import r from 'highlight.js/lib/languages/r';
import ruby from 'highlight.js/lib/languages/ruby';
import rust from 'highlight.js/lib/languages/rust';
import scss from 'highlight.js/lib/languages/scss';
import shell from 'highlight.js/lib/languages/shell';
import sql from 'highlight.js/lib/languages/sql';
import swift from 'highlight.js/lib/languages/swift';
import typescript from 'highlight.js/lib/languages/typescript';
import xml from 'highlight.js/lib/languages/xml';
import yaml from 'highlight.js/lib/languages/yaml';

const LANGUAGES: Record<string, any> = {
  bash, sh: shell, shell, c, cpp, 'c++': cpp, csharp, 'c#': csharp, css, diff,
  go, ini, toml: ini, java, javascript, js: javascript, jsx: javascript,
  json, kotlin, lua, markdown, md: markdown, perl, php, python, py: python,
  r, ruby, rust, scss, sql, swift, typescript, ts: typescript, tsx: typescript,
  html: xml, xml, vue: xml, yaml, yml: yaml,
};

for (const [name, definition] of Object.entries(LANGUAGES)) {
  hljs.registerLanguage(name, definition);
}

/**
 * Resolve the DOMPurify instance across module interop shapes.
 *
 * The package ships both an ESM instance and a callable factory, and the
 * factory binds to whatever `window` exists when it runs. Resolving lazily with
 * an explicit window avoids the case where the bundle is evaluated before the
 * page DOM is ready — an unsupported instance silently passes HTML through, so
 * a wrong answer here must never be treated as "safe".
 */
let cachedPurifier: any = null;

function resolvePurifier(): { sanitize: (html: string, config?: any) => string } | null {
  if (cachedPurifier) return cachedPurifier;
  const candidate: any = DOMPurifyImport;
  const supported = (instance: any) =>
    instance && typeof instance.sanitize === 'function' && instance.isSupported !== false;

  if (typeof candidate === 'function' && typeof window !== 'undefined') {
    try {
      const instance = candidate(window);
      if (supported(instance)) cachedPurifier = instance;
    } catch {
      /* fall through */
    }
  }
  if (!cachedPurifier && supported(candidate)) cachedPurifier = candidate;
  if (!cachedPurifier && supported(candidate?.default)) cachedPurifier = candidate.default;
  return cachedPurifier;
}

/** Last-resort strip when DOMPurify cannot be constructed. */
function stripUnsafe(html: string): string {
  return html
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '')
    .replace(/\son\w+\s*=\s*"[^"]*"/gi, '')
    .replace(/\son\w+\s*=\s*'[^']*'/gi, '')
    .replace(/\s(href|src)\s*=\s*"javascript:[^"]*"/gi, ' $1="#"');
}

// GitHub-flavoured Markdown. The `highlight` option marked once took was
// removed in marked v8, so highlighting happens on the rendered DOM instead —
// see `highlightWithin`.
marked.setOptions({
  gfm: true,
  breaks: false,
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

/**
 * Sanitize rendered Markdown.
 *
 * File contents are not trusted input: a `.md` in the workspace can carry raw
 * HTML, and the result is injected with `dangerouslySetInnerHTML`. DOMPurify
 * runs with the HTML profile only — no SVG or MathML surface — and keeps the
 * `id` attributes the TOC depends on.
 *
 * @param html - rendered Markdown.
 * @returns the same HTML with scripts, event handlers and unsafe URLs removed.
 */
export function sanitizeHtml(html: string): string {
  if (typeof window === 'undefined') return html;
  const purifier = resolvePurifier();
  if (!purifier) return stripUnsafe(html);
  return purifier.sanitize(html, {
    USE_PROFILES: { html: true },
    ADD_ATTR: ['id', 'target', 'rel'],
  });
}

/**
 * Highlight every code block inside a rendered preview.
 *
 * marked emits plain `<pre><code class="language-x">`; highlighting is applied
 * to the live DOM afterwards, so re-rendering the HTML re-highlights naturally
 * and the Markdown string itself stays cacheable.
 *
 * @param root - the container holding the rendered Markdown.
 */
export function highlightWithin(root: HTMLElement | null): void {
  if (!root) return;
  for (const block of Array.from(root.querySelectorAll('pre code'))) {
    const element = block as HTMLElement;
    if (element.dataset.highlighted === 'yes') continue;
    try {
      hljs.highlightElement(element);
    } catch (err) {
      console.error('[dsh-md-live] Highlight error:', err);
    }
  }
}
