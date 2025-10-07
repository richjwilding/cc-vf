import axios from 'axios';
import Primitive from './model/Primitive.js';
import Category from './model/Category.js';
import { addRelationship, BrightDataQueue, createPrimitive, dispatchControlUpdate, getNestedValue, runPostCreateHooks } from './SharedFunctions.js';
import { normaliseDomain } from './actions/SharedTransforms.js';

const CORESIGNAL_SEARCH_URL = 'https://api.coresignal.com/cdapi/v2/employee_multi_source/search/es_dsl';
const CORESIGNAL_COLLECT_URL = 'https://api.coresignal.com/cdapi/v2/employee_multi_source/collect/';

const DEFAULT_RESULT_CATEGORY = 58;
const DEFAULT_API = 'person_search';
const DEFAULT_PAGE_SIZE = 50;

function getCoresignalHeaders() {
    const apiKey = process.env.CORESIGNAL_API_KEY || process.env.CORESIGNAL_KEY;
    if (!apiKey) {
        throw new Error('CORESIGNAL_API_KEY is not configured');
    }
    return {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
    };
}

function coerceArray(value) {
    if (!value) {
        return [];
    }
    if (Array.isArray(value)) {
        return value.filter(Boolean).map((item) => `${item}`.trim()).filter(Boolean);
    }
    return `${value}`
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean);
}

function buildSearchQuery({ domain, terms, titles = [], locations = [], seniorities = [], functions = [] }) {
    if (!domain) {
        throw new Error('Coresignal person search requires a domain');
    }

    const mustClauses = [
        {
            nested: {
                path: 'experience',
                query: {
                    bool: {
                        must: [
                            { term: { 'experience.active_experience': 1 } },
                            { match_phrase: { 'experience.company_website.domain_only': domain } }
                        ]
                    }
                }
            }
        }
    ];

    const keywordTerms = new Set();
    coerceArray(terms).forEach((term) => keywordTerms.add(term));
    coerceArray(titles).forEach((term) => keywordTerms.add(term));
    coerceArray(functions).forEach((term) => keywordTerms.add(term));
    coerceArray(seniorities).forEach((term) => keywordTerms.add(term));

    const locationTerms = new Set();
    coerceArray(locations).forEach((term) => locationTerms.add(term));

    if (locationTerms.size > 0) {
        mustClauses.push({
            bool: {
                should: Array.from(locationTerms).map((term) => ({
                    match_phrase: {
                        'experience.location_name': term
                    }
                })),
                minimum_should_match: 1
            }
        });
    }

    if (keywordTerms.size > 0) {
        mustClauses.push({
            bool: {
                should: Array.from(keywordTerms).map((term) => ({
                    multi_match: {
                        query: term,
                        fields: [
                            'full_name^3',
                            'headline^2',
                            'experience.position^2',
                            'experience.summary',
                            'skills.name'
                        ],
                        type: 'phrase'
                    }
                })),
                minimum_should_match: 1
            }
        });
    }

    return {
        size: DEFAULT_PAGE_SIZE,
        query: {
            bool: {
                must: mustClauses
            }
        }
    };
}

function extractProfiles(data) {
    if (!data) {
        return [];
    }
    if (Array.isArray(data.results)) {
        return data.results;
    }
    if (Array.isArray(data.data)) {
        return data.data;
    }
    if (data.hits?.hits) {
        return data.hits.hits.map((hit) => ({ id: hit._id, ...hit._source }));
    }
    if (Array.isArray(data.items)) {
        return data.items;
    }
    return [];
}

function getLinkedinFromProfile(profile) {
    if (!profile) {
        return undefined;
    }
    if (profile.linkedin_url) {
        return profile.linkedin_url;
    }
    if (profile.linkedin) {
        if (typeof profile.linkedin === 'string') {
            return profile.linkedin;
        }
        if (profile.linkedin.url) {
            return profile.linkedin.url;
        }
    }
    if (Array.isArray(profile.social_profiles)) {
        const match = profile.social_profiles.find((item) => (item.type || '').toLowerCase() === 'linkedin');
        return match?.url || match?.value;
    }
    if (Array.isArray(profile.profiles)) {
        const match = profile.profiles.find((item) => (item.type || '').toLowerCase() === 'linkedin');
        return match?.url || match?.value;
    }
    return undefined;
}

