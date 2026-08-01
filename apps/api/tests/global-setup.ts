import { execSync } from 'node:child_process';
import { rmSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const apiDir = resolve(fileURLToPath(new URL('.', import.meta.url)), '..');
const testDbPath = resolve(apiDir, 'prisma', 'test.db');

export default function globalSetup() {
  // Fresh isolated SQLite database for every test run (never touches dev.db).
  rmSync(testDbPath, { force: true });
  rmSync(`${testDbPath}-journal`, { force: true });

  const env = { ...process.env, DATABASE_URL: 'file:./test.db' };
  execSync('pnpm prisma migrate deploy', { cwd: apiDir, env, stdio: 'inherit' });
  execSync('pnpm prisma db seed', { cwd: apiDir, env, stdio: 'inherit' });
}
