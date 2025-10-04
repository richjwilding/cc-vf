import { URL, URLSearchParams } from 'node:url';
import { Buffer } from 'node:buffer';
import { getLogger } from '../../logger.js';
import { IntegrationProvider, registerIntegration } from '../registry.js';

const logger = getLogger('integration-airtable', 'debug');

const AUTH_BASE = 'https://airtable.com/oauth2/v1';
const API_BASE = 'https://api.airtable.com/v0';

function getEnv(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing environment variable ${name} for Airtable integration`);
  }
  return value;
}

function toIso(input) {
  if (!input) return undefined;
  const date = input instanceof Date ? input : new Date(input);
  if (Number.isNaN(date.getTime())) {
    return undefined;
  }
  return date.toISOString();
}

function escapeFormulaLiteral(value) {
  if (value === undefined || value === null) {
    return '';
  }
  return `'${String(value).replace(/'/g, "\\'")}'`;
}

function buildFilterFormula(config, since, filters = {}) {
  const clauses = [];
  const timestampField = config.timestampField || config.lastModifiedField;
  const fieldExpr = timestampField ? `{${timestampField}}` : 'LAST_MODIFIED_TIME()';
  const sinceIso = toIso(since);
  if (sinceIso) {
    clauses.push(`IS_AFTER(${fieldExpr}, ${escapeFormulaLiteral(sinceIso)})`);
  }
  const range = filters.dateRange ?? {};
  if (timestampField && range.from) {
    clauses.push(`IS_AFTER(${fieldExpr}, ${escapeFormulaLiteral(toIso(range.from))})`);
  }
  if (timestampField && range.to) {
    clauses.push(`IS_BEFORE(${fieldExpr}, ${escapeFormulaLiteral(toIso(range.to))})`);
  }
  if (filters.formula) {
    clauses.push(`(${filters.formula})`);
  }
  if (clauses.length === 0) {
    return undefined;
  }
  if (clauses.length === 1) {
    return clauses[0];
  }
  return `AND(${clauses.join(',')})`;
}

function normalizeRecord(record, config) {
  const primaryField = config.primaryKeyField || config.primaryField;
  const timestampField = config.timestampField || config.lastModifiedField;
  const uniqueValue = primaryField ? record.fields?.[primaryField] : undefined;
  const updatedRaw = timestampField ? record.fields?.[timestampField] : undefined;
  const fallbackDate = new Date();
  const updatedAt = updatedRaw ? new Date(updatedRaw) : fallbackDate;
  const createdAt = record.createdTime ? new Date(record.createdTime) : fallbackDate;
  const titleField = config.titleField || primaryField;
  const title = titleField ? record.fields?.[titleField] : undefined;

  return {
    recordId: record.id,
    externalId: uniqueValue ?? record.id,
    uniqueValue: uniqueValue ?? record.id,
    createdAt,
    updatedAt,
    title: typeof title === 'string' ? title : undefined,
    fields: record.fields ?? {},
    raw: record,
  };
}

class AirtableIntegration extends IntegrationProvider {
  constructor() {
    super({
      name: 'airtable',
      title: 'Airtable',
      scopes: ['data.records:read', 'schema.bases:read'],
      description: 'Sync records from Airtable bases and tables.',
      requiresPkce: true,
      supportsDiscovery: true,
    });
  }

  describeConfiguration() {
    return {
      account: [],
      primitive: [
        {
          key: 'baseId',
          label: 'Base',
          required: true,
          discovery: {
            type: 'bases',
            itemLabel: 'name',
          },
        },
        {
          key: 'tableId',
          label: 'Table',
          required: true,
          dependsOn: ['baseId'],
          discovery: {
            type: 'tables',
            requires: ['baseId'],
            itemLabel: 'name',
          },
        },
      ],
    };
  }

  get clientId() {
    return getEnv('AIRTABLE_CLIENT_ID');
  }

  get clientSecret() {
    return getEnv('AIRTABLE_CLIENT_SECRET');
  }

  get defaultRedirectUri() {
    return getEnv('AIRTABLE_OAUTH_REDIRECT');
  }

  getAuthorizationUrl({ state, redirectUri, scopes, codeChallenge, codeChallengeMethod } = {}) {
    const url = new URL(`${AUTH_BASE}/authorize`);
    const params = new URLSearchParams({
      client_id: this.clientId,
      response_type: 'code',
      redirect_uri: redirectUri || this.defaultRedirectUri,
      scope: (scopes && scopes.length > 0 ? scopes : this.scopes).join(' '),
      state,
    });
    if (codeChallenge) {
      params.set('code_challenge', codeChallenge);
    }
    if (codeChallengeMethod) {
      params.set('code_challenge_method', codeChallengeMethod);
    }
    url.search = params.toString();
    return url.toString();
  }

