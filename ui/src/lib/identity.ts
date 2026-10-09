// SPDX-License-Identifier: Apache-2.0
//
// Role secrets live in this browser's localStorage. They never leave the device;
// the contract only ever sees hashes derived from them.

import { pureCircuits, randomBytes32, toHex, fromHex } from '../../../contract/src/index.ts';

export type Role = 'admin' | 'employer' | 'auditor';

const key = (role: Role) => `fairgate:${role}:secret`;

export function getSecret(role: Role): Uint8Array {
  try {
    const stored = localStorage.getItem(key(role));
    if (stored) return fromHex(stored);
  } catch {
    /* storage unavailable: fall through to an ephemeral secret */
  }
  const secret = randomBytes32();
  try {
    localStorage.setItem(key(role), toHex(secret));
  } catch {
    /* ignore */
  }
  return secret;
}

export function importSecret(role: Role, hex: string): void {
  const bytes = fromHex(hex);
  if (bytes.length !== 32) throw new Error('secret must be 32 bytes of hex');
  localStorage.setItem(key(role), toHex(bytes));
}

export const userPk = (role: Role) => toHex(pureCircuits.deriveUserPk(getSecret(role)));
export const adminPk = () => toHex(pureCircuits.deriveAdminPk(getSecret('admin')));
