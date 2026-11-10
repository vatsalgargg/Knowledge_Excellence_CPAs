// The exact set of files Cloudflare uploads: everything in the repo that
// .assetsignore (deny-by-default) does not exclude. Shared by the local server,
// the site checks and the leak scan so they all judge the same files.
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';

export const ROOT = resolve(import.meta.dirname, '..', '..');

export function deployableFiles() {
  const git = (args, input) => execFileSync('git', args, { cwd: ROOT, encoding: 'utf8', input, maxBuffer: 64 * 1024 * 1024 });
  const candidates = git(['ls-files', '--cached', '--others', '--exclude-standard']).split('\n').filter(Boolean);
  const ignored = new Set(git(['-c', `core.excludesFile=${resolve(ROOT, '.assetsignore')}`, 'check-ignore', '--no-index', '--stdin'],
    candidates.join('\n') + '\n').split('\n').filter(Boolean));
  // Files that `git check-ignore` does not print are deployed.
  return candidates.filter(file => !ignored.has(file)).sort();
}
