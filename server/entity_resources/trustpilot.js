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
} from "../entity_resource_capability";

const trustpilotLogger = getLogger("entity_resource_trustpilot", "debug");
const TRUSTPILOT_DEFAULT_LIMIT = 1;
const TRUSTPILOT_DEFAULT_SEARCH_LIMIT = 5;
const TRUSTPILOT_MAX_ITERATIONS = 6;

registerEntityResourceTarget("trustpilot", {
    actionKey: "find_company_trustpilot_page",
    categoryId: 29,
    buildResultTitle: ({ metadata }) => {
        return `${metadata?.companyName ?? "Company"} trustpilot search`;
    },
    prepareOptions: (options = {}) => ({
        candidateLimit: clampInteger(options?.limit, TRUSTPILOT_DEFAULT_LIMIT, 1, 5),
        searchLimit: clampInteger(options?.searchLimit, TRUSTPILOT_DEFAULT_SEARCH_LIMIT, 1, 10),
        maxIterations: clampInteger(options?.maxIterations, TRUSTPILOT_MAX_ITERATIONS, 3, 12),
        debug: options?.debug === true || options?.debug === "true"
    }),
    async execute({ metadata = {}, companyContext = {}, options = {} }) {
        return executeTrustpilotAgent({
            ...metadata,
            ...companyContext,
            candidateLimit: options.candidateLimit,
            searchLimit: options.searchLimit,
            maxIterations: options.maxIterations,
            debug: options.debug
        });
    }
});

async function executeTrustpilotAgent({
    companyName,
    companyDescription,
    companyCountry,
    companyDomain,
    registeredDomain,
    companyUrl,
    candidateLimit,
    searchLimit,
    maxIterations,
    debug
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

    const toolMap = {
        search_trustpilot: async ({ query, limit }) => {
            const effectiveLimit = clampInteger(limit, searchLimit, 1, 10);
            let searchQuery = typeof query === "string" && query.trim().length > 0 ? query.trim() : undefined;
            if (!searchQuery) {
                const parts = ["site:trustpilot.com"];
                if (companyName) {
                    parts.push(`\"${companyName}\"`);
                }
                if (registeredDomain || companyDomain) {
                    parts.push(`\"${registeredDomain ?? companyDomain}\"`);
                }
                parts.push("reviews");
                searchQuery = parts.filter(Boolean).join(" ");
            }
            trustpilotLogger.debug("trustpilot search", { query: searchQuery });
            try {
                const result = await fetchLinksFromWebQuery(searchQuery, { timeFrame: "" });
                const mapped = mapSearchResults(result?.links, effectiveLimit, "trustpilot.com");
                return { query: searchQuery, results: mapped, total: mapped.length };
            } catch (error) {
                trustpilotLogger.error("trustpilot search error", { error: error?.message });
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
                const result = await fetchLinksFromWebQuery(searchQuery, { timeFrame: "" });
                const mapped = mapSearchResults(result?.links, effectiveLimit);
                return { query: searchQuery, results: mapped, total: mapped.length };
            } catch (error) {
                trustpilotLogger.error("general search error", { error: error?.message });
                return { success: false, error: error?.message ?? "Search failed", query: searchQuery };
            }
        },
        inspect_page: async ({ url }) => {
            const normalized = ensureAbsoluteUrl(url);
            if (!normalized) {
                return { success: false, error: "Invalid URL" };
            }
            try {
                const fetched = await fetchURLPlainText(normalized, false, true);
                const rawText = typeof fetched?.fullText === "string" && fetched.fullText.length > 0
                    ? fetched.fullText
                    : (typeof fetched?.description === "string" ? fetched.description : "");
                return {
                    success: true,
                    url: normalized,
                    title: fetched?.title ?? null,
                    text: trimText(rawText, 2000)
                };
            } catch (error) {
                trustpilotLogger.warn("inspect_page failed", { error: error?.message });
                return { success: false, error: error?.message ?? "Unable to load page" };
            }
        }
    };

    const functionDefinitions = [
        {
            name: "search_trustpilot",
            description: "Search trustpilot.com for potential review profile pages.",
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
            description: "Run a general web search for potential Trustpilot references.",
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
            description: "Fetch a page summary for further evaluation.",
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
        "You are an assistant that finds the official Trustpilot review page for the target company.",
        "Use search_trustpilot first to look specifically on trustpilot.com before falling back to general web searches.",
        "Verify that the page represents the correct company (matching name, domain, country or website).",
        "Return a JSON object with a candidates array where each item includes url, title, confidence, is_official (boolean), and rationale."
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
        "Locate the company's official Trustpilot review page.",
        userDetails,
        `Return up to ${candidateLimit} high-confidence options. If none found, return an empty list.`
    ].filter(Boolean).join("\n\n");

    const { finalMessage, toolInvocations, messages } = await runEntityResourceAgent({
        systemPrompt,
        userPrompt,
        tools: toolMap,
        functionDefinitions,
        maxIterations: maxIterations ?? TRUSTPILOT_MAX_ITERATIONS,
        logger: trustpilotLogger
    });

    const parsed = parseAgentJson(finalMessage.content);
    const rawCandidates = Array.isArray(parsed?.candidates) ? parsed.candidates : [];
    const sanitized = rawCandidates.map((candidate) => sanitizeTrustpilotCandidate(candidate)).filter(Boolean);

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

function sanitizeTrustpilotCandidate(candidate) {
    if (!candidate) {
        return undefined;
    }
    const normalizedUrl = ensureAbsoluteUrl(candidate.url ?? candidate.link);
    if (!normalizedUrl) {
        return undefined;
    }
    const host = safeHostname(normalizedUrl);
    if (!host || (!host.endsWith("trustpilot.com") && host !== "trustpilot.com")) {
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
