import React, { useEffect, useMemo, useState } from 'react';
import {
  Button,
  Card,
  CardBody,
  CardHeader,
  Divider,
  Input,
  Select,
  SelectItem,
  Table,
  TableHeader,
  TableColumn,
  TableBody,
  TableRow,
  TableCell,
} from '@heroui/react';
import toast from 'react-hot-toast';
import CategoryIdSelector from '../@components/CategoryIdSelector.jsx';
import MainStore from '../MainStore';
import { Icon } from '@iconify/react/dist/iconify.js';

const mainstore = MainStore();

const TARGET_PREFIX = 'referenceParameters.';

const compactInputClassNames = {
  label: 'text-xs font-medium text-default-500',
  inputWrapper: 'h-8 min-h-8 px-2.5 py-1 rounded-medium',
  innerWrapper: 'h-full',
  input: 'text-small',
};

const compactSelectClassNames = {
  label: 'text-xs font-medium text-default-500',
  trigger: 'h-8 min-h-8 px-2.5 py-1 rounded-medium',
  value: 'text-small',
};

const compactTableClassNames = {
  wrapper: 'p-0',
  table: 'text-small',
  thead: 'bg-default-100 text-default-500',
  th: 'py-1.5 px-2 text-xs font-medium uppercase tracking-wide',
  td: 'py-1.5 px-2 align-middle',
  tr: 'border-b border-default-200 last:border-b-0',
};

const getTypeForCategory = (categoryId) => {
  if (categoryId === undefined || categoryId === null || categoryId === '') {
    return undefined;
  }
  const category = mainstore.category(categoryId);
  return category?.primitiveType || category?.type || undefined;
};

const getParameterKeyFromTarget = (target) => {
  if (typeof target !== 'string' || target.length === 0) {
    return null;
  }
  if (target.startsWith(TARGET_PREFIX)) {
    const remainder = target.slice(TARGET_PREFIX.length);
    const [firstSegment] = remainder.split('.');
    return firstSegment || null;
  }
  return null;
};

const buildCategoryFieldOptions = (category) => {
  const options = [
    {
      key: 'title',
      label: 'Title',
      description: 'Sets the child primitive title',
    },
  ];

  if (!category || typeof category !== 'object') {
    return options;
  }
  const parameters = category.parameters;
  if (!parameters || typeof parameters !== 'object') {
    return options;
  }
  Object.entries(parameters).forEach(([key, parameter]) => {
    const label = parameter?.title || parameter?.label || key;
    const optionKey = `${TARGET_PREFIX}${key}`;
    options.push({
      key: optionKey,
      label,
      description: parameter?.description,
    });
  });
  return options;
};

