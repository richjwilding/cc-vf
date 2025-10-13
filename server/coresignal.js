import mongoose from 'mongoose';
import axios from 'axios';
import { gunzipSync } from 'node:zlib';
import Primitive from './model/Primitive.js';
import Category from './model/Category.js';
import { SIO } from './socket.js';
import { addRelationship, BrightDataQueue, dispatchControlUpdate, flattenPath, getNestedValue, getNextSequenceBlock, runPostCreateHooks } from './SharedFunctions.js';
import { normaliseDomain } from './actions/SharedTransforms.js';

const CORESIGNAL_BASE_URL = 'https://api.coresignal.com';
const CORESIGNAL_BULK_ES_DSL_URL = `${CORESIGNAL_BASE_URL}/cdapi/v2/data_requests/employee_multi_source/es_dsl`;
const CORESIGNAL_DATA_REQUEST_BASE_URL = `${CORESIGNAL_BASE_URL}/cdapi/v2/data_requests`;
const CORESIGNAL_COMPANY_MULTI_SOURCE_URL =
    process.env.CORESIGNAL_COMPANY_MULTI_SOURCE_URL
    ?? `${CORESIGNAL_BASE_URL}/cdapi/v2/company_multi_source/enrich`;

const DEFAULT_RESULT_CATEGORY = 58;
const DEFAULT_API = 'person_search';
const DEFAULT_PAGE_SIZE = 50;
const DEFAULT_BULK_BATCH_SIZE = 50;
const DEFAULT_BULK_LIMIT = 25;

