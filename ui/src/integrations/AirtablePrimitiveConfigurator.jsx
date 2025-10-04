import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Button, Divider, Select, SelectItem, Spinner } from '@heroui/react';
import toast from 'react-hot-toast';

function mergeUnique(items) {
  const map = new Map();
  for (const item of items) {
    if (!item?.id) continue;
    const existing = map.get(item.id) || {};
    map.set(item.id, { ...existing, ...item });
  }
  return Array.from(map.values());
}

export default function AirtablePrimitiveConfigurator({ primitive, accountId, onFieldsPreview }) {
  const [loadingBases, setLoadingBases] = useState(false);
  const [loadingTables, setLoadingTables] = useState(false);
  const [bases, setBases] = useState([]);
  const [tables, setTables] = useState([]);
  const [saving, setSaving] = useState(false);

  const initialConfig = useMemo(() => {
    const source = primitive?.referenceParameters?.source ?? {};
    return {
      baseId: source.baseId ?? primitive?.referenceParameters?.baseId,
      baseName: source.baseName ?? primitive?.referenceParameters?.baseName,
      tableId: source.tableId ?? primitive?.referenceParameters?.tableId,
      tableName: source.tableName ?? primitive?.referenceParameters?.tableName,
    };
  }, [
    primitive?.referenceParameters?.baseId,
    primitive?.referenceParameters?.baseName,
    primitive?.referenceParameters?.source,
    primitive?.referenceParameters?.tableId,
    primitive?.referenceParameters?.tableName,
  ]);

  const [selectedBase, setSelectedBase] = useState(initialConfig.baseId ?? '');
  const [selectedTable, setSelectedTable] = useState(initialConfig.tableId ?? '');

  const fetchBases = useCallback(async () => {
    if (!accountId) {
      setBases([]);
      return;
    }
    setLoadingBases(true);
    try {
      const collected = [];
      let cursor;
      do {
        const params = new URLSearchParams({ accountId, type: 'bases' });
        if (cursor) {
          params.set('cursor', cursor);
        }
        const response = await fetch(`/api/integrations/airtable/discovery?${params.toString()}`);
        if (!response.ok) {
          const body = await response.json().catch(() => ({}));
          throw new Error(body?.error || `Failed to load bases (${response.status})`);
        }
        const body = await response.json();
        collected.push(...(body?.items ?? []));
        cursor = body?.cursor ?? null;
      } while (cursor);
      setBases(mergeUnique(collected));
    } catch (error) {
      console.error(error);
      toast.error(error.message || 'Unable to load bases');
      setBases([]);
    } finally {
      setLoadingBases(false);
    }
  }, [accountId]);

  const fetchTables = useCallback(async (baseId) => {
    if (!accountId || !baseId) {
      setTables([]);
      return;
    }
    setLoadingTables(true);
    try {
      const collected = [];
      let cursor;
      do {
        const params = new URLSearchParams({ accountId, type: 'tables', baseId });
        if (cursor) {
          params.set('cursor', cursor);
        }
        const response = await fetch(`/api/integrations/airtable/discovery?${params.toString()}`);
        if (!response.ok) {
          const body = await response.json().catch(() => ({}));
          throw new Error(body?.error || `Failed to load tables (${response.status})`);
        }
        const body = await response.json();
        collected.push(...(body?.items ?? []));
        cursor = body?.cursor ?? null;
      } while (cursor);
      setTables(mergeUnique(collected));
    } catch (error) {
      console.error(error);
      toast.error(error.message || 'Unable to load tables');
      setTables([]);
    } finally {
      setLoadingTables(false);
    }
  }, [accountId]);

  useEffect(() => {
    const nextBaseId = initialConfig.baseId ?? '';
    const nextBaseName = initialConfig.baseName ?? initialConfig.baseId ?? '';
    const nextTableId = initialConfig.tableId ?? '';
    const nextTableName = initialConfig.tableName ?? initialConfig.tableId ?? '';

    setSelectedBase(nextBaseId);
    setSelectedTable(nextTableId);

    if (nextBaseId) {
      setBases((prev) =>
        mergeUnique([
          {
            id: nextBaseId,
            name: nextBaseName || nextBaseId,
          },
          ...prev,
        ])
      );
    }

    if (nextTableId) {
      setTables((prev) =>
        mergeUnique([
          {
            id: nextTableId,
            name: nextTableName || nextTableId,
          },
          ...prev,
        ])
      );
    }
  }, [initialConfig.baseId, initialConfig.baseName, initialConfig.tableId, initialConfig.tableName]);

  useEffect(() => {
    if (accountId) {
      fetchBases();
    }
  }, [accountId, fetchBases]);

  useEffect(() => {
    if (selectedBase) {
      fetchTables(selectedBase);
    } else {
      setTables([]);
      setSelectedTable('');
    }
  }, [selectedBase, fetchTables]);

  const selectedTableInfo = useMemo(
    () => tables.find((table) => table.id === selectedTable),
    [tables, selectedTable],
  );

  useEffect(() => {
    if (typeof onFieldsPreview !== 'function') {
      return;
    }
    if (!selectedBase || !selectedTable) {
      onFieldsPreview([]);
      return;
    }
    const previewFields = selectedTableInfo?.fields ?? [];
    onFieldsPreview(previewFields);
  }, [onFieldsPreview, selectedBase, selectedTable, selectedTableInfo]);


  const handleSave = useCallback(async () => {
    if (!selectedBase || !selectedTable) {
      toast.error('Select both a base and table');
      return;
    }
    try {
      setSaving(true);
      const baseName = bases.find((base) => base.id === selectedBase)?.name || selectedBase;
      const tableName = selectedTableInfo?.name || selectedTable;

      const updates = [
        ['referenceParameters.source.baseId', selectedBase],
        ['referenceParameters.source.baseName', baseName],
        ['referenceParameters.source.tableId', selectedTable],
        ['referenceParameters.source.tableName', tableName],
      ];

      for (const [path, value] of updates) {
        await primitive.setField(path, value);
      }

      if (selectedTableInfo?.fields) {
        await primitive.setField('referenceParameters.source.tableFields', selectedTableInfo.fields);
      }

      toast.success('External source updated');
    } catch (error) {
      console.error(error);
      toast.error(error.message || 'Failed to update primitive');
    } finally {
      setSaving(false);
    }
  }, [bases, primitive, selectedBase, selectedTable, selectedTableInfo]);


  const basePlaceholder = useMemo(() => {
    if (loadingBases) {
      return 'Loading bases…';
    }
    if (!selectedBase && initialConfig.baseName) {
      return initialConfig.baseName;
    }
    if (!selectedBase && initialConfig.baseId) {
      return initialConfig.baseId;
    }
    return 'Select a base';
  }, [initialConfig.baseId, initialConfig.baseName, loadingBases, selectedBase]);

  const tablePlaceholder = useMemo(() => {
    if (!selectedBase) {
      if (!initialConfig.baseId) {
        return 'Select a base first';
      }
      return `Select a table from ${initialConfig.baseName || initialConfig.baseId}`;
    }
    if (loadingTables) {
      return 'Loading tables…';
    }
    if (!selectedTable && initialConfig.tableName) {
      return initialConfig.tableName;
    }
    if (!selectedTable && initialConfig.tableId) {
      return initialConfig.tableId;
    }
    return 'Select a table';
  }, [
    initialConfig.baseId,
    initialConfig.baseName,
    initialConfig.tableId,
    initialConfig.tableName,
    loadingTables,
    selectedBase,
    selectedTable,
  ]);

  if (!accountId) {
    return (
      <p className="mt-3 text-sm text-warning-500">
        No integration account is linked to this primitive. Connect an account first.
      </p>
    );
  }

  return (
    <div className="mt-4 space-y-4">
      <div className="space-y-2">
        <label className="text-sm font-medium text-default-600">Base</label>
        <Select
          variant="bordered"
          selectedKeys={selectedBase ? [selectedBase] : []}
          onChange={(event) => {
            const value = event.target.value;
            setSelectedBase(value);
            setSelectedTable('');
          }}
          placeholder={basePlaceholder}
          isDisabled={loadingBases}
        >
          {bases.map((base) => (
            <SelectItem key={base.id} textValue={base.name ?? base.id}>
              {base.name ?? base.id}
            </SelectItem>
          ))}
        </Select>
        {loadingBases && (
          <div className="flex items-center gap-2 text-sm text-default-400">
            <Spinner size="sm" />
            <span>Loading bases…</span>
          </div>
        )}
      </div>

      <div className="space-y-2">
        <label className="text-sm font-medium text-default-600">Table</label>
        <Select
          variant="bordered"
          selectedKeys={selectedTable ? [selectedTable] : []}
          onChange={(event) => setSelectedTable(event.target.value)}
          placeholder={tablePlaceholder}
          isDisabled={!selectedBase || loadingTables}
        >
          {tables.map((table) => (
            <SelectItem key={table.id} textValue={table.name ?? table.id}>
              {table.name ?? table.id}
            </SelectItem>
          ))}
        </Select>
        {loadingTables && (
          <div className="flex items-center gap-2 text-sm text-default-400">
            <Spinner size="sm" />
            <span>Loading tables…</span>
          </div>
        )}
      </div>

      {selectedTableInfo?.fields?.length > 0 && (
        <div className="space-y-2">
          <Divider />
          <p className="text-sm font-medium text-default-600">Fields</p>
          <div className="flex flex-wrap gap-2 text-xs text-default-500">
            {selectedTableInfo.fields.map((field) => (
              <span
                key={field.id}
                className="rounded-full border border-default-200 px-2 py-1"
              >
                {field.name} · {field.type}
              </span>
            ))}
          </div>
        </div>
      )}

      <div className="flex justify-end gap-2">
        <Button
          color="primary"
          onPress={handleSave}
          isDisabled={!selectedBase || !selectedTable || saving}
          isLoading={saving}
        >
          Save Configuration
        </Button>
      </div>
    </div>
  );
}
