import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.dirname(fileURLToPath(import.meta.url));
const output = path.join(root, 'www');
const cli = path.join(root, '..', 'node_modules', '@vue', 'cli-service', 'bin', 'vue-cli-service.js');
const result = spawnSync(process.execPath, [cli, 'build', '--dest', output], {
  cwd: path.join(root, '..'),
  env: {
    ...process.env,
    FLB_MOBILE_BUILD: '1',
    NODE_OPTIONS: [process.env.NODE_OPTIONS, '--openssl-legacy-provider'].filter(Boolean).join(' '),
  },
  stdio: 'inherit',
});
if (result.error) throw result.error;
process.exitCode = result.status === null ? 1 : result.status;
