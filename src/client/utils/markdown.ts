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

/** Whether a path names a document this tab can render itself. */
export function isMarkdownPath(path: string): boolean {
  return /\.(md|markdown|mdx)$/i.test(path);
}

/**
 * Collapse `.` and `..` without touching the filesystem.
 *
 * @param path - a `/`-separated path, absolute or relative.
 * @returns the same path with empty, `.` and backtracked segments removed.
 */
function normalizeSegments(path: string): string {
  const parts = path.split('/');
  const drive = /^[a-z]:$/i.test(parts[0] ?? '') ? parts.shift()! : null;
  const absolute = drive !== null || parts[0] === '';
  const stack: string[] = [];
  for (const part of parts) {
    if (part === '' || part === '.') continue;
    if (part === '..') {
      stack.pop();
      continue;
    }
    stack.push(part);
  }
  const joined = stack.join('/');
  if (drive !== null) return `${drive}/${joined}`;
  return absolute ? `/${joined}` : joined;
}

/**
 * Resolve one authored destination against the document that contains it.
 *
 * A Markdown file refers to its neighbours relatively (`./img/a.png`,
 * `../guide.md`), but this tab opens one file at a time with no base URL of its
 * own, so the browser would resolve those against the page and 404. The
 * document's own absolute path is the base that makes them mean what the author
 * meant.
 *
 * @param docPath - the containing document, as an absolute path.
 * @param destination - the raw `href` or `src` value.
 * @returns an absolute path, or `null` when the destination is not a workspace
 *   path (a URL scheme, a protocol-relative URL, or empty).
 */
export function resolveDocPath(docPath: string, destination: string): string | null {
  let value = destination.trim();
  if (!value) return null;
  const cut = value.search(/[?#]/);
  if (cut !== -1) value = value.slice(0, cut);
  if (!value) return null;
  try {
    value = decodeURIComponent(value);
  } catch {
    /* a malformed escape is kept as written */
  }
  // Any scheme but a Windows drive is not a workspace path.
  if (/^[a-z][a-z\d+.-]*:/i.test(value) && !/^[a-z]:[\\/]/i.test(value)) return null;
  const normalized = value.replace(/\\/g, '/');
  if (normalized.startsWith('//')) return null;
  const absolute = normalized.startsWith('/') || /^[a-z]:\//i.test(normalized);
  const base = absolute ? '' : docPath.replace(/\\/g, '/').replace(/[^/]*$/, '');
  return normalizeSegments(`${base}${normalized}`);
}

/**
 * Build the Host URL that serves one workspace file's bytes.
 *
 * This is the same address the official document preview uses: the web server
 * answers `api/file?path=<absolute path>` with the file itself, which is what
 * lets an `<img>` show a PNG that lives next to the Markdown.
 *
 * @param base - the page's base URI.
 * @param path - an absolute path in the Host filesystem.
 * @returns the URL, or `null` when the transport or path cannot carry one.
 */
export function mediaUrl(base: string, path: string): string | null {
  if (!base) return null;
  if (!/^https?:/i.test(base) && !base.startsWith('dsh-app://app/')) return null;
  if (!/^([a-z]:[\\/]|\/)/i.test(path) || /^[/\\]{2}/.test(path)) return null;
  if (/[\u0000-\u001f\u007f]/.test(path)) return null;
  try {
    return new URL(`api/file?path=${encodeURIComponent(path)}`, base).href;
  } catch {
    return null;
  }
}

/**
 * Point a rendered document's relative images at the Host's file endpoint.
 *
 * Runs on the HTML string rather than the live DOM: the browser starts fetching
 * images the moment the markup lands, so a post-mount fixup would show a broken
 * image first and a working one second. Images that are already absolute,
 * remote, or unparseable are left exactly as written.
 *
 * @param html - rendered Markdown.
 * @param docPath - the containing document, as an absolute path.
 * @param base - the page's base URI.
 * @returns the same HTML with resolvable `src` values rewritten.
 */
export function resolveImageUrls(html: string, docPath: string, base: string): string {
  if (!html || !docPath || !base) return html;
  return html.replace(/<img\b[^>]*>/gi, (tag) =>
    tag.replace(/(\ssrc\s*=\s*)(["'])(.*?)\2/i, (whole, lead: string, quote: string, value: string) => {
      // `marked` escapes `&` inside attribute values; undo that before parsing.
      const destination = value.replace(/&amp;/gi, '&');
      const absolute = resolveDocPath(docPath, destination);
      if (!absolute) return whole;
      const url = mediaUrl(base, absolute);
      return url ? `${lead}${quote}${url}${quote}` : whole;
    }),
  );
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
    // DOMPurify's default scheme list knows nothing about the addresses this
    // app actually serves files from. Without these two, a rewritten image src
    // is stripped as an unknown scheme and the picture silently disappears —
    // and it only happens in the desktop shell, never in a browser.
    ALLOWED_URI_REGEXP:
      /^(?:(?:https?|mailto|tel|callto|sms|cid|xmpp|dsh-app|dsh-resource):|[^a-z]|[a-z+.-]+(?:[^a-z+.\-:]|$))/i,
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
