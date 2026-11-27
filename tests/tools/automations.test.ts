import { Client } from '@modelcontextprotocol/client';
import { InMemoryTransport, McpServer } from '@modelcontextprotocol/server';
import type { Resend } from 'resend';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { addAutomationTools } from '../../src/tools/automations.js';

const create = vi.fn();
const get = vi.fn();
const duplicate = vi.fn();
const cancel = vi.fn();
const listRuns = vi.fn();

const resend = {
  automations: { create, get, duplicate, runs: { cancel, list: listRuns } },
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

describe('get-automation-runs', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('filters the run list by the skipped status', async () => {
    listRuns.mockResolvedValue({
      data: {
        object: 'list',
        has_more: false,
        data: [
          {
            id: 'run_1',
            status: 'skipped',
            started_at: '2026-08-27T10:00:00.000Z',
            completed_at: '2026-08-30T10:00:01.000Z',
            created_at: '2026-08-27T10:00:00.000Z',
          },
        ],
      },
      error: null,
    });
    const client = await makeClient();

    const result = await client.callTool({
      name: 'get-automation-runs',
      arguments: { automationId: 'aut_1', status: 'skipped' },
    });

    expect(result.isError).toBeFalsy();
    expect(listRuns).toHaveBeenCalledWith({
      automationId: 'aut_1',
      status: 'skipped',
    });
  });
  it('shows the reason on failed and skipped runs only', async () => {
    listRuns.mockResolvedValue({
      data: {
        object: 'list',
        has_more: false,
        data: [
          {
            id: 'run_failed',
            status: 'failed',
            status_reason: 'missing_variable',
            started_at: '2026-08-27T10:00:00.000Z',
            completed_at: '2026-08-27T10:00:02.000Z',
            created_at: '2026-08-27T10:00:00.000Z',
          },
          {
            id: 'run_skipped',
            status: 'skipped',
            status_reason: 'contact_deleted',
            started_at: '2026-08-27T11:00:00.000Z',
            completed_at: '2026-08-27T11:00:01.000Z',
            created_at: '2026-08-27T11:00:00.000Z',
          },
          {
            id: 'run_completed',
            status: 'completed',
            started_at: '2026-08-27T12:00:00.000Z',
            completed_at: '2026-08-27T12:00:05.000Z',
            created_at: '2026-08-27T12:00:00.000Z',
          },
        ],
      },
      error: null,
    });
    const client = await makeClient();

    const result = await client.callTool({
      name: 'get-automation-runs',
      arguments: { automationId: 'aut_1' },
    });

    const texts = (result.content as { text: string }[]).map((c) => c.text);
    expect(texts.find((t) => t.includes('run_failed'))).toContain(
      'Reason: missing_variable',
    );
    expect(texts.find((t) => t.includes('run_skipped'))).toContain(
      'Reason: contact_deleted',
    );
    expect(texts.find((t) => t.includes('run_completed'))).not.toContain(
      'Reason:',
    );
  });
});
