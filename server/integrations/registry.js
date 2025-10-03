import { getLogger } from '../logger.js';

const logger = getLogger('integrations', 'debug');
const registry = new Map();

export class IntegrationProvider {
  constructor({ name, title, scopes = [], description, requiresPkce = false } = {}) {
    if (!name) {
      throw new Error('IntegrationProvider requires a name');
    }
    this.name = name;
    this.title = title ?? name;
    this.scopes = scopes;
    this.description = description;
    this.requiresPkce = Boolean(requiresPkce);
  }

  describe() {
    return {
      name: this.name,
      title: this.title,
      scopes: this.scopes,
      description: this.description,
      requiresPkce: this.requiresPkce,
    };
  }

  getAuthorizationUrl() {
    throw new Error('getAuthorizationUrl not implemented');
  }

  async exchangeCodeForToken() {
    throw new Error('exchangeCodeForToken not implemented');
  }

  async refreshToken() {
    throw new Error('refreshToken not implemented');
  }

  async ensureAccessToken(account) {
    if (!account) {
      throw new Error('Integration account missing');
    }
    if (!account.expiresAt) {
      return account;
    }
    const expiresAt = new Date(account.expiresAt).getTime();
    const now = Date.now();
    if (Number.isFinite(expiresAt) && expiresAt - now > 60 * 1000) {
      return account;
    }
    if (!account.refreshToken) {
      return account;
    }
    const tokens = await this.refreshToken(account.refreshToken, account);
    if (!tokens?.accessToken) {
      throw new Error('Unable to refresh integration token');
    }
    account.accessToken = tokens.accessToken;
    if (tokens.refreshToken) {
      account.refreshToken = tokens.refreshToken;
    }
    if (tokens.expiresAt) {
      account.expiresAt = tokens.expiresAt instanceof Date
        ? tokens.expiresAt
        : new Date(tokens.expiresAt);
    } else if (tokens.expiresIn) {
      account.expiresAt = new Date(Date.now() + Number(tokens.expiresIn) * 1000);
    }
    if (tokens.scope) {
      account.scope = Array.isArray(tokens.scope) ? tokens.scope : String(tokens.scope).split(' ');
    }
    if (tokens.metadata) {
      account.metadata = { ...(account.metadata ?? {}), ...tokens.metadata };
    }
    await account.save();
    return account;
  }

  async fetchRecords() {
    throw new Error('fetchRecords not implemented');
  }
}

export function registerIntegration(provider) {
  if (!(provider instanceof IntegrationProvider)) {
    throw new Error('registerIntegration expects an IntegrationProvider instance');
  }
  registry.set(provider.name, provider);
  logger.info(`Registered integration provider ${provider.name}`);
  return provider;
}

export function getIntegration(name) {
  return registry.get(name);
}

export function listIntegrations() {
  return Array.from(registry.values()).map((provider) => provider.describe());
}
