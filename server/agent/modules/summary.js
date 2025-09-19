import { getLogger } from "../../logger.js";
import { getConfig } from "../../SharedFunctions.js";
import { processPromptOnText } from "../../openai_helper.js";
import { oneShotQuery } from "../../task_processor.js";

const logger = getLogger("agent_module_summary", "debug", 0);

async function updateQuery(params, scope, notify) {
  try {
    notify?.("Planning...");
    const config = await getConfig(scope.primitive);

    const request = {
      original_prompt: config.prompt,
      requested_change: params.request,
    };

    const result = await processPromptOnText(JSON.stringify(request), {
      workspaceId: scope.workspaceId,
      functionName: "agent-query-terms",
      opener:
        "You are an agent helping a user refine a prompt. You can only change the chosen topic in the prompt - you MUST NOT change the structure, formatting or any other aspect of the prompt",
      prompt: "Here is the information you need",
      output:
        'Return the result in a json object called "result" with a field called \'revised_prompt\' containing the updated prompt and an optional field called \'rejection\' containing a user friendly message about any requested changes that have been rejected',
      engine: "o4-mini",
      debug: true,
      debug_content: true,
      field: "result",
    });

    if (!result.success) {
      return { result: "Query failed" };
    }

    notify?.("Running updated query...");
    const { revised_prompt, rejection } = result.output[0];
    if (rejection) {
      return { rejection };
    }

    const queryResult = (await oneShotQuery(scope.primitive, config, { overridePrompt: revised_prompt, notify }))?.[0];
    if (queryResult?.plain) {
      notify?.(`Updated summary:\n\n${queryResult.plain}`, false);
      return {
        result: "Successfully generated, user can click below to save the update",
        forClient: ["context"],
        create: {
          action_title: "Update summary",
          type: "update_query",
          target: scope.primitive.id,
          data: queryResult,
        },
      };
    }

    return { result: "Query failed" };
  } catch (error) {
    logger.error(`error in agent query`, { chatId: scope.chatUUID });
    logger.error(error);
    return { result: "Query failed" };
  }
}

export const summaryTools = [
  {
    definition: {
      name: "update_query",
      description: "Revise the topic of an existing summary/query and run the updated query.",
      parameters: {
        type: "object",
        required: ["request"],
        properties: {
          request: {
            type: "string",
            description: "User-provided description of the changes to make",
          },
        },
        additionalProperties: false,
      },
    },
    implementation: updateQuery,
  },
];

export { updateQuery };

