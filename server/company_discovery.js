import axios from 'axios';
import mongoose from "mongoose";
import Primitive from "./model/Primitive";
import Category from "./model/Category";
import { SIO } from "./socket";
import { addRelationship, createPrimitive, dispatchControlUpdate, findResultSetForCategoryId, flattenPath, getNextSequenceBlock, primitivePrimitives, runPostCreateHooks, cosineSimilarity, executeConcurrently } from "./SharedFunctions";
import { triggerBrightDataCollector, registerBrightDataCollector, registerCollectorFilter } from "./brightdata_collectors";
import { getMetaDescriptionFromURL, replicateURLtoStorage, fetchLinksFromWebQuery } from "./google_helper";
import { analyzeListAgainstTopics, analyzeTextAgainstTopics, buildEmbeddings } from "./openai_helper";
import { buildDocumentTextEmbeddings } from "./DocumentSearch";
import { getCompanyInfoFromDomain } from "./task_processor";
import { findEntityResourceUrl } from "./entity_resource_capability";
import "./entity_resources/crunchbase";
import { getLogger } from "./logger";
import { fetchCoresignalCompanyProfile, buildCoresignalCompanySignals } from "./coresignal";

const logger = getLogger("company_discovery", "info");

const BRIGHTDATA_POLL_INTERVAL = parseInt(process.env.BRIGHTDATA_DISCOVER_POLL_INTERVAL ?? "2000", 10);
const BRIGHTDATA_POLL_ATTEMPTS = parseInt(process.env.BRIGHTDATA_DISCOVER_MAX_ATTEMPTS ?? "30", 10);
const INVESTMENT_DATASET_ID = "gd_l1vijqt9jfj7olije";
const INVESTMENT_DATASET_IS_CUSTOM = process.env.BRIGHTDATA_CRUNCHBASE_INVESTMENT_CUSTOM === "true";

