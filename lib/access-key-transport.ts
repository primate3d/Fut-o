export const ACCESS_KEY_HEADER = "x-futeo-access-key";

export function createAccessKeyHeaders(code: string) {
  return { [ACCESS_KEY_HEADER]: code };
}

export function readAccessKeyHeader(request: Request) {
  return request.headers.get(ACCESS_KEY_HEADER)?.trim().toUpperCase() ?? "";
}
