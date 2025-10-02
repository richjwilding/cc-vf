// sharedLayout.js
// Centralized helpers for dealing with slide layout specs so we can reuse them across server/UI.

function canonicalizeKey(value) {
  if (value == null) {
    return "";
  }
  return value.toString().trim().toLowerCase().replace(/[^a-z0-9]+/g, "_");
}

const LAYOUT_SLOT_ALIASES = new Map([
  ["top_right", "top_right"],
  ["top-right", "top_right"],
  ["upper_right", "top_right"],
  ["upper right", "top_right"],
  ["tr", "top_right"],
  ["top_left", "top_left"],
  ["top-left", "top_left"],
  ["upper_left", "top_left"],
  ["upper left", "top_left"],
  ["tl", "top_left"],
  ["top_center", "top_center"],
  ["top-centre", "top_center"],
  ["top center", "top_center"],
  ["center_top", "top_center"],
  ["middle_top", "top_center"],
  ["middle_left", "middle_left"],
  ["center_left", "middle_left"],
  ["middle_left", "middle_left"],
  ["middle_right", "middle_right"],
  ["center_right", "middle_right"],
  ["callout", "callout"],
  ["cta", "callout"],
  ["spotlight", "callout"],
  ["center", "center"],
  ["centre", "center"],
  ["middle", "center"],
  ["bottom_right", "bottom_right"],
  ["lower_right", "bottom_right"],
  ["br", "bottom_right"],
  ["bottom_left", "bottom_left"],
  ["lower_left", "bottom_left"],
  ["bl", "bottom_left"],
  ["bottom_center", "bottom_center"],
  ["footer", "bottom_full"],
  ["bottom_full", "bottom_full"],
  ["full_width", "full_width"],
  ["full-width", "full_width"],
  ["full width", "full_width"],
  ["full", "full_width"],
  ["hero", "full_width"],
  ["sidebar", "sidebar_right"],
  ["right_sidebar", "sidebar_right"],
  ["sidebar_right", "sidebar_right"],
  ["left_sidebar", "sidebar_left"],
  ["sidebar_left", "sidebar_left"],
  ["left column", "sidebar_left"],
  ["right column", "sidebar_right"],
].map(([alias, canonical]) => [canonicalizeKey(alias), canonical]));

const LAYOUT_SIZE_ALIASES = new Map([
  ["full", "full"],
  ["full_width", "full"],
  ["wide", "full"],
  ["half", "half"],
  ["50%", "half"],
  ["fifty", "half"],
  ["third", "third"],
  ["thirds", "third"],
  ["column", "third"],
  ["narrow", "third"],
  ["quarter", "quarter"],
  ["25%", "quarter"],
  ["cta", "callout"],
  ["callout", "callout"],
  ["pill", "callout"],
  ["strip", "callout"],
  ["sidebar", "sidebar"],
].map(([alias, canonical]) => [canonicalizeKey(alias), canonical]));

const LAYOUT_EMPHASIS_ALIASES = new Map([
  ["primary", "primary"],
  ["main", "primary"],
  ["hero", "primary"],
  ["highlight", "primary"],
  ["secondary", "secondary"],
  ["supporting", "supporting"],
  ["context", "supporting"],
  ["callout", "callout"],
  ["cta", "callout"],
  ["action", "callout"],
].map(([alias, canonical]) => [canonicalizeKey(alias), canonical]));

function lookupAlias(value, aliasMap) {
  const key = canonicalizeKey(value);
  if (!key) {
    return null;
  }
  return aliasMap.get(key) ?? null;
}

function normalizeSectionLayoutSpec(input) {
  if (input == null) {
    return null;
  }
  if (typeof input === "string") {
    const slot = lookupAlias(input, LAYOUT_SLOT_ALIASES);
    return slot ? { slot } : null;
  }
  if (typeof input !== "object") {
    return null;
  }

  if (input.clear === true) {
    return null;
  }

  const slot = lookupAlias(
    input.slot ?? input.area ?? input.region ?? input.position ?? input.place ?? input.column,
    LAYOUT_SLOT_ALIASES
  );
  const size = lookupAlias(input.size ?? input.span ?? input.width ?? input.footprint, LAYOUT_SIZE_ALIASES);
  const emphasis = lookupAlias(input.emphasis ?? input.priority ?? input.weight ?? input.highlight, LAYOUT_EMPHASIS_ALIASES);

  let notes = input.notes ?? input.comment ?? input.description ?? input.text ?? null;
  if (typeof notes === "string") {
    notes = notes.trim();
  } else {
    notes = null;
  }

  const result = {};
  if (slot) result.slot = slot;
  if (size) result.size = size;
  if (emphasis) result.emphasis = emphasis;
  if (notes) result.notes = notes;
  return Object.keys(result).length ? result : null;
}

function mergeSectionLayoutSpecs(existing, incoming) {
  const base = existing ? normalizeSectionLayoutSpec(existing) : null;
  const addition = incoming ? normalizeSectionLayoutSpec(incoming) : null;
  if (base && addition) {
    return { ...base, ...addition };
  }
  return addition || base || null;
}