function getDatasetId() {
    //return process.env.BRIGHTDATA_COMPANY_DISCOVERY_DATASET_ID;
    return "gd_l1vijqt9jfj7olije"
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

function toISODate(value) {
    if (!value) {
        return null;
    }
    const trimmed = typeof value === "string" ? value.trim() : value;
    if (!trimmed) {
        return null;
    }
    const date = new Date(trimmed);
    if (Number.isNaN(date.getTime())) {
        const fallback = new Date(`${trimmed}T00:00:00Z`);
        return Number.isNaN(fallback.getTime()) ? null : fallback.toISOString();
    }
    return date.toISOString();
}

function normalizeCurrencyCode(value) {
    if (!value || typeof value !== "string") {
        return null;
    }
    const match = value.trim().toUpperCase();
    return /^[A-Z]{3}$/.test(match) ? match : null;
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

function normalizeRoundType(raw) {
    if (!raw || typeof raw !== "string") {
        return null;
    }
    const base = raw.trim().toLowerCase();
    if (!base) {
        return null;
    }
    const replacements = {
        "seed round": "seed",
        "seed": "seed",
        "pre seed": "pre_seed",
        "pre-seed": "pre_seed",
        "series a": "series_a",
        "series b": "series_b",
        "series c": "series_c",
        "series d": "series_d",
        "series e": "series_e",
        "series f": "series_f",
        "series g": "series_g",
        "series h": "series_h",
        "series i": "series_i",
        "series j": "series_j",
        "angel": "angel",
        "convertible note": "convertible_note",
        "debt financing": "debt_financing",
        "equity crowdfunding": "equity_crowdfunding",
        "grant": "grant",
        "initial coin offering": "ico",
        "post-ipo debt": "post_ipo_debt",
        "post-ipo equity": "post_ipo_equity",
        "post-ipo secondary": "post_ipo_secondary",
        "private equity": "private_equity",
        "corporate round": "corporate_round",
        "secondary market": "secondary_market",
        "product crowdfunding": "product_crowdfunding",
        "venture - series unknown": "venture_round",
        "venture round": "venture_round",
        "ipo": "ipo",
        "grant round": "grant"
    };
    if (replacements[base]) {
        return replacements[base];
    }
    const normalized = base
        .replace(/[^a-z0-9\s]/g, " ")
        .replace(/\s+/g, " ")
        .trim()
        .replace(/\s/g, "_");
    return normalized || null;
}

function selectPreferredRoundRecord(existing, next) {
    if (!existing) {
        return next;
    }
    if (!next) {
        return existing;
    }

    const score = (record) => {
        if (!record || typeof record !== "object") {
            return 0;
        }
        let total = 0;
        if (record.announced_on) total += 1;
        if (record.title) total += 1;
        if (record.transaction_name) total += 1;
        if (record.money_raised) {
            if (record.money_raised.value) total += 1;
            if (record.money_raised.value_usd) total += 1;
            if (record.money_raised.currency) total += 1;
        }
        if (Array.isArray(record.investors)) {
            total += record.investors.length;
        }
        if (Array.isArray(record.lead_investors)) {
            total += record.lead_investors.length;
        }
        return total;
    };

    return score(next) > score(existing) ? next : existing;
}

function mapLeadInvestors(rawList) {
    if (!Array.isArray(rawList)) {
        return [];
    }
    return rawList.map(item => ({
        name: item?.name ?? null,
        permalink: item?.permalink ?? null,
        image: item?.image ?? item?.image_id ?? null
    }));
}

function mapInvestors(rawList, leadIndex = { ids: new Set(), names: new Set() }) {
    if (!Array.isArray(rawList)) {
        return [];
    }
    return rawList.map(item => {
        const investor = item?.investor ?? {};
        const id = investor.id ?? item?.id ?? null;
        const name = investor.value ?? investor.name ?? item?.value ?? null;
        const permalink = investor.permalink ?? item?.permalink ?? null;
        const image = investor.image_id ?? item?.image_id ?? null;
        const type = investor.type ?? item?.type ?? null;
        const normalizedId = id ? String(id).toLowerCase() : null;
        const normalizedPermalink = permalink ? String(permalink).toLowerCase() : null;
        const normalizedName = typeof name === "string" ? name.toLowerCase() : null;
        const leadFlag = item?.lead_investor === true ||
            (normalizedId && leadIndex.ids.has(normalizedId)) ||
            (normalizedPermalink && leadIndex.ids.has(normalizedPermalink)) ||
            (normalizedName && leadIndex.names.has(normalizedName));
        return {
            id: id ?? null,
            name: name ?? null,
            type: type ?? null,
            lead: leadFlag ? true : (item?.lead_investor === false ? false : null),
            permalink: permalink ?? null,
            image_id: image ?? null
        };
    });
}

function buildLeadLookup(rawList) {
    const ids = new Set();
    const names = new Set();
    if (Array.isArray(rawList)) {
        for (const item of rawList) {
            if (item?.id) {
                ids.add(String(item.id).toLowerCase());
            }
            if (item?.permalink) {
                ids.add(String(item.permalink).toLowerCase());
            }
            if (item?.name) {
                names.add(item.name.toLowerCase());
            }
        }
    }
    return { ids, names };
}

function mapFundingRoundsList(rawList) {
    if (!Array.isArray(rawList)) {
        return [];
    }

    const byKey = new Map();
    const fallback = [];

    for (const raw of rawList) {
        if (!raw) {
            continue;
        }
        const key = raw.id ?? raw.uuid ?? null;
        if (!key) {
            fallback.push(raw);
            continue;
        }
        const existing = byKey.get(key);
        byKey.set(key, selectPreferredRoundRecord(existing, raw));
    }

    const combined = [...byKey.values(), ...fallback];

    return combined.map(raw => {
        const leadInvestors = mapLeadInvestors(raw?.lead_investors);
        const leadLookup = buildLeadLookup(raw?.lead_investors);
        const investors = mapInvestors(raw?.investors, leadLookup);

        const moneyRaised = raw?.money_raised ?? {};
        const currency = normalizeCurrencyCode(moneyRaised.currency);
        const value = normalizeAmount(moneyRaised.value);
        const valueUsd = normalizeAmount(moneyRaised.value_usd);

        const announcedOn = toISODate(raw?.announced_on);
        let derivedType = raw?.investors?.find?.(item => item?.funding_round?.type)?.funding_round?.type;
        if (!derivedType && raw?.transaction_name) {
            derivedType = raw.transaction_name;
        } else if (!derivedType && raw?.title) {
            derivedType = raw.title;
        }

        return {
            round_id: raw?.id ?? null,
            round_uuid: raw?.uuid ?? null,
            title: raw?.title ?? null,
            type: normalizeRoundType(raw?.type ?? derivedType),
            announced_on: announcedOn,
            money_raised: {
                value,
                currency,
                value_usd: valueUsd
            },
            investors,
            lead_investors: leadInvestors,
            artifacts: {
                image_id: raw?.image_id ?? null,
                transaction_name: raw?.transaction_name ?? null
            }
        };
    }).sort((a, b) => {
        const timeA = a.announced_on ? Date.parse(a.announced_on) : Number.NEGATIVE_INFINITY;
        const timeB = b.announced_on ? Date.parse(b.announced_on) : Number.NEGATIVE_INFINITY;
        if (timeA === timeB) {
            return 0;
        }
        return timeB - timeA;
    });
}

function buildInvestmentSummary(record = {}, rounds = []) {
    const summary = {
        round_count: 0,
        total_raised_usd: 0,
        last_round_date: null,
        last_round_type: null
    };

    const aggregate = record?.funding_rounds ?? {};
    const roundCount = typeof aggregate.num_funding_rounds === "number"
        ? aggregate.num_funding_rounds
        : rounds.length;
    summary.round_count = roundCount ?? 0;

    const totalRaised = rounds.reduce((acc, round) => {
        const valueUsd = round?.money_raised?.value_usd;
        return typeof valueUsd === "number" ? acc + valueUsd : acc;
    }, 0);
    if (totalRaised > 0) {
        summary.total_raised_usd = totalRaised;
    } else {
        const aggregateUsd = normalizeAmount(aggregate?.value?.value_usd);
        summary.total_raised_usd = aggregateUsd ?? 0;
    }

    const lastDate = aggregate?.last_funding_at
        ? toISODate(aggregate.last_funding_at)
        : (rounds[0]?.announced_on ?? null);
    summary.last_round_date = lastDate ?? null;

    const lastTypeRaw = aggregate?.last_funding_type ?? rounds[0]?.type;
    summary.last_round_type = normalizeRoundType(lastTypeRaw) ?? null;

    return summary;
}

function buildInvestmentPayload(record = {}) {
    const rounds = mapFundingRoundsList(record?.funding_rounds_list);
    const summary = buildInvestmentSummary(record, rounds);
    const extractedAt = new Date().toISOString();

    return {
        summary,
        rounds,
        provenance: {
            source: "brightdata.crunchbase",
            extracted_at: extractedAt
        }
    };
}

async function findCompanyURLByNameLogoDevInternal(name, options = {}) {
    try {
        const { data } = await axios.get('https://api.logo.dev/search', {
            params: { q: name },
            headers: {
                Authorization: `Bearer ${process.env.LOGODEV_KEY}`
            }
        });
        if (options.withDescriptions) {
            const described = await executeConcurrently(data ?? [], async (item) => {
                if (!item?.domain) {
                    return undefined;
                }
                try {
                    const info = await getCompanyInfoFromDomain(item.domain);
                    if (!info) {
                        return undefined;
                    }
                    const url = ensureAbsoluteUrl(info.url ?? info.website_url ?? item.url ?? item.domain);
                    return {
                        ...info,
                        domain: info.domain ?? item.domain,
                        url
                    };
                } catch (error) {
                    logger.error(`Error describing company ${item?.domain}`, { error });
                    return undefined;
                }
            });
            return described?.results?.filter(Boolean) ?? [];
        }
        return (data ?? [])
            .filter(Boolean)
            .map(item => {
                const url = ensureAbsoluteUrl(item.url ?? item.domain);
                return {
                    ...item,
                    url
                };
            });
    } catch (error) {
        logger.error(`Error in findCompanyURLByNameLogoDevInternal`, { name, error });
        return [];
    }
}

async function findCompanyURLByNameByApolloInternal(name) {
    try {
        const result = await fetchLinksFromWebQuery(`\"${name}\" site:apollo.io`, { timeFrame: "" });
        if (!result?.links) {
            return undefined;
        }
        const regex = new RegExp(`View ${name} \\((https?:\\/\\/[^\\)]+)\\)`, 'i');
        for (const link of result.links) {
            const match = link.snippet?.match(regex);
            if (match) {
                return match[1];
            }
        }
    } catch (error) {
        logger.error(`Error in findCompanyURLByNameByApolloInternal`, { name, error });
    }
    return undefined;
}

function normalizeLogoDevCandidate(candidate) {
    if (!candidate) {
        return undefined;
    }
    const url = ensureAbsoluteUrl(candidate.url ?? candidate.website_url ?? candidate.domain);
    if (!url) {
        return undefined;
    }
    return {
        ...candidate,
        url,
        domain: normalizeDomain(candidate.domain ?? url) ?? candidate.domain
    };
}

function dedupeCandidatesByUrl(candidates) {
    const seen = new Set();
    const unique = [];
    for (const candidate of candidates ?? []) {
        if (!candidate?.url) {
            continue;
        }
        if (seen.has(candidate.url)) {
            continue;
        }
        seen.add(candidate.url);
        unique.push(candidate);
    }
    return unique;
}

async function scoreCandidatesByTopics(candidates, topics) {
    const enriched = await Promise.all(
        (candidates ?? []).map(async (candidate) => {
            if (!candidate?.url) {
                return candidate;
            }
            if (candidate.meta) {
                return candidate;
            }
            try {
                const meta = await getMetaDescriptionFromURL(candidate.url);
                return meta ? { ...candidate, meta } : candidate;
            } catch (error) {
                logger.error(`Error fetching meta for ${candidate.url}`, { error });
                return candidate;
            }
        })
    );

    const withMeta = enriched.filter(candidate => candidate?.meta);
    if (!withMeta.length) {
        return { candidates: enriched, best: enriched[0] };
    }

    try {
        const analysisPayload = withMeta.map(candidate => ({
            hostname: candidate.url,
            meta: candidate.meta
        }));
        const analysis = await analyzeListAgainstTopics(
            analysisPayload,
            topics,
            { asScore: true, prefix: "Organization", type: "organization" }
        );
        if (analysis?.success && Array.isArray(analysis.output)) {
            const sorted = analysis.output
                .filter(result => result.s >= 2)
                .sort((a, b) => b.s - a.s);
            if (sorted.length) {
                const winner = withMeta[sorted[0].i];
                return { candidates: enriched, best: winner };
            }
        }
    } catch (error) {
        logger.error(`Error scoring company candidates against topics`, { error });
    }

    return { candidates: enriched, best: enriched[0] };
}

export async function findCompanyURL(name, options = {}) {
    const trimmed = name?.trim();
    if (!trimmed) {
        if (options.withDescriptions || options.returnCandidates) {
            return [];
        }
        return undefined;
    }

    const withDescriptions = options.withDescriptions ?? false;
    const returnCandidates = options.returnCandidates ?? false;
    const topics = options.topics;

    const logoDevResults = await findCompanyURLByNameLogoDevInternal(trimmed, { withDescriptions });

    if (withDescriptions) {
        return logoDevResults ?? [];
    }

    const normalizedCandidates = dedupeCandidatesByUrl(
        (logoDevResults ?? []).map(normalizeLogoDevCandidate).filter(Boolean)
    );

    let candidatesForReturn = normalizedCandidates;
    let bestCandidate = normalizedCandidates[0];

    if (topics && normalizedCandidates.length) {
        const scored = await scoreCandidatesByTopics(normalizedCandidates, topics);
        candidatesForReturn = scored.candidates ?? normalizedCandidates;
        bestCandidate = scored.best ?? bestCandidate;
    }

    if (returnCandidates) {
        if (candidatesForReturn?.length) {
            return candidatesForReturn;
        }
    } else if (bestCandidate) {
        return bestCandidate.url;
    }

    const apolloUrl = await findCompanyURLByNameByApolloInternal(trimmed);
    if (returnCandidates) {
        return apolloUrl ? [{ url: apolloUrl }] : [];
    }
    return apolloUrl;
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

function pickFirstValidUrl(candidates = []) {
    for (const candidate of candidates) {
        const url = ensureAbsoluteUrl(candidate);
        if (url) {
            return url;
        }
    }
    return undefined;
}

function finalizeNormalizedRecord(record, source, data = {}) {
    const domain = normalizeDomain(data.domain ?? data.website);
    const websiteUrl = ensureAbsoluteUrl(data.website ?? (domain ? `https://${domain}` : undefined));

    return {
        name: data.name ?? (domain ? domain : undefined),
        website_url: websiteUrl,
        domain,
        description: typeof data.description === "string" ? data.description : undefined,
        location: data.location,
        logo: data.logo,
        linkedin: data.linkedin,
        twitter: data.twitter,
        facebook: data.facebook,
        categories: data.categories,
        api_source: source,
        raw: record
    };
}

function normalizeBrightDataRecord(record, source) {
    const name =
        record.company_name ??
        record.name ??
        record.title ??
        record.company ??
        record.brand_name;

    const website =
        record.company_website ??
        record.website ??
        record.website_url ??
        record.url ??
        record.company_url;

    const domain =
        record.company_domain ??
        record.domain ??
        normalizeDomain(website);

    const description =
        typeof record.company_description === "string" ? record.company_description :
        typeof record.description === "string" ? record.description :
        typeof record.summary === "string" ? record.summary :
        typeof record.about === "string" ? record.about :
        typeof record.overview === "string" ? record.overview : undefined;

    const location =
        record.company_location ??
        record.location ??
        record.headquarters ??
        record.city ??
        record.country;

    const logo =
        record.company_logo ??
        record.logo_url ??
        record.logo ??
        record.image;

    const linkedin =
        record.linkedin_url ??
        record.company_linkedin ??
        record.linkedin;

    const twitter =
        record.twitter_url ??
        record.twitter ??
        record.x_url;

    const facebook =
        record.facebook_url ??
        record.facebook;

    const categories =
        record.categories ??
        record.category ??
        record.tags ??
        record.industry ??
        record.company_industry;

    return finalizeNormalizedRecord(record, source, {
        name,
        website,
        domain,
        description,
        location,
        logo,
        linkedin,
        twitter,
        facebook,
        categories
    });
}

function collectCompanyLocationFromTheCompaniesApi(record) {
    const headquarters = record.locations?.headquarters;
    if (!headquarters) {
        return undefined;
    }
    const parts = [
        headquarters.city?.name,
        headquarters.state?.name,
        headquarters.country?.name
    ].filter(Boolean);
    if (parts.length) {
        return parts.join(", ");
    }
    return headquarters.address?.raw;
}

function normalizeTheCompaniesApiRecord(record, source) {
    const about = record.about ?? {};
    const descriptions = record.descriptions ?? {};
    const socials = record.socials ?? {};
    const assets = record.assets ?? {};
    const domainInfo = typeof record.domain === "object" && record.domain !== null ? record.domain : {};
    const rawDomain = typeof record.domain === "string" ? record.domain : undefined;

    const name =
        record.name ??
        about.name ??
        about.nameLegal ??
        (Array.isArray(about.nameAlts) ? about.nameAlts[0] : undefined);

    const description =
        typeof descriptions.primary === "string" && descriptions.primary.trim() ? descriptions.primary :
        typeof descriptions.tagline === "string" && descriptions.tagline.trim() ? descriptions.tagline :
        undefined;

    const logo =
        assets.logoSquare?.src ??
        assets.logo?.src ??
        record.image;

    const linkedin =
        socials.linkedin?.url ??
        record.linkedin_url;

    const twitter =
        socials.twitter?.url ??
        socials.x?.url ??
        record.twitter_url;

    const facebook =
        socials.facebook?.url ??
        record.facebook_url;

    const categories =
        about.industries ??
        record.categories;

    const domain =
        rawDomain ??
        domainInfo.domain ??
        domainInfo.domainName ??
        domainInfo.alias ??
        domainInfo.url;

    const candidateUrls = new Set();

    const pushCandidate = (value) => {
        if (typeof value !== "string") {
            return;
        }
        const trimmed = value.trim();
        if (!trimmed) {
            return;
        }
        candidateUrls.add(trimmed);
    };

    pushCandidate(record.company_website);
    pushCandidate(record.website);
    pushCandidate(record.website_url);
    pushCandidate(record.url);
    pushCandidate(record.company_url);
    pushCandidate(descriptions.website);

    if (record.urls && typeof record.urls === "object") {
        const ignoreKeys = new Set([
            "salesNavigator",
            "registrar",
            "registrant",
            "whois",
            "api",
            "developerApi"
        ]);
        Object.entries(record.urls).forEach(([key, value]) => {
            if (ignoreKeys.has(key)) {
                return;
            }
            if (typeof value !== "string") {
                return;
            }
            if (/linkedin\.com\/sales/i.test(value)) {
                return;
            }
            pushCandidate(value);
        });
    }

    if (record.apps && typeof record.apps === "object") {
        Object.values(record.apps).forEach(list => {
            if (!Array.isArray(list)) {
                return;
            }
            list.forEach(entry => {
                if (entry && typeof entry.url === "string") {
                    pushCandidate(entry.url);
                }
            });
        });
    }

    if (domain) {
        pushCandidate(`https://${domain}`);
    }

    const website = pickFirstValidUrl(candidateUrls);

    return finalizeNormalizedRecord(record, source, {
        name,
        website,
        domain,
        description,
        location: collectCompanyLocationFromTheCompaniesApi(record),
        logo,
        linkedin,
        twitter,
        facebook,
        categories
    });
}

function mapCompanyRecord(record = {}, options = {}) {
    const source = options.source ?? record.api_source ?? "brightdata_discover";
    if (source === "thecompaniesapi") {
        return normalizeTheCompaniesApiRecord(record, source);
    }
    if (source === "brightdata_discover") {
        return normalizeBrightDataRecord(record, source);
    }
    return normalizeBrightDataRecord(record, source);
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
        return rawRecords
            .map(record => mapCompanyRecord(record, { source: "brightdata_discover" }))
            .filter(record => record.name || record.domain);
    } catch (error) {
        console.error(`BrightData discover failed for keyword "${keyword}"`, error.response?.data ?? error.message);
        return [];
    }
}

const COMPANIES_API_DEFAULT_BASE_URL = "https://api.thecompaniesapi.com";

function getCompaniesApiConfig() {
    const apiKey =
        process.env.THE_COMPANIES_API_KEY;

    if (!apiKey) {
        throw new Error("TheCompaniesAPI key is not configured");
    }

    const baseURL = process.env.THECOMPANIESAPI_BASE_URL ?? COMPANIES_API_DEFAULT_BASE_URL;

    return {
        baseURL,
        headers: {
            "Authorization": `Basic ${apiKey}`,
            "Content-Type": "application/json"
        }
    };
}

function normalizeCompaniesApiRecords(payload) {
    if (!payload) {
        return { records: [], meta: {}, raw: payload };
    }

    if (Array.isArray(payload)) {
        return { records: payload, meta: {}, raw: payload };
    }

    const extractArray = candidate => {
        if (Array.isArray(candidate)) {
            return candidate;
        }
        if (candidate && typeof candidate === "object") {
            for (const key of ["data", "results", "items", "companies", "records"]) {
                if (Array.isArray(candidate[key])) {
                    return candidate[key];
                }
            }
        }
        return undefined;
    };

    const direct = extractArray(payload);
    if (direct) {
        return { records: direct, meta: payload.meta ?? payload.pagination ?? payload.info ?? {}, raw: payload };
    }

    const dataWrapped = extractArray(payload.data);
    if (dataWrapped) {
        return { records: dataWrapped, meta: payload.meta ?? payload.pagination ?? payload.data?.meta ?? payload.data?.pagination ?? {}, raw: payload };
    }

    return { records: [], meta: payload.meta ?? payload.pagination ?? {}, raw: payload };
}

function extractCompaniesApiPagination(meta = {}, fallback = {}) {
    const toNumber = (value) => {
        if (typeof value === "number" && Number.isFinite(value)) {
            return value;
        }
        if (typeof value === "string" && value.trim() !== "") {
            const parsed = Number(value);
            if (Number.isFinite(parsed)) {
                return parsed;
            }
        }
        return undefined;
    };

    const currentPage =
        toNumber(meta.currentPage) ??
        toNumber(meta.page) ??
        toNumber(meta.current_page) ??
        fallback.page;

    const lastPage =
        toNumber(meta.lastPage) ??
        toNumber(meta.total_pages);

    const perPage =
        toNumber(meta.perPage) ??
        toNumber(meta.per_page) ??
        toNumber(meta.page_size) ??
        fallback.pageSize;

    const nextPage =
        Number.isFinite(currentPage) && Number.isFinite(lastPage) && currentPage < lastPage
            ? currentPage + 1
            : undefined;

    return {
        nextPage,
        total: meta.total ?? meta.total_results ?? meta.totalResults ?? meta.total_count ?? meta.count,
        page: currentPage,
        pageSize: perPage
    };
}

async function fetchCompaniesFromTheCompaniesAPI(keyword, options = {}) {
    const trimmed = keyword?.trim();
    if (!trimmed) {
        return { records: [], meta: {}, scanned: 0 };
    }

    let config;
    try {
        config = getCompaniesApiConfig();
    } catch (error) {
        logger.error("TheCompaniesAPI configuration error", { error: error.message });
        throw error;
    }

    const pageSize = Math.min(options.limit ?? options.pageSize ?? 10, 100);
    const page = options.page ?? 1;

    const searchThreshold = String(options.searchThreshold ?? "0.60");

    const payload = {
        query: [
            {
                attribute: "ai.search",
                operator: "or",
                sign: "equals",
                values: [trimmed, searchThreshold]
            }
        ],
        page,
        perPage: pageSize
    };

    try {
        const response = await axios.post(
            `${config.baseURL.replace(/\/+$/, "")}/v2/companies`,
            payload,
            { headers: config.headers }
        );

        const normalized = normalizeCompaniesApiRecords(response.data);
        const pagination = extractCompaniesApiPagination(normalized.meta, { page, pageSize });
        const records = (normalized.records ?? [])
            .map(entry => mapCompanyRecord(entry, { source: "thecompaniesapi" }))
            .filter(record => record.name || record.domain);
        const scanned = Array.isArray(normalized.records) ? normalized.records.length : records.length;

        return {
            records,
            meta: normalized.meta,
            nextPage: pagination.nextPage,
            total: pagination.total,
            scanned,
            raw: response.data
        };
    } catch (error) {
        logger.error("Error fetching companies from TheCompaniesAPI", {
            keyword: trimmed,
            error: error.response?.data ?? error.message
        });
        throw error;
    }
}

function buildResultFromCompany(record, keyword, source = record?.api_source ?? "brightdata_discover") {
    const rawDescription = record.description
    const description = rawDescription ? String(rawDescription).replace(/\n/g, ". ") : undefined;
    const apiSource = source ?? "brightdata_discover";
    const sourceLabel = apiSource === "thecompaniesapi"
        ? "TheCompaniesAPI"
        : apiSource === "brightdata_discover"
            ? "BrightData Discover"
            : apiSource;
    const referenceParameters = {
        url: record.website_url,
        domain: record.domain,
        description,
        location: record.location,
        api_source: apiSource,
        source: keyword ? `${sourceLabel} "${keyword}"` : sourceLabel,
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

registerCollectorFilter("dedupeDomain", (records = []) => {
    const seen = new Set();
    const output = [];
    for (const record of records) {
        const domain = record?.domain ?? normalizeDomain(record?.website_url);
        if (!domain) {
            continue;
        }
        if (seen.has(domain)) {
            continue;
        }
        seen.add(domain);
        output.push(record);
    }
    return output;
});

function buildFilterEvaluator(filter, context) {
    if (!filter) {
        return undefined;
    }

    const type = typeof filter === "string" ? filter : filter.type ?? filter.name;
    const config = typeof filter === "object" ? filter : {};
    const filterState = context.filterState ?? {};

    return async (data) => {
        if (!type) {
            return true;
        }

        if (type === "snippet") {
            const snippet = data.snippet ?? "";
            const text = data.text ?? "";
            if (!snippet || !text) {
                return false;
            }
            const normalizedSnippet = snippet.toLowerCase().trim().replace(/[^a-z0-9\s]/g, "").replace(/^\.*|\.*$/g, "").replaceAll(/\s+/g, " ");
            const normalizedText = text.toLowerCase().trim().replace(/[^a-z0-9\s]/g, "").replaceAll(/\s+/g, " ");
            return normalizedText.includes(normalizedSnippet);
        }

        if (type === "keyword") {
            if (!context.config?.exact) {
                return true;
            }
            const term = data.term?.toLowerCase().trim().replace(/[^a-z0-9\s]/g, "");
            if (!term) {
                return true;
            }
            const text = data.text?.toLowerCase().trim().replace(/[^a-z0-9\s]/g, "");
            if (!text) {
                return false;
            }
            return text.includes(term);
        }

        if (type === "topic_similarity") {
            if (!data.text) {
                return false;
            }
            if (!context.topic) {
                return true;
            }
            if (!filterState.embeddedTopic) {
                filterState.embeddedTopic = (await buildEmbeddings(context.topic))?.embeddings;
            }
            if (!filterState.embeddedTopic) {
                return false;
            }
            const { truncated, results: fragments } = await buildDocumentTextEmbeddings(data.text, 300);
            if (!fragments) {
                return false;
            }
            const threshold = config.threshold ?? 0.75;
            const scores = fragments.map(fragment => cosineSimilarity(fragment.embeddings, filterState.embeddedTopic));
            const match = scores.some(score => score >= threshold);
            if (match && truncated) {
                data.embeddedFragments = await buildDocumentTextEmbeddings(data.text);
            } else if (match) {
                data.embeddedFragments = fragments;
            }
            return match;
        }

        if (type === "topic") {
            if (!context.topic) {
                return true;
            }
            const threshold = config.threshold ?? 3;
            const result = await analyzeTextAgainstTopics(data.text, context.topic, {
                maxTokens: 2000,
                maxTokensToSend: 10000,
                stopChunk: 300,
                stopAtOrAbove: threshold,
                single: true,
                type: context.resultCategory?.title,
                engine: context.primitive?.referenceParameters?.engine ?? "gpt4o-mini"
            });
            logger.info(`Filter [${type}] for ${data.dataSource ?? "unknown"} = ${result.output} vs ${threshold}`);
            return (result.output ?? 0) >= threshold;
        }

        return true;
    };
}

function buildExistingCheck(primitive, source = {}, cache = {}) {
    const primaryField = source.primaryField;
    if (!primaryField) {
        return undefined;
    }
    const importField = source.importField ?? primaryField;
    cache.items = Array.isArray(cache.items) ? cache.items : [];

    return async (item) => {
        if (!item) {
            return false;
        }
        const value = item[primaryField];
        if (!value) {
            return false;
        }

        let inCache = cache.items.includes(value);
        if (!inCache) {
            cache.items.push(value);
            try {
                await Primitive.updateOne(
                    { _id: primitive.id },
                    {
                        $inc: { queryCount: 1 },
                        $push: { "checkCache.items": value }
                    }
                );
            } catch (err) {
                logger.warn?.(`Failed to update check cache for ${primitive.id}`, err);
            }
        }

        const baseCheck = { [importField]: value };
        let checkCondition = baseCheck;

        if (Array.isArray(source.additionalDuplicateCheck) && source.additionalDuplicateCheck.length) {
            const orConditions = [baseCheck];
            for (const entry of source.additionalDuplicateCheck) {
                if (!Array.isArray(entry) || entry.length < 2) {
                    continue;
                }
                const [field, path] = entry;
                const candidateValue = item[path];
                if (candidateValue) {
                    orConditions.push({ [field]: candidateValue });
                }
            }
            checkCondition = { $or: orConditions };
        }

        const query = {
            workspaceId: primitive.workspaceId,
            referenceId: source.resultCategoryId,
            $and: [checkCondition],
            deleted: { $exists: false }
        };

        const existing = await Primitive.find(query, { _id: 1, parentPrimitives: 1 }).lean();

        if (existing.length > 0) {
            for (const doc of existing) {
                const existingId = doc._id?.toString?.() ?? doc._id ?? doc.id;
                if (!existingId) {
                    continue;
                }
                const alreadyLinked = Object.keys(doc.parentPrimitives ?? {}).includes(primitive.id);
                if (!alreadyLinked) {
                    try {
                        await addRelationship(primitive.id, existingId, "auto");
                        await addRelationship(primitive.id, existingId, "alt_origin");
                    } catch (err) {
                        logger.warn?.(`Failed to add relationship for duplicate ${existingId}`, err);
                    }
                }
            }
        }

        return inCache || existing.length > 0;
    };
}

async function evaluateCompanyRecord(record, context = {}) {
    const {
        keyword,
        requireDescription = true,
        seenDomains,
        filterPre,
        filterMid,
        filterPost,
        existingCheck,
        dataSource = record?.api_source ?? "company_discovery"
    } = context;

    const domain = record?.domain ?? normalizeDomain(record?.website_url);
    if (!domain) {
        return { accepted: false, reason: "missing_domain" };
    }

    if (seenDomains && seenDomains.has(domain)) {
        return { accepted: false, reason: "duplicate_domain" };
    }

    const candidate = buildResultFromCompany(record, keyword, record?.api_source ?? dataSource);
    candidate.raw = record?.raw ?? record;

    const description = candidate.referenceParameters?.description;

    if (requireDescription && !description) {
        return { accepted: false, reason: "missing_description" };
    }

    const evaluationData = {
        text: description ?? "",
        term: keyword,
        record,
        snippet: record?.raw?.snippet ?? description,
        dataSource
    };

    if (filterPre && !(await filterPre(evaluationData))) {
        return { accepted: false, reason: "filter_pre" };
    }

    if (existingCheck && (await existingCheck({
        ...candidate.referenceParameters,
        title: candidate.title,
        record
    }))) {
        return { accepted: false, reason: "duplicate_existing" };
    }

    if (filterMid && !(await filterMid(evaluationData))) {
        return { accepted: false, reason: "filter_mid" };
    }

    if (filterPost && !(await filterPost(evaluationData))) {
        return { accepted: false, reason: "filter_post" };
    }

    if (seenDomains) {
        seenDomains.add(domain);
    }

    return { accepted: true, candidate, record };
}

async function processCompanyDiscoveryRecords(records, context) {
    const { primitive, options } = context;
    const {
        keywords = [],
        topics: topicsList,
        requireDescription = true,
        allowOverflow = false,
        target = 20,
        maxCreation,
        mode: requestedMode,
        resultCategoryId,
        parentId,
        paths,
        source = {},
        config = {},
        skipActions = true
    } = options;

    const workingRecords = records ?? [];

    const topicInput =
        options.topic ??
        config.topic ??
        (Array.isArray(topicsList) ? topicsList.join(", ") : topicsList);

    const filterContext = {
        primitive,
        config,
        topic: topicInput,
        resultCategory: resultCategoryId ? await Category.findOne({ id: resultCategoryId }) : undefined,
        filterState: {}
    };

    const filterPre = buildFilterEvaluator(source.filterPre, filterContext);
    const filterMid = buildFilterEvaluator(source.filterMid, filterContext);
    const filterPost = buildFilterEvaluator(source.filterPost, filterContext);
    const existingCheck = buildExistingCheck(primitive, source, primitive.checkCache ?? {});

    const requireDesc = requireDescription !== false;
    const limit = Number.isFinite(target) ? target : 20;
    const creationLimit = Number.isFinite(maxCreation) ? maxCreation : limit;

    const seenDomains = new Set();
    const candidates = [];
    const creationRecords = [];

    for (const record of workingRecords) {
        const domain = record.domain ?? normalizeDomain(record.website_url);
        if (!domain) {
            continue;
        }
        if (seenDomains.has(domain)) {
            continue;
        }

        if (requireDesc && typeof record.description !== "string") {
            continue;
        }

        const keyword = record.raw?.input?.keyword ?? record.raw?.keyword ?? keywords[0];
        const evaluation = await evaluateCompanyRecord(record, {
            keyword,
            requireDescription: requireDesc,
            seenDomains,
            filterPre,
            filterMid,
            filterPost,
            existingCheck,
            dataSource: source.platform ?? record.api_source ?? "brightdata_discover"
        });

        if (!evaluation.accepted) {
            continue;
        }

        const { candidate } = evaluation;

        if (requestedMode === "bulk") {
            creationRecords.push(record);
            if (!allowOverflow && creationRecords.length >= creationLimit) {
                break;
            }
        } else {
            candidates.push(candidate);
            if (!allowOverflow && candidates.length >= creationLimit) {
                break;
            }
        }
    }

    if (requestedMode === "bulk") {
        if (!creationRecords.length || !parentId || resultCategoryId === undefined) {
            return [];
        }
        const parent = await Primitive.findById(parentId);
        if (!parent) {
            throw new Error(`Cannot find parent primitive ${parentId} for company discovery creation`);
        }
        return await bulkCreateCompanyPrimitives(
            creationRecords,
            resultCategoryId,
            parent,
            paths ?? ["origin"],
            { skipActions }
        );
    }

    if (!candidates.length) {
        return [];
    }

    if (requestedMode === "return") {
        return candidates.slice(0, creationLimit);
    }

    const [originId, candidatePaths] = Object.keys(primitive.parentPrimitives ?? {})
        ?.map(id => primitive.parentPrimitives[id].map(path => [id, path]))
        .flat()
        ?.find(entry => entry[1].startsWith("primitives.search.")) ?? [];

    const addToOrigin = candidatePaths?.length > 0;
    const resultPath = addToOrigin ? candidatePaths.replace(".search.", ".results.") : undefined;

    const toCreate = candidates.slice(0, creationLimit);
    const created = [];

    for (const candidate of toCreate) {
        const newData = {
            workspaceId: primitive.workspaceId,
            paths: ['origin', 'auto'],
            parent: primitive.id,
            data: {
                type: "result",
                referenceId: resultCategoryId,
                title: candidate.title,
                referenceParameters: candidate.referenceParameters
            }
        };

        try {
            const newPrim = await createPrimitive(newData, skipActions);
            if (newPrim) {
                created.push(newPrim);
                if (addToOrigin) {
                    await addRelationship(originId, newPrim.id, resultPath);
                }
            }
        } catch (err) {
            logger.error?.(`Failed to create primitive for BrightData company discovery`, err);
        }
    }

    return created;
}

async function processOrganizationInvestment(records, context) {
    const { primitive } = context;
    const record = Array.isArray(records) && records.length ? records[0] : {};
    const investment = buildInvestmentPayload(record ?? {});
    await dispatchControlUpdate(primitive.id, "referenceParameters.investment", investment);
    if (record && Object.keys(record).length) {
        await dispatchControlUpdate(primitive.id, "referenceParameters.investment_source", {
            provider: "brightdata.crunchbase",
            fetched_at: investment.provenance.extracted_at
        });
    }
    return { collected: records?.length ?? 0, investment };
}

if (INVESTMENT_DATASET_ID) {
    registerBrightDataCollector("organization_investment", {
        datasetId: INVESTMENT_DATASET_ID,
        ...(INVESTMENT_DATASET_IS_CUSTOM ? { customDataset: true } : {}),
        maxConcurrent: 100,
        processRecords: processOrganizationInvestment
    });
} else {
    logger.warn?.("BRIGHTDATA_CRUNCHBASE_INVESTMENT_DATASET_ID is not configured; investment enrichment collector disabled");
}

registerBrightDataCollector("company_discovery", {
    datasetId: getDatasetId(),
    triggerConfig: {
        type: "discover_new",
        discoverBy: "keyword"
    },
    maxConcurrent: 100,
    mapRecord: (raw) => mapCompanyRecord(raw),
    filters: ["dedupeDomain"],
    processRecords: processCompanyDiscoveryRecords
});

async function bulkCreateCompanyPrimitives(records, referenceId, parent, paths, options = {}) {
    if (!records?.length) {
        return [];
    }
    const { skipActions = false } = options;

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
        const apiSource = record.api_source ?? "brightdata_discover";
        const rawData = record.raw ?? record;
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
                api_source: apiSource,
                linkedin: record.linkedin,
                twitter: record.twitter,
                facebook: record.facebook,
                categories: record.categories
            },
            parentPrimitives: { [parent.id]: parentPaths },
            primitives: {},
            metrics: {},
            flowElement: parent.type === "flow",
            plainId: plainStart + idx
        };
    });

    docs.forEach((doc, idx) => {
        const apiSource = toCreate[idx]?.api_source ?? "brightdata_discover";
        const rawData = toCreate[idx]?.raw ?? toCreate[idx];
        if (!rawData) {
            return;
        }
        if (apiSource === "brightdata_discover") {
            doc.brightdataDiscovery = rawData;
        } else if (apiSource === "thecompaniesapi") {
            doc.theCompaniesApiDiscovery = rawData;
        } else {
            doc.companyDiscovery = {
                source: apiSource,
                data: rawData
            };
        }
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

    let finalDocs = insertedDocs
    if( !skipActions){
        const processed = await runPostCreateHooks(insertedDocs, { categoryMap });
        finalDocs = processed?.length ? processed : insertedDocs;
    }

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
    const resolvedUrl = await findCompanyURL(trimmed, context);
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

async function legacySearchCompaniesWithBrightData(keywords, options = {}) {
    if (!keywords.length) {
        return options.parent || options.createResult ? 0 : [];
    }

    if (options.parent && !options.referenceId) {
        throw new Error("referenceId is required when creating primitives from BrightData results");
    }

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

        for (const record of records) {
            if (options.cancelCheck && await Promise.resolve(options.cancelCheck())) {
                break outer;
            }

            const evaluation = await evaluateCompanyRecord(record, {
                keyword,
                requireDescription,
                seenDomains,
                filterPre: options.filterPre,
                filterMid: options.filterMid,
                filterPost: options.filterPost,
                existingCheck: options.existingCheck,
                dataSource: record.api_source ?? "brightdata_discover"
            });

            if (!evaluation.accepted) {
                continue;
            }

            const { candidate } = evaluation;

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
            options.paths ?? ["origin"],
            { skipActions: options.skipActions ?? true }
        );
        return created.length;
    }

    if (createMode) {
        return totalCount;
    }

    return results;
}

export async function searchCompaniesWithTheCompaniesAPI(...args) {
    let primitive;
    let terms;
    let options;

    if (args.length >= 2 && args[0] && typeof args[0] === "object" && (args[0]._id || args[0].id)) {
        [primitive, terms, options = {}] = args;
    } else {
        primitive = undefined;
        terms = args[0];
        options = args[1] ?? {};
    }
    const parent = options.parent ?? primitive
    const resultCategoryId = options.resultCategoryId

    const keywords = extractKeywordsFromTerms(terms);
    const searchTerms = typeof terms === "object" && !Array.isArray(terms) ? terms.searchTerms : undefined;

    if (!keywords.length) {
        return options.parent || options.createResult ? 0 : [];
    }

    if (parent && !resultCategoryId) {
        throw new Error("resultCategoryId is required when creating primitives from TheCompaniesAPI results");
    }

    const requireDescription = options.requireDescription !== false;
    const allowOverflow = options.allowOverflow ?? false;
    const target = options.count ?? 20;
    const lookupCount = options.lookupCount ?? target;
    const maxCreation = options.maxCreation ?? target;

    const createMode = Boolean(options.parent || options.createResult);
    const results = [];
    const seenDomains = new Set();
    const recordsForCreation = [];
    const maxPages = 20
    let totalCount = 0;
    let totalScanned = 0;

    outer: for (const keyword of keywords) {
        let page = 1;
        let continuePaging = true;

        while (continuePaging) {
            if (!allowOverflow) {
                if (parent && resultCategoryId && recordsForCreation.length >= maxCreation) {
                    break outer;
                }
                if (!parent && createMode && totalCount >= maxCreation) {
                    break outer;
                }
                if (!createMode && totalCount >= target) {
                    break outer;
                }
            }

            if (options.cancelCheck && await Promise.resolve(options.cancelCheck())) {
                break outer;
            }

            let response;
            try {
                response = await fetchCompaniesFromTheCompaniesAPI(keyword, {
                    limit: lookupCount,
                    page,
                    filters: options.filters,
                    searchTerms,
                    maxPageSize: options.maxPageSize ?? options.lookupCount ?? options.count
                });
            } catch (error) {
                logger.error("Stopping TheCompaniesAPI search due to fetch error", { keyword, error: error.message });
                break;
            }

            const fetchedRecords = response.records ?? [];
            const scannedThisPage = response.scanned ?? fetchedRecords.length;
            totalScanned += scannedThisPage;

            if (options.progressUpdate) {
                options.progressUpdate({
                    term: keyword,
                    totalScanned,
                    totalCount,
                    page,
                    scanned: scannedThisPage,
                    totalAvailable: response.total
                });
            }

            if (!fetchedRecords.length && !response.nextPage) {
                break;
            }

            for (const record of fetchedRecords) {
                if (options.cancelCheck && await Promise.resolve(options.cancelCheck())) {
                    break outer;
                }

                const evaluation = await evaluateCompanyRecord(record, {
                    keyword,
                    requireDescription,
                    seenDomains,
                    filterPre: options.filterPre,
                    filterMid: options.filterMid,
                    filterPost: options.filterPost,
                    existingCheck: options.existingCheck,
                    dataSource: record.api_source ?? "thecompaniesapi"
                });

                if (!evaluation.accepted) {
                    continue;
                }

                const { candidate } = evaluation;

                if (parent && resultCategoryId) {
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

            if (response.nextPage) {
                const nextPage = response.nextPage === page ? page + 1 : response.nextPage;
                page = nextPage;
                if( page >= maxPages){
                    continuePaging = false
                }
            } else {
                continuePaging = false;
            }
        }
    }

    if (parent && resultCategoryId) {
        if (!recordsForCreation.length) {
            return 0;
        }
        const created = await bulkCreateCompanyPrimitives(
            recordsForCreation,
            resultCategoryId,
            parent,
            options.paths ?? ["origin"],
            { skipActions: options.skipActions ?? true }
        );
        return created.length;
    }

    if (createMode) {
        return totalCount;
    }

    return results;
}

async function scheduleBrightdataInvestmentEnrichment(primitive, options = {}) {
    if (!INVESTMENT_DATASET_ID) {
        throw new Error("BRIGHTDATA_CRUNCHBASE_INVESTMENT_DATASET_ID is not configured");
    }

    const reference = primitive.referenceParameters ?? {};
    const domain = reference.domain ?? normalizeDomain(reference.url);
    let crunchbaseUrl = ensureAbsoluteUrl(reference.crunchbase ?? options.crunchbaseUrl ?? options.crunchbase);

    if (!crunchbaseUrl) {
        try {
            const resolved = await findEntityResourceUrl("crunchbase", { primitive, options });
            if (resolved) {
                crunchbaseUrl = ensureAbsoluteUrl(resolved);
                await dispatchControlUpdate(
                    primitive.id,
                    "referenceParameters.crunchbase",
                    crunchbaseUrl,
                    { track: primitive.id }
                );
            }
        } catch (error) {
            logger.warn?.("Failed to resolve Crunchbase URL via entity resource lookup", {
                primitiveId: primitive.id,
                error: error?.message
            });
        }
    }

    if (!crunchbaseUrl) {
        throw new Error("Crunchbase URL is required to enrich investment data via BrightData");
    }

    const payload = {
        url: crunchbaseUrl
    };

    const result = await triggerBrightDataCollector("organization_investment", {
        primitive,
        input: [payload],
        triggerOptions: options.triggerOptions ?? {},
        collectorOptions: {
            domain,
            url: crunchbaseUrl,
            source: options.source ?? "manual",
            requestId: options.requestId
        }
    });

    return { scheduled: true, ...result };
}

async function enrichWithCoresignalSignals(primitive, options = {}) {
    const reference = primitive.referenceParameters ?? {};
    const domain = normalizeDomain(options.domain ?? reference.domain ?? reference.url);
    const primaryWebsite = ensureAbsoluteUrl(
        options.website ??
        reference.url ??
        (domain ? `https://${domain}` : undefined)
    );
    if (!primaryWebsite && !domain) {
        throw new Error("Coresignal enrichment requires a company website or domain");
    }

    const record = await fetchCoresignalCompanyProfile({
        website: primaryWebsite,
        url: primaryWebsite ?? reference.url,
        domain
    }, {
        includeRaw: options.includeRaw,
        ...(options.coresignal ?? {})
    });

    if (!record) {
        throw new Error("Coresignal company profile was not found with the provided identifiers");
    }

    const { companySignals, investment, provenance, raw } = buildCoresignalCompanySignals(record, {
        includeRaw: options.includeRaw
    });

    await dispatchControlUpdate(primitive.id, "referenceParameters.company_signals", companySignals);

    if (investment) {
        await dispatchControlUpdate(primitive.id, "referenceParameters.investment", investment);
    }

    if (provenance) {
        await dispatchControlUpdate(primitive.id, "referenceParameters.investment_source", {
            provider: provenance.source,
            fetched_at: provenance.fetched_at
        });
    }

    if (options.includeRaw) {
        await dispatchControlUpdate(primitive.id, "referenceParameters.company_signals_raw", raw);
    }

    return {
        provider: "coresignal",
        company_signals: companySignals,
        investment,
        provenance
    };
}

export async function enrichOrganizationSignals(primitive, options = {}) {
    if (!primitive) {
        throw new Error("Primitive is required for company signals enrichment");
    }
    if (primitive.type !== "entity" || primitive.referenceId !== 29) {
        throw new Error("Company signals enrichment is only supported for organization entities (referenceId 29)");
    }

    const preferred = (options.provider ?? process.env.DEFAULT_COMPANY_SIGNAL_PROVIDER ?? "coresignal").toLowerCase();

    if (preferred === "brightdata" || preferred === "bright_data") {
        return await scheduleBrightdataInvestmentEnrichment(primitive, options);
    }

    if (preferred !== "coresignal") {
        logger.warn?.("Unknown company signals provider requested; falling back to Coresignal", {
            requested: preferred
        });
    }

    return await enrichWithCoresignalSignals(primitive, options);
}

export async function enrichOrganizationInvestment(primitive, options = {}) {
    return scheduleBrightdataInvestmentEnrichment(primitive, options);
}

export async function searchCompaniesWithBrightData(...args) {
    let primitive;
    let terms;
    let options;

    if (args.length >= 2 && args[0] && typeof args[0] === "object" && (args[0]._id || args[0].id)) {
        [primitive, terms, options = {}] = args;
    } else {
        primitive = undefined;
        terms = args[0];
        options = args[1] ?? {};
    }

    const keywords = extractKeywordsFromTerms(terms);

    if (!primitive || options.useLegacy) {
        return legacySearchCompaniesWithBrightData(keywords, options);
    }

    if (!keywords.length) {
        return { scheduled: false, keywords: [] };
    }

    const limitPerInput = options.lookupCount ?? options.count ?? options.limit ?? 20;

    const parent = options.parent ?? primitive;

    const collectorOptions = {
        keywords,
        topics: options.topics ?? parent?.referenceParameters?.topics ?? options.config?.topic,
        requireDescription: options.requireDescription !== false,
        allowOverflow: options.allowOverflow ?? false,
        target: options.count ?? 20,
        lookupCount: options.lookupCount ?? limitPerInput,
        maxCreation: options.maxCreation ?? options.count ?? 20,
        mode: parent && options.referenceId ? "bulk" : (options.createResult ? "results" : "return"),
        resultCategoryId: options.resultCategoryId ?? options.source?.resultCategoryId,
        parentId: parent?.id ?? options.parentId,
        paths: options.paths,
        referenceId: options.referenceId,
        source: options.source ?? {},
        config: options.config ?? {},
        skipActions: options.skipActions ?? true,
        topic: options.topic
    };

    await triggerBrightDataCollector("company_discovery", {
        primitive,
        input: keywords.map(keyword => ({ keyword })),
        triggerOptions: { limitPerInput },
        collectorOptions
    });

    return { scheduled: true, keywords };
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
    enrichOrganizationSignals,
    enrichOrganizationInvestment,
    searchCompaniesWithBrightData,
    searchCompaniesWithTheCompaniesAPI,
    resolveCompaniesByName,
    resolveAndCreateCompaniesByName
};
