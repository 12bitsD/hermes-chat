export function gatewayRootUrl(endpoint: string): string {
  if (!endpoint) return '';
  return endpoint
    .replace(/\/+$/, '')
    .replace(/\/v1\/chat\/completions$/, '')
    .replace(/\/chat\/completions$/, '')
    .replace(/\/v1$/, '');
}

export function gatewayV1Url(endpoint: string): string {
  const root = gatewayRootUrl(endpoint);
  return root ? `${root}/v1` : '';
}

export function gatewayApiUrl(endpoint: string): string {
  const root = gatewayRootUrl(endpoint);
  return root ? `${root}/api` : '';
}
