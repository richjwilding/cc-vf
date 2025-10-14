import axios from "axios";
import { BrightDataQueue, dispatchControlUpdate } from "./SharedFunctions.js";

const collectorDefinitions = new Map();
const filterRegistry = new Map();
const collectorLoadState = new Map();
const DEFAULT_COLLECTOR_CONCURRENCY = Number(process.env.BRIGHTDATA_COLLECTOR_MAX_CONCURRENT ?? "100");

function getCollectorLimit(definition) {
    const limitValue = definition?.maxConcurrent ?? DEFAULT_COLLECTOR_CONCURRENCY;
    const numeric = Number(limitValue);
    if (!Number.isFinite(numeric) || numeric <= 0) {
        return null;
    }
    return Math.floor(numeric);
}

function getCollectorBucket(key) {
    if (!collectorLoadState.has(key)) {
        collectorLoadState.set(key, {
            active: new Map(),
            queue: []
        });
    }
    return collectorLoadState.get(key);
}

async function acquireCollectorSlot(key, primitiveId, definition) {
    const limit = getCollectorLimit(definition);
    if (!limit) {
        return null;
    }

    const bucket = getCollectorBucket(key);
    if (bucket.active.size >= limit) {
        await new Promise(resolve => bucket.queue.push(resolve));
    }
    const ticket = `${Date.now().toString(36)}:${primitiveId ?? "unknown"}:${Math.random().toString(36).slice(2, 10)}`;
    bucket.active.set(ticket, { primitiveId, acquiredAt: Date.now() });
    return ticket;
}

export function releaseCollectorSlot(key, ticket) {
    if (!ticket) {
        return;
    }
    const bucket = collectorLoadState.get(key);
    if (!bucket) {
        return;
    }
    if (bucket.active.delete(ticket)) {
        const next = bucket.queue.shift();
        if (typeof next === "function") {
            next();
        }
    }
}

function getHeaders() {
    return {
        Authorization: `Bearer ${process.env.BRIGHTDATA_KEY}`,
        "Content-Type": "application/json"
    };
}

function buildTriggerUrl(definition, triggerOptions = {}) {
    const { datasetId, customDataset, triggerConfig = {} } = definition;
    const params = [];

    if (!customDataset) {
        params.push(`dataset_id=${datasetId}`);
    } else {
        params.push(`collector=${datasetId}`);
        params.push("queue_next=1");
    }

    let baseUrl;
    if (customDataset) {
        baseUrl = "https://api.brightdata.com/dca/trigger";
    } else {
        baseUrl = "https://api.brightdata.com/datasets/v3/trigger";
    }

    if (triggerConfig.type) {
        params.push(`type=${triggerConfig.type}`);
    }
    if (triggerConfig.discoverBy) {
        params.push(`discover_by=${triggerConfig.discoverBy}`);
    }

    if (triggerOptions.limitPerInput) {
        params.push(`limit_per_input=${triggerOptions.limitPerInput}`);
    } else if (triggerOptions.limit && !params.some(param => param.startsWith("limit_per_input="))) {
        params.push(`limit_per_input=${triggerOptions.limit}`);
    }

    if (triggerConfig.extraParams) {
        const extra = typeof triggerConfig.extraParams === "function"
            ? triggerConfig.extraParams(triggerOptions)
            : triggerConfig.extraParams;
        if (extra) {
            params.push(extra.replace(/^\?/, ""));
        }
    }

    return `${baseUrl}?${params.join("&")}`;
}

function extractCollectionId(definition, triggerResponse) {
    if (definition.extractCollectionId) {
        return definition.extractCollectionId(triggerResponse);
    }
    if (definition.customDataset) {
        return triggerResponse?.collection_id ?? triggerResponse?.response?.collection_id;
    }
    return triggerResponse?.snapshot_id ?? triggerResponse?.response?.snapshot_id;
}

function buildSnapshotUrl(definition, collectionId) {
    if (definition.customDataset) {
        return `https://api.brightdata.com/dca/dataset?id=${collectionId}`;
    }
    return `https://api.brightdata.com/datasets/v3/snapshot/${collectionId}?format=json`;
}

function ensureArray(value) {
    return Array.isArray(value) ? value : [];
}

export function registerCollectorFilter(name, handler) {
    if (!name || typeof name !== "string") {
        throw new Error("Collector filter requires a string name");
    }
    if (typeof handler !== "function") {
        throw new Error(`Collector filter "${name}" must be a function`);
    }
    filterRegistry.set(name, handler);
}

export function registerBrightDataCollector(key, definition) {
    if (!key) {
        throw new Error("Collector key is required");
    }
    if (collectorDefinitions.has(key)) {
        throw new Error(`Collector "${key}" has already been registered`);
    }
    if (!definition?.datasetId) {
        throw new Error(`Collector "${key}" requires a datasetId`);
    }
    collectorDefinitions.set(key, definition);
}

