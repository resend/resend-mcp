import { Client } from '@modelcontextprotocol/client';
import { InMemoryTransport, McpServer } from '@modelcontextprotocol/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { InboxesClient } from '../../src/lib/inboxes-client.js';
import { addInboxTools } from '../../src/tools/inboxes.js';

const createInbox = vi.fn();
const listInboxes = vi.fn();
const getInbox = vi.fn();
const updateInbox = vi.fn();
const removeInbox = vi.fn();
const listInboxThreads = vi.fn();
const getInboxThread = vi.fn();
const updateInboxThread = vi.fn();
const removeInboxThread = vi.fn();
const getInboxThreadEmail = vi.fn();
const replyToInboxThreadEmail = vi.fn();
const forwardInboxThreadEmail = vi.fn();
const listInboxLabels = vi.fn();
const createInboxLabel = vi.fn();
const updateInboxLabel = vi.fn();
const removeInboxLabel = vi.fn();
const listInboxDrafts = vi.fn();
const createInboxDraft = vi.fn();
const getInboxDraft = vi.fn();
const updateInboxDraft = vi.fn();
const removeInboxDraft = vi.fn();
const sendInboxDraft = vi.fn();

const inboxes = {
  create: createInbox,
  list: listInboxes,
  get: getInbox,
  update: updateInbox,
  remove: removeInbox,
  threads: {
    list: listInboxThreads,
    get: getInboxThread,
    update: updateInboxThread,
    remove: removeInboxThread,
    emails: {
      get: getInboxThreadEmail,
      reply: replyToInboxThreadEmail,
      forward: forwardInboxThreadEmail,
    },
  },
  labels: {
    list: listInboxLabels,
    create: createInboxLabel,
    update: updateInboxLabel,
    remove: removeInboxLabel,
  },
  drafts: {
    list: listInboxDrafts,
    create: createInboxDraft,
    get: getInboxDraft,
    update: updateInboxDraft,
    remove: removeInboxDraft,
    send: sendInboxDraft,
  },
} as unknown as InboxesClient;

const INBOX_ID = 'inbox_2ZbUCwvGmIT4mLIN6d3Yz0Ainbd';
const OTHER_INBOX_ID = 'inbox_3aCvDxwHnJU5nMJO7e4Za1Bjoce';
const THREAD_ID = 'thread_4bDwEyxIoKV6oNKP8f5Ab2Ckpdf';
const EMAIL_ID = '5c8e6a12-9f3b-4c7d-8e21-0b7a9d4e1f30';
const SENT_EMAIL_ID = '7e0f8c34-1b5d-4e9f-a043-2d9cbf60310a';
const LABEL_ID = 'label_6dFyGzzKqMX8qPMR0h7Cd4Emrfh';
const OTHER_LABEL_ID = 'label_7eGzHaaLrNY9rQNS1i8De5Fnsgi';
const DRAFT_ID = 'draft_8fHzIbbMsOZ0sROT2j9Ef6Gothj';

const INBOUND_MESSAGE = {
  id: EMAIL_ID,
  direction: 'inbound',
  from: 'customer@example.com',
  to: ['support@example.com'],
  cc: ['billing@example.com'],
  bcc: [],
  reply_to: ['customer-replies@example.com'],
  subject: 'Refund request',
  message_id: '<abc@mail.example.com>',
  html: '<p>Please refund my order</p>',
  text: 'Please refund my order',
  attachments: [
    { id: 'att_1', filename: 'receipt.pdf', size: 12345 },
    { id: 'att_2', filename: null, size: null },
  ],
  read: false,
  received_at: '2026-09-10T08:15:00.000Z',
};

const FORWARDED_MESSAGE = {
  id: 'b2c3d4e5-6f70-4a81-9b2c-3d4e5f607182',
  email_id: SENT_EMAIL_ID,
  direction: 'outbound',
  from: 'support@example.com',
  to: ['teammate@example.com'],
  cc: [],
  bcc: [],
  html: '<p>Can you take a look?</p>',
  text: null,
  attachments: [{ id: 'att_1', filename: 'receipt.pdf', size: 12345 }],
  read: true,
  received_at: '2026-09-11T10:00:00.000Z',
};

const REPLY_DRAFT = {
  object: 'inbox_draft',
  id: DRAFT_ID,
  type: 'reply',
  to: ['customer@example.com'],
  cc: ['billing@example.com'],
  bcc: [],
  subject: 'Re: Refund request',
  html: '<p>Your refund is on its way</p>',
  text: 'Your refund is on its way',
  thread_id: THREAD_ID,
  reply_to_email_id: EMAIL_ID,
  email_id: null,
  created_at: '2026-09-11T09:00:00.000Z',
  updated_at: '2026-09-11T09:30:00.000Z',
};

function addresses(count: number, prefix: string) {
  return Array.from({ length: count }, (_, i) => `${prefix}${i}@example.com`);
}

