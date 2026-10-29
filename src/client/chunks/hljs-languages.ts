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

/**
 * Language definitions for highlight.js, exported as a flat map.
 *
 * This is the hljs-languages chunk: loaded on demand when the entry bundle
 * detects unhighlighted code blocks. The entry registers these into the
 * shared hljs core that stays in the entry bundle.
 *
 * Aliases (sh, c++, c#, js, jsx, ts, tsx, py, md, yml, toml, html, vue)
 * are included so that the fence language name the author wrote resolves
 * even when it is not the canonical name.
 */
export const LANGUAGES: Record<string, unknown> = {
  bash, sh: shell, shell, c, cpp, 'c++': cpp, csharp, 'c#': csharp, css, diff,
  go, ini, toml: ini, java, javascript, js: javascript, jsx: javascript,
  json, kotlin, lua, markdown, md: markdown, perl, php, python, py: python,
  r, ruby, rust, scss, sql, swift, typescript, ts: typescript, tsx: typescript,
  html: xml, xml, vue: xml, yaml, yml: yaml,
};
