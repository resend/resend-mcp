import { readFile, realpath } from 'node:fs/promises';
import { isAbsolute, relative, resolve, sep } from 'node:path';

function isInside(base: string, target: string): boolean {
  const path = relative(base, target);
  return (
    path === '' ||
    (path !== '..' && !path.startsWith(`..${sep}`) && !isAbsolute(path))
  );
}

/**
 * Resolve a caller-supplied path against an allow-list of directories.
 * `undefined` allows any path, an empty list disables local file access, and
 * otherwise the real path (symlinks followed) must sit inside an allowed
 * directory.
 */
export async function resolveAllowedPath(
  filePath: string,
  allowedDirs?: string[],
): Promise<string> {
  if (!allowedDirs) return filePath;

  if (allowedDirs.length === 0) {
    throw new Error(
      'Local file access is disabled. Use "content" or "url" instead, or start the server with --allowed-file-dirs.',
    );
  }

  const target = await realpath(resolve(filePath));
  for (const dir of allowedDirs) {
    const base = await realpath(resolve(dir)).catch(() => null);
    if (base !== null && isInside(base, target)) return target;
  }

  throw new Error('File path is outside the allowed directories.');
}

/**
 * Read a local file, enforcing the allowed-directories policy.
 */
export async function readAllowedFile(
  filePath: string,
  allowedDirs?: string[],
) {
  return readFile(await resolveAllowedPath(filePath, allowedDirs));
}
