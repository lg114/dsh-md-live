// Spike: a hand-written Typert manifest for one Remote method.
//
// The official packages ship this file generated from a FaceModel; this one is
// written by hand to find out whether a third-party plugin can do the same. It
// lives outside `src/` so a wrong shape cannot break the plugin's activation —
// a broken declared artifact fails loud, which would take the tab down with it.
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
        invocation: { kind: 'direct' },
        parameters: [
          {
            name: 'path',
            wire: 'path',
            description: 'Absolute path of the file to write.',
            codec: {
              mode: 'strict',
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
            codec: {
              mode: 'strict',
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
            codec: {
              mode: 'strict',
              typeSymbol: 'dsh-md-live#writeText:version',
              create: text,
              description: 'the version the reader started from; a mismatch is refused.',
              jsonSchema: { type: 'string' },
            },
          },
        ],
        result: {
          mode: 'strict',
          typeSymbol: 'dsh-md-live#writeText:result',
          create: () => z.object({ version: z.string(), bytes: z.number() }),
          description: 'the new version after the write, and the byte size written.',
          jsonSchema: {
            type: 'object',
            properties: { version: { type: 'string' }, bytes: { type: 'number' } },
            required: ['version', 'bytes'],
            additionalProperties: false,
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
  face: 'host',
  schemas: [],
  get invocations() {
    return $remote.descriptors;
  },
  model: {
    services: [
      {
        description: 'Markdown file writes for the md-live panel.',
        summary: 'Markdown file writes for the md-live panel.',
        tags: [],
        jsDoc: '/** Markdown file writes for the md-live panel. */',
        key: 'mdLive',
        exportName: 'default',
        members: [
          {
            kind: 'method',
            name: 'writeText',
            signature:
              '@Remote async writeText(path: string, content: string, version: string): Promise<{ version: string; bytes: number }>',
            summary: 'Replace one workspace file with UTF-8 text, refusing a stale version.',
            jsDoc: '/** Replace one workspace file with UTF-8 text, refusing a stale version. */',
          },
        ],
        types: [],
      },
    ],
    events: [],
    objects: [],
  },
};
