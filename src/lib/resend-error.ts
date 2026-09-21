type ResendResult<T> =
  | { data: T; error: null; headers?: Record<string, string> | null }
  | { data: null; error: unknown; headers?: Record<string, string> | null };

export function throwIfResendFailed<T>(
  response: ResendResult<T>,
  context: string,
): asserts response is {
  data: T;
  error: null;
  headers?: Record<string, string> | null;
} {
  if (!response.error) return;
  throw new Error(`${context}: ${JSON.stringify(response.error)}`);
}
