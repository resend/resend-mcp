/**
 * The Inboxes surface is absent from the Resend Node SDK's typed sub-resources,
 * so this client calls `/inboxes` through the SDK's generic verb methods
 * instead. Transport — base URL, auth header, the `{ data, error, headers }`
 * envelope — is entirely the SDK's
 */

import type { Resend } from 'resend';
import type {
  CreateInboxDraftOptions,
  CreateInboxDraftResponse,
  CreateInboxLabelOptions,
  CreateInboxLabelResponse,
  CreateInboxOptions,
  CreateInboxResponse,
  ForwardInboxThreadEmailOptions,
  ForwardInboxThreadEmailResponse,
  GetInboxDraftOptions,
  GetInboxDraftResponse,
  GetInboxResponse,
  GetInboxThreadEmailOptions,
  GetInboxThreadEmailResponse,
  GetInboxThreadOptions,
  GetInboxThreadResponse,
  ListInboxDraftsOptions,
  ListInboxDraftsResponse,
  ListInboxesOptions,
  ListInboxesResponse,
  ListInboxLabelsOptions,
  ListInboxLabelsResponse,
  ListInboxThreadsOptions,
  ListInboxThreadsResponse,
  RemoveInboxDraftOptions,
  RemoveInboxDraftResponse,
  RemoveInboxLabelOptions,
  RemoveInboxLabelResponse,
  RemoveInboxResponse,
  RemoveInboxThreadOptions,
  RemoveInboxThreadResponse,
  ReplyInboxThreadEmailOptions,
  ReplyInboxThreadEmailResponse,
  SendInboxDraftOptions,
  SendInboxDraftResponse,
  UpdateInboxDraftOptions,
  UpdateInboxDraftResponse,
  UpdateInboxLabelOptions,
  UpdateInboxLabelResponse,
  UpdateInboxOptions,
  UpdateInboxResponse,
  UpdateInboxThreadOptions,
  UpdateInboxThreadResponse,
} from './inboxes-types.js';

/** Drop `undefined` values the way the SDK's `!== void 0` checks do, keeping an explicit `null`. */
function withoutUndefined(
  body: Record<string, unknown>,
): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(body).filter(([, value]) => value !== undefined),
  );
}

function segment(value: string): string {
  return encodeURIComponent(value);
}

function queryString(params: Array<[string, string]>): string {
  if (params.length === 0) return '';
  const search = new URLSearchParams();
  for (const [key, value] of params) search.append(key, value);
  return `?${search.toString()}`;
}

function inboxPath(inboxId: string): string {
  return `/inboxes/${segment(inboxId)}`;
}

function threadPath(inboxId: string, threadId: string): string {
  return `${inboxPath(inboxId)}/threads/${segment(threadId)}`;
}

function threadEmailPath(
  inboxId: string,
  threadId: string,
  emailId: string,
): string {
  return `${threadPath(inboxId, threadId)}/emails/${segment(emailId)}`;
}

class InboxThreadEmailsClient {
  constructor(private readonly resend: Resend) {}

  async get({
    inboxId,
    threadId,
    emailId,
  }: GetInboxThreadEmailOptions): Promise<GetInboxThreadEmailResponse> {
    return this.resend.get(threadEmailPath(inboxId, threadId, emailId));
  }

  async reply(
    options: ReplyInboxThreadEmailOptions,
  ): Promise<ReplyInboxThreadEmailResponse> {
    const { inboxId, threadId, emailId, html, text, subject } = options;
    return this.resend.post(
      `${threadEmailPath(inboxId, threadId, emailId)}/reply`,
      withoutUndefined({ html, text, subject }),
    );
  }

  async forward(
    options: ForwardInboxThreadEmailOptions,
  ): Promise<ForwardInboxThreadEmailResponse> {
    const { inboxId, threadId, emailId, to, html, text, subject } = options;
    return this.resend.post(
      `${threadEmailPath(inboxId, threadId, emailId)}/forward`,
      withoutUndefined({ to, html, text, subject }),
    );
  }
}

class InboxThreadsClient {
  readonly emails: InboxThreadEmailsClient;

  constructor(private readonly resend: Resend) {
    this.emails = new InboxThreadEmailsClient(resend);
  }

  async list({
    inboxId,
    folder,
    query,
    from,
    label,
    cursor,
  }: ListInboxThreadsOptions): Promise<ListInboxThreadsResponse> {
    const params: Array<[string, string]> = [];
    if (folder !== undefined) params.push(['folder', folder]);
    if (query !== undefined) params.push(['query', query]);
    if (from !== undefined) params.push(['from', from]);
    // The API reads `label` as a repeated param, so an array becomes several.
    if (label !== undefined) {
      for (const value of Array.isArray(label) ? label : [label]) {
        params.push(['label', value]);
      }
    }
    if (cursor !== undefined) params.push(['cursor', cursor]);

    return this.resend.get(
      `${inboxPath(inboxId)}/threads${queryString(params)}`,
    );
  }

  async get({
    inboxId,
    threadId,
  }: GetInboxThreadOptions): Promise<GetInboxThreadResponse> {
    return this.resend.get(threadPath(inboxId, threadId));
  }

  async update(
    options: UpdateInboxThreadOptions,
  ): Promise<UpdateInboxThreadResponse> {
    const { inboxId, threadId, read, folder, labelId } = options;
    return this.resend.patch(
      threadPath(inboxId, threadId),
      withoutUndefined({ read, folder, label_id: labelId }),
    );
  }

