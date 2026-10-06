import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Client } from '@modelcontextprotocol/client';
import { InMemoryTransport, McpServer } from '@modelcontextprotocol/server';
import type { Resend } from 'resend';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { addContactImportTools } from '../../src/tools/contactImports.js';

const create = vi.fn();
const get = vi.fn();
const list = vi.fn();

const resend = {
  contacts: { imports: { create, get, list } },
} as unknown as Resend;

async function makeClient(options: { allowedFileDirs?: string[] } = {}) {
  const server = new McpServer({ name: 'test', version: '0.0.0' });
  addContactImportTools(server, resend, options);
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

describe('create-contact-import', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    create.mockResolvedValue({
      data: { object: 'contact_import', id: 'imp_1' },
    });
  });

  it('registers the three import tools', async () => {
    const client = await makeClient();
    const { tools } = await client.listTools();
    const names = tools.map((t) => t.name);
    expect(names).toContain('create-contact-import');
    expect(names).toContain('get-contact-import');
    expect(names).toContain('list-contact-imports');
  });

  it('uploads raw CSV content and returns the import ID', async () => {
    const client = await makeClient();
    const result = await client.callTool({
      name: 'create-contact-import',
      arguments: { content: 'email,first_name\na@b.com,Ada' },
    });

    expect(create).toHaveBeenCalledTimes(1);
    const payload = create.mock.calls[0][0];
    expect(payload.file).toBeInstanceOf(Blob);
    expect(payload.file.name).toBe('contacts.csv');
    expect(await payload.file.text()).toBe('email,first_name\na@b.com,Ada');
    expect(textOf(result as never)).toContain('Import ID: imp_1');
  });

  it('maps segmentIds to segment objects and passes through columnMap/onConflict/topics', async () => {
    const client = await makeClient();
    await client.callTool({
      name: 'create-contact-import',
      arguments: {
        content: 'a,b',
        columnMap: { email: 'Email Address' },
        onConflict: 'skip',
        segmentIds: ['seg_1', 'seg_2'],
        topics: [{ id: 'top_1', subscription: 'opt_in' }],
      },
    });

    const payload = create.mock.calls[0][0];
    expect(payload.columnMap).toEqual({ email: 'Email Address' });
    expect(payload.onConflict).toBe('skip');
    expect(payload.segments).toEqual([{ id: 'seg_1' }, { id: 'seg_2' }]);
    expect(payload.topics).toEqual([{ id: 'top_1', subscription: 'opt_in' }]);
  });

  it('honors a custom filename', async () => {
    const client = await makeClient();
    await client.callTool({
      name: 'create-contact-import',
      arguments: { content: 'a,b', filename: 'people.csv' },
    });
    expect(create.mock.calls[0][0].file.name).toBe('people.csv');
  });

  it('errors when no file source is provided', async () => {
    const client = await makeClient();
    const result = await client.callTool({
      name: 'create-contact-import',
      arguments: {},
    });
    expect(result.isError).toBe(true);
    expect(textOf(result as never)).toContain('exactly one of');
    expect(create).not.toHaveBeenCalled();
  });

  it('errors when multiple file sources are provided', async () => {
    const client = await makeClient();
    const result = await client.callTool({
      name: 'create-contact-import',
      arguments: { content: 'a,b', url: 'https://example.com/c.csv' },
    });
    expect(result.isError).toBe(true);
    expect(textOf(result as never)).toContain('exactly one of');
    expect(create).not.toHaveBeenCalled();
  });

  it('surfaces SDK errors', async () => {
    create.mockResolvedValueOnce({ error: { message: 'bad csv' } });
    const client = await makeClient();
    const result = await client.callTool({
      name: 'create-contact-import',
      arguments: { content: 'a,b' },
    });
    expect(result.isError).toBe(true);
    expect(textOf(result as never)).toContain(
      'Failed to create contact import',
    );
  });
});

describe('get-contact-import', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('formats status and counts', async () => {
    get.mockResolvedValue({
      data: {
        object: 'contact_import',
        id: 'imp_1',
        status: 'completed',
        created_at: '2026-01-01 00:00:00+00',
        completed_at: '2026-01-01 00:01:00+00',
        counts: { total: 5, created: 3, updated: 1, skipped: 1, failed: 0 },
      },
    });
    const client = await makeClient();
    const result = await client.callTool({
      name: 'get-contact-import',
      arguments: { id: 'imp_1' },
    });
    expect(get).toHaveBeenCalledWith('imp_1');
    const text = textOf(result as never);
    expect(text).toContain('Status: completed');
    expect(text).toContain('Created: 3');
    expect(text).toContain('Completed at: 2026-01-01 00:01:00+00');
  });

  it('omits completed_at when null', async () => {
    get.mockResolvedValue({
      data: {
        object: 'contact_import',
        id: 'imp_1',
        status: 'in_progress',
        created_at: '2026-01-01 00:00:00+00',
        completed_at: null,
        counts: { total: 0, created: 0, updated: 0, skipped: 0, failed: 0 },
      },
    });
    const client = await makeClient();
    const result = await client.callTool({
      name: 'get-contact-import',
      arguments: { id: 'imp_1' },
    });
    expect(textOf(result as never)).not.toContain('Completed at');
  });
});

