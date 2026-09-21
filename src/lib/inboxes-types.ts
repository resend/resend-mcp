import type { Response as ResendResponse } from 'resend';

/** Values copied from `packages/inboxes/src/types/threads.ts`, the source of truth. */
export const INBOX_MESSAGE_FOLDERS = [
  'inbox',
  'archive',
  'spam',
  'sent',
  'trash',
] as const;

export type InboxMessageFolder = (typeof INBOX_MESSAGE_FOLDERS)[number];

/** Values copied from `packages/inboxes/src/types/threads.ts`, the source of truth. */
export const MOVE_THREAD_FOLDERS = [
  'inbox',
  'archive',
  'spam',
  'trash',
] as const;

export type MoveThreadFolder = (typeof MOVE_THREAD_FOLDERS)[number];

/** Values copied from `packages/inboxes/src/types/labels.ts`, the source of truth. */
export const INBOX_LABEL_COLORS = [
  'cyan',
  'teal',
  'grass',
  'lime',
  'yellow',
  'orange',
  'iris',
  'plum',
  'crimson',
  'bronze',
  'mauve',
] as const;

export type InboxLabelColor = (typeof INBOX_LABEL_COLORS)[number];

export const MAX_INBOX_LABEL_NAME_LENGTH = 64;

type RequireAtLeastOne<T> = {
  [K in keyof T]-?: Required<Pick<T, K>> &
    Partial<Pick<T, Exclude<keyof T, K>>>;
}[keyof T];

// --- Inbox -----------------------------------------------------------------

export interface Inbox {
  id: string;
  name: string | null;
  email_address: string;
  friendly_name: string | null;
  unread: number;
  last_received: string | null;
}

export interface CreateInboxOptions {
  emailAddress: string;
  name?: string;
  forwarding?: boolean;
  friendlyName?: string;
}

export interface CreateInboxResponseSuccess {
  object: 'inbox';
  id: string;
  name: string;
  email_address: string;
  domain_id: string;
  forwarding_address: string | null;
  friendly_name: string | null;
  unread: number;
  created_at: string;
}

export type CreateInboxResponse = ResendResponse<CreateInboxResponseSuccess>;

export interface ListInboxesOptions {
  limit?: number;
  after?: string;
  before?: string;
}

export interface ListInboxesResponseSuccess {
  object: 'list';
  has_more: boolean;
  data: Inbox[];
}

export type ListInboxesResponse = ResendResponse<ListInboxesResponseSuccess>;

export interface GetInboxResponseSuccess {
  object: 'inbox';
  id: string;
  name: string | null;
  email_address: string;
  forwarding_address: string | null;
  friendly_name: string | null;
  unread: number;
  drafts: number;
  last_received: string | null;
}

export type GetInboxResponse = ResendResponse<GetInboxResponseSuccess>;

export type UpdateInboxOptions = RequireAtLeastOne<{
  name?: string;
  friendlyName?: string;
}>;

export interface UpdateInboxResponseSuccess {
  object: 'inbox';
  id: string;
}

export type UpdateInboxResponse = ResendResponse<UpdateInboxResponseSuccess>;

export interface RemoveInboxResponseSuccess {
  object: 'inbox';
  id: string;
  deleted: boolean;
}

export type RemoveInboxResponse = ResendResponse<RemoveInboxResponseSuccess>;

// --- Threads ---------------------------------------------------------------

export interface InboxThreadLabel {
  id: string;
  name: string;
  color: InboxLabelColor;
}

export interface InboxThread {
  id: string;
  subject: string | null;
  from: string | null;
  to: string[];
  cc: string[];
  bcc: string[];
  labels: InboxThreadLabel[];
  message_count: number;
  has_attachment: boolean;
  has_draft: boolean;
  read: boolean;
  received_at: string;
}

export interface InboxThreadSummary {
  object: 'inbox_thread';
  id: string;
  subject: string | null;
  folder: InboxMessageFolder;
  labels: InboxThreadLabel[];
  read: boolean;
}

export interface InboxMessageAttachment {
  id: string;
  filename: string | null;
  size: number | null;
}

