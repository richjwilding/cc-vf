import Category from "./model/Category"
import OpenAI from "openai"
import { fetchLinksFromWebQuery, fetchURLPlainText, fetchPdfLinksFromPage } from "./google_helper"
import { baseURL, cleanURL, getBaseDomain, getRegisteredDomain } from "./actions/SharedTransforms"
import { processAsSingleChunk } from "./openai_helper"
import { createPrimitive } from "./SharedFunctions"
import { getLogger } from "./logger"
//import { dispatchControlUpdate } from "./SharedFunctions"

let _actionMap
function getActionMap(){
    if(!_actionMap){
        _actionMap = {}
    }
    return _actionMap
}

export function registerAction( action, mappings, callback){
    const actionMap = getActionMap()
    if( !action){
        return false
    }
    actionMap[action] ||= {types: {}, categories: {}}
    let obj = actionMap[action]
    if( !mappings || mappings.length === 0){
        mappings = [{}]
    }
    for(const d of [mappings].flat()){
        const id = d.id ?? "default"
        let type = "type"
        if( d.type === "categoryId" ){
            obj = obj.categories
            type = "categoryId"
        }else{
            obj = obj.types
        }
        if( obj[id]){
            console.log(`Overwriting action ${action} for ${id} / ${d.type}`)
        }
        obj[ id ] = callback
    }
}
export async function runAction(primitive, actionKey, options, req){
    const actionMap = getActionMap()
    const category = await Category.findOne({id: primitive.referenceId})
    
    let action = category?.actions?.find((d)=>d.key === actionKey)
    const command = action?.command || actionKey

    let actionCall = actionMap[command]?.categories[primitive.referenceId] ?? actionMap[command]?.types[primitive.type] 
    if( !actionCall ){
        actionCall = actionMap[command]?.types.default
        console.log(`Looking for default for ${command}`)
    }
    if( !actionCall ){
        console.warn(`Cant find action definition for ${primitive.id} ${primitive.type} ${primitive.referenceId} / ${actionKey}`)
        return {success: false}
    }
    //dispatchControlUpdate(primitive.id, `aLog.${actionKey}`, {status: "invoked", user: req?.user?.id, date_invoked: new Date()})
    return {success: true, result: await actionCall(primitive, action ?? actionKey, options, req)}

}

const annualReportLogger = getLogger('action_find_company_annual_report', 'debug')

const ANNUAL_REPORT_DEFAULT_LIMIT = 3
const ANNUAL_REPORT_DEFAULT_SEARCH_LIMIT = 5
const ANNUAL_REPORT_MAX_ITERATIONS = 8
const ANNUAL_REPORT_DEFAULT_RECENCY_WINDOW = 3
const ANNUAL_REPORT_ANALYSIS_CHAR_LIMIT = 10000
const ANNUAL_REPORT_EXCERPT_CHAR_LIMIT = 1200
const ANNUAL_REPORT_CONTENT_CHAR_LIMIT = 6000
const ANNUAL_REPORT_PDF_SELECTION_THRESHOLD = 3
const ANNUAL_REPORT_STRONG_CONFIDENCE = 0.85
const DESCRIPTION_KEYWORD_STOP_WORDS = new Set([
    "the","and","for","from","with","that","this","company","companies","services","solutions","business",
    "global","international","provides","providing","customers","their","into","within","across","enterprise",
    "technology","technologies","industry","industries","market","markets","including","among","based"
])

registerAction("find_company_annual_report", {type: "categoryId", id: 29}, async (primitive, action, options = {}, req)=>{
    const includeContent = options?.includeContent === true || options?.includeContent === "true"
    const candidateLimit = clampInteger(options?.limit, ANNUAL_REPORT_DEFAULT_LIMIT, 1, 10)
    const searchLimit = clampInteger(options?.searchLimit, ANNUAL_REPORT_DEFAULT_SEARCH_LIMIT, 1, 10)
    const recencyWindow = clampInteger(options?.recencyWindow, ANNUAL_REPORT_DEFAULT_RECENCY_WINDOW, 1, 10)
    const maxIterations = clampInteger(options?.maxIterations, ANNUAL_REPORT_MAX_ITERATIONS, 3, 20)

    const metadata = extractCompanyMetadata(primitive, options)
    const companyContext = deriveCompanyContext(primitive, options, metadata)

    if( !companyContext.companyDomain && !metadata.companyName && !metadata.companyDescription ){
        annualReportLogger.warn("find_company_annual_report missing primary company identifiers", {primitiveId: primitive?.id, options})
        return {success: false, error: "Company name or domain is required"}
    }

    try{
        const agentResult = await executeAnnualReportAgent({
            includeContent,
            candidateLimit,
            searchLimit,
            recencyWindow,
            maxIterations,
            debug: true,//options?.debug,
            ...metadata,
            ...companyContext
        })
        console.log(agentResult)

        if( agentResult?.success && agentResult.candidates){
            const winningReport = agentResult.candidates[0]
            const titleParts = [metadata?.companyName ?? companyContext?.companyName ?? primitive?.title, "annual report search", winningReport.year]
            const title = titleParts.filter(Boolean).join(" - ") || "Annual report search result"
            try{
                await createPrimitive({
                    workspaceId: primitive.workspaceId,
                    parent: primitive.id,
                    paths: ['origin'],
                    data: {
                        type: 'result',
                        referenceId: 78,
                        title,
                        referenceParameters: {
                            url: winningReport.url
                        },
                    },
                })
            }catch(createError){
                annualReportLogger.warn('find_company_annual_report result persistence failed', {error: createError?.message})
            }
        }
        return agentResult
    }catch(error){
        annualReportLogger.error("find_company_annual_report failed", {error: error?.message, stack: error?.stack})
        return {success: false, error: error?.message ?? "Unable to locate annual report"}
    }
})

