import type { Resend } from 'resend';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { runStdio } from '../../src/transports/stdio.js';

const { mockServeStdio, mockStdioServerTransport } = vi.hoisted(() => ({
  mockServeStdio: vi.fn(() => ({
    close: vi.fn().mockResolvedValue(undefined),
  })),
  mockStdioServerTransport: vi.fn(),
}));

vi.mock('../../src/server.js', () => ({
  createMcpServer: vi.fn(() => ({ mock: 'server' })),
}));

vi.mock('@modelcontextprotocol/server/stdio', () => ({
  serveStdio: mockServeStdio,
  StdioServerTransport: mockStdioServerTransport,
}));

describe('runStdio', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('serves with legacy: "serve" so old clients are unaffected', async () => {
    const resend = {} as Resend;
    await runStdio(resend, { replierEmailAddresses: [] }, 're_test_key');

    expect(mockServeStdio).toHaveBeenCalledTimes(1);
    const [, options] = mockServeStdio.mock.calls[0];
    expect(options).toMatchObject({ legacy: 'serve' });
  });

  it('reads messages up to 64 MiB so large attachments fit', async () => {
    const resend = {} as Resend;
    await runStdio(resend, { replierEmailAddresses: [] }, 're_test_key');

    expect(mockStdioServerTransport).toHaveBeenCalledWith(
      undefined,
      undefined,
      { maxBufferSize: 64 * 1024 * 1024 },
    );
    const [, options] = mockServeStdio.mock.calls[0];
    expect(options.transport).toBe(mockStdioServerTransport.mock.instances[0]);
  });

  it('creates server via the factory passed to serveStdio', async () => {
    const resend = {} as Resend;
    await runStdio(resend, { replierEmailAddresses: [] }, 're_test_key');
    const { createMcpServer } = await import('../../src/server.js');

    const [factory] = mockServeStdio.mock.calls[0];
    factory();

    expect(createMcpServer).toHaveBeenCalledWith(
      resend,
      { senderEmailAddress: undefined, replierEmailAddresses: [] },
      're_test_key',
    );
  });

  it('passes sender and repliers to server', async () => {
    const resend = {} as Resend;
    await runStdio(
      resend,
      {
        senderEmailAddress: 'x@r.dev',
        replierEmailAddresses: ['a@x.com', 'b@x.com'],
      },
      're_test_key',
    );
    const { createMcpServer } = await import('../../src/server.js');
    const [factory] = mockServeStdio.mock.calls[0];
    factory();

    expect(createMcpServer).toHaveBeenCalledWith(
      resend,
      {
        senderEmailAddress: 'x@r.dev',
        replierEmailAddresses: ['a@x.com', 'b@x.com'],
      },
      're_test_key',
    );
  });

  it('wires connection errors to onerror instead of a rejected promise', async () => {
    const resend = {} as Resend;
    await runStdio(resend, { replierEmailAddresses: [] }, 're_test_key');

    const [, options] = mockServeStdio.mock.calls[0];
    expect(() => options.onerror(new Error('boom'))).not.toThrow();
  });
});
