import type { McpServer } from '@modelcontextprotocol/server';
import type { Resend } from 'resend';

const GET_USAGE_TOOL = {
  title: 'Get Usage',
  annotations: { readOnlyHint: true },
  description: `**Purpose:** Retrieve the account's current usage and plan limits.

**Returns:** Email sending/receiving usage (daily and monthly), contacts, segments, broadcasts, AI credits, automation runs, domains, and the account's API rate limit. A \`null\` limit means no cap applies (e.g. daily/segment caps only apply on some plan tiers; broadcasts are never capped).

**When to use:**
- User wants to check how close they are to a plan limit
- User says "how much of my quota have I used?", "what's my usage?", "am I close to my limits?"`,
  inputSchema: {},
} as const;

function formatQuota(used: number, limit: number | null): string {
  return limit === null ? `${used} (no cap)` : `${used} / ${limit}`;
}

export function addUsageTools(server: McpServer, resend: Resend) {
  server.registerTool('get-usage', GET_USAGE_TOOL, async (_args, _ctx) => {
    const response = await resend.usage.get();

    if (response.error) {
      throw new Error(`Failed to get usage: ${JSON.stringify(response.error)}`);
    }

    const usage = response.data;

    return {
      content: [
        {
          type: 'text',
          text: [
            `Emails (daily): ${formatQuota(usage.emails.daily.used, usage.emails.daily.limit)} — sent ${usage.emails.daily.sent}, received ${usage.emails.daily.received}, resets at ${usage.emails.daily.resets_at}`,
            `Emails (monthly): ${formatQuota(usage.emails.monthly.used, usage.emails.monthly.limit)} — sent ${usage.emails.monthly.sent}, received ${usage.emails.monthly.received}, resets at ${usage.emails.monthly.resets_at}`,
            `Contacts: ${formatQuota(usage.contacts.used, usage.contacts.limit)}`,
            `Segments: ${formatQuota(usage.segments.used, usage.segments.limit)}`,
            `Broadcasts: ${formatQuota(usage.broadcasts.used, usage.broadcasts.limit)}`,
            `AI credits: ${formatQuota(usage.ai_credits.used, usage.ai_credits.limit)}${usage.ai_credits.next_increase_at ? ` — next increase at ${usage.ai_credits.next_increase_at}` : ''}`,
            `Automation runs: ${formatQuota(usage.automation_runs.used, usage.automation_runs.limit)} — resets at ${usage.automation_runs.resets_at}`,
            `Domains: ${formatQuota(usage.domains.used, usage.domains.limit)}`,
            `Rate limit: ${usage.rate_limit.limit} requests per ${usage.rate_limit.duration}`,
          ].join('\n'),
        },
      ],
    };
  });
}
