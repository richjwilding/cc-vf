import { randomUUID } from "node:crypto";

export function defaultVizState(payload = {}) {
  return {
    id: payload.id ?? randomUUID(),
    status: payload.status ?? "list",
    selection: payload.selection ?? null,
    spec: payload.spec ?? null,
    suggestions: payload.suggestions ?? [],
  };
}

function applyVizSeed(state, seed = {}) {
  if (!seed) {
    return state ?? defaultVizState();
  }
  const normalized = defaultVizState(seed);
  if (!state) {
    return normalized;
  }

  if (Object.prototype.hasOwnProperty.call(seed, "id")) {
    state.id = normalized.id;
  }
  if (Object.prototype.hasOwnProperty.call(seed, "status")) {
    state.status = normalized.status;
  }
  if (Object.prototype.hasOwnProperty.call(seed, "selection")) {
    state.selection = normalized.selection;
  }
  if (Object.prototype.hasOwnProperty.call(seed, "spec")) {
    state.spec = normalized.spec;
  }
  if (Object.prototype.hasOwnProperty.call(seed, "suggestions")) {
    state.suggestions = normalized.suggestions;
  }

  return state;
}

export const vizMode = {
  id: "viz",
  label: "Visualization",
  toolNames: new Set(["design_view", "create_view"]),
  systemPrompt:
    "You are in visualization mode. Partner with the user to iterate on visualization designs and confirm the final configuration before creating it.",
  enterTriggers: [
    /\b(viz|visuali[sz]ation|chart|graph|timeline|pie|heatmap|bar|resume (viz|charts?))\b/i,
  ],
  exitTriggers: [
    /\b(exit|stop|leave (viz|visuali[sz]ation|charts?)|back to board)\b/i,
  ],
  createState: defaultVizState,
  contextName: "VIZ_CONTEXT",
  buildContext: (state = {}) => ({
    suggestion_set_id: state.id,
    current_state: state.status,
    selection: state.selection,
    current_spec: state.spec,
    suggestions_index: (state.suggestions || []).map((s) => ({
      id: s.id,
      chart: s.type,
      label: s.description,
    })),
  }),
  applySeed: applyVizSeed,
};

