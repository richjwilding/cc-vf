import { fetchLinksFromWebQuery, fetchURLPlainText } from "../google_helper";
import { getLogger } from "../logger";
import {
    registerEntityResourceTarget,
    clampInteger,
    ensureAbsoluteUrl,
    mapSearchResults,
    buildCompanyInfo,
    safeHostname,
    safeRegisteredDomain,
    runEntityResourceAgent,
    trimText,
    parseAgentJson,
    buildAgentDebugPayload,
    createStatusReporter
} from "../entity_resource_capability";

const crunchbaseLogger = getLogger("entity_resource_crunchbase", "debug");
const CRUNCHBASE_DEFAULT_LIMIT = 1;
const CRUNCHBASE_DEFAULT_SEARCH_LIMIT = 5;

registerEntityResourceTarget("crunchbase", {
    actionKey: "find_company_crunchbase_page",
    categoryId: 29,
    buildResultTitle: ({ metadata }) => `${metadata?.companyName ?? "Company"} crunchbase search`,
    prepareOptions: (options = {}) => ({
        candidateLimit: clampInteger(options?.limit, CRUNCHBASE_DEFAULT_LIMIT, 1, 5),
        searchLimit: clampInteger(options?.searchLimit, CRUNCHBASE_DEFAULT_SEARCH_LIMIT, 1, 10),
        debug: options?.debug === true || options?.debug === "true"
    }),
    async execute({ primitive, metadata = {}, companyContext = {}, options = {}, statusCallback }) {
        return executeCrunchbaseLookup({
            primitive,
            metadata,
            companyContext,
            candidateLimit: options.candidateLimit,
            searchLimit: options.searchLimit,
            debug: options.debug,
            statusCallback
        });
    }
});

async function executeCrunchbaseLookup({
    primitive,
    metadata,
    companyContext,
    candidateLimit,
    searchLimit,
    debug,
    statusCallback
}) {
    const info = buildCompanyInfo(metadata, companyContext);
    const queries = buildSearchQueries(info);
    const reportStatus = createStatusReporter(statusCallback, crunchbaseLogger);

    await reportStatus("Preparing Crunchbase lookup", {
        queryCount: queries.length
    });

    const collected = [];
    const seen = new Set();

    for (const query of queries) {
        if (!query) {
            continue;
        }
        try {
            await reportStatus("Searching Crunchbase", { query });
            const result = await fetchLinksFromWebQuery(query, { timeFrame: "" });
            const mapped = mapSearchResults(result?.links, searchLimit, "crunchbase.com");
            await reportStatus("Processing Crunchbase search results", {
                query,
                results: mapped.length
            });
            for (const item of mapped) {
                const normalized = ensureAbsoluteUrl(item?.url);
                if (!normalized || seen.has(normalized)) {
                    continue;
                }
                seen.add(normalized);
                const score = scoreCrunchbaseCandidate(normalized, item, info);
                collected.push({
                    url: normalized,
                    title: item?.title ?? null,
                    confidence: score,
                    rationale: buildRationale(normalized, info, score),
                    source: "search"
                });
            }
        } catch (error) {
            crunchbaseLogger.error("crunchbase search error", { query, error: error?.message });
        }
        if (collected.length >= candidateLimit) {
            break;
        }
    }

    collected.sort((a, b) => (b.confidence ?? 0) - (a.confidence ?? 0));
    let candidates = collected.slice(0, clampInteger(candidateLimit, CRUNCHBASE_DEFAULT_LIMIT, 1, 5));

    candidates = await verifyCandidatesWithLLM({
        candidates,
        primitive,
        info,
        debug,
        statusCallback
    });

    await reportStatus("Crunchbase lookup complete", {
        candidateCount: candidates.length
    });

    return {
        success: candidates.length > 0,
        candidates,
        info,
        queries,
        debug
    };
}

function buildSearchQueries(info = {}) {
    const queries = [];
    const name = info?.name;
    const domain = info?.registeredDomain ?? info?.domain;
    if (domain) {
        queries.push(`site:crunchbase.com/organization "${domain}"`);
    }
    if (name && domain) {
        queries.push(`site:crunchbase.com/organization "${name}" "${domain}"`);
    }
    if (name) {
        queries.push(`site:crunchbase.com/organization "${name}"`);
    }
    if (name && info?.country) {
        queries.push(`site:crunchbase.com "${name}" "${info.country}"`);
    }
    return queries.filter(Boolean);
}

function scoreCrunchbaseCandidate(url, item, info = {}) {
    const host = safeHostname(url) ?? "";
    if (!host.includes("crunchbase.com")) {
        return 0.1;
    }
    const path = new URL(url).pathname.toLowerCase();
    let score = 0.3;
    if (path.includes("/organization/")) {
        score += 0.4;
    }
    const registered = safeRegisteredDomain(url, host);
    if (registered === "crunchbase.com") {
        score += 0.1;
    }
    if (info?.registeredDomain && path.includes(info.registeredDomain.toLowerCase())) {
        score += 0.2;
    } else if (info?.domain && path.includes(info.domain.toLowerCase())) {
        score += 0.15;
    }
    if (info?.name && item?.title && item.title.toLowerCase().includes(info.name.toLowerCase())) {
        score += 0.15;
    }

    return Math.min(1, score);
}

