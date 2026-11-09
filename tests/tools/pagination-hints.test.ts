import { Client } from '@modelcontextprotocol/client';
import { InMemoryTransport } from '@modelcontextprotocol/server';
import type { Resend } from 'resend';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createMcpServer } from '../../src/server.js';

const list = vi.fn();
const resend = {
  apiKeys: { list },
  automations: { list, runs: { list } },
  contactProperties: { list },
  contacts: { list, imports: { list }, segments: { list }, topics: { list } },
  domains: { list },
  events: { list },
  logs: { list },
  oauthGrants: { list },
  segments: { list },
  suppressions: { list },
  templates: { list },
} as unknown as Resend;

const page = ['first-id', 'last-id'].map((id) => ({
  id,
  name: 'Example',
  email: 'contact@example.com',
  created_at: '2026-01-01T00:00:00Z',
  counts: { total: 1, created: 1, updated: 0, skipped: 0, failed: 0 },
  client: { name: 'Example app' },
  scopes: ['emails:send'],
}));

const tools: [string, Record<string, string>][] = [
  ['list-api-keys', {}],
  ['get-automation', {}],
  ['get-automation-runs', { automationId: 'automation-id' }],
  ['list-contact-imports', {}],
  ['list-contact-properties', {}],
  ['list-contacts', {}],
  ['list-contact-segments', { contactId: 'contact-id' }],
  ['list-contact-topics', { id: 'contact-id' }],
  ['list-domains', {}],
  ['manage-events', { action: 'list' }],
  ['list-logs', {}],
  ['list-oauth-grants', {}],
  ['list-segments', {}],
  ['list-suppressions', {}],
  ['list-templates', {}],
];

describe('list tool pagination hints', () => {
  const client = new Client({ name: 'test-client', version: '0.0.0' });
  const server = createMcpServer(resend, {}, 'test-key');

  beforeAll(async () => {
    const [clientTransport, serverTransport] =
      InMemoryTransport.createLinkedPair();
    await Promise.all([
      server.connect(serverTransport),
      client.connect(clientTransport),
    ]);
  });

  afterAll(async () => {
    await Promise.all([client.close(), server.close()]);
  });

  async function call(name: string, args: Record<string, string>) {
    const result = await client.callTool({ name, arguments: args });
    expect(result.isError).not.toBe(true);
    const { content } = result as {
      content: { type: string; text?: string }[];
    };
    return content
      .filter(({ type }) => type === 'text')
      .map(({ text }) => text)
      .join('\n');
  }

  it.each(
    tools,
  )('%s continues in the requested direction', async (name, args) => {
    list.mockResolvedValue({
      data: { data: page, has_more: true },
      error: null,
    });

    const backward = await call(name, { ...args, before: 'cursor-id' });
    expect(backward).toMatch(/"before".*first ID/);
    expect(backward).not.toMatch(/"after".*last ID/);

    const forward = await call(name, { ...args, after: 'cursor-id' });
    expect(forward).toMatch(/"after".*last ID/);
    expect(forward).not.toMatch(/"before".*first ID/);
  });

  it('starts in the forward direction without a cursor', async () => {
    list.mockResolvedValue({
      data: { data: page, has_more: true },
      error: null,
    });

    expect(await call('list-segments', {})).toMatch(/"after".*last ID/);
  });

  it('omits the hint on the final page', async () => {
    list.mockResolvedValue({
      data: { data: page, has_more: false },
      error: null,
    });

    expect(await call('list-segments', { before: 'cursor-id' })).not.toMatch(
      /"before"|"after"/,
    );
  });
});