export interface InboxMessage {
  id: string;
  direction: 'inbound' | 'outbound';
  from: string;
  to: string[];
  cc: string[];
  bcc: string[];
  reply_to: string[];
  subject: string | null;
  message_id: string | null;
  html: string | null;
  text: string | null;
  attachments: InboxMessageAttachment[];
  read: boolean;
  received_at: string;
}

export interface ListInboxThreadsOptions {
  inboxId: string;
  folder?: InboxMessageFolder;
  query?: string;
  from?: string;
  label?: string | string[];
  cursor?: string;
}

export interface ListInboxThreadsResponseSuccess {
  object: 'list';
  has_more: boolean;
  next_cursor: string | null;
  data: InboxThread[];
}

export type ListInboxThreadsResponse =
  ResendResponse<ListInboxThreadsResponseSuccess>;

export interface GetInboxThreadOptions {
  inboxId: string;
  threadId: string;
}

export interface GetInboxThreadResponseSuccess extends InboxThreadSummary {
  messages: {
    has_more: boolean;
    data: InboxMessage[];
  };
}

export type GetInboxThreadResponse =
  ResendResponse<GetInboxThreadResponseSuccess>;

export type UpdateInboxThreadOptions = {
  inboxId: string;
  threadId: string;
} & RequireAtLeastOne<{
  read?: boolean;
  folder?: MoveThreadFolder;
  labelId?: string;
}>;

export interface UpdateInboxThreadResponseSuccess {
  object: 'inbox_thread';
  id: string;
  subject: string | null;
  folder: InboxMessageFolder;
  labels: InboxThreadLabel[];
  read: boolean;
}

export type UpdateInboxThreadResponse =
  ResendResponse<UpdateInboxThreadResponseSuccess>;

export interface RemoveInboxThreadOptions {
  inboxId: string;
  threadId: string;
}

export interface RemoveInboxThreadResponseSuccess {
  object: 'inbox_thread';
  id: string;
  deleted: boolean;
}

export type RemoveInboxThreadResponse =
  ResendResponse<RemoveInboxThreadResponseSuccess>;

// --- Thread emails ---------------------------------------------------------

export interface GetInboxThreadEmailOptions {
  inboxId: string;
  threadId: string;
  emailId: string;
}

export type GetInboxThreadEmailResponseSuccess = InboxMessage;

export type GetInboxThreadEmailResponse =
  ResendResponse<GetInboxThreadEmailResponseSuccess>;

export type ReplyInboxThreadEmailOptions = {
  inboxId: string;
  threadId: string;
  emailId: string;
} & RequireAtLeastOne<{
  html?: string;
  text?: string;
}> & {
    subject?: string;
  };

export type ReplyInboxThreadEmailResponseSuccess = InboxMessage & {
  email_id: string;
};

export type ReplyInboxThreadEmailResponse =
  ResendResponse<ReplyInboxThreadEmailResponseSuccess>;

export interface ForwardInboxThreadEmailOptions {
  inboxId: string;
  threadId: string;
  emailId: string;
  to: string | string[];
  html?: string;
  text?: string;
  subject?: string;
}

export type ForwardInboxThreadEmailResponseSuccess = InboxMessage & {
  email_id: string;
};

export type ForwardInboxThreadEmailResponse =
  ResendResponse<ForwardInboxThreadEmailResponseSuccess>;

// --- Labels ----------------------------------------------------------------

export interface InboxLabel {
  id: string;
  name: string;
  color: InboxLabelColor;
  created_at: string;
}

export interface ListInboxLabelsOptions {
  inboxId: string;
}

export interface ListInboxLabelsResponseSuccess {
  object: 'list';
  has_more: boolean;
  data: InboxLabel[];
}

export type ListInboxLabelsResponse =
  ResendResponse<ListInboxLabelsResponseSuccess>;

export interface CreateInboxLabelOptions {
  inboxId: string;
  name: string;
  color?: InboxLabelColor;
}

export interface CreateInboxLabelResponseSuccess {
  object: 'inbox_label';
  id: string;
  name: string;
  color: InboxLabelColor;
  created_at: string;
}

