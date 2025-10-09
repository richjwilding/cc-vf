import { getLogger } from "../../logger.js";
import { createPrimitive, dispatchControlUpdate } from "../../SharedFunctions.js";
import Primitive from "../../model/Primitive.js";
import { implementation as getDataSourcesImplementation, definition as getDataSourcesDefinition } from "./get_data_sources.js";
import { implementation as companySearchImplementation, definition as companySearchDefinition } from "./company_search.js";
import { mapSearchConfigForPlatform } from "../utils.js";

const logger = getLogger("agent_module_search", "debug", 0);

const PLATFORM_REFERENCE = {
  reddit: { referenceId: 67, config: { sources: [8] } },
  quora: { referenceId: 67, config: { sources: [10] } },
  instagram: { referenceId: 67, config: { sources: [4] } },
  trustpilot: { referenceId: 67, config: { sources: [9] } },
  google_news: { referenceId: 68, config: { sources: [1] } },
  google_search: { referenceId: 68, config: { sources: [2] } },
};

function defaultSearchState() {
  return {
    createdSearches: [],
  };
}

async function createSearch(params, scope, notify) {
  const { platform, confirm_user, ...config } = params;
  const { title, ...searchConfig } = mapSearchConfigForPlatform(config, platform);

  const platformConfig = PLATFORM_REFERENCE[platform];
  if (!platformConfig || !scope.primitive) {
    return { result: "Cant create in agent" };
  }

  const finalConfig = {
    countPerTerm: true,
    ...platformConfig.config,
    ...searchConfig,
  };

  const data = {
    workspaceId: scope.primitive.workspaceId,
    parent: scope.primitive.id,
    data: {
      type: "search",
      referenceId: platformConfig.referenceId,
      title,
      referenceParameters: finalConfig,
    },
  };

  const newPrim = await createPrimitive(data);
  if (!newPrim) {
    return { result: "Error creating" };
  }

  await scope.linkToChat?.(newPrim.id);
  scope.session?.state?.createdSearches?.push?.(newPrim.id);
  notify?.(`Created search [[id:${newPrim.id}]]`, false, true);

  return { result: `Created new search with id ${newPrim.plainId}` };
}

async function updateSearchObject(params, scope) {
  const results = await Primitive.aggregate([
    { $match: { workspaceId: scope.workspaceId, type: "search", plainId: parseInt(params.id, 10) } },
    {
      $lookup: {
        from: "categories",
        localField: "referenceId",
        foreignField: "id",
        as: "category",
      },
    },
    { $unwind: { path: "$category", preserveNullAndEmptyArrays: true } },
  ]);

  const targetPrimitive = results[0] ? Primitive.hydrate(results[0]) : null;

  if (targetPrimitive && params.config) {
    const config = targetPrimitive.referenceParameters ?? {};
    const platform = (config.sources || [])
      .map((s) => targetPrimitive.category?.parameters?.sources?.options?.find((opt) => opt.id === s)?.platform)
      .filter(Boolean);

    if (platform[0] && platform[0] !== params.platform) {
      logger.warn(
        `Possible mismatch on platform from agent (${params.platform}) vs primitive (${platform[0]})`,
        { chatId: scope.chatUUID },
      );
    }

    const mapped = mapSearchConfigForPlatform(params.config, platform[0] || params.platform);
    const newConfig = { ...config, ...mapped };
    await dispatchControlUpdate(targetPrimitive.id, "referenceParameters", newConfig);
  }

  return { done: true };
}

async function prepareSearchPreprocessing(params, scope) {
  const data = {
    workspaceId: scope.primitive.workspaceId,
    parent: scope.primitive.id,
    data: {
      type: "action",
      referenceId: 136,
      title: params?.title ?? "Search terms generation",
      referenceParameters: {
        prompt: params.prompt,
      },
    },
  };

  const newPrim = await createPrimitive(data);
  if (newPrim) {
    await scope.linkToChat?.(newPrim.id);
    return { result: `Created new pre-processor with id ${newPrim.plainId}` };
  }

  return { result: "Error creating" };
}

function buildSearchTool({ name, description, properties, required }) {
  return {
    definition: {
      name,
      description,
      parameters: {
        type: "object",
        required,
        properties,
        additionalProperties: false,
      },
    },
  };
}

