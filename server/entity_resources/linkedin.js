import { fetchLinksFromWebQuery, fetchURLPlainText } from "../google_helper";
import { getLogger } from "../logger";
import {
    registerEntityResourceTarget,
    clampInteger,
    runEntityResourceAgent,
    ensureAbsoluteUrl,
    trimText,
    parseAgentJson,
    mapSearchResults,
    buildAgentDebugPayload,
    buildCompanyInfo,
    safeHostname,
    createStatusReporter,
} from "../entity_resource_capability";

const linkedinLogger = getLogger("entity_resource_linkedin", "debug");
const LINKEDIN_DEFAULT_LIMIT = 1;
const LINKEDIN_DEFAULT_SEARCH_LIMIT = 6;
const LINKEDIN_MAX_ITERATIONS = 6;

registerEntityResourceTarget("linkedin", {
    actionKey: "find_company_linkedin_page",
    categoryId: 29,
    buildResultTitle: ({ metadata }) => `${metadata?.companyName ?? "Company"} linkedin search`,
    prepareOptions: (options = {}) => ({
        candidateLimit: clampInteger(options?.limit, LINKEDIN_DEFAULT_LIMIT, 1, 5),
        searchLimit: clampInteger(options?.searchLimit, LINKEDIN_DEFAULT_SEARCH_LIMIT, 1, 10),
        maxIterations: clampInteger(options?.maxIterations, LINKEDIN_MAX_ITERATIONS, 3, 12),
        debug: options?.debug === true || options?.debug === "true"
    }),
    async execute({ metadata = {}, companyContext = {}, options = {}, statusCallback }) {
        return executeLinkedinAgent({
            ...metadata,
            ...companyContext,
            candidateLimit: options.candidateLimit,
            searchLimit: options.searchLimit,
            maxIterations: options.maxIterations,
            debug: options.debug,
            statusCallback
        });
    }
});

