import type { McpServer } from '@modelcontextprotocol/server';
import { z } from 'zod';
import { email } from '../lib/email-schema.js';
import type { InboxesClient } from '../lib/inboxes-client.js';
import {
  type CreateInboxDraftOptions,
  INBOX_LABEL_COLORS,
  INBOX_MESSAGE_FOLDERS,
  type InboxDraft,
  type InboxLabel,
  type InboxMessage,
  type InboxThreadLabel,
  MAX_INBOX_LABEL_NAME_LENGTH,
  MOVE_THREAD_FOLDERS,
  type ReplyInboxThreadEmailResponse,
  type UpdateInboxDraftOptions,
  type UpdateInboxResponse,
  type UpdateInboxThreadResponse,
} from '../lib/inboxes-types.js';
import { throwIfResendFailed } from '../lib/resend-error.js';

const CREATE_INBOX_TOOL = {
  annotations: {
    readOnlyHint: false,
    openWorldHint: false,
    destructiveHint: false,
  },
  title: 'Create Inbox',
  description:
    'Create an inbox in Resend. An inbox receives email at an address on one of your domains and groups what arrives into threads. The domain must already be verified for receiving — or set forwarding to true, and Resend returns a forwarding address you point your existing mail provider at instead.',
  inputSchema: z.object({
    emailAddress: email.describe(
      'Email address the inbox receives at (e.g. "support@example.com"). The domain must already exist in Resend.',
    ),
    name: z
      .string()
      .nonempty()
      .optional()
      .describe(
        'Internal name for the inbox, shown in the Resend dashboard. Max 64 characters.',
      ),
    forwarding: z
      .boolean()
      .optional()
      .describe(
        'Receive mail by forwarding instead of by MX record. Resend returns a forwarding address to point your existing mail provider at. Use this when the domain sends through Resend but still receives mail elsewhere. Default: false',
      ),
    friendlyName: z
      .string()
      .nonempty()
      .optional()
      .describe(
        'Display name shown on mail this inbox sends or replies to (the name in "Name <address>"). Max 78 characters.',
      ),
  }),
} as const;

const LIST_INBOXES_TOOL = {
  annotations: {
    readOnlyHint: true,
    openWorldHint: false,
    destructiveHint: false,
  },
  title: 'List Inboxes',
  description: `**Purpose:** List the Resend inboxes on the account. Use to discover inbox IDs, or to see which addresses receive mail and how much of it is unread.

**NOT for:** Reading the mail inside an inbox, or listing emails received at the account's Resend receiving address (use list-received-emails). Not for listing sent emails (use list-emails).

**Returns:** For each inbox: id, name, email_address, friendly_name, unread (count of unread threads), last_received.

**When to use:** User asks "what inboxes do I have?", or you need an inbox ID for any other inbox tool.`,
  inputSchema: z.object({
    limit: z
      .number()
      .int()
      .min(1)
      .max(100)
      .optional()
      .describe('Number of inboxes to retrieve. Default: 20, Max: 100, Min: 1'),
    after: z
      .string()
      .nonempty()
      .optional()
      .describe(
        'Inbox ID after which to retrieve more (for forward pagination). Cannot be used with "before".',
      ),
    before: z
      .string()
      .nonempty()
      .optional()
      .describe(
        'Inbox ID before which to retrieve more (for backward pagination). Cannot be used with "after".',
      ),
  }),
} as const;

const GET_INBOX_TOOL = {
  annotations: {
    readOnlyHint: true,
    openWorldHint: false,
    destructiveHint: false,
  },
  title: 'Get Inbox',
  description:
    'Get an inbox by ID from Resend, including its forwarding address, how many threads are unread, how many drafts it holds, and when it last received mail. Use list-inboxes to find the ID.',
  inputSchema: z.object({
    inboxId: z.string().nonempty().describe('Inbox ID'),
  }),
} as const;

const UPDATE_INBOX_TOOL = {
  annotations: {
    readOnlyHint: false,
    openWorldHint: false,
    destructiveHint: false,
  },
  title: 'Update Inbox',
  description:
    "Update an inbox in Resend. Renames the inbox internally, changes the display name shown on the mail it sends, or both — at least one of the two is required. An inbox's email address cannot be changed.",
  inputSchema: z.object({
    inboxId: z.string().nonempty().describe('Inbox ID'),
    name: z
      .string()
      .nonempty()
      .optional()
      .describe(
        'New internal name for the inbox, shown in the Resend dashboard. Max 64 characters.',
      ),
    friendlyName: z
      .string()
      .nonempty()
      .optional()
      .describe(
        'New display name shown on mail this inbox sends or replies to (the name in "Name <address>"). Max 78 characters.',
      ),
  }),
} as const;

const REMOVE_INBOX_TOOL = {
  annotations: {
    readOnlyHint: false,
    openWorldHint: false,
    destructiveHint: true,
  },
  title: 'Remove Inbox',
  description:
    "Remove an inbox by ID from Resend. This also deletes all of the inbox's threads. Before using this tool, you MUST double-check with the user that they want to remove this inbox. Reference the EMAIL ADDRESS of the inbox when double-checking, and warn the user that removing an inbox is irreversible and takes every thread in it with it. You may only use this tool if the user explicitly confirms they want to remove the inbox after you double-check.",
  inputSchema: z.object({
    inboxId: z.string().nonempty().describe('Inbox ID'),
  }),
} as const;

const LIST_INBOX_THREADS_TOOL = {
  annotations: {
    readOnlyHint: true,
    openWorldHint: false,
    destructiveHint: false,
  },
  title: 'List Inbox Threads',
  description: `**Purpose:** List the threads in one Resend inbox — the conversations that arrived at its address. Filter by folder, sender, or label, or search them as free text.

**NOT for:** Reading the messages inside a thread (use get-inbox-thread). Not for emails received at the account's Resend receiving address (use list-received-emails), and not for sent emails (use list-emails).

**Returns:** For each thread: id, subject, from, to, labels, message_count, has_attachment, has_draft, read, received_at.

**When to use:** User asks what is in an inbox, what is unread, or wants to find a conversation before opening it. Get the inbox ID from list-inboxes, then the thread ID from here to open a thread. This endpoint is cursor-paginated: when more threads exist, pass the next_cursor it returns back as "cursor".`,
  inputSchema: z.object({
    inboxId: z.string().nonempty().describe('Inbox ID'),
    folder: z
      .enum(INBOX_MESSAGE_FOLDERS)
      .optional()
      .describe('Only return threads in this folder.'),
    query: z
      .string()
      .nonempty()
      .optional()
      .describe('Free-text search over the threads in this inbox.'),
    from: z
      .string()
      .nonempty()
      .optional()
      .describe(
        'Only return threads from this sender address (e.g. "customer@example.com").',
      ),
    label: z
      .union([z.string().nonempty(), z.string().nonempty().array().min(1)])
      .optional()
      .describe(
        'Only return threads carrying this label. Pass one label ID, or an array of label IDs to filter by several. Use list-inbox-labels to find label IDs.',
      ),
    cursor: z
      .string()
      .nonempty()
      .optional()
      .describe(
        "Opaque cursor taken from a previous page's next_cursor. Omit for the first page.",
      ),
  }),
} as const;

