// src/utils/config.ts

// Define the Config interface
export interface Config {
  Region: string;
  API: string;
  AgentID: string;
  AgentAliasID: string;
  KnowledgeBaseID: string;
}

export function getConfig(): Config {
  if (!window.config) {
    throw new Error('Configuration not loaded. Ensure config.js is loaded before accessing config.');
  }
  return window.config;
}

// Type declaration
declare global {
  interface Window {
    config: Config;
    configLoaded: Promise<void>;
  }
}
  