function mapProfileToPrimitive(profile) {
    const source = profile?._source ? { ...profile._source, id: profile._id ?? profile.id } : profile;
    if (!source) {
        return undefined;
    }
    const experiences = Array.isArray(source.experience) ? source.experience : [];
    const currentExperience = experiences.find((exp) => exp.active_experience) || experiences[0];

    const title = source.full_name || source.name;
    if (!title) {
        return undefined;
    }

    const profileUrl = getLinkedinFromProfile(source);

    const referenceParameters = {
        id: source.id || source.profile_id || source.employee_id || source.public_identifier,
        fullname: title,
        title,
        role: currentExperience?.position || source.headline,
        headline: source.headline,
        location: source.location_name || currentExperience?.location_name,
        profile: profileUrl,
        company: currentExperience?.company_name,
        company_domain: currentExperience?.company_website?.domain_only,
        company_id: currentExperience?.company_id,
        start_date: currentExperience?.start_date,
        end_date: currentExperience?.end_date,
        experience: experiences,
        education: source.education,
        skills: source.skills,
        summary: source.summary,
        source: 'coresignal',
        raw: source
    };

    return {
        title,
        referenceParameters
    };
}

export async function queryCoresignalPersonSearch(primitive, terms, callopts = {}) {
    if (!primitive || primitive.type !== 'entity' || primitive.referenceId !== 29) {
        throw new Error('Coresignal person search can only be used with organization entities');
    }

    const config = callopts.config ?? {};

    const domainFromConfig = normaliseDomain(config.domain);
    const domainFromReference = normaliseDomain(primitive.referenceParameters?.domain);
    const domainFromUrl = normaliseDomain(primitive.referenceParameters?.url);
    const domain = domainFromConfig || domainFromReference || domainFromUrl || normaliseDomain(terms?.split(',')[0]);

    const queryBody = buildSearchQuery({
        domain,
        terms: config.terms ?? terms,
        titles: config.titles ?? config.roles ?? [],
        locations: config.locations ?? config.location,
        seniorities: config.seniorities ?? config.seniority,
        functions: config.functions ?? config.departments
    });

    if (Number.isFinite(config.count) && config.count > 0) {
        queryBody.size = Math.min(Number(config.count), 200);
    }

    const response = await axios.post(CORESIGNAL_SEARCH_URL, queryBody, {
        headers: getCoresignalHeaders()
    });

    const responseData = response.data ?? {};
    const collectionId = responseData.search_request_id || responseData.request_id || responseData.id || responseData.search_id;
    if (!collectionId) {
        throw new Error('Coresignal search did not return a collection identifier');
    }

    const api = callopts.api ?? DEFAULT_API;
    const fieldBase = `processing.coresignal.${api}`;

    const duplicateConfig = {
        resultCategoryId: callopts.source?.resultCategoryId ?? DEFAULT_RESULT_CATEGORY,
        primaryField: callopts.source?.primaryField ?? 'id',
        importField: callopts.source?.importField ?? 'referenceParameters.id',
        additionalDuplicateCheck: callopts.source?.additionalDuplicateCheck ?? []
    };

    await dispatchControlUpdate(primitive.id, `${fieldBase}.query`, queryBody);
    await dispatchControlUpdate(primitive.id, `${fieldBase}.collectionId`, collectionId);
    await dispatchControlUpdate(primitive.id, `${fieldBase}.config`, duplicateConfig);
    await dispatchControlUpdate(primitive.id, `${fieldBase}.status`, {
        status: 'running',
        message: 'Waiting for Coresignal results',
        startedAt: new Date()
    });

    await BrightDataQueue().scheduleCollection(primitive, {
        api,
        provider: 'coresignal'
    });

    return collectionId;
}

function collectStatusIsPending(status) {
    if (!status) {
        return false;
    }
    const normalized = `${status}`.toLowerCase();
    return ['pending', 'processing', 'in_progress', 'running', 'collecting', 'building'].includes(normalized);
}

function nextTokenFromResponse(data) {
    return data?.pagination?.next_page_token || data?.next_page_token || data?.nextToken || data?.pagination_token;
}

