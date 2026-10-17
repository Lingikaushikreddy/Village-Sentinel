// The 0.12.0 package publishes these step APIs but omits root exports for them.
// Keep that version-specific coupling here, and verify every exported run by replay.
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';

const require = createRequire(import.meta.url);
const root = dirname(require.resolve('settlement-testbed/package.json'));
const metadata = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
if (metadata.version !== '0.12.0') throw Error('The live adapter requires settlement-testbed 0.12.0');
const load = path => import(pathToFileURL(join(root, 'dist', path)).href);
const engine = await load('sim/engine.js');
const social = await load('agent/social.js');
const protocol = await load('testbed/protocol.js');

export const { createRun, advance, verifyReplay, checkInvariants } = engine;
export const { socialInputs } = social;
export const { buildRequest, toSocialDecision, parseAgentResponse } = protocol;
export const TESTBED_VERSION = metadata.version;