async function makeClient() {
  const server = new McpServer({ name: 'test', version: '0.0.0' });
  addInboxTools(server, inboxes);
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

describe('inbox tools', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('registers the inbox tools with the right annotations', async () => {
    const client = await makeClient();
    const { tools } = await client.listTools();
    const byName = Object.fromEntries(tools.map((t) => [t.name, t]));

    for (const name of [
      'list-inboxes',
      'get-inbox',
      'list-inbox-threads',
      'get-inbox-thread',
      'get-inbox-thread-email',
      'list-inbox-labels',
      'list-inbox-drafts',
      'get-inbox-draft',
    ]) {
      expect(byName[name]?.annotations?.readOnlyHint).toBe(true);
      expect(byName[name]?.annotations?.destructiveHint).toBe(false);
      expect(byName[name]?.annotations?.openWorldHint).toBe(false);
    }

    for (const name of [
      'create-inbox',
      'update-inbox',
      'update-inbox-thread',
      'create-inbox-label',
      'update-inbox-label',
      'create-inbox-draft',
      'update-inbox-draft',
    ]) {
      expect(byName[name]?.annotations?.readOnlyHint).toBe(false);
      expect(byName[name]?.annotations?.destructiveHint).toBe(false);
      expect(byName[name]?.annotations?.openWorldHint).toBe(false);
    }

    for (const name of [
      'remove-inbox',
      'remove-inbox-thread',
      'remove-inbox-label',
      'remove-inbox-draft',
    ]) {
      expect(byName[name]?.annotations?.readOnlyHint).toBe(false);
      expect(byName[name]?.annotations?.destructiveHint).toBe(true);
      expect(byName[name]?.annotations?.openWorldHint).toBe(false);
    }

    // The tools that deliver real mail to an external mailbox. MCP clients
    // gate their confirmation UI on destructiveHint and openWorldHint.
    for (const name of [
      'reply-to-inbox-thread-email',
      'forward-inbox-thread-email',
      'send-inbox-draft',
    ]) {
      expect(byName[name]?.annotations?.readOnlyHint).toBe(false);
      expect(byName[name]?.annotations?.destructiveHint).toBe(true);
      expect(byName[name]?.annotations?.openWorldHint).toBe(true);
    }
  });

  // reply-to-inbox-thread-email shipped flagged destructive with no confirmation
  // demand while all six of its peers had one. Deriving the list from listTools()
  // rather than hardcoding it means a tool added later cannot repeat that.
  it('demands confirmation in every destructive tool description', async () => {
    const client = await makeClient();
    const { tools } = await client.listTools();

    const destructive = tools.filter(
      (t) => t.annotations?.destructiveHint === true,
    );
    expect(destructive).not.toHaveLength(0);

    for (const tool of destructive) {
      expect(tool.description, tool.name).toContain(
        'you MUST double-check with the user',
      );
      expect(tool.description, tool.name).toContain(
        'only use this tool if the user explicitly confirms',
      );
    }
  });

  it('create-inbox sends the address and options to the SDK', async () => {
    createInbox.mockResolvedValue({
      data: {
        object: 'inbox',
        id: INBOX_ID,
        name: 'Support',
        email_address: 'support@example.com',
        domain_id: '4dd369bc-aa82-4ff3-97de-514ae3000ee0',
        forwarding_address: null,
        friendly_name: 'Acme Support',
        unread: 0,
        created_at: '2026-09-01T12:00:00.000Z',
      },
      error: null,
    });

    const client = await makeClient();
    const result = await client.callTool({
      name: 'create-inbox',
      arguments: {
        emailAddress: 'support@example.com',
        name: 'Support',
        friendlyName: 'Acme Support',
      },
    });

    expect(createInbox).toHaveBeenCalledWith({
      emailAddress: 'support@example.com',
      name: 'Support',
      forwarding: undefined,
      friendlyName: 'Acme Support',
    });
    const text = textOf(result as never);
    expect(text).toContain('support@example.com');
    expect(text).toContain(INBOX_ID);
    expect(text).toContain('Acme Support');
    expect(text).not.toContain('Forwarding address');
  });

  it('create-inbox tells the caller to surface the forwarding address', async () => {
    createInbox.mockResolvedValue({
      data: {
        object: 'inbox',
        id: INBOX_ID,
        name: 'Support',
        email_address: 'support@example.com',
        domain_id: '4dd369bc-aa82-4ff3-97de-514ae3000ee0',
        forwarding_address: 'abc12345@acme.resend.cloud',
        friendly_name: null,
        unread: 0,
        created_at: '2026-09-01T12:00:00.000Z',
      },
      error: null,
    });

    const client = await makeClient();
    const result = await client.callTool({
      name: 'create-inbox',
      arguments: { emailAddress: 'support@example.com', forwarding: true },
    });

    expect(createInbox).toHaveBeenCalledWith({
      emailAddress: 'support@example.com',
      name: undefined,
      forwarding: true,
      friendlyName: undefined,
    });
    const text = textOf(result as never);
    expect(text).toContain('Forwarding address: abc12345@acme.resend.cloud');
    expect(text).toContain('no mail reaches this inbox until they forward');
  });

  it('create-inbox surfaces an API failure', async () => {
    createInbox.mockResolvedValue({
      data: null,
      error: {
        name: 'invalid_parameter',
        statusCode: 409,
        message: 'An inbox with this address already exists',
      },
    });

    const client = await makeClient();
    const result = await client.callTool({
      name: 'create-inbox',
      arguments: { emailAddress: 'support@example.com' },
    });

    expect(result.isError).toBe(true);
    const text = textOf(result as never);
    expect(text).toContain('Failed to create inbox');
    expect(text).toContain('An inbox with this address already exists');
  });

  it('list-inboxes forwards pagination and hints when more pages exist', async () => {
    listInboxes.mockResolvedValue({
      data: {
        object: 'list',
        has_more: true,
        data: [
          {
            id: INBOX_ID,
            name: 'Support',
            email_address: 'support@example.com',
            friendly_name: 'Acme Support',
            unread: 3,
            last_received: '2026-09-10T08:15:00.000Z',
          },
        ],
      },
      error: null,
    });

    const client = await makeClient();
    const result = await client.callTool({
      name: 'list-inboxes',
      arguments: { limit: 50, after: OTHER_INBOX_ID },
    });

    expect(listInboxes).toHaveBeenCalledWith({
      limit: 50,
      after: OTHER_INBOX_ID,
    });
    const text = textOf(result as never);
    expect(text).toContain('Found 1 inbox:');
    expect(text).toContain('support@example.com');
    expect(text).toContain('Unread: 3');
    expect(text).toContain(
      'There are more inboxes available. Use the "after" parameter with the last ID to retrieve more.',
    );
  });

  it('list-inboxes points the cursor backward when paginating with "before"', async () => {
    listInboxes.mockResolvedValue({
      data: {
        object: 'list',
        has_more: true,
        data: [
          {
            id: INBOX_ID,
            name: 'Support',
            email_address: 'support@example.com',
            friendly_name: 'Acme Support',
            unread: 3,
            last_received: '2026-09-10T08:15:00.000Z',
          },
        ],
      },
      error: null,
    });

    const client = await makeClient();
    const result = await client.callTool({
      name: 'list-inboxes',
      arguments: { limit: 50, before: OTHER_INBOX_ID },
    });

    expect(listInboxes).toHaveBeenCalledWith({
      limit: 50,
      before: OTHER_INBOX_ID,
    });
    const text = textOf(result as never);
    // Telling a backward-walking caller to use "after" sends them back over
    // the page they just read.
    expect(text).toContain(
      'There are more inboxes available. Use the "before" parameter with the first ID to continue paginating backward.',
    );
    expect(text).not.toContain('"after" parameter');
  });

  it('list-inboxes says when an inbox has never received mail', async () => {
    listInboxes.mockResolvedValue({
      data: {
        object: 'list',
        has_more: false,
        data: [
          {
            id: INBOX_ID,
            name: null,
            email_address: 'support@example.com',
            friendly_name: null,
            unread: 0,
            last_received: null,
          },
        ],
      },
      error: null,
    });

    const client = await makeClient();
    const result = await client.callTool({
      name: 'list-inboxes',
      arguments: {},
    });

    expect(listInboxes).toHaveBeenCalledWith(undefined);
    const text = textOf(result as never);
    expect(text).toContain('Last received: never');
    expect(text).not.toContain('Name:');
    expect(text).not.toContain('There are more inboxes available');
  });

  it('list-inboxes refuses both "after" and "before"', async () => {
    const client = await makeClient();
    const result = await client.callTool({
      name: 'list-inboxes',
      arguments: { after: INBOX_ID, before: OTHER_INBOX_ID },
    });

    expect(listInboxes).not.toHaveBeenCalled();
    expect(result.isError).toBe(true);
    expect(textOf(result as never)).toContain(
      'Cannot use both "after" and "before" parameters',
    );
  });

  it('list-inboxes surfaces an API failure', async () => {
    listInboxes.mockResolvedValue({
      data: null,
      error: {
        name: 'application_error',
        statusCode: 500,
        message: 'Something went wrong',
      },
    });

    const client = await makeClient();
    const result = await client.callTool({
      name: 'list-inboxes',
      arguments: {},
    });

    expect(result.isError).toBe(true);
    expect(textOf(result as never)).toContain('Failed to list inboxes');
  });

  it('get-inbox passes the ID positionally and renders the counts', async () => {
    getInbox.mockResolvedValue({
      data: {
        object: 'inbox',
        id: INBOX_ID,
        name: 'Support',
        email_address: 'support@example.com',
        forwarding_address: 'abc12345@acme.resend.cloud',
        friendly_name: 'Acme Support',
        unread: 3,
        drafts: 2,
        last_received: '2026-09-10T08:15:00.000Z',
      },
      error: null,
    });

    const client = await makeClient();
    const result = await client.callTool({
      name: 'get-inbox',
      arguments: { inboxId: INBOX_ID },
    });

    expect(getInbox).toHaveBeenCalledWith(INBOX_ID);
    const text = textOf(result as never);
    expect(text).toContain('Unread: 3');
    expect(text).toContain('Drafts: 2');
    expect(text).toContain('Forwarding address: abc12345@acme.resend.cloud');
    expect(text).toContain('Last received: 2026-09-10T08:15:00.000Z');
  });

  it('get-inbox surfaces an API failure', async () => {
    getInbox.mockResolvedValue({
      data: null,
      error: {
        name: 'not_found',
        statusCode: 404,
        message: 'The resource you are looking for is not available',
      },
    });

    const client = await makeClient();
    const result = await client.callTool({
      name: 'get-inbox',
      arguments: { inboxId: INBOX_ID },
    });

    expect(result.isError).toBe(true);
    expect(textOf(result as never)).toContain('Failed to get inbox');
  });

  it('update-inbox passes the ID positionally and the changed fields', async () => {
    updateInbox.mockResolvedValue({
      data: { object: 'inbox', id: INBOX_ID },
      error: null,
    });

    const client = await makeClient();
    const result = await client.callTool({
      name: 'update-inbox',
      arguments: { inboxId: INBOX_ID, friendlyName: 'Acme Support' },
    });

    expect(updateInbox).toHaveBeenCalledWith(INBOX_ID, {
      friendlyName: 'Acme Support',
    });
    const text = textOf(result as never);
    expect(text).toContain('Inbox updated successfully.');
    expect(text).toContain(INBOX_ID);
  });

  it('update-inbox requires a name or a friendly name', async () => {
    const client = await makeClient();
    const result = await client.callTool({
      name: 'update-inbox',
      arguments: { inboxId: INBOX_ID },
    });

    expect(updateInbox).not.toHaveBeenCalled();
    expect(result.isError).toBe(true);
    expect(textOf(result as never)).toContain(
      'You must provide `name` or `friendlyName` to update an inbox.',
    );
  });

  it('update-inbox surfaces an API failure', async () => {
    updateInbox.mockResolvedValue({
      data: null,
      error: {
        name: 'validation_error',
        statusCode: 422,
        message: 'The reply-as name cannot include a colon.',
      },
    });

    const client = await makeClient();
    const result = await client.callTool({
      name: 'update-inbox',
      arguments: { inboxId: INBOX_ID, name: 'Support' },
    });

    expect(result.isError).toBe(true);
    expect(textOf(result as never)).toContain('Failed to update inbox');
  });

  it('remove-inbox passes the ID positionally and says threads went too', async () => {
    removeInbox.mockResolvedValue({
      data: { object: 'inbox', id: INBOX_ID, deleted: true },
      error: null,
    });

    const client = await makeClient();
    const result = await client.callTool({
      name: 'remove-inbox',
      arguments: { inboxId: INBOX_ID },
    });

    expect(removeInbox).toHaveBeenCalledWith(INBOX_ID);
    const text = textOf(result as never);
    expect(text).toContain('threads');
    expect(text).toContain(INBOX_ID);
  });

  it('remove-inbox surfaces an API failure', async () => {
    removeInbox.mockResolvedValue({
      data: null,
      error: {
        name: 'not_found',
        statusCode: 404,
        message: 'The resource you are looking for is not available',
      },
    });

    const client = await makeClient();
    const result = await client.callTool({
      name: 'remove-inbox',
      arguments: { inboxId: INBOX_ID },
    });

    expect(result.isError).toBe(true);
    expect(textOf(result as never)).toContain('Failed to remove inbox');
  });

  it('list-inbox-threads forwards every filter and the cursor to the SDK', async () => {
    listInboxThreads.mockResolvedValue({
      data: {
        object: 'list',
        has_more: true,
        next_cursor: 'Y3Vyc29yOjIwMjYtMDktMTA',
        data: [
          {
            id: THREAD_ID,
            subject: 'Refund request',
            from: 'customer@example.com',
            to: ['support@example.com'],
            cc: [],
            bcc: [],
            labels: [{ id: LABEL_ID, name: 'Billing', color: 'iris' }],
            message_count: 3,
            has_attachment: true,
            has_draft: false,
            read: false,
            received_at: '2026-09-10T08:15:00.000Z',
          },
        ],
      },
      error: null,
    });

    const client = await makeClient();
    const result = await client.callTool({
      name: 'list-inbox-threads',
      arguments: {
        inboxId: INBOX_ID,
        folder: 'archive',
        query: 'refund',
        from: 'customer@example.com',
        label: [LABEL_ID, 'label_other'],
        cursor: 'Y3Vyc29yOjIwMjYtMDktMDE',
      },
    });

    expect(listInboxThreads).toHaveBeenCalledWith({
      inboxId: INBOX_ID,
      folder: 'archive',
      query: 'refund',
      from: 'customer@example.com',
      label: [LABEL_ID, 'label_other'],
      cursor: 'Y3Vyc29yOjIwMjYtMDktMDE',
    });
    const text = textOf(result as never);
    expect(text).toContain('Found 1 thread:');
    expect(text).toContain('Subject: Refund request');
    expect(text).toContain(THREAD_ID);
    expect(text).toContain(`Labels: Billing (ID: ${LABEL_ID})`);
    expect(text).toContain('Messages: 3');
    expect(text).toContain('Read: no');
    expect(text).toContain('cursor=Y3Vyc29yOjIwMjYtMDktMTA');
  });

  it('list-inbox-threads takes a single label and omits the cursor hint on the last page', async () => {
    listInboxThreads.mockResolvedValue({
      data: {
        object: 'list',
        has_more: false,
        next_cursor: null,
        data: [
          {
            id: THREAD_ID,
            subject: null,
            from: null,
            to: [],
            cc: [],
            bcc: [],
            labels: [],
            message_count: 1,
            has_attachment: false,
            has_draft: false,
            read: true,
            received_at: '2026-09-10T08:15:00.000Z',
          },
        ],
      },
      error: null,
    });

    const client = await makeClient();
    const result = await client.callTool({
      name: 'list-inbox-threads',
      arguments: { inboxId: INBOX_ID, label: LABEL_ID },
    });

    expect(listInboxThreads).toHaveBeenCalledWith({
      inboxId: INBOX_ID,
      folder: undefined,
      query: undefined,
      from: undefined,
      label: LABEL_ID,
      cursor: undefined,
    });
    const text = textOf(result as never);
    expect(text).toContain('Subject: (no subject)');
    expect(text).toContain('From: unknown');
    expect(text).not.toContain('cursor=');
  });

  it('list-inbox-threads says when an inbox holds no threads', async () => {
    listInboxThreads.mockResolvedValue({
      data: { object: 'list', has_more: false, next_cursor: null, data: [] },
      error: null,
    });

    const client = await makeClient();
    const result = await client.callTool({
      name: 'list-inbox-threads',
      arguments: { inboxId: INBOX_ID },
    });

    expect(textOf(result as never)).toBe('No threads found.');
  });

  it('list-inbox-threads surfaces an API failure', async () => {
    listInboxThreads.mockResolvedValue({
      data: null,
      error: {
        name: 'not_found',
        statusCode: 404,
        message: 'The resource you are looking for is not available',
      },
    });

    const client = await makeClient();
    const result = await client.callTool({
      name: 'list-inbox-threads',
      arguments: { inboxId: INBOX_ID },
    });

    expect(result.isError).toBe(true);
    expect(textOf(result as never)).toContain('Failed to list inbox threads');
  });

  it('get-inbox-thread renders each message email ID without the bodies', async () => {
    getInboxThread.mockResolvedValue({
      data: {
        object: 'inbox_thread',
        id: THREAD_ID,
        subject: 'Refund request',
        folder: 'inbox',
        labels: [{ id: LABEL_ID, name: 'Billing', color: 'iris' }],
        read: false,
        messages: {
          has_more: true,
          data: [
            {
              id: EMAIL_ID,
              direction: 'inbound',
              from: 'customer@example.com',
              to: ['support@example.com'],
              cc: [],
              bcc: [],
              reply_to: [],
              subject: 'Refund request',
              message_id: '<abc@mail.example.com>',
              html: '<p>Please refund my order</p>',
              text: 'Please refund my order',
              attachments: [
                { id: 'att_1', filename: 'receipt.pdf', size: 12345 },
              ],
              read: false,
              received_at: '2026-09-10T08:15:00.000Z',
            },
            {
              id: 'f1a2b3c4-5d6e-7f80-9a1b-2c3d4e5f6071',
              direction: 'outbound',
              from: 'support@example.com',
              to: ['customer@example.com'],
              cc: [],
              bcc: [],
              reply_to: [],
              subject: 'Re: Refund request',
              message_id: '<def@mail.example.com>',
              html: '<p>Looking into it</p>',
              text: 'Looking into it',
              attachments: [],
              read: true,
              received_at: '2026-09-10T09:00:00.000Z',
            },
          ],
        },
      },
      error: null,
    });

    const client = await makeClient();
    const result = await client.callTool({
      name: 'get-inbox-thread',
      arguments: { inboxId: INBOX_ID, threadId: THREAD_ID },
    });

    expect(getInboxThread).toHaveBeenCalledWith({
      inboxId: INBOX_ID,
      threadId: THREAD_ID,
    });
    const text = textOf(result as never);
    expect(text).toContain('Folder: inbox');
    expect(text).toContain(`Labels: Billing (ID: ${LABEL_ID})`);
    expect(text).toContain(`Email ID: ${EMAIL_ID}`);
    expect(text).toContain('Email ID: f1a2b3c4-5d6e-7f80-9a1b-2c3d4e5f6071');
    expect(text).toContain('Direction: outbound');
    expect(text).toContain('Attachments: 1');
    expect(text).toContain('get-inbox-thread-email');
    expect(text).toContain('more messages');
    expect(text).not.toContain('Please refund my order');
  });

  it('get-inbox-thread surfaces an API failure', async () => {
    getInboxThread.mockResolvedValue({
      data: null,
      error: {
        name: 'not_found',
        statusCode: 404,
        message: 'The resource you are looking for is not available',
      },
    });

    const client = await makeClient();
    const result = await client.callTool({
      name: 'get-inbox-thread',
      arguments: { inboxId: INBOX_ID, threadId: THREAD_ID },
    });

    expect(result.isError).toBe(true);
    expect(textOf(result as never)).toContain('Failed to get inbox thread');
  });

  it('update-inbox-thread marks a thread read and applies a label', async () => {
    updateInboxThread.mockResolvedValue({
      data: {
        object: 'inbox',
        id: THREAD_ID,
        subject: 'Refund request',
        folder: 'inbox',
        labels: [{ id: LABEL_ID, name: 'Billing', color: 'iris' }],
        read: true,
      },
      error: null,
    });

    const client = await makeClient();
    const result = await client.callTool({
      name: 'update-inbox-thread',
      arguments: {
        inboxId: INBOX_ID,
        threadId: THREAD_ID,
        read: true,
        labelId: LABEL_ID,
      },
    });

    expect(updateInboxThread).toHaveBeenCalledWith({
      inboxId: INBOX_ID,
      threadId: THREAD_ID,
      read: true,
      folder: undefined,
      labelId: LABEL_ID,
    });
    const text = textOf(result as never);
    expect(text).toContain('Thread updated successfully.');
    expect(text).toContain('Read: yes');
    expect(text).toContain(`Labels: Billing (ID: ${LABEL_ID})`);
  });

  it('update-inbox-thread moves a thread to another folder', async () => {
    updateInboxThread.mockResolvedValue({
      data: {
        object: 'inbox',
        id: THREAD_ID,
        subject: 'Refund request',
        folder: 'archive',
        labels: [],
        read: false,
      },
      error: null,
    });

    const client = await makeClient();
    const result = await client.callTool({
      name: 'update-inbox-thread',
      arguments: {
        inboxId: INBOX_ID,
        threadId: THREAD_ID,
        folder: 'archive',
      },
    });

    expect(updateInboxThread).toHaveBeenCalledWith({
      inboxId: INBOX_ID,
      threadId: THREAD_ID,
      folder: 'archive',
      labelId: undefined,
    });
    expect(textOf(result as never)).toContain('Folder: archive');
  });

  it('update-inbox-thread applies a label on its own', async () => {
    updateInboxThread.mockResolvedValue({
      data: {
        object: 'inbox',
        id: THREAD_ID,
        subject: 'Refund request',
        folder: 'inbox',
        labels: [{ id: LABEL_ID, name: 'Billing', color: 'iris' }],
        read: false,
      },
      error: null,
    });

    const client = await makeClient();
    await client.callTool({
      name: 'update-inbox-thread',
      arguments: { inboxId: INBOX_ID, threadId: THREAD_ID, labelId: LABEL_ID },
    });

    expect(updateInboxThread).toHaveBeenCalledWith({
      inboxId: INBOX_ID,
      threadId: THREAD_ID,
      labelId: LABEL_ID,
    });
  });

  it('update-inbox-thread requires read, folder, or a label', async () => {
    const client = await makeClient();
    const result = await client.callTool({
      name: 'update-inbox-thread',
      arguments: { inboxId: INBOX_ID, threadId: THREAD_ID },
    });

    expect(updateInboxThread).not.toHaveBeenCalled();
    expect(result.isError).toBe(true);
    expect(textOf(result as never)).toContain(
      'You must provide `read`, `folder`, or `labelId` to update a thread.',
    );
  });

  it('update-inbox-thread rejects "sent" as a destination folder', async () => {
    const client = await makeClient();
    const result = await client.callTool({
      name: 'update-inbox-thread',
      arguments: { inboxId: INBOX_ID, threadId: THREAD_ID, folder: 'sent' },
    });

    expect(updateInboxThread).not.toHaveBeenCalled();
    expect(result.isError).toBe(true);
  });

  it('update-inbox-thread surfaces an API failure', async () => {
    updateInboxThread.mockResolvedValue({
      data: null,
      error: {
        name: 'not_found',
        statusCode: 404,
        message: 'The resource you are looking for is not available',
      },
    });

    const client = await makeClient();
    const result = await client.callTool({
      name: 'update-inbox-thread',
      arguments: { inboxId: INBOX_ID, threadId: THREAD_ID, read: true },
    });

    expect(result.isError).toBe(true);
    expect(textOf(result as never)).toContain('Failed to update inbox thread');
  });

  it('remove-inbox-thread passes both IDs and says the messages went too', async () => {
    removeInboxThread.mockResolvedValue({
      data: { object: 'inbox_thread', id: THREAD_ID, deleted: true },
      error: null,
    });

    const client = await makeClient();
    const result = await client.callTool({
      name: 'remove-inbox-thread',
      arguments: { inboxId: INBOX_ID, threadId: THREAD_ID },
    });

    expect(removeInboxThread).toHaveBeenCalledWith({
      inboxId: INBOX_ID,
      threadId: THREAD_ID,
    });
    const text = textOf(result as never);
    expect(text).toContain('every message in it');
    expect(text).toContain(THREAD_ID);
  });

  it('remove-inbox-thread surfaces an API failure', async () => {
    removeInboxThread.mockResolvedValue({
      data: null,
      error: {
        name: 'not_found',
        statusCode: 404,
        message: 'The resource you are looking for is not available',
      },
    });

    const client = await makeClient();
    const result = await client.callTool({
      name: 'remove-inbox-thread',
      arguments: { inboxId: INBOX_ID, threadId: THREAD_ID },
    });

    expect(result.isError).toBe(true);
    expect(textOf(result as never)).toContain('Failed to remove inbox thread');
  });

  it('get-inbox-thread-email renders the body and every attachment', async () => {
    getInboxThreadEmail.mockResolvedValue({
      data: INBOUND_MESSAGE,
      error: null,
    });

    const client = await makeClient();
    const result = await client.callTool({
      name: 'get-inbox-thread-email',
      arguments: { inboxId: INBOX_ID, threadId: THREAD_ID, emailId: EMAIL_ID },
    });

    expect(getInboxThreadEmail).toHaveBeenCalledWith({
      inboxId: INBOX_ID,
      threadId: THREAD_ID,
      emailId: EMAIL_ID,
    });
    const text = textOf(result as never);
    expect(text).toContain(`Email ID: ${EMAIL_ID}`);
    expect(text).toContain('Cc: billing@example.com');
    expect(text).toContain('Reply to: customer-replies@example.com');
    expect(text).toContain('Message ID: <abc@mail.example.com>');
    expect(text).toContain('Please refund my order');
    expect(text).toContain('<p>Please refund my order</p>');
    expect(text).toContain('Attachments (2):');
    expect(text).toContain('receipt.pdf (12345 bytes) — ID: att_1');
    expect(text).toContain('(no filename) (size unknown) — ID: att_2');
  });

  it('get-inbox-thread-email says so when a message has no body', async () => {
    getInboxThreadEmail.mockResolvedValue({
      data: { ...INBOUND_MESSAGE, html: null, text: null, attachments: [] },
      error: null,
    });

    const client = await makeClient();
    const result = await client.callTool({
      name: 'get-inbox-thread-email',
      arguments: { inboxId: INBOX_ID, threadId: THREAD_ID, emailId: EMAIL_ID },
    });

    const text = textOf(result as never);
    expect(text).toContain('carries no html or text body');
    expect(text).toContain('Attachments: none');
  });

  it('get-inbox-thread-email surfaces an API failure', async () => {
    getInboxThreadEmail.mockResolvedValue({
      data: null,
      error: {
        name: 'not_found',
        statusCode: 404,
        message: 'The resource you are looking for is not available',
      },
    });

    const client = await makeClient();
    const result = await client.callTool({
      name: 'get-inbox-thread-email',
      arguments: { inboxId: INBOX_ID, threadId: THREAD_ID, emailId: EMAIL_ID },
    });

    expect(result.isError).toBe(true);
    expect(textOf(result as never)).toContain(
      'Failed to get inbox thread email',
    );
  });

  it('reply-to-inbox-thread-email sends an html body with a subject', async () => {
    replyToInboxThreadEmail.mockResolvedValue({
      data: {
        ...INBOUND_MESSAGE,
        id: 'a1b2c3d4-5e6f-4071-8a9b-1c2d3e4f5061',
        email_id: SENT_EMAIL_ID,
        direction: 'outbound',
        from: 'support@example.com',
        to: ['customer@example.com'],
        cc: [],
        subject: 'Re: Refund request',
        attachments: [],
      },
      error: null,
    });

    const client = await makeClient();
    const result = await client.callTool({
      name: 'reply-to-inbox-thread-email',
      arguments: {
        inboxId: INBOX_ID,
        threadId: THREAD_ID,
        emailId: EMAIL_ID,
        html: '<p>Your refund is on its way</p>',
        subject: 'Re: Refund request',
      },
    });

    expect(replyToInboxThreadEmail).toHaveBeenCalledWith({
      inboxId: INBOX_ID,
      threadId: THREAD_ID,
      emailId: EMAIL_ID,
      html: '<p>Your refund is on its way</p>',
      text: undefined,
      subject: 'Re: Refund request',
    });
    const text = textOf(result as never);
    expect(text).toContain('Reply sent successfully.');
    expect(text).toContain('Email ID: a1b2c3d4-5e6f-4071-8a9b-1c2d3e4f5061');
    expect(text).toContain(`Sent email ID: ${SENT_EMAIL_ID}`);
    expect(text).toContain('Subject: Re: Refund request');
    expect(text).toContain('To: customer@example.com');
  });

  it('reply-to-inbox-thread-email replies with a text body alone', async () => {
    replyToInboxThreadEmail.mockResolvedValue({
      data: {
        ...INBOUND_MESSAGE,
        email_id: SENT_EMAIL_ID,
        direction: 'outbound',
        attachments: [],
      },
      error: null,
    });

    const client = await makeClient();
    await client.callTool({
      name: 'reply-to-inbox-thread-email',
      arguments: {
        inboxId: INBOX_ID,
        threadId: THREAD_ID,
        emailId: EMAIL_ID,
        text: 'Your refund is on its way',
      },
    });

    expect(replyToInboxThreadEmail).toHaveBeenCalledWith({
      inboxId: INBOX_ID,
      threadId: THREAD_ID,
      emailId: EMAIL_ID,
      text: 'Your refund is on its way',
      subject: undefined,
    });
  });

  it('reply-to-inbox-thread-email requires an html or text body', async () => {
    const client = await makeClient();
    const result = await client.callTool({
      name: 'reply-to-inbox-thread-email',
      arguments: { inboxId: INBOX_ID, threadId: THREAD_ID, emailId: EMAIL_ID },
    });

    expect(replyToInboxThreadEmail).not.toHaveBeenCalled();
    expect(result.isError).toBe(true);
    expect(textOf(result as never)).toContain(
      'You must provide `html` or `text` to reply to a message.',
    );
  });

  it('reply-to-inbox-thread-email surfaces an API failure', async () => {
    replyToInboxThreadEmail.mockResolvedValue({
      data: null,
      error: {
        name: 'validation_error',
        statusCode: 422,
        message: 'This thread can no longer be replied to',
      },
    });

    const client = await makeClient();
    const result = await client.callTool({
      name: 'reply-to-inbox-thread-email',
      arguments: {
        inboxId: INBOX_ID,
        threadId: THREAD_ID,
        emailId: EMAIL_ID,
        text: 'Your refund is on its way',
      },
    });

    expect(result.isError).toBe(true);
    const text = textOf(result as never);
    expect(text).toContain('Failed to reply to inbox thread email');
    expect(text).toContain('This thread can no longer be replied to');
  });

  it('forward-inbox-thread-email forwards to several recipients with a note', async () => {
    forwardInboxThreadEmail.mockResolvedValue({
      data: {
        ...FORWARDED_MESSAGE,
        to: ['teammate@example.com', 'lead@example.com'],
      },
      error: null,
    });

    const client = await makeClient();
    const result = await client.callTool({
      name: 'forward-inbox-thread-email',
      arguments: {
        inboxId: INBOX_ID,
        threadId: THREAD_ID,
        emailId: EMAIL_ID,
        to: ['teammate@example.com', 'lead@example.com'],
        html: '<p>Can you take a look?</p>',
        subject: 'Fwd: Refund request',
      },
    });

    expect(forwardInboxThreadEmail).toHaveBeenCalledWith({
      inboxId: INBOX_ID,
      threadId: THREAD_ID,
      emailId: EMAIL_ID,
      to: ['teammate@example.com', 'lead@example.com'],
      html: '<p>Can you take a look?</p>',
      text: undefined,
      subject: 'Fwd: Refund request',
    });
    const text = textOf(result as never);
    expect(text).toContain('Forward sent successfully.');
    expect(text).toContain(`Sent email ID: ${SENT_EMAIL_ID}`);
    expect(text).toContain('To: teammate@example.com, lead@example.com');
    expect(text).toContain('Attachments: 1');
  });

  it('forward-inbox-thread-email forwards with a recipient and nothing else', async () => {
    forwardInboxThreadEmail.mockResolvedValue({
      data: FORWARDED_MESSAGE,
      error: null,
    });

    const client = await makeClient();
    const result = await client.callTool({
      name: 'forward-inbox-thread-email',
      arguments: {
        inboxId: INBOX_ID,
        threadId: THREAD_ID,
        emailId: EMAIL_ID,
        to: 'teammate@example.com',
      },
    });

    expect(forwardInboxThreadEmail).toHaveBeenCalledWith({
      inboxId: INBOX_ID,
      threadId: THREAD_ID,
      emailId: EMAIL_ID,
      to: 'teammate@example.com',
      html: undefined,
      text: undefined,
      subject: undefined,
    });
    expect(result.isError).toBeFalsy();
    expect(textOf(result as never)).toContain('Forward sent successfully.');
  });

  it('forward-inbox-thread-email surfaces an API failure', async () => {
    forwardInboxThreadEmail.mockResolvedValue({
      data: null,
      error: {
        name: 'not_found',
        statusCode: 404,
        message: 'The resource you are looking for is not available',
      },
    });

    const client = await makeClient();
    const result = await client.callTool({
      name: 'forward-inbox-thread-email',
      arguments: {
        inboxId: INBOX_ID,
        threadId: THREAD_ID,
        emailId: EMAIL_ID,
        to: 'teammate@example.com',
      },
    });

    expect(result.isError).toBe(true);
    expect(textOf(result as never)).toContain(
      'Failed to forward inbox thread email',
    );
  });

  it('list-inbox-labels renders the ID of every label', async () => {
    listInboxLabels.mockResolvedValue({
      data: {
        object: 'list',
        has_more: false,
        data: [
          {
            id: LABEL_ID,
            name: 'Billing',
            color: 'iris',
            created_at: '2026-09-01T12:00:00.000Z',
          },
          {
            id: OTHER_LABEL_ID,
            name: 'Urgent',
            color: 'crimson',
            created_at: '2026-09-02T12:00:00.000Z',
          },
        ],
      },
      error: null,
    });

    const client = await makeClient();
    const result = await client.callTool({
      name: 'list-inbox-labels',
      arguments: { inboxId: INBOX_ID },
    });

    expect(listInboxLabels).toHaveBeenCalledWith({ inboxId: INBOX_ID });
    const text = textOf(result as never);
    expect(text).toContain('Found 2 labels:');
    expect(text).toContain('Name: Billing');
    expect(text).toContain(LABEL_ID);
    expect(text).toContain('Color: iris');
    expect(text).toContain('Name: Urgent');
    expect(text).toContain(OTHER_LABEL_ID);
    expect(text).not.toContain('more labels');
  });

  it('list-inbox-labels says when an inbox holds no labels', async () => {
    listInboxLabels.mockResolvedValue({
      data: { object: 'list', has_more: false, data: [] },
      error: null,
    });

    const client = await makeClient();
    const result = await client.callTool({
      name: 'list-inbox-labels',
      arguments: { inboxId: INBOX_ID },
    });

    expect(textOf(result as never)).toBe('No labels found.');
  });

  it('list-inbox-labels surfaces an API failure', async () => {
    listInboxLabels.mockResolvedValue({
      data: null,
      error: {
        name: 'not_found',
        statusCode: 404,
        message: 'The resource you are looking for is not available',
      },
    });

    const client = await makeClient();
    const result = await client.callTool({
      name: 'list-inbox-labels',
      arguments: { inboxId: INBOX_ID },
    });

    expect(result.isError).toBe(true);
    expect(textOf(result as never)).toContain('Failed to list inbox labels');
  });

  it('create-inbox-label sends the name and the chosen color', async () => {
    createInboxLabel.mockResolvedValue({
      data: {
        object: 'inbox_label',
        id: LABEL_ID,
        name: 'Billing',
        color: 'iris',
        created_at: '2026-09-01T12:00:00.000Z',
      },
      error: null,
    });

    const client = await makeClient();
    const result = await client.callTool({
      name: 'create-inbox-label',
      arguments: { inboxId: INBOX_ID, name: 'Billing', color: 'iris' },
    });

    expect(createInboxLabel).toHaveBeenCalledWith({
      inboxId: INBOX_ID,
      name: 'Billing',
      color: 'iris',
    });
    const text = textOf(result as never);
    expect(text).toContain('Label created successfully.');
    expect(text).toContain('Name: Billing');
    expect(text).toContain(LABEL_ID);
    expect(text).toContain('Color: iris');
  });

  it('create-inbox-label renders the color the API picked when none was given', async () => {
    createInboxLabel.mockResolvedValue({
      data: {
        object: 'inbox_label',
        id: LABEL_ID,
        name: 'Billing',
        color: 'grass',
        created_at: '2026-09-01T12:00:00.000Z',
      },
      error: null,
    });

    const client = await makeClient();
    const result = await client.callTool({
      name: 'create-inbox-label',
      arguments: { inboxId: INBOX_ID, name: 'Billing' },
    });

    expect(createInboxLabel).toHaveBeenCalledWith({
      inboxId: INBOX_ID,
      name: 'Billing',
      color: undefined,
    });
    expect(textOf(result as never)).toContain('Color: grass');
  });

  it('create-inbox-label rejects a color outside the SDK enum', async () => {
    const client = await makeClient();
    const result = await client.callTool({
      name: 'create-inbox-label',
      arguments: { inboxId: INBOX_ID, name: 'Billing', color: 'chartreuse' },
    });

    expect(createInboxLabel).not.toHaveBeenCalled();
    expect(result.isError).toBe(true);
  });

  it('create-inbox-label surfaces an API failure', async () => {
    createInboxLabel.mockResolvedValue({
      data: null,
      error: {
        name: 'validation_error',
        statusCode: 422,
        message: 'A label with this name already exists',
      },
    });

    const client = await makeClient();
    const result = await client.callTool({
      name: 'create-inbox-label',
      arguments: { inboxId: INBOX_ID, name: 'Billing' },
    });

    expect(result.isError).toBe(true);
    const text = textOf(result as never);
    expect(text).toContain('Failed to create inbox label');
    expect(text).toContain('A label with this name already exists');
  });

  it('update-inbox-label renames and recolors a label', async () => {
    updateInboxLabel.mockResolvedValue({
      data: { object: 'inbox_label', id: LABEL_ID },
      error: null,
    });

    const client = await makeClient();
    const result = await client.callTool({
      name: 'update-inbox-label',
      arguments: {
        inboxId: INBOX_ID,
        labelId: LABEL_ID,
        name: 'Payments',
        color: 'teal',
      },
    });

    expect(updateInboxLabel).toHaveBeenCalledWith({
      inboxId: INBOX_ID,
      labelId: LABEL_ID,
      name: 'Payments',
      color: 'teal',
    });
    const text = textOf(result as never);
    expect(text).toContain('Label updated successfully.');
    expect(text).toContain(LABEL_ID);
  });

  it('update-inbox-label recolors a label on its own', async () => {
    updateInboxLabel.mockResolvedValue({
      data: { object: 'inbox_label', id: LABEL_ID },
      error: null,
    });

    const client = await makeClient();
    await client.callTool({
      name: 'update-inbox-label',
      arguments: { inboxId: INBOX_ID, labelId: LABEL_ID, color: 'teal' },
    });

    expect(updateInboxLabel).toHaveBeenCalledWith({
      inboxId: INBOX_ID,
      labelId: LABEL_ID,
      name: undefined,
      color: 'teal',
    });
  });

  // The API accepts a patch with neither field and no-ops, so the tool must not
  // be stricter than the endpoint it wraps.
  it('update-inbox-label passes an empty patch through instead of rejecting it', async () => {
    const client = await makeClient();
    const result = await client.callTool({
      name: 'update-inbox-label',
      arguments: { inboxId: INBOX_ID, labelId: LABEL_ID },
    });

    expect(result.isError).toBeFalsy();
    expect(updateInboxLabel).toHaveBeenCalledWith({
      inboxId: INBOX_ID,
      labelId: LABEL_ID,
      name: undefined,
      color: undefined,
    });
  });

  it('update-inbox-label surfaces an API failure', async () => {
    updateInboxLabel.mockResolvedValue({
      data: null,
      error: {
        name: 'not_found',
        statusCode: 404,
        message: 'The resource you are looking for is not available',
      },
    });

    const client = await makeClient();
    const result = await client.callTool({
      name: 'update-inbox-label',
      arguments: { inboxId: INBOX_ID, labelId: LABEL_ID, name: 'Payments' },
    });

    expect(result.isError).toBe(true);
    expect(textOf(result as never)).toContain('Failed to update inbox label');
  });

  it('remove-inbox-label passes both IDs and says no threads were deleted', async () => {
    removeInboxLabel.mockResolvedValue({
      data: { object: 'inbox_label', id: LABEL_ID, deleted: true },
      error: null,
    });

    const client = await makeClient();
    const result = await client.callTool({
      name: 'remove-inbox-label',
      arguments: { inboxId: INBOX_ID, labelId: LABEL_ID },
    });

    expect(removeInboxLabel).toHaveBeenCalledWith({
      inboxId: INBOX_ID,
      labelId: LABEL_ID,
    });
    const text = textOf(result as never);
    expect(text).toContain('No threads were deleted.');
    expect(text).toContain(LABEL_ID);
  });

  it('remove-inbox-label surfaces an API failure', async () => {
    removeInboxLabel.mockResolvedValue({
      data: null,
      error: {
        name: 'not_found',
        statusCode: 404,
        message: 'The resource you are looking for is not available',
      },
    });

    const client = await makeClient();
    const result = await client.callTool({
      name: 'remove-inbox-label',
      arguments: { inboxId: INBOX_ID, labelId: LABEL_ID },
    });

    expect(result.isError).toBe(true);
    expect(textOf(result as never)).toContain('Failed to remove inbox label');
  });

  it('list-inbox-drafts forwards the cursor and hints at the next page', async () => {
    listInboxDrafts.mockResolvedValue({
      data: {
        object: 'list',
        has_more: true,
        next_cursor: 'Y3Vyc29yOjIwMjYtMDktMTE',
        data: [
          {
            id: DRAFT_ID,
            type: 'reply',
            to: ['customer@example.com'],
            cc: [],
            bcc: [],
            subject: 'Re: Refund request',
            snippet: 'Your refund is on its way',
            thread_id: THREAD_ID,
            reply_to_email_id: EMAIL_ID,
            updated_at: '2026-09-11T09:30:00.000Z',
          },
        ],
      },
      error: null,
    });

    const client = await makeClient();
    const result = await client.callTool({
      name: 'list-inbox-drafts',
      arguments: { inboxId: INBOX_ID, cursor: 'Y3Vyc29yOjIwMjYtMDktMDE' },
    });

    expect(listInboxDrafts).toHaveBeenCalledWith({
      inboxId: INBOX_ID,
      cursor: 'Y3Vyc29yOjIwMjYtMDktMDE',
    });
    const text = textOf(result as never);
    expect(text).toContain('Found 1 draft:');
    expect(text).toContain('Subject: Re: Refund request');
    expect(text).toContain(DRAFT_ID);
    expect(text).toContain('Type: reply');
    expect(text).toContain('To: customer@example.com');
    expect(text).toContain('Snippet: Your refund is on its way');
    expect(text).toContain(`Thread ID: ${THREAD_ID}`);
    expect(text).toContain('cursor=Y3Vyc29yOjIwMjYtMDktMTE');
  });

  it('list-inbox-drafts renders a standalone draft without a thread and drops the cursor hint on the last page', async () => {
    listInboxDrafts.mockResolvedValue({
      data: {
        object: 'list',
        has_more: false,
        next_cursor: null,
        data: [
          {
            id: DRAFT_ID,
            type: 'standalone',
            to: null,
            cc: [],
            bcc: [],
            subject: null,
            snippet: null,
            thread_id: null,
            reply_to_email_id: null,
            updated_at: '2026-09-11T09:30:00.000Z',
          },
        ],
      },
      error: null,
    });

    const client = await makeClient();
    const result = await client.callTool({
      name: 'list-inbox-drafts',
      arguments: { inboxId: INBOX_ID },
    });

    expect(listInboxDrafts).toHaveBeenCalledWith({
      inboxId: INBOX_ID,
      cursor: undefined,
    });
    const text = textOf(result as never);
    expect(text).toContain('Type: standalone');
    expect(text).toContain('Subject: (no subject)');
    expect(text).not.toContain('To:');
    expect(text).not.toContain('Thread ID:');
    expect(text).not.toContain('Snippet:');
    expect(text).not.toContain('cursor=');
  });

  it('list-inbox-drafts says when an inbox holds no drafts', async () => {
    listInboxDrafts.mockResolvedValue({
      data: { object: 'list', has_more: false, next_cursor: null, data: [] },
      error: null,
    });

    const client = await makeClient();
    const result = await client.callTool({
      name: 'list-inbox-drafts',
      arguments: { inboxId: INBOX_ID },
    });

    expect(textOf(result as never)).toBe('No drafts found.');
  });

  it('list-inbox-drafts surfaces an API failure', async () => {
    listInboxDrafts.mockResolvedValue({
      data: null,
      error: {
        name: 'not_found',
        statusCode: 404,
        message: 'The resource you are looking for is not available',
      },
    });

    const client = await makeClient();
    const result = await client.callTool({
      name: 'list-inbox-drafts',
      arguments: { inboxId: INBOX_ID },
    });

    expect(result.isError).toBe(true);
    expect(textOf(result as never)).toContain('Failed to list inbox drafts');
  });

  it('create-inbox-draft drafts a reply to a message in a thread', async () => {
    createInboxDraft.mockResolvedValue({ data: REPLY_DRAFT, error: null });

    const client = await makeClient();
    const result = await client.callTool({
      name: 'create-inbox-draft',
      arguments: {
        inboxId: INBOX_ID,
        to: 'customer@example.com',
        cc: ['billing@example.com'],
        subject: 'Re: Refund request',
        html: '<p>Your refund is on its way</p>',
        threadId: THREAD_ID,
        replyToEmailId: EMAIL_ID,
      },
    });

    expect(createInboxDraft).toHaveBeenCalledWith({
      inboxId: INBOX_ID,
      to: 'customer@example.com',
      cc: ['billing@example.com'],
      bcc: undefined,
      subject: 'Re: Refund request',
      text: undefined,
      html: '<p>Your refund is on its way</p>',
      threadId: THREAD_ID,
      replyToEmailId: EMAIL_ID,
    });
    const text = textOf(result as never);
    expect(text).toContain('Draft created successfully.');
    expect(text).toContain('Nothing has been sent');
    expect(text).toContain(DRAFT_ID);
    expect(text).toContain('Type: reply');
    expect(text).toContain(`Thread ID: ${THREAD_ID}`);
    expect(text).toContain(`Reply to email ID: ${EMAIL_ID}`);
  });

  it('create-inbox-draft drafts a standalone message with no thread or reply target', async () => {
    createInboxDraft.mockResolvedValue({
      data: {
        ...REPLY_DRAFT,
        type: 'standalone',
        thread_id: null,
        reply_to_email_id: null,
      },
      error: null,
    });

    const client = await makeClient();
    const result = await client.callTool({
      name: 'create-inbox-draft',
      arguments: {
        inboxId: INBOX_ID,
        to: 'customer@example.com',
        subject: 'Following up',
      },
    });

    expect(createInboxDraft).toHaveBeenCalledWith({
      inboxId: INBOX_ID,
      to: 'customer@example.com',
      cc: undefined,
      bcc: undefined,
      subject: 'Following up',
      text: undefined,
      html: undefined,
      threadId: undefined,
      replyToEmailId: undefined,
    });
    expect(result.isError).toBeFalsy();
    expect(textOf(result as never)).toContain('Type: standalone');
  });

  it('create-inbox-draft refuses a threadId without a replyToEmailId', async () => {
    const client = await makeClient();
    const result = await client.callTool({
      name: 'create-inbox-draft',
      arguments: {
        inboxId: INBOX_ID,
        subject: 'Following up',
        threadId: THREAD_ID,
      },
    });

    expect(createInboxDraft).not.toHaveBeenCalled();
    expect(result.isError).toBe(true);
    expect(textOf(result as never)).toContain(
      'You must provide `threadId` and `replyToEmailId` together',
    );
  });

  it('create-inbox-draft refuses a replyToEmailId without a threadId', async () => {
    const client = await makeClient();
    const result = await client.callTool({
      name: 'create-inbox-draft',
      arguments: {
        inboxId: INBOX_ID,
        subject: 'Following up',
        replyToEmailId: EMAIL_ID,
      },
    });

    expect(createInboxDraft).not.toHaveBeenCalled();
    expect(result.isError).toBe(true);
    expect(textOf(result as never)).toContain(
      'You must provide `threadId` and `replyToEmailId` together',
    );
  });

  it('create-inbox-draft caps recipients across to, cc, and bcc together', async () => {
    const client = await makeClient();
    const result = await client.callTool({
      name: 'create-inbox-draft',
      arguments: {
        inboxId: INBOX_ID,
        to: addresses(20, 'to'),
        cc: addresses(20, 'cc'),
        bcc: addresses(11, 'bcc'),
      },
    });

    expect(createInboxDraft).not.toHaveBeenCalled();
    expect(result.isError).toBe(true);
    const text = textOf(result as never);
    expect(text).toContain('at most 50 recipients in total');
    expect(text).toContain('you provided 51');
  });

  it('create-inbox-draft accepts 50 recipients spread across to, cc, and bcc', async () => {
    createInboxDraft.mockResolvedValue({ data: REPLY_DRAFT, error: null });

    const client = await makeClient();
    const result = await client.callTool({
      name: 'create-inbox-draft',
      arguments: {
        inboxId: INBOX_ID,
        to: addresses(20, 'to'),
        cc: addresses(20, 'cc'),
        bcc: addresses(10, 'bcc'),
      },
    });

    expect(createInboxDraft).toHaveBeenCalledOnce();
    expect(result.isError).toBeFalsy();
  });

  it('create-inbox-draft rejects a draft with no content at all', async () => {
    const client = await makeClient();
    const result = await client.callTool({
      name: 'create-inbox-draft',
      arguments: { inboxId: INBOX_ID },
    });

    expect(createInboxDraft).not.toHaveBeenCalled();
    expect(result.isError).toBe(true);
    expect(textOf(result as never)).toContain(
      'You must provide `to`, `cc`, `bcc`, `subject`, `text`, or `html` to create a draft.',
    );
  });

  it('create-inbox-draft surfaces an API failure', async () => {
    createInboxDraft.mockResolvedValue({
      data: null,
      error: {
        name: 'validation_error',
        statusCode: 422,
        message: 'This thread can no longer be replied to',
      },
    });

    const client = await makeClient();
    const result = await client.callTool({
      name: 'create-inbox-draft',
      arguments: { inboxId: INBOX_ID, subject: 'Following up' },
    });

    expect(result.isError).toBe(true);
    const text = textOf(result as never);
    expect(text).toContain('Failed to create inbox draft');
    expect(text).toContain('This thread can no longer be replied to');
  });

  it('get-inbox-draft renders the draft with both bodies', async () => {
    getInboxDraft.mockResolvedValue({ data: REPLY_DRAFT, error: null });

    const client = await makeClient();
    const result = await client.callTool({
      name: 'get-inbox-draft',
      arguments: { inboxId: INBOX_ID, draftId: DRAFT_ID },
    });

    expect(getInboxDraft).toHaveBeenCalledWith({
      inboxId: INBOX_ID,
      draftId: DRAFT_ID,
    });
    const text = textOf(result as never);
    expect(text).toContain(DRAFT_ID);
    expect(text).toContain('Cc: billing@example.com');
    expect(text).toContain('Updated at: 2026-09-11T09:30:00.000Z');
    expect(text).toContain('Your refund is on its way');
    expect(text).toContain('<p>Your refund is on its way</p>');
    expect(text).not.toContain('Sent email ID');
  });

  it('get-inbox-draft says so when a draft has no body yet', async () => {
    getInboxDraft.mockResolvedValue({
      data: { ...REPLY_DRAFT, html: null, text: null },
      error: null,
    });

    const client = await makeClient();
    const result = await client.callTool({
      name: 'get-inbox-draft',
      arguments: { inboxId: INBOX_ID, draftId: DRAFT_ID },
    });

    expect(textOf(result as never)).toContain(
      'This draft carries no html or text body.',
    );
  });

  it('get-inbox-draft surfaces an API failure', async () => {
    getInboxDraft.mockResolvedValue({
      data: null,
      error: {
        name: 'not_found',
        statusCode: 404,
        message: 'The resource you are looking for is not available',
      },
    });

    const client = await makeClient();
    const result = await client.callTool({
      name: 'get-inbox-draft',
      arguments: { inboxId: INBOX_ID, draftId: DRAFT_ID },
    });

    expect(result.isError).toBe(true);
    expect(textOf(result as never)).toContain('Failed to get inbox draft');
  });

  it('update-inbox-draft sends the changed fields', async () => {
    updateInboxDraft.mockResolvedValue({
      data: { ...REPLY_DRAFT, subject: 'Re: Refund approved' },
      error: null,
    });

    const client = await makeClient();
    const result = await client.callTool({
      name: 'update-inbox-draft',
      arguments: {
        inboxId: INBOX_ID,
        draftId: DRAFT_ID,
        subject: 'Re: Refund approved',
        text: 'Your refund has been approved',
      },
    });

    expect(updateInboxDraft).toHaveBeenCalledWith({
      inboxId: INBOX_ID,
      draftId: DRAFT_ID,
      to: undefined,
      cc: undefined,
      bcc: undefined,
      subject: 'Re: Refund approved',
      text: 'Your refund has been approved',
      html: undefined,
    });
    const text = textOf(result as never);
    expect(text).toContain('Draft updated successfully.');
    expect(text).toContain('Subject: Re: Refund approved');
  });

  it('update-inbox-draft passes an explicit null through to clear a field', async () => {
    updateInboxDraft.mockResolvedValue({
      data: { ...REPLY_DRAFT, cc: [] },
      error: null,
    });

    const client = await makeClient();
    const result = await client.callTool({
      name: 'update-inbox-draft',
      arguments: { inboxId: INBOX_ID, draftId: DRAFT_ID, cc: null },
    });

    expect(result.isError).toBeFalsy();
    expect(updateInboxDraft).toHaveBeenCalledWith({
      inboxId: INBOX_ID,
      draftId: DRAFT_ID,
      to: undefined,
      cc: null,
      bcc: undefined,
      subject: undefined,
      text: undefined,
      html: undefined,
    });
  });

  it('update-inbox-draft requires at least one content field', async () => {
    const client = await makeClient();
    const result = await client.callTool({
      name: 'update-inbox-draft',
      arguments: { inboxId: INBOX_ID, draftId: DRAFT_ID },
    });

    expect(updateInboxDraft).not.toHaveBeenCalled();
    expect(result.isError).toBe(true);
    expect(textOf(result as never)).toContain(
      'You must provide `to`, `cc`, `bcc`, `subject`, `text`, or `html` to update a draft.',
    );
  });

  it('update-inbox-draft caps recipients across to, cc, and bcc together', async () => {
    const client = await makeClient();
    const result = await client.callTool({
      name: 'update-inbox-draft',
      arguments: {
        inboxId: INBOX_ID,
        draftId: DRAFT_ID,
        to: addresses(25, 'to'),
        cc: addresses(26, 'cc'),
      },
    });

    expect(updateInboxDraft).not.toHaveBeenCalled();
    expect(result.isError).toBe(true);
    expect(textOf(result as never)).toContain('you provided 51');
  });

  it('update-inbox-draft surfaces an API failure', async () => {
    updateInboxDraft.mockResolvedValue({
      data: null,
      error: {
        name: 'not_found',
        statusCode: 404,
        message: 'The resource you are looking for is not available',
      },
    });

    const client = await makeClient();
    const result = await client.callTool({
      name: 'update-inbox-draft',
      arguments: { inboxId: INBOX_ID, draftId: DRAFT_ID, subject: 'Hello' },
    });

    expect(result.isError).toBe(true);
    expect(textOf(result as never)).toContain('Failed to update inbox draft');
  });

  it('remove-inbox-draft passes both IDs and says no mail was sent', async () => {
    removeInboxDraft.mockResolvedValue({
      data: { object: 'inbox_draft', id: DRAFT_ID, deleted: true },
      error: null,
    });

    const client = await makeClient();
    const result = await client.callTool({
      name: 'remove-inbox-draft',
      arguments: { inboxId: INBOX_ID, draftId: DRAFT_ID },
    });

    expect(removeInboxDraft).toHaveBeenCalledWith({
      inboxId: INBOX_ID,
      draftId: DRAFT_ID,
    });
    const text = textOf(result as never);
    expect(text).toContain('never sent');
    expect(text).toContain(DRAFT_ID);
  });

  it('remove-inbox-draft surfaces an API failure', async () => {
    removeInboxDraft.mockResolvedValue({
      data: null,
      error: {
        name: 'not_found',
        statusCode: 404,
        message: 'The resource you are looking for is not available',
      },
    });

    const client = await makeClient();
    const result = await client.callTool({
      name: 'remove-inbox-draft',
      arguments: { inboxId: INBOX_ID, draftId: DRAFT_ID },
    });

    expect(result.isError).toBe(true);
    expect(textOf(result as never)).toContain('Failed to remove inbox draft');
  });

  it('send-inbox-draft renders the thread ID and the email ID of the sent message', async () => {
    sendInboxDraft.mockResolvedValue({
      data: {
        object: 'inbox_draft',
        id: DRAFT_ID,
        thread_id: THREAD_ID,
        email_id: SENT_EMAIL_ID,
      },
      error: null,
    });

    const client = await makeClient();
    const result = await client.callTool({
      name: 'send-inbox-draft',
      arguments: { inboxId: INBOX_ID, draftId: DRAFT_ID },
    });

    expect(sendInboxDraft).toHaveBeenCalledWith({
      inboxId: INBOX_ID,
      draftId: DRAFT_ID,
    });
    const text = textOf(result as never);
    expect(text).toContain('Draft sent successfully.');
    expect(text).toContain('cannot be recalled');
    expect(text).toContain(`Thread ID: ${THREAD_ID}`);
    expect(text).toContain(`Email ID: ${SENT_EMAIL_ID}`);
  });

  it('send-inbox-draft surfaces an API failure', async () => {
    sendInboxDraft.mockResolvedValue({
      data: null,
      error: {
        name: 'validation_error',
        statusCode: 422,
        message: 'This draft has no recipients',
      },
    });

    const client = await makeClient();
    const result = await client.callTool({
      name: 'send-inbox-draft',
      arguments: { inboxId: INBOX_ID, draftId: DRAFT_ID },
    });

    expect(result.isError).toBe(true);
    const text = textOf(result as never);
    expect(text).toContain('Failed to send inbox draft');
    expect(text).toContain('This draft has no recipients');
  });
});