async function executeLinkedinAgent({
    companyName,
    companyDescription,
    companyCountry,
    companyDomain,
    registeredDomain,
    companyUrl,
    candidateLimit,
    searchLimit,
    maxIterations,
    debug,
    statusCallback
}) {
    const context = {
        companyName,
        companyDescription,
        companyCountry,
        companyDomain,
        registeredDomain,
        companyUrl,
        candidateLimit,
        searchLimit
    };

    const reportStatus = createStatusReporter(statusCallback, linkedinLogger);
    await reportStatus("Starting LinkedIn lookup", {
        candidateLimit,
        searchLimit
    });

    const toolMap = {
        search_linkedin: async ({ query, limit }) => {
            const effectiveLimit = clampInteger(limit, searchLimit, 1, 10);
            let searchQuery = typeof query === "string" && query.trim().length > 0 ? query.trim() : undefined;
            if (!searchQuery) {
                const parts = ["site:linkedin.com/company"];
                if (companyName) {
                    parts.push(`\"${companyName}\"`);
                }
                if (registeredDomain || companyDomain) {
                    parts.push(`\"${registeredDomain ?? companyDomain}\"`);
                }
                searchQuery = parts.filter(Boolean).join(" ");
            }
            linkedinLogger.debug("linkedin search", { query: searchQuery });
            try {
                await reportStatus("Searching LinkedIn", { query: searchQuery });
                const result = await fetchLinksFromWebQuery(searchQuery, { timeFrame: "" });
                const mapped = mapSearchResults(result?.links, effectiveLimit, "linkedin.com");
                await reportStatus("LinkedIn search results processed", {
                    query: searchQuery,
                    results: mapped.length
                });
                return { query: searchQuery, results: mapped, total: mapped.length };
            } catch (error) {
                linkedinLogger.error("linkedin search error", { error: error?.message });
                return { success: false, error: error?.message ?? "Search failed", query: searchQuery };
            }
        },
        search_web: async ({ query, limit }) => {
            if (typeof query !== "string" || query.trim().length === 0) {
                return { success: false, error: "Query is required" };
            }
            const effectiveLimit = clampInteger(limit, searchLimit, 1, 10);
            const searchQuery = query.trim();
            try {
                await reportStatus("Searching web for LinkedIn references", { query: searchQuery });
                const result = await fetchLinksFromWebQuery(searchQuery, { timeFrame: "" });
                const mapped = mapSearchResults(result?.links, effectiveLimit);
                await reportStatus("Web search results processed", {
                    query: searchQuery,
                    results: mapped.length
                });
                return { query: searchQuery, results: mapped, total: mapped.length };
            } catch (error) {
                linkedinLogger.error("general search error", { error: error?.message });
                return { success: false, error: error?.message ?? "Search failed", query: searchQuery };
            }
        },
        inspect_page: async ({ url }) => {
            const normalized = ensureAbsoluteUrl(url);
            if (!normalized) {
                return { success: false, error: "Invalid URL" };
            }
            try {
                await reportStatus("Inspecting LinkedIn page", { url: normalized });
                const fetched = await fetchURLPlainText(normalized, false, true);
                const rawText = typeof fetched?.fullText === "string" && fetched.fullText.length > 0
                    ? fetched.fullText
                    : (typeof fetched?.description === "string" ? fetched.description : "");
                await reportStatus("LinkedIn page inspection complete", { url: normalized });
                return {
                    success: true,
                    url: normalized,
                    title: fetched?.title ?? null,
                    text: trimText(rawText, 2000)
                };
            } catch (error) {
                linkedinLogger.warn("inspect_page failed", { error: error?.message });
                return { success: false, error: error?.message ?? "Unable to load page" };
            }
        }
    };

    const functionDefinitions = [
        {
            name: "search_linkedin",
            description: "Search linkedin.com for company profile pages.",
            parameters: {
                type: "object",
                properties: {
                    query: { type: "string" },
                    limit: { type: "integer" }
                },
                additionalProperties: false
            }
        },
        {
            name: "search_web",
            description: "Run a general web search for LinkedIn references.",
            parameters: {
                type: "object",
                properties: {
                    query: { type: "string" },
                    limit: { type: "integer" }
                },
                required: ["query"],
                additionalProperties: false
            }
        },
        {
            name: "inspect_page",
            description: "Fetch a page summary for validation.",
            parameters: {
                type: "object",
                properties: {
                    url: { type: "string" }
                },
                required: ["url"],
                additionalProperties: false
            }
        }
    ];

    const systemPrompt = [
        "You are an assistant tasked with finding the official LinkedIn company page for the target organization.",
        "Prioritize search_linkedin before general searches.",
        "Ensure the profile represents a company (not an individual) and matches the provided details.",
        "Return JSON with a candidates array where each item includes url, title, confidence, is_official (boolean) and rationale."
    ].join("\n");

    const userDetails = [
        companyName ? `Name: ${companyName}` : undefined,
        companyDomain ? `Domain: ${companyDomain}` : undefined,
        registeredDomain ? `Registered domain: ${registeredDomain}` : undefined,
        companyUrl ? `Website: ${companyUrl}` : undefined,
        companyDescription ? `Description: ${trimText(companyDescription, 240)}` : undefined,
        companyCountry ? `Country: ${companyCountry}` : undefined
    ].filter(Boolean).join("\n");

    const userPrompt = [
        "Identify the official LinkedIn company page.",
        userDetails,
        `Return up to ${candidateLimit} options or an empty list if none exist.`
    ].filter(Boolean).join("\n\n");

    const { finalMessage, toolInvocations, messages } = await runEntityResourceAgent({
        systemPrompt,
        userPrompt,
        tools: toolMap,
        functionDefinitions,
        maxIterations: maxIterations ?? LINKEDIN_MAX_ITERATIONS,
        logger: linkedinLogger
    });

    const parsed = parseAgentJson(finalMessage.content);
    const rawCandidates = Array.isArray(parsed?.candidates) ? parsed.candidates : [];
    const sanitized = rawCandidates.map((candidate) => sanitizeLinkedinCandidate(candidate)).filter(Boolean);

    sanitized.sort((a, b) => {
        const confA = typeof a.confidence === "number" ? a.confidence : -1;
        const confB = typeof b.confidence === "number" ? b.confidence : -1;
        if (confA !== confB) {
            return confB - confA;
        }
        return (b.is_official ? 1 : 0) - (a.is_official ? 1 : 0);
    });

    const limited = sanitized.slice(0, candidateLimit);
    const companyInfo = buildCompanyInfo({
        companyName,
        companyDescription,
        companyCountry
    }, context);

    await reportStatus("LinkedIn lookup complete", {
        candidateCount: limited.length
    });

    const result = {
        success: true,
        company: companyInfo,
        candidates: limited
    };

    if (debug) {
        result.debug = buildAgentDebugPayload(parsed, toolInvocations, messages);
    }

    return result;
}

function sanitizeLinkedinCandidate(candidate) {
    if (!candidate) {
        return undefined;
    }
    const normalizedUrl = ensureAbsoluteUrl(candidate.url ?? candidate.link);
    if (!normalizedUrl) {
        return undefined;
    }
    const host = safeHostname(normalizedUrl);
    if (!host || (!host.endsWith("linkedin.com") && host !== "linkedin.com")) {
        return undefined;
    }
    if (!/linkedin\.com\/company\//i.test(normalizedUrl)) {
        return undefined;
    }
    let confidence = Number(candidate.confidence ?? candidate.score ?? candidate.probability);
    confidence = Number.isNaN(confidence) ? null : Math.max(0, Math.min(1, confidence));
    const isOfficial = typeof candidate.is_official === "boolean"
        ? candidate.is_official
        : (typeof candidate.official === "boolean" ? candidate.official : undefined);
    const rationale = typeof candidate.rationale === "string"
        ? candidate.rationale
        : (typeof candidate.reason === "string" ? candidate.reason : undefined);
    const title = typeof candidate.title === "string" ? candidate.title : undefined;

    const sanitized = {
        url: normalizedUrl,
        title: title ?? null,
        confidence: confidence !== null ? Math.round(confidence * 100) / 100 : null,
        is_official: typeof isOfficial === "boolean" ? isOfficial : null,
        rationale: rationale ?? null
    };

    if (sanitized.title === null) {
        delete sanitized.title;
    }
    if (sanitized.confidence === null) {
        delete sanitized.confidence;
    }
    if (sanitized.is_official === null) {
        delete sanitized.is_official;
    }
    if (!sanitized.rationale) {
        delete sanitized.rationale;
    }
    return sanitized;
}
