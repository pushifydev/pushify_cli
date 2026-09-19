import chalk from 'chalk';
import { getApiKey, getApiUrl } from './config.js';

export interface Project {
  id: string;
  name: string;
  slug: string;
  status: 'active' | 'paused' | 'deleted';
  gitRepoUrl: string | null;
  gitBranch: string | null;
  createdAt: string;
  updatedAt: string;
  domains?: Array<{
    id: string;
    domain: string;
    isPrimary: boolean;
  }>;
}

export interface Deployment {
  id: string;
  projectId: string;
  status: 'pending' | 'building' | 'deploying' | 'running' | 'failed' | 'stopped' | 'cancelled';
  trigger: 'manual' | 'git_push' | 'rollback' | 'redeploy';
  commitHash: string | null;
  commitMessage: string | null;
  branch: string | null;
  errorMessage: string | null;
  createdAt: string;
}

export interface DeploymentLogs {
  logs: string | null;
  status: string;
}

export interface CreateProjectInput {
  name: string;
  gitRepoUrl?: string;
  gitBranch?: string;
  gitProvider?: 'github' | 'gitlab';
}

/** One frame of the runtime (container) log SSE stream. */
export interface ContainerLogEvent {
  type: 'connected' | 'log' | 'error' | 'end' | 'ping';
  message?: string;
  containerName?: string;
  live?: boolean;
  remote?: boolean;
}

class ApiClient {
  private getHeaders(): Record<string, string> {
    const apiKey = getApiKey();
    if (!apiKey) {
      throw new Error('Not authenticated. Run `pushify login` first.');
    }

    return {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    };
  }

  private async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const apiUrl = getApiUrl();
    const url = `${apiUrl}${path}`;

    try {
      const response = await fetch(url, {
        method,
        headers: this.getHeaders(),
        body: body ? JSON.stringify(body) : undefined,
      });

      const data = await response.json();

      if (!response.ok) {
        const errorMessage = data.error?.message || data.message || 'Request failed';
        throw new Error(errorMessage);
      }

      return data;
    } catch (error) {
      if (error instanceof Error) {
        if (error.message.includes('ECONNREFUSED')) {
          throw new Error(`Cannot connect to API at ${apiUrl}. Is the server running?`);
        }
        throw error;
      }
      throw new Error('Unknown error occurred');
    }
  }

  // Projects
  async listProjects(): Promise<Project[]> {
    const response = await this.request<{ data: Project[] }>('GET', '/projects');
    return response.data;
  }

  async getProject(projectId: string): Promise<Project> {
    const response = await this.request<{ data: Project }>('GET', `/projects/${projectId}`);
    return response.data;
  }

  async getProjectBySlug(slug: string): Promise<Project | null> {
    const projects = await this.listProjects();
    return projects.find(p => p.slug === slug || p.name.toLowerCase() === slug.toLowerCase()) || null;
  }

  async createProject(input: CreateProjectInput): Promise<Project> {
    const response = await this.request<{ data: Project; message: string }>('POST', '/projects', input);
    return response.data;
  }

  // Environment variables
  async getEnvVars(projectId: string): Promise<Array<{ key: string; value: string }>> {
    const response = await this.request<{ data: Array<{ key: string; value: string }> }>(
      'GET',
      `/projects/${projectId}/env`
    );
    return response.data;
  }

  async bulkSetEnvVars(
    projectId: string,
    variables: Array<{ key: string; value: string }>
  ): Promise<number> {
    const response = await this.request<{ data: Array<unknown> }>(
      'POST',
      `/projects/${projectId}/env/bulk`,
      { variables }
    );
    return response.data.length;
  }

  // Deployments
  async listDeployments(projectId: string, limit = 10): Promise<Deployment[]> {
    const response = await this.request<{ data: Deployment[] }>(
      'GET',
      `/projects/${projectId}/deployments?limit=${limit}`
    );
    return response.data;
  }

  async createDeployment(projectId: string, options?: { branch?: string }): Promise<Deployment> {
    const response = await this.request<{ data: Deployment; message: string }>(
      'POST',
      `/projects/${projectId}/deployments`,
      options || {}
    );
    return response.data;
  }

  async getDeployment(projectId: string, deploymentId: string): Promise<Deployment> {
    const response = await this.request<{ data: Deployment }>(
      'GET',
      `/projects/${projectId}/deployments/${deploymentId}`
    );
    return response.data;
  }

  async getDeploymentLogs(projectId: string, deploymentId: string): Promise<DeploymentLogs> {
    const response = await this.request<{ data: DeploymentLogs }>(
      'GET',
      `/projects/${projectId}/deployments/${deploymentId}/logs`
    );
    return response.data;
  }

  /**
   * Follow the runtime (container) logs of a deployment over SSE — the same
   * endpoint and frame format the dashboard uses. Calls `onEvent` for every
   * frame until the server ends the stream or `signal` aborts.
   */
  async streamContainerLogs(
    projectId: string,
    deploymentId: string,
    onEvent: (event: ContainerLogEvent) => void,
    options: { tail?: number; signal?: AbortSignal } = {}
  ): Promise<void> {
    const apiUrl = getApiUrl();
    const query = options.tail ? `?tail=${options.tail}` : '';
    const url = `${apiUrl}/projects/${projectId}/deployments/${deploymentId}/container-logs/stream${query}`;

    let response: Response;
    try {
      response = await fetch(url, {
        headers: { ...this.getHeaders(), Accept: 'text/event-stream' },
        signal: options.signal,
      });
    } catch (error) {
      if (error instanceof Error && error.message.includes('ECONNREFUSED')) {
        throw new Error(`Cannot connect to API at ${apiUrl}. Is the server running?`);
      }
      throw error;
    }

    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      const message =
        (typeof data.error === 'string' ? data.error : data.error?.message) ||
        data.message ||
        `Request failed (HTTP ${response.status})`;
      throw new Error(message);
    }
    if (!response.body) {
      throw new Error('No response body');
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      // Frames are separated by a blank line; keep any trailing partial frame
      const frames = buffer.split('\n\n');
      buffer = frames.pop() ?? '';
      for (const frame of frames) {
        const line = frame.split('\n').find((l) => l.startsWith('data: '));
        if (!line) continue;
        try {
          onEvent(JSON.parse(line.slice(6)) as ContainerLogEvent);
        } catch {
          // ignore malformed frames
        }
      }
    }
  }

  // Validation
  async validateApiKey(): Promise<boolean> {
    try {
      await this.listProjects();
      return true;
    } catch {
      return false;
    }
  }
}

export const api = new ApiClient();
