import type { ParsedArgs } from 'minimist';
import minimist from 'minimist';
import { CLI_STRING_OPTIONS } from './constants.js';

/**
 * Parse process.argv with minimist. Does not read env or validate.
 */
export function parseArgs(argv: string[] = process.argv.slice(2)): ParsedArgs {
  return minimist(argv, {
    string: [...CLI_STRING_OPTIONS],
    boolean: ['help', 'http', 'version'],
    alias: { h: 'help', v: 'version' },
  });
}

/**
 * Parse reply-to from argv and env. argv wins.
 */
export function parseReplierAddresses(
  parsed: ParsedArgs,
  env: NodeJS.ProcessEnv,
): string[] {
  if (Array.isArray(parsed['reply-to'])) return parsed['reply-to'];
  if (typeof parsed['reply-to'] === 'string') return [parsed['reply-to']];
  const v = env.REPLY_TO_EMAIL_ADDRESSES;
  if (typeof v === 'string' && v.trim()) {
    return v
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
  }
  return [];
}

function parseListOption(
  parsed: ParsedArgs,
  argKey: string,
  env: NodeJS.ProcessEnv,
  envKey: string,
): string[] | undefined {
  const fromArg = parsed[argKey];
  const raw = Array.isArray(fromArg)
    ? fromArg.join(',')
    : typeof fromArg === 'string'
      ? fromArg
      : env[envKey];
  if (typeof raw !== 'string') return undefined;
  const list = raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  return list.length ? list : undefined;
}

/**
 * Parse the allowed-hosts list from argv and env. argv wins. Returns undefined
 * when neither is set, so the SDK's host-based default applies.
 */
export function parseAllowedHosts(
  parsed: ParsedArgs,
  env: NodeJS.ProcessEnv,
): string[] | undefined {
  return parseListOption(parsed, 'allowed-hosts', env, 'MCP_ALLOWED_HOSTS');
}

/**
 * Parse the allowed file directories from argv and env. argv wins. Returns
 * undefined when neither is set, so the transport's default policy applies.
 */
export function parseAllowedFileDirs(
  parsed: ParsedArgs,
  env: NodeJS.ProcessEnv,
): string[] | undefined {
  return parseListOption(
    parsed,
    'allowed-file-dirs',
    env,
    'MCP_ALLOWED_FILE_DIRS',
  );
}
