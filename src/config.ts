import Conf from 'conf';

interface ConfigSchema {
  apiKey: string | null;
  apiUrl: string;
  defaultProject: string | null;
}

export const config = new Conf<ConfigSchema>({
  projectName: 'pushify-cli',
  defaults: {
    apiKey: null,
    apiUrl: 'https://api.pushify.dev/api/v1',
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
