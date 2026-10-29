/**
 * Lightweight client-side Typert descriptors for the mdLive Remote.
 *
 * The Host half lives in `md-live-typert.ts` and uses `createTypertRemoteInfo`
 * with zod — that is the canonical definition. But importing it into the client
 * bundle pulls in zod and the typert-protocol machinery (~550 KB), most of
 * which is dead weight on the browser side: the Gateway only needs the
 * descriptor metadata and the `invoke` dispatcher, neither of which touches zod.
 *
 * This file hand-writes the same descriptor shape `createTypertRemoteInfo`
 * would produce, so the client can call `$mount` without the import cost.
 *
 * If the Host adds a new Remote method, the matching descriptor must be added
 * here too. The two files are decoupled on purpose: one is canonical for the
 * Host's codegen-shaped registration, the other is the bare minimum the
 * Gateway needs on the browser side.
 */

const PACKAGE = 'dsh-md-live';

function codec(typeSymbol: string, description: string) {
  return {
    mode: 'strict' as const,
    typeSymbol,
    create: () => { throw new Error('client descriptor: zod create() is not available'); },
    description,
    jsonSchema: { type: 'string' as const },
  };
}

function resultCodec() {
  return {
    mode: 'strict' as const,
    typeSymbol: `${PACKAGE}#writeText:result`,
    create: () => { throw new Error('client descriptor: zod create() is not available'); },
    description: 'write outcome: saved, stale, denied, missing, bad-request, or error.',
    jsonSchema: {
      type: 'object' as const,
      oneOf: [
        { properties: { status: { const: 'saved' }, version: { type: 'string' }, bytes: { type: 'number' } }, required: ['status', 'version', 'bytes'] },
        { properties: { status: { const: 'stale' }, currentVersion: { type: 'string' } }, required: ['status', 'currentVersion'] },
        {
          properties: {
            status: { const: 'denied' },
            code: { type: 'string' },
            reason: { type: 'string' },
            detail: {
              type: 'object',
              properties: {
                path: { type: 'string' },
                mode: { type: 'string' },
                root: { type: 'string' },
                bytes: { type: 'number' },
                maxBytes: { type: 'number' },
              },
              additionalProperties: false,
            },
          },
          required: ['status', 'reason'],
        },
        { properties: { status: { const: 'missing' } }, required: ['status'] },
        { properties: { status: { const: 'bad-request' }, reason: { type: 'string' } }, required: ['status', 'reason'] },
        { properties: { status: { const: 'error' }, message: { type: 'string' } }, required: ['status', 'message'] },
      ],
    },
  };
}

const PARAMS = [
  {
    // A lookup, not a payload field: the Gateway resolves this id to the
    // Session on the Host, which is what lets `writeText` fence the write with
    // the Session's sandbox policy instead of the deployment default.
    name: 'session',
    wire: 'sessionId',
    description: 'the Session whose sandbox policy and workspace root fence this write.',
    source: 'lookup' as const,
    lookup: 'session',
    codec: codec('@deepseek-ai/dsh-session/types#SessionId', 'the Session whose sandbox policy fences this write.'),
    strictCodec: codec('@deepseek-ai/dsh-session/types#SessionId', 'the Session whose sandbox policy fences this write.'),
  },
  {
    name: 'path',
    wire: 'path',
    description: 'Absolute path of the file to write.',
    source: 'json' as const,
    codec: codec(`${PACKAGE}#writeText:path`, 'absolute path of the file to write.'),
    strictCodec: codec(`${PACKAGE}#writeText:path`, 'absolute path of the file to write.'),
  },
  {
    name: 'content',
    wire: 'content',
    description: 'Full UTF-8 text to write.',
    source: 'json' as const,
    codec: codec(`${PACKAGE}#writeText:content`, 'full UTF-8 text to write.'),
    strictCodec: codec(`${PACKAGE}#writeText:content`, 'full UTF-8 text to write.'),
  },
  {
    name: 'version',
    wire: 'version',
    description: 'The version the reader started from; a mismatch is refused.',
    source: 'json' as const,
    codec: codec(`${PACKAGE}#writeText:version`, 'the version the reader started from; a mismatch is refused.'),
    strictCodec: codec(`${PACKAGE}#writeText:version`, 'the version the reader started from; a mismatch is refused.'),
  },
];

const writeTextDescriptor = {
  id: `${PACKAGE}#mdLive/writeText`,
  namespace: 'mdLive',
  method: 'writeText',
  service: 'mdLive',
  description: 'Replace one workspace file with UTF-8 text, refusing a stale version.',
  invocation: { kind: 'direct' as const },
  parameters: PARAMS,
  result: resultCodec(),
  sourceLocation: { file: 'src/host/md-live-remote.ts', line: 1, column: 1 },

  input(_options?: { strict?: boolean }) {
    // Stub: client descriptors don't need zod-based input parsing.
    // The Gateway uses this for JSON Schema projection; return a minimal shape.
    return {
      jsonSchema: {
        type: 'object',
        properties: Object.fromEntries(PARAMS.map((p) => [p.wire, { type: 'string' }])),
        required: PARAMS.map((p) => p.wire),
        additionalProperties: false,
      },
    };
  },

  invoke(remote: { namespaces?: Map<string, { writeText?: (...args: unknown[]) => unknown }>; mdLive?: { writeText?: (...args: unknown[]) => unknown } }, input: Record<string, unknown>, _signal?: AbortSignal) {
    const values = PARAMS.map((p) => input[p.wire]);
    const receiver = remote?.namespaces instanceof Map
      ? remote.namespaces.get('mdLive')
      : remote?.mdLive;
    const call = receiver?.writeText;
    if (typeof call !== 'function') {
      throw new Error('mdLive.writeText not available');
    }
    return call.apply(receiver, values);
  },
};

export const CLIENT_DESCRIPTORS = Object.freeze([
  Object.freeze(writeTextDescriptor),
]) as readonly typeof writeTextDescriptor[];
