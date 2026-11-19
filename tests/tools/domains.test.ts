import { Client } from '@modelcontextprotocol/client';
import { InMemoryTransport, McpServer } from '@modelcontextprotocol/server';
import type { Resend } from 'resend';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { addDomainTools } from '../../src/tools/domains.js';

const forgeEnable = vi.fn();
const domainsVerify = vi.fn();

const resend = {
  domains: {
    forge: { enable: forgeEnable },
    verify: domainsVerify,
  },
} as unknown as Resend;

const DOMAIN_ID = '4dd369bc-aa82-4ff3-97de-514ae3000ee0';

async function makeClient() {
  const server = new McpServer({ name: 'test', version: '0.0.0' });
  addDomainTools(server, resend);
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

const forgeRecord = {
  record: 'SPF',
  name: 'forge',
  value: 'send.forge.rmta.net',
  type: 'CNAME',
  status: 'pending',
  ttl: 'Auto',
};

const domain = {
  object: 'domain',
  id: DOMAIN_ID,
  name: 'example.com',
  status: 'partially_verified',
  created_at: '2026-11-19 10:00:00+00',
  region: 'us-east-1',
  capabilities: { sending: 'enabled', receiving: 'disabled' },
  open_tracking: false,
  click_tracking: false,
  records: [forgeRecord],
};

describe('enable-forge', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    forgeEnable.mockResolvedValue({ data: domain, error: null });
  });

  it('registers enable-forge as a write tool', async () => {
    const client = await makeClient();
    const { tools } = await client.listTools();
    const tool = tools.find((t) => t.name === 'enable-forge');
    expect(tool).toBeDefined();
    expect(tool?.annotations?.readOnlyHint).toBeFalsy();
  });

  it('enables Forge and shows the Forge CNAME with next steps', async () => {
    const client = await makeClient();
    const result = await client.callTool({
      name: 'enable-forge',
      arguments: { id: DOMAIN_ID, customReturnPath: 'forge' },
    });
    expect(forgeEnable).toHaveBeenCalledWith({
      id: DOMAIN_ID,
      customReturnPath: 'forge',
    });
    const text = textOf(result as never);
    expect(text).toContain('Forge activation request accepted.');
    expect(text).toContain('Value: send.forge.rmta.net');
    expect(text).toContain('call verify-domain with scope ["forge"]');
    expect(text).not.toContain('moves receiving');
  });

  it('tells the agent to display the Receiving MX record when receiving moves', async () => {
    forgeEnable.mockResolvedValueOnce({
      data: {
        ...domain,
        capabilities: { sending: 'enabled', receiving: 'enabled' },
        records: [
          forgeRecord,
          {
            record: 'Receiving',
            name: 'example.com',
            value: 'receive.forge.rmta.net',
            type: 'MX',
            status: 'pending',
            ttl: 'Auto',
            priority: 10,
          },
        ],
      },
      error: null,
    });
    const client = await makeClient();
    const result = await client.callTool({
      name: 'enable-forge',
      arguments: { id: DOMAIN_ID },
    });
    const text = textOf(result as never);
    expect(text).toContain('Value: receive.forge.rmta.net');
    expect(text).toContain('Priority: 10');
    expect(text).toContain('Enabling Forge also moves receiving');
    expect(text).toContain('Do not rely on the top-level domain status');
  });

  it('surfaces SDK errors', async () => {
    forgeEnable.mockResolvedValueOnce({
      data: null,
      error: { name: 'forge_unavailable', message: 'dedicated IP' },
    });
    const client = await makeClient();
    const result = await client.callTool({
      name: 'enable-forge',
      arguments: { id: DOMAIN_ID },
    });
    expect(result.isError).toBe(true);
    expect(textOf(result as never)).toContain('Failed to enable Forge');
  });
});

describe('verify-domain', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    domainsVerify.mockResolvedValue({
      data: { object: 'domain', id: DOMAIN_ID },
      error: null,
    });
  });

  it('verifies only the Forge record when scoped', async () => {
    const client = await makeClient();
    const result = await client.callTool({
      name: 'verify-domain',
      arguments: { id: DOMAIN_ID, scope: ['forge'] },
    });
    expect(domainsVerify).toHaveBeenCalledWith(DOMAIN_ID, {
      scope: ['forge'],
    });
    expect(textOf(result as never)).toContain(
      'Forge verification started, checking only the Forge record.',
    );
  });

  it('keeps the classic behavior when scope is omitted', async () => {
    const client = await makeClient();
    const result = await client.callTool({
      name: 'verify-domain',
      arguments: { id: DOMAIN_ID },
    });
    expect(domainsVerify).toHaveBeenCalledWith(DOMAIN_ID, {
      scope: undefined,
    });
    expect(textOf(result as never)).toContain('Domain verification started.');
  });

  it('rejects scope values other than forge', async () => {
    const client = await makeClient();
    const result = await client.callTool({
      name: 'verify-domain',
      arguments: { id: DOMAIN_ID, scope: ['dkim'] },
    });
    expect(result.isError).toBe(true);
    expect(domainsVerify).not.toHaveBeenCalled();
  });
});
