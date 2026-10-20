import test from 'node:test';
import { execFileSync } from 'node:child_process';

test('Oracle monitor free limits, ambiguous launches, restart and notification safeguards', () => {
  execFileSync('python3', ['-m', 'unittest', 'discover', '-s', 'scripts/oracle-monitor', '-p', 'test_*.py'], {
    env: { ...process.env, PYTHONDONTWRITEBYTECODE: '1' },
    stdio: 'pipe',
  });
});