function resolveSectionLayout(existing, generated, requested) {
  const base = existing ? normalizeSectionLayoutSpec(existing) : null;
  const generatedNormalized = generated ? normalizeSectionLayoutSpec(generated) : null;
  let result = base || generatedNormalized || null;
  if (requested) {
    const normalizedRequest = normalizeSectionLayoutSpec(requested);
    if (normalizedRequest) {
      result = { ...(result || {}), ...normalizedRequest };
    }
  }
  return result;
}

function interpretClearLayout(value) {
  if (value === null) {
    return true;
  }
  if (typeof value === "string") {
    const key = canonicalizeKey(value);
    return key === "none" || key === "clear" || key === "remove" || key === "reset" || key === "unset";
  }
  if (value && typeof value === "object" && value.clear === true) {
    return true;
  }
  return false;
}

function extractLayoutRequest(layoutValue, clearToken) {
  if (interpretClearLayout(clearToken)) {
    return { update: null, clear: true };
  }
  if (interpretClearLayout(layoutValue)) {
    return { update: null, clear: true };
  }
  const normalized = normalizeSectionLayoutSpec(layoutValue);
  return { update: normalized, clear: false };
}

function resolveLayoutKind(layoutValue) {
  if (!layoutValue) return null;
  if (typeof layoutValue === "string") {
    return canonicalizeKey(layoutValue);
  }
  if (typeof layoutValue === "object") {
    const raw =
      layoutValue.kind ??
      layoutValue.type ??
      layoutValue.layout ??
      layoutValue.style ??
      layoutValue.name ??
      null;
    return canonicalizeKey(raw);
  }
  return null;
}

const PRESET_LAYOUTS = {
  left_summary: (count) => {
    if (!count) return [];
    const entries = [];
    if (count >= 1) {
      entries.push({ index: 0, layout: { slot: "sidebar_left", size: "full", emphasis: "primary" } });
    }
    if (count >= 2) {
      entries.push({ index: 1, layout: { slot: "top_right", size: "half", emphasis: "supporting" } });
    }
    if (count >= 3) {
      entries.push({ index: 2, layout: { slot: "bottom_right", size: "half", emphasis: "supporting" } });
    }
    return entries;
  },
  full_page: (count) => {
    if (!count) return [];
    return [{ index: 0, layout: { slot: "full_page", size: "full", emphasis: "primary" } }];
  },
  full_width: (count) => {
    if (!count) return [];
    return [{ index: 0, layout: { slot: "full_width", size: "full", emphasis: "primary" } }];
  },
};

function buildLayoutPreset(layoutValue, sectionCount) {
  const layoutObject =
    layoutValue && typeof layoutValue === "object" && !Array.isArray(layoutValue)
      ? { ...layoutValue }
      : layoutValue
      ? { kind: canonicalizeKey(layoutValue) }
      : {};

  const existingSections = Array.isArray(layoutObject.sections)
    ? layoutObject.sections
    : null;

  if (existingSections && existingSections.length) {
    const normalizedSections = existingSections
      .map((entry, idx) => {
        const normalized = normalizeSectionLayoutSpec(entry?.layout ?? entry);
        if (!normalized) return null;
        const index = Number.isInteger(entry?.index)
          ? entry.index
          : Number.isInteger(entry?.section_id)
          ? entry.section_id
          : idx;
        return { index, layout: normalized };
      })
      .filter(Boolean);

    return {
      layout: { ...layoutObject, sections: normalizedSections.map((entry) => ({ index: entry.index, layout: entry.layout })) },
      sectionLayouts: normalizedSections,
    };
  }

  const kind = resolveLayoutKind(layoutValue);
  const generator = kind ? PRESET_LAYOUTS[kind] : null;
  if (!generator) {
    return null;
  }
  const generated = generator(sectionCount || 0);
  if (!generated || !generated.length) {
    return null;
  }

  const normalizedGenerated = generated
    .map((entry, idx) => {
      const normalized = normalizeSectionLayoutSpec(entry?.layout ?? entry);
      if (!normalized) return null;
      const index = Number.isInteger(entry?.index) ? entry.index : idx;
      return { index, layout: normalized };
    })
    .filter(Boolean);

  const layout = {
    ...layoutObject,
    kind: layoutObject.kind ?? kind,
    sections: normalizedGenerated.map((entry) => ({ index: entry.index, layout: entry.layout })),
  };

  return { layout, sectionLayouts: normalizedGenerated };
}

function applyLayoutPresetToSections(layoutValue, sections) {
  const preset = buildLayoutPreset(layoutValue, sections.length);
  if (!preset) {
    return { layout: layoutValue, sections };
  }
  const updatedSections = sections.map((section, index) => {
    const hint = preset.sectionLayouts.find((entry) => entry.index === index);
    if (!hint) {
      return section;
    }
    const mergedLayout = mergeSectionLayoutSpecs(section.layout, hint.layout);
    if (!mergedLayout) {
      return section;
    }
    return { ...section, layout: mergedLayout };
  });
  return { layout: preset.layout, sections: updatedSections };
}

export {
  canonicalizeKey,
  extractLayoutRequest,
  interpretClearLayout,
  mergeSectionLayoutSpecs,
  normalizeSectionLayoutSpec,
  resolveSectionLayout,
  LAYOUT_SLOT_ALIASES,
  LAYOUT_SIZE_ALIASES,
  LAYOUT_EMPHASIS_ALIASES,
  buildLayoutPreset,
  applyLayoutPresetToSections,
};
