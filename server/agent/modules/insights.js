import OpenAI from "openai";
import { getLogger } from "../../logger.js";

const logger = getLogger("agent_module_insights", "debug", 0);

async function prepareCategorizationPreprocessing(params, scope) {
  const openai = new OpenAI({ apiKey: process.env.OPEN_API_KEY });
  let prompt = "You are an AI assistant helping to prepare a categorization task.\n\n";

  if (scope.flowInfo) {
    prompt += scope.flowInfo;
  }

  prompt += `\nThe user wants to categorize the '${params.field}' parameter of their data based upon ${params.categorization}. Build a thematic prompt which aligns with the flow context provided. Put any configuration input in curly brackets - eg {topic}`;

  const schema = {
    name: "categorization",
    schema: {
      type: "object",
      properties: {
        count: {
          type: "integer",
          description: "The number of categories to produce (default to 6 if unspecified)",
        },
        parameter: {
          type: "string",
          description: "The parameter to categorize by",
        },
        category_prompt: {
          type: "string",
          description:
            "A thematic prompt an LLM can use to generate suitable categories. Do not include counts or parameter names.",
        },
      },
      required: ["category_prompt", "parameter"],
      additionalProperties: false,
    },
  };

  const res = await openai.chat.completions.create({
    model: "gpt-5-mini",
    messages: [
      { role: "user", content: prompt },
    ],
    response_format: { type: "json_schema", json_schema: schema },
  });

  try {
    const msg = JSON.parse(res.choices[0].message?.content || "{}");
    return msg;
  } catch (error) {
    logger.error(error);
    return { error: "couldnt process" };
  }
}

export const insightTools = [
  {
    definition: {
      name: "prepare_categorization_preprocessing",
      description:
        "Generate an LLM-ready prompt that will create a categorization for a specific parameter when executed later.",
      parameters: {
        type: "object",
        required: ["field", "categorization"],
        properties: {
          field: {
            type: "string",
            description: "The field or parameter to categorize",
          },
          categorization: {
            type: "string",
            description: "Description of the theme or grouping the user wants",
          },
        },
        additionalProperties: false,
      },
    },
    implementation: prepareCategorizationPreprocessing,
  },
];

export const insightMode = {
  id: "insights",
  label: "Insight analysis",
  description: "Explores and analyses existing data that the system has already collected",
  toolNames: new Set([
    "get_data_sources",
    "one_shot_query",
    "one_shot_summary",
    "parameter_values_for_data",
    "existing_categorizations",
    "sample_data",
    "suggest_analysis",
    "object_params",
    "prepare_categorization_preprocessing",
  ]),
  systemPrompt:
    "You are in insight mode. Focus on filtering existing data, aggregating results, and running single-shot analyses to answer the user's questions.",
  enterTriggers: [
    /\b(analyze|analysis|insight|query|filter|aggregate|summarize|what (do|does) the data)\b/i,
  ],
  exitTriggers: [
    /\b(exit|stop|back to(?: the)? main chat|switch (?:mode|context))\b/i,
  ],
  createState: () => ({
    lastAction: null,
  }),
  contextName: "INSIGHT_CONTEXT",
  buildContext: (state = {}, scope = {}) => ({
    last_action: state.lastAction,
    selected_sources: scope.immediateContext
      ?.filter((item) => item.type === "search" || item.type === "view" || item.type === "filter")
      ?.map((item) => ({ id: item.id, type: item.type, title: item.title })) ?? [],
  }),
};

export { prepareCategorizationPreprocessing };