export type CreateInboxLabelResponse =
  ResendResponse<CreateInboxLabelResponseSuccess>;

export interface UpdateInboxLabelOptions {
  inboxId: string;
  labelId: string;
  name?: string;
  color?: InboxLabelColor;
}

export interface UpdateInboxLabelResponseSuccess {
  object: 'inbox_label';
  id: string;
}

export type UpdateInboxLabelResponse =
  ResendResponse<UpdateInboxLabelResponseSuccess>;

export interface RemoveInboxLabelOptions {
  inboxId: string;
  labelId: string;
}

export interface RemoveInboxLabelResponseSuccess {
  object: 'inbox_label';
  id: string;
  deleted: boolean;
}

export type RemoveInboxLabelResponse =
  ResendResponse<RemoveInboxLabelResponseSuccess>;

// --- Drafts ----------------------------------------------------------------

export type InboxDraftType = 'standalone' | 'reply';

export interface InboxDraft {
  object: 'inbox_draft';
  id: string;
  type: InboxDraftType;
  to: string[] | null;
  cc: string[];
  bcc: string[];
  subject: string | null;
  html: string | null;
  text: string | null;
  thread_id: string | null;
  reply_to_email_id: string | null;
  email_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface InboxDraftListItem {
  id: string;
  type: InboxDraftType;
  to: string[] | null;
  cc: string[];
  bcc: string[];
  subject: string | null;
  snippet: string | null;
  thread_id: string | null;
  reply_to_email_id: string | null;
  updated_at: string;
}

export interface ListInboxDraftsOptions {
  inboxId: string;
  cursor?: string;
}

export interface ListInboxDraftsResponseSuccess {
  object: 'list';
  has_more: boolean;
  next_cursor: string | null;
  data: InboxDraftListItem[];
}

export type ListInboxDraftsResponse =
  ResendResponse<ListInboxDraftsResponseSuccess>;

type CreateInboxDraftContent = RequireAtLeastOne<{
  to?: string | string[];
  cc?: string | string[];
  bcc?: string | string[];
  subject?: string | null;
  text?: string | null;
  html?: string | null;
}>;

export type CreateInboxDraftOptions = {
  inboxId: string;
} & CreateInboxDraftContent &
  (
    | {
        threadId: string;
        replyToEmailId: string;
      }
    | {
        threadId?: never;
        replyToEmailId?: never;
      }
  );

export type CreateInboxDraftResponseSuccess = InboxDraft;

export type CreateInboxDraftResponse =
  ResendResponse<CreateInboxDraftResponseSuccess>;

export interface GetInboxDraftOptions {
  inboxId: string;
  draftId: string;
}

export type GetInboxDraftResponseSuccess = InboxDraft;

export type GetInboxDraftResponse =
  ResendResponse<GetInboxDraftResponseSuccess>;

export type UpdateInboxDraftOptions = {
  inboxId: string;
  draftId: string;
} & RequireAtLeastOne<{
  to?: string | string[] | null;
  cc?: string | string[] | null;
  bcc?: string | string[] | null;
  subject?: string | null;
  text?: string | null;
  html?: string | null;
}>;

export type UpdateInboxDraftResponseSuccess = InboxDraft;

export type UpdateInboxDraftResponse =
  ResendResponse<UpdateInboxDraftResponseSuccess>;

export interface RemoveInboxDraftOptions {
  inboxId: string;
  draftId: string;
}

export interface RemoveInboxDraftResponseSuccess {
  object: 'inbox_draft';
  id: string;
  deleted: boolean;
}

export type RemoveInboxDraftResponse =
  ResendResponse<RemoveInboxDraftResponseSuccess>;

export interface SendInboxDraftOptions {
  inboxId: string;
  draftId: string;
}

export interface SendInboxDraftResponseSuccess {
  object: 'inbox_draft';
  id: string;
  thread_id: string;
  email_id: string;
}

export type SendInboxDraftResponse =
  ResendResponse<SendInboxDraftResponseSuccess>;
