import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  Client,
  StreamableHTTPClientTransport,
} from '@modelcontextprotocol/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { runHttp } from '../../src/transports/http.js';

const send = vi.hoisted(() => vi.fn());

vi.mock('resend', () => ({
  Resend: class {
    emails = { send };
  },
}));

describe('runHttp local file access', () => {
  let dir: string;
  let file: string;
  let server: Server | undefined;
  let client: Client | undefined;

  beforeEach(async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    send.mockReset();
    send.mockResolvedValue({ data: { id: 'email_123' }, error: null });
    dir = await mkdtemp(join(tmpdir(), 'http-file-access-'));
    file = join(dir, 'secret.txt');
    await writeFile(file, 'secret');
  });

  afterEach(async () => {
    await client?.close();
    server?.close();
    client = undefined;
    server = undefined;
    vi.restoreAllMocks();
    await rm(dir, { recursive: true, force: true });
  });

  async function connect(
    allowedFileDirs: string[] | undefined,
    era: 'legacy' | 'modern',
  ): Promise<Client> {
    server = await runHttp({ replierEmailAddresses: [], allowedFileDirs }, 0);
    const { port } = server.address() as AddressInfo;
    client = new Client(
      { name: `test-client-${era}`, version: '0.0.0' },
      era === 'modern'
        ? { versionNegotiation: { mode: { pin: '2026-07-28' } } }
        : {},
    );
    await client.connect(
      new StreamableHTTPClientTransport(
        new URL(`http://127.0.0.1:${port}/mcp`),
        { requestInit: { headers: { Authorization: 'Bearer re_test_key' } } },
      ),
    );
    return client;
  }

  function sendWithAttachment(c: Client) {
    return c.callTool({
      name: 'send-email',
      arguments: {
        from: 'onboarding@resend.dev',
        to: ['delivered@resend.dev'],
        subject: 'hello',
        text: 'world',
        attachments: [{ filename: 'secret.txt', filePath: file }],
      },
    });
  }

  for (const era of ['legacy', 'modern'] as const) {
    it(`refuses local files by default for a ${era} client`, async () => {
      const result = await sendWithAttachment(await connect(undefined, era));

      expect(result.isError).toBe(true);
      expect(JSON.stringify(result.content)).toContain(
        'Local file access is disabled',
      );
      expect(send).not.toHaveBeenCalled();
    });

    it(`reads files in --allowed-file-dirs for a ${era} client`, async () => {
      const result = await sendWithAttachment(await connect([dir], era));

      expect(result.isError).toBeFalsy();
      const [attachment] = send.mock.calls[0][0].attachments;
      expect(attachment.content.toString()).toBe('secret');
    });
  }
});
