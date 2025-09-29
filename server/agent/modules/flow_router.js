import OpenAI from "openai";
import { getLogger } from "../../logger.js";

export let flowRouterEnabled =
  (process.env.AGENT_FLOW_ROUTER_ENABLED ?? "true").toLowerCase() !== "false";

export function setFlowRouterEnabled(enabled) {
  flowRouterEnabled = Boolean(enabled);
}

const FLOW_ROUTER_MODEL = process.env.AGENT_FLOW_ROUTER_MODEL ?? "gpt-4o-mini"; //?? "gpt-5-mini" 
const logger = getLogger("agent_flow_router", "debug", 1);

function buildRouterPrompt(flows, activeFlow, recentUsers = []) {
  const flowIds = Object.keys(flows ?? {});
  if (!flowIds.length) {
    return "You have no flows available. Always respond with {\"decisions\":[]}.";
  }

  const lines = [
    "Decide if the agent should enter, exit, or switch flows before answering the user.",
    'Return ONLY JSON shaped like {"decisions":[{"action":"enter|exit|switch","flow":"id","from":"id","to":"id","rationale":"20 word rationale"}]}',
    "If no change is needed, respond with {\"decisions\":[]}",
    "Do not switch flows unless the user explicitly asks for a different kind of task or tool.",
    "Stay in the current flow if the user appears to be continuing the same thread (e.g., choosing from prior suggestions).",
    "If the user changes use case (ie asks for insights after adding a new serach - or asks for a visualziation after analysis) then you should switch to the new mode",
    `Current active flow: ${activeFlow ?? "none"}.`,
    "Available flows:",
  ];

  for (const id of flowIds) {
    lines.push(`- ${id}: ${flows[id].description}`);
  }

  if (recentUsers.length) {
    lines.push("Recent user messages (oldest first):");
    recentUsers.forEach((msg, idx) => {
      lines.push(`${idx + 1}. ${msg}`);
    });
  }

  console.log(lines)
  return lines.join("\n");
}

function normalizeDecisions(decisions, flows) {
  const validFlows = new Set(Object.keys(flows ?? {}));
  const result = [];

  for (const decision of Array.isArray(decisions) ? decisions : []) {
    if (!decision || typeof decision !== "object") {
      continue;
    }

    const action = typeof decision.action === "string" ? decision.action.toLowerCase() : "";
    if (!action || !["enter", "exit", "switch"].includes(action)) {
      continue;
    }

    if (action === "switch") {
      const from = typeof decision.from === "string" ? decision.from : decision.flow;
      const to = typeof decision.to === "string" ? decision.to : undefined;
      if (validFlows.has(from) && validFlows.has(to)) {
        result.push({ action: "exit", flow: from, viaSwitch: true });
        result.push({ action: "enter", flow: to, viaSwitch: true });
      }
      continue;
    }

    const flow = typeof decision.flow === "string" ? decision.flow : undefined;
    if (validFlows.has(flow)) {
      result.push({ action, flow });
    }
  }

  return result;
}

export async function classifyFlowIntent({ message, flows, activeFlow, recentUsers }) {
  if (!flowRouterEnabled) {
    return null;
  }

  const trimmed = message?.trim();
  if (!trimmed) {
    return null;
  }

  try {
    const prompt = buildRouterPrompt(flows, activeFlow, recentUsers);
    const openai = new OpenAI({ apiKey: process.env.OPEN_API_KEY });
    const completion = await openai.chat.completions.create({
      model: FLOW_ROUTER_MODEL,
      temperature: 0,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: prompt },
        { role: "user", content: trimmed },
      ],
    });

    const text = completion.choices?.[0]?.message?.content;
    if (!text) {
      return null;
    }

    let parsed;
    try {
      parsed = JSON.parse(text);
      console.log(`router result`)
      console.log(parsed)
    } catch (error) {
      logger.warn(`Flow router returned non-JSON payload: ${text}`);
      return null;
    }

    const normalized = normalizeDecisions(parsed.decisions, flows);
    return { decisions: normalized, raw: parsed.decisions };
  } catch (error) {
    logger.warn(`Flow router classification failed: ${error.message}`);
    return null;
  }
}
