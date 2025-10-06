import { getLogger } from "../../logger";
import Primitive from "../../model/Primitive";
import { executeConcurrently, getConfig } from "../../SharedFunctions";
import { resolveId } from "../utils";

const logger = getLogger('agent_module_get_data_sources', "debug", 0); // Debug level for moduleA

function ensureInsightState(scope) {
    if (!scope) {
        return null;
    }
    let state = null;
    if (scope.mode === "insights" && scope.modeState) {
        state = scope.modeState;
    } else if (scope.getStoredModeState) {
        state = scope.getStoredModeState("insights");
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
    } else {
        if (!Object.prototype.hasOwnProperty.call(state, "pendingCategorization")) {
            state.pendingCategorization = null;
        }
        if (!Object.prototype.hasOwnProperty.call(state, "lastSources")) {
            state.lastSources = null;
        }
    }
    return state;
}

function updateInsightSources(scope, updates = {}) {
    if (!scope) {
        return;
    }
    const state = ensureInsightState(scope);
    if (!state) {
        return;
    }
    const current = state.lastSources ?? {};
    const next = {
        ...current,
        ...updates,
        updated_at: new Date().toISOString(),
    };
    state.lastSources = next;
    scope.setStoredModeState?.("insights", state);
    if (scope.mode === "insights") {
        scope.modeState = state;
    }
    scope.touchSession?.();
}

export async function implementation(params, scope, notify){
    const cache = {imports: {}, categories:{}, primitives:{}, query:{}}
    const activeFlowInstanceId = scope.activeFlowInstanceId
    const pipeline = [
                {
                    $match: {
                    workspaceId: scope.workspaceId,
                    type: "search",
                    deleted: {$exists: false}
                    }
                },

                {
                    $addFields: {
                    _allParents: {
                        $reduce: {
                        input: {
                            $objectToArray: { $ifNull: ["$parentPrimitives", {}] }
                        },
                        initialValue: [],
                        in: { $concatArrays: ["$$value", "$$this.v"] }
                        }
                    }
                    }
                },

                {
                    $match: {
                    $expr: {
                        $and: [
                        {
                            $in: [
                                "primitives.origin",
                                { $ifNull: [ `$parentPrimitives.${scope.constrainTo}`, [] ] }
                                ]
                        },
                        {
                            $or: [
                            { $eq: ["$flowElement", true] },
                            {
                                $not: {
                                $in: ["$primitives.config", "$_allParents"]
                                }
                            }
                            ]
                        }
                        ]
                    }
                    }
                },

                //  { $project: { _allParents: 0 } }
                ];


    if (activeFlowInstanceId) {
        const parentFieldName = activeFlowInstanceId; // e.g. "abcd-1234"
        pipeline.push(
        // 1) simple equality-based lookup to match primitives.config → _id
        {
            $addFields: {
            _configObjIds: {
                $map: {
                input: { $ifNull: ["$primitives.config", []] },
                as: "c",
                in: { $toObjectId: "$$c" }
                }
            }
            }
        },
        {
            $lookup: {
            from: "primitives",
            localField: "_configObjIds",
            foreignField: "_id",
            as: "activeInstanceArr"
            }
        },

        {
            $addFields: {
            activeInstanceArr: {
                $filter: {
                input: "$activeInstanceArr",
                as: "inst",
                cond: {
                    $in: [
                    "primitives.origin",
                    {
                        $ifNull: [
                        // safe-check the dynamic field
                        { $getField: { field: parentFieldName, input: "$$inst.parentPrimitives" } },
                        []
                        ]
                    }
                    ]
                }
                }
            }
            }
        },

        {
            $addFields: {
            "activeInstance": { $arrayElemAt: ["$activeInstanceArr", 0] }
            }
        },

        { $project: { activeInstanceArr: 0 } },
        {
            $addFields: {
                // You can name this whatever makes sense—here I use activeInstanceItemCount
                'activeInstanceItemCount': {
                $size: {
                    $setUnion: [
                    // default to [] if either array is missing
                    { $ifNull: [ '$activeInstance.primitives.origin', [] ] },
                    { $ifNull: [ '$activeInstance.primitives.auto',   [] ] }
                    ]
                }
                }
            }
        }
        );
    }

    pipeline.push(
        {
            $lookup: {
                from: "categories",
                localField: "referenceId",
                foreignField: "id",
                as: "metadata"
            }
        },
        {
            $addFields: {
                metadata: { $arrayElemAt: ["$metadata", 0] }
            }
        }
    );

    const list = await Primitive.aggregate(pipeline)
    
    async function buildAgentResponse(d){
        const config = await getConfig(d, cache)

        const referenceIdsFromMetadata = (config.sources ?? [])
            .map((sourceId) => d.metadata?.parameters?.sources?.options?.find(opt => opt.id === sourceId)?.resultCategoryId)
            .filter(Boolean)

        const referenceIds = Array.from(new Set(referenceIdsFromMetadata));

        const obj = {
            id: d._id,
            type: d.type,
            title: d.title,
            terms: config.terms,
            companies:config.companies,
            site: config.site,
            platforms: (config.sources ?? []).map(s=>d.metadata?.parameters?.sources?.options?.find(d2=>d2.id === s)?.title ?? "Unknown"),
            referenceId: d.referenceId,
            referenceIds,
            current_number_of_results: new Set([...(d.primitives?.origin ?? []), ...(d.primitives?.auto ?? [])]).size,
            target_number_of_results: config.count,
            search_time: config.timeFrame,
            textual_filter: config.topic,
            //number_results: d.result_count
            activeInstance: d.activeInstance?.id,
            number_results: d.activeInstanceItemCount,
            metadata: d.metadata?.parameters ?? undefined,
        }
        return Object.fromEntries(
            Object.entries(obj)
            .filter(([_, v]) => v != null && v !== "")
        );
    }
    const forAgent = (await executeConcurrently(list, buildAgentResponse))?.results ?? {result: "No relevant searches"}
    if (Array.isArray(forAgent)) {
        updateInsightSources(scope, {
            data_sources: forAgent,
            data_sources_updated_at: new Date().toISOString(),
        });
    }
    logger.info('get_data_source', {forAgent, chatUUID: scope.chatUUID})
    return forAgent

}
export const definition = {
    "name": "get_data_sources",
    "description": "Retrieve a list of existing data sources (searches, views, filters), the number of data points it has, optionally filtered by ID or platform. Should be used when trying to identify a data source to build a view for, sample data or query",
    "parameters": {
    "type": "object",
    "properties": {
        "id": {
        "type": "string",
        "description": "The unique identifier of the search object to retrieve."
        },
        "platform": {
        "type": "array",
        "items": {
            "type": "string",
            "enum": [
            "google news",
            "google",
            "google patents",
            "instagram",
            "reddit",
            "linkedin",
            "quora",
            "tiktok",
            "trustpilot"
            ]
        },
        "minItems": 1,
        "description": "One or more platforms to filter the search objects by."
        }
    },
    "additionalProperties": false
    }
}