function getCoresignalHeaders() {
    const apiKey = process.env.CORESIGNAL_API_KEY || process.env.CORESIGNAL_KEY;
    if (!apiKey) {
        throw new Error('CORESIGNAL_API_KEY is not configured');
    }
    return {
        'apikey': apiKey,
        'accept': 'application/json'
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

function ensureAbsoluteUrl(raw) {
    if (!raw || typeof raw !== 'string') {
        return undefined;
    }
    const trimmed = raw.trim();
    if (!trimmed) {
        return undefined;
    }
    if (/^https?:\/\//i.test(trimmed)) {
        return trimmed;
    }
    return `https://${trimmed.replace(/^\/+/, '')}`;
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
        activity: source.activity,
        location: source.location_name || currentExperience?.location_name,
        profile: profileUrl,
        imageUrl: source.picture_url,
        company: currentExperience?.company_name,
        company_domain: currentExperience?.company_website?.domain_only,
        company_id: currentExperience?.company_id,
        start_date: currentExperience?.start_date,
        end_date: currentExperience?.end_date,
        experience: experiences,
        education: source.education,
        skills: source.skills || source.inferred_skills,
        summary: source.summary,
        source: 'coresignal',
        raw: source
    };

    return {
        title,
        referenceParameters
    };
}

export async function fetchCoresignalCompanyProfile(identifiers = {}, options = {}) {
    const {
        website,
        url,
        domain
    } = identifiers ?? {};

    const normalizedDomain = normaliseDomain(domain);
    const normalizedWebsite =
        ensureAbsoluteUrl(website)
        ?? ensureAbsoluteUrl(url)
        ?? (normalizedDomain ? ensureAbsoluteUrl(normalizedDomain) : undefined);

    if (!normalizedWebsite) {
        throw new Error('Coresignal company profile enrichment requires a company website URL');
    }

    const params = {
        website: normalizedWebsite,
        ...(options.params ?? {})
    };

    if (options.includeRaw === true) {
        params.include_raw = 'true';
    }

    const endpoint = options.endpoint ?? CORESIGNAL_COMPANY_MULTI_SOURCE_URL;
    const headers = getCoresignalHeaders();

    let response;
    try {
        response = await axios.get(endpoint, {
            headers,
            params,
            validateStatus: (status) => status < 500
        });
    } catch (error) {
        console.error('Failed to request Coresignal company profile', error?.response?.data ?? error);
        throw error;
    }

    if (response.status === 404 || response.status === 204) {
        return null;
    }

    if (response.status >= 400) {
        const message = response.data?.message || response.statusText || 'Unknown error';
        throw new Error(`Coresignal company profile request failed (${response.status}): ${message}`);
    }

    return response.data ?? null;
}

function toISODate(value) {
    if (!value) {
        return null;
    }
    const trimmed = typeof value === 'string' ? value.trim() : value;
    if (!trimmed) {
        return null;
    }
    const parsed = new Date(trimmed);
    if (!Number.isNaN(parsed.getTime())) {
        return parsed.toISOString();
    }
    const fallback = new Date(`${trimmed}T00:00:00Z`);
    return Number.isNaN(fallback.getTime()) ? null : fallback.toISOString();
}

function normalizeCurrencyCode(value) {
    if (!value || typeof value !== 'string') {
        return null;
    }
    if( value === "$"){
        return "USD"
    }
    const code = value.trim().toUpperCase();
    return /^[A-Z]{3}$/.test(code) ? code : null;
}

function normalizeAmount(value) {
    if (value === null || value === undefined) {
        return null;
    }
    const num = Number(value);
    if (!Number.isFinite(num) || num < 0) {
        return null;
    }
    return num;
}

function normalizeRoundType(value) {
    if (!value || typeof value !== 'string') {
        return null;
    }
    const base = value.trim().toLowerCase();
    if (!base) {
        return null;
    }
    const replacements = {
        'seed round': 'seed',
        'seed': 'seed',
        'pre seed': 'pre_seed',
        'pre-seed': 'pre_seed',
        'series a': 'series_a',
        'series b': 'series_b',
        'series c': 'series_c',
        'series d': 'series_d',
        'series e': 'series_e',
        'series f': 'series_f',
        'series g': 'series_g',
        'series h': 'series_h',
        'series i': 'series_i',
        'series j': 'series_j',
        'angel': 'angel',
        'convertible note': 'convertible_note',
        'debt financing': 'debt_financing',
        'equity crowdfunding': 'equity_crowdfunding',
        'grant': 'grant',
        'initial coin offering': 'ico',
        'post-ipo debt': 'post_ipo_debt',
        'post-ipo equity': 'post_ipo_equity',
        'post-ipo secondary': 'post_ipo_secondary',
        'private equity': 'private_equity',
        'corporate round': 'corporate_round',
        'secondary market': 'secondary_market',
        'product crowdfunding': 'product_crowdfunding',
        'venture - series unknown': 'venture_round',
        'venture round': 'venture_round',
        'ipo': 'ipo',
        'grant round': 'grant'
    };
    if (replacements[base]) {
        return replacements[base];
    }
    return base
        .replace(/[^a-z0-9\s]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .replace(/\s/g, '_') || null;
}

function toMonthIsoDate(value) {
    if (!value) {
        return null;
    }
    const trimmed = `${value}`.trim();
    if (!trimmed) {
        return null;
    }
    if (/^\d{4}-\d{2}$/.test(trimmed)) {
        return `${trimmed}-01T00:00:00.000Z`;
    }
    if (/^\d{6}$/.test(trimmed)) {
        const year = trimmed.slice(0, 4);
        const month = trimmed.slice(4, 6);
        return `${year}-${month}-01T00:00:00.000Z`;
    }
    return toISODate(trimmed);
}

function mapCoresignalInvestorList(rawList, { lead = false } = {}) {
    if (!Array.isArray(rawList)) {
        return [];
    }
    return rawList
        .map((item) => {
            if (!item) {
                return null;
            }
            if (typeof item === 'string') {
                const trimmed = item.trim();
                if (!trimmed) {
                    return null;
                }
                return {
                    id: null,
                    name: trimmed,
                    type: null,
                    lead: lead ? true : null,
                    permalink: null,
                    image_id: null
                };
            }
            if (typeof item === 'object') {
                const id = item.id ?? item.investor_id ?? null;
                const rawName = item.name ?? item.value ?? item.company_name ?? null;
                const name = typeof rawName === 'string' ? rawName.trim() : rawName;
                const permalink = item.permalink ?? item.url ?? null;
                const type = item.type ?? null;
                const leadFlag = lead || item.lead === true || item.lead_investor === true;
                return {
                    id: id ?? null,
                    name: name ?? null,
                    type: type ?? null,
                    lead: leadFlag ? true : (item.lead === false || item.lead_investor === false ? false : null),
                    permalink: permalink ?? null,
                    image_id: item.image_id ?? null
                };
            }
            return null;
        })
        .filter((entry) => entry?.name);
}

function mapCoresignalFundingRounds(rawList) {
    if (!Array.isArray(rawList)) {
        return [];
    }
    return rawList
        .map((raw) => {
            if (!raw) {
                return null;
            }
            const amountValue = normalizeAmount(raw.amount_raised ?? raw.amount ?? raw.value);
            const amountUsd = normalizeAmount(raw.amount_raised_usd ?? raw.amount_raised_value_usd ?? raw.value_usd);
            const currency = normalizeCurrencyCode(raw.amount_raised_currency ?? raw.currency);
            const leadInvestors = mapCoresignalInvestorList(raw.lead_investors, { lead: true });
            const investors = (() => {
                const list = mapCoresignalInvestorList(raw.investors, { lead: false });
                if (list.length) {
                    return list;
                }
                return leadInvestors.map((item) => ({ ...item, lead: item.lead ?? true }));
            })();
            return {
                round_id: raw.id ?? raw.round_id ?? null,
                round_uuid: raw.uuid ?? null,
                title: raw.name ?? raw.round_name ?? null,
                type: normalizeRoundType(raw.type ?? raw.round_type ?? raw.name),
                announced_on: toISODate(raw.announced_date ?? raw.announced_on ?? raw.date),
                money_raised: {
                    value: amountValue,
                    currency,
                    value_usd: amountUsd ?? (currency === 'USD' ? amountValue : null)
                },
                investors,
                lead_investors: leadInvestors,
                artifacts: {
                    image_id: raw.image_id ?? null,
                    transaction_name: raw.transaction_name ?? raw.name ?? null
                }
            };
        })
        .filter(Boolean)
        .sort((a, b) => {
            const timeA = a.announced_on ? Date.parse(a.announced_on) : Number.NEGATIVE_INFINITY;
            const timeB = b.announced_on ? Date.parse(b.announced_on) : Number.NEGATIVE_INFINITY;
            if (timeA === timeB) {
                return 0;
            }
            return timeB - timeA;
        });
}

function aggregateTotalsByCurrency(rounds) {
    const totals = new Map();
    for (const round of rounds) {
        const currency = round?.money_raised?.currency;
        const value = round?.money_raised?.value;
        if (!currency || value === null || value === undefined) {
            continue;
        }
        const normalizedCurrency = currency.toUpperCase();
        const prev = totals.get(normalizedCurrency) ?? 0;
        totals.set(normalizedCurrency, prev + value);
    }
    return totals;
}

function mapCoresignalMonthlySeries(rawList, valueKeys = [], dateKeys = []) {
    if (!Array.isArray(rawList)) {
        return [];
    }
    return rawList
        .map((item) => {
            if (!item) {
                return null;
            }
            const dateValue = dateKeys
                .map((key) => (key && item[key] !== undefined ? item[key] : undefined))
                .find((value) => value !== undefined && value !== null);
            const normalizedDate = toMonthIsoDate(dateValue ?? item.date);
            if (!normalizedDate) {
                return null;
            }
            const rawValue = valueKeys
                .map((key) => (key && item[key] !== undefined ? item[key] : undefined))
                .find((value) => value !== undefined && value !== null);
            const numericValue = normalizeAmount(rawValue ?? item.value ?? item.count ?? item.total_website_visits);
            if (numericValue === null) {
                return null;
            }
            return {
                date: normalizedDate,
                value: numericValue,
                count: numericValue
            };
        })
        .filter(Boolean)
        .sort((a, b) => Date.parse(a.date) - Date.parse(b.date));
}

export function buildCoresignalCompanySignals(record = {}, options = {}) {
    const fetchedAt = new Date().toISOString();
    const provenance = {
        source: 'coresignal.company_multi_source',
        fetched_at: fetchedAt
    };

    const rounds = mapCoresignalFundingRounds(record?.funding_rounds);
    const totalsByCurrency = aggregateTotalsByCurrency(rounds);
    const numFundingRounds = normalizeAmount(record?.num_funding_rounds);
    const lastRoundAmount = normalizeAmount(record?.last_funding_round_amount_raised);
    const lastRoundCurrency = normalizeCurrencyCode(record?.last_funding_round_amount_raised_currency);
    const lastRoundDate = toISODate(record?.last_funding_round_announced_date);
    const lastRoundType = normalizeRoundType(record?.last_funding_round_type);
    const lastRoundInvestors = mapCoresignalInvestorList(record?.last_funding_round_lead_investors, { lead: true });
    const totalUsd = totalsByCurrency.has('USD') ? totalsByCurrency.get('USD') : null;

    const fundingSummary = {
        round_count: Number.isFinite(numFundingRounds) ? numFundingRounds : rounds.length,
        total_raised_usd: totalUsd,
        last_round_date: lastRoundDate ?? null,
        last_round_type: lastRoundType ?? null,
        last_round_name: record?.last_funding_round_name ?? null,
        last_round_amount: lastRoundAmount !== null
            ? {
                value: lastRoundAmount,
                currency: lastRoundCurrency ?? null
            }
            : null,
        last_round_lead_investors: lastRoundInvestors,
        total: rounds.reduce((a,d)=>a + (d.money_raised?.value_usd ?? 0), 0)
    };

    if (totalsByCurrency.size) {
        fundingSummary.total_raised_by_currency = Array.from(totalsByCurrency.entries())
            .map(([currency, value]) => ({ currency, value }));
    }

    const funding = {
        summary: fundingSummary,
        rounds,
        provenance
    };

    const employeesSeries = mapCoresignalMonthlySeries(
        record?.employees_count_by_month,
        ['employees_count', 'employee_count', 'count', 'value'],
        ['date']
    );
    const employeesCurrent =
        normalizeAmount(record?.employees_count_change?.current) ??
        normalizeAmount(record?.employees_count) ??
        (employeesSeries.length ? employeesSeries[employeesSeries.length - 1].count : null);
    const employeesChange = record?.employees_count_change
        ? { ...record.employees_count_change }
        : null;

    const followersSeries = mapCoresignalMonthlySeries(
        record?.professional_network_followers_count_by_month ?? record?.linkedin_followers_count_by_month,
        ['follower_count', 'followers_count', 'value', 'count'],
        ['date']
    );
    const followersCurrent =
        normalizeAmount(record?.professional_network_followers_count_change?.current) ??
        normalizeAmount(record?.followers_count_professional_network) ??
        (followersSeries.length ? followersSeries[followersSeries.length - 1].count : null);
    const followersChange = record?.professional_network_followers_count_change
        ? { ...record.professional_network_followers_count_change }
        : record?.linkedin_followers_count_change
            ? { ...record.linkedin_followers_count_change }
            : null;

    const companySignals = {
        funding,
        employees: {
            current: employeesCurrent ?? null,
            by_month: employeesSeries,
            change: employeesChange
        },
        linkedin_followers: {
            current: followersCurrent ?? null,
            by_month: followersSeries,
            change: followersChange
        },
        provenance
    };

    const result = {
        companySignals,
        investment: funding,
        provenance
    };

    if (options.includeRaw) {
        result.raw = record;
    }

    return result;
}

export async function queryCoresignalPersonSearch(primitive, terms, {origin,...callopts} = {}) {
    if (!origin || origin.type !== 'entity' || origin.referenceId !== 29) {
        throw new Error('Coresignal person search can only be used with organization entities');
    }

    const config = callopts.config ?? {};

    const domainFromConfig = normaliseDomain(config.domain);
    const domainFromReference = normaliseDomain(origin.referenceParameters?.domain);
    const domainFromUrl = normaliseDomain(origin.referenceParameters?.url);
    const domain = domainFromConfig || domainFromReference || domainFromUrl || normaliseDomain(terms?.split(',')[0]);

    const requestedCountFromCall = Number.isFinite(callopts.count) && callopts.count > 0 ? Math.floor(callopts.count) : undefined;
    const requestedCountFromConfig = Number.isFinite(config.count) && config.count > 0 ? Math.floor(config.count) : undefined;
    const requestedCount = requestedCountFromCall ?? requestedCountFromConfig ?? DEFAULT_BULK_LIMIT;
    const limit = requestedCount > 0 ? Math.min(requestedCount, 100) : DEFAULT_BULK_LIMIT;

    const esDslQuery = buildSearchQuery({
        domain,
        terms: config.terms ?? terms,
        titles: config.titles ?? config.roles ?? [],
        locations: config.locations ?? config.location,
        seniorities: config.seniorities ?? config.seniority,
        functions: config.functions ?? config.departments
    });

    if (limit && Number.isFinite(limit) && limit > 0) {
        esDslQuery.size = Math.min(limit, esDslQuery.size ?? limit);
    }

    const payload = {
        limit,
        es_dsl_query: esDslQuery
    };

    const headers = getCoresignalHeaders();
    const response = await axios.post(CORESIGNAL_BULK_ES_DSL_URL, payload, {
        headers,
        validateStatus: (status) => status < 500
    });

    if (response.status >= 400) {
        const message = response.data?.message || response.statusText || 'Unknown error';
        throw new Error(`Coresignal bulk request failed (${response.status}): ${message}`);
    }

    const responseData = response.data ?? {};
    const collectionId = responseData.request_id || responseData.id || responseData.search_request_id || responseData.search_id;
    if (!collectionId) {
        throw new Error('Coresignal search did not return a collection identifier');
    }

    const locationHeader = response.headers?.location ?? response.headers?.Location;
    const filesPath = typeof locationHeader === 'string' && locationHeader.trim().length
        ? locationHeader.trim()
        : `/cdapi/v2/data_requests/${collectionId}/files`;

    const api = callopts.api ?? DEFAULT_API;
    const fieldBase = `processing.coresignal.${api}`;

    const duplicateConfig = {
        resultCategoryId: callopts.source?.resultCategoryId ?? DEFAULT_RESULT_CATEGORY,
        primaryField: callopts.source?.primaryField ?? 'id',
        importField: callopts.source?.importField ?? 'referenceParameters.id',
        limit,
        additionalDuplicateCheck: callopts.source?.additionalDuplicateCheck ?? []
    };

    await dispatchControlUpdate(primitive.id, `${fieldBase}.query`, esDslQuery);
    await dispatchControlUpdate(primitive.id, `${fieldBase}.collectionId`, collectionId);
    await dispatchControlUpdate(primitive.id, `${fieldBase}.filesPath`, filesPath);
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
    return [
        'pending',
        'processing',
        'in_progress',
        'running',
        'collecting',
        'building',
        'queued',
        'generating',
        'requested',
        'building_files',
        'collecting_files'
    ].includes(normalized);
}

function resolveCoresignalUrl(pathOrUrl) {
    if (!pathOrUrl || typeof pathOrUrl !== 'string') {
        return undefined;
    }
    if (/^https?:\/\//i.test(pathOrUrl)) {
        return pathOrUrl;
    }
    if (pathOrUrl.startsWith('/')) {
        return `${CORESIGNAL_BASE_URL}${pathOrUrl}`;
    }
    return `${CORESIGNAL_BASE_URL}/${pathOrUrl}`;
}

function getHeader(headers = {}, key) {
    const lowerKey = key.toLowerCase();
    for (const headerKey of Object.keys(headers)) {
        if (headerKey.toLowerCase() === lowerKey) {
            return headers[headerKey];
        }
    }
    return undefined;
}

function decodeCoresignalFilePayload(response) {
    if (!response) {
        return undefined;
    }

    const { data, headers } = response;
    if (data === undefined || data === null) {
        return undefined;
    }

    if (Array.isArray(data)) {
        return data;
    }

    if (typeof data === 'object' && !Buffer.isBuffer(data) && !(data instanceof ArrayBuffer)) {
        return data;
    }

    const buffer = Buffer.isBuffer(data) ? data : Buffer.from(data);

    const encoding = `${getHeader(headers, 'content-encoding') ?? ''}`.toLowerCase();
    const contentType = `${getHeader(headers, 'content-type') ?? ''}`.toLowerCase();
    const contentDisposition = `${getHeader(headers, 'content-disposition') ?? ''}`.toLowerCase()


    let decodedBuffer = buffer;
    if (encoding.includes('gzip') || contentType.includes('gzip') || contentDisposition.includes(".gz")) {
        try {
            decodedBuffer = gunzipSync(buffer);
        } catch (error) {
            console.error('Failed to gunzip Coresignal file', error);
            decodedBuffer = buffer;
        }
    }

    if (decodedBuffer.length === 0) {
        return undefined;
    }

    if (decodedBuffer.length >= 2 && decodedBuffer[0] === 0x50 && decodedBuffer[1] === 0x4b) {
        console.warn('Coresignal file returned ZIP archive which is not currently supported');
        return undefined;
    }

    const text = decodedBuffer.toString('utf8').trim();
    if (!text) {
        return undefined;
    }

    try {
        return JSON.parse(text);
    } catch {
        const lines = text.split(/\r?\n/).map((line) => line.trim()).filter((line) => line.length);
        const parsedLines = [];
        for (const line of lines) {
            try {
                parsedLines.push(JSON.parse(line));
            } catch {
                // ignore non-JSON lines
            }
        }
        if (parsedLines.length) {
            return parsedLines;
        }
    }

    return undefined;
}

function normalizeCoresignalFileUrl(requestId, rawPathOrUrl) {
    if (!rawPathOrUrl) {
        return undefined;
    }
    if (typeof rawPathOrUrl === 'string' && /^https?:\/\//i.test(rawPathOrUrl)) {
        return rawPathOrUrl;
    }
    let path = typeof rawPathOrUrl === 'string'
        ? rawPathOrUrl
        : rawPathOrUrl?.path || rawPathOrUrl?.file_name || rawPathOrUrl?.fileName || rawPathOrUrl?.key;

    if (!path) {
        return undefined;
    }

    if (path.startsWith('/')) {
        return resolveCoresignalUrl(path);
    }

    const segments = String(path).split('/').map((segment) => encodeURIComponent(segment));
    return `${CORESIGNAL_DATA_REQUEST_BASE_URL}/${requestId}/files/${segments.join('/')}`;
}

async function fetchCoresignalFileContent(requestId, descriptor, headers) {
    if (!descriptor) {
        return { pending: false, data: [] };
    }

    const descriptorStatus = typeof descriptor === 'object'
        ? descriptor.status ?? descriptor.state ?? descriptor.stage
        : undefined;

    if (collectStatusIsPending(descriptorStatus)) {
        return { pending: true, data: [] };
    }

    const downloadUrl =
        resolveCoresignalUrl(
            typeof descriptor === 'object'
                ? descriptor.download_url ?? descriptor.url ?? descriptor.file_url
                : undefined
        ) || normalizeCoresignalFileUrl(requestId, descriptor);

    const fileId = typeof descriptor === 'object'
        ? descriptor.id ?? descriptor.file_id ?? descriptor.fileId
        : undefined;

    const axiosConfig = {
        headers,
        responseType: 'arraybuffer',
        validateStatus: (status) => status < 500
    };

    let response;
    if (downloadUrl) {
        response = await axios.get(downloadUrl, axiosConfig);
    } else if (fileId) {
        const fileUrl = `${CORESIGNAL_DATA_REQUEST_BASE_URL}/${requestId}/files/${encodeURIComponent(fileId)}`;
        response = await axios.get(fileUrl, axiosConfig);
    } else {
        return { pending: false, data: [] };
    }

    if (response.status === 202) {
        return { pending: true, data: [] };
    }

    if (response.status >= 400) {
        const message = response.data?.message || response.statusText || 'Unknown error';
        throw new Error(`Coresignal file download failed (${response.status}): ${message}`);
    }

    const decoded = decodeCoresignalFilePayload(response);
    if (decoded === undefined) {
        return { pending: false, data: [] };
    }

    const profiles = Array.isArray(decoded) ? decoded : extractProfiles(decoded);
    return {
        pending: false,
        data: Array.isArray(profiles) ? profiles : []
    };
}

async function createProfiles(primitive, profiles, duplicateConfig) {
    if (!profiles.length) {
        return [];
    }

    const parentPathKeys = ['origin', 'auto'];
    const parentPaths = parentPathKeys.map((path) => flattenPath(path));
    const resultCategoryId = duplicateConfig.resultCategoryId ?? DEFAULT_RESULT_CATEGORY;
    const primaryDuplicateField = duplicateConfig.importField ?? 'referenceParameters.id';
    const additionalDuplicateChecks = Array.isArray(duplicateConfig.additionalDuplicateCheck)
        ? duplicateConfig.additionalDuplicateCheck
        : [];

    let remainingLimit;
    if (Number.isFinite(duplicateConfig.limit) && duplicateConfig.limit > 0) {
        remainingLimit = Math.max(Math.floor(duplicateConfig.limit), 0);
    }

    const lookupMap = new Map();
    const lookupFields = new Set();

    const candidates = [];
    for (const profile of profiles) {
        const mapped = mapProfileToPrimitive(profile);
        if (!mapped) {
            continue;
        }

        const referenceParameters = mapped.referenceParameters ?? {};
        const duplicateChecks = [];
        const queryKeys = [];

        const primaryValue = primaryDuplicateField.startsWith('referenceParameters.')
            ? getNestedValue(referenceParameters, primaryDuplicateField.replace('referenceParameters.', ''))
            : getNestedValue(mapped, primaryDuplicateField);

        if (primaryValue !== undefined && primaryValue !== null) {
            duplicateChecks.push({ field: primaryDuplicateField, value: primaryValue });
            lookupFields.add(primaryDuplicateField);
            const key = `${primaryDuplicateField}|${JSON.stringify(primaryValue)}`;
            if (!lookupMap.has(key)) {
                lookupMap.set(key, { field: primaryDuplicateField, value: primaryValue });
            }
            queryKeys.push(key);
        }

        for (const rule of additionalDuplicateChecks) {
            if (!Array.isArray(rule) || rule.length < 2) {
                continue;
            }
            const [dbField, sourceField] = rule;
            const value = typeof sourceField === 'string' && sourceField.startsWith('referenceParameters.')
                ? getNestedValue(referenceParameters, sourceField.replace('referenceParameters.', ''))
                : getNestedValue(mapped, sourceField);
            if (value === undefined || value === null) {
                continue;
            }
            duplicateChecks.push({ field: dbField, value });
            lookupFields.add(dbField);
            const key = `${dbField}|${JSON.stringify(value)}`;
            if (!lookupMap.has(key)) {
                lookupMap.set(key, { field: dbField, value });
            }
            queryKeys.push(key);
        }

        candidates.push({
            mapped,
            referenceParameters,
            duplicateChecks,
            queryKeys
        });
    }

    if (!candidates.length) {
        return [];
    }

    const lookupConditions = Array.from(lookupMap.values()).map(({ field, value }) => ({ [field]: value }));

    const projection = { _id: 1, parentPrimitives: 1 };
    for (const field of lookupFields) {
        projection[field] = 1;
    }

    const existingDocs = lookupConditions.length
        ? await Primitive.find({
            workspaceId: primitive.workspaceId,
            referenceId: resultCategoryId,
            type: 'result',
            deleted: { $ne: true },
            $or: lookupConditions
        }, projection).lean()
        : [];

    const matchMap = new Map();
    if (existingDocs.length) {
        for (const doc of existingDocs) {
            for (const field of lookupFields) {
                const docValue = getNestedValue(doc, field);
                if (docValue === undefined || docValue === null) {
                    continue;
                }
                const key = `${field}|${JSON.stringify(docValue)}`;
                if (!matchMap.has(key)) {
                    matchMap.set(key, []);
                }
                matchMap.get(key).push(doc);
            }
        }
    }

    const docsNeedingLink = new Map();
    const newCandidates = [];

    for (const candidate of candidates) {
        const matchedDocs = new Set();

        for (const key of candidate.queryKeys) {
            const docsForKey = matchMap.get(key);
            if (!docsForKey || !docsForKey.length) {
                continue;
            }

            for (const doc of docsForKey) {
                const docId = doc._id.toString();
                if (matchedDocs.has(docId)) {
                    continue;
                }

                matchedDocs.add(docId);
                const existingPaths = doc.parentPrimitives?.[primitive.id] ?? [];
                const hasAuto = existingPaths?.includes('primitives.auto');
                const hasAltOrigin = existingPaths?.includes('primitives.alt_origin');

                if (!hasAuto || !hasAltOrigin) {
                    const entry = docsNeedingLink.get(docId) ?? { docId, paths: new Set() };
                    if (!hasAuto) {
                        entry.paths.add('auto');
                    }
                    if (!hasAltOrigin) {
                        entry.paths.add('alt_origin');
                    }
                    docsNeedingLink.set(docId, entry);
                }
            }
        }

        if (!matchedDocs.size) {
            newCandidates.push(candidate);
        }
    }

    for (const { docId, paths } of docsNeedingLink.values()) {
        const pathList = Array.from(paths);
        if (!pathList.length) {
            continue;
        }
        await addRelationship(primitive.id, docId, pathList);
    }

    if (!newCandidates.length || (remainingLimit !== undefined && remainingLimit <= 0)) {
        return [];
    }

    const creationCandidates = remainingLimit !== undefined
        ? newCandidates.slice(0, remainingLimit)
        : newCandidates;

    if (!creationCandidates.length) {
        return [];
    }

    const batchSizeEnv = Number(process.env.CORESIGNAL_BULK_BATCH_SIZE);
    const batchSize = Number.isFinite(batchSizeEnv) && batchSizeEnv > 0 ? Math.floor(batchSizeEnv) : DEFAULT_BULK_BATCH_SIZE;

    const categories = await Category.find({ id: { $in: [resultCategoryId] } });
    const categoryMap = new Map(categories.map((cat) => [cat.id, cat]));
    const created = [];

    for (let offset = 0; offset < creationCandidates.length; offset += batchSize) {
        const batchItems = creationCandidates.slice(offset, offset + batchSize);
        if (!batchItems.length) {
            continue;
        }

        const rawDocs = batchItems.map((item) => ({
            type: 'result',
            referenceId: resultCategoryId,
            title: item.mapped.title,
            referenceParameters: item.referenceParameters
        }));

        const { start: plainStart } = await getNextSequenceBlock('base', rawDocs.length);

        const docs = rawDocs.map((source, idx) => ({
            workspaceId: primitive.workspaceId,
            primitives: {},
            metrics: {},
            parentPrimitives: {
                [primitive.id]: [...parentPaths]
            },
            flowElement: primitive.type === 'flow',
            ...source,
            referenceParameters: source.referenceParameters ?? {},
            plainId: plainStart + idx
        }));

        const session = await mongoose.startSession();
        let insertedDocs = [];
        try {
            await session.withTransaction(async () => {
                insertedDocs = await Primitive.insertMany(docs, { session });
                if (!insertedDocs.length) {
                    return;
                }

                const childIds = insertedDocs.map((doc) => doc._id.toString());
                const updateOps = parentPaths.map((path) => ({
                    updateOne: {
                        filter: { _id: primitive.id },
                        update: { $addToSet: { [path]: { $each: childIds } } }
                    }
                }));

                if (updateOps.length) {
                    await Primitive.bulkWrite(updateOps, { session });
                }
            });
        } catch (err) {
            console.error(`Failed to insert Coresignal batch for primitive ${primitive.id}`, err);
            await session.abortTransaction().catch(() => {});
            session.endSession();
            throw err;
        }
        session.endSession();

        if (!insertedDocs.length) {
            continue;
        }

        const postProcessed = await runPostCreateHooks(insertedDocs, { categoryMap });
        created.push(...postProcessed);

        SIO.notifyPrimitiveEvent(primitive.workspaceId, [{
            type: 'new_primitives',
            data: insertedDocs
        }]);

        const relationshipEvents = [];
        for (const doc of insertedDocs) {
            for (const path of parentPaths) {
                relationshipEvents.push({
                    type: 'add_relationship',
                    id: primitive.id,
                    target: doc.id,
                    path
                });
            }
        }
        if (relationshipEvents.length) {
            SIO.notifyPrimitiveEvent(primitive.workspaceId, relationshipEvents);
        }
    }

    return created;
}

export async function handleCollection(primitive, options = {}) {
    const api = options.api ?? DEFAULT_API;
    const collectionId = primitive.processing?.coresignal?.[api]?.collectionId;
    if (!collectionId) {
        console.log(`No Coresignal collection ID for ${primitive.id}`);
        return [];
    }

    const headers = getCoresignalHeaders();
    const filesPath = primitive.processing?.coresignal?.[api]?.filesPath;
    const filesUrl = resolveCoresignalUrl(filesPath) ?? `${CORESIGNAL_DATA_REQUEST_BASE_URL}/${collectionId}/files`;

    let response;
    try {
        response = await axios.get(filesUrl, {
            headers,
            validateStatus: (status) => status < 500
        });
    } catch (error) {
        console.error('Failed to fetch Coresignal files list', error?.response?.data ?? error);
        throw error;
    }

    if (response.status === 202) {
        return {
            reschedule: async (parent) => {
                await BrightDataQueue().scheduleCollection(primitive, {
                    api,
                    provider: 'coresignal',
                    parent
                }, true);
            }
        };
    }

    const payload = response.data ?? {};
    const payloadStatus = payload.status ?? payload.state ?? payload.request_status ?? payload.processing_status;

    if (collectStatusIsPending(payloadStatus)) {
        return {
            reschedule: async (parent) => {
                await BrightDataQueue().scheduleCollection(primitive, {
                    api,
                    provider: 'coresignal',
                    parent
                }, true);
            }
        };
    }

    const fileDescriptors = Array.isArray(payload.files)
        ? payload.files
        : Array.isArray(payload.data_request_files)
            ? payload.data_request_files
            : Array.isArray(payload.data)
                ? payload.data
                : Array.isArray(payload.items)
                    ? payload.items
                : Array.isArray(payload.results)
                    ? payload.results
                    : Array.isArray(payload)
                        ? payload
                        : [];

    if (!fileDescriptors.length) {
        // Nothing to process yet – treat as pending
        return {
            reschedule: async (parent) => {
                await BrightDataQueue().scheduleCollection(primitive, {
                    api,
                    provider: 'coresignal',
                    parent
                }, true);
            }
        };
    }

    const aggregatedProfiles = [];
    let pendingFiles = false;

    for (const descriptor of fileDescriptors) {
        try {
            const { pending, data } = await fetchCoresignalFileContent(collectionId, descriptor, headers);
            if (pending) {
                pendingFiles = true;
                continue;
            }
            if (Array.isArray(data) && data.length) {
                aggregatedProfiles.push(...data);
            }
        } catch (error) {
            console.error('Failed to process Coresignal file descriptor', error?.response?.data ?? error);
        }
    }

    if (!aggregatedProfiles.length) {
        if (pendingFiles) {
            return {
                reschedule: async (parent) => {
                    await BrightDataQueue().scheduleCollection(primitive, {
                        api,
                        provider: 'coresignal',
                        parent
                    }, true);
                }
            };
        }
        return [];
    }

    const duplicateConfig = primitive.processing?.coresignal?.[api]?.config ?? {};
    const created = await createProfiles(primitive, aggregatedProfiles, duplicateConfig);

    if (pendingFiles) {
        await BrightDataQueue().scheduleCollection(primitive, {
            api,
            provider: 'coresignal',
            parent: options.parent
        }, true);
    }

    return created;
}

export default {
    queryCoresignalPersonSearch,
    handleCollection,
    fetchCoresignalCompanyProfile,
    buildCoresignalCompanySignals
};