function buildRationale(url, info, score) {
    const parts = [];
    if (score >= 0.6) {
        parts.push("High confidence Crunchbase organization profile.");
    } else if (score >= 0.45) {
        parts.push("Potential Crunchbase organization profile.");
    } else {
        parts.push("Low confidence candidate.");
    }
    if (info?.name) {
        parts.push(`Matches company name: ${info.name}`);
    }
    if (info?.registeredDomain) {
        parts.push(`Search includes domain hint: ${info.registeredDomain}`);
    } else if (info?.domain) {
        parts.push(`Search includes domain hint: ${info.domain}`);
    }
    parts.push(`URL: ${url}`);
    return parts.join(" ");
}

async function verifyCandidatesWithLLM({ candidates, primitive, info, debug, statusCallback }) {
    if (!Array.isArray(candidates) || !primitive) {
        return candidates;
    }
    const description = primitive?.referenceParameters?.description;
    if (!description) {
        return candidates;
    }

    const reportStatus = createStatusReporter(statusCallback, crunchbaseLogger);
    const verified = [];
    for (const candidate of candidates) {
        const baselineScore = typeof candidate?.confidence === "number" ? candidate.confidence : 0;
        if (baselineScore < 0.6) {
            verified.push(candidate);
            continue;
        }
        try {
            await reportStatus("Validating Crunchbase candidate", { url: candidate.url });
            const fetched = await fetchURLPlainText(candidate.url, false, true);
            const rawText = typeof fetched?.fullText === "string" && fetched.fullText.length > 0
                ? fetched.fullText
                : (typeof fetched?.description === "string" ? fetched.description : "");
            if (!rawText) {
                await reportStatus("Crunchbase candidate validation skipped", {
                    url: candidate.url,
                    reason: "Missing page content"
                });
                verified.push(candidate);
                continue;
            }

            const systemPrompt = [
                "You review Crunchbase profile content and determine whether it describes the same company as the provided internal description.",
                "Consider company name, offerings, industry, location, and other unique attributes.",
                "Respond strictly as JSON with fields: match (boolean), confidence (number 0-1), rationale (string)."
            ].join("\n");

            const userPrompt = [
                info?.name ? `Company name: ${info.name}` : undefined,
                info?.domain ? `Company domain: ${info.domain}` : undefined,
                info?.registeredDomain ? `Registered domain: ${info.registeredDomain}` : undefined,
                `Internal description:\n${trimText(description, 1200)}`,
                `Crunchbase content excerpt:\n${trimText(rawText, 2400)}`,
                `Crunchbase URL: ${candidate.url}`,
                "Evaluate whether the Crunchbase content likely describes the same company."
            ].filter(Boolean).join("\n\n");

            const { finalMessage, toolInvocations, messages } = await runEntityResourceAgent({
                systemPrompt,
                userPrompt,
                tools: {},
                functionDefinitions: [],
                maxIterations: 1,
                temperature: 0,
                logger: crunchbaseLogger
            });

            const parsed = parseAgentJson(finalMessage?.content ?? "{}");
            const match = parsed?.match === true;
            const llmConfidence = typeof parsed?.confidence === "number"
                ? Math.max(0, Math.min(1, parsed.confidence))
                : null;

            const updated = { ...candidate };
            updated.llmValidation = {
                match,
                confidence: llmConfidence,
                rationale: typeof parsed?.rationale === "string" ? parsed.rationale : undefined
            };
            if (debug) {
                updated.llmValidation.debug = buildAgentDebugPayload(parsed, toolInvocations, messages);
            }

            if (match) {
                if (llmConfidence !== null && llmConfidence > baselineScore) {
                    updated.confidence = llmConfidence;
                }
                if (updated.llmValidation.rationale) {
                    updated.rationale = updated.rationale
                        ? `${updated.rationale}\nLLM: ${updated.llmValidation.rationale}`
                        : `LLM: ${updated.llmValidation.rationale}`;
                }
            } else {
                updated.confidence = Math.min(baselineScore, llmConfidence !== null ? llmConfidence : 0.2);
                updated.rationale = updated.rationale
                    ? `${updated.rationale}\nLLM negative match assessment.`
                    : "LLM negative match assessment.";
            }

            await reportStatus("Crunchbase candidate validation complete", {
                url: candidate.url,
                match,
                confidence: llmConfidence
            });

            verified.push(updated);
        } catch (error) {
            crunchbaseLogger.warn("LLM verification failed", { url: candidate.url, error: error?.message });
            verified.push(candidate);
        }
    }

    return verified;
}
