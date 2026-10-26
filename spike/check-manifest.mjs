// Spike check: does a hand-written manifest parse into a usable descriptor?
// Run `node spike/check-manifest.mjs`.
import { TYPERT } from './md-live-manifest.mjs';

const descriptors = TYPERT.invocations;
const [descriptor] = descriptors;

console.log('1) manifest parses into one descriptor:',
  Array.isArray(descriptors) && descriptors.length === 1);

console.log('2) endpoint is package#namespace/method:',
  descriptor?.id === 'dsh-md-live#mdLive/writeText' &&
  descriptor?.namespace === 'mdLive' &&
  descriptor?.method === 'writeText');

console.log('3) parameters carry wire names:',
  descriptor?.parameters?.map((parameter) => parameter.wire).join(',') === 'path,content,version');

const input = descriptor.input();
const schema = input.create();
console.log('4) input builds a zod schema:', typeof schema?.parse === 'function');

let accepted = false;
try {
  accepted = schema.parse({ path: '/a.md', content: '# x', version: 'v1' }).path === '/a.md';
} catch {
  accepted = false;
}
console.log('5) a complete argument set is accepted:', accepted);

let rejected = false;
try {
  schema.parse({ path: '/a.md', content: '# x' });
} catch {
  rejected = true;
}
console.log('6) a missing parameter is refused:', rejected);

console.log('7) result schema parses:',
  descriptor?.result?.spec?.create?.().parse({ version: 'v2', bytes: 4 })?.bytes === 4);

console.log('8) the descriptor is invokable:',
  typeof descriptor?.invoke === 'function');
