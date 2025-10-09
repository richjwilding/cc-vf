import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Button,
  Divider,
  Input,
  Spinner,
} from '@heroui/react';
import toast from 'react-hot-toast';

function normalizeSelections(entries) {
  if (!Array.isArray(entries)) {
    return [];
  }
  return entries
    .map((entry) => {
      if (!entry) return null;
      if (typeof entry === 'string') {
        return { id: entry, name: entry };
      }
      if (entry.id) {
        return { id: entry.id, name: entry.name ?? entry.title ?? entry.label ?? entry.id };
      }
      return null;
    })
    .filter((entry) => entry && entry.id);
}

function addUnique(list, item) {
  if (!item?.id) {
    return list;
  }
  const exists = list.some((entry) => entry.id === item.id);
  if (exists) {
    return list;
  }
  return [...list, { id: item.id, name: item.name ?? item.title ?? item.id }];
}

export default function GoogleDocsConfigurator({ account, saving, onSubmit, onCancel }) {
  const initialConfig = useMemo(
    () => account?.metadata?.['google-docs'] ?? account?.metadata?.googleDocs ?? {},
    [account?.metadata],
  );

  const [documents, setDocuments] = useState(() => normalizeSelections(initialConfig.documents));
  const [folders, setFolders] = useState(() => normalizeSelections(initialConfig.folders));

  const [docQuery, setDocQuery] = useState('');
  const [folderQuery, setFolderQuery] = useState('');
  const [docResults, setDocResults] = useState([]);
  const [folderResults, setFolderResults] = useState([]);
  const [loadingDocs, setLoadingDocs] = useState(false);
  const [loadingFolders, setLoadingFolders] = useState(false);

  useEffect(() => {
    setDocuments(normalizeSelections(initialConfig.documents));
    setFolders(normalizeSelections(initialConfig.folders));
  }, [initialConfig.documents, initialConfig.folders]);

  const fetchDiscovery = useCallback(async (type, query) => {
    if (!account?.id) {
      return [];
    }
    const params = new URLSearchParams({
      accountId: account.id,
      type,
    });
    if (query && query.trim()) {
      params.set('search', query.trim());
    }
    const response = await fetch(`/api/integrations/google-docs/discovery?${params.toString()}`);
    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      throw new Error(body?.error || `Failed to load ${type}`);
    }
    const body = await response.json();
    return Array.isArray(body?.items) ? body.items : [];
  }, [account?.id]);

  const searchDocuments = useCallback(async () => {
    if (!account?.id) {
      toast.error('Connect the integration before searching');
      return;
    }
    setLoadingDocs(true);
    try {
      const items = await fetchDiscovery('documents', docQuery);
      setDocResults(items);
    } catch (error) {
      console.error(error);
      toast.error(error.message || 'Unable to load documents');
      setDocResults([]);
    } finally {
      setLoadingDocs(false);
    }
  }, [account?.id, docQuery, fetchDiscovery]);

  const searchFolders = useCallback(async () => {
    if (!account?.id) {
      toast.error('Connect the integration before searching');
      return;
    }
    setLoadingFolders(true);
    try {
      const items = await fetchDiscovery('folders', folderQuery);
      setFolderResults(items);
    } catch (error) {
      console.error(error);
      toast.error(error.message || 'Unable to load folders');
      setFolderResults([]);
    } finally {
      setLoadingFolders(false);
    }
  }, [account?.id, folderQuery, fetchDiscovery]);

  useEffect(() => {
    if (account?.id) {
      searchDocuments();
      searchFolders();
    }
  }, [account?.id, searchDocuments, searchFolders]);

  const handleAddDocument = (item) => {
    setDocuments((prev) => addUnique(prev, item));
  };

  const handleAddFolder = (item) => {
    setFolders((prev) => addUnique(prev, item));
  };

  const handleRemoveDocument = (id) => {
    setDocuments((prev) => prev.filter((entry) => entry.id !== id));
  };

  const handleRemoveFolder = (id) => {
    setFolders((prev) => prev.filter((entry) => entry.id !== id));
  };

  const handleSubmit = () => {
    onSubmit?.({
      documents,
      folders,
    });
  };

  const renderResultList = (items, onAdd, loading) => (
    <div className="space-y-2">
      {loading && (
        <div className="flex items-center gap-2 text-small text-default-500">
          <Spinner size="sm" />
          <span>Loading…</span>
        </div>
      )}
      {!loading && items.length === 0 && (
        <p className="text-small text-default-500">No items found. Try another search.</p>
      )}
      {!loading && items.map((item) => (
        <div
          key={item.id}
          className="flex items-center justify-between gap-3 rounded-medium border border-default-200 px-3 py-2"
        >
          <div className="min-w-0">
            <p className="truncate text-small font-medium text-default-700">{item.name ?? item.title ?? item.id}</p>
            <p className="truncate text-tiny text-default-400">{item.id}</p>
          </div>
          <Button
            size="sm"
            variant="flat"
            color="primary"
            onPress={() => onAdd(item)}
          >
            Add
          </Button>
        </div>
      ))}
    </div>
  );

  const renderSelectionList = (items, onRemove, emptyLabel) => (
    <div className="space-y-2">
      {items.length === 0 && (
        <p className="text-small text-default-500">{emptyLabel}</p>
      )}
      {items.map((item) => (
        <div
          key={item.id}
          className="flex items-center justify-between gap-3 rounded-medium border border-default-200 bg-default-50 px-3 py-2"
        >
          <div className="min-w-0">
            <p className="truncate text-small font-medium text-default-700">{item.name ?? item.id}</p>
            <p className="truncate text-tiny text-default-400">{item.id}</p>
          </div>
          <Button
            size="sm"
            variant="light"
            color="danger"
            onPress={() => onRemove(item.id)}
          >
            Remove
          </Button>
        </div>
      ))}
    </div>
  );

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <p className="text-sm text-default-500">
          Choose specific Google Docs or entire folders to import. We&apos;ll sync their content, build embeddings,
          and store the PDFs for downstream analysis.
        </p>
      </div>

      <div className="space-y-4">
        <div className="space-y-2">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
            <Input
              label="Search documents"
              placeholder="Enter a title or keyword"
              variant="bordered"
              value={docQuery}
              onChange={(event) => setDocQuery(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault();
                  searchDocuments();
                }
              }}
            />
            <Button color="primary" onPress={searchDocuments} isDisabled={loadingDocs}>
              Search
            </Button>
          </div>
          {renderResultList(docResults, handleAddDocument, loadingDocs)}
        </div>

        <Divider />

        <div className="space-y-2">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
            <Input
              label="Search folders"
              placeholder="Enter a folder name"
              variant="bordered"
              value={folderQuery}
              onChange={(event) => setFolderQuery(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault();
                  searchFolders();
                }
              }}
            />
            <Button color="primary" onPress={searchFolders} isDisabled={loadingFolders}>
              Search
            </Button>
          </div>
          {renderResultList(folderResults, handleAddFolder, loadingFolders)}
        </div>
      </div>

      <Divider />

      <div className="grid gap-6 md:grid-cols-2">
        <div className="space-y-3">
          <h3 className="text-sm font-semibold text-default-600">Selected documents</h3>
          {renderSelectionList(documents, handleRemoveDocument, 'No documents selected yet.')}
        </div>
        <div className="space-y-3">
          <h3 className="text-sm font-semibold text-default-600">Selected folders</h3>
          {renderSelectionList(folders, handleRemoveFolder, 'No folders selected yet.')}
        </div>
      </div>

      <Divider />

      <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
        <Button variant="light" onPress={onCancel} isDisabled={saving}>
          Cancel
        </Button>
        <Button color="primary" onPress={handleSubmit} isLoading={saving}>
          Save configuration
        </Button>
      </div>
    </div>
  );
}