function wrapSearchTool(tool, platform) {
  return {
    definition: tool.definition,
    implementation: async (params, scope, notify) =>
      createSearch({ ...params, platform }, scope, notify),
  };
}

async function fetchExistingSearches(params = {}, scope, notify) {
  const result = await getDataSourcesImplementation(params, scope, notify);

  const noResults =
    !result ||
    (Array.isArray(result) && result.length === 0) ||
    (typeof result === "object" && result?.result === "No relevant searches");

  if (noResults) {
    notify?.("No saved searches were found in this workspace.", true);
  }

  return result;
}

const commonSearchFields = {
  title: {
    type: "string",
    description: "A 5–10 word title describing the search",
  },
  number_of_results: {
    type: "number",
    description: "The number of results to include in the search object",
  },
  textual_filter: {
    type: "string",
    description:
      "~50 word brief describing the desired content; used alongside fetched content to filter relevance",
  },
  search_time: {
    type: "string",
    description: "Time period filter (e.g., last day, week, month, year)",
  },
};

const termArray = {
  type: "array",
  minItems: 10,
  items: { type: "string" },
};

const searchTools = [
  {
    definition: companySearchDefinition,
    implementation: companySearchImplementation,
  },
  {
    definition: {
      ...getDataSourcesDefinition,
      name: "fetch_existing_searches",
      description:
        "List saved searches the workspace already has so you can reuse or reference them before creating new ones.",
    },
    implementation: fetchExistingSearches,
  },
  {
    definition: {
      name: "prepare_search_preprocessing",
      description:
        "Creates a preprocessing step with an LLM prompt to prepare inputs for a search task aligned to the chat context.",
      parameters: {
        type: "object",
        required: ["prompt"],
        properties: {
          title: {
            type: "string",
            description: "Optional short label for the preprocessing action",
          },
          prompt: {
            type: "string",
            description:
              "LLM-ready instructions describing how to transform user-provided context into search terms",
          },
        },
        additionalProperties: false,
      },
    },
    implementation: prepareSearchPreprocessing,
  },
  wrapSearchTool(
    buildSearchTool({
      name: "search_google_news",
      description:
        "Enqueue a Google News search configuration that gathers recent articles matching provided terms.",
      required: ["title", "number_of_results", "textual_filter", "search_time", "terms"],
      properties: {
        ...commonSearchFields,
        terms: {
          ...termArray,
          description: "Search terms tuned to Google News; at least 10 distinct options",
        },
      },
    }),
    "google_news",
  ),
  wrapSearchTool(
    buildSearchTool({
      name: "search_google_search",
      description: "Schedule a Google Web Search job retrieving pages that match the supplied terms.",
      required: ["title", "number_of_results", "textual_filter", "search_time", "terms"],
      properties: {
        ...commonSearchFields,
        search_sites: {
          type: "string",
          description: "Optional comma separated domains to restrict the search",
        },
        terms: {
          ...termArray,
          description:
            "Search terms tuned to Google Search; avoid brand names when searching multiple company sites",
        },
      },
    }),
    "google_search",
  ),
  wrapSearchTool(
    buildSearchTool({
      name: "search_google_patents",
      description: "Create a Google Patents search for documents matching the supplied terms.",
      required: ["title", "number_of_results", "textual_filter", "search_time", "terms"],
      properties: {
        ...commonSearchFields,
        terms: {
          ...termArray,
          description: "Search terms tuned to Google Patents; at least 10 distinct options",
        },
      },
    }),
    "google_patents",
  ),
  wrapSearchTool(
    buildSearchTool({
      name: "search_instagram",
      description: "Schedule an Instagram hashtag search retrieving matching posts.",
      required: ["title", "number_of_results", "textual_filter", "search_time", "hashtags"],
      properties: {
        ...commonSearchFields,
        hashtags: {
          type: "array",
          minItems: 10,
          items: { type: "string", pattern: "^#.+" },
          description: "Distinct Instagram hashtags (include the leading #)",
        },
      },
    }),
    "instagram",
  ),
  wrapSearchTool(
    buildSearchTool({
      name: "search_reddit",
      description: "Schedule a Reddit search across provided subreddits.",
      required: ["title", "number_of_results", "textual_filter", "search_time", "subreddits"],
      properties: {
        ...commonSearchFields,
        subreddits: {
          type: "array",
          minItems: 5,
          items: { type: "string", format: "uri" },
          description: "Full subreddit URLs (e.g., https://www.reddit.com/r/example)",
        },
      },
    }),
    "reddit",
  ),
  wrapSearchTool(
    buildSearchTool({
      name: "search_linkedin_posts",
      description: "Queue a LinkedIn post search filtered by the provided terms.",
      required: ["title", "number_of_results", "textual_filter", "search_time", "terms"],
      properties: {
        ...commonSearchFields,
        terms: {
          ...termArray,
          description: "LinkedIn search terms; at least 10 precise options",
        },
      },
    }),
    "linkedin_posts",
  ),
  wrapSearchTool(
    buildSearchTool({
      name: "search_quora",
      description: "Schedule a Quora Q&A search matching the supplied terms.",
      required: ["title", "number_of_results", "textual_filter", "search_time", "terms"],
      properties: {
        ...commonSearchFields,
        terms: {
          ...termArray,
          description: "Quora search terms; at least 10 distinct options",
        },
      },
    }),
    "quora",
  ),
  wrapSearchTool(
    buildSearchTool({
      name: "search_tiktok",
      description: "Queue a TikTok content search for videos matching the provided terms.",
      required: ["title", "number_of_results", "textual_filter", "search_time", "terms"],
      properties: {
        ...commonSearchFields,
        terms: {
          ...termArray,
          description: "TikTok search terms; at least 10 distinct options",
        },
      },
    }),
    "tiktok",
  ),
  wrapSearchTool(
    buildSearchTool({
      name: "search_trustpilot",
      description: "Schedule a Trustpilot review search across supplied companies.",
      required: ["title", "number_of_results", "textual_filter", "search_time", "companies"],
      properties: {
        ...commonSearchFields,
        companies: {
          type: "array",
          minItems: 5,
          items: { type: "string" },
          description: "Company names to search on Trustpilot",
        },
      },
    }),
    "trustpilot",
  ),
  {
    definition: {
      name: "update_search_object",
      description:
        "Update fields on an existing search object without recreating it. Only include fields that change.",
      parameters: {
        type: "object",
        required: ["id", "platform", "config"],
        properties: {
          id: {
            type: "string",
            description: "Plain ID of the search object to update",
          },
          platform: {
            type: "string",
            enum: [
              "google_news",
              "google_search",
              "google_patents",
              "instagram",
              "reddit",
              "linkedin_posts",
              "quora",
              "tiktok",
              "trustpilot",
            ],
            description: "Platform the search object belongs to",
          },
          config: {
            type: "object",
            description: "Partial configuration with updates to apply",
            additionalProperties: true,
          },
        },
        additionalProperties: false,
      },
    },
    implementation: updateSearchObject,
  },
];

export const searchMode = {
  id: "search",
  label: "Search",
  description: "Searches the internet and other external sources for new data, also manages existing extrernal searches in the workspace",
  toolNames: new Set([
    ...searchTools.map((t) => t.definition.name),
    "get_data_sources",
    "get_connected_data",
  ]),
  systemPrompt:
    "You are in search mode. Help the user identify and configure new data searches. Confirm intent before scheduling expensive searches.",
  extraInstructions:
    "Before telling the user that no searches exist, call get_connected_data to check the immediate context. If it returns no useful items (empty array, null, or only unrelated sources), immediately call fetch_existing_searches to retrieve all saved searches so you can reference what already exists.",
  enterTriggers: [
    /\b(new data|find data|web search|run a search|google (news|search)|collect)\b/i,
    /\bcreate (a )?(search|scrape)\b/i,
  ],
  exitTriggers: [
    /\b(exit|stop|finished with searches|back to (?:analysis|chat))\b/i,
  ],
  createState: defaultSearchState,
  contextName: "SEARCH_CONTEXT",
  buildContext: (state = {}) => ({ created_searches: state.createdSearches ?? [] }),
};

export { searchTools, createSearch };
