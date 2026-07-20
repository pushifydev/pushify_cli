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

class ApiClient {
  private getHeaders(): HeadersInit {
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