function extractCompanyMetadata(primitive, options = {}){
    const reference = primitive?.referenceParameters ?? {}
    const normalizedString = (value)=>{
        if( typeof value !== "string" ){
            if( value === null || value === undefined ){
                return undefined
            }
            value = `${value}`
        }
        const trimmed = value.trim()
        return trimmed.length > 0 ? trimmed : undefined
    }
    const pickFirstString = (...candidates)=>{
        for(const candidate of candidates){
            if( Array.isArray(candidate) ){
                for(const item of candidate){
                    const text = normalizedString(item)
                    if( text ){
                        return text
                    }
                }
                continue
            }
            const text = normalizedString(candidate)
            if( text ){
                return text
            }
        }
        return undefined
    }
    const mergeToArray = (...values)=>{
        const out = []
        for(const value of values){
            if( Array.isArray(value) ){
                for(const item of value){
                    const text = normalizedString(item)
                    if( text && !out.includes(text) ){
                        out.push(text)
                    }
                }
            }else{
                const text = normalizedString(value)
                if( text && !out.includes(text) ){
                    out.push(text)
                }
            }
        }
        return out
    }

    const companyName = pickFirstString(
        options?.companyName,
        reference?.name,
        primitive?.title,
        primitive?.name,
        reference?.companyName,
        reference?.company_name
    )

    const companyDescription = pickFirstString(
        options?.companyDescription,
        options?.description,
        reference?.description,
        reference?.summary,
        reference?.about,
        reference?.bio,
        primitive?.summary,
        primitive?.description
    )

    const companySectors = mergeToArray(
        options?.sectors,
        options?.sector,
        reference?.sectors,
        reference?.sector,
        reference?.industries,
        reference?.industry,
        reference?.categories
    )

    const companyIndustries = mergeToArray(
        options?.industries,
        options?.industry,
        reference?.industries,
        reference?.industry
    )

    const companyKeywords = mergeToArray(
        options?.keywords,
        reference?.keywords,
        reference?.tags
    )

    const companyCountry = pickFirstString(
        options?.country,
        reference?.country,
        reference?.hq_country,
        reference?.region,
        Array.isArray(reference?.regions) ? reference.regions[0] : undefined
    )

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
    )

    return {
        companyName,
        companyDescription,
        companySectors,
        companyIndustries,
        companyKeywords,
        companyCountry,
        companyUrlHints
    }
}

function clampInteger(value, fallback, min, max){
    const num = Number(value)
    if( Number.isNaN(num) ){
        return fallback
    }
    let out = Math.floor(num)
    if( typeof min === "number" ){
        out = Math.max(min, out)
    }
    if( typeof max === "number" ){
        out = Math.min(max, out)
    }
    return out
}

function deriveCompanyContext(primitive, options = {}, metadata = {}){
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
    ].filter(Boolean)

    let normalizedUrl
    for(const hint of hints){
        normalizedUrl = deriveCompanyUrl(hint)
        if( normalizedUrl ){
            break
        }
    }

    if( !normalizedUrl ){
        return {companyUrl: undefined, companyDomain: undefined, registeredDomain: undefined}
    }

    const hostname = safeHostname(normalizedUrl)
    const registeredDomain = safeRegisteredDomain(normalizedUrl, hostname)

    return {
        companyUrl: normalizedUrl,
        companyDomain: hostname,
        registeredDomain
    }
}

function deriveCompanyUrl(value){
    if( !value ){
        return undefined
    }
    if( typeof value !== "string" ){
        value = `${value}`
    }
    const trimmed = value.trim()
    if( trimmed.length === 0 ){
        return undefined
    }
    try{
        return baseURL(trimmed)
    }catch(e){
        try{
            return baseURL(cleanURL(trimmed))
        }catch(err){
            try{
                return baseURL(`https://${trimmed}`)
            }catch(err2){
                return undefined
            }
        }
    }
}

function ensureAbsoluteUrl(value){
    if( !value ){
        return undefined
    }
    let text = typeof value === "string" ? value.trim() : `${value}`
    if( !text ){
        return undefined
    }
    if( text.startsWith("//") ){
        text = `https:${text}`
    }
    if( !/^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(text) ){
        text = `https://${text.replace(/^\/+/, '')}`
    }
    try{
        const parsed = new URL(text)
        return parsed.toString()
    }catch(e){
        return undefined
    }
}

function safeHostname(url){
    try{
        return new URL(url).hostname.toLowerCase()
    }catch(e){
        return undefined
    }
}

function safeRegisteredDomain(url, fallbackDomain){
    try{
        return getRegisteredDomain(url)
    }catch(e){
        if( fallbackDomain ){
            try{
                return getBaseDomain(fallbackDomain)
            }catch(err){
                return fallbackDomain
            }
        }
        try{
            const host = safeHostname(url)
            return host ? getBaseDomain(host) : undefined
        }catch(err){
            return undefined
        }
    }
}

