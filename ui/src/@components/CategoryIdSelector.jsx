import { useMemo, useState } from "react";
import { Select, SelectItem } from "@heroui/react";
import MainStore from "../MainStore";
import { HeroIcon } from "../HeroIcon";

const mainstore = MainStore();

const defaultPrimitiveTypes = [
  "entity",
  "evidence",
  "result",
  "category",
  "query",
  "activity",
  "marketsegment",
  "detail",
  "summary",
];

function normalizeCategories(categories = []) {
  return categories
    .map((category) => (category ? category : undefined))
    .filter((category) => category);
}

function ensureArray(value) {
  if (Array.isArray(value)) {
    return value;
  }
  if (value === undefined || value === null || value === "") {
    return [];
  }
  return [value];
}

function getCategoryFromId(id) {
  if (id === undefined || id === null) {
    return undefined;
  }
  return mainstore.category(id);
}

function buildOptionKey(option, index) {
  if (option.key !== undefined && option.key !== null) {
    return String(option.key);
  }
  if (option.categoryId !== undefined && option.categoryId !== null) {
    return String(option.categoryId);
  }
  return `option-${index}`;
}

export default function CategoryIdSelector({
  item,
  primitive,
  primitiveList,
  allowNone,
  activeOnly,
  local,
  callback,
  types,
  referenceIds,
  localCategoryId,
  filterForExtractor,
  disabled,
  locked,
  selectionMode,
  selectedValues,
  availableCategories,
  className,
  onSelectionChange,
  showCount = true,
  ...props
}) {
  const resolvedSelectionMode = (selectionMode || item?.selectionMode || (Array.isArray(selectedValues || item?.value) ? "multiple" : "single"));
  const isMultiple = resolvedSelectionMode === "multiple";
  const [internalSelection, setInternalSelection] = useState([]);

  const computed = useMemo(() => {
    const list = [];

    if (allowNone || item?.allowNone) {
      list.push({
        key: "none",
        title: "No items",
        categoryId: undefined,
        category: undefined,
      });
    }

    let available = normalizeCategories(
      availableCategories
        ? availableCategories
        : item?.referenceIds
        ? item.referenceIds.map((id) => getCategoryFromId(id))
        : mainstore.categories()
    );

    let itemCountByType;

    if (activeOnly || item?.activeOnly) {
      if (primitive || primitiveList) {
        const sourceList = (primitiveList ?? [primitive])
          .map((entry) => {
            if (!entry) {
              return [];
            }
            if (entry.type === "category") {
              return entry.origin;
            }
            if (entry.type === "query") {
              return entry.primitives.imports.allItems;
            }
            return entry;
          })
          .flat();

        const uniqueItems = mainstore.uniquePrimitives(sourceList);
        const itemsForProcessing = uniqueItems.map((entry) => entry.itemsForProcessing).flat();
        let lookups = mainstore.uniquePrimitives(
          [itemsForProcessing, itemsForProcessing.map((entry) => entry.primitives.directDescendants)].flat(Infinity)
        );

        if (lookups.length > 0) {
          lookups = [...uniqueItems, ...lookups];
          itemCountByType = {};
          for (const entry of lookups) {
            if (entry.referenceId !== undefined && entry.referenceId !== null) {
              itemCountByType[entry.referenceId] = (itemCountByType[entry.referenceId] ?? 0) + 1;
            }
          }
          const ids = lookups
            .map((entry) => entry.referenceId)
            .flat()
            .filter((id, idx, arr) => id && arr.indexOf(id) === idx);
          available = available.filter((category) => ids.includes(category.id));
        }
      }
    }

    if (filterForExtractor || item?.filterForExtractor) {
      available = available.filter((category) => category?.ai?.extract);
    }

    for (const category of available) {
      if (
        item?.referenceIds ||
        defaultPrimitiveTypes.includes(category.primitiveType)
      ) {
        list.push({
          title: category.title,
          count: itemCountByType ? itemCountByType[category.id] : undefined,
          categoryId: category.id,
          category,
          icon: category.icon,
        });
      }
    }

    let filteredList = list;

    if (types) {
      filteredList = filteredList.filter(
        (entry) => !entry.category || types.includes(entry.category.primitiveType)
      );
    }

    if (referenceIds) {
      filteredList = filteredList.filter((entry) => referenceIds.includes(entry.category?.id));
    }

    return {
      options: filteredList.map((entry, index) => ({
        ...entry,
        key: buildOptionKey(entry, index),
      })),
      itemCountByType,
    };
  }, [
    allowNone,
    activeOnly,
    availableCategories,
    filterForExtractor,
    item,
    primitive,
    primitiveList,
    referenceIds,
    types,
  ]);

  const optionLookup = useMemo(() => {
    const map = new Map();
    computed.options.forEach((option) => {
      map.set(String(option.key), option);
    });
    return map;
  }, [computed.options]);

  const determineSelectedKeys = () => {
    if (isMultiple) {
      const externalValues = selectedValues ?? item?.value ?? internalSelection;
      const values = ensureArray(externalValues);
      const keys = values
        .map((value) => {
          const match = computed.options.find((option) => {
            if (option.categoryId === undefined || option.categoryId === null) {
              return value === undefined || value === null;
            }
            return String(option.categoryId) === String(value);
          });
          return match ? String(match.key) : undefined;
        })
        .filter((value) => value !== undefined);
      return keys;
    }

    const primaryValue = selectedValues ?? item?.value;

    const candidateValues = [
      primaryValue,
      item?.value,
      item?.default,
      primitive?.referenceParameters?.[item?.key],
      primitive?.referenceParameters?.referenceId,
      localCategoryId,
    ].filter((value) => value !== undefined && value !== null);

    for (const value of candidateValues) {
      const match = computed.options.find((option) => {
        if (option.categoryId === undefined || option.categoryId === null) {
          return value === undefined || value === null;
        }
        return String(option.categoryId) === String(value);
      });
      if (match) {
        return [String(match.key)];
      }
    }

    if (
      local &&
      (activeOnly || item?.activeOnly) &&
      primitiveList?.length > 0
    ) {
      const fallback = computed.options.find(
        (option) => option.categoryId === primitiveList[0]?.referenceId
      );
      if (fallback) {
        return [String(fallback.key)];
      }
    }

    return [];
  };

  const selectedKeys = determineSelectedKeys();

  const handleSelection = (keys) => {
    const normalizedKeys = ensureArray(keys);
    const selections = normalizedKeys
      .map((key) => optionLookup.get(String(key)))
      .filter((entry) => entry);

    if (isMultiple) {
      const categoryIds = selections
        .map((entry) => entry.categoryId)
        .filter((id) => id !== undefined && id !== null)
        .map((id) => (typeof id === "number" ? id : parseInt(id)));

      if (onSelectionChange) {
        onSelectionChange(selections);
      }

      if (callback) {
        callback(categoryIds);
      } else if (primitive && item?.key) {
        primitive.setParameter(item.key, categoryIds);
      } else {
        setInternalSelection(categoryIds);
      }
    } else {
      const selection = selections[0];
      const categoryId = selection?.categoryId;
      const parsedId =
        categoryId === undefined || categoryId === null
          ? undefined
          : typeof categoryId === "number"
          ? categoryId
          : parseInt(categoryId);

      if (onSelectionChange) {
        onSelectionChange(selection ? [selection] : []);
      }

      if (callback) {
        callback(parsedId);
      } else if (primitive && item?.key) {
        primitive.setParameter(item.key, parsedId);
      }
    }
  };

  const handleChange = (event) => {
    const value = event?.target?.value;
    if (isMultiple) {
      handleSelection(value ? value.split(",") : []);
    } else {
      handleSelection(value ? [value] : []);
    }
  };

  return (
    <Select
      className={className ?? (props.compact || props.inline ? "" : "ml-auto w-full")}
      disallowEmptySelection={!isMultiple && !(allowNone || item?.allowNone)}
      disabled={disabled ?? locked ?? item?.locked}
      label={props.label}
      placeholder={item?.placeholder || "Select category"}
      selectedKeys={selectedKeys}
      selectionMode={resolvedSelectionMode}
      size={props.compact || props.inline ? "sm" : "md"}
      onChange={handleChange}
      variant={props.variant || "bordered"}
    >
      {computed.options.map((option) => (
        <SelectItem
          key={option.key}
          textValue={option.title}
          endContent={
            showCount && option.count !== undefined && option.count !== null ? (
              <span className="text-tiny text-default-500">{option.count}</span>
            ) : undefined
          }
          startContent={
            option.icon ? (
              <HeroIcon icon={option.icon} className="w-4 h-4 text-default-500" />
            ) : undefined
          }
        >
          {option.title}
        </SelectItem>
      ))}
    </Select>
  );
}