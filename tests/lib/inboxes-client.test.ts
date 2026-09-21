import { Resend } from 'resend';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { InboxesClient } from '../../src/lib/inboxes-client.js';

// The SDK reads `RESEND_BASE_URL` in its constructor, so clear it before
// `new Resend(...)` runs to assert the default base URL.
beforeEach(() => {
  vi.stubEnv('RESEND_BASE_URL', undefined);
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

function stubOkFetch() {
  const fetchMock = vi.fn(async () => jsonResponse({ id: 'inbox_1' }));
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

function client() {
  return new InboxesClient(new Resend('re_test'));
}

function requestFrom(fetchMock: ReturnType<typeof stubOkFetch>) {
  const [url, init] = fetchMock.mock.calls[0] as unknown as [
    string,
    RequestInit,
  ];
  return {
    url,
    init,
    body: init.body === undefined ? undefined : JSON.parse(init.body as string),
  };
}

describe('InboxesClient request mapping', () => {
  it('sends camelCase options as snake_case body fields', async () => {
    const fetchMock = stubOkFetch();

    await client().create({
      emailAddress: 'support@example.com',
      name: 'Support',
      forwarding: true,
      friendlyName: 'Support Team',
    });

    const { url, init, body } = requestFrom(fetchMock);
    expect(url).toBe('https://api.resend.com/inboxes');
    expect(init.method).toBe('POST');
    expect(body).toEqual({
      email_address: 'support@example.com',
      name: 'Support',
      forwarding: true,
      friendly_name: 'Support Team',
    });
  });

  it('omits undefined fields but keeps an explicit null, which is how a draft field gets cleared', async () => {
    const fetchMock = stubOkFetch();

    await client().drafts.update({
      inboxId: 'inbox_1',
      draftId: 'draft_1',
      subject: null,
      text: 'kept',
    });

    const { init, body } = requestFrom(fetchMock);
    expect(init.method).toBe('PATCH');
    expect(body).toEqual({
      subject: null,
      text: 'kept',
    });
  });

  it('repeats the label query param and carries the other thread filters', async () => {
    const fetchMock = stubOkFetch();

    await client().threads.list({
      inboxId: 'inbox_1',
      folder: 'archive',
      from: 'customer@example.com',
      label: ['label_1', 'label_2'],
      cursor: 'cursor_1',
    });

    const { url } = requestFrom(fetchMock);
    const { pathname, searchParams } = new URL(url);
    expect(pathname).toBe('/inboxes/inbox_1/threads');
    expect(searchParams.getAll('label')).toEqual(['label_1', 'label_2']);
    expect(searchParams.get('folder')).toBe('archive');
    expect(searchParams.get('from')).toBe('customer@example.com');
    expect(searchParams.get('cursor')).toBe('cursor_1');
    expect(searchParams.has('query')).toBe(false);

    // A lone string stays one param — mapping over it would spread characters.
    const single = stubOkFetch();
    await client().threads.list({
      inboxId: 'inbox_1',
      label: 'label_1',
    });
    expect(
      new URL(requestFrom(single).url).searchParams.getAll('label'),
    ).toEqual(['label_1']);
  });

  it('builds the pagination query, and omits it entirely when unset', async () => {
    const paginated = stubOkFetch();
    await client().list({ limit: 10, after: 'inbox_9' });
    const { searchParams } = new URL(requestFrom(paginated).url);
    expect(searchParams.get('limit')).toBe('10');
    expect(searchParams.get('after')).toBe('inbox_9');
    expect(searchParams.has('before')).toBe(false);

    const unpaginated = stubOkFetch();
    await client().list();
    expect(requestFrom(unpaginated).url).toBe('https://api.resend.com/inboxes');
  });

  it('interpolates nested path ids, encoded', async () => {
    const fetchMock = stubOkFetch();

    await client().threads.emails.reply({
      inboxId: 'inbox_1',
      threadId: 'thread_1',
      emailId: 'email/1',
      text: 'On it.',
    });

    const { url, init, body } = requestFrom(fetchMock);
    expect(url).toBe(
      'https://api.resend.com/inboxes/inbox_1/threads/thread_1/emails/email%2F1/reply',
    );
    expect(init.method).toBe('POST');
    expect(body).toEqual({ text: 'On it.' });
  });

  it('sends a DELETE with no body', async () => {
    const fetchMock = stubOkFetch();

    await client().remove('inbox_1');

    const { url, init } = requestFrom(fetchMock);
    expect(url).toBe('https://api.resend.com/inboxes/inbox_1');
    expect(init.method).toBe('DELETE');
    expect(init.body).toBeUndefined();
  });
});