function normalizeYear(value){
    if( typeof value === "number" && Number.isFinite(value) ){
        const year = Math.round(value)
        if( year >= 1900 && year <= (new Date().getFullYear() + 1) ){
            return year
        }
    }
    if( typeof value === "string" ){
        const match = value.match(/(20\d{2}|19\d{2})/)
        if( match ){
            const year = parseInt(match[1], 10)
            if( year >= 1900 && year <= (new Date().getFullYear() + 1) ){
                return year
            }
        }
    }
    return null
}

function trimText(text, limit){
    if( typeof text !== "string" ){
        return undefined
    }
    if( text.length <= limit ){
        return text
    }
    return text.slice(0, Math.max(0, limit - 3)) + "..."
}

async function executeAnnualReportAgent({
    companyName,
    companyDescription,
    companySectors,
    companyIndustries,
    companyKeywords,
    companyCountry,
    companyDomain,
    registeredDomain,
    companyUrl,
    includeContent,
    candidateLimit,
    searchLimit,
    recencyWindow,
    maxIterations,
    debug
}){
    const openai = new OpenAI({ apiKey: process.env.OPEN_API_KEY })
    const safeRecencyWindow = Math.max(1, recencyWindow ?? ANNUAL_REPORT_DEFAULT_RECENCY_WINDOW)
    const minRecentYear = new Date().getFullYear() - (safeRecencyWindow - 1)
    const toolInvocations = []

    const context = {
        companyName,
        companyDescription,
        companySectors: Array.isArray(companySectors) ? companySectors : [],
        companyIndustries: Array.isArray(companyIndustries) ? companyIndustries : [],
        companyKeywords: Array.isArray(companyKeywords) ? companyKeywords : [],
        companyCountry,
        companyDomain,
        registeredDomain,
        companyUrl,
        includeContent,
        candidateLimit,
        searchLimit,
        minRecentYear
    }

    const toolMap = {
        search_annualreports: async ({query, limit})=>{
            const effectiveLimit = clampInteger(limit, searchLimit, 1, 10)
            let searchQuery = typeof query === "string" && query.trim().length > 0 ? query.trim() : undefined
            const domainTerm = registeredDomain ?? companyDomain ?? ""
            if( !searchQuery ){
                const parts = ["site:annualreports.com"]
                if( domainTerm ){
                    parts.push(`"${domainTerm}"`)
                }
                if( companyName ){
                    parts.push(`"${companyName}"`)
                }
                if( !domainTerm ){
                    const keywordHints = []
                    if( context.companySectors.length ){
                        keywordHints.push(...context.companySectors.slice(0, 2))
                    }
                    if( context.companyIndustries.length ){
                        keywordHints.push(...context.companyIndustries.slice(0, 2))
                    }
                    if( context.companyCountry ){
                        keywordHints.push(context.companyCountry)
                    }
                    if( keywordHints.length ){
                        parts.push(keywordHints.map((value)=>`"${value}"`).join(" "))
                    }
                    if( !companyName && context.companyDescription ){
                        const descKeywords = extractDescriptionKeywords(context.companyDescription, 4)
                        if( descKeywords.length ){
                            parts.push(descKeywords.map((value)=>`"${value}"`).join(" "))
                        }
                    }
                }
                parts.push("\"annual report\"")
                searchQuery = parts.filter(Boolean).join(" ")
            }
            annualReportLogger.debug("annual report agent search_annualreports", {query: searchQuery})
            try{
                const result = await fetchLinksFromWebQuery(searchQuery, {timeFrame: ""})
                const mapped = mapSearchResults(result?.links, effectiveLimit, "annualreports.com")
                return {query: searchQuery, results: mapped, total: mapped.length}
            }catch(error){
                annualReportLogger.error("search_annualreports error", {error: error?.message})
                return {success: false, error: error?.message ?? "Search failed", query: searchQuery}
            }
        },
        search_web: async ({query, limit})=>{
            if( typeof query !== "string" || query.trim().length === 0 ){
                return {success: false, error: "Query is required"}
            }
            const searchQuery = query.trim()
            const effectiveLimit = clampInteger(limit, searchLimit, 1, 10)
            annualReportLogger.debug("annual report agent search_web", {query: searchQuery})
            try{
                const result = await fetchLinksFromWebQuery(searchQuery, {timeFrame: ""})
                const mapped = mapSearchResults(result?.links, effectiveLimit)
                return {query: searchQuery, results: mapped, total: mapped.length}
            }catch(error){
                annualReportLogger.error("search_web error", {error: error?.message})
                return {success: false, error: error?.message ?? "Search failed", query: searchQuery}
            }
        },
        evaluate_candidate: async ({url})=>{
            const normalized = ensureAbsoluteUrl(url)
            if( !normalized ){
                return {success: false, error: "Invalid URL"}
            }
            annualReportLogger.debug("annual report agent evaluate_candidate", {url: normalized})
            try{
                const pdfCandidates = await fetchPdfLinksFromPage(normalized)
                if( Array.isArray(pdfCandidates) && pdfCandidates.length > 0 ){
                    annualReportLogger.debug("annual report agent pdf candidates", {url: normalized, count: pdfCandidates.length})
                    let selectedCandidates = pdfCandidates
                    if( pdfCandidates.length > ANNUAL_REPORT_PDF_SELECTION_THRESHOLD ){
                        console.log(pdfCandidates)
                        const chosen = await selectPdfCandidatesForEvaluation({
                            pageUrl: normalized,
                            candidates: pdfCandidates,
                            companyName: context.companyName,
                            limit: ANNUAL_REPORT_PDF_SELECTION_THRESHOLD
                        })
                        if( Array.isArray(chosen) && chosen.length > 0 ){
                            selectedCandidates = chosen
                        }else{
                            selectedCandidates = pdfCandidates.slice(0, ANNUAL_REPORT_PDF_SELECTION_THRESHOLD)
                        }
                        console.log(selectedCandidates)
                    }

                    const evaluationEntries = []
                    for(const candidateMeta of selectedCandidates){
                        const candidateUrl = ensureAbsoluteUrl(candidateMeta?.url)
                        if( !candidateUrl ){
                            continue
                        }
                        const evaluated = await evaluatePdfDocumentCandidate({
                            candidateUrl,
                            candidateMeta,
                            includeContent,
                            context
                        })
                        if( evaluated ){
                            evaluationEntries.push(evaluated)
                        }
                    }

                    const bestEntry = selectBestEvaluationEntry(evaluationEntries)
                    if( bestEntry ){
                        const toolResponse = {
                            success: true,
                            evaluation: bestEntry.evaluation,
                            excerpt: bestEntry.excerpt,
                            content: includeContent ? bestEntry.content : undefined,
                            word_count: bestEntry.wordCount
                        }
                        if( evaluationEntries.length > 1 ){
                            toolResponse.variants = evaluationEntries.map((entry)=>({
                                url: entry.evaluation?.url,
                                confidence: entry.evaluation?.confidence ?? null,
                                year: entry.evaluation?.year ?? null,
                                is_recent: entry.evaluation?.is_recent ?? null
                            }))
                        }
                        return toolResponse
                    }
                }

                const fetched = await fetchURLPlainText(normalized, false, true)
                const resolvedDocumentUrl = ensureAbsoluteUrl(fetched?.resolvedUrl ?? normalized) ?? normalized
                const rawText = typeof fetched?.fullText === "string" && fetched.fullText.length > 0
                                ? fetched.fullText
                                : (typeof fetched?.description === "string" ? fetched.description : "")
                if( !rawText || rawText.length === 0 ){
                    return {success: false, error: "No content available", url: normalized, title: fetched?.title ?? null}
                }
                const analysisText = rawText.slice(0, ANNUAL_REPORT_ANALYSIS_CHAR_LIMIT)
                const evaluationPrompt = buildEvaluationPrompt(context, resolvedDocumentUrl, analysisText, fetched?.title)
                const evaluation = await processAsSingleChunk(evaluationPrompt, {engine: "o4-mini"})
                if( !evaluation?.success ){
                    return {success: false, error: evaluation?.error ?? "Assessment failed", url: normalized}
                }
                const evalResults = evaluation.results?.[0] ?? {}
                const year = normalizeYear(evalResults.year)
                let confidence = Number(evalResults.confidence)
                confidence = Number.isNaN(confidence) ? null : Math.max(0, Math.min(1, confidence))
                const isRecent = typeof evalResults.is_recent === "boolean" ? evalResults.is_recent : (year ? year >= context.minRecentYear : false)
                const evaluationRecord = {
                    url: resolvedDocumentUrl,
                    title: fetched?.title ?? evalResults.title ?? null,
                    description: fetched?.description ?? null,
                    year,
                    confidence,
                    is_recent: isRecent,
                    is_annual_report: typeof evalResults.is_annual_report === "boolean" ? evalResults.is_annual_report : undefined,
                    notes: evalResults.rationale ?? evalResults.notes ?? evalResults.reason ?? null,
                    source: safeHostname(resolvedDocumentUrl)
                }
                const excerpt = rawText.slice(0, ANNUAL_REPORT_EXCERPT_CHAR_LIMIT)
                const trimmedContent = includeContent ? rawText.slice(0, ANNUAL_REPORT_CONTENT_CHAR_LIMIT) : undefined
                const wordCount = analysisText.split(/\s+/).filter(Boolean).length
                return {
                    success: true,
                    evaluation: evaluationRecord,
                    excerpt,
                    content: includeContent ? trimmedContent : undefined,
                    word_count: wordCount
                }
            }catch(error){
                annualReportLogger.error("evaluate_candidate error", {error: error?.message})
                return {success: false, error: error?.message ?? "Evaluation failed", url: normalized}
            }
        }
    }

    const functionDefinitions = [
        {
            name: "search_annualreports",
            description: "Search annualreports.com for annual report pages related to the target company.",
            parameters: {
                type: "object",
                properties: {
                    query: { type: "string", description: "Optional override query to use for the search." },
                    limit: { type: "integer", description: "Maximum number of results to return." }
                },
                additionalProperties: false
            }
        },
        {
            name: "search_web",
            description: "Run a general web search for potential annual report pages or investor relations resources.",
            parameters: {
                type: "object",
                properties: {
                    query: { type: "string", description: "Search query to execute." },
                    limit: { type: "integer", description: "Maximum number of results to return." }
                },
                required: ["query"],
                additionalProperties: false
            }
        },
        {
            name: "evaluate_candidate",
            description: "Fetch and assess a candidate annual report URL to verify the document details and recency.",
            parameters: {
                type: "object",
                properties: {
                    url: { type: "string", description: "Absolute URL of the candidate document." }
                },
                required: ["url"],
                additionalProperties: false
            }
        }
    ]

    const systemParts = [
        "You are an assistant that identifies official annual report documents for a company using the provided tools.",
        companyDomain ? `Primary domain: ${companyDomain}` : undefined,
        registeredDomain ? `Registered domain: ${registeredDomain}` : undefined,
        companyDescription ? `Company description: ${trimText(companyDescription, 400)}` : undefined,
        context.companySectors.length ? `Sectors: ${context.companySectors.slice(0, 5).join(", ")}` : undefined,
        context.companyIndustries.length ? `Industries: ${context.companyIndustries.slice(0, 5).join(", ")}` : undefined,
        context.companyKeywords.length ? `Keywords: ${context.companyKeywords.slice(0, 6).join(", ")}` : undefined,
        companyCountry ? `Country: ${companyCountry}` : undefined,
        "Workflow:",
        "1. Prefer search_annualreports to inspect annualreports.com before general searches.",
        "2. Use search_web only if additional sources are required or to double check findings.",
        "3. For every candidate URL call evaluate_candidate before including it in the final answer.",
        `A report is considered recent if the reporting year is ${minRecentYear} or later.`,
        `Return at most ${candidateLimit} candidates sorted by confidence (highest first).`,
        includeContent
            ? "When content is requested, include a 'content' field containing the captured text excerpt or null if unavailable."
            : "Do not include any content field in the final response.",
        "Respond ONLY with JSON using the following structure:",
        includeContent
            ? '{"candidates":[{"url":string,"year":number|null,"confidence":number,"is_recent":boolean,"source":string|null,"title":string|null,"notes":string|null,"content":string|null}]}'
            : '{"candidates":[{"url":string,"year":number|null,"confidence":number,"is_recent":boolean,"source":string|null,"title":string|null,"notes":string|null}]}'
    ].filter(Boolean)

    const systemPrompt = systemParts.join("\n")

    const companyDetails = [
        companyName ? `Name: ${companyName}` : undefined,
        companyDomain ? `Domain: ${companyDomain}` : undefined,
        registeredDomain ? `Registered domain: ${registeredDomain}` : undefined,
        companyUrl ? `Website: ${companyUrl}` : undefined,
        companyDescription ? `Description: ${trimText(companyDescription, 280)}` : undefined,
        context.companySectors.length ? `Sectors: ${context.companySectors.slice(0, 5).join(", ")}` : undefined,
        context.companyIndustries.length ? `Industries: ${context.companyIndustries.slice(0, 5).join(", ")}` : undefined,
        companyCountry ? `Country: ${companyCountry}` : undefined
    ].filter(Boolean).join("\n")

    const userPrompt = [
        "Identify the most recent official annual report URLs for the following company.",
        companyDetails,
        `Provide up to ${candidateLimit} high-confidence options and ensure each has been evaluated.`,
        "If no reliable document is found, return an empty candidates array."
    ].filter(Boolean).join("\n\n")

    const messages = [
        {role: "system", content: systemPrompt},
        {role: "user", content: userPrompt}
    ]

    let finalMessage
    for(let iteration = 0; iteration < maxIterations; iteration++){
        console.log(messages)
        const response = await openai.chat.completions.create({
            model: "gpt-4o-mini",//"o4-mini",
            temperature: 0,
            messages,
            functions: functionDefinitions,
            function_call: "auto"
        })
        const message = response?.choices?.[0]?.message
        if( !message ){
            throw new Error("No response from OpenAI")
        }
        if( message.function_call ){
            const fnName = message.function_call.name
            const fnArgsRaw = message.function_call.arguments ?? "{}"
            console.log(`Calling ${fnName} - ${JSON.stringify(fnArgsRaw)}`)
            let fnArgs
            try{
                fnArgs = fnArgsRaw ? JSON.parse(fnArgsRaw) : {}
            }catch(error){
                const errorResult = {success: false, error: `Invalid arguments: ${error.message}`}
                toolInvocations.push({name: fnName ?? "unknown", error: errorResult.error})
                messages.push({role: "assistant", function_call: {name: fnName, arguments: fnArgsRaw}})
                messages.push({role: "function", name: fnName ?? "unknown", content: JSON.stringify(errorResult)})
                continue
            }
            const tool = toolMap[fnName]
            let toolResult
            if( !tool ){
                toolResult = {success: false, error: `Unknown tool: ${fnName}`}
            }else{
                try{
                    toolResult = await tool(fnArgs)
                }catch(error){
                    toolResult = {success: false, error: error?.message ?? "Tool execution failed"}
                }
            }
            toolInvocations.push({name: fnName ?? "unknown", args: fnArgs, result: toolResult})
            messages.push({role: "assistant", function_call: {name: fnName, arguments: fnArgsRaw}})
            messages.push({role: "function", name: fnName ?? "unknown", content: JSON.stringify(toolResult ?? {})})
            continue
        }
        finalMessage = message
        messages.push(message)
        break
    }

    if( !finalMessage ){
        throw new Error("Agent did not complete within iteration limit")
    }

    const parsed = parseAgentJson(finalMessage.content)
    const rawCandidates = Array.isArray(parsed?.candidates) ? parsed.candidates : []
    const sanitized = rawCandidates.map(candidate=>sanitizeCandidate(candidate, {includeContent, minRecentYear})).filter(Boolean)

    sanitized.sort((a,b)=>{
        const confA = typeof a.confidence === "number" ? a.confidence : -1
        const confB = typeof b.confidence === "number" ? b.confidence : -1
        const strongA = confA >= ANNUAL_REPORT_STRONG_CONFIDENCE
        const strongB = confB >= ANNUAL_REPORT_STRONG_CONFIDENCE

        if( strongA && strongB ){
            const yearA = a.year ?? 0
            const yearB = b.year ?? 0
            if( yearA !== yearB ){
                return yearB - yearA
            }
            const recentA = a.is_recent ? 1 : 0
            const recentB = b.is_recent ? 1 : 0
            if( recentA !== recentB ){
                return recentB - recentA
            }
            if( confA !== confB ){
                return confB - confA
            }
            return 0
        }

        if( strongA !== strongB ){
            return strongB ? 1 : -1
        }

        if( confA !== confB ){
            return confB - confA
        }
        const yearA = a.year ?? 0
        const yearB = b.year ?? 0
        if( yearA !== yearB ){
            return yearB - yearA
        }
        const recentA = a.is_recent ? 1 : 0
        const recentB = b.is_recent ? 1 : 0
        return recentB - recentA
    })

    const limited = sanitized.slice(0, candidateLimit)
    const companyInfo = {
        name: companyName ?? null,
        domain: companyDomain,
        registeredDomain,
        url: companyUrl
    }

    if( companyDescription ){
        companyInfo.description = companyDescription
    }
    if( context.companySectors.length ){
        companyInfo.sectors = context.companySectors
    }
    if( context.companyIndustries.length ){
        companyInfo.industries = context.companyIndustries
    }
    if( context.companyKeywords.length ){
        companyInfo.keywords = context.companyKeywords
    }
    if( companyCountry ){
        companyInfo.country = companyCountry
    }

    const result = {
        success: true,
        company: companyInfo,
        candidates: limited
    }

    if( debug ){
        result.debug = {
            agent_response: parsed,
            tool_invocations: toolInvocations,
            messages
        }
    }

    return result
}

