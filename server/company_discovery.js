import axios from 'axios';
import mongoose from "mongoose";
import Primitive from "./model/Primitive";
import Category from "./model/Category";
import { SIO } from "./socket";
import { createPrimitive, findResultSetForCategoryId, flattenPath, getNextSequenceBlock, primitivePrimitives, runPostCreateHooks } from "./SharedFunctions";
import { getMetaDescriptionFromURL, replicateURLtoStorage } from "./google_helper";
import { analyzeListAgainstTopics } from "./openai_helper";
import { findCompanyURLByName } from "./task_processor";

const rejectWords = ["somewhat", "hardly", "not at all"];

const BRIGHTDATA_POLL_INTERVAL = parseInt(process.env.BRIGHTDATA_DISCOVER_POLL_INTERVAL ?? "2000", 10);
const BRIGHTDATA_POLL_ATTEMPTS = parseInt(process.env.BRIGHTDATA_DISCOVER_MAX_ATTEMPTS ?? "30", 10);

function getDatasetId() {
    return process.env.BRIGHTDATA_COMPANY_DISCOVERY_DATASET_ID;
}

function getHeaders() {
    return {
        Authorization: `Bearer ${process.env.BRIGHTDATA_KEY}`,
        "Content-Type": "application/json"
    };
}

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function normalizeDomain(raw) {
    if (!raw) {
        return undefined;
    }
    try {
        const trimmed = raw.trim();
        if (!trimmed) {
            return undefined;
        }
        const hasProtocol = /^https?:\/\//i.test(trimmed);
        const url = new URL(hasProtocol ? trimmed : `https://${trimmed}`);
        const domain = url.hostname.toLowerCase();
        return domain.replace(/\/$/, "");
    } catch (err) {
        return undefined;
    }
}

function ensureAbsoluteUrl(raw) {
    if (!raw) {
        return undefined;
    }
    const hasProtocol = /^https?:\/\//i.test(raw);
    if (hasProtocol) {
        return raw;
    }
    const domain = normalizeDomain(raw);
    return domain ? `https://${domain}` : undefined;
}

function tokenizeCompanyName(name) {
    if (!name) {
        return [];
    }
    return name
        .toLowerCase()
        .split(/[^a-z0-9]+/)
        .map(token => token.trim())
        .filter(token => token.length > 2);
}

function countTokenMatches(text, tokens) {
    if (!text || !tokens?.length) {
        return 0;
    }
    const normalized = text.toLowerCase();
    return tokens.reduce((count, token) => (normalized.includes(token) ? count + 1 : count), 0);
}