describe('list-contact-imports', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('passes status and limit, and shows a has_more hint', async () => {
    list.mockResolvedValue({
      data: {
        has_more: true,
        data: [
          {
            object: 'contact_import',
            id: 'imp_1',
            status: 'completed',
            created_at: '2026-01-01 00:00:00+00',
            completed_at: '2026-01-01 00:01:00+00',
            counts: { total: 1, created: 1, updated: 0, skipped: 0, failed: 0 },
          },
        ],
      },
    });
    const client = await makeClient();
    const result = await client.callTool({
      name: 'list-contact-imports',
      arguments: { status: 'completed', limit: 5 },
    });
    expect(list).toHaveBeenCalledWith({ limit: 5, status: 'completed' });
    const text = textOf(result as never);
    expect(text).toContain('Found 1 contact import:');
    expect(text).toContain('There are more contact imports available');
  });

  it('reports when none are found', async () => {
    list.mockResolvedValue({ data: { has_more: false, data: [] } });
    const client = await makeClient();
    const result = await client.callTool({
      name: 'list-contact-imports',
      arguments: {},
    });
    expect(list).toHaveBeenCalledWith(undefined);
    expect(textOf(result as never)).toContain('No contact imports found.');
  });

  it('rejects using both after and before', async () => {
    const client = await makeClient();
    const result = await client.callTool({
      name: 'list-contact-imports',
      arguments: { after: 'a', before: 'b' },
    });
    expect(result.isError).toBe(true);
    expect(textOf(result as never)).toContain('Cannot use both');
    expect(list).not.toHaveBeenCalled();
  });
});

describe('create-contact-import local file source', () => {
  let root: string;
  let allowed: string;
  let outside: string;

  beforeEach(async () => {
    vi.clearAllMocks();
    create.mockResolvedValue({
      data: { object: 'contact_import', id: 'imp_1' },
    });
    root = await mkdtemp(join(tmpdir(), 'contact-import-'));
    allowed = join(root, 'allowed');
    outside = join(root, 'outside');
    await mkdir(allowed);
    await mkdir(outside);
    await writeFile(join(allowed, 'contacts.csv'), 'email\na@b.com');
    await writeFile(join(outside, 'secret.csv'), 'email\nsecret@b.com');
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  function importFile(client: Client, filePath: string) {
    return client.callTool({
      name: 'create-contact-import',
      arguments: { filePath },
    });
  }

  it('uploads files inside an allowed directory', async () => {
    const client = await makeClient({ allowedFileDirs: [allowed] });
    const result = await importFile(client, join(allowed, 'contacts.csv'));

    expect(result.isError).toBeFalsy();
    expect(await create.mock.calls[0][0].file.text()).toBe('email\na@b.com');
  });

  it('uploads any file when no allow-list is configured', async () => {
    const client = await makeClient();
    const result = await importFile(client, join(outside, 'secret.csv'));

    expect(result.isError).toBeFalsy();
    expect(create).toHaveBeenCalledTimes(1);
  });

  it('refuses files outside the allowed directories', async () => {
    const client = await makeClient({ allowedFileDirs: [allowed] });
    const result = await importFile(client, join(outside, 'secret.csv'));

    expect(result.isError).toBe(true);
    expect(textOf(result as never)).toContain('outside the allowed');
    expect(create).not.toHaveBeenCalled();
  });

  it('refuses path traversal out of the allowed directory', async () => {
    const client = await makeClient({ allowedFileDirs: [allowed] });
    const result = await importFile(
      client,
      join(allowed, '..', 'outside', 'secret.csv'),
    );

    expect(result.isError).toBe(true);
    expect(create).not.toHaveBeenCalled();
  });

  it('refuses every local file when the allow-list is empty', async () => {
    const client = await makeClient({ allowedFileDirs: [] });
    const result = await importFile(client, join(allowed, 'contacts.csv'));

    expect(result.isError).toBe(true);
    expect(textOf(result as never)).toContain('Local file access is disabled');
    expect(create).not.toHaveBeenCalled();
  });
});