function buildEvaluationPrompt(context, url, text, title){
    const companyLines = []
    if( context.companyName ){
        companyLines.push(`name: ${context.companyName}`)
    }
    if( context.companyDomain ){
        companyLines.push(`domain: ${context.companyDomain}`)
    }
    if( context.registeredDomain ){
        companyLines.push(`registered_domain: ${context.registeredDomain}`)
    }
    if( context.companyUrl ){
        companyLines.push(`website: ${context.companyUrl}`)
    }
    if( context.companyDescription ){
        companyLines.push(`description: ${trimText(context.companyDescription, 400)}`)
    }
    if( Array.isArray(context.companySectors) && context.companySectors.length ){
        companyLines.push(`sectors: ${context.companySectors.slice(0, 5).join(", ")}`)
    }
    if( Array.isArray(context.companyIndustries) && context.companyIndustries.length ){
        companyLines.push(`industries: ${context.companyIndustries.slice(0, 5).join(", ")}`)
    }
    if( Array.isArray(context.companyKeywords) && context.companyKeywords.length ){
        companyLines.push(`keywords: ${context.companyKeywords.slice(0, 6).join(", ")}`)
    }
    if( context.companyCountry ){
        companyLines.push(`country: ${context.companyCountry}`)
    }
    const companyBlock = companyLines.length > 0 ? `<company>\n${companyLines.join("\n")}\n</company>\n\n` : ""
    const titleLine = title ? `title: ${title}\n` : ""

    return [
        "You are verifying whether the following document is the official annual report for the target company.",
        companyBlock + `<document url="${url}">\n${titleLine}${text}\n</document>`,
        `A report is considered recent if the reporting year is ${context.minRecentYear} or later.`,
        "Using only the provided content determine if this is an annual report for the company, identify the reporting year, and state whether it meets the recency requirement.",
        "Return your findings as a JSON object with a field \"results\" containing: {\"is_annual_report\": boolean, \"year\": integer or null, \"confidence\": number between 0 and 1, \"is_recent\": boolean, \"rationale\": string (max 20 words), \"title\": string or null}."
    ].join("\n\n")
}