function domainMatchesTokens(domain, tokens) {
    if (!domain || !tokens?.length) {
        return false;
    }
    const core = domain.replace(/^https?:\/\//, "").replace(/^www\./, "").split(".")[0];
    if (!core) {
        return false;
    }
    return tokens.some(token => core.includes(token));
}

/**
 * Normalizes a discovery candidate and optionally verifies that the supplied
 * company tokens appear in either the provided description, a fetched meta
 * description, or the domain itself.
 */
async function finalizeCandidate(candidate, tokens, options = {}, metaCache = new Map()) {
    const verifyDescription = options.verifyDescription ?? true;
    const shouldFetchMeta = options.shouldFetchMeta ?? true;

    const websiteUrl = ensureAbsoluteUrl(candidate.website_url ?? candidate.url ?? candidate.referenceParameters?.url);
    const domain = candidate.domain ?? normalizeDomain(websiteUrl);

    const normalizeText = value => (value ? value.replace(/\s+/g, " ").trim() : undefined);

    let description = normalizeText(candidate.description ?? candidate.referenceParameters?.description);
    let verified = !verifyDescription || tokens.length === 0;

    const meetsTokenThreshold = text => {
        if (!verifyDescription || !text) {
            return false;
        }
        const matchCount = countTokenMatches(text, tokens);
        if (!matchCount) {
            return false;
        }
        const requiredMatches = tokens.length <= 1 ? 1 : Math.min(tokens.length, 2);
        return matchCount >= requiredMatches;
    };

    if (!verified && description) {
        verified = meetsTokenThreshold(description);
    }

    if ((!description || (verifyDescription && !verified)) && shouldFetchMeta && websiteUrl) {
        let cached = metaCache.get(websiteUrl);
        if (cached === undefined) {
            try {
                cached = await getMetaDescriptionFromURL(websiteUrl);
            } catch (error) {
                cached = null;
            }
            metaCache.set(websiteUrl, cached);
        }
        if (cached) {
            const normalizedMeta = normalizeText(cached);
            if (!description) {
                description = normalizedMeta;
            }
            if (!verified) {
                verified = meetsTokenThreshold(normalizedMeta);
            }
        }
    }

    if (!verified && domainMatchesTokens(domain, tokens)) {
        verified = true;
    }

    return {
        ...candidate,
        website_url: websiteUrl ?? candidate.website_url,
        domain,
        description,
        verified
    };
}

function mapCompanyRecord(record = {}) {
    const name = record.company_name ?? record.name ?? record.title ?? record.company ?? record.brand_name;
    const website = record.company_website ?? record.website ?? record.website_url ?? record.url ?? record.company_url ?? record.domain;
    const domain = normalizeDomain(website);
    const description = record.company_description ?? record.description ?? record.summary ?? record.about ?? record.overview;
    const location = record.company_location ?? record.location ?? record.headquarters ?? record.city ?? record.country;
    const logo = record.company_logo ?? record.logo_url ?? record.logo ?? record.image;
    const linkedin = record.linkedin_url ?? record.company_linkedin ?? record.linkedin;
    const twitter = record.twitter_url ?? record.twitter ?? record.x_url;
    const facebook = record.facebook_url ?? record.facebook;
    const categories = record.categories ?? record.category ?? record.tags ?? record.industry ?? record.company_industry;

    return {
        name: name ?? (domain ? domain : undefined),
        website_url: ensureAbsoluteUrl(website ?? (domain ? `https://${domain}` : undefined)),
        domain,
        description,
        location,
        logo,
        linkedin,
        twitter,
        facebook,
        categories,
        raw: record
    };
}

async function pollSnapshot(snapshotId) {
    const headers = getHeaders();
    for (let attempt = 0; attempt < BRIGHTDATA_POLL_ATTEMPTS; attempt++) {
        const response = await axios.get(`https://api.brightdata.com/datasets/v3/snapshot/${snapshotId}?format=json`, { headers });
        if (Array.isArray(response.data)) {
            return response.data;
        }
        const status = response.data?.status;
        if (status && ["building", "collecting", "running"].includes(status)) {
            await sleep(BRIGHTDATA_POLL_INTERVAL);
            continue;
        }
        break;
    }
    throw new Error(`BrightData snapshot ${snapshotId} did not complete in time`);
}

async function triggerDiscovery(keyword, options = {}) {
    const datasetId = getDatasetId();
    if (!datasetId) {
        throw new Error("BRIGHTDATA_COMPANY_DISCOVERY_DATASET_ID is not configured");
    }
    const headers = getHeaders();
    let url = `https://api.brightdata.com/datasets/v3/trigger?dataset_id=${datasetId}&type=discover_new&discover_by=keyword`;
    if (options.limit) {
        url += `&limit_per_input=${options.limit}`;
    }
    const payload = [{ keyword }];
    const response = await axios.post(url, payload, { headers });
    const snapshotId = response.data?.snapshot_id;
    if (!snapshotId) {
        throw new Error(`BrightData discovery trigger did not return a snapshot id for "${keyword}"`);
    }
    return snapshotId;
}

async function fetchCompaniesForKeyword(keyword, options = {}) {
    try {
        const snapshotId = await triggerDiscovery(keyword, options);
        const rawRecords = await pollSnapshot(snapshotId);
        return rawRecords.map(mapCompanyRecord).filter(record => record.name || record.domain);
    } catch (error) {
        console.error(`BrightData discover failed for keyword "${keyword}"`, error.response?.data ?? error.message);
        return [];
    }
}

async function filterCompaniesByTopics(records, topics) {
    if (!topics || !records.length) {
        return records;
    }
    const descriptions = records.map(d => (d.description ?? "").replace(/\n/g, ". "));
    if (descriptions.every(text => !text)) {
        return records;
    }
    const analysis = await analyzeListAgainstTopics(descriptions, topics, { prefix: "Organization", type: "organization", engine: "o3-mini" });
    if (!analysis.success) {
        return records;
    }
    return records.filter((_, idx) => {
        const score = analysis.output?.find(result => result.i === idx)?.s;
        return score ? !rejectWords.includes(score) : true;
    });
}

function buildResultFromCompany(record, keyword) {
    const description = record.description ? record.description.replace(/\n/g, ". ") : undefined;
    const referenceParameters = {
        url: record.website_url,
        domain: record.domain,
        description,
        location: record.location,
        api_source: "brightdata_discover",
        source: keyword ? `BrightData Discover "${keyword}"` : "BrightData Discover",
        linkedin: record.linkedin,
        twitter: record.twitter,
        facebook: record.facebook,
        categories: record.categories
    };
    return {
        title: record.name ?? record.domain ?? keyword ?? "Unknown organization",
        referenceParameters
    };
}

async function bulkCreateCompanyPrimitives(records, referenceId, parent, paths) {
    if (!records?.length) {
        return [];
    }

    const deduped = [];
    const seenDomains = new Set();

    for (const record of records) {
        const domain = record.domain ?? normalizeDomain(record.website_url);
        if (!domain || seenDomains.has(domain)) {
            continue;
        }
        seenDomains.add(domain);
        deduped.push({
            ...record,
            domain,
            website_url: ensureAbsoluteUrl(record.website_url ?? `https://${domain}`)
        });
    }

    if (!deduped.length) {
        return [];
    }

    const domainList = deduped.map(item => item.domain).filter(Boolean);
    const urlVariants = domainList.flatMap(domain => [
        domain,
        `https://${domain}`,
        `https://${domain}/`,
        `http://${domain}`,
        `http://${domain}/`
    ]);

    const existing = await Primitive.find({
        workspaceId: parent.workspaceId,
        deleted: { $exists: false },
        $or: [
            { "referenceParameters.domain": { $in: domainList } },
            { "referenceParameters.url": { $in: urlVariants } }
        ]
    }, { _id: 1, referenceParameters: 1 }).lean();

    const existingDomains = new Set(
        existing
            .map(doc => normalizeDomain(doc.referenceParameters?.domain ?? doc.referenceParameters?.url))
            .filter(Boolean)
    );

    const toCreate = deduped.filter(record => !existingDomains.has(record.domain));
    if (!toCreate.length) {
        return [];
    }

    const parentPaths = (paths ?? ["origin"]).map(path => flattenPath(path));
    const workspaceId = parent.workspaceId;
    const { start: plainStart } = await getNextSequenceBlock("base", toCreate.length);

    const docs = toCreate.map((record, idx) => {
        const description = record.description ? record.description.replace(/\n/g, ". ") : undefined;
        return {
            workspaceId,
            type: "entity",
            referenceId,
            title: record.name ?? record.domain ?? record.website_url,
            referenceParameters: {
                url: record.website_url ?? (record.domain ? `https://${record.domain}` : undefined),
                domain: record.domain,
                description,
                location: record.location,
                api_source: "brightdata_discover",
                linkedin: record.linkedin,
                twitter: record.twitter,
                facebook: record.facebook,
                categories: record.categories
            },
            parentPrimitives: { [parent.id]: parentPaths },
            primitives: {},
            metrics: {},
            flowElement: parent.type === "flow",
            brightdataDiscovery: record.raw ?? record,
            plainId: plainStart + idx
        };
    });

    const session = await mongoose.startSession();
    let insertedDocs = [];
    try {
        await session.withTransaction(async () => {
            insertedDocs = await Primitive.insertMany(docs, { session });
            if (!insertedDocs.length) {
                return;
            }
            const childIds = insertedDocs.map(doc => doc.id);
            const updateOps = parentPaths.map(path => ({
                updateOne: {
                    filter: { _id: parent.id },
                    update: { $addToSet: { [path]: { $each: childIds } } }
                }
            }));

            if (updateOps.length) {
                await Primitive.bulkWrite(updateOps, { session });
            }
        });
    } catch (error) {
        await session.abortTransaction().catch(() => {});
        session.endSession();
        throw error;
    }
    session.endSession();

    if (!insertedDocs.length) {
        return [];
    }

    const categoryMap = new Map();
    if (referenceId !== undefined) {
        const category = await Category.findOne({ id: referenceId });
        if (category) {
            categoryMap.set(referenceId, category);
        }
    }

    const processed = await runPostCreateHooks(insertedDocs, { categoryMap });
    const finalDocs = processed?.length ? processed : insertedDocs;

    toCreate.forEach((record, idx) => {
        const inserted = insertedDocs[idx];
        if (record.logo && inserted) {
            replicateURLtoStorage(record.logo, inserted._id.toString(), "cc_vf_images");
        }
    });

    SIO.notifyPrimitiveEvent(parent.workspaceId, [
        {
            type: "new_primitives",
            data: insertedDocs
        }
    ]);

    const relationshipEvents = [];
    for (const doc of insertedDocs) {
        for (const path of parentPaths) {
            relationshipEvents.push({
                type: "add_relationship",
                id: parent.id,
                target: doc.id,
                path
            });
        }
    }

    if (relationshipEvents.length) {
        SIO.notifyPrimitiveEvent(parent.workspaceId, relationshipEvents);
    }

    return finalDocs;
}

function extractKeywordsFromTerms(terms) {
    if (!terms) {
        return [];
    }

    const splitString = value =>
        value
            .split(/,|\sor\s|\sand\s/)
            .map(token => token.trim())
            .filter(Boolean);

    if (Array.isArray(terms)) {
        return terms
            .map(item => (typeof item === "string" ? item : item?.keyword ?? ""))
            .flatMap(value => splitString(String(value ?? "")));
    }

    if (typeof terms === "object") {
        if (Array.isArray(terms.keyword)) {
            return extractKeywordsFromTerms(terms.keyword);
        }
        if (typeof terms.keyword === "string") {
            return splitString(terms.keyword);
        }
    }

    if (typeof terms === "string") {
        return splitString(terms);
    }

    return [];
}

export async function lookupCompanyByName(name, options = {}) {
    const trimmed = name?.trim();
    if (!trimmed) {
        return [];
    }

    const limit = options.limit ?? 20;
    const tokens = tokenizeCompanyName(trimmed);
    const seenDomains = new Set();
    const results = [];

    const forceBrightData = options.forceBrightData ?? false;
    const verifyDescription = options.verifyDescription !== false;
    const shouldFetchMeta = options.fetchMeta !== false;
    const context = options.context ?? {};
    const metaCache = new Map();

    let primaryCandidate;
    const resolvedUrl = await findCompanyURLByName(trimmed, context);
    if (resolvedUrl) {
        primaryCandidate = await finalizeCandidate(
            {
                name: trimmed,
                website_url: resolvedUrl,
                source: "web_search"
            },
            tokens,
            { verifyDescription, shouldFetchMeta },
            metaCache
        );

        if (primaryCandidate.domain) {
            seenDomains.add(primaryCandidate.domain);
        }
        results.push(primaryCandidate);

        if (primaryCandidate.verified && !forceBrightData) {
            return results;
        }
    }

    const companies = await fetchCompaniesForKeyword(trimmed, { limit });
    if (!companies.length) {
        return results;
    }

    for (const company of companies) {
        const domain = company.domain ?? normalizeDomain(company.website_url);
        if (primaryCandidate?.domain && domain && domain === primaryCandidate.domain) {
            const updated = await finalizeCandidate(
                {
                    ...primaryCandidate,
                    name: primaryCandidate.name ?? company.name,
                    website_url: primaryCandidate.website_url ?? company.website_url,
                    description: primaryCandidate.description ?? company.description,
                    domain,
                    raw: company.raw ?? company
                },
                tokens,
                { verifyDescription, shouldFetchMeta },
                metaCache
            );
            Object.assign(primaryCandidate, updated, { raw: company.raw ?? company });
            continue;
        }
        if (domain && seenDomains.has(domain)) {
            continue;
        }
        const candidate = await finalizeCandidate(
            {
                name: company.name,
                website_url: company.website_url,
                description: company.description,
                domain,
                source: "brightdata_discover",
                raw: company.raw
            },
            tokens,
            { verifyDescription, shouldFetchMeta },
            metaCache
        );
        if (candidate.domain) {
            seenDomains.add(candidate.domain);
        }
        results.push(candidate);
    }

    return results;
}

export async function searchCompaniesWithBrightData(terms, options = {}) {
    const keywords = extractKeywordsFromTerms(terms);
    if (!keywords.length) {
        return options.parent || options.createResult ? 0 : [];
    }

    if (options.parent && !options.referenceId) {
        throw new Error("referenceId is required when creating primitives from BrightData results");
    }

    const topics = options.topics ?? options.parent?.referenceParameters?.topics;
    const requireDescription = options.requireDescription !== false;
    const allowOverflow = options.allowOverflow ?? false;
    const target = options.count ?? 20;
    const lookupCount = options.lookupCount ?? target;
    const maxCreation = options.maxCreation ?? target;

    const createMode = Boolean(options.parent || options.createResult);
    const results = [];
    const seenDomains = new Set();
    const recordsForCreation = [];
    let totalCount = 0;

    outer: for (const keyword of keywords) {
        if (!allowOverflow) {
            if (options.parent && options.referenceId && recordsForCreation.length >= maxCreation) {
                break;
            }
            if (!options.parent && createMode && totalCount >= maxCreation) {
                break;
            }
        }

        const records = await fetchCompaniesForKeyword(keyword, { limit: lookupCount });
        const filteredRecords = topics ? await filterCompaniesByTopics(records, topics) : records;

        for (const record of filteredRecords) {
            if (options.cancelCheck && await Promise.resolve(options.cancelCheck())) {
                break outer;
            }

            const candidate = buildResultFromCompany(record, keyword);
            const description = candidate.referenceParameters.description;
            const domain = candidate.referenceParameters.domain;

            if (domain && seenDomains.has(domain)) {
                continue;
            }

            if (requireDescription && !description) {
                continue;
            }

            if (options.filterPre && !(await options.filterPre({ text: description ?? "", term: keyword, record }))) {
                continue;
            }

            if (options.existingCheck && (await options.existingCheck({
                ...candidate.referenceParameters,
                title: candidate.title,
                record
            }))) {
                continue;
            }

            if (options.filterPost && !(await options.filterPost({ text: description ?? "", term: keyword, record }))) {
                continue;
            }

            if (domain) {
                seenDomains.add(domain);
            }

            if (options.parent && options.referenceId) {
                if (!allowOverflow && recordsForCreation.length >= maxCreation) {
                    break outer;
                }
                recordsForCreation.push(record);
                continue;
            }

            if (options.createResult) {
                const created = await options.createResult(candidate, true);
                if (created) {
                    totalCount += 1;
                    results.push(created);
                }
            } else {
                results.push(candidate);
                totalCount += 1;
            }

            if (!allowOverflow && !createMode && totalCount >= target) {
                break outer;
            }

            if (!allowOverflow && createMode && totalCount >= maxCreation) {
                break outer;
            }
        }
    }

    if (options.parent && options.referenceId) {
        if (!recordsForCreation.length) {
            return 0;
        }
        const created = await bulkCreateCompanyPrimitives(
            recordsForCreation,
            options.referenceId,
            options.parent,
            options.paths ?? ["origin"]
        );
        return created.length;
    }

    if (createMode) {
        return totalCount;
    }

    return results;
}

export async function resolveCompaniesByName(list, existingOrgs = [], options = {}) {
    const out = [];
    for (const name of list) {
        if (!name) {
            continue;
        }
        const normalized = name.trim().toLowerCase();
        let candidates = existingOrgs.filter(org => org.title?.trim()?.toLowerCase() === normalized);
        if (!candidates.length) {
            const remoteLookup = await lookupCompanyByName(name, options.lookup ?? options.lookupOptions ?? {});
            if (remoteLookup.length) {
                const candidateUrls = remoteLookup.map(item => item.website_url).filter(Boolean);
                const matchByUrl = existingOrgs.find(org => {
                    const existingUrl = org.referenceParameters?.url;
                    if (!existingUrl) {
                        return false;
                    }
                    const existingDomain = normalizeDomain(existingUrl);
                    return candidateUrls.some(url => {
                        const candidateDomain = normalizeDomain(url);
                        return candidateDomain && existingDomain && candidateDomain === existingDomain;
                    }) || candidateUrls.includes(existingUrl);
                });
                if (matchByUrl) {
                    candidates = [matchByUrl];
                } else {
                    candidates = remoteLookup.map(item => ({
                        new: true,
                        title: item.name ?? name,
                        referenceParameters: {
                            url: item.website_url,
                            domain: item.domain,
                            description: item.description
                        },
                        source: item.source,
                        raw: item.raw,
                        verified: item.verified
                    }));
                }
            }
        }
        if (candidates.length) {
            candidates.sort((a, b) => Math.abs((a.title ?? "").length - normalized.length) - Math.abs((b.title ?? "").length - normalized.length));
            out.push(candidates[0]);
        }
    }
    return out;
}

export async function resolveAndCreateCompaniesByName(list, target, resultCategoryId, defaultResultSet, createBlank = false, create = true, lookupOptions = {}) {
    const resultSet = defaultResultSet ?? await findResultSetForCategoryId(target, resultCategoryId);
    if (resultSet === undefined) {
        throw new Error("Cannot determine result set for company resolution");
    }
    const resultCategory = await Category.findOne({ id: resultCategoryId });
    const existingOrgs = await primitivePrimitives(target, `results.${resultSet}`);
    const entityList = await resolveCompaniesByName(list, existingOrgs, { lookup: lookupOptions });
    const final = [];
    if (!entityList.length && createBlank) {
        for (const name of list) {
            if (!name) {
                continue;
            }
            entityList.push({ new: true, title: name, referenceParameters: {} });
        }
    }
    for (const item of entityList) {
        if (item.new) {
            if (!create) {
                continue;
            }
            const newData = {
                workspaceId: target.workspaceId,
                paths: ["origin", `results.${resultSet}`],
                parent: target.id,
                data: {
                    type: resultCategory.primitiveType,
                    referenceId: resultCategoryId,
                    title: item.title,
                    referenceParameters: {
                        url: item.referenceParameters?.url,
                        domain: item.referenceParameters?.domain,
                        description: item.referenceParameters?.description,
                        api_source: item.source
                    }
                }
            };
            const newPrim = await createPrimitive(newData);
            if (newPrim) {
                final.push(newPrim);
            }
        } else {
            final.push(item);
        }
    }
    return final;
}

export default {
    lookupCompanyByName,
    searchCompaniesWithBrightData,
    resolveCompaniesByName,
    resolveAndCreateCompaniesByName
};
