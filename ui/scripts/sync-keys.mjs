// Copy the compiled proving material next to the page so FetchZkConfigProvider can
// load it from the same origin. Run after `npm run compile`.
import { cpSync, existsSync, mkdirSync, rmSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const managed = resolve(here, '..', '..', 'contract', 'managed', 'fairgate');
const pub = resolve(here, '..', 'public');
if (!existsSync(resolve(managed, 'keys'))) {
  console.error('Compiled contract not found. Run `npm run compile` at the repository root first.');
  process.exit(1);
}
for (const dir of ['keys', 'zkir']) {
  rmSync(resolve(pub, dir), { recursive: true, force: true });
  mkdirSync(resolve(pub, dir), { recursive: true });
  cpSync(resolve(managed, dir), resolve(pub, dir), { recursive: true });
}
console.log('Synced keys and zkir into ui/public');
