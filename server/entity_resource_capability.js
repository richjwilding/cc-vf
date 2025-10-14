import OpenAI from "openai";
import { baseURL, cleanURL, getBaseDomain, getRegisteredDomain } from "./actions/SharedTransforms";
import { getLogger } from "./logger";

const registry = new Map();

export function registerEntityResourceTarget(key, definition) {
    if (!key) {
        throw new Error("Entity resource target key is required");
    }
    if (registry.has(key)) {
        getLogger("entity_resource_registry").warn(`Overwriting entity resource target: ${key}`);
    }
    registry.set(key, definition ?? {});
    return definition;
}

export function getEntityResourceTarget(key) {
    return registry.get(key);
}

export async function executeEntityResourceTarget(key, payload) {
    const target = getEntityResourceTarget(key);
    if (!target || typeof target.execute !== "function") {
        throw new Error(`Entity resource target not found: ${key}`);
    }
    return target.execute(payload ?? {});
}

export async function findEntityResourceCandidates(targetKey, {
    primitive,
    options = {},
    metadata: metadataOverride,
    companyContext: companyContextOverride,
    rawOptions
} = {}) {
    if (!primitive) {
        throw new Error("Primitive is required for entity resource lookup");
    }

    const metadata = metadataOverride ?? extractCompanyMetadata(primitive, options);
    const companyContext = companyContextOverride ?? deriveCompanyContext(primitive, options, metadata);

    return executeEntityResourceTarget(targetKey, {
        primitive,
        metadata,
        companyContext,
        options,
        rawOptions: rawOptions ?? options
    });
}

export async function findEntityResourceUrl(targetKey, params = {}) {
    const result = await findEntityResourceCandidates(targetKey, params);
    if (result?.success && Array.isArray(result.candidates)) {
        const candidate = result.candidates.find((item) => item?.url);
        if (candidate) {
            return candidate.url;
        }
    }
    return undefined;
}

export function extractCompanyMetadata(primitive, options = {}) {
    const reference = primitive?.referenceParameters ?? {};
    const normalizedString = (value) => {
        if (typeof value !== "string") {
            if (value === null || value === undefined) {
                return undefined;
            }
            value = `${value}`;
        }
        const trimmed = value.trim();
        return trimmed.length > 0 ? trimmed : undefined;
    };
    const pickFirstString = (...candidates) => {
        for (const candidate of candidates) {
            if (Array.isArray(candidate)) {
                for (const item of candidate) {
                    const text = normalizedString(item);
                    if (text) {
                        return text;
                    }
                }
                continue;
            }
            const text = normalizedString(candidate);
            if (text) {
                return text;
            }
        }
        return undefined;
    };
    const mergeToArray = (...values) => {
        const out = [];
        for (const value of values) {
            if (Array.isArray(value)) {
                for (const item of value) {
                    const text = normalizedString(item);
                    if (text && !out.includes(text)) {
                        out.push(text);
                    }
                }
            } else {
                const text = normalizedString(value);
                if (text && !out.includes(text)) {
                    out.push(text);
                }
            }
        }
        return out;
    };

    const companyName = pickFirstString(
        options?.companyName,
        reference?.name,
        primitive?.title,
        primitive?.name,
        reference?.companyName,
        reference?.company_name
    );

    const companyDescription = pickFirstString(
        options?.companyDescription,
        options?.description,
        reference?.description,
        reference?.companyDescription,
        reference?.company_description,
        reference?.summary,
        reference?.about,
        reference?.bio,
        primitive?.summary,
        primitive?.description
    );

    const companySectors = mergeToArray(
        options?.companySectors,
        options?.sectors,
        options?.sector,
        reference?.sectors,
        reference?.sector,
        reference?.industries,
        reference?.industry,
        reference?.categories,
        primitive?.sectors,
        primitive?.sector
    );

    const companyIndustries = mergeToArray(
        options?.companyIndustries,
        options?.industries,
        options?.industry,
        reference?.industries,
        reference?.industry,
        primitive?.industries,
        primitive?.industry
    );

    const companyKeywords = mergeToArray(
        options?.companyKeywords,
        options?.keywords,
        reference?.keywords,
        reference?.tags,
        primitive?.keywords,
        primitive?.tags
    );

    const companyCountry = pickFirstString(
        options?.companyCountry,
        options?.country,
        reference?.country,
        primitive?.country,
        reference?.hq_country,
        primitive?.hq_country,
        reference?.region,
        Array.isArray(reference?.regions) ? reference.regions[0] : undefined
    );

    const companyUrlHints = mergeToArray(
        options?.companyUrl,
        options?.companyDomain,
        options?.website,
        options?.url,
        reference?.url,
        reference?.domain,
        reference?.website,
        reference?.companyUrl,
        reference?.company_url,
        reference?.hq_website,
        primitive?.url,
        primitive?.link,
        primitive?.sourceUrl,
        primitive?.website
    );

    return {
        companyName,
        companyDescription,
        companySectors,
        companyIndustries,
        companyKeywords,
        companyCountry,
        companyUrlHints
    };
}