async function selectPdfCandidatesForEvaluation({pageUrl, candidates, companyName, limit}){
    if( !Array.isArray(candidates) || candidates.length === 0 ){
        return []
    }
    if( candidates.length <= (limit ?? ANNUAL_REPORT_PDF_SELECTION_THRESHOLD) ){
        return candidates
    }

    const maxItems = Math.max(1, limit ?? ANNUAL_REPORT_PDF_SELECTION_THRESHOLD)
    const lines = candidates.map((candidate, index)=>{
        const label = candidate?.label ? `label: ${candidate.label}` : undefined
        const contextLine = candidate?.context ? `context: ${trimText(candidate.context, 200)}` : undefined
        return [
            `index: ${index}`,
            `url: ${candidate?.url}`,
            label,
            contextLine
        ].filter(Boolean).join('\n')
    }).join('\n\n')

    const selectionPrompt = [
        `We captured ${candidates.length} potential document links from ${pageUrl} while searching for the annual report${companyName ? ` for ${companyName}` : ''}.`,
        `Select up to ${maxItems} links that are most likely to be the official annual report or Form 10-K document. Favour the most recent reporting years first.`,
        `Use knowledge of typical annual-report naming (e.g. "2024 Annual Report", "FY2023 Form 10-K", "2022 ESG Report") and prioritise higher years and documents that explicitly mention "Annual Report" or "10-K".`,
        `If any candidate appears to be an older supplemental report (e.g. sustainability report), include it only if there are no newer annual or 10-K documents available.`,
        `Candidates:\n${lines}`,
        'Return a JSON object with fields "selected" (array of zero-based indexes representing the chosen links in order of priority) and "reason" (short summary mentioning the determining year cues).'
    ].join('\n\n')

    try{
        const selection = await processAsSingleChunk(selectionPrompt, {
            engine: "o4-mini",
            temperature: 0.1,
            output: 'Return a JSON object with fields "selected" (array of zero-based indexes) and "reason" (string).'
        })

        if( selection?.success ){
            const payload = selection.results ?? {}
            const selected = Array.isArray(payload?.selected)
                ? payload.selected
                : (Array.isArray(payload?.results?.selected) ? payload.results.selected : [])
            if( Array.isArray(selected) && selected.length > 0 ){
                const uniqueIndexes = []
                const seen = new Set()
                for(const raw of selected){
                    const idx = Number(raw)
                    if( Number.isInteger(idx) && idx >= 0 && idx < candidates.length && !seen.has(idx) ){
                        uniqueIndexes.push(idx)
                        seen.add(idx)
                        if( uniqueIndexes.length >= maxItems ){
                            break
                        }
                    }
                }
                if( uniqueIndexes.length > 0 ){
                    return uniqueIndexes.map((idx)=>candidates[idx]).filter(Boolean)
                }
            }
        }
    }catch(error){
        annualReportLogger.warn("annual report agent pdf selection fallback", {url: pageUrl, error: error?.message})
    }

    return candidates.slice(0, maxItems)
}

