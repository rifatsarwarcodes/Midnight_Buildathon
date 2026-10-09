// Diagnostic: build the wallet for a network and print sync progress every few
// seconds instead of waiting silently for waitForSyncedState().
import { WebSocket } from 'ws';
import * as Rx from 'rxjs';
import { resolveNetwork, getOrCreateWallet } from '../src/network';
import { createWallet, unshieldedToken } from '../src/wallet';

// @ts-expect-error wallet sync requires WebSocket
globalThis.WebSocket = WebSocket;

const { network, config } = resolveNetwork();
const WALLET = getOrCreateWallet(network);
const start = Date.now();
const dump = (v: unknown) => JSON.stringify(v, (_k, x) => (typeof x === 'bigint' ? x.toString() : x instanceof Error ? { name: x.name, message: x.message, stack: x.stack?.split('\n').slice(0, 3) } : x), 1);
const origErr = console.error.bind(console);
console.error = (...args: unknown[]) => origErr(...args.map((a) => (typeof a === 'object' && a !== null ? dump(a).slice(0, 4000) : a)));
const log = (m: string) => console.log(`[${((Date.now() - start) / 1000).toFixed(0)}s] ${m}`);

async function main() {
  log(`network=${network} indexer=${config.indexer} node=${config.node}`);
  const ctx = await createWallet({ network, networkConfig: config, seed: WALLET.seed });
  log(`wallet created, address=${ctx.unshieldedKeystore.getBech32Address()}`);
  const sub = ctx.wallet.state().pipe(Rx.throttleTime(5000)).subscribe({
    next: (s: any) => {
      const bal = s.unshielded?.balances?.[unshieldedToken().raw] ?? 0n;
      const sub = (w: any) => w ? dump({ isSynced: w.isSynced, progress: w.syncProgress ?? w.progress, keys: Object.keys(w) }).replace(/\s+/g, ' ').slice(0, 400) : 'n/a';
      log(`isSynced=${s.isSynced} tNIGHT=${bal}\n   shielded=${sub(s.shielded)}\n   unshielded=${sub(s.unshielded)}\n   dust=${sub(s.dust)}`);
    },
    error: (e: any) => log(`state error: ${e?.message ?? e}`),
  });
  const timeoutMs = Number(process.env.PROBE_TIMEOUT_MS ?? 240_000);
  await Promise.race([
    ctx.wallet.waitForSyncedState().then(() => log('SYNCED')),
    new Promise((r) => setTimeout(r, timeoutMs)).then(() => log('probe timeout')),
  ]);
  sub.unsubscribe();
  await ctx.wallet.stop();
  process.exit(0);
}
main().catch((e) => { log(`fatal: ${e?.stack ?? e}`); process.exit(1); });