const GET_INBOX_THREAD_TOOL = {
  annotations: {
    readOnlyHint: true,
    openWorldHint: false,
    destructiveHint: false,
  },
  title: 'Get Inbox Thread',
  description: `**Purpose:** Get one thread in a Resend inbox: the thread itself plus the metadata of every message in it.

**NOT for:** Reading a message's body. This tool returns no html or text — a whole conversation's bodies would flood the response. Use get-inbox-thread-email for one message's body.

**Returns:** The thread's id, subject, folder, labels and read state, then for each message its email ID, direction (inbound or outbound), from, to, subject, received_at, read state, and how many attachments it carries.

**When to use:** User wants to see a conversation, or you need a message's email ID. A message's ID IS the email ID that get-inbox-thread-email, reply-to-inbox-thread-email, and forward-inbox-thread-email take as their "emailId". Get the thread ID from list-inbox-threads.`,
  inputSchema: z.object({
    inboxId: z.string().nonempty().describe('Inbox ID'),
    threadId: z.string().nonempty().describe('Thread ID'),
  }),
} as const;

const UPDATE_INBOX_THREAD_TOOL = {
  annotations: {
    readOnlyHint: false,
    openWorldHint: false,
    destructiveHint: false,
  },
  title: 'Update Inbox Thread',
  description: `**Purpose:** Update one thread in a Resend inbox: mark it read or unread, move it to another folder, or apply a label. At least one of read, folder, or labelId is required.

**NOT for:** Creating or deleting labels themselves (use create-inbox-label and remove-inbox-label), or deleting the thread (use remove-inbox-thread).

**Returns:** The thread's id, subject, folder, labels and read state after the update.

**When to use:** User asks to archive a thread, mark it read or unread, move it to spam or trash, or tag it with a label. Moving a thread to trash keeps it — it is the reversible alternative to remove-inbox-thread. Get the thread ID from list-inbox-threads and the label ID from list-inbox-labels.`,
  inputSchema: z.object({
    inboxId: z.string().nonempty().describe('Inbox ID'),
    threadId: z.string().nonempty().describe('Thread ID'),
    read: z
      .boolean()
      .optional()
      .describe('Mark the thread as read (true) or unread (false).'),
    folder: z
      .enum(MOVE_THREAD_FOLDERS)
      .optional()
      .describe(
        'Folder to move the thread to. Note that "sent" is not a valid destination — a thread can only be moved to inbox, archive, spam, or trash.',
      ),
    labelId: z
      .string()
      .nonempty()
      .optional()
      .describe(
        'ID of the label to apply to this thread. Use list-inbox-labels to find label IDs.',
      ),
  }),
} as const;

const REMOVE_INBOX_THREAD_TOOL = {
  annotations: {
    readOnlyHint: false,
    openWorldHint: false,
    destructiveHint: true,
  },
  title: 'Remove Inbox Thread',
  description:
    'Remove a thread by ID from a Resend inbox. This moves the whole thread, every message in it included, to the trash folder; the messages can be restored with update-inbox-thread while they remain within the trash retention period. Before using this tool, you MUST double-check with the user that they want to remove this thread. Reference the SUBJECT of the thread when double-checking, and tell the user it takes every message in the thread to the trash with it. You may only use this tool if the user explicitly confirms they want to remove the thread after you double-check. To get a thread out of the way without trashing it, use update-inbox-thread with folder "archive" instead.',
  inputSchema: z.object({
    inboxId: z.string().nonempty().describe('Inbox ID'),
    threadId: z.string().nonempty().describe('Thread ID'),
  }),
} as const;

const GET_INBOX_THREAD_EMAIL_TOOL = {
  annotations: {
    readOnlyHint: true,
    openWorldHint: false,
    destructiveHint: false,
  },
  title: 'Get Inbox Thread Email',
  description: `**Purpose:** Read one message in a Resend inbox thread, body included — its html and text, its full headers, and the attachments it carries.

**NOT for:** Reading a whole conversation at once (use get-inbox-thread, which lists a thread's messages without their bodies). Not for emails sent with send-email (use get-email), and not for mail at the account's Resend receiving address (use get-received-email).

**Returns:** The message's email ID, direction (inbound or outbound), from, to, cc, bcc, reply_to, subject, message_id, read state, received_at, one line per attachment (filename, size and attachment ID), and the html and text bodies it has.

**When to use:** get-inbox-thread points here for a body. Take the "Email ID" it printed for the message the user wants and pass it as emailId. Attachment contents cannot be downloaded through this server — attachments are listed, not fetched.`,
  inputSchema: z.object({
    inboxId: z.string().nonempty().describe('Inbox ID'),
    threadId: z.string().nonempty().describe('Thread ID'),
    emailId: z
      .string()
      .nonempty()
      .describe(
        'ID of the message to read. This is the "id" get-inbox-thread returns for each message in the thread.',
      ),
  }),
} as const;

const REPLY_TO_INBOX_THREAD_EMAIL_TOOL = {
  annotations: {
    readOnlyHint: false,
    openWorldHint: true,
    destructiveHint: true,
  },
  title: 'Reply to Inbox Thread Email',
  description: `**Purpose:** Reply to one message in a Resend inbox thread. This sends a real email the moment you call it, from the inbox's address to the people already on the thread. At least one of html or text is required.

**NOT for:** Writing to someone who is not on the thread (use forward-inbox-thread-email to pass the message along, or send-email for an unrelated message).

**Returns:** The reply's email ID — its place in the thread — and its sent email ID, the outgoing email itself.

**When to use:** User asks to reply to, answer, or follow up on a message in an inbox thread, and has given you the wording. Before using this tool, you MUST double-check with the user that they want to send this reply. Reference the WORDING you are about to send and the SUBJECT of the thread you are answering when double-checking, and warn the user that a reply cannot be undone — a sent email cannot be recalled. You may only use this tool if the user explicitly confirms they want to send the reply after you double-check. You do not choose the recipients: Resend replies to the thread's existing participants, so the wording is the part the user needs to approve. Omit subject to inherit the thread's. Get the emailId from get-inbox-thread.`,
  inputSchema: z.object({
    inboxId: z.string().nonempty().describe('Inbox ID'),
    threadId: z.string().nonempty().describe('Thread ID'),
    emailId: z
      .string()
      .nonempty()
      .describe(
        'ID of the message being replied to. This is the "id" get-inbox-thread returns for each message in the thread.',
      ),
    html: z
      .string()
      .nonempty()
      .optional()
      .describe(
        'HTML body of the reply. Provide html, text, or both — one of the two is required.',
      ),
    text: z
      .string()
      .nonempty()
      .optional()
      .describe(
        'Plain text body of the reply. Provide html, text, or both — one of the two is required.',
      ),
    subject: z
      .string()
      .nonempty()
      .optional()
      .describe(
        "Subject for the reply. Omit to inherit the thread's subject, which is usually what you want.",
      ),
  }),
} as const;

