import {
  StdioServerTransport,
  serveStdio,
} from '@modelcontextprotocol/server/stdio';
import type { Resend } from 'resend';
import { createMcpServer } from '../server.js';
import type { ServerOptions } from '../types.js';
import { MAX_MESSAGE_BYTES } from './limits.js';

export async function runStdio(
  resend: Resend,
  options: ServerOptions,
  apiKey: string,
): Promise<void> {
  serveStdio(() => createMcpServer(resend, options, apiKey), {
    legacy: 'serve',
    transport: new StdioServerTransport(undefined, undefined, {
      maxBufferSize: MAX_MESSAGE_BYTES,
    }),
    onerror: (error) => console.error('stdio connection error:', error),
  });
  console.error('Resend MCP Server running on stdio');
}
