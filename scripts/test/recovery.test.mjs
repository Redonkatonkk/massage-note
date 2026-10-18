import test from 'node:test';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

test('recovery payload, corruption, retention and isolation safeguards', () => {
  execFileSync('python3', ['-m', 'unittest', 'discover', '-s', 'scripts/recovery', '-p', 'test_*.py'], {
    cwd: fileURLToPath(new URL('../../', import.meta.url)),
    env: { ...process.env, PYTHONDONTWRITEBYTECODE: '1' },
    stdio: 'pipe',
  });
});
