import { mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  readAllowedFile,
  resolveAllowedPath,
} from '../../src/lib/safe-access.js';

describe('resolveAllowedPath', () => {
  let root: string;
  let allowed: string;
  let outside: string;

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'safe-access-'));
    allowed = join(root, 'allowed');
    outside = join(root, 'outside');
    await mkdir(allowed);
    await mkdir(outside);
    await writeFile(join(allowed, 'ok.txt'), 'ok');
    await writeFile(join(outside, 'secret.txt'), 'secret');
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it('allows any path when no allow-list is configured', async () => {
    const path = join(outside, 'secret.txt');
    expect(await resolveAllowedPath(path)).toBe(path);
    expect((await readAllowedFile(path)).toString()).toBe('secret');
  });

  it('disables local file access when the allow-list is empty', async () => {
    await expect(
      resolveAllowedPath(join(allowed, 'ok.txt'), []),
    ).rejects.toThrow('Local file access is disabled');
  });

  it('reads files inside an allowed directory', async () => {
    const file = await readAllowedFile(join(allowed, 'ok.txt'), [allowed]);
    expect(file.toString()).toBe('ok');
  });

  it('rejects files outside every allowed directory', async () => {
    await expect(
      readAllowedFile(join(outside, 'secret.txt'), [allowed]),
    ).rejects.toThrow('outside the allowed directories');
  });

  it('gives a missing file the same error as a file outside the list', async () => {
    const missing = join(outside, 'missing.txt');
    const error = await readAllowedFile(missing, [allowed]).catch(
      (e: Error) => e,
    );
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toBe(
      'File not found or outside the allowed directories.',
    );
  });

  it('rejects parent-directory traversal', async () => {
    await expect(
      readAllowedFile(join(allowed, '..', 'outside', 'secret.txt'), [allowed]),
    ).rejects.toThrow('outside the allowed directories');
  });

  it('rejects sibling directories that share the allowed prefix', async () => {
    const sibling = join(root, 'allowed-evil');
    await mkdir(sibling);
    await writeFile(join(sibling, 'secret.txt'), 'secret');
    await expect(
      readAllowedFile(join(sibling, 'secret.txt'), [allowed]),
    ).rejects.toThrow('outside the allowed directories');
  });

  it('rejects symlinks that escape the allowed directory', async () => {
    await symlink(outside, join(allowed, 'link'), 'junction');
    await expect(
      readAllowedFile(join(allowed, 'link', 'secret.txt'), [allowed]),
    ).rejects.toThrow('outside the allowed directories');
  });

  it('accepts a file when any one of several directories matches', async () => {
    const file = await readAllowedFile(join(outside, 'secret.txt'), [
      allowed,
      outside,
    ]);
    expect(file.toString()).toBe('secret');
  });

  it('ignores allowed directories that do not exist', async () => {
    const file = await readAllowedFile(join(allowed, 'ok.txt'), [
      join(root, 'missing'),
      allowed,
    ]);
    expect(file.toString()).toBe('ok');
  });
});