const FORWARD_INBOX_THREAD_EMAIL_TOOL = {
  annotations: {
    readOnlyHint: false,
    openWorldHint: true,
    destructiveHint: true,
  },
  title: 'Forward Inbox Thread Email',
  description: `**Purpose:** Forward one message from a Resend inbox thread to someone else. This sends a real email the moment you call it, from the inbox's address to the recipients named in "to".

**NOT for:** Answering the sender (use reply-to-inbox-thread-email, which goes to the thread's existing participants). Not for composing an unrelated email (use send-email).

**Returns:** The forward's email ID — its place in the thread — and its sent email ID, the outgoing email itself, plus who it went to.

**When to use:** User asks to forward a message in an inbox thread, pass it along, or loop someone in on it. Before using this tool, you MUST double-check with the user that they want to forward this message. Reference the RECIPIENTS and the SUBJECT when double-checking, and warn the user that forwarding cannot be undone — a sent email cannot be recalled, and everyone in "to" keeps the original message. You may only use this tool if the user explicitly confirms they want to forward the message after you double-check. "to" is the only body field required: html and text are an optional note of your own, because the original message is carried either way. Get the emailId from get-inbox-thread.`,
  inputSchema: z.object({
    inboxId: z.string().nonempty().describe('Inbox ID'),
    threadId: z.string().nonempty().describe('Thread ID'),
    emailId: z
      .string()
      .nonempty()
      .describe(
        'ID of the message being forwarded. This is the "id" get-inbox-thread returns for each message in the thread.',
      ),
    to: z
      .union([email, email.array().min(1)])
      .describe(
        'Recipient email address to forward to (e.g. "teammate@example.com"), or an array of recipient email addresses to forward to several.',
      ),
    html: z
      .string()
      .nonempty()
      .optional()
      .describe(
        'Optional HTML note to add above the forwarded message. This does not replace the original body — the message being forwarded is carried along either way.',
      ),
    text: z
      .string()
      .nonempty()
      .optional()
      .describe(
        'Optional plain text note to add above the forwarded message. This does not replace the original body — the message being forwarded is carried along either way.',
      ),
    subject: z
      .string()
      .nonempty()
      .optional()
      .describe(
        "Subject for the forwarded email. Omit to keep the original message's subject.",
      ),
  }),
} as const;

const LIST_INBOX_LABELS_TOOL = {
  annotations: {
    readOnlyHint: true,
    openWorldHint: false,
    destructiveHint: false,
  },
  title: 'List Inbox Labels',
  description: `**Purpose:** List the labels in one Resend inbox — the tags its threads can carry — each with its ID.

**NOT for:** Putting a label on a thread (use update-inbox-thread) or finding the threads carrying one (use list-inbox-threads and its "label" filter). Both of those take a label ID from here.

**Returns:** For each label: id, name, color, created_at.

**When to use:** User asks what labels an inbox has, or you need a label ID for a label you have not seen on a thread yet. The thread tools print each label's ID alongside its name, so reuse those when you already have them. Get the inbox ID from list-inboxes.`,
  inputSchema: z.object({
    inboxId: z.string().nonempty().describe('Inbox ID'),
  }),
} as const;

const CREATE_INBOX_LABEL_TOOL = {
  annotations: {
    readOnlyHint: false,
    openWorldHint: false,
    destructiveHint: false,
  },
  title: 'Create Inbox Label',
  description:
    'Create a label in a Resend inbox. A label is a tag the threads in that inbox can carry. Creating one does not put it on anything — pass the ID this returns to update-inbox-thread to apply it to a thread. Resend picks a color when you omit one.',
  inputSchema: z.object({
    inboxId: z.string().nonempty().describe('Inbox ID'),
    name: z
      .string()
      .trim()
      .nonempty()
      .max(MAX_INBOX_LABEL_NAME_LENGTH)
      .describe(
        `Name of the label, shown on every thread that carries it. Max ${MAX_INBOX_LABEL_NAME_LENGTH} characters.`,
      ),
    color: z
      .enum(INBOX_LABEL_COLORS)
      .optional()
      .describe('Color for the label. Omit to let Resend pick one.'),
  }),
} as const;

const UPDATE_INBOX_LABEL_TOOL = {
  annotations: {
    readOnlyHint: false,
    openWorldHint: false,
    destructiveHint: false,
  },
  title: 'Update Inbox Label',
  description:
    'Update a label in a Resend inbox: rename it, recolor it, or both. The change follows the label everywhere it is already in use, so every thread carrying it shows the new name and color. Get the label ID from list-inbox-labels.',
  inputSchema: z.object({
    inboxId: z.string().nonempty().describe('Inbox ID'),
    labelId: z
      .string()
      .nonempty()
      .describe('Label ID. Use list-inbox-labels to find label IDs.'),
    name: z
      .string()
      .trim()
      .nonempty()
      .max(MAX_INBOX_LABEL_NAME_LENGTH)
      .optional()
      .describe(
        `New name for the label. Leave it out to keep the current name. Max ${MAX_INBOX_LABEL_NAME_LENGTH} characters.`,
      ),
    color: z
      .enum(INBOX_LABEL_COLORS)
      .optional()
      .describe(
        'New color for the label. Leave it out to keep the current color.',
      ),
  }),
} as const;

const REMOVE_INBOX_LABEL_TOOL = {
  annotations: {
    readOnlyHint: false,
    openWorldHint: false,
    destructiveHint: true,
  },
  title: 'Remove Inbox Label',
  description:
    'Remove a label by ID from a Resend inbox. This takes the label off every thread that carries it, but the threads themselves are left alone and no mail is deleted. Before using this tool, you MUST double-check with the user that they want to remove this label. Reference the NAME of the label when double-checking, and warn the user that removing a label is irreversible and strips it from every thread it is on. You may only use this tool if the user explicitly confirms they want to remove the label after you double-check. Get the label ID from list-inbox-labels.',
  inputSchema: z.object({
    inboxId: z.string().nonempty().describe('Inbox ID'),
    labelId: z
      .string()
      .nonempty()
      .describe('Label ID. Use list-inbox-labels to find label IDs.'),
  }),
} as const;

const LIST_INBOX_DRAFTS_TOOL = {
  annotations: {
    readOnlyHint: true,
    openWorldHint: false,
    destructiveHint: false,
  },
  title: 'List Inbox Drafts',
  description: `**Purpose:** List the drafts in one Resend inbox — the messages composed there but not sent — each with its ID.

**NOT for:** Reading a draft's body (use get-inbox-draft) or sending one (use send-inbox-draft). Not for the messages already in a thread (use get-inbox-thread), and not for sent emails (use list-emails).

**Returns:** For each draft: id, type ("standalone" or "reply"), to, cc, bcc, subject, snippet, thread_id, reply_to_email_id, updated_at.

**When to use:** User asks what drafts an inbox holds, or you need a draft ID. A "reply" draft answers a message in a thread and carries that thread_id; a "standalone" draft is a new message belonging to no thread. Get the inbox ID from list-inboxes, then the draft ID from here for get-inbox-draft, update-inbox-draft, send-inbox-draft, or remove-inbox-draft. This endpoint is cursor-paginated: when more drafts exist, pass the next_cursor it returns back as "cursor".`,
  inputSchema: z.object({
    inboxId: z.string().nonempty().describe('Inbox ID'),
    cursor: z
      .string()
      .nonempty()
      .optional()
      .describe(
        "Opaque cursor taken from a previous page's next_cursor. Omit for the first page.",
      ),
  }),
} as const;

