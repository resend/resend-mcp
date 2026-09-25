import { Client } from '@modelcontextprotocol/client';
import { InMemoryTransport, McpServer } from '@modelcontextprotocol/server';
import type { Resend } from 'resend';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { addUsageTools } from '../../src/tools/usage.js';

const get = vi.fn();

const resend = {
  usage: { get },
} as unknown as Resend;

async function makeClient() {
  const server = new McpServer({ name: 'test', version: '0.0.0' });
  addUsageTools(server, resend);
  const client = new Client({ name: 'test-client', version: '0.0.0' });
  const [clientTransport, serverTransport] =
    InMemoryTransport.createLinkedPair();
  await Promise.all([
    server.connect(serverTransport),
    client.connect(clientTransport),
  ]);
  return client;
}

function textOf(result: { content: Array<{ type: string; text?: string }> }) {
  return result.content
    .filter((c) => c.type === 'text')
    .map((c) => c.text)
    .join('\n');
}

describe('usage tools', () => {
  it('registers the get-usage tool as read-only', async () => {
    const client = await makeClient();
    const { tools } = await client.listTools();
    const tool = tools.find((t) => t.name === 'get-usage');
    expect(tool).toBeDefined();
    expect(tool?.annotations?.readOnlyHint).toBe(true);
  });
});

describe('get-usage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('reports usage and limits across resources', async () => {
    get.mockResolvedValue({
      data: {
        object: 'usage',
        emails: {
          daily: {
            used: 258,
            limit: null,
            sent: 57,
            received: 201,
            resets_at: '2026-07-17T00:00:00.000Z',
          },
          monthly: {
            used: 5442,
            limit: 10000,
            sent: 1000,
            received: 4442,
            resets_at: '2026-08-01T00:00:00.000Z',
          },
        },
        contacts: { used: 85000, limit: 150000 },
        segments: { used: 2, limit: 3 },
        broadcasts: { used: 100, limit: null },
        ai_credits: {
          used: 0,
          limit: 500,
          next_increase_at: '2026-07-18T09:00:00.000Z',
        },
        automation_runs: {
          used: 0,
          limit: 1000,
          resets_at: '2026-08-01T00:00:00.000Z',
        },
        domains: { used: 1, limit: 1000 },
        rate_limit: { limit: 10, duration: '1000ms' },
      },
      error: null,
    });

    const client = await makeClient();
    const result = await client.callTool({ name: 'get-usage', arguments: {} });

    expect(get).toHaveBeenCalled();
    const text = textOf(result as never);
    expect(text).toContain(
      'Emails (daily): 258 (no cap) — sent 57, received 201, resets at 2026-07-17T00:00:00.000Z',
    );
    expect(text).toContain(
      'Emails (monthly): 5442 / 10000 — sent 1000, received 4442, resets at 2026-08-01T00:00:00.000Z',
    );
    expect(text).toContain('Contacts: 85000 / 150000');
    expect(text).toContain('Segments: 2 / 3');
    expect(text).toContain('Broadcasts: 100 (no cap)');
    expect(text).toContain(
      'AI credits: 0 / 500 — next increase at 2026-07-18T09:00:00.000Z',
    );
    expect(text).toContain(
      'Automation runs: 0 / 1000 — resets at 2026-08-01T00:00:00.000Z',
    );
    expect(text).toContain('Domains: 1 / 1000');
    expect(text).toContain('Rate limit: 10 requests per 1000ms');
  });

  it('reports a null next_increase_at as not applicable', async () => {
    get.mockResolvedValue({
      data: {
        object: 'usage',
        emails: {
          daily: {
            used: 0,
            limit: 100,
            sent: 0,
            received: 0,
            resets_at: '2026-07-17T00:00:00.000Z',
          },
          monthly: {
            used: 0,
            limit: 1000,
            sent: 0,
            received: 0,
            resets_at: '2026-08-01T00:00:00.000Z',
          },
        },
        contacts: { used: 0, limit: 1000 },
        segments: { used: 0, limit: null },
        broadcasts: { used: 0, limit: null },
        ai_credits: { used: 0, limit: null, next_increase_at: null },
        automation_runs: { used: 0, limit: 100, resets_at: '2026-08-01' },
        domains: { used: 0, limit: null },
        rate_limit: { limit: 10, duration: '1000ms' },
      },
      error: null,
    });

    const client = await makeClient();
    const result = await client.callTool({ name: 'get-usage', arguments: {} });

    const text = textOf(result as never);
    expect(text).toContain('AI credits: 0 (no cap)');
    expect(text).not.toContain('next increase at');
    expect(text).toContain('Segments: 0 (no cap)');
    expect(text).toContain('Domains: 0 (no cap)');
  });

  it('surfaces SDK errors', async () => {
    get.mockResolvedValueOnce({
      error: { message: 'unauthorized' },
      data: null,
    });

    const client = await makeClient();
    const result = await client.callTool({ name: 'get-usage', arguments: {} });

    expect(result.isError).toBe(true);
    expect(textOf(result as never)).toContain('Failed to get usage');
  });
});