async function evaluatePdfDocumentCandidate({candidateUrl, landingPage, candidateMeta, includeContent, context}){
    try{
        const fetched = await fetchURLPlainText(candidateUrl, false, true)
        const resolvedDocumentUrl = ensureAbsoluteUrl(fetched?.resolvedUrl ?? candidateUrl) ?? candidateUrl
        const rawText = typeof fetched?.fullText === "string" && fetched.fullText.length > 0
            ? fetched.fullText
            : (typeof fetched?.description === "string" ? fetched.description : "")
        if( !rawText ){
            return null
        }

        const analysisText = rawText.slice(0, ANNUAL_REPORT_ANALYSIS_CHAR_LIMIT)
        const evaluationPrompt = buildEvaluationPrompt(context, resolvedDocumentUrl, analysisText, fetched?.title ?? candidateMeta?.label)
        const evaluation = await processAsSingleChunk(evaluationPrompt, {engine: "o4-mini"})
        if( !evaluation?.success ){
            return null
        }
        const evalResults = evaluation.results?.[0] ?? {}
        const year = normalizeYear(evalResults.year)
        let confidence = Number(evalResults.confidence)
        confidence = Number.isNaN(confidence) ? null : Math.max(0, Math.min(1, confidence))
        const isRecent = typeof evalResults.is_recent === "boolean" ? evalResults.is_recent : (year ? year >= context.minRecentYear : false)
        const evaluationRecord = {
            url: resolvedDocumentUrl,
            title: fetched?.title ?? evalResults.title ?? candidateMeta?.label ?? null,
            description: fetched?.description ?? null,
            year,
            confidence,
            is_recent: isRecent,
            is_annual_report: typeof evalResults.is_annual_report === "boolean" ? evalResults.is_annual_report : undefined,
            notes: evalResults.rationale ?? evalResults.notes ?? evalResults.reason ?? null,
            source: safeHostname(resolvedDocumentUrl)
        }
        if( candidateMeta?.label ){
            evaluationRecord.link_label = candidateMeta.label
        }
        if( candidateMeta?.context ){
            evaluationRecord.link_context = trimText(candidateMeta.context, 400)
        }

        const excerpt = rawText.slice(0, ANNUAL_REPORT_EXCERPT_CHAR_LIMIT)
        const trimmedContent = includeContent ? rawText.slice(0, ANNUAL_REPORT_CONTENT_CHAR_LIMIT) : undefined
        const wordCount = analysisText.split(/\s+/).filter(Boolean).length

        return {
            evaluation: evaluationRecord,
            excerpt,
            content: includeContent ? trimmedContent : undefined,
            wordCount
        }
    }catch(error){
        annualReportLogger.warn("annual report agent pdf evaluation failed", {url: candidateUrl, error: error?.message})
        return null
    }
}