const CREATE_INBOX_DRAFT_TOOL = {
  annotations: {
    readOnlyHint: false,
    openWorldHint: false,
    destructiveHint: false,
  },
  title: 'Create Inbox Draft',
  description: `**Purpose:** Create a draft in a Resend inbox — a message saved for later, NOT sent. At least one of to, cc, bcc, subject, text, or html is required. Nothing leaves the account until send-inbox-draft is called on it.

**NOT for:** Sending mail. To send straight away, use reply-to-inbox-thread-email to answer a thread, forward-inbox-thread-email to pass a message along, or send-email for an unrelated message.

**Returns:** The draft's id, type, recipients, subject, the thread and message it replies to if any, and its timestamps.

**When to use:** User asks to draft, compose, or prepare a message without sending it, or wants to read the wording back before it goes out. Pass threadId and replyToEmailId together to draft a reply to a message in a thread; omit both to draft a standalone message. The id this returns is the "draftId" that get-inbox-draft, update-inbox-draft, send-inbox-draft, and remove-inbox-draft all take.`,
  inputSchema: z.object({
    inboxId: z.string().nonempty().describe('Inbox ID'),
    to: z
      .union([email, email.array().min(1)])
      .optional()
      .describe(
        'Recipient email address (e.g. "customer@example.com"), or an array of addresses to reach several. Across to, cc, and bcc a draft can carry at most 50 recipients in total.',
      ),
    cc: z
      .union([email, email.array().min(1)])
      .optional()
      .describe(
        'Email address to copy, or an array of addresses. Across to, cc, and bcc a draft can carry at most 50 recipients in total.',
      ),
    bcc: z
      .union([email, email.array().min(1)])
      .optional()
      .describe(
        'Email address to blind-copy, or an array of addresses. Across to, cc, and bcc a draft can carry at most 50 recipients in total.',
      ),
    subject: z.string().nonempty().optional().describe('Subject of the draft.'),
    text: z
      .string()
      .nonempty()
      .optional()
      .describe('Plain text body of the draft.'),
    html: z.string().nonempty().optional().describe('HTML body of the draft.'),
    threadId: z
      .string()
      .nonempty()
      .optional()
      .describe(
        'ID of the thread this draft replies to. Must be provided together with replyToEmailId. Omit both to draft a standalone message. Get the thread ID from list-inbox-threads.',
      ),
    replyToEmailId: z
      .string()
      .nonempty()
      .optional()
      .describe(
        'ID of the message in that thread this draft replies to — the "Email ID" get-inbox-thread prints for it. Must be provided together with threadId.',
      ),
  }),
} as const;

const GET_INBOX_DRAFT_TOOL = {
  annotations: {
    readOnlyHint: true,
    openWorldHint: false,
    destructiveHint: false,
  },
  title: 'Get Inbox Draft',
  description:
    'Get a draft by ID from a Resend inbox, body included — its recipients, subject, html and text, and the thread and message it replies to if it is a reply. A draft is one message being composed, so its body is returned here, unlike get-inbox-thread, which lists a whole conversation without the bodies. Use this to read a draft back before send-inbox-draft puts it in the mail. Get the draft ID from list-inbox-drafts.',
  inputSchema: z.object({
    inboxId: z.string().nonempty().describe('Inbox ID'),
    draftId: z
      .string()
      .nonempty()
      .describe('Draft ID. Use list-inbox-drafts to find draft IDs.'),
  }),
} as const;

const UPDATE_INBOX_DRAFT_TOOL = {
  annotations: {
    readOnlyHint: false,
    openWorldHint: false,
    destructiveHint: false,
  },
  title: 'Update Inbox Draft',
  description: `**Purpose:** Update a draft in a Resend inbox: change its recipients, its subject, or its body. At least one of to, cc, bcc, subject, text, or html is required. This still sends nothing — the draft only goes out when send-inbox-draft is called.

**NOT for:** Changing which thread or message a draft replies to. Those are fixed when the draft is created. Not for editing a message already sent — sent mail cannot be changed.

**Returns:** The draft's id, type, recipients, subject, the thread and message it replies to if any, and its timestamps after the update.

**When to use:** User asks to change, rewrite, or fix a draft before it is sent. Omitting a field leaves it as it was; passing null for a field clears it, which is the only way to empty one. Get the draft ID from list-inbox-drafts.`,
  inputSchema: z.object({
    inboxId: z.string().nonempty().describe('Inbox ID'),
    draftId: z
      .string()
      .nonempty()
      .describe('Draft ID. Use list-inbox-drafts to find draft IDs.'),
    to: z
      .union([email, email.array().min(1)])
      .nullable()
      .optional()
      .describe(
        "New recipient email address, or an array of addresses, replacing the draft's current ones. Pass null to clear the recipients; omit to leave them untouched. Across to, cc, and bcc a draft can carry at most 50 recipients in total.",
      ),
    cc: z
      .union([email, email.array().min(1)])
      .nullable()
      .optional()
      .describe(
        "New email address to copy, or an array of addresses, replacing the draft's current ones. Pass null to clear the cc list; omit to leave it untouched. Across to, cc, and bcc a draft can carry at most 50 recipients in total.",
      ),
    bcc: z
      .union([email, email.array().min(1)])
      .nullable()
      .optional()
      .describe(
        "New email address to blind-copy, or an array of addresses, replacing the draft's current ones. Pass null to clear the bcc list; omit to leave it untouched. Across to, cc, and bcc a draft can carry at most 50 recipients in total.",
      ),
    subject: z
      .string()
      .nonempty()
      .nullable()
      .optional()
      .describe(
        'New subject for the draft. Pass null to clear the subject; omit to leave it untouched.',
      ),
    text: z
      .string()
      .nonempty()
      .nullable()
      .optional()
      .describe(
        'New plain text body for the draft. Pass null to clear the plain text body; omit to leave it untouched.',
      ),
    html: z
      .string()
      .nonempty()
      .nullable()
      .optional()
      .describe(
        'New HTML body for the draft. Pass null to clear the HTML body; omit to leave it untouched.',
      ),
  }),
} as const;

const REMOVE_INBOX_DRAFT_TOOL = {
  annotations: {
    readOnlyHint: false,
    openWorldHint: false,
    destructiveHint: true,
  },
  title: 'Remove Inbox Draft',
  description:
    'Remove a draft by ID from a Resend inbox. The draft was never sent, so no mail and no thread is touched — but everything written in it is thrown away. Before using this tool, you MUST double-check with the user that they want to remove this draft. Reference the SUBJECT of the draft when double-checking, and warn the user that removing a draft is irreversible and discards whatever was composed in it. You may only use this tool if the user explicitly confirms they want to remove the draft after you double-check. Get the draft ID from list-inbox-drafts.',
  inputSchema: z.object({
    inboxId: z.string().nonempty().describe('Inbox ID'),
    draftId: z
      .string()
      .nonempty()
      .describe('Draft ID. Use list-inbox-drafts to find draft IDs.'),
  }),
} as const;

