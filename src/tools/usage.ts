import type { McpServer } from '@modelcontextprotocol/server';
import type { Resend } from 'resend';

const GET_USAGE_TOOL = {
  title: 'Get Usage',
  annotations: { readOnlyHint: true },
  description: `**Purpose:** Get account-level usage and quota information: emails sent/received, contacts, segments, broadcasts, AI credits, automation runs, domains, and the API rate limit.

**Returns:** Current usage and limit for each resource, plus reset/renewal dates where applicable. A null limit means no cap is enforced for that resource.

**When to use:**
- User wants to check their plan usage or remaining quota
- User asks "how many emails have I sent?", "am I close to my limit?", "what's my rate limit?", "how many AI credits do I have left?"`,
  inputSchema: {},
} as const;

export function addUsageTools(server: McpServer, resend: Resend) {
  server.registerTool('get-usage', GET_USAGE_TOOL, async (_args, _ctx) => {
    const response = await resend.usage.get();

    if (response.error) {
      throw new Error(`Failed to get usage: ${JSON.stringify(response.error)}`);
    }

    const usage = response.data;
    const limitText = (limit: number | null) =>
      limit === null ? 'no cap' : limit;

    return {
      content: [
        {
          type: 'text',
          text: `Emails (daily): ${usage.emails.daily.used} used / ${limitText(usage.emails.daily.limit)} (${usage.emails.daily.sent} sent, ${usage.emails.daily.received} received)\nResets at: ${usage.emails.daily.resets_at}`,
        },
        {
          type: 'text',
          text: `Emails (monthly): ${usage.emails.monthly.used} used / ${usage.emails.monthly.limit} (${usage.emails.monthly.sent} sent, ${usage.emails.monthly.received} received)\nResets at: ${usage.emails.monthly.resets_at}`,
        },
        {
          type: 'text',
          text: `Contacts: ${usage.contacts.used} / ${usage.contacts.limit}`,
        },
        {
          type: 'text',
          text: `Segments: ${usage.segments.used} / ${limitText(usage.segments.limit)}`,
        },
        {
          type: 'text',
          text: `Broadcasts: ${usage.broadcasts.used} / ${limitText(usage.broadcasts.limit)}`,
        },
        {
          type: 'text',
          text: `AI credits: ${usage.ai_credits.used} / ${limitText(usage.ai_credits.limit)}\nNext increase at: ${usage.ai_credits.next_increase_at ?? 'n/a'}`,
        },
        {
          type: 'text',
          text: `Automation runs: ${usage.automation_runs.used} / ${usage.automation_runs.limit}\nResets at: ${usage.automation_runs.resets_at}`,
        },
        {
          type: 'text',
          text: `Domains: ${usage.domains.used} / ${limitText(usage.domains.limit)}`,
        },
        {
          type: 'text',
          text: `Rate limit: ${usage.rate_limit.limit} requests per ${usage.rate_limit.duration}`,
        },
      ],
    };
  });
}
