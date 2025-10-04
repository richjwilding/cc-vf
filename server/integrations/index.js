import { getLogger } from '../logger.js';
import Category from '../model/Category.js';
import IntegrationAccount from '../model/IntegrationAccount.js';
import {
  createPrimitive,
  fetchPrimitive,
} from '../SharedFunctions.js';
import { getIntegration as getRegisteredIntegration } from './registry.js';

export {
  IntegrationProvider,
  registerIntegration,
  getIntegration,
  listIntegrations,
} from './registry.js';

const logger = getLogger('integrations', 'debug');

const EXTERNAL_RECORD_CATEGORY_ID = Number(process.env.EXTERNAL_RECORD_CATEGORY_ID || 157);

export async function ensureExternalRecordCategory() {
  let category = await Category.findOne({ id: EXTERNAL_RECORD_CATEGORY_ID });
  if (!category) {
    category = await Category.create({
      id: EXTERNAL_RECORD_CATEGORY_ID,
      title: 'External Data Record',
      description: 'Raw data captured from connected integrations.',
      icon: 'CloudArrowDownIcon',
      parameters: {
        integrationRecord: true,
      },
    });
  }
  return category;
}

function mergeDeep(target, source) {
  if (!source || typeof source !== 'object' || Array.isArray(source)) {
    return target;
  }
  const output = target || {};
  for (const [key, value] of Object.entries(source)) {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      output[key] = mergeDeep(output[key] ?? {}, value);
    } else if (value !== undefined) {
      output[key] = value;
    }
  }
  return output;
}

function setDeep(target, path, value) {
  if (value === undefined) {
    return;
  }
  const segments = Array.isArray(path) ? path : String(path).split('.');
  let node = target;
  for (let i = 0; i < segments.length - 1; i += 1) {
    const seg = segments[i];
    if (!node[seg] || typeof node[seg] !== 'object') {
      node[seg] = {};
    }
    node = node[seg];
  }
  node[segments.at(-1)] = value;
}

function getCaseInsensitiveProperty(container, key) {
  if (!container || typeof container !== 'object') {
    return undefined;
  }
  if (Object.prototype.hasOwnProperty.call(container, key)) {
    return container[key];
  }
  if (typeof key !== 'string') {
    return container[key];
  }
  const lowerKey = key.toLowerCase();
  for (const existingKey of Object.keys(container)) {
    if (existingKey.toLowerCase() === lowerKey) {
      return container[existingKey];
    }
  }
  return undefined;
}

function getCaseInsensitivePath(container, path) {
  const segments = Array.isArray(path) ? path : String(path).split('.');
  let current = container;
  for (const segment of segments) {
    if (current == null) {
      return undefined;
    }
    if (Array.isArray(current)) {
      const index = Number(segment);
      if (!Number.isInteger(index)) {
        return undefined;
      }
      current = current[index];
      continue;
    }
    if (typeof current !== 'object') {
      return undefined;
    }
    current = getCaseInsensitiveProperty(current, segment);
  }
  return current;
}

function extractRecordValue(record, source) {
  if (source === undefined || source === null) {
    return undefined;
  }
  if (typeof source === 'string') {
    if (source.startsWith('$')) {
      switch (source) {
        case '$recordId':
          return record.recordId;
        case '$uniqueValue':
          return record.uniqueValue ?? record.externalId ?? record.recordId;
        case '$updatedAt':
          return record.updatedAt?.toISOString?.() ?? null;
        case '$createdAt':
          return record.createdAt?.toISOString?.() ?? null;
        case '$fields':
          return record.fields;
        default:
          break;
      }
    }
    if (source.includes('.')) {
      return getCaseInsensitivePath(record, source.split('.'));
    }
    const fieldValue = getCaseInsensitiveProperty(record.fields, source);
    if (fieldValue !== undefined) {
      return fieldValue;
    }
    return getCaseInsensitiveProperty(record, source);
  }
  if (Array.isArray(source)) {
    return getCaseInsensitivePath(record, source);
  }
  if (typeof source === 'object') {
    const value = extractRecordValue(record, source.path ?? source.field);
    if ((value === undefined || value === null) && source.default !== undefined) {
      return source.default;
    }
    if (source.transform === 'date' && value) {
      return new Date(value).toISOString();
    }
    if (source.transform === 'number' && value !== undefined && value !== null) {
      const num = Number(value);
      return Number.isFinite(num) ? num : undefined;
    }
    if (source.transform === 'boolean' && value !== undefined && value !== null) {
      return Boolean(value);
    }
    return value;
  }
  return source;
}

