// @ts-expect-error - the package ships no types for its minified entry
import katex from 'katex/dist/katex.min.js';

/**
 * A bounded LRU cache for expensive render results.
 *
 * KaTeX rendering is a pure function of the TeX input and display mode, so the
 * same expression need not be processed twice. The cache is bounded to prevent
 * unbounded memory growth in long sessions.
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

const mathCache = new BoundedCache<string>(128);

/**
 * Draw every math placeholder inside a rendered document.
 *
 * This is the KaTeX chunk: loaded on demand when the entry bundle detects
 * `.md-live-math` placeholders in the DOM. Output is MathML rather than
 * KaTeX's HTML — the HTML rendering needs KaTeX's own web fonts, which the
 * plugin has no way to serve.
 *
 * Rendered MathML is cached by TeX + display mode, so live refreshes only
 * re-render expressions that actually changed.
 *
 * @param root - the container holding the rendered Markdown.
 */
export function renderMathWithin(root: HTMLElement): void {
  for (const node of Array.from(root.querySelectorAll('.md-live-math'))) {
    const element = node as HTMLElement;
    if (element.dataset.rendered === '1') continue;
    const tex = element.getAttribute('data-tex') ?? '';
    const displayMode = element.getAttribute('data-display') === '1';
    const cacheKey = `${displayMode ? '1' : '0'}${tex}`;
    const cached = mathCache.get(cacheKey);
    if (cached !== undefined) {
      element.innerHTML = cached;
      element.dataset.rendered = '1';
      continue;
    }
    try {
      katex.render(tex, element, {
        displayMode,
        output: 'mathml',
        throwOnError: false,
        strict: false,
      });
      mathCache.set(cacheKey, element.innerHTML);
      element.dataset.rendered = '1';
    } catch {
      element.textContent = tex;
      element.dataset.rendered = '1';
    }
  }
}