  async exchangeCodeForToken({ code, redirectUri, codeVerifier }) {
    const params = new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: redirectUri || this.defaultRedirectUri,
    });
    if (codeVerifier) {
      params.set('code_verifier', codeVerifier);
    }
    return this.requestToken(params);
  }

  async refreshToken(refreshToken) {
    const params = new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
    });
    return this.requestToken(params);
  }

  async requestToken(params) {
    const response = await fetch(`${AUTH_BASE}/token`, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${Buffer.from(`${this.clientId}:${this.clientSecret}`).toString('base64')}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: params,
    });
    if (!response.ok) {
      const errorBody = await response.text();
      throw new Error(`Airtable token exchange failed (${response.status}): ${errorBody}`);
    }
    const body = await response.json();
    const expiresIn = body.expires_in ? Number(body.expires_in) : undefined;
    const expiresAt = expiresIn ? new Date(Date.now() + expiresIn * 1000) : undefined;
    return {
      accessToken: body.access_token,
      refreshToken: body.refresh_token,
      expiresIn,
      expiresAt,
      scope: body.scope ? String(body.scope).split(' ') : undefined,
      metadata: {
        tokenType: body.token_type,
      },
    };
  }

  async performRequest(account, url, options = {}) {
    await this.ensureAccessToken(account);

    let accessToken = account.accessToken;
    let refreshed = false;

    const execute = async () => {
      const response = await fetch(url, {
        method: options.method ?? 'GET',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          ...(options.headers ?? {}),
        },
        body: options.body,
      });

      if (response.status === 401 && !refreshed && account.refreshToken) {
        refreshed = true;
        const tokens = await this.refreshToken(account.refreshToken);
        if (tokens?.accessToken) {
          account.accessToken = tokens.accessToken;
          if (tokens.refreshToken) {
            account.refreshToken = tokens.refreshToken;
          }
          if (tokens.expiresAt) {
            account.expiresAt = tokens.expiresAt;
          } else if (tokens.expiresIn) {
            account.expiresAt = new Date(Date.now() + Number(tokens.expiresIn) * 1000);
          }
          await account.save();
          accessToken = account.accessToken;
          return execute();
        }
      }

      if (!response.ok) {
        const errorBody = await response.text();
        throw new Error(`Airtable API error (${response.status}): ${errorBody}`);
      }

      if (response.status === 204) {
        return null;
      }

      return response.json();
    };

    return execute();
  }

  async fetchRecords(account, config, options = {}) {
    if (!config?.baseId || !config?.tableId) {
      throw new Error('Airtable configuration requires baseId and tableId');
    }

    logger.debug('Fetching Airtable records', {
      baseId: config.baseId,
      tableId: config.tableId,
      since: options.since,
    });

    const items = [];
    let offset;
    const pageSize = Number(config.pageSize ?? 100);
    const maxRecords = Number(options.maxRecords ?? config.maxRecords ?? 1000);

    const formula = buildFilterFormula(config, options.since, options.filters);

    do {
      const endpoint = new URL(`${API_BASE}/${config.baseId}/${encodeURIComponent(config.tableId)}`);
      const search = endpoint.searchParams;
      search.set('pageSize', String(pageSize));
      if (offset) {
        search.set('offset', offset);
      }
      if (formula) {
        search.set('filterByFormula', formula);
      }
      if (config.viewId) {
        search.set('view', config.viewId);
      }
      if (Array.isArray(config.fields)) {
        for (const field of config.fields) {
          search.append('fields[]', field);
        }
      }
      if (Array.isArray(config.sort)) {
        config.sort.forEach((entry, idx) => {
          if (entry?.field) {
            search.append(`sort[${idx}][field]`, entry.field);
            if (entry.direction) {
              search.append(`sort[${idx}][direction]`, entry.direction);
            }
          }
        });
      }

      const payload = await this.performRequest(account, endpoint.toString());
      const pageRecords = Array.isArray(payload.records) ? payload.records : [];
      for (const record of pageRecords) {
        const normalized = normalizeRecord(record, config);
        if (options.since) {
          const sinceDate = new Date(options.since);
          if (normalized.updatedAt && normalized.updatedAt <= sinceDate) {
            continue;
          }
        }
        items.push(normalized);
        if (items.length >= maxRecords) {
          break;
        }
      }
      offset = payload.offset;
      if (items.length >= maxRecords) {
        break;
      }
    } while (offset);

    return {
      items,
      cursor: offset ? { offset } : undefined,
    };
  }

  async discover(account, params = {}) {
    const type = params.type ?? 'bases';
    const cursor = params.cursor;

    if (type === 'bases') {
      const endpoint = new URL(`${API_BASE}/meta/bases`);
      if (cursor) {
        endpoint.searchParams.set('offset', cursor);
      }
      const payload = await this.performRequest(account, endpoint.toString());
      const bases = Array.isArray(payload?.bases) ? payload.bases : [];
      return {
        type: 'bases',
        items: bases.map((base) => ({
          id: base.id,
          name: base.name,
          permissionLevel: base.permissionLevel,
          region: base.region,
        })),
        cursor: payload?.offset ?? null,
      };
    }

    if (type === 'tables') {
      const baseId = params.baseId;
      if (!baseId) {
        throw new Error('baseId is required for table discovery');
      }
      const endpoint = new URL(`${API_BASE}/meta/bases/${encodeURIComponent(baseId)}/tables`);
      if (cursor) {
        endpoint.searchParams.set('offset', cursor);
      }
      const payload = await this.performRequest(account, endpoint.toString());
      const tables = Array.isArray(payload?.tables) ? payload.tables : [];
      return {
        type: 'tables',
        baseId,
        items: tables.map((table) => ({
          id: table.id,
          name: table.name,
          description: table.description ?? null,
          primaryFieldId: table.primaryFieldId,
          fields: Array.isArray(table.fields)
            ? table.fields.map((field) => ({
                id: field.id,
                name: field.name,
                type: field.type,
              }))
            : [],
        })),
        cursor: payload?.offset ?? null,
      };
    }

    throw new Error(`Unsupported discovery type '${type}' for Airtable`);
  }
}

registerIntegration(new AirtableIntegration());
