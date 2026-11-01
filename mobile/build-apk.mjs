import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const wrapper = path.join(root, 'android', process.platform === 'win32' ? 'gradlew.bat' : 'gradlew');
const result = spawnSync(wrapper, ['assembleDebug'], {
  cwd: path.join(root, 'android'),
  stdio: 'inherit',
  shell: process.platform === 'win32',
});
if (result.error) throw result.error;
process.exitCode = result.status === null ? 1 : result.status;
