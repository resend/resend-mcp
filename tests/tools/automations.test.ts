import { Client } from '@modelcontextprotocol/client';
import { InMemoryTransport, McpServer } from '@modelcontextprotocol/server';
import type { Resend } from 'resend';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { addAutomationTools } from '../../src/tools/automations.js';

const create = vi.fn();
const get = vi.fn();
const duplicate = vi.fn();
const cancel = vi.fn();

const resend = {
  automations: { create, get, duplicate, runs: { cancel } },
} as unknown as Resend;

const workflow = {
  steps: [
    {
      key: 'trigger',
      type: 'trigger',
      config: { eventName: 'user.created' },
      next: null,
    },
  ],
};

async function makeClient() {
  const server = new McpServer({ name: 'test', version: '0.0.0' });
  addAutomationTools(server, resend);
  const client = new Client({ name: 'test-client', version: '0.0.0' });
  const [clientTransport, serverTransport] =
    InMemoryTransport.createLinkedPair();
  await Promise.all([
    server.connect(serverTransport),
    client.connect(clientTransport),
  ]);
  return client;
}

describe('automation preview URLs', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('links to the editor route on create-automation', async () => {
    create.mockResolvedValue({ data: { id: 'aut_1' }, error: null });
    const client = await makeClient();

    const result = await client.callTool({
      name: 'create-automation',
      arguments: { name: 'Welcome Series', workflow },
    });

    expect(result.isError).toBeFalsy();
    const text = (result.content as Array<{ type: string; text: string }>)
      .map((c) => c.text)
      .join('\n');
    expect(text).toContain(
      'Preview: https://resend.com/automations/aut_1/editor',
    );
  });

  it('links to the editor route on get-automation', async () => {
    get.mockResolvedValue({
      data: {
        id: 'aut_1',
        name: 'Welcome Series',
        status: 'enabled',
        created_at: '2026-01-01T00:00:00Z',
        updated_at: null,
        steps: [],
        connections: [],
      },
      error: null,
    });
    const client = await makeClient();

    const result = await client.callTool({
      name: 'get-automation',
      arguments: { id: 'aut_1' },
    });

    expect(result.isError).toBeFalsy();
    const text = (result.content as Array<{ type: string; text: string }>)
      .map((c) => c.text)
      .join('\n');
    expect(text).toContain(
      'Preview: https://resend.com/automations/aut_1/editor',
    );
  });

  it('links to the editor route on duplicate-automation', async () => {
    duplicate.mockResolvedValue({ data: { id: 'aut_2' }, error: null });
    const client = await makeClient();

    const result = await client.callTool({
      name: 'duplicate-automation',
      arguments: { id: 'aut_1' },
    });

    expect(result.isError).toBeFalsy();
    const text = (result.content as Array<{ type: string; text: string }>)
      .map((c) => c.text)
      .join('\n');
    expect(text).toContain(
      'Preview: https://resend.com/automations/aut_2/editor',
    );
  });
});

describe('cancel-automation-run', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('cancels the run of the automation a dashboard URL points to', async () => {
    cancel.mockResolvedValue({
      data: { object: 'automation_run', id: 'run_1', status: 'cancelled' },
      error: null,
    });
    const client = await makeClient();

    const result = await client.callTool({
      name: 'cancel-automation-run',
      arguments: {
        automationId: 'https://resend.com/automations/aut_1',
        runId: 'run_1',
      },
    });

    expect(result.isError).toBeFalsy();
    expect(cancel).toHaveBeenCalledWith({
      automationId: 'aut_1',
      runId: 'run_1',
    });
  });

  it('reports a run that already finished as an error', async () => {
    cancel.mockResolvedValue({
      data: null,
      error: {
        name: 'validation_error',
        message: 'This run has already finished.',
      },
    });
    const client = await makeClient();

    const result = await client.callTool({
      name: 'cancel-automation-run',
      arguments: { automationId: 'aut_1', runId: 'run_1' },
    });

    expect(result.isError).toBe(true);
    expect(JSON.stringify(result.content)).toContain(
      'This run has already finished.',
    );
  });
});