const SEND_INBOX_DRAFT_TOOL = {
  annotations: {
    readOnlyHint: false,
    openWorldHint: true,
    destructiveHint: true,
  },
  title: 'Send Inbox Draft',
  description:
    "Send a draft from a Resend inbox. This puts a real email in the mail the moment you call it, from the inbox's address to the recipients the draft already carries, and a sent email CANNOT be recalled or unsent. Before using this tool, you MUST double-check with the user that they want to send this draft. Reference the SUBJECT and the RECIPIENTS of the draft when double-checking, and warn the user that sending cannot be undone. You may only use this tool if the user explicitly confirms they want to send the draft after you double-check. Call get-inbox-draft first if you need to read back exactly what will go out, and update-inbox-draft to change it before sending. Get the draft ID from list-inbox-drafts.",
  inputSchema: z.object({
    inboxId: z.string().nonempty().describe('Inbox ID'),
    draftId: z
      .string()
      .nonempty()
      .describe('Draft ID. Use list-inbox-drafts to find draft IDs.'),
  }),
} as const;

function inboxMessageHeaderLines(
  message: Pick<
    InboxMessage,
    'id' | 'direction' | 'from' | 'to' | 'cc' | 'bcc'
  >,
) {
  return [
    `Email ID: ${message.id}`,
    `Direction: ${message.direction}`,
    `From: ${message.from}`,
    message.to.length > 0 && `To: ${message.to.join(', ')}`,
    message.cc.length > 0 && `Cc: ${message.cc.join(', ')}`,
    message.bcc.length > 0 && `Bcc: ${message.bcc.join(', ')}`,
  ];
}

function inboxBodyContent(
  message: Pick<InboxMessage, 'html' | 'text'>,
  noBodyText: string,
) {
  const bodies = [
    message.text != null && `--- Plain text body ---\n${message.text}`,
    message.html != null && `--- HTML body ---\n${message.html}`,
  ].filter((body): body is string => body !== false);

  if (bodies.length === 0) {
    return [{ type: 'text' as const, text: noBodyText }];
  }

  return bodies.map((body) => ({ type: 'text' as const, text: body }));
}

function inboxLabelText(label: InboxLabel) {
  return [
    `Name: ${label.name}`,
    `ID: ${label.id}`,
    `Color: ${label.color}`,
    `Created at: ${label.created_at}`,
  ].join('\n');
}

/**
 * The ids have to travel with the names: the `label` filter of
 * list-inbox-threads and the `labelId` of update-inbox-thread both take an id,
 * and the API returns an empty page rather than an error for a label filter
 * that isn't one.
 */
function inboxThreadLabelsLine(labels: InboxThreadLabel[]) {
  return `Labels: ${labels.map(({ id, name }) => `${name} (ID: ${id})`).join(', ')}`;
}

const MAX_INBOX_DRAFT_RECIPIENTS = 50;

/**
 * The API caps recipients across `to`, `cc` and `bcc` together rather than per
 * field, so the three have to be counted as one list.
 */
function throwIfTooManyInboxDraftRecipients(
  ...recipientFields: Array<string | string[] | null | undefined>
) {
  let total = 0;
  for (const field of recipientFields) {
    if (field == null) continue;
    total += Array.isArray(field) ? field.length : 1;
  }

  if (total > MAX_INBOX_DRAFT_RECIPIENTS) {
    throw new Error(
      `A draft can carry at most ${MAX_INBOX_DRAFT_RECIPIENTS} recipients in total across \`to\`, \`cc\`, and \`bcc\` — you provided ${total}.`,
    );
  }
}

/**
 * The API counts a draft field as provided whenever its key is present, so an
 * explicit `null` — which clears that field — satisfies its at-least-one rule.
 */
function isAnyInboxDraftContentProvided(
  ...contentFields: Array<string | string[] | null | undefined>
) {
  return contentFields.some((field) => field !== undefined);
}

function inboxDraftSummaryLines(
  draft: Pick<
    InboxDraft,
    | 'id'
    | 'type'
    | 'to'
    | 'cc'
    | 'bcc'
    | 'subject'
    | 'thread_id'
    | 'reply_to_email_id'
  >,
) {
  return [
    `Subject: ${draft.subject ?? '(no subject)'}`,
    `ID: ${draft.id}`,
    `Type: ${draft.type}`,
    draft.to != null && draft.to.length > 0 && `To: ${draft.to.join(', ')}`,
    draft.cc.length > 0 && `Cc: ${draft.cc.join(', ')}`,
    draft.bcc.length > 0 && `Bcc: ${draft.bcc.join(', ')}`,
    draft.thread_id != null && `Thread ID: ${draft.thread_id}`,
    draft.reply_to_email_id != null &&
      `Reply to email ID: ${draft.reply_to_email_id}`,
  ];
}

function inboxDraftText(draft: InboxDraft) {
  return [
    ...inboxDraftSummaryLines(draft),
    draft.email_id != null && `Sent email ID: ${draft.email_id}`,
    `Created at: ${draft.created_at}`,
    `Updated at: ${draft.updated_at}`,
  ]
    .filter(Boolean)
    .join('\n');
}

const SENT_MESSAGE_IDS_EXPLANATION =
  'The email ID identifies this message inside the thread — pass it to get-inbox-thread-email to read it back. The sent email ID identifies the outgoing email itself — pass it to get-email to follow its delivery.';