export function getBrightDataCollector(key) {
    return collectorDefinitions.get(key);
}

async function applyFilters(records, filters, context) {
    if (!filters?.length) {
        return records;
    }

    let current = records;
    for (const filterDef of filters) {
        let handler = filterDef;
        let options = {};

        if (typeof filterDef === "string") {
            handler = filterRegistry.get(filterDef);
        } else if (typeof filterDef === "object" && filterDef !== null) {
            const name = filterDef.name ?? filterDef.type;
            options = filterDef.options ?? { ...filterDef };
            delete options.name;
            delete options.type;
            delete options.handler;
            if (filterDef.handler && typeof filterDef.handler === "function") {
                handler = filterDef.handler;
            } else if (name) {
                handler = filterRegistry.get(name);
            }
        }

        if (typeof handler !== "function") {
            continue;
        }

        const next = await handler(current, context, options);
        current = ensureArray(next);
        if (!current.length) {
            break;
        }
    }
    return current;
}

export async function triggerBrightDataCollector(key, { primitive, input, triggerOptions = {}, collectorOptions = {} } = {}) {
    const definition = collectorDefinitions.get(key);
    if (!definition) {
        throw new Error(`Collector "${key}" is not registered`);
    }
    if (!primitive) {
        throw new Error(`Collector "${key}" requires a primitive to associate results with`);
    }

    const url = buildTriggerUrl(definition, triggerOptions);
    const payload = ensureArray(input);
    const loadTicket = await acquireCollectorSlot(key, primitive.id, definition);

    let collectionId;
    try {
        const response = await axios.post(url, payload, { headers: getHeaders() });
        collectionId = extractCollectionId(definition, response.data);
        if (!collectionId) {
            throw new Error(`Collector "${key}" trigger did not return a collection id`);
        }
    } catch (error) {
        releaseCollectorSlot(key, loadTicket);
        throw error;
    }

    const processingField = `processing.bd.${key}`;
    const processingPayload = {
        ...(primitive.processing?.bd?.[key] ?? {}),
        collectionId,
        options: collectorOptions,
        triggeredAt: new Date().toISOString(),
        loadTicket
    };
    await dispatchControlUpdate(primitive.id, processingField, processingPayload, { track: primitive.id });
    await BrightDataQueue().scheduleCollection(primitive, {
        api: key,
        provider: "brightdata_collector",
        collectorOptions,
        loadTicket
    });

    return { collectionId, loadTicket };
}

export async function handleBrightDataCollector(primitive, data = {}) {
    const { api } = data;
    if (!api) {
        throw new Error("Collector handler requires an api identifier");
    }
    const definition = collectorDefinitions.get(api);
    if (!definition) {
        throw new Error(`Collector "${api}" is not registered`);
    }

    const storedOptions = primitive.processing?.bd?.[api]?.options ?? {};
    const collectorOptions = {
        ...storedOptions,
        ...(data.collectorOptions ?? {})
    };
    const loadTicket = primitive.processing?.bd?.[api]?.loadTicket ?? data.loadTicket;

    const collectionId = primitive.bd?.[api]?.collectionId ?? primitive.processing?.bd?.[api]?.collectionId;
    if (!collectionId) {
        console.log(`Collector "${api}" has no collection id for primitive ${primitive.id}`);
        return { data: undefined };
    }

    const url = buildSnapshotUrl(definition, collectionId);
    const response = await axios.get(url, { headers: getHeaders() });

    if (!Array.isArray(response.data)) {
        const status = response.data?.status;
        if (status && ["building", "collecting", "running"].includes(status)) {
            return {
                reschedule: async (parent) => {
                    const options = {
                        api,
                        provider: "brightdata_collector",
                        collectorOptions,
                        parent,
                        loadTicket
                    };
                    await BrightDataQueue().scheduleCollection(primitive, options, true);
                }
            };
        }
        throw new Error(`Collector "${api}" dataset returned unexpected payload`);
    }

    let records = response.data;
    if (definition.mapItem || definition.mapRecord) {
        const mapper = definition.mapItem ?? definition.mapRecord;
        records = records
            .map(raw => mapper(raw, { primitive, options: collectorOptions }))
            .filter(Boolean);
    }

    const context = {
        primitive,
        definition,
        options: collectorOptions,
        job: data,
        state: {}
    };

    if (typeof definition.prepareContext === "function") {
        await definition.prepareContext(context);
    }

    const baseFilters = ensureArray(definition.filters);
    const dynamicFilters = ensureArray(collectorOptions.filters);
    const allFilters = baseFilters.concat(dynamicFilters);

    records = await applyFilters(records, allFilters, context);

    if (typeof definition.processRecords === "function") {
        return await definition.processRecords(records, context);
    }

    return records;
}