  async remove({
    inboxId,
    threadId,
  }: RemoveInboxThreadOptions): Promise<RemoveInboxThreadResponse> {
    return this.resend.delete(threadPath(inboxId, threadId));
  }
}

class InboxLabelsClient {
  constructor(private readonly resend: Resend) {}

  async list({
    inboxId,
  }: ListInboxLabelsOptions): Promise<ListInboxLabelsResponse> {
    return this.resend.get(`${inboxPath(inboxId)}/labels`);
  }

  async create({
    inboxId,
    name,
    color,
  }: CreateInboxLabelOptions): Promise<CreateInboxLabelResponse> {
    return this.resend.post(
      `${inboxPath(inboxId)}/labels`,
      withoutUndefined({ name, color }),
    );
  }

  async update({
    inboxId,
    labelId,
    name,
    color,
  }: UpdateInboxLabelOptions): Promise<UpdateInboxLabelResponse> {
    return this.resend.patch(
      `${inboxPath(inboxId)}/labels/${segment(labelId)}`,
      withoutUndefined({ name, color }),
    );
  }

  async remove({
    inboxId,
    labelId,
  }: RemoveInboxLabelOptions): Promise<RemoveInboxLabelResponse> {
    return this.resend.delete(
      `${inboxPath(inboxId)}/labels/${segment(labelId)}`,
    );
  }
}

class InboxDraftsClient {
  constructor(private readonly resend: Resend) {}

  async list({
    inboxId,
    cursor,
  }: ListInboxDraftsOptions): Promise<ListInboxDraftsResponse> {
    const params: Array<[string, string]> =
      cursor !== undefined ? [['cursor', cursor]] : [];
    return this.resend.get(
      `${inboxPath(inboxId)}/drafts${queryString(params)}`,
    );
  }

  async create(
    options: CreateInboxDraftOptions,
  ): Promise<CreateInboxDraftResponse> {
    const {
      inboxId,
      to,
      cc,
      bcc,
      subject,
      text,
      html,
      threadId,
      replyToEmailId,
    } = options;
    return this.resend.post(
      `${inboxPath(inboxId)}/drafts`,
      withoutUndefined({
        to,
        cc,
        bcc,
        subject,
        text,
        html,
        thread_id: threadId,
        reply_to_email_id: replyToEmailId,
      }),
    );
  }

  async get({
    inboxId,
    draftId,
  }: GetInboxDraftOptions): Promise<GetInboxDraftResponse> {
    return this.resend.get(`${inboxPath(inboxId)}/drafts/${segment(draftId)}`);
  }

  async update(
    options: UpdateInboxDraftOptions,
  ): Promise<UpdateInboxDraftResponse> {
    const { inboxId, draftId, to, cc, bcc, subject, text, html } = options;
    return this.resend.patch(
      `${inboxPath(inboxId)}/drafts/${segment(draftId)}`,
      withoutUndefined({ to, cc, bcc, subject, text, html }),
    );
  }

  async remove({
    inboxId,
    draftId,
  }: RemoveInboxDraftOptions): Promise<RemoveInboxDraftResponse> {
    return this.resend.delete(
      `${inboxPath(inboxId)}/drafts/${segment(draftId)}`,
    );
  }

  async send({
    inboxId,
    draftId,
  }: SendInboxDraftOptions): Promise<SendInboxDraftResponse> {
    return this.resend.post(
      `${inboxPath(inboxId)}/drafts/${segment(draftId)}/send`,
      {},
    );
  }
}

export class InboxesClient {
  readonly threads: InboxThreadsClient;
  readonly labels: InboxLabelsClient;
  readonly drafts: InboxDraftsClient;

  constructor(private readonly resend: Resend) {
    this.threads = new InboxThreadsClient(resend);
    this.labels = new InboxLabelsClient(resend);
    this.drafts = new InboxDraftsClient(resend);
  }

  async create(options: CreateInboxOptions): Promise<CreateInboxResponse> {
    const { emailAddress, name, forwarding, friendlyName } = options;
    return this.resend.post(
      '/inboxes',
      withoutUndefined({
        email_address: emailAddress,
        name,
        forwarding,
        friendly_name: friendlyName,
      }),
    );
  }

  async list(options?: ListInboxesOptions): Promise<ListInboxesResponse> {
    const params: Array<[string, string]> = [];
    if (options?.limit !== undefined) {
      params.push(['limit', options.limit.toString()]);
    }
    if (options?.after !== undefined) params.push(['after', options.after]);
    if (options?.before !== undefined) params.push(['before', options.before]);

    return this.resend.get(`/inboxes${queryString(params)}`);
  }

  async get(inboxId: string): Promise<GetInboxResponse> {
    return this.resend.get(inboxPath(inboxId));
  }

  async update(
    inboxId: string,
    payload: UpdateInboxOptions,
  ): Promise<UpdateInboxResponse> {
    const { name, friendlyName } = payload;
    return this.resend.patch(
      inboxPath(inboxId),
      withoutUndefined({ name, friendly_name: friendlyName }),
    );
  }

  async remove(inboxId: string): Promise<RemoveInboxResponse> {
    return this.resend.delete(inboxPath(inboxId));
  }
}