function buildRecordTitle(record, config) {
  const candidate = extractRecordValue(record, config?.titleField);
  if (typeof candidate === 'string' && candidate.trim()) {
    return candidate.trim();
  }
  if (record.title && record.title.trim()) {
    return record.title.trim();
  }
  const fallback = record.uniqueValue ?? record.externalId ?? record.recordId;
  return `Record ${fallback}`;
}

async function buildOrUpdateChildPrimitive(recordPrim, record, mapping) {
  const mappingKey = mapping.key ?? mapping.type;
  if (!mapping.type || !mapping.referenceId) {
    logger.warn('Skipping mapping without type/referenceId', { mapping });
    return null;
  }
  const desiredData = {
    workspaceId: recordPrim.workspaceId,
    parent: recordPrim._id?.toString?.() ?? recordPrim.id,
    paths: ['origin', ...(mapping.paths ?? [])].filter((d,i,a)=>a.indexOf(d)===i),
    data: {
      type: mapping.type,
      referenceId: mapping.referenceId,
      title: buildRecordTitle(record, mapping),
      referenceParameters: {},
    },
  };
  if (mapping.stateField) {
    const stateValue = extractRecordValue(record, mapping.stateField);
    if (stateValue) {
      desiredData.data.state = stateValue;
    }
  }
  if (mapping.fieldMap) {
    for (const [targetPath, source] of Object.entries(mapping.fieldMap)) {
      const value = extractRecordValue(record, source);
      if (value !== undefined) {
        setDeep(desiredData.data, targetPath, value);
      }
    }
  }
  if (mapping.staticFields) {
    for (const [targetPath, value] of Object.entries(mapping.staticFields)) {
      setDeep(desiredData.data, targetPath, value);
    }
  }

  const integrationResources = recordPrim.resources?.integration ?? {};
  integrationResources.children ??= {};
  const existingChildId = integrationResources.children[mappingKey];
  let childPrimitive = existingChildId ? await fetchPrimitive(existingChildId) : undefined;

  if (!childPrimitive) {
    childPrimitive = await createPrimitive(desiredData);
  } else {
    if (desiredData.data.title) {
      childPrimitive.title = desiredData.data.title;
    }
    if (desiredData.data.state) {
      childPrimitive.state = desiredData.data.state;
    }
    const updatedRefParams = mergeDeep(childPrimitive.referenceParameters ?? {}, desiredData.data.referenceParameters ?? {});
    childPrimitive.set('referenceParameters', updatedRefParams);
    childPrimitive.markModified('referenceParameters');
    await childPrimitive.save();
  }

  integrationResources.children[mappingKey] = childPrimitive._id?.toString?.() ?? childPrimitive.id;
  recordPrim.set('resources.integration', integrationResources);
  recordPrim.markModified('resources');
  await recordPrim.save();

  return {
    mappingKey,
    primitiveId: integrationResources.children[mappingKey],
  };
}