export function clampInteger(value, fallback, min, max) {
    const num = Number(value);
    if (Number.isNaN(num)) {
        return fallback;
    }
    let out = Math.floor(num);
    if (typeof min === "number") {
        out = Math.max(min, out);
    }
    if (typeof max === "number") {
        out = Math.min(max, out);
    }
    return out;
}

export function deriveCompanyContext(primitive, options = {}, metadata = {}) {
    const hints = [
        options?.companyUrl,
        options?.companyDomain,
        primitive?.referenceParameters?.url,
        primitive?.referenceParameters?.domain,
        primitive?.referenceParameters?.website,
        primitive?.referenceParameters?.companyUrl,
        primitive?.referenceParameters?.company_url,
        primitive?.referenceParameters?.hq_website,
        primitive?.referenceParameters?.primaryDomain,
        primitive?.title && primitive.title.startsWith("http") ? primitive.title : undefined,
        ...(Array.isArray(metadata?.companyUrlHints) ? metadata.companyUrlHints : [])
    ].filter(Boolean);

    let normalizedUrl;
    for (const hint of hints) {
        normalizedUrl = deriveCompanyUrl(hint);
        if (normalizedUrl) {
            break;
        }
    }

    if (!normalizedUrl) {
        return { companyUrl: undefined, companyDomain: undefined, registeredDomain: undefined };
    }

    const hostname = safeHostname(normalizedUrl);
    const registeredDomain = safeRegisteredDomain(normalizedUrl, hostname);

    return {
        companyUrl: normalizedUrl,
        companyDomain: hostname,
        registeredDomain
    };
}

export function deriveCompanyUrl(value) {
    if (!value) {
        return undefined;
    }
    if (typeof value !== "string") {
        value = `${value}`;
    }
    const trimmed = value.trim();
    if (trimmed.length === 0) {
        return undefined;
    }
    try {
        return baseURL(trimmed);
    } catch (e) {
        try {
            return baseURL(cleanURL(trimmed));
        } catch (err) {
            try {
                return baseURL(`https://${trimmed}`);
            } catch (err2) {
                return undefined;
            }
        }
    }
}

export function ensureAbsoluteUrl(value) {
    if (!value) {
        return undefined;
    }
    let text = typeof value === "string" ? value.trim() : `${value}`;
    if (!text) {
        return undefined;
    }
    if (text.startsWith("//")) {
        text = `https:${text}`;
    }
    if (!/^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(text)) {
        text = `https://${text.replace(/^\/+/, "")}`;
    }
    try {
        const parsed = new URL(text);
        return parsed.toString();
    } catch (e) {
        return undefined;
    }
}

export function safeHostname(url) {
    try {
        return new URL(url).hostname.toLowerCase();
    } catch (e) {
        return undefined;
    }
}

export function safeRegisteredDomain(url, fallbackDomain) {
    try {
        return getRegisteredDomain(url);
    } catch (e) {
        if (fallbackDomain) {
            try {
                return getBaseDomain(fallbackDomain);
            } catch (err) {
                return fallbackDomain;
            }
        }
        try {
            const host = safeHostname(url);
            return host ? getBaseDomain(host) : undefined;
        } catch (err) {
            return undefined;
        }
    }
}

export function normalizeYear(value) {
    if (typeof value === "number" && Number.isFinite(value)) {
        const year = Math.round(value);
        if (year >= 1900 && year <= (new Date().getFullYear() + 1)) {
            return year;
        }
    }
    if (typeof value === "string") {
        const match = value.match(/(20\d{2}|19\d{2})/);
        if (match) {
            const year = parseInt(match[1], 10);
            if (year >= 1900 && year <= (new Date().getFullYear() + 1)) {
                return year;
            }
        }
    }
    return null;
}

export function trimText(text, limit) {
    if (typeof text !== "string") {
        return undefined;
    }
    if (text.length <= limit) {
        return text;
    }
    return text.slice(0, Math.max(0, limit - 3)) + "...";
}

export function buildCompanyInfo(metadata = {}, context = {}) {
    const info = {
        name: metadata?.companyName ?? context?.companyName ?? null,
        domain: context?.companyDomain,
        registeredDomain: context?.registeredDomain,
        url: context?.companyUrl
    };
    if (metadata?.companyDescription) {
        info.description = metadata.companyDescription;
    }
    if (Array.isArray(context?.companySectors) && context.companySectors.length) {
        info.sectors = context.companySectors;
    }
    if (Array.isArray(context?.companyIndustries) && context.companyIndustries.length) {
        info.industries = context.companyIndustries;
    }
    if (Array.isArray(context?.companyKeywords) && context.companyKeywords.length) {
        info.keywords = context.companyKeywords;
    }
    if (metadata?.companyCountry) {
        info.country = metadata.companyCountry;
    }
    return info;
}

