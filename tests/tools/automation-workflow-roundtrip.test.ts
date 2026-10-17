import { Client } from '@modelcontextprotocol/client';
import { InMemoryTransport } from '@modelcontextprotocol/server';
import {
  type AutomationResponseConnection,
  type AutomationResponseStep,
  type GetAutomationResponseSuccess,
  Resend,
} from 'resend';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { WorkflowDefinition } from '../../src/lib/workflow-converter.js';
import { createMcpServer } from '../../src/server.js';

const steps: AutomationResponseStep[] = [
  {
    key: 'trigger',
    type: 'trigger',
    config: { event_name: 'user.created' },
  },
  { key: 'delay', type: 'delay', config: { duration: '30 minutes' } },
  {
    key: 'condition',
    type: 'condition',
    config: {
      type: 'and',
      rules: [
        {
          type: 'rule',
          field: 'event.first_name',
          operator: 'eq',
          value: 'Ada',
        },
      ],
    },
  },
  {
    key: 'email',
    type: 'send_email',
    config: {
      template: {
        id: 'tmpl_1',
        variables: { first_name: { var: 'contact.first_name' } },
      },
      subject: 'Welcome',
      from: 'team@example.com',
      reply_to: 'help@example.com',
    },
  },
  {
    key: 'wait',
    type: 'wait_for_event',
    config: {
      event_name: 'resend:email.opened',
      timeout: '1 hour',
      filter_rule: {
        type: 'rule',
        field: 'event.first_name',
        operator: 'eq',
        value: 'Ada',
      },
    },
  },
  {
    key: 'contact',
    type: 'contact_update',
    config: {
      first_name: '',
      last_name: { var: 'event.last_name' },
      unsubscribed: false,
      properties: { first_name: 'custom property', score: 0 },
    },
  },
  {
    key: 'segment',
    type: 'add_to_segment',
    config: { segment_id: 'seg_1' },
  },
  { key: 'delete', type: 'contact_delete', config: {} },
];

const connections: AutomationResponseConnection[] = [
  { from: 'trigger', to: 'delay', type: 'default' },
  { from: 'delay', to: 'condition', type: 'default' },
  { from: 'condition', to: 'email', type: 'condition_met' },
  { from: 'condition', to: 'delete', type: 'condition_not_met' },
  { from: 'email', to: 'wait', type: 'default' },
  { from: 'wait', to: 'contact', type: 'event_received' },
  { from: 'wait', to: 'segment', type: 'timeout' },
];

const automation: GetAutomationResponseSuccess = {
  object: 'automation',
  id: 'aut_1',
  name: 'Welcome series',
  status: 'disabled',
  created_at: '2026-01-01T00:00:00Z',
  updated_at: null,
  steps,
  connections,
};

interface UpdatePayload {
  steps: AutomationResponseStep[];
  connections: Array<{
    from: string;
    to: string;
    type?: string;
  }>;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

async function editRetrievedWorkflow(): Promise<UpdatePayload> {
  let updatePayload: UpdatePayload | undefined;
  vi.stubGlobal(
    'fetch',
    async (url: string, options: RequestInit): Promise<Response> => {
      expect(String(url)).toBe('https://api.resend.com/automations/aut_1');
      if (options.method === 'GET') {
        return Response.json(automation);
      }
      expect(options.method).toBe('PATCH');
      updatePayload = JSON.parse(String(options.body)) as UpdatePayload;
      return Response.json({ id: 'aut_1' });
    },
  );

  const server = createMcpServer(
    new Resend('re_test_key'),
    { replierEmailAddresses: [] },
    're_test_key',
  );
  const client = new Client({ name: 'test-client', version: '0.0.0' });
  const [clientTransport, serverTransport] =
    InMemoryTransport.createLinkedPair();
  await Promise.all([
    server.connect(serverTransport),
    client.connect(clientTransport),
  ]);

  try {
    const retrieved = await client.callTool({
      name: 'get-automation',
      arguments: { id: 'aut_1' },
    });
    expect(retrieved.isError).toBeFalsy();
    const content = retrieved.content as Array<{ type: string; text: string }>;
    const workflowText = content.find((part) =>
      part.text.startsWith('Workflow:\n'),
    );
    expect(workflowText).toBeDefined();
    const workflow = JSON.parse(
      workflowText!.text.slice('Workflow:\n'.length),
    ) as WorkflowDefinition;
    workflow.steps.find((step) => step.key === 'delay')!.config.duration =
      '2 hours';

    const updated = await client.callTool({
      name: 'update-automation',
      arguments: { id: 'aut_1', workflow },
    });
    expect(updated.isError).toBeFalsy();
    expect(updatePayload).toBeDefined();
    return updatePayload!;
  } finally {
    await client.close();
    await server.close();
  }
}

describe('editing a retrieved automation through the SDK HTTP serializer', () => {
  for (const step of steps.filter((step) => step.type !== 'delay')) {
    it(`preserves ${step.type} configuration when another step is edited`, async () => {
      const payload = await editRetrievedWorkflow();
      expect(
        payload.steps.find((item) => item.key === step.key)?.config,
      ).toEqual(step.config);
    });
  }

  it('applies the requested delay edit', async () => {
    const payload = await editRetrievedWorkflow();
    expect(payload.steps.find((step) => step.key === 'delay')?.config).toEqual({
      duration: '2 hours',
    });
  });

  it('preserves both condition and wait-for-event branch destinations', async () => {
    const payload = await editRetrievedWorkflow();
    expect(
      payload.connections.map((connection) => ({
        ...connection,
        type: connection.type ?? 'default',
      })),
    ).toEqual(connections);
  });
});