export function addInboxTools(server: McpServer, inboxes: InboxesClient) {
  server.registerTool(
    'create-inbox',
    CREATE_INBOX_TOOL,
    async ({ emailAddress, name, forwarding, friendlyName }) => {
      const response = await inboxes.create({
        emailAddress,
        name,
        forwarding,
        friendlyName,
      });

      throwIfResendFailed(response, 'Failed to create inbox');

      const created = response.data;
      return {
        content: [
          { type: 'text', text: 'Inbox created successfully.' },
          {
            type: 'text',
            text: [
              `Email address: ${created.email_address}`,
              `ID: ${created.id}`,
              `Name: ${created.name}`,
              created.friendly_name != null &&
                `Friendly name: ${created.friendly_name}`,
              created.forwarding_address != null &&
                `Forwarding address: ${created.forwarding_address}`,
              `Domain ID: ${created.domain_id}`,
              `Created at: ${created.created_at}`,
            ]
              .filter(Boolean)
              .join('\n'),
          },
          ...(created.forwarding_address != null
            ? [
                {
                  type: 'text' as const,
                  text: 'IMPORTANT: Make sure to tell the user the forwarding address — no mail reaches this inbox until they forward to it from their existing mail provider.',
                },
              ]
            : []),
        ],
      };
    },
  );

  server.registerTool(
    'list-inboxes',
    LIST_INBOXES_TOOL,
    async ({ limit, after, before }) => {
      if (after && before) {
        throw new Error(
          'Cannot use both "after" and "before" parameters. Use only one for pagination.',
        );
      }

      const paginationOptions = after
        ? { limit, after }
        : before
          ? { limit, before }
          : limit !== undefined
            ? { limit }
            : undefined;

      const response = await inboxes.list(paginationOptions);

      throwIfResendFailed(response, 'Failed to list inboxes');

      const inboxList = response.data.data;
      if (inboxList.length === 0) {
        return {
          content: [{ type: 'text', text: 'No inboxes found.' }],
        };
      }

      return {
        content: [
          {
            type: 'text',
            text: `Found ${inboxList.length} inbox${inboxList.length === 1 ? '' : 'es'}:`,
          },
          ...inboxList.map(
            ({
              id,
              name,
              email_address,
              friendly_name,
              unread,
              last_received,
            }) => ({
              type: 'text' as const,
              text: [
                `Email address: ${email_address}`,
                `ID: ${id}`,
                name != null && `Name: ${name}`,
                friendly_name != null && `Friendly name: ${friendly_name}`,
                `Unread: ${unread}`,
                `Last received: ${last_received ?? 'never'}`,
              ]
                .filter(Boolean)
                .join('\n'),
            }),
          ),
          ...(response.data.has_more
            ? [
                {
                  type: 'text' as const,
                  text: before
                    ? 'There are more inboxes available. Use the "before" parameter with the first ID to continue paginating backward.'
                    : 'There are more inboxes available. Use the "after" parameter with the last ID to retrieve more.',
                },
              ]
            : []),
        ],
      };
    },
  );

  server.registerTool('get-inbox', GET_INBOX_TOOL, async ({ inboxId }) => {
    const response = await inboxes.get(inboxId);

    throwIfResendFailed(response, 'Failed to get inbox');

    const inbox = response.data;
    return {
      content: [
        {
          type: 'text',
          text: [
            `Email address: ${inbox.email_address}`,
            `ID: ${inbox.id}`,
            inbox.name != null && `Name: ${inbox.name}`,
            inbox.friendly_name != null &&
              `Friendly name: ${inbox.friendly_name}`,
            inbox.forwarding_address != null &&
              `Forwarding address: ${inbox.forwarding_address}`,
            `Unread: ${inbox.unread}`,
            `Drafts: ${inbox.drafts}`,
            `Last received: ${inbox.last_received ?? 'never'}`,
          ]
            .filter(Boolean)
            .join('\n'),
        },
      ],
    };
  });

  server.registerTool(
    'update-inbox',
    UPDATE_INBOX_TOOL,
    async ({ inboxId, name, friendlyName }) => {
      let response: UpdateInboxResponse;
      if (name !== undefined) {
        response = await inboxes.update(inboxId, { name, friendlyName });
      } else if (friendlyName !== undefined) {
        response = await inboxes.update(inboxId, { friendlyName });
      } else {
        throw new Error(
          'You must provide `name` or `friendlyName` to update an inbox.',
        );
      }

      throwIfResendFailed(response, 'Failed to update inbox');

      return {
        content: [
          { type: 'text', text: 'Inbox updated successfully.' },
          { type: 'text', text: `ID: ${response.data.id}` },
        ],
      };
    },
  );

  server.registerTool(
    'remove-inbox',
    REMOVE_INBOX_TOOL,
    async ({ inboxId }) => {
      const response = await inboxes.remove(inboxId);

      throwIfResendFailed(response, 'Failed to remove inbox');

      return {
        content: [
          {
            type: 'text',
            text: 'Inbox removed successfully, along with all of its threads.',
          },
          { type: 'text', text: `ID: ${response.data.id}` },
        ],
      };
    },
  );

  server.registerTool(
    'list-inbox-threads',
    LIST_INBOX_THREADS_TOOL,
    async ({ inboxId, folder, query, from, label, cursor }) => {
      const response = await inboxes.threads.list({
        inboxId,
        folder,
        query,
        from,
        label,
        cursor,
      });

      throwIfResendFailed(response, 'Failed to list inbox threads');

      const threads = response.data.data;
      if (threads.length === 0) {
        return {
          content: [{ type: 'text', text: 'No threads found.' }],
        };
      }

      const { has_more, next_cursor } = response.data;
      return {
        content: [
          {
            type: 'text',
            text: `Found ${threads.length} thread${threads.length === 1 ? '' : 's'}:`,
          },
          ...threads.map((thread) => ({
            type: 'text' as const,
            text: [
              `Subject: ${thread.subject ?? '(no subject)'}`,
              `ID: ${thread.id}`,
              `From: ${thread.from ?? 'unknown'}`,
              thread.to.length > 0 && `To: ${thread.to.join(', ')}`,
              thread.labels.length > 0 && inboxThreadLabelsLine(thread.labels),
              `Messages: ${thread.message_count}`,
              `Read: ${thread.read ? 'yes' : 'no'}`,
              thread.has_attachment && 'Has attachment: yes',
              thread.has_draft && 'Has draft: yes',
              `Received at: ${thread.received_at}`,
            ]
              .filter(Boolean)
              .join('\n'),
          })),
          ...(has_more && next_cursor != null
            ? [
                {
                  type: 'text' as const,
                  text: `There are more threads available. Pass cursor=${next_cursor} to retrieve the next page.`,
                },
              ]
            : []),
        ],
      };
    },
  );

  server.registerTool(
    'get-inbox-thread',
    GET_INBOX_THREAD_TOOL,
    async ({ inboxId, threadId }) => {
      const response = await inboxes.threads.get({ inboxId, threadId });

      throwIfResendFailed(response, 'Failed to get inbox thread');

      const thread = response.data;
      const messages = thread.messages.data;
      return {
        content: [
          {
            type: 'text',
            text: [
              `Subject: ${thread.subject ?? '(no subject)'}`,
              `ID: ${thread.id}`,
              `Folder: ${thread.folder}`,
              thread.labels.length > 0 && inboxThreadLabelsLine(thread.labels),
              `Read: ${thread.read ? 'yes' : 'no'}`,
              `Messages shown: ${messages.length}`,
            ]
              .filter(Boolean)
              .join('\n'),
          },
          ...messages.map((message) => ({
            type: 'text' as const,
            text: [
              ...inboxMessageHeaderLines(message),
              `Subject: ${message.subject ?? '(no subject)'}`,
              `Read: ${message.read ? 'yes' : 'no'}`,
              message.attachments.length > 0 &&
                `Attachments: ${message.attachments.length}`,
              `Received at: ${message.received_at}`,
            ]
              .filter(Boolean)
              .join('\n'),
          })),
          {
            type: 'text',
            text: 'Message bodies are not included above. To read one message, call get-inbox-thread-email with this inbox ID, this thread ID, and that message\'s "Email ID" as emailId — the same ID that reply-to-inbox-thread-email and forward-inbox-thread-email take.',
          },
          ...(thread.messages.has_more
            ? [
                {
                  type: 'text' as const,
                  text: 'This thread holds more messages than the ones listed above.',
                },
              ]
            : []),
        ],
      };
    },
  );

  server.registerTool(
    'update-inbox-thread',
    UPDATE_INBOX_THREAD_TOOL,
    async ({ inboxId, threadId, read, folder, labelId }) => {
      let response: UpdateInboxThreadResponse;
      if (read !== undefined) {
        response = await inboxes.threads.update({
          inboxId,
          threadId,
          read,
          folder,
          labelId,
        });
      } else if (folder !== undefined) {
        response = await inboxes.threads.update({
          inboxId,
          threadId,
          folder,
          labelId,
        });
      } else if (labelId !== undefined) {
        response = await inboxes.threads.update({
          inboxId,
          threadId,
          labelId,
        });
      } else {
        throw new Error(
          'You must provide `read`, `folder`, or `labelId` to update a thread.',
        );
      }

      throwIfResendFailed(response, 'Failed to update inbox thread');

      const thread = response.data;
      return {
        content: [
          { type: 'text', text: 'Thread updated successfully.' },
          {
            type: 'text',
            text: [
              `Subject: ${thread.subject ?? '(no subject)'}`,
              `ID: ${thread.id}`,
              `Folder: ${thread.folder}`,
              thread.labels.length > 0 && inboxThreadLabelsLine(thread.labels),
              `Read: ${thread.read ? 'yes' : 'no'}`,
            ]
              .filter(Boolean)
              .join('\n'),
          },
        ],
      };
    },
  );

  server.registerTool(
    'remove-inbox-thread',
    REMOVE_INBOX_THREAD_TOOL,
    async ({ inboxId, threadId }) => {
      const response = await inboxes.threads.remove({
        inboxId,
        threadId,
      });

      throwIfResendFailed(response, 'Failed to remove inbox thread');

      return {
        content: [
          {
            type: 'text',
            text: 'Thread moved to the trash successfully, along with every message in it. Nothing was erased — call update-inbox-thread to put it back.',
          },
          { type: 'text', text: `ID: ${response.data.id}` },
        ],
      };
    },
  );

  server.registerTool(
    'get-inbox-thread-email',
    GET_INBOX_THREAD_EMAIL_TOOL,
    async ({ inboxId, threadId, emailId }) => {
      const response = await inboxes.threads.emails.get({
        inboxId,
        threadId,
        emailId,
      });

      throwIfResendFailed(response, 'Failed to get inbox thread email');

      const message = response.data;
      return {
        content: [
          {
            type: 'text',
            text: [
              ...inboxMessageHeaderLines(message),
              `Subject: ${message.subject ?? '(no subject)'}`,
              message.reply_to.length > 0 &&
                `Reply to: ${message.reply_to.join(', ')}`,
              message.message_id != null && `Message ID: ${message.message_id}`,
              `Read: ${message.read ? 'yes' : 'no'}`,
              `Received at: ${message.received_at}`,
            ]
              .filter(Boolean)
              .join('\n'),
          },
          {
            type: 'text',
            text:
              message.attachments.length === 0
                ? 'Attachments: none'
                : [
                    `Attachments (${message.attachments.length}):`,
                    ...message.attachments.map(
                      ({ id, filename, size }) =>
                        `- ${filename ?? '(no filename)'} (${size != null ? `${size} bytes` : 'size unknown'}) — ID: ${id}`,
                    ),
                  ].join('\n'),
          },
          ...inboxBodyContent(
            message,
            'This message carries no html or text body.',
          ),
        ],
      };
    },
  );

  server.registerTool(
    'reply-to-inbox-thread-email',
    REPLY_TO_INBOX_THREAD_EMAIL_TOOL,
    async ({ inboxId, threadId, emailId, html, text, subject }) => {
      let response: ReplyInboxThreadEmailResponse;
      if (html !== undefined) {
        response = await inboxes.threads.emails.reply({
          inboxId,
          threadId,
          emailId,
          html,
          text,
          subject,
        });
      } else if (text !== undefined) {
        response = await inboxes.threads.emails.reply({
          inboxId,
          threadId,
          emailId,
          text,
          subject,
        });
      } else {
        throw new Error(
          'You must provide `html` or `text` to reply to a message.',
        );
      }

      throwIfResendFailed(response, 'Failed to reply to inbox thread email');

      const reply = response.data;
      return {
        content: [
          { type: 'text', text: 'Reply sent successfully.' },
          {
            type: 'text',
            text: [
              `Email ID: ${reply.id}`,
              `Sent email ID: ${reply.email_id}`,
              `Subject: ${reply.subject ?? '(no subject)'}`,
              reply.to.length > 0 && `To: ${reply.to.join(', ')}`,
              reply.attachments.length > 0 &&
                `Attachments: ${reply.attachments.length}`,
              `Received at: ${reply.received_at}`,
            ]
              .filter(Boolean)
              .join('\n'),
          },
          { type: 'text', text: SENT_MESSAGE_IDS_EXPLANATION },
        ],
      };
    },
  );

  server.registerTool(
    'forward-inbox-thread-email',
    FORWARD_INBOX_THREAD_EMAIL_TOOL,
    async ({ inboxId, threadId, emailId, to, html, text, subject }) => {
      const response = await inboxes.threads.emails.forward({
        inboxId,
        threadId,
        emailId,
        to,
        html,
        text,
        subject,
      });

      throwIfResendFailed(response, 'Failed to forward inbox thread email');

      const forwarded = response.data;
      return {
        content: [
          { type: 'text', text: 'Forward sent successfully.' },
          {
            type: 'text',
            text: [
              ...inboxMessageHeaderLines(forwarded),
              `Sent email ID: ${forwarded.email_id}`,
              forwarded.attachments.length > 0 &&
                `Attachments: ${forwarded.attachments.length}`,
              `Received at: ${forwarded.received_at}`,
            ]
              .filter(Boolean)
              .join('\n'),
          },
          { type: 'text', text: SENT_MESSAGE_IDS_EXPLANATION },
        ],
      };
    },
  );

  server.registerTool(
    'list-inbox-labels',
    LIST_INBOX_LABELS_TOOL,
    async ({ inboxId }) => {
      const response = await inboxes.labels.list({ inboxId });

      throwIfResendFailed(response, 'Failed to list inbox labels');

      const labels = response.data.data;
      if (labels.length === 0) {
        return {
          content: [{ type: 'text', text: 'No labels found.' }],
        };
      }

      return {
        content: [
          {
            type: 'text',
            text: `Found ${labels.length} label${labels.length === 1 ? '' : 's'}:`,
          },
          ...labels.map((label) => ({
            type: 'text' as const,
            text: inboxLabelText(label),
          })),
          ...(response.data.has_more
            ? [
                {
                  type: 'text' as const,
                  text: 'This inbox holds more labels than the ones listed above.',
                },
              ]
            : []),
        ],
      };
    },
  );

  server.registerTool(
    'create-inbox-label',
    CREATE_INBOX_LABEL_TOOL,
    async ({ inboxId, name, color }) => {
      const response = await inboxes.labels.create({
        inboxId,
        name,
        color,
      });

      throwIfResendFailed(response, 'Failed to create inbox label');

      return {
        content: [
          { type: 'text', text: 'Label created successfully.' },
          { type: 'text', text: inboxLabelText(response.data) },
        ],
      };
    },
  );

  server.registerTool(
    'update-inbox-label',
    UPDATE_INBOX_LABEL_TOOL,
    async ({ inboxId, labelId, name, color }) => {
      const response = await inboxes.labels.update({
        inboxId,
        labelId,
        name,
        color,
      });

      throwIfResendFailed(response, 'Failed to update inbox label');

      return {
        content: [
          { type: 'text', text: 'Label updated successfully.' },
          { type: 'text', text: `ID: ${response.data.id}` },
        ],
      };
    },
  );

  server.registerTool(
    'remove-inbox-label',
    REMOVE_INBOX_LABEL_TOOL,
    async ({ inboxId, labelId }) => {
      const response = await inboxes.labels.remove({ inboxId, labelId });

      throwIfResendFailed(response, 'Failed to remove inbox label');

      return {
        content: [
          {
            type: 'text',
            text: 'Label removed successfully, and taken off every thread that carried it. No threads were deleted.',
          },
          { type: 'text', text: `ID: ${response.data.id}` },
        ],
      };
    },
  );

  server.registerTool(
    'list-inbox-drafts',
    LIST_INBOX_DRAFTS_TOOL,
    async ({ inboxId, cursor }) => {
      const response = await inboxes.drafts.list({ inboxId, cursor });

      throwIfResendFailed(response, 'Failed to list inbox drafts');

      const drafts = response.data.data;
      if (drafts.length === 0) {
        return {
          content: [{ type: 'text', text: 'No drafts found.' }],
        };
      }

      const { has_more, next_cursor } = response.data;
      return {
        content: [
          {
            type: 'text',
            text: `Found ${drafts.length} draft${drafts.length === 1 ? '' : 's'}:`,
          },
          ...drafts.map((draft) => ({
            type: 'text' as const,
            text: [
              ...inboxDraftSummaryLines(draft),
              draft.snippet != null && `Snippet: ${draft.snippet}`,
              `Updated at: ${draft.updated_at}`,
            ]
              .filter(Boolean)
              .join('\n'),
          })),
          ...(has_more && next_cursor != null
            ? [
                {
                  type: 'text' as const,
                  text: `There are more drafts available. Pass cursor=${next_cursor} to retrieve the next page.`,
                },
              ]
            : []),
        ],
      };
    },
  );

  server.registerTool(
    'create-inbox-draft',
    CREATE_INBOX_DRAFT_TOOL,
    async ({
      inboxId,
      to,
      cc,
      bcc,
      subject,
      text,
      html,
      threadId,
      replyToEmailId,
    }) => {
      const isReplyDraft =
        threadId !== undefined && replyToEmailId !== undefined;
      const isStandaloneDraft =
        threadId === undefined && replyToEmailId === undefined;
      if (!isReplyDraft && !isStandaloneDraft) {
        throw new Error(
          'You must provide `threadId` and `replyToEmailId` together to draft a reply, or neither to draft a standalone message.',
        );
      }

      if (!isAnyInboxDraftContentProvided(to, cc, bcc, subject, text, html)) {
        throw new Error(
          'You must provide `to`, `cc`, `bcc`, `subject`, `text`, or `html` to create a draft.',
        );
      }

      throwIfTooManyInboxDraftRecipients(to, cc, bcc);

      const response = await inboxes.drafts.create({
        inboxId,
        to,
        cc,
        bcc,
        subject,
        text,
        html,
        threadId,
        replyToEmailId,
      } as CreateInboxDraftOptions);

      throwIfResendFailed(response, 'Failed to create inbox draft');

      return {
        content: [
          {
            type: 'text',
            text: 'Draft created successfully. Nothing has been sent — call send-inbox-draft with the ID below once the user confirms it should go out.',
          },
          { type: 'text', text: inboxDraftText(response.data) },
        ],
      };
    },
  );

  server.registerTool(
    'get-inbox-draft',
    GET_INBOX_DRAFT_TOOL,
    async ({ inboxId, draftId }) => {
      const response = await inboxes.drafts.get({ inboxId, draftId });

      throwIfResendFailed(response, 'Failed to get inbox draft');

      const draft = response.data;
      return {
        content: [
          { type: 'text', text: inboxDraftText(draft) },
          ...inboxBodyContent(
            draft,
            'This draft carries no html or text body.',
          ),
        ],
      };
    },
  );

  server.registerTool(
    'update-inbox-draft',
    UPDATE_INBOX_DRAFT_TOOL,
    async ({ inboxId, draftId, to, cc, bcc, subject, text, html }) => {
      if (!isAnyInboxDraftContentProvided(to, cc, bcc, subject, text, html)) {
        throw new Error(
          'You must provide `to`, `cc`, `bcc`, `subject`, `text`, or `html` to update a draft. Pass null for a field to clear it.',
        );
      }

      throwIfTooManyInboxDraftRecipients(to, cc, bcc);

      const response = await inboxes.drafts.update({
        inboxId,
        draftId,
        to,
        cc,
        bcc,
        subject,
        text,
        html,
      } as UpdateInboxDraftOptions);

      throwIfResendFailed(response, 'Failed to update inbox draft');

      return {
        content: [
          {
            type: 'text',
            text: 'Draft updated successfully. Nothing has been sent — call send-inbox-draft once the user confirms it should go out.',
          },
          { type: 'text', text: inboxDraftText(response.data) },
        ],
      };
    },
  );

  server.registerTool(
    'remove-inbox-draft',
    REMOVE_INBOX_DRAFT_TOOL,
    async ({ inboxId, draftId }) => {
      const response = await inboxes.drafts.remove({ inboxId, draftId });

      throwIfResendFailed(response, 'Failed to remove inbox draft');

      return {
        content: [
          {
            type: 'text',
            text: 'Draft removed successfully. It was never sent, so no mail was affected — but what it held is gone.',
          },
          { type: 'text', text: `ID: ${response.data.id}` },
        ],
      };
    },
  );

  server.registerTool(
    'send-inbox-draft',
    SEND_INBOX_DRAFT_TOOL,
    async ({ inboxId, draftId }) => {
      const response = await inboxes.drafts.send({ inboxId, draftId });

      throwIfResendFailed(response, 'Failed to send inbox draft');

      const sent = response.data;
      return {
        content: [
          {
            type: 'text',
            text: 'Draft sent successfully. The email is on its way and cannot be recalled.',
          },
          {
            type: 'text',
            text: [
              `Draft ID: ${sent.id}`,
              `Thread ID: ${sent.thread_id}`,
              `Email ID: ${sent.email_id}`,
            ].join('\n'),
          },
          {
            type: 'text',
            text: 'The thread ID opens the conversation the sent message now lives in — pass it to get-inbox-thread. The email ID is that message inside the thread — pass it to get-inbox-thread-email to read exactly what went out.',
          },
        ],
      };
    },
  );
}
