import { marked } from 'marked';
import DOMPurifyImport from 'dompurify';
import hljs from 'highlight.js/lib/core';
import { fallbackT, type Translate } from '../locales';

declare const require: { (id: string): unknown; async(id: string): Promise<unknown> };

interface Purifier {
  sanitize: (html: string, config?: Record<string, unknown>) => string;
  addHook?: (hook: string, fn: (node: Element) => void) => void;
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
let cachedPurifier: Purifier | null = null;

function resolvePurifier(): Purifier | null {
  if (cachedPurifier) return cachedPurifier;
  const candidate = DOMPurifyImport as unknown;
  const isSupported = (instance: unknown): boolean =>
    !!instance && typeof (instance as Purifier).sanitize === 'function' && (instance as { isSupported?: boolean }).isSupported !== false;

  if (typeof candidate === 'function' && typeof window !== 'undefined') {
    try {
      const instance = (candidate as (win: Window) => Purifier)(window);
      if (isSupported(instance)) cachedPurifier = instance;
    } catch {
      /* fall through */
    }
  }
  if (!cachedPurifier && isSupported(candidate)) cachedPurifier = candidate as Purifier;
  if (!cachedPurifier && isSupported((candidate as { default?: unknown })?.default)) cachedPurifier = (candidate as { default: Purifier }).default;
  if (cachedPurifier && typeof cachedPurifier.addHook === 'function') {
    cachedPurifier.addHook('afterSanitizeAttributes', (node: Element) => {
      if (node.tagName === 'A' && node.hasAttribute('target')) {
        const existing = node.getAttribute('rel') || '';
        const tokens = new Set(existing.split(/\s+/).filter(Boolean));
        tokens.add('noopener');
        tokens.add('noreferrer');
        node.setAttribute('rel', Array.from(tokens).join(' '));
      }
    });
  }
  return cachedPurifier;
}

/**
 * Escape HTML as plain text when DOMPurify cannot be constructed.
 *
 * This is fail-closed: rather than attempt a regex-based strip that might miss
 * an attack vector, the entire content is escaped so nothing dangerous can
 * execute. The reader sees the raw markup instead of a compromised page.
 */
function escapeAsText(html: string): string {
  return html
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// GitHub-flavoured Markdown. The `highlight` option marked once took was
// removed in marked v8, so highlighting happens on the rendered DOM instead —
// see `highlightWithin`.
marked.setOptions({
  gfm: true,
  breaks: false,
});

/** Escape a string for use inside a double-quoted HTML attribute. */
function escapeAttribute(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/**
 * A math expression, left as a placeholder for the DOM pass to fill in.
 *
 * Rendering KaTeX here would mean shipping its markup through DOMPurify, which
 * has no reason to trust it and every reason to rewrite it. A placeholder costs
 * one attribute and keeps the sanitiser's job unchanged; `renderMathWithin`
 * then draws into the element that survived.
 *
 * @param tex - the expression, as authored.
 * @param display - whether it stood on its own line.
 * @returns the placeholder element.
 */
function mathPlaceholder(tex: string, display: boolean): string {
  const displayAttribute = display ? ' data-display="1"' : '';
  return `<span class="md-live-math"${displayAttribute} data-tex="${escapeAttribute(tex)}"></span>`;
}

// `$…$` and `$$…$$`. Extensions rather than a text pass, so an expression
// inside a code span or fence is left alone: those are tokenised first.
marked.use({
  extensions: [
    {
      name: 'inlineMath',
      level: 'inline',
      start(source: string) {
        return source.indexOf('$');
      },
      tokenizer(source: string) {
        const match = /^\$(?!\$)((?:\\.|[^\\$\n])+?)\$(?!\d)/.exec(source);
        if (!match) return undefined;
        // `$5 and $10` is money, not math: real inline math hugs its delimiters.
        if (/^\s|\s$/.test(match[1])) return undefined;
        return { type: 'inlineMath', raw: match[0], text: match[1] };
      },
      renderer(token: { text: string }) {
        return mathPlaceholder(token.text, false);
      },
    },
    {
      name: 'blockMath',
      level: 'block',
      start(source: string) {
        return source.indexOf('$$');
      },
      tokenizer(source: string) {
        const match = /^\$\$\n?([\s\S]+?)\n?\$\$[ \t]*(?:\n+|$)/.exec(source);
        if (!match) return undefined;
        return { type: 'blockMath', raw: match[0], text: match[1] };
      },
      renderer(token: { text: string }) {
        return mathPlaceholder(token.text, true);
      },
    },
  ],
});

let katexChunkPromise: Promise<{ renderMathWithin: (root: HTMLElement) => void }> | null = null;

/**
 * Draw every math placeholder inside a rendered document.
 *
 * KaTeX lives in a separate chunk (`client.katex.js`) loaded on demand: most
 * documents carry no math at all, and the 380 KB library should not block the
 * initial render for them. The first call kicks off the load; subsequent calls
 * reuse the same promise and patch the DOM as soon as the chunk arrives.
 *
 * @param root - the container holding the rendered Markdown.
 */
export async function renderMathWithin(root: HTMLElement | null): Promise<void> {
  if (!root) return;
  if (!root.querySelector('.md-live-math:not([data-rendered="1"])')) return;
  if (!katexChunkPromise) {
    katexChunkPromise = require.async('./client.katex.js');
  }
  try {
    const chunk = await katexChunkPromise;
    chunk.renderMathWithin(root);
  } catch (err) {
    console.error('[dsh-md-live] KaTeX chunk load failed:', err);
  }
}

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

/** A document split into its leading metadata block and the prose below it. */
export interface SplitDocument {
  /** The YAML between the delimiters, or `null` when there is none. */
  meta: string | null;
  /** Everything after the closing delimiter — what the reader came for. */
  body: string;
}

/**
 * Separate a leading YAML front-matter block from the document.
 *
 * Rendered as Markdown, `---` is a horizontal rule and `title: x` is a
 * paragraph, so a document with metadata opens with a stray line and a rule.
 * The block is metadata, not prose: it is pulled out and shown on its own.
 *
 * @param content - the whole file.
 * @returns the metadata block and the body; both are the input when there is
 *   no closing delimiter, because then the `---` really was a rule.
 */
export function splitFrontmatter(content: string): SplitDocument {
  const text = content.replace(/^\uFEFF/, '');
  const open = /^---[ \t]*\r?\n/.exec(text);
  if (!open) return { meta: null, body: content };
  const lines = text.slice(open[0].length).split(/\r?\n/);
  // A real front-matter block is short. Past this, the opening `---` was a rule.
  for (let index = 0; index < lines.length && index < 200; index += 1) {
    if (/^(---|\.\.\.)[ \t]*$/.test(lines[index])) {
      return {
        meta: lines.slice(0, index).join('\n').trim(),
        body: lines.slice(index + 1).join('\n'),
      };
    }
  }
  return { meta: null, body: content };
}

/**
 * Copy one string, preferring the async clipboard and falling back to a
 * throwaway selection for browsers that refuse it.
 *
 * @param text - what to put on the clipboard.
 * @returns whether the copy is known to have succeeded.
 */
export async function copyText(text: string): Promise<boolean> {
  try {
    if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    /* permission denied or an insecure context: try the old way */
  }
  if (typeof document === 'undefined') return false;
  try {
    const area = document.createElement('textarea');
    area.value = text;
    area.setAttribute('readonly', '');
    area.style.position = 'fixed';
    area.style.top = '-1000px';
    area.style.opacity = '0';
    document.body.appendChild(area);
    area.select();
    const copied = typeof document.execCommand === 'function' && document.execCommand('copy');
    document.body.removeChild(area);
    return Boolean(copied);
  } catch {
    return false;
  }
}

/** The language a code block declared, from its `language-x` class. */
function codeLanguage(code: HTMLElement): string {
  const match = /(?:^|\s)language-([\w+#-]+)/i.exec(code.className);
  return match ? match[1] : '';
}

/**
 * Give every code block a language label and a copy control.
 *
 * The bar is injected into the live DOM rather than into the Markdown, so it
 * never ends up in the text a reader copies, and a re-render simply rebuilds
 * it — the same contract `highlightWithin` works under.
 *
 * @param root - the container holding the rendered Markdown.
 * @param t - the locale seat; Chinese when the caller has no locale service.
 */
export function decorateCodeBlocks(root: HTMLElement | null, t: Translate = fallbackT): void {
  if (!root) return;
  for (const block of Array.from(root.querySelectorAll('pre'))) {
    const pre = block as HTMLElement;
    if (pre.dataset.mdLiveBar === '1') continue;
    const code = pre.querySelector('code');
    if (!code) continue;
    pre.dataset.mdLiveBar = '1';

    const bar = document.createElement('div');
    bar.className = 'md-live-code-bar';

    const language = codeLanguage(code as HTMLElement);
    if (language) {
      const label = document.createElement('span');
      label.className = 'md-live-code-lang';
      label.textContent = language;
      bar.appendChild(label);
    }

    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'md-live-code-copy';
    button.textContent = t('code.copy');
    button.title = t('code.copyTitle');
    button.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      // Marked leaves a newline before `</code>`; carrying it into a paste is
      // how a copied command ends up running itself in a terminal.
      const text = (code.textContent ?? '').replace(/\n+$/, '');
      void copyText(text).then((ok) => {
        button.textContent = ok ? t('code.copied') : t('code.copyFailed');
        button.dataset.state = ok ? 'done' : 'failed';
        setTimeout(() => {
          button.textContent = t('code.copy');
          delete button.dataset.state;
        }, 1200);
      });
    });
    bar.appendChild(button);

    pre.appendChild(bar);
  }
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
 * The directory part of a path, `/`-separated, or `''` for a bare name.
 *
 * @param path - any path.
 * @returns everything before the last separator.
 */
export function directoryOf(path: string): string {
  const normalized = path.replace(/\\/g, '/');
  const cut = normalized.lastIndexOf('/');
  return cut === -1 ? '' : normalized.slice(0, cut);
}

/**
 * Resolve one authored destination against a base directory.
 *
 * A Markdown file refers to its neighbours relatively (`./img/a.png`,
 * `../guide.md`), but this tab opens one file at a time with no base URL of its
 * own, so the browser would resolve those against the page and 404. The
 * document's own directory — or, for a tool call, the Session's workspace — is
 * the base that makes them mean what the author meant.
 *
 * @param baseDir - the directory a relative destination is read against.
 * @param destination - the raw `href`, `src`, or tool argument.
 * @returns an absolute path, or `null` when the destination is not a workspace
 *   path (a URL scheme, a protocol-relative URL, or empty).
 */
export function resolvePath(baseDir: string, destination: string): string | null {
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
  const base = absolute ? '' : `${baseDir.replace(/\\/g, '/').replace(/\/+$/, '')}/`;
  return normalizeSegments(`${base}${normalized}`);
}

/**
 * Resolve one destination against the document that contains it.
 *
 * @param docPath - the containing document, as an absolute path.
 * @param destination - the raw `href` or `src` value.
 * @returns an absolute path, or `null` for a destination that is not one.
 */
export function resolveDocPath(docPath: string, destination: string): string | null {
  return resolvePath(directoryOf(docPath), destination);
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

/**
 * Generate a URL-friendly slug from heading text.
 *
 * Lowercases, strips characters that are not word characters, CJK ideographs,
 * or whitespace, then collapses whitespace runs into single hyphens. The
 * result matches the convention GitHub and other renderers use for heading
 * anchors, so cross-references written by hand keep working.
 *
 * @param text - the heading's visible text.
 * @returns a slug suitable for use as an HTML id.
 */
function slugifyHeading(text: string): string {
  const slug = text
    .toLowerCase()
    .replace(/[^\w\u4e00-\u9fa5\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
  return slug || 'section';
}

/**
 * Assign ids to every heading in sanitized HTML and extract the TOC.
 *
 * A single DOMParser pass replaces the old two-step approach (line-regex
 * extraction on source + positional HTML replacement on output). That approach
 * assumed "source heading count == rendered heading count, same order", which
 * broke for setext headings, code-fence comments that look like headings,
 * blockquote headings, and raw HTML headings. Walking the rendered DOM is the
 * only source of truth that cannot disagree with what the reader sees.
 *
 * Headings that already carry an id (from raw HTML in the source) keep it;
 * the id is still recorded in the dedup map so a later generated slug that
 * collides with it gets a suffix.
 *
 * @param html - sanitized rendered Markdown.
 * @returns the HTML with ids assigned and the TOC items extracted.
 */
export function assignHeadingIdsAndExtractTOC(html: string): { html: string; toc: TOCItem[] } {
  if (typeof window === 'undefined' || typeof window.DOMParser === 'undefined') return { html, toc: [] };
  const parser = new window.DOMParser();
  const doc = parser.parseFromString(html, 'text/html');
  const headings = doc.querySelectorAll('h1,h2,h3,h4,h5,h6');
  const toc: TOCItem[] = [];
  const used = new Map<string, number>();

  for (const node of headings) {
    const el = node as HTMLElement;
    const level = Number(el.tagName.charAt(1));
    const text = (el.textContent ?? '').trim();
    const existing = el.getAttribute('id');
    let id: string;
    if (existing) {
      id = existing;
      const seen = used.get(id) ?? 0;
      used.set(id, seen + 1);
    } else {
      const slug = slugifyHeading(text);
      const seen = used.get(slug) ?? 0;
      used.set(slug, seen + 1);
      id = seen === 0 ? slug : `${slug}-${seen}`;
      el.setAttribute('id', id);
    }
    toc.push({ level, text, id });
  }

  return { html: doc.body.innerHTML, toc };
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
  if (!purifier) return escapeAsText(html);
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

let hljsChunkLoaded = false;
let hljsChunkPromise: Promise<{ LANGUAGES: Record<string, unknown> }> | null = null;

/**
 * A bounded LRU cache for expensive render results.
 *
 * Highlighting and math rendering are pure functions of their input, so the
 * same block need not be processed twice. The cache is bounded to prevent
 * unbounded memory growth in long sessions; when full, the least-recently-used
 * entry is evicted.
 */
class BoundedCache<V> {
  private map = new Map<string, V>();
  constructor(private max: number) {}
  get(key: string): V | undefined {
    const value = this.map.get(key);
    if (value === undefined) return undefined;
    this.map.delete(key);
    this.map.set(key, value);
    return value;
  }
  set(key: string, value: V): void {
    if (this.map.has(key)) this.map.delete(key);
    else if (this.map.size >= this.max) {
      const oldest = this.map.keys().next().value;
      if (oldest !== undefined) this.map.delete(oldest);
    }
    this.map.set(key, value);
  }
}

const highlightCache = new BoundedCache<string>(256);

/**
 * Highlight every code block inside a rendered preview.
 *
 * Language definitions live in a separate chunk (`client.hljs-languages.js`)
 * loaded on demand: the 231 KB of grammars is only needed when the document
 * carries code blocks, and the core highlight.js engine in the entry bundle
 * is enough to register them once they arrive. The first call kicks off the
 * load; subsequent calls reuse the same promise.
 *
 * Only blocks with an explicit `language-*` class matching a registered
 * language are highlighted. Unmarked blocks skip auto-detection entirely:
 * scanning 27 grammars per block is expensive, and a document with dozens of
 * plain fences would pay that cost on every refresh. Blocks exceeding 8 KB
 * are also skipped even when declared, since very long inputs rarely benefit
 * from highlighting and always cost it.
 *
 * @param root - the container holding the rendered Markdown.
 */
export async function highlightWithin(root: HTMLElement | null): Promise<void> {
  if (!root) return;
  const blocks = Array.from(root.querySelectorAll('pre code:not([data-highlighted="yes"])'));
  if (blocks.length === 0) return;
  if (!hljsChunkLoaded) {
    if (!hljsChunkPromise) {
      hljsChunkPromise = require.async('./client.hljs-languages.js').then((chunk) => {
        const mod = chunk as { LANGUAGES: Record<string, (hljs: typeof hljs) => void> };
        for (const [name, definition] of Object.entries(mod.LANGUAGES)) {
          hljs.registerLanguage(name, definition);
        }
        hljsChunkLoaded = true;
        return mod;
      });
    }
    await hljsChunkPromise;
  }
  for (const block of blocks) {
    const element = block as HTMLElement;
    const lang = codeLanguage(element);
    if (!lang) continue;
    if (!hljs.getLanguage(lang)) continue;
    const text = element.textContent ?? '';
    if (text.length > 8192) continue;
    const cacheKey = `${lang}\0${text}`;
    const cached = highlightCache.get(cacheKey);
    if (cached !== undefined) {
      element.innerHTML = cached;
      element.dataset.highlighted = 'yes';
      continue;
    }
    try {
      hljs.highlightElement(element);
      highlightCache.set(cacheKey, element.innerHTML);
    } catch (err) {
      console.error('[dsh-md-live] Highlight error:', err);
    }
  }
}
