import { getLogger } from "../../logger";
import { buildCategories } from "../../openai_helper";
import { fetchPrimitives, findPrimitiveOriginParent } from "../../SharedFunctions";
import { getDataForAgentAction } from "../utils";

const MAX_HISTORY_LENGTH = 10;

function ensureInsightState(scope) {
    if (!scope) {
        return null;
    }

    let state = null;
    if (scope.mode === "insights" && scope.modeState) {
        state = scope.modeState;
    } else {
        state = scope.getStoredModeState?.("insights");
    }

    const initialize = () => ({
        lastAction: null,
        history: [],
        categorizations: [],
        pendingCategorization: null,
        lastSources: null,
    });

    if (!state) {
        state = initialize();
        scope.setStoredModeState?.("insights", state);
        if (scope.mode === "insights") {
            scope.modeState = state;
        }
        return state;
    }

    if (!Object.prototype.hasOwnProperty.call(state, "pendingCategorization")) {
        state.pendingCategorization = null;
    }
    if (!Object.prototype.hasOwnProperty.call(state, "lastSources")) {
        state.lastSources = null;
    }

    scope.setStoredModeState?.("insights", state);
    if (scope.mode === "insights") {
        scope.modeState = state;
    }

    return state;
}

function recordInsightCategorization(scope, payload) {
    const state = ensureInsightState(scope);
    if (!state) {
        return;
    }

    const entry = {
        type: "categorization",
        timestamp: new Date().toISOString(),
        ...payload,
    };

    state.lastAction = entry;

    const nextHistory = [entry, ...(state.history || [])].slice(0, MAX_HISTORY_LENGTH);
    const nextCategorizations = [entry, ...(state.categorizations || [])].slice(0, MAX_HISTORY_LENGTH);

    state.history = nextHistory;
    state.categorizations = nextCategorizations;

    scope.setStoredModeState?.("insights", state);
    if (scope.mode === "insights") {
        scope.modeState = state;
    }
    scope.touchSession?.();
}

const logger = getLogger('agent_module_suggest_categories', "debug", 0); // Debug level for moduleA

export async function implementation(params, scope, notify){
    notify("Fetching data...")
    let items, toSummarize, resolvedSourceIds
    try {
        ;[items, toSummarize, resolvedSourceIds] = await getDataForAgentAction( params, scope)
    } catch (error) {
        logger.warn("suggest_categories aborted", { error: error?.message, chatId: scope.chatUUID })
        return { error: error?.message ?? "Unable to find connected data" }
    }

    const toProcess = toSummarize.map(d=>Array.isArray(d) ? d.join(", ") : d)
    const literal = false

    if( toSummarize.length > 1000 && !params.limit && !params.confirmed){
        return {result: `There are ${toSummarize.length} results to process - confirm user is happy to wait and call again with confirmed=true`}
    }
    if(items.length === 0){
      if( toSummarize.length === 0 ){
        return {error: `No data returned for field ${params.field}`}
      }
      return {error: `No data `}
    }
    notify(`[[chat_scope:${resolvedSourceIds.join(",")}]]`, false, true)
    

    notify("Analyzing...")
    const result = await buildCategories( toProcess, {
        count: params.number ,
        types: params.type, 
        themes: params.theme, 
        literal,
        batch: 500,
        engine:  "o3-mini"
    }) 

    logger.debug(` -- Got ${result.categories?.length} suggested categories`,  {chatId: scope.chatUUID})
    if( result.categories?.length > 0){
        const itemReferenceIds = Array.from(new Set(items.map(d=>d.referenceId)))
        const categories = result.categories.map(d=>({title:d.t, description: d.d}))

        const suggestedTitle = params.theme
            ? `${params.theme} categorization`
            : params.field
                ? `Categorization of ${params.field}`
                : "LLM categorization";

        let parentId = null;
        if (resolvedSourceIds?.length) {
            const sourcePrimitives = await fetchPrimitives(resolvedSourceIds);
            parentId = sourcePrimitives?.find?.(p => p && (p.type === "view" || p.type === "query"))?.id ?? null;
            if( !parentId && sourcePrimitives[0]){
              const alternativeParent = await findPrimitiveOriginParent( sourcePrimitives[0], ["board", "flow"])
              if( alternativeParent ){
                logger.info(`-- Redirected parent to ${alternativeParent.id} / ${alternativeParent.plainId} / ${alternativeParent.type}`)
                parentId = alternativeParent.id
              }
            }
        }

        const payload = {
            field: params.field,
            theme: params.theme,
            count: params.number,
            referenceIds: itemReferenceIds,
            title: suggestedTitle,
            categories,
            parentId,
        };

        recordInsightCategorization(scope, payload);

        const response = {
            suggestedCategoriesFor: params.sourceIds,
            categorizationField: params.field,
            categories,
        };

        if (parentId) {
            response.forClient = ["context"];
            response.context = {
                canCreate: true,
                action_title: "Create categorization",
                type: "categorization",
                ...payload,
            };
        }

        return response
    }
    return {error: "Couldnt complete analysis"}
}
export const definition = {
        "name": "suggest_categories",
        "description": "Analyzes the indicated source from sourceIds to identify suitable categories aligned with the specified theme. Default to using all data unless the user asks to use a sample instead. This function fetches data - no need to call sample_data first",
        "parameters": {
          "type": "object",
          "properties": {
            "sourceIds": {
              "type": "array",
              "items": {
                "type": "string"
              },
              "minItems": 1,
              "description": "One or more source IDs whose data will be categorized."
            },
            "theme": {
              "type": "string",
              "description": "The type of characterization to perform (e.g. 'the core CTA in the post', 'the underlying problem behind the issue described', 'the key capabilities the company offers')."
            },
            "type": {
              "type": "string",
              "description": "A short description of the items to be categorized (eg 'interviews', 'posts', 'companies'"
            },
            "field": {
              "type": "string",
              "description": "The field from the data object to be used for categorization (call object_params to determine best fit)"
            },
            "number": {
              "type": "number",
              "description": "The desired number of categories (between 2 and 20, default to 8)."
            },
            "limit": {
              "type": "number",
              "description": "Optional, indicating the size of the data sample to be used for categorization - omit to use all data. "
            },
            "confirmed": {
              "type": "boolean",
              "description": "Optional flag indicating if the user has given confirmation to run on large data sets"
            },
          },
          "required": ["sourceIds", "theme", "field", "number"]
        }
}