function createId(prefix = 'id') {
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}`;
}

function normalizeMappings(raw) {
  if (!Array.isArray(raw)) {
    return [];
  }
  return raw.map((mapping, index) => {
    const fieldMap = mapping.fieldMap && typeof mapping.fieldMap === 'object'
      ? Object.entries(mapping.fieldMap).map(([target, source], idx) => ({
          id: createId(`field-${index}-${idx}`),
          target,
          source: typeof source === 'string' ? source : JSON.stringify(source),
        }))
      : [];
    const staticFields = mapping.staticFields && typeof mapping.staticFields === 'object'
      ? Object.entries(mapping.staticFields).map(([target, value], idx) => ({
          id: createId(`static-${index}-${idx}`),
          target,
          value: typeof value === 'string' ? value : JSON.stringify(value),
        }))
      : [];

    const referenceId = mapping.referenceId ?? null;

    return {
      id: createId(`mapping-${index}`),
      key: mapping.key ?? '',
      referenceId,
      titleField: mapping.titleField ?? '',
      fieldMap,
      staticFields,
      computedType: getTypeForCategory(referenceId),
    };
  });
}

function serializeMappings(list) {
  return list.map((mapping) => {
    const result = {};

    if (mapping.key) {
      result.key = mapping.key;
    }

    if (mapping.referenceId !== undefined && mapping.referenceId !== null && mapping.referenceId !== '') {
      const referenceId = Number(mapping.referenceId);
      result.referenceId = Number.isNaN(referenceId) ? mapping.referenceId : referenceId;
    }

    if (mapping.titleField) {
      result.titleField = mapping.titleField;
    }

    const fieldMap = (mapping.fieldMap ?? []).reduce((acc, row) => {
      const target = String(row.target || '').trim();
      const source = row.source !== undefined && row.source !== null ? String(row.source).trim() : '';
      if (target && source) {
        acc[target] = source;
      }
      return acc;
    }, {});
    if (Object.keys(fieldMap).length > 0) {
      result.fieldMap = fieldMap;
    }

    const staticFields = (mapping.staticFields ?? []).reduce((acc, row) => {
      const target = String(row.target || '').trim();
      if (!target) {
        return acc;
      }
      const value = row.value ?? '';
      acc[target] = value;
      return acc;
    }, {});
    if (Object.keys(staticFields).length > 0) {
      result.staticFields = staticFields;
    }

    return result;
  });
}

export default function ExternalPrimitiveMappingsEditor({ primitive, availableFields = [] }) {
  const [mappings, setMappings] = useState(() => normalizeMappings(primitive?.referenceParameters?.mappings));
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setMappings(normalizeMappings(primitive?.referenceParameters?.mappings));
    setDirty(false);
  }, [primitive?.id, primitive?.referenceParameters?.mappings]);

  const fieldOptions = useMemo(() => {
    const list = (availableFields ?? [])
      .map((field) => {
        if (!field) return null;
        if (typeof field === 'string') {
          return { key: field, label: field };
        }
        const name = field.name ?? field.id;
        if (!name) return null;
        return { key: name, label: name, type: field.type };
      })
      .filter(Boolean);

    const seen = new Map();
    list.forEach((option) => {
      const key = String(option.key);
      const lowerKey = key.toLowerCase();
      if (!seen.has(lowerKey)) {
        seen.set(lowerKey, { ...option, lowerKey });
      }
    });

    return Array.from(seen.values());
  }, [availableFields]);

  const fieldOptionLookup = useMemo(() => {
    const map = new Map();
    fieldOptions.forEach((option) => {
      const key = String(option.key).toLowerCase();
      map.set(key, option);
    });
    return map;
  }, [fieldOptions]);

  const categoryFieldOptionsById = useMemo(() => {
    const map = new Map();
    mappings.forEach((mapping) => {
      const refId = mapping.referenceId;
      if (!refId || map.has(refId)) {
        return;
      }
      const category = mainstore.category(refId);
      const options = buildCategoryFieldOptions(category);
      if (options.length > 1) {
        options.sort((a, b) => a.label.localeCompare(b.label, undefined, { sensitivity: 'base' }));
      }
      map.set(refId, options);
    });
    return map;
  }, [mappings]);

  const updateMapping = (index, updater) => {
    setMappings((current) =>
      current.map((mapping, idx) => {
        if (idx !== index) {
          return mapping;
        }
        let updates = typeof updater === 'function' ? updater(mapping) : updater;
        if (Object.prototype.hasOwnProperty.call(updates ?? {}, 'referenceId')) {
          updates = {
            ...updates,
            computedType: getTypeForCategory(updates.referenceId),
          };
        }
        return { ...mapping, ...updates };
      }),
    );
    setDirty(true);
  };

  const updateFieldMapRow = (mappingIndex, rowId, updates) => {
    setMappings((current) =>
      current.map((mapping, idx) => {
        if (idx !== mappingIndex) {
          return mapping;
        }
        const nextFieldMap = (mapping.fieldMap ?? []).map((row) =>
          row.id === rowId ? { ...row, ...updates } : row,
        );
        return { ...mapping, fieldMap: nextFieldMap };
      }),
    );
    setDirty(true);
  };

  const updateStaticFieldRow = (mappingIndex, rowId, updates) => {
    setMappings((current) =>
      current.map((mapping, idx) => {
        if (idx !== mappingIndex) {
          return mapping;
        }
        const nextStaticFields = (mapping.staticFields ?? []).map((row) =>
          row.id === rowId ? { ...row, ...updates } : row,
        );
        return { ...mapping, staticFields: nextStaticFields };
      }),
    );
    setDirty(true);
  };

  const addMapping = () => {
    setMappings((current) => [
      ...current,
      {
        id: createId('mapping-new'),
        key: '',
        referenceId: null,
        titleField: '',
        fieldMap: [],
        staticFields: [],
        computedType: undefined,
      },
    ]);
    setDirty(true);
  };

  const removeMapping = (mappingId) => {
    setMappings((current) => current.filter((mapping) => mapping.id !== mappingId));
    setDirty(true);
  };

  const addFieldMapRow = (mappingIndex) => {
    setMappings((current) =>
      current.map((mapping, idx) => {
        if (idx !== mappingIndex) {
          return mapping;
        }
        const next = [...(mapping.fieldMap ?? []), { id: createId('field'), target: '', source: '' }];
        return { ...mapping, fieldMap: next };
      }),
    );
    setDirty(true);
  };

  const addStaticFieldRow = (mappingIndex) => {
    setMappings((current) =>
      current.map((mapping, idx) => {
        if (idx !== mappingIndex) {
          return mapping;
        }
        const next = [...(mapping.staticFields ?? []), { id: createId('static'), target: '', value: '' }];
        return { ...mapping, staticFields: next };
      }),
    );
    setDirty(true);
  };

  const removeFieldMapRow = (mappingIndex, rowId) => {
    setMappings((current) =>
      current.map((mapping, idx) => {
        if (idx !== mappingIndex) {
          return mapping;
        }
        const next = (mapping.fieldMap ?? []).filter((row) => row.id !== rowId);
        return { ...mapping, fieldMap: next };
      }),
    );
    setDirty(true);
  };

  const removeStaticFieldRow = (mappingIndex, rowId) => {
    setMappings((current) =>
      current.map((mapping, idx) => {
        if (idx !== mappingIndex) {
          return mapping;
        }
        const next = (mapping.staticFields ?? []).filter((row) => row.id !== rowId);
        return { ...mapping, staticFields: next };
      }),
    );
    setDirty(true);
  };

  const resetChanges = () => {
    setMappings(normalizeMappings(primitive?.referenceParameters?.mappings));
    setDirty(false);
  };

  const handleSave = async () => {
    if (!primitive) {
      return;
    }

    const serialized = serializeMappings(mappings);

    const prepared = serialized.map((mapping) => {
      const { computedType, ...rest } = mapping;
      const category = mapping.referenceId ? mainstore.category(mapping.referenceId) : undefined;
      const type = category?.primitiveType || category?.type || 'result';
      return {
        ...rest,
        type,
      };
    });

    const invalid = prepared.filter((mapping) => !mapping.referenceId || !mapping.type);
    if (invalid.length > 0) {
      toast.error('Each mapping needs a category that defines a primitive type.');
      return;
    }

    try {
      setSaving(true);
      const cleaned = prepared.filter((mapping) => mapping.referenceId);
      await primitive.setField('referenceParameters.mappings', cleaned);
      toast.success('Mappings saved');
      setDirty(false);
    } catch (error) {
      console.error(error);
      toast.error(error.message || 'Unable to save mappings');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-1">
        <div className="flex items-center justify-between gap-2">
          <div>
            <h4 className="text-base font-semibold text-foreground">Record mappings</h4>
            <p className="text-sm text-default-500">
              Create objects for each incoming record. You can add multiple mappings and reuse record fields across them.
            </p>
          </div>
          <Button size="sm" variant="light" onPress={addMapping} isIconOnly={true} radius='full'>
            <Icon icon="material-symbols:add-2" className='w-5 h-5'/>
          </Button>
        </div>
      </div>

      {mappings.length === 0 ? (
        <div className="rounded-large border border-dashed border-default-300 bg-default-100/60 p-6 text-sm text-default-500">
          No mappings defined yet.
        </div>
      ) : (
        mappings.map((mapping, index) => (
          <Card key={mapping.id} shadow="sm" className="border border-default-200">
            <CardHeader className="flex flex-wrap items-start justify-between gap-2 px-3 py-2.5">
              <div>
                <Input
                  label="Mapping key"
                  labelPlacement="outside-left"
                  variant="bordered"
                  value={mapping.key}
                  onChange={(event) => updateMapping(index, { key: event.target.value })}
                  size="sm"
                  classNames={compactInputClassNames}
                />
              </div>
              <Button
                size="sm"
                color="danger"
                variant="light"
                onPress={() => removeMapping(mapping.id)}
              >
                Remove
              </Button>
            </CardHeader>
            <Divider />
            <CardBody className="space-y-3 px-3 py-3">
              <div className="space-y-2">
                <p className="text-sm font-medium text-default-600">Category</p>
                <CategoryIdSelector
                  allowNone
                  selectionMode="single"
                  showCount={false}
                  className="max-w-full"
                  selectedValues={mapping.referenceId ? [String(mapping.referenceId)] : []}
                  onSelectionChange={(selections) => {
                    const selection = selections?.[0];
                    if (!selection || selection.categoryId === undefined || selection.categoryId === null) {
                      updateMapping(index, { referenceId: null });
                    } else {
                      updateMapping(index, { referenceId: selection.categoryId });
                    }
                  }}
                />
              </div>

              <div className="space-y-1.5">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-medium text-default-600">Field mappings</p>
                  <Button size="sm" variant="bordered" onPress={() => addFieldMapRow(index)}>
                    Add field mapping
                  </Button>
                </div>
                {(mapping.fieldMap ?? []).length === 0 ? (
                  <p className="text-xs text-default-500">Map record fields to primitive fields.</p>
                ) : (
                  <Table
                    aria-label="Field mappings"
                  shadow="none"
                  className="border border-default-200"
                  removeWrapper
                  classNames={compactTableClassNames}
                  >
                    <TableHeader>
                      <TableColumn>Primitive field</TableColumn>
                      <TableColumn>Record field</TableColumn>
                      <TableColumn align="end">Actions</TableColumn>
                    </TableHeader>
                    <TableBody emptyContent="No field mappings">
                      {mapping.fieldMap.map((row) => {
                        const categoryOptions = categoryFieldOptionsById.get(mapping.referenceId) ?? [];
                        const parameterKey = getParameterKeyFromTarget(row.target);
                        const normalizedKey = parameterKey ? `${TARGET_PREFIX}${parameterKey}` : row.target;
                        const hasMatchingOption = Boolean(normalizedKey) && categoryOptions.some((option) => option.key === normalizedKey);
                        const disableSelect = !mapping.referenceId || categoryOptions.length === 0;
                        // Include the previously saved path when it no longer matches a known parameter.
                        const optionsToRender = disableSelect
                          ? categoryOptions
                          : hasMatchingOption || !row.target
                          ? categoryOptions
                          : [
                              ...categoryOptions,
                              {
                                key: row.target,
                                label: row.target,
                                description: 'Custom path',
                              },
                            ];
                        const selectedKey = hasMatchingOption ? normalizedKey : row.target;
                        const selectPlaceholder = !mapping.referenceId
                          ? 'Select a category to choose fields'
                          : categoryOptions.length === 0
                          ? 'No fields available'
                          : 'Select a primitive field';

                        const rawSource = row.source ?? '';
                        const matchedFieldOption = rawSource
                          ? fieldOptionLookup.get(String(rawSource).toLowerCase())
                          : undefined;
                        const recordHasMatchingOption = Boolean(matchedFieldOption);
                        const recordSelectedKey = recordHasMatchingOption ? matchedFieldOption.key : rawSource;
                        const recordOptionsToRender = recordHasMatchingOption || !rawSource
                          ? fieldOptions
                          : [
                              ...fieldOptions,
                              {
                                key: rawSource,
                                label: rawSource,
                                description: 'Custom field',
                              },
                            ];
                        const recordSelectPlaceholder = recordOptionsToRender.length === 0
                          ? 'No fields available'
                          : 'Select a record field';

                        return (
                          <TableRow key={row.id}>
                            <TableCell>
                              {disableSelect ? (
                                <Input
                                  variant="bordered"
                                  value={row.target}
                                  onChange={(event) => updateFieldMapRow(index, row.id, { target: event.target.value })}
                                  placeholder={mapping.referenceId ? 'Enter primitive field path' : 'Select a category to enable'}
                                  size="sm"
                                  classNames={compactInputClassNames}
                                />
                              ) : (
                                <Select
                                  aria-label="Primitive field"
                                  variant="bordered"
                                  selectedKeys={selectedKey ? [selectedKey] : []}
                                  onChange={(event) => updateFieldMapRow(index, row.id, { target: event.target.value })}
                                  placeholder={selectPlaceholder}
                                  size="sm"
                                  classNames={compactSelectClassNames}
                                  menuTrigger="focus"
                                  popoverProps={{
                                    classNames: {
                                      base: 'min-w-[16rem]',
                                    },
                                  }}
                                >
                                  {optionsToRender.map((option) => (
                                    <SelectItem
                                      key={option.key}
                                      description={
                                        option.description
                                          ? option.description
                                          : typeof option.key === 'string' && option.key.startsWith(TARGET_PREFIX)
                                          ? option.key.slice(TARGET_PREFIX.length)
                                          : undefined
                                      }
                                    >
                                      {option.label}
                                    </SelectItem>
                                  ))}
                                </Select>
                              )}
                            </TableCell>
                            <TableCell>
                              <Select
                                variant="bordered"
                                selectedKeys={recordSelectedKey ? [recordSelectedKey] : []}
                                onChange={(event) => updateFieldMapRow(index, row.id, { source: event.target.value })}
                                placeholder={recordSelectPlaceholder}
                                size="sm"
                                isDisabled={recordOptionsToRender.length === 0}
                                classNames={compactSelectClassNames}
                                menuTrigger="focus"
                                popoverProps={{
                                  classNames: {
                                    base: 'min-w-[16rem]',
                                  },
                                }}
                              >
                                {recordOptionsToRender.map((option) => (
                                  <SelectItem
                                    key={option.key}
                                    description={option.description}
                                  >
                                    {option.label}
                                  </SelectItem>
                                ))}
                              </Select>
                            </TableCell>
                            <TableCell>
                              <div className="flex justify-end">
                                <Button
                                  size="sm"
                                  variant="light"
                                  color="danger"
                                  onPress={() => removeFieldMapRow(index, row.id)}
                                >
                                  Remove
                                </Button>
                              </div>
                            </TableCell>
                          </TableRow>
                        )
                      })}
                    </TableBody>
                  </Table>
                )}
              </div>

              <Divider />

              <div className="space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-medium text-default-600">Static fields</p>
                  <Button size="sm" variant="bordered" onPress={() => addStaticFieldRow(index)}>
                    Add static field
                  </Button>
                </div>
                {(mapping.staticFields ?? []).length === 0 ? (
                  <p className="text-xs text-default-500">Add constant values to the child primitive.</p>
                ) : (
                  <div className="space-y-2">
                    {mapping.staticFields.map((row) => (
                      <div key={row.id} className="space-y-2 rounded-large border border-default-200 bg-default-100/60 p-2.5">
                        <Input
                          label="Target path"
                          variant="bordered"
                          value={row.target}
                          onChange={(event) => updateStaticFieldRow(index, row.id, { target: event.target.value })}
                          placeholder="e.g. referenceParameters.source"
                          size="sm"
                          classNames={compactInputClassNames}
                        />
                        <Input
                          label="Value"
                          variant="bordered"
                          value={row.value}
                          onChange={(event) => updateStaticFieldRow(index, row.id, { value: event.target.value })}
                          placeholder="Literal value"
                          size="sm"
                          classNames={compactInputClassNames}
                        />
                        <div className="flex justify-end">
                          <Button
                            size="sm"
                            variant="light"
                            color="danger"
                            onPress={() => removeStaticFieldRow(index, row.id)}
                          >
                            Remove
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </CardBody>
          </Card>
        ))
      )}

      <div className="flex items-center justify-end gap-2">
        <Button
          variant="flat"
          onPress={resetChanges}
          isDisabled={!dirty || saving}
        >
          Reset
        </Button>
        <Button
          color="primary"
          onPress={handleSave}
          isDisabled={!dirty || saving}
          isLoading={saving}
        >
          Save mappings
        </Button>
      </div>
    </div>
  );
}
