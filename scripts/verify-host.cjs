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

  const registeredTools = [];
  const registeredServices = [];
  const registeredManifests = [];
  const injectedDeps = [];

  /**
   * Build a fake context that supports both `tools` and `typert` injection.
   * The `reflect` mock records service registrations (the Cordis `Service`
   * base constructor calls `ctx.reflect.provide(name, self)`).
   * Uses `ctx.get('name')` for optional service lookup (returns undefined if not registered).
   */
  function makeCtx(options = {}) {
    const services = {};
    return {
      reflect: {
        provide(name, value) {
          registeredServices.push({ name, value });
          services[name] = value;
        },
      },
      get(name) {
        if (name === 'fs' && options.fs) return options.fs;
        if (name === 'sandboxPolicy' && options.sandboxPolicy) return options.sandboxPolicy;
        return services[name];
      },
      inject(deps, callback) {
        injectedDeps.push([...deps]);
        const child = {
          reflect: { provide(name, value) { registeredServices.push({ name, value }); services[name] = value; } },
          get(n) {
            if (n === 'fs' && options.fs) return options.fs;
            if (n === 'sandboxPolicy' && options.sandboxPolicy) return options.sandboxPolicy;
            return services[n];
          },
        };
        if (deps.includes('tools')) {
          child.tools = {
            register(tool) {
              if (options.throwOnToolRegister) throw new Error('registry is closed');
              registeredTools.push(tool);
            },
          };
        }
        if (deps.includes('typert')) {
          child.typert = {
            register(contribution) {
              if (options.throwOnTypertRegister) throw new Error('typert registry is closed');
              registeredManifests.push(contribution);
            },
          };
        }
        callback(child);
      },
    };
  }

  // --- Normal registration ---
  const ctx = makeCtx();
  host.apply(ctx);
  await new Promise((resolve) => setTimeout(resolve, 200));

  const tool = registeredTools[0];
  console.log('1) host half exports name/apply:', host.name === 'dsh-md-live' && typeof host.apply === 'function');
  console.log('2) asks for typert and tools:',
    injectedDeps.some((d) => d.includes('typert')) &&
    injectedDeps.some((d) => d.includes('tools')));
  console.log('3) registers exactly one tool:', registeredTools.length === 1 && tool?.name === 'preview_md');
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

  // --- Remote service registration ---
  const mdLiveService = registeredServices.find((s) => s.name === 'mdLive');
  console.log('9) MdLiveRemote registered as ctx.mdLive:', mdLiveService !== undefined);

  const MARKER_KEY = '@deepseek-ai/dsh-typert-protocol/remote-methods';
  const serviceInstance = mdLiveService?.value;
  const prototype = serviceInstance && Object.getPrototypeOf(serviceInstance);
  const markerDesc = prototype && Object.getOwnPropertyDescriptor(prototype, MARKER_KEY);
  const marker = markerDesc?.value;
  console.log('10) Remote marker on prototype:',
    marker?.version === 1 &&
    Array.isArray(marker?.methods) &&
    marker.methods.length === 1 &&
    marker.methods[0].method === 'writeText' &&
    marker.methods[0].invocation?.kind === 'direct');

  console.log('11) typert manifest registered:',
    registeredManifests.length === 1 &&
    registeredManifests[0].package === 'dsh-md-live');

  const descriptors = registeredManifests[0]?.invocations;
  console.log('12) manifest carries one descriptor:',
    Array.isArray(descriptors) && descriptors.length === 1);

  const descriptor = descriptors?.[0];
  console.log('13) descriptor endpoint is mdLive/writeText:',
    descriptor?.namespace === 'mdLive' && descriptor?.method === 'writeText');

  console.log('14) descriptor has four parameters:',
    Array.isArray(descriptor?.parameters) && descriptor.parameters.length === 4);

  console.log('15) parameter wire names are sessionId,path,content,version:',
    descriptor?.parameters?.map((p) => p.wire).join(',') === 'sessionId,path,content,version');

  console.log('15b) the session parameter is a lookup, not a payload field:',
    descriptor?.parameters?.[0]?.source === 'lookup' && descriptor.parameters[0].lookup === 'session');

  // --- typertRemote binding ---
  console.log('16) typertRemote binding present:',
    serviceInstance?.typertRemote != null &&
    serviceInstance.typertRemote.serviceKey === 'mdLive' &&
    serviceInstance.typertRemote.namespace === 'mdLive');

  // --- Graceful degradation ---
  const broken = makeCtx({ throwOnToolRegister: true, throwOnTypertRegister: true });
  let survived = true;
  try {
    host.apply(broken);
    await new Promise((resolve) => setTimeout(resolve, 200));
  } catch {
    survived = false;
  }
  console.log('17) a failing registry does not throw out of apply:', survived);

  /** Stand-in for the Session a real call receives through the `session` lookup. */
  const SESSION = { id: 'session-test', header: { cwd: '/workspace' } };

  // --- writeText tests ---
  let diskVersion = 'v1';
  let diskContent = '# Hello\n';
  let statReturnsUndefined = false;
  const fakeFs = {
    async resolve(p) {
      return { targetKey: '/workspace/' + p.replace(/^\/+/, ''), displayPath: '/workspace/' + p.replace(/^\/+/, '') };
    },
    async stat(_target) {
      if (statReturnsUndefined) return undefined;
      return { version: diskVersion };
    },
    async writeText(_target, content, intent) {
      if (intent.kind === 'replaceIfVersion' && intent.version !== diskVersion) {
        const err = new Error('version conflict');
        err.code = 'FS_STALE_VERSION';
        err.version = diskVersion;
        throw err;
      }
      diskContent = content;
      diskVersion = 'v' + (parseInt(diskVersion.slice(1)) + 1);
      return { version: diskVersion, operation: 'update', before: '', after: content };
    },
  };

  const writeCtx = makeCtx({ fs: fakeFs });
  host.apply(writeCtx);
  await new Promise((r) => setTimeout(r, 200));
  const writeService = registeredServices.filter((s) => s.name === 'mdLive').pop();
  const writer = writeService?.value;

  if (writer) {
    // 18) successful write
    const r1 = await writer.writeText(SESSION, 'notes.md', '# Updated\n', 'v1');
    console.log('18) write returns saved:', r1.status === 'saved' && typeof r1.version === 'string' && r1.bytes > 0);

    // 19) stale version
    const r2 = await writer.writeText(SESSION, 'notes.md', '# Stale\n', 'v1');
    console.log('19) stale version returns stale:', r2.status === 'stale' && typeof r2.currentVersion === 'string');

    // 20) non-markdown extension denied
    const r3 = await writer.writeText(SESSION, 'notes.txt', 'hello', 'v2');
    console.log('20) non-markdown extension denied:', r3.status === 'denied');

    // 21) empty path returns bad-request
    const r4 = await writer.writeText(SESSION, '', 'hello', 'v1');
    console.log('21) empty path returns bad-request:', r4.status === 'bad-request');

    // 22) missing file (stat returns undefined)
    statReturnsUndefined = true;
    const r5 = await writer.writeText(SESSION, 'gone.md', 'hello', 'v1');
    console.log('22) missing file returns missing:', r5.status === 'missing');
    statReturnsUndefined = false;

    // 23) force overwrite (empty version skips check)
    diskVersion = 'v99';
    const r6 = await writer.writeText(SESSION, 'notes.md', '# Forced\n', '');
    console.log('23) empty version force-overwrites:', r6.status === 'saved');

    // 24) content size limit
    const huge = 'x'.repeat(4 * 1024 * 1024);
    const r7 = await writer.writeText(SESSION, 'big.md', huge, '');
    console.log('24) oversized content denied:', r7.status === 'denied');
  } else {
    console.log('18-24) write tests skipped: service not found');
  }

  // 25) write without fs returns error
  const noFsCtx = makeCtx({});
  host.apply(noFsCtx);
  await new Promise((r) => setTimeout(r, 200));
  const noFsService = registeredServices.filter((s) => s.name === 'mdLive').pop();
  const noFsWriter = noFsService?.value;
  if (noFsWriter) {
    const r8 = await noFsWriter.writeText(SESSION, 'notes.md', 'hello', 'v1');
    console.log('25) no fs returns error:', r8.status === 'error');
  } else {
    console.log('25) no fs test skipped');
  }

  // 26) a sandbox denial names the sandbox and the root, not "not in workspace"
  const accessDeniedFs = {
    async resolve(p) { return { targetKey: '/outside/' + p, displayPath: '/outside/' + p }; },
    async stat() { return { version: 'v1' }; },
    async writeText() { throw new Error('cannot write "/outside/notes.md": file access denied under workspace-write mode'); },
  };
  const adPolicy = { mode: 'workspace-write', workspaceRoot: '/workspace' };
  const adCtx = makeCtx({
    fs: accessDeniedFs,
    sandboxPolicy: { resolve: () => adPolicy },
  });
  host.apply(adCtx);
  await new Promise((r) => setTimeout(r, 200));
  const adService = registeredServices.filter((s) => s.name === 'mdLive').pop();
  const adWriter = adService?.value;
  if (adWriter) {
    const r9 = await adWriter.writeText(SESSION, 'notes.md', 'hello', 'v1');
    console.log('26) sandbox denial names the mode and root:',
      r9.status === 'denied' &&
      r9.reason.includes('沙箱') &&
      r9.reason.includes('workspace-write') &&
      r9.reason.includes('/workspace') &&
      !r9.reason.includes('不在工作区'));
  } else {
    console.log('26) sandbox denial test skipped');
  }

  // 27) the Session's resolved policy reaches the backend as the per-call fence
  const seenPolicies = [];
  let resolvedRequest;
  const policy = { mode: 'workspace-write', workspaceRoot: '/workspace' };
  const policyFs = {
    async resolve(p) { return { targetKey: '/workspace/' + p, displayPath: '/workspace/' + p }; },
    async stat() { return { version: 'v1' }; },
    async writeText(_target, content, _intent, _signal, sandboxPolicy) {
      seenPolicies.push(sandboxPolicy);
      return { version: 'v2', operation: 'update', before: '', after: content };
    },
  };
  const policyCtx = makeCtx({
    fs: policyFs,
    sandboxPolicy: {
      resolve(request) {
        resolvedRequest = request;
        return policy;
      },
    },
  });
  host.apply(policyCtx);
  await new Promise((r) => setTimeout(r, 200));
  const policyService = registeredServices.filter((s) => s.name === 'mdLive').pop();
  const policyWriter = policyService?.value;
  if (policyWriter) {
    const r10 = await policyWriter.writeText(SESSION, 'notes.md', 'hello', 'v1');
    console.log('27) per-call policy is resolved from the session and forwarded:',
      r10.status === 'saved' &&
      seenPolicies.length === 1 &&
      seenPolicies[0] === policy &&
      resolvedRequest?.session === SESSION);
  } else {
    console.log('27) policy forwarding test skipped');
  }

  process.exit(0);
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
