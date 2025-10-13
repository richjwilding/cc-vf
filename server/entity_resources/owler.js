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

const owlerLogger = getLogger("entity_resource_owler", "debug");
const OWLER_DEFAULT_LIMIT = 1;
const OWLER_DEFAULT_SEARCH_LIMIT = 5;
const OWLER_MAX_ITERATIONS = 6;

registerEntityResourceTarget("owler", {
    actionKey: "find_company_owler_page",
    categoryId: 29,
    buildResultTitle: ({ metadata }) => `${metadata?.companyName ?? "Company"} owler search`,
    prepareOptions: (options = {}) => ({
        candidateLimit: clampInteger(options?.limit, OWLER_DEFAULT_LIMIT, 1, 5),
        searchLimit: clampInteger(options?.searchLimit, OWLER_DEFAULT_SEARCH_LIMIT, 1, 10),
        maxIterations: clampInteger(options?.maxIterations, OWLER_MAX_ITERATIONS, 3, 12),
        debug: options?.debug === true || options?.debug === "true"
    }),
    async execute({ metadata = {}, companyContext = {}, options = {}, statusCallback }) {
        return executeOwlerAgent({
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

async function executeOwlerAgent({
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

    const reportStatus = createStatusReporter(statusCallback, owlerLogger);
    await reportStatus("Starting Owler lookup", {
        candidateLimit,
        searchLimit
    });

    const toolMap = {
        search_owler: async ({ query, limit }) => {
            const effectiveLimit = clampInteger(limit, searchLimit, 1, 10);
            let searchQuery = typeof query === "string" && query.trim().length > 0 ? query.trim() : undefined;
            if (!searchQuery) {
                const parts = ["site:owler.com/company"];
                if (companyName) {
                    parts.push(`\"${companyName}\"`);
                }
                if (registeredDomain || companyDomain) {
                    parts.push(`\"${registeredDomain ?? companyDomain}\"`);
                }
                searchQuery = parts.filter(Boolean).join(" ");
            }
            owlerLogger.debug("owler search", { query: searchQuery });
            try {
                await reportStatus("Searching Owler", { query: searchQuery });
                const result = await fetchLinksFromWebQuery(searchQuery, { timeFrame: "" });
                const mapped = mapSearchResults(result?.links, effectiveLimit, "owler.com");
                await reportStatus("Owler search results processed", {
                    query: searchQuery,
                    results: mapped.length
                });
                return { query: searchQuery, results: mapped, total: mapped.length };
            } catch (error) {
                owlerLogger.error("owler search error", { error: error?.message });
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
                await reportStatus("Searching web for Owler references", { query: searchQuery });
                const result = await fetchLinksFromWebQuery(searchQuery, { timeFrame: "" });
                const mapped = mapSearchResults(result?.links, effectiveLimit);
                await reportStatus("Web search results processed", {
                    query: searchQuery,
                    results: mapped.length
                });
                return { query: searchQuery, results: mapped, total: mapped.length };
            } catch (error) {
                owlerLogger.error("general search error", { error: error?.message });
                return { success: false, error: error?.message ?? "Search failed", query: searchQuery };
            }
        },
        inspect_page: async ({ url }) => {
            const normalized = ensureAbsoluteUrl(url);
            if (!normalized) {
                return { success: false, error: "Invalid URL" };
            }
            try {
                await reportStatus("Inspecting Owler page", { url: normalized });
                const fetched = await fetchURLPlainText(normalized, false, true);
                const rawText = typeof fetched?.fullText === "string" && fetched.fullText.length > 0
                    ? fetched.fullText
                    : (typeof fetched?.description === "string" ? fetched.description : "");
                await reportStatus("Owler page inspection complete", { url: normalized });
                return {
                    success: true,
                    url: normalized,
                    title: fetched?.title ?? null,
                    text: trimText(rawText, 2000)
                };
            } catch (error) {
                owlerLogger.warn("inspect_page failed", { error: error?.message });
                return { success: false, error: error?.message ?? "Unable to load page" };
            }
        }
    };

    const functionDefinitions = [
        {
            name: "search_owler",
            description: "Search owler.com for company profile pages.",
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
            description: "Run a general web search for Owler references.",
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
        "You are an assistant that finds the official Owler company profile page for the target organization.",
        "Use search_owler before broader web searches.",
        "Confirm the profile matches the company details (name, domain, location).",
        "Respond with JSON containing a candidates array where each entry has url, title, confidence, is_match (boolean), and rationale."
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
        "Locate the company's official Owler profile page.",
        userDetails,
        `Return up to ${candidateLimit} high-confidence options or an empty list if nothing fits.`
    ].filter(Boolean).join("\n\n");

    const { finalMessage, toolInvocations, messages } = await runEntityResourceAgent({
        systemPrompt,
        userPrompt,
        tools: toolMap,
        functionDefinitions,
        maxIterations: maxIterations ?? OWLER_MAX_ITERATIONS,
        logger: owlerLogger
    });

    const parsed = parseAgentJson(finalMessage.content);
    const rawCandidates = Array.isArray(parsed?.candidates) ? parsed.candidates : [];
    const sanitized = rawCandidates.map((candidate) => sanitizeOwlerCandidate(candidate)).filter(Boolean);

    sanitized.sort((a, b) => {
        const confA = typeof a.confidence === "number" ? a.confidence : -1;
        const confB = typeof b.confidence === "number" ? b.confidence : -1;
        if (confA !== confB) {
            return confB - confA;
        }
        return (b.is_match ? 1 : 0) - (a.is_match ? 1 : 0);
    });

    const limited = sanitized.slice(0, candidateLimit);
    const companyInfo = buildCompanyInfo({
        companyName,
        companyDescription,
        companyCountry
    }, context);

    await reportStatus("Owler lookup complete", {
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

function sanitizeOwlerCandidate(candidate) {
    if (!candidate) {
        return undefined;
    }
    const normalizedUrl = ensureAbsoluteUrl(candidate.url ?? candidate.link);
    if (!normalizedUrl) {
        return undefined;
    }
    const host = safeHostname(normalizedUrl);
    if (!host || (!host.endsWith("owler.com") && host !== "owler.com")) {
        return undefined;
    }
    let confidence = Number(candidate.confidence ?? candidate.score ?? candidate.probability);
    confidence = Number.isNaN(confidence) ? null : Math.max(0, Math.min(1, confidence));
    const isMatch = typeof candidate.is_match === "boolean"
        ? candidate.is_match
        : (typeof candidate.match === "boolean" ? candidate.match : undefined);
    const rationale = typeof candidate.rationale === "string"
        ? candidate.rationale
        : (typeof candidate.reason === "string" ? candidate.reason : undefined);
    const title = typeof candidate.title === "string" ? candidate.title : undefined;

    const sanitized = {
        url: normalizedUrl,
        title: title ?? null,
        confidence: confidence !== null ? Math.round(confidence * 100) / 100 : null,
        is_match: typeof isMatch === "boolean" ? isMatch : null,
        rationale: rationale ?? null
    };

    if (sanitized.title === null) {
        delete sanitized.title;
    }
    if (sanitized.confidence === null) {
        delete sanitized.confidence;
    }
    if (sanitized.is_match === null) {
        delete sanitized.is_match;
    }
    if (!sanitized.rationale) {
        delete sanitized.rationale;
    }
    return sanitized;
}
