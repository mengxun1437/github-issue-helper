import type { Issue } from './github-utils/issues';

interface Config {
  githubToken?: string;
  openaiKey?: string;
  llmConfig?: {
    provider: string;
    apiKey: string;
    apiUrl: string;
    model: string;
  };
  currentRepo?: string;
  issues?: Issue[];
}

export async function getConfig(): Promise<Config> {
  return new Promise((resolve) => {
    chrome.storage.sync.get(['githubToken', 'openaiKey', 'llmConfig', 'currentRepo', 'issues'], (result) => {
      console.log('Config loaded:', result);
      resolve(result as Config);
    });
  });
}

export async function saveConfig(config: Partial<Config>): Promise<void> {
  return new Promise((resolve) => {
    console.log('Saving config:', config);
    chrome.storage.sync.set(config, () => resolve());
  });
}