export async function syncExternalPrimitive(primitive, options = {}) {
  const providerName = options.provider ?? primitive.referenceParameters?.provider;
  if (!providerName) {
    throw new Error('External primitive is missing a provider');
  }
  const provider = getRegisteredIntegration(providerName);
  if (!provider) {
    throw new Error(`Integration provider '${providerName}' is not registered`);
  }

  const accountId = options.accountId
    ?? primitive.referenceParameters?.integrationAccountId
    ?? primitive.resources?.integration?.accountId;
  if (!accountId) {
    throw new Error('No integration account configured for this primitive');
  }

  const account = await IntegrationAccount.findById(accountId);
  if (!account) {
    throw new Error('Integration account not found');
  }
  if (primitive.workspaceId && account.workspaceId
    && primitive.workspaceId.toString() !== account.workspaceId.toString()) {
    throw new Error('Integration account does not belong to the same workspace');
  }

  await provider.ensureAccessToken(account);

  const sourceConfig = {
    ...(primitive.referenceParameters?.source ?? {}),
    /// FIX THIS
    baseId: primitive.referenceParameters?.baseId,
    tableId: primitive.referenceParameters?.tableId,
    //
    ...(options.sourceOverride ?? {}),
  };
  if (!sourceConfig) {
    throw new Error('External primitive is missing source configuration');
  }

  const since = options.since
    ?? primitive.referenceParameters?.lastSyncedAt
    ?? primitive.resources?.integration?.lastSyncedAt;

  const fetchOptions = {
    since,
    filters: sourceConfig.filters ?? {},
    maxRecords: options.maxRecords ?? sourceConfig.maxRecords,
  };

  const response = await provider.fetchRecords(account, sourceConfig, fetchOptions);
  const records = response?.items ?? [];

  if (!Array.isArray(records)) {
    throw new Error('Integration provider returned an invalid record set');
  }

  const categoryId = primitive.referenceParameters?.recordCategoryId
    ?? (await ensureExternalRecordCategory()).id;
  const recordPrimitiveType = primitive.referenceParameters?.recordPrimitiveType ?? 'result';
  const recordPaths = primitive.referenceParameters?.recordPaths ?? ['origin'];
  let mappings = Array.isArray(primitive.referenceParameters?.mappings)
    ? primitive.referenceParameters.mappings
    : [];
  if( typeof( mappings ) === "string"){
    try{
      mappings = JSON.parse(mappings)
    }catch(er){

    }
  }

  const existingState = primitive.resources?.integration ?? {};
  const recordMap = { ...(existingState.records ?? {}) };

  let created = 0;
  let updated = 0;
  let latestTimestamp = since ? new Date(since).getTime() : 0;

  for (const record of records) {
    const key = String(record.externalId ?? record.uniqueValue ?? record.recordId ?? '');
    if (!key) {
      logger.warn('Skipping record without an identifier');
      continue;
    }

    const existing = recordMap[key];
    let recordPrimitive;

    if (existing?.primitiveId) {
      recordPrimitive = await fetchPrimitive(existing.primitiveId);
    }

    const desiredTitle = buildRecordTitle(record, primitive.referenceParameters);

    if (!recordPrimitive) {
      recordPrimitive = await createPrimitive({
        workspaceId: primitive.workspaceId,
        parent: primitive._id?.toString?.() ?? primitive.id,
        paths: recordPaths,
        data: {
          type: recordPrimitiveType,
          referenceId: categoryId,
          title: desiredTitle,
          referenceParameters: {},
        },
      });
      created += 1;
    } else {
      if (desiredTitle && recordPrimitive.title !== desiredTitle) {
        recordPrimitive.title = desiredTitle;
      }
      updated += 1;
    }

    const referenceParameters = mergeDeep(recordPrimitive.referenceParameters ?? {}, {
      external: {
        provider: providerName,
        recordId: record.recordId,
        uniqueValue: record.uniqueValue ?? record.externalId ?? record.recordId,
        updatedAt: record.updatedAt?.toISOString?.() ?? null,
        createdAt: record.createdAt?.toISOString?.() ?? null,
        fields: record.fields ?? {},
        raw: record.raw ?? undefined,
      },
    });
    recordPrimitive.set('referenceParameters', referenceParameters);
    recordPrimitive.markModified('referenceParameters');
    await recordPrimitive.save();

    const childSummaries = [];
    for (const mapping of mappings) {
      try {
        const summary = await buildOrUpdateChildPrimitive(recordPrimitive, record, mapping);
        if (summary) {
          childSummaries.push(summary);
        }
      } catch (error) {
        logger.error(`Failed to process mapping for record ${key}`, error);
      }
    }

    recordMap[key] = {
      primitiveId: recordPrimitive._id?.toString?.() ?? recordPrimitive.id,
      updatedAt: referenceParameters.external.updatedAt,
      recordId: record.recordId,
      uniqueValue: record.uniqueValue ?? record.externalId ?? record.recordId,
      children: childSummaries,
    };

    if (record.updatedAt) {
      const ts = new Date(record.updatedAt).getTime();
      if (Number.isFinite(ts)) {
        latestTimestamp = Math.max(latestTimestamp, ts);
      }
    }
  }

  const lastSyncedAt = Number.isFinite(latestTimestamp)
    ? new Date(latestTimestamp).toISOString()
    : new Date().toISOString();

  const integrationState = {
    ...existingState,
    provider: providerName,
    accountId: account._id?.toString?.() ?? account.id,
    records: recordMap,
    lastSyncedAt,
    cursor: response?.cursor ?? existingState.cursor ?? null,
    fetchedAt: new Date().toISOString(),
  };

  primitive.set('resources.integration', integrationState);
  primitive.markModified('resources');
  primitive.set('referenceParameters.lastSyncedAt', lastSyncedAt);
  primitive.markModified('referenceParameters');
  if (response?.cursor) {
    primitive.set('referenceParameters.cursor', response.cursor);
    primitive.markModified('referenceParameters');
  }
  await primitive.save();

  return {
    created,
    updated,
    processed: records.length,
    lastSyncedAt,
  };
}

// auto-register bundled providers
import './providers/airtable.js';
