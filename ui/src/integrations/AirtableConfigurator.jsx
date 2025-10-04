import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Button, Divider, Select, SelectItem, Spinner } from '@heroui/react';
import toast from 'react-hot-toast';

function mergeUnique(items) {
  const map = new Map();
  for (const item of items) {
    if (!item?.id) continue;
    if (!map.has(item.id)) {
      map.set(item.id, item);
    }
  }
  return Array.from(map.values());
}

export default function AirtableConfigurator({ account, saving, onSubmit, onCancel }) {
  const [bases, setBases] = useState([]);
  const [tables, setTables] = useState([]);
  const [loadingBases, setLoadingBases] = useState(false);
  const [loadingTables, setLoadingTables] = useState(false);

  const initialConfig = useMemo(() => account?.metadata?.airtable ?? {}, [account?.metadata?.airtable]);

  const [selectedBase, setSelectedBase] = useState(initialConfig.baseId ?? '');
  const [selectedTable, setSelectedTable] = useState(initialConfig.tableId ?? '');

  const fetchAllBases = useCallback(async () => {
    if (!account?.id) {
      return;
    }
    setLoadingBases(true);
    try {
      const collected = [];
      let cursor;
      do {
        const params = new URLSearchParams({
          accountId: account.id,
          type: 'bases',
        });
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
  }, [account?.id]);

  const fetchTablesForBase = useCallback(async (baseId) => {
    if (!account?.id || !baseId) {
      setTables([]);
      return;
    }
    setLoadingTables(true);
    try {
      const collected = [];
      let cursor;
      do {
        const params = new URLSearchParams({
          accountId: account.id,
          type: 'tables',
          baseId,
        });
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
  }, [account?.id]);

  useEffect(() => {
    setSelectedBase(initialConfig.baseId ?? '');
    setSelectedTable(initialConfig.tableId ?? '');
  }, [initialConfig.baseId, initialConfig.tableId]);

  useEffect(() => {
    if (account?.id) {
      fetchAllBases();
    }
  }, [account?.id, fetchAllBases]);

  useEffect(() => {
    if (selectedBase) {
      fetchTablesForBase(selectedBase);
    } else {
      setTables([]);
      setSelectedTable('');
    }
  }, [selectedBase, fetchTablesForBase]);

  useEffect(() => {
    if (!selectedBase && bases.length > 0 && initialConfig.baseId) {
      const exists = bases.some((base) => base.id === initialConfig.baseId);
      if (!exists) {
        setBases((prev) => mergeUnique([...prev, {
          id: initialConfig.baseId,
          name: initialConfig.baseName || initialConfig.baseId,
        }]));
      }
      setSelectedBase(initialConfig.baseId);
    }
  }, [bases, initialConfig.baseId, initialConfig.baseName, selectedBase]);

  useEffect(() => {
    if (!selectedTable && tables.length > 0 && initialConfig.tableId && initialConfig.baseId === selectedBase) {
      const exists = tables.some((table) => table.id === initialConfig.tableId);
      if (!exists) {
        setTables((prev) => mergeUnique([...prev, {
          id: initialConfig.tableId,
          name: initialConfig.tableName || initialConfig.tableId,
          fields: initialConfig.fields || [],
        }]));
      }
      setSelectedTable(initialConfig.tableId);
    }
  }, [tables, initialConfig.tableId, initialConfig.tableName, initialConfig.fields, initialConfig.baseId, selectedBase, selectedTable]);

  const selectedBaseInfo = useMemo(
    () => bases.find((base) => base.id === selectedBase),
    [bases, selectedBase],
  );

  const selectedTableInfo = useMemo(
    () => tables.find((table) => table.id === selectedTable),
    [tables, selectedTable],
  );

  const handleSubmit = () => {
    if (!selectedBase || !selectedTable) {
      toast.error('Select both a base and table');
      return;
    }
    onSubmit?.({
      baseId: selectedBase,
      baseName: selectedBaseInfo?.name ?? selectedBase,
      tableId: selectedTable,
      tableName: selectedTableInfo?.name ?? selectedTable,
      fields: selectedTableInfo?.fields ?? [],
    });
  };

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <p className="text-sm text-default-500">
          Select the Airtable base and table you want to sync. We&apos;ll store these in your connection so future external primitives can reference them without copying IDs from URLs.
        </p>
      </div>
      <div className="space-y-4">
        <div className="flex flex-col gap-2">
          <label className="text-sm font-medium text-default-600">Base</label>
          <Select
            variant="bordered"
            selectedKeys={selectedBase ? [selectedBase] : []}
            onChange={(event) => {
              const value = event.target.value;
              setSelectedBase(value);
              setSelectedTable('');
            }}
            placeholder={loadingBases ? 'Loading bases…' : 'Select a base'}
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
        <div className="flex flex-col gap-2">
          <label className="text-sm font-medium text-default-600">Table</label>
          <Select
            variant="bordered"
            selectedKeys={selectedTable ? [selectedTable] : []}
            onChange={(event) => setSelectedTable(event.target.value)}
            placeholder={selectedBase ? (loadingTables ? 'Loading tables…' : 'Select a table') : 'Select a base first'}
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

      <div className="mt-4 flex items-center justify-end gap-2">
        <Button variant="flat" onPress={onCancel} isDisabled={saving}>
          Cancel
        </Button>
        <Button
          color="primary"
          onPress={handleSubmit}
          isDisabled={!selectedBase || !selectedTable || saving}
          isLoading={saving}
        >
          Save
        </Button>
      </div>
    </div>
  );
}
