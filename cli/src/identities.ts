// SPDX-License-Identifier: Apache-2.0
//
// Local identity secrets, one per (network, role). FairGate identities are hashes
// of a 32-byte secret, independent of the wallet that pays fees, so one machine can
// act as admin, employer and auditor during a demo.
//
// The file is written with owner-only permissions and is gitignored. Losing the
// admin secret means losing control of the registry, so back it up.

import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomBytes32, toHex, fromHex } from '../../contract/src/index.ts';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const IDENTITIES_FILE = path.resolve(__dirname, '..', '.fairgate-identities.json');

type IdentityFile = Record<string, Record<string, string>>;

function load(): IdentityFile {
  if (!fs.existsSync(IDENTITIES_FILE)) return {};
  return JSON.parse(fs.readFileSync(IDENTITIES_FILE, 'utf-8')) as IdentityFile;
}

function save(data: IdentityFile): void {
  const tmp = `${IDENTITIES_FILE}.tmp-${process.pid}`;
  fs.writeFileSync(tmp, `${JSON.stringify(data, null, 2)}\n`, { mode: 0o600 });
  fs.renameSync(tmp, IDENTITIES_FILE);
}

/** Return the secret for a role on a network, creating one if it does not exist yet. */
export function loadOrCreateSecret(network: string, role: string): { secret: Uint8Array; created: boolean } {
  const data = load();
  const existing = data[network]?.[role];
  if (existing) return { secret: fromHex(existing), created: false };
  const secret = randomBytes32();
  data[network] = { ...(data[network] ?? {}), [role]: toHex(secret) };
  save(data);
  return { secret, created: true };
}

export function listRoles(network: string): string[] {
  return Object.keys(load()[network] ?? {});
}