function selectBestEvaluationEntry(entries){
    if( !Array.isArray(entries) || entries.length === 0 ){
        return null
    }
    if( entries.length === 1 ){
        return entries[0]
    }
    const sorted = [...entries].sort((a, b)=>{
        const confA = typeof a.evaluation?.confidence === "number" ? a.evaluation.confidence : -1
        const confB = typeof b.evaluation?.confidence === "number" ? b.evaluation.confidence : -1

        const isStrongA = confA >= ANNUAL_REPORT_STRONG_CONFIDENCE
        const isStrongB = confB >= ANNUAL_REPORT_STRONG_CONFIDENCE

        if( isStrongA && isStrongB ){
            const yearA = a.evaluation?.year ?? 0
            const yearB = b.evaluation?.year ?? 0
            if( yearA !== yearB ){
                return yearB - yearA
            }
            const recentA = a.evaluation?.is_recent ? 1 : 0
            const recentB = b.evaluation?.is_recent ? 1 : 0
            if( recentA !== recentB ){
                return recentB - recentA
            }
            return confB - confA
        }

        if( isStrongA !== isStrongB ){
            return isStrongB ? 1 : -1
        }

        if( confA !== confB ){
            return confB - confA
        }
        const yearA = a.evaluation?.year ?? 0
        const yearB = b.evaluation?.year ?? 0
        if( yearA !== yearB ){
            return yearB - yearA
        }
        const recentA = a.evaluation?.is_recent ? 1 : 0
        const recentB = b.evaluation?.is_recent ? 1 : 0
        return recentB - recentA
    })
    return sorted[0]
}

