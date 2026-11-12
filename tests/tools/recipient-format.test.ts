import { Client } from '@modelcontextprotocol/client';
import { InMemoryTransport, McpServer } from '@modelcontextprotocol/server';
import type { Resend } from 'resend';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { addEmailTools } from '../../src/tools/emails.js';

const send = vi.fn();
const batchSend = vi.fn();
const resend = {
  emails: { send },
  batch: { send: batchSend },
} as unknown as Resend;

async function makeClient() {
  const server = new McpServer({ name: 'test', version: '0.0.0' });
  addEmailTools(server, resend, { replierEmailAddresses: [] });
  const client = new Client({ name: 'test-client', version: '0.0.0' });
  const [c, s] = InMemoryTransport.createLinkedPair();
  await Promise.all([server.connect(s), client.connect(c)]);
  return client;
}

// Same treatment #162 gave `from` and `replyTo`: pass the string through and
// let the API answer, instead of a stricter local regex.
const recipients = [
  'Jane Doe <jane@example.com>', // display name, accepted in from/replyTo already
  'info@xn--80aswg.xn--p1ai', // .рф (punycode TLD), rejected by z.email()
  'shop@xn--fiqs8s.xn--fiqs8s', // .中国 (punycode TLD)
];

describe('recipient address format', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    send.mockResolvedValue({ data: { id: 'email_1' }, error: null });
    batchSend.mockResolvedValue({
      data: { data: [{ id: 'email_1' }] },
      error: null,
    });
  });

  it.each(
    recipients,
  )('send-email passes to/cc/bcc through: %s', async (addr) => {
    const client = await makeClient();
    const result = await client.callTool({
      name: 'send-email',
      arguments: {
        from: 'onboarding@resend.dev',
        to: [addr],
        cc: [addr],
        bcc: [addr],
        subject: 'hello',
        text: 'world',
      },
    });
    expect(result.isError).toBeFalsy();
    expect(send).toHaveBeenCalledWith(
      expect.objectContaining({ to: [addr], cc: [addr], bcc: [addr] }),
      undefined,
    );
  });

  it.each(
    recipients,
  )('send-batch-emails passes to/cc/bcc through: %s', async (addr) => {
    const client = await makeClient();
    const result = await client.callTool({
      name: 'send-batch-emails',
      arguments: {
        emails: [
          {
            from: 'onboarding@resend.dev',
            to: [addr],
            cc: [addr],
            bcc: [addr],
            subject: 'hello',
            text: 'world',
          },
        ],
      },
    });
    expect(result.isError).toBeFalsy();
    expect(batchSend).toHaveBeenCalledWith(
      [expect.objectContaining({ to: [addr], cc: [addr], bcc: [addr] })],
      undefined,
    );
  });

  it('still rejects an empty recipient string before calling the SDK', async () => {
    const client = await makeClient();
    const result = await client.callTool({
      name: 'send-email',
      arguments: {
        from: 'onboarding@resend.dev',
        to: [''],
        subject: 'hello',
        text: 'world',
      },
    });
    expect(result.isError).toBe(true);
    expect(send).not.toHaveBeenCalled();
  });
});
