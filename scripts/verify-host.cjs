// Run the built Host half against a fake cordis context and check what it
// registers. This is the part of the plugin that can take the whole thing down
// — a Host half that throws stops the package from loading, tab included — so
// it gets a smoke test of its own.
// Run `npm run build:host` first, then `npm run verify:host`.
const path = require('path');
const { pathToFileURL } = require('url');

(async () => {
  const target = path.join(__dirname, '..', 'lib', 'index.js');
  const host = await import(pathToFileURL(target).href);

  const registered = [];
  let injected = null;
  const ctx = {
    inject(deps, callback) {
      injected = deps;
      callback({ tools: { register(tool) { registered.push(tool); } } });
    },
  };

  host.apply(ctx);
  // The tool is built behind a dynamic import, so registration lands a tick later.
  await new Promise((resolve) => setTimeout(resolve, 200));

  const tool = registered[0];
  console.log('1) host half exports name/apply:', host.name === 'dsh-md-live' && typeof host.apply === 'function');
  console.log('2) asks only for the optional tool registry:',
    Array.isArray(injected) && injected.length === 1 && injected[0] === 'tools');
  console.log('3) registers exactly one tool:', registered.length === 1 && tool?.name === 'preview_md');
  console.log('4) path is a required parameter:',
    tool?.parameters?.properties?.path?.type === 'string' &&
    Array.isArray(tool?.parameters?.required) &&
    tool.parameters.required.includes('path'));

  const rendered = tool?.output?.render({ path: 'a.md' }, { path: 'a.md' });
  console.log('5) result renders as text:',
    Array.isArray(rendered) && rendered[0]?.type === 'text' && String(rendered[0].text).includes('a.md'));

  const accepted = await tool?.execute({ path: 'notes.md' }, {});
  console.log('6) accepts a Markdown path:', accepted?.path === 'notes.md');

  let rejectedNonMarkdown = false;
  try {
    await tool.execute({ path: 'notes.txt' }, {});
  } catch {
    rejectedNonMarkdown = true;
  }
  console.log('7) refuses a non-Markdown path:', rejectedNonMarkdown);

  let rejectedMissing = false;
  try {
    await tool.execute({}, {});
  } catch {
    rejectedMissing = true;
  }
  console.log('8) refuses a call with no path:', rejectedMissing);

  // A Host half that throws must cost the tool, never the plugin.
  const broken = {
    inject(_deps, callback) {
      callback({ tools: { register() { throw new Error('registry is closed'); } } });
    },
  };
  let survived = true;
  try {
    host.apply(broken);
    await new Promise((resolve) => setTimeout(resolve, 200));
  } catch {
    survived = false;
  }
  console.log('9) a failing registry does not throw out of apply:', survived);

  process.exit(0);
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
