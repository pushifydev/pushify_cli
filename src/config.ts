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
