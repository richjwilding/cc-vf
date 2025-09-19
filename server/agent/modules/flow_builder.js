import { getLogger } from "../../logger.js";
import { dispatchControlUpdate, addRelationship } from "../../SharedFunctions.js";
import { createWorkflowInstance } from "../../workflow.js";
import { resolveId } from "../utils.js";

const logger = getLogger("agent_module_flow_builder", "debug", 0);

async function updateWorkingState(params, scope, notify) {
  notify?.(`[[current_state:${JSON.stringify(params)}]]`, false, true);
  const parent = scope.parent;

  const mappedInputs = Object.fromEntries(
    Object.entries(params.inputs ?? {}).map(([k, v]) => [k, Array.isArray(v) ? v.join(", ") : v]),
  );
  const mappedConfig = Object.fromEntries(
    Object.entries(params.configuration ?? {}).map(([k, v]) => [`fc_${k}`, Array.isArray(v) ? v.join(", ") : v]),
  );

  const configEntries = Object.entries(parent.referenceParameters?.configurations ?? {});
  const inputEntries = Object.entries(parent.referenceParameters?.inputPins ?? {});
  const inScopeEntries = inputEntries.filter(([key, value]) => {
    if (!value.validForConfigurations) {
      return true;
    }
    return value.validForConfigurations.some((rule) => {
      const values = [params.configuration?.[rule.config]].flat().filter(Boolean);
      return [rule.values].flat().some((candidate) => values.includes(candidate));
    });
  });

  if (params.finalized && scope.primitive) {
    notify?.("Preparing flow...");
    const missingEntries = inScopeEntries.filter(([key]) => !mappedInputs[key]);

    logger.debug(missingEntries.map(([key, meta]) => `${meta.name} (${key})`).join("\n"), {
      chatId: scope.chatUUID,
    });

    if (missingEntries.length > 0) {
      return {
        validation: "failed",
        missing_inputs: Object.fromEntries(missingEntries.map(([key, meta]) => [key, meta.name])),
        instructions: "Chat with the user to help them complete the missing inputs",
      };
    }

    if (scope.primitive.type === "flow") {
      logger.info("--> Creating flow instance", { chatId: scope.chatUUID });
      const newPrim = await createWorkflowInstance(scope.primitive, {
        data: {
          ...mappedInputs,
          ...mappedConfig,
        },
      });
      if (scope.session?.state) {
        scope.session.state.lastSaved = new Date().toISOString();
      }
      return {
        __WITH_SUMMARY: true,
        summary: `Your new workflow W-${newPrim.plainId} is running. Click here [[new:${newPrim.id}]] to view`,
      };
    }

    logger.info(`--> Updating primitive ${scope.primitive.id}`, { chatId: scope.chatUUID });
    const updated = {
      ...(scope.primitive.referenceParameters ?? {}),
      ...mappedInputs,
      ...mappedConfig,
    };
    dispatchControlUpdate(scope.primitive.id, "referenceParameters", updated);
    if (scope.session?.state) {
      scope.session.state.lastSaved = new Date().toISOString();
    }
  }

  return params;
}

async function connectObjects(params, scope) {
  const [left, right] = await resolveId([params.left_id, params.right_id], scope);
  logger.info(
    `Connect ${params.left_id} (${left?.id} / ${left?.plainId}) >> ${params.right_id} (${right?.id} / ${right?.plainId})`,
    { chatId: scope.chatUUID },
  );

  if (!left || !right) {
    return { result: "error connecting" };
  }

  let rightPin = params.right_pin;
  if (right.type === "search") {
    if (rightPin === "subreddits" || rightPin === "hashtags") {
      rightPin = "terms";
    }
  }

  if (rightPin === "impin") {
    await addRelationship(right.id, left.id, "imports");
    if (params.left_pin !== "impout") {
      await addRelationship(left.id, right.id, `outputs.${params.left_pin}_${rightPin}`);
    }
  } else {
    await addRelationship(right.id, left.id, `inputs.${params.left_pin}_${rightPin}`);
  }

  return { result: "connected" };
}

export const flowBuilderTools = [
  {
    definition: {
      name: "update_working_state",
      description: "Store or finalize workflow configuration and input selections.",
      parameters: {
        type: "object",
        required: [],
        properties: {
          finalized: { type: "boolean" },
          configuration: { type: "object" },
          inputs: { type: "object" },
        },
        additionalProperties: true,
      },
    },
    implementation: updateWorkingState,
  },
  {
    definition: {
      name: "connect_objects",
      description: "Connect two graph objects via their input/output pins.",
      parameters: {
        type: "object",
        required: ["left_id", "right_id"],
        properties: {
          left_id: {
            type: "string",
            description: "UUID of the source object (output)",
          },
          left_pin: {
            type: "string",
            description: "Output pin on the source object",
          },
          right_id: {
            type: "string",
            description: "UUID of the destination object (input)",
          },
          right_pin: {
            type: "string",
            description: "Input pin on the destination object",
          },
        },
        additionalProperties: false,
      },
    },
    implementation: connectObjects,
  },
];

export const flowBuilderMode = {
  id: "flow_builder",
  label: "Workflow builder",
  toolNames: new Set(["company_search", "update_working_state", "prepare_search_preprocessing", "prepare_categorization_preprocessing", "connect_objects"]),
  systemPrompt:
    "You are the Sense workflow AI. Help the user configure automated research flows by gathering precise inputs and confirming final state before execution.",
  enterTriggers: [
    /\b(workflow|flow builder|configure flow|setup automation)\b/i,
  ],
  exitTriggers: [
    /\b(exit workflow|stop flow builder|back to board)\b/i,
  ],
  createState: () => ({
    lastSaved: null,
  }),
  contextName: "FLOW_CONTEXT",
  buildContext: (state = {}, scope = {}) => ({
    workflow_id: scope.primitive?.id ?? null,
    last_saved: state.lastSaved,
  }),
};

export { updateWorkingState, connectObjects };

