import Conf from 'conf';

interface ConfigSchema {
  apiKey: string | null;
  apiUrl: string;
  defaultProject: string | null;
}

export const DEFAULT_API_URL = 'https://api.pushify.dev/api/v1';

export const config = new Conf<ConfigSchema>({
  projectName: 'pushify-cli',
  defaults: {
    apiKey: null,
    apiUrl: DEFAULT_API_URL,
    defaultProject: null,
  },
});

export function getApiKey(): string | null {
  // Check environment variable first
  const envKey = process.env.PUSHIFY_API_KEY;
  if (envKey) {
    return envKey;
  }
  return config.get('apiKey');
}

export function getApiUrl(): string {
  const envUrl = process.env.PUSHIFY_API_URL;
  if (envUrl) {
    return envUrl;
  }
  return config.get('apiUrl');
}

export function isAuthenticated(): boolean {
  return getApiKey() !== null;
}

/**
 * Web dashboard that pairs with an API URL: api.pushify.dev → pushify.dev and
 * :4000 → :3000 for local dev. Shared by the browser login and `init`.
 */
export function getDashboardUrl(apiUrl: string = getApiUrl()): string {
  return apiUrl
    .replace('/api/v1', '')
    .replace('api.pushify.dev', 'pushify.dev')
    .replace(':4000', ':3000');
}
