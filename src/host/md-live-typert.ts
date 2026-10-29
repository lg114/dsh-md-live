/**
 * Hand-written Typert manifest for the mdLive/writeText Remote method.
 *
 * Official packages ship this generated from a FaceModel; this one is written
 * by hand so the plugin does not need a codegen step. The shape matches what
 * `dsh-typert-generator` would emit: a `TYPERT` constant carrying `invocations`
 * (descriptors for the wire protocol) and a `model` (service metadata for the
 * Gateway's discovery).
 */
import { z } from 'zod';
import { createTypertRemoteInfo } from '@deepseek-ai/dsh-typert-protocol/remote-info';

const text = () => z.string();

const $remote = createTypertRemoteInfo(
  {
    package: 'dsh-md-live',
    methods: {
      'mdLive/writeText': {
        service: 'mdLive',
        description: 'Replace one workspace file with UTF-8 text, refusing a stale version.',
        invocation: { kind: 'direct' as const },
        parameters: [
          {
            name: 'session',
            wire: 'sessionId',
            description: 'the Session whose sandbox policy and workspace root fence this write.',
            source: 'lookup' as const,
            lookup: 'session',
            codec: {
              mode: 'strict' as const,
              typeSymbol: '@deepseek-ai/dsh-session/types#SessionId',
              create: text,
              description: 'the Session whose sandbox policy fences this write.',
              jsonSchema: { type: 'string' },
            },
            strictCodec: {
              mode: 'strict' as const,
              typeSymbol: '@deepseek-ai/dsh-session/types#SessionId',
              create: text,
              description: 'the Session whose sandbox policy fences this write.',
              jsonSchema: { type: 'string' },
            },
          },
          {
            name: 'path',
            wire: 'path',
            description: 'Absolute path of the file to write.',
            source: 'json' as const,
            codec: {
              mode: 'strict' as const,
              typeSymbol: 'dsh-md-live#writeText:path',
              create: text,
              description: 'absolute path of the file to write.',
              jsonSchema: { type: 'string' },
            },
            strictCodec: {
              mode: 'strict' as const,
              typeSymbol: 'dsh-md-live#writeText:path',
              create: text,
              description: 'absolute path of the file to write.',
              jsonSchema: { type: 'string' },
            },
          },
          {
            name: 'content',
            wire: 'content',
            description: 'Full UTF-8 text to write.',
            source: 'json' as const,
            codec: {
              mode: 'strict' as const,
              typeSymbol: 'dsh-md-live#writeText:content',
              create: text,
              description: 'full UTF-8 text to write.',
              jsonSchema: { type: 'string' },
            },
            strictCodec: {
              mode: 'strict' as const,
              typeSymbol: 'dsh-md-live#writeText:content',
              create: text,
              description: 'full UTF-8 text to write.',
              jsonSchema: { type: 'string' },
            },
          },
          {
            name: 'version',
            wire: 'version',
            description: 'The version the reader started from; a mismatch is refused.',
            source: 'json' as const,
            codec: {
              mode: 'strict' as const,
              typeSymbol: 'dsh-md-live#writeText:version',
              create: text,
              description: 'the version the reader started from; a mismatch is refused.',
              jsonSchema: { type: 'string' },
            },
            strictCodec: {
              mode: 'strict' as const,
              typeSymbol: 'dsh-md-live#writeText:version',
              create: text,
              description: 'the version the reader started from; a mismatch is refused.',
              jsonSchema: { type: 'string' },
            },
          },
        ],
        result: {
          mode: 'strict' as const,
          typeSymbol: 'dsh-md-live#writeText:result',
          create: () =>
            z.discriminatedUnion('status', [
              z.object({ status: z.literal('saved'), version: z.string(), bytes: z.number() }),
              z.object({ status: z.literal('stale'), currentVersion: z.string() }),
              z.object({
                status: z.literal('denied'),
                // The panel phrases the refusal itself; `reason` is the Host's
                // own sentence, kept for logs and for a client without the code.
                code: z.string().optional(),
                reason: z.string(),
                detail: z
                  .object({
                    path: z.string().optional(),
                    mode: z.string().optional(),
                    root: z.string().optional(),
                    bytes: z.number().optional(),
                    maxBytes: z.number().optional(),
                  })
                  .optional(),
              }),
              z.object({ status: z.literal('missing') }),
              z.object({ status: z.literal('bad-request'), reason: z.string() }),
              z.object({ status: z.literal('error'), message: z.string() }),
            ]),
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
        },
        sourceLocation: { file: 'src/host/md-live-remote.ts', line: 1, column: 1 },
      },
    },
  },
  z,
);

export const TYPERT = {
  package: 'dsh-md-live',
  face: 'host' as const,
  schemas: [] as unknown[],
  invocations: $remote.descriptors,
  model: {
    services: [
      {
        description: 'Markdown file writes for the md-live panel.',
        summary: 'Markdown file writes for the md-live panel.',
        tags: [] as string[],
        jsDoc: '/** Markdown file writes for the md-live panel. */',
        key: 'mdLive',
        exportName: 'default',
        members: [
          {
            kind: 'method' as const,
            name: 'writeText',
            signature:
              '@Remote async writeText(session: Session, path: string, content: string, version: string): Promise<WriteResult>',
            summary: 'Replace one workspace file with UTF-8 text, returning a structured status.',
            jsDoc: '/** Replace one workspace file with UTF-8 text, returning a structured status. */',
          },
        ],
        types: [] as unknown[],
      },
    ],
    events: [] as unknown[],
    objects: [] as unknown[],
  },
};