async function createProfiles(primitive, profiles, duplicateConfig) {
    if (!profiles.length) {
        return [];
    }

    const parentPaths = ['origin', 'auto'];
    const created = [];

    for (const profile of profiles) {
        const mapped = mapProfileToPrimitive(profile);
        if (!mapped) {
            continue;
        }

        const referenceParams = mapped.referenceParameters ?? {};
        const duplicateField = duplicateConfig.importField ?? 'referenceParameters.id';
        const duplicateValue = duplicateField.startsWith('referenceParameters.')
            ? getNestedValue(referenceParams, duplicateField.replace('referenceParameters.', ''))
            : getNestedValue(mapped, duplicateField);

        const duplicateConditions = [];
        if (duplicateValue !== undefined && duplicateValue !== null) {
            duplicateConditions.push({ [duplicateField]: duplicateValue });
        }
        if (Array.isArray(duplicateConfig.additionalDuplicateCheck)) {
            for (const rule of duplicateConfig.additionalDuplicateCheck) {
                if (!Array.isArray(rule) || rule.length < 2) {
                    continue;
                }
                const [dbField, sourceField] = rule;
                const value = sourceField.startsWith('referenceParameters.')
                    ? getNestedValue(referenceParams, sourceField.replace('referenceParameters.', ''))
                    : getNestedValue(mapped, sourceField);
                if (value !== undefined && value !== null) {
                    duplicateConditions.push({ [dbField]: value });
                }
            }
        }

        const existing = duplicateConditions.length
            ? await Primitive.find({
                workspaceId: primitive.workspaceId,
                referenceId: duplicateConfig.resultCategoryId ?? DEFAULT_RESULT_CATEGORY,
                deleted: { $ne: true },
                $or: duplicateConditions
            }, { _id: 1, parentPrimitives: 1 }).lean()
            : [];

        if (existing.length) {
            for (const doc of existing) {
                if (!Object.keys(doc.parentPrimitives ?? {}).includes(primitive.id)) {
                    await addRelationship(primitive.id, doc._id, 'auto');
                    await addRelationship(primitive.id, doc._id, 'alt_origin');
                }
            }
            continue;
        }

        const newPrim = await createPrimitive({
            workspaceId: primitive.workspaceId,
            parent: primitive.id,
            paths: parentPaths,
            data: {
                type: 'result',
                referenceId: duplicateConfig.resultCategoryId ?? DEFAULT_RESULT_CATEGORY,
                title: mapped.title,
                referenceParameters: referenceParams
            }
        });

        if (newPrim) {
            created.push(newPrim);
        }
    }

    if (!created.length) {
        return [];
    }

    const categoryIds = Array.from(new Set(created.map((doc) => doc.referenceId).filter(Boolean)));
    const categories = categoryIds.length ? await Category.find({ id: { $in: categoryIds } }) : [];
    const categoryMap = new Map(categories.map((cat) => [cat.id, cat]));

    const processed = await runPostCreateHooks(created, { categoryMap });

    return processed;
}

export async function handleCollection(primitive, options = {}) {
    const api = options.api ?? DEFAULT_API;
    const fieldBase = `processing.coresignal.${api}`;
    const collectionId = primitive.processing?.coresignal?.[api]?.collectionId;
    if (!collectionId) {
        console.log(`No Coresignal collection ID for ${primitive.id}`);
        return [];
    }

    const headers = getCoresignalHeaders();
    const body = {
        search_request_id: collectionId
    };

    if (options.token) {
        body.pagination_token = options.token;
    }
    if (options.limit) {
        body.limit = options.limit;
    }

    const response = await axios.post(CORESIGNAL_COLLECT_URL, body, { headers });
    const data = response.data ?? {};

    if (collectStatusIsPending(data.status)) {
        return {
            reschedule: async (parent) => {
                await BrightDataQueue().scheduleCollection(primitive, {
                    api,
                    provider: 'coresignal',
                    token: options.token,
                    parent
                }, true);
            }
        };
    }

    const profiles = extractProfiles(data);
    const duplicateConfig = primitive.processing?.coresignal?.[api]?.config ?? {};
    const created = await createProfiles(primitive, profiles, duplicateConfig);

    const nextToken = nextTokenFromResponse(data);
    if (nextToken) {
        await dispatchControlUpdate(primitive.id, `${fieldBase}.nextToken`, nextToken);
        return {
            reschedule: async (parent) => {
                await BrightDataQueue().scheduleCollection(primitive, {
                    api,
                    provider: 'coresignal',
                    token: nextToken,
                    parent
                }, true);
            }
        };
    }

    return created;
}

export default {
    queryCoresignalPersonSearch,
    handleCollection
};