function extractDescriptionKeywords(description, limit = 5){
    if( typeof description !== "string" ){
        return []
    }
    const words = description
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, " ")
        .split(/\s+/)
        .filter(Boolean)
    const keywords = []
    for(const word of words){
        if( DESCRIPTION_KEYWORD_STOP_WORDS.has(word) ){
            continue
        }
        if( keywords.includes(word) ){
            continue
        }
        keywords.push(word)
        if( keywords.length >= limit ){
            break
        }
    }
    return keywords
}

function mapSearchResults(links, limit, restrictDomain){
    if( !Array.isArray(links) ){
        return []
    }
    const seen = new Set()
    const results = []
    for(const item of links){
        const normalized = ensureAbsoluteUrl(item?.url ?? item?.link)
        if( !normalized ){
            continue
        }
        if( restrictDomain ){
            const domain = safeRegisteredDomain(normalized, safeHostname(normalized))
            const host = safeHostname(normalized)
            if( domain !== restrictDomain && host !== restrictDomain ){
                continue
            }
        }
        if( seen.has(normalized) ){
            continue
        }
        seen.add(normalized)
        results.push({
            title: item?.title ?? null,
            url: normalized,
            snippet: item?.snippet ?? null,
            source: safeHostname(normalized)
        })
        if( results.length >= limit ){
            break
        }
    }
    return results
}

function sanitizeCandidate(candidate, {includeContent, minRecentYear}){
    if( !candidate ){
        return undefined
    }
    const normalizedUrl = ensureAbsoluteUrl(candidate.url ?? candidate.link)
    if( !normalizedUrl ){
        return undefined
    }
    const year = normalizeYear(candidate.year ?? candidate.report_year ?? candidate.fy ?? candidate.date)
    let confidence = Number(candidate.confidence ?? candidate.score ?? candidate.probability)
    confidence = Number.isNaN(confidence) ? null : Math.max(0, Math.min(1, confidence))
    const evalData = typeof candidate.evaluation === "object" && candidate.evaluation !== null ? candidate.evaluation : undefined
    let evalConfidence = evalData?.confidence
    evalConfidence = Number.isFinite(Number(evalConfidence)) ? Math.max(0, Math.min(1, Number(evalConfidence))) : undefined
    const mergedConfidence = confidence ?? evalConfidence ?? null
    const isRecent = typeof candidate.is_recent === "boolean"
                        ? candidate.is_recent
                        : (typeof evalData?.is_recent === "boolean"
                            ? evalData.is_recent
                            : (year ? year >= minRecentYear : false))
    const notes = typeof candidate.notes === "string"
                    ? candidate.notes
                    : (typeof candidate.rationale === "string"
                        ? candidate.rationale
                        : (typeof candidate.reason === "string" ? candidate.reason : undefined))
    const title = typeof candidate.title === "string"
                    ? candidate.title
                    : (typeof candidate.name === "string" ? candidate.name : undefined)
    const source = candidate.source ?? safeHostname(normalizedUrl)
    const contentField = includeContent
                            ? (typeof candidate.content === "string"
                                ? trimText(candidate.content, ANNUAL_REPORT_CONTENT_CHAR_LIMIT)
                                : null)
                            : undefined
    const excerpt = typeof candidate.excerpt === "string"
                        ? trimText(candidate.excerpt, ANNUAL_REPORT_EXCERPT_CHAR_LIMIT)
                        : undefined
    const evaluation = evalData ? {
        ...evalData,
        year: normalizeYear(evalData.year ?? year),
        confidence: evalConfidence ?? mergedConfidence,
        is_recent: typeof evalData.is_recent === "boolean" ? evalData.is_recent : isRecent,
        is_annual_report: typeof evalData.is_annual_report === "boolean" ? evalData.is_annual_report : undefined
    } : undefined
    const isAnnualReport = typeof candidate.is_annual_report === "boolean"
                                ? candidate.is_annual_report
                                : (typeof evaluation?.is_annual_report === "boolean"
                                    ? evaluation.is_annual_report
                                    : (mergedConfidence !== null ? mergedConfidence >= 0.5 : undefined))

    const sanitized = {
        url: normalizedUrl,
        year,
        confidence: mergedConfidence !== null ? Math.round(mergedConfidence * 100) / 100 : null,
        is_recent: isRecent,
        source: source ?? null,
        title: title ?? null,
        notes: notes ?? null,
        is_annual_report: typeof isAnnualReport === "boolean" ? isAnnualReport : null,
        content: contentField,
        excerpt
    }

    if( evaluation ){
        sanitized.evaluation = evaluation
    }
    if( sanitized.notes === null ){
        delete sanitized.notes
    }
    if( sanitized.title === null ){
        delete sanitized.title
    }
    if( sanitized.source === null ){
        delete sanitized.source
    }
    if( sanitized.is_annual_report === null ){
        delete sanitized.is_annual_report
    }
    if( !includeContent ){
        delete sanitized.content
    }
    if( sanitized.excerpt === undefined ){
        delete sanitized.excerpt
    }
    return sanitized
}

function parseAgentJson(content){
    if( typeof content !== "string" ){
        throw new Error("Agent returned no content")
    }
    let trimmed = content.trim()
    if( trimmed.startsWith("```") ){
        trimmed = trimmed.replace(/^```json\s*/i, "").replace(/```$/, "").trim()
    }
    try{
        return JSON.parse(trimmed)
    }catch(error){
        throw new Error(`Unable to parse agent response: ${error.message}`)
    }
}