export function parseAgentJson(content) {
    if (typeof content !== "string") {
        throw new Error("Agent returned no content");
    }
    let trimmed = content.trim();
    if (trimmed.startsWith("```") ) {
        trimmed = trimmed.replace(/^```json\s*/i, "").replace(/```$/, "").trim();
    }
    try {
        return JSON.parse(trimmed);
    } catch (error) {
        throw new Error(`Unable to parse agent response: ${error.message}`);
    }
}

export async function runEntityResourceAgent({
    systemPrompt,
    userPrompt,
    tools = {},
    functionDefinitions = [],
    maxIterations = 6,
    model = "gpt-4o-mini",
    temperature = 0,
    logger,
}) {
    const openai = new OpenAI({ apiKey: process.env.OPEN_API_KEY });
    const messages = [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt }
    ];
    const toolInvocations = [];
    let finalMessage;

    const hasFunctions = Array.isArray(functionDefinitions) && functionDefinitions.length > 0;

    for (let iteration = 0; iteration < maxIterations; iteration++) {
        const requestPayload = {
            model,
            temperature,
            messages
        };

        if (hasFunctions) {
            requestPayload.functions = functionDefinitions;
            requestPayload.function_call = "auto";
        }

        const response = await openai.chat.completions.create(requestPayload);
        const message = response?.choices?.[0]?.message;
        if (!message) {
            throw new Error("No response from OpenAI");
        }
        if (message.function_call && hasFunctions) {
            const fnName = message.function_call.name;
            const fnArgsRaw = message.function_call.arguments ?? "{}";
            let fnArgs;
            try {
                fnArgs = fnArgsRaw ? JSON.parse(fnArgsRaw) : {};
            } catch (error) {
                const errorResult = { success: false, error: `Invalid arguments: ${error.message}` };
                toolInvocations.push({ name: fnName ?? "unknown", error: errorResult.error });
                messages.push({ role: "assistant", function_call: { name: fnName, arguments: fnArgsRaw } });
                messages.push({ role: "function", name: fnName ?? "unknown", content: JSON.stringify(errorResult) });
                continue;
            }
            const tool = tools[fnName];
            let toolResult;
            if (!tool) {
                toolResult = { success: false, error: `Unknown tool: ${fnName}` };
            } else {
                try {
                    toolResult = await tool(fnArgs);
                } catch (error) {
                    toolResult = { success: false, error: error?.message ?? "Tool execution failed" };
                    logger?.error?.(`${fnName} tool error`, { error: error?.message });
                }
            }
            toolInvocations.push({ name: fnName ?? "unknown", args: fnArgs, result: toolResult });
            messages.push({ role: "assistant", function_call: { name: fnName, arguments: fnArgsRaw } });
            messages.push({ role: "function", name: fnName ?? "unknown", content: JSON.stringify(toolResult ?? {}) });
            continue;
        }
        finalMessage = message;
        messages.push(message);
        break;
    }

    if (!finalMessage) {
        throw new Error("Agent did not complete within iteration limit");
    }

    return { finalMessage, messages, toolInvocations };
}

export function mapSearchResults(links, limit = 5, restrictDomain) {
    if (!Array.isArray(links)) {
        return [];
    }
    const seen = new Set();
    const results = [];
    for (const item of links) {
        const normalized = ensureAbsoluteUrl(item?.url ?? item?.link);
        if (!normalized) {
            continue;
        }
        if (restrictDomain) {
            const domain = safeRegisteredDomain(normalized, safeHostname(normalized));
            const host = safeHostname(normalized);
            if (domain !== restrictDomain && host !== restrictDomain) {
                continue;
            }
        }
        if (seen.has(normalized)) {
            continue;
        }
        seen.add(normalized);
        results.push({
            title: item?.title ?? null,
            url: normalized,
            snippet: item?.snippet ?? null,
            source: safeHostname(normalized)
        });
        if (results.length >= limit) {
            break;
        }
    }
    return results;
}

export function buildAgentDebugPayload(parsed, toolInvocations, messages) {
    return {
        agent_response: parsed,
        tool_invocations: toolInvocations,
        messages,
    };
}

export function createStatusReporter(statusCallback, logger) {
    return async (message, details) => {
        if (typeof statusCallback !== "function") {
            return;
        }
        try {
            await statusCallback(message, details);
        } catch (error) {
            logger?.debug?.("status callback error", { error: error?.message });
        }
    };
}
