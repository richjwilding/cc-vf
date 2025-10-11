import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Button,
} from '@heroui/react';
import toast from 'react-hot-toast';
import GoogleHelper from '../GoogleHelper.js';

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

function compactSelections(entries) {
  return entries.map((entry) => ({
    id: entry.id,
    name: entry.name ?? entry.id,
  }));
}

export default function GoogleDocsPrimitiveConfigurator({ primitive, accountId }) {
  const initialSource = useMemo(
    () => primitive?.referenceParameters?.source ?? {},
    [primitive?.referenceParameters?.source],
  );

  const initialDocuments = useMemo(
    () => normalizeSelections(initialSource.documents ?? initialSource.documentIds),
    [initialSource],
  );
  const initialFolders = useMemo(
    () => normalizeSelections(initialSource.folders ?? initialSource.folderIds),
    [initialSource],
  );

  const [documents, setDocuments] = useState(initialDocuments);
  const [folders, setFolders] = useState(initialFolders);

  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setDocuments(initialDocuments);
  }, [initialDocuments]);

  useEffect(() => {
    setFolders(initialFolders);
  }, [initialFolders]);

  const handleAddDocument = useCallback((item) => {
    setDocuments((prev) => addUnique(prev, item));
  }, []);

  const handleAddFolder = useCallback((item) => {
    setFolders((prev) => addUnique(prev, item));
  }, []);

  const handleRemoveDocument = useCallback((id) => {
    setDocuments((prev) => prev.filter((entry) => entry.id !== id));
  }, []);

  const handleRemoveFolder = useCallback((id) => {
    setFolders((prev) => prev.filter((entry) => entry.id !== id));
  }, []);

  const handlePickItems = useCallback(async (options = {}) => {
    if (!accountId) {
      toast.error('Connect an account before picking items');
      return;
    }
    try {
      const picker = GoogleHelper();
      await picker.showPicker(options, async (items) => {
        if (!items || !Array.isArray(items)) {
          return;
        }
        const resolved = await Promise.all(
          items.map(async (item) => {
            if (item?.name && item.name.trim()) {
              return item;
            }
            try {
              const info = await picker.getFileInfo(item.id);
              if (info?.name) {
                return {
                  ...item,
                  name: info.name,
                  mimeType: info.mimeType ?? item.mimeType,
                };
              }
            } catch (err) {
              console.error('Failed to load Google Drive metadata', err);
            }
            return { ...item, name: item?.name ?? item.id };
          }),
        );
        if (options.type === 'folder') {
          resolved.forEach((item) => handleAddFolder({ id: item.id, name: item.name }));
        } else {
          resolved.forEach((item) => handleAddDocument({ id: item.id, name: item.name, mimeType: item.mimeType }));
        }
        toast.success('Added selection');
      });
    } catch (error) {
      console.error(error);
      toast.error(error.message || 'Unable to open Google Picker');
    }
  }, [accountId, handleAddDocument, handleAddFolder]);

  const handlePickDocuments = useCallback(() => {
    handlePickItems({ type: 'document' });
  }, [handlePickItems]);

  const handlePickFolders = useCallback(() => {
    handlePickItems({ type: 'folder' });
  }, [handlePickItems]);

  const handleSave = useCallback(async () => {
    if (!primitive?.setField) {
      toast.error('Primitive is not editable');
      return;
    }
    if (!accountId) {
      toast.error('Connect an account before saving');
      return;
    }
    try {
      setSaving(true);
      const docPayload = compactSelections(documents);
      const folderPayload = compactSelections(folders);

      await primitive.setField('referenceParameters.source.documents', docPayload);
      await primitive.setField('referenceParameters.source.documentIds', docPayload.map((entry) => entry.id));
      await primitive.setField('referenceParameters.source.folders', folderPayload);
      await primitive.setField('referenceParameters.source.folderIds', folderPayload.map((entry) => entry.id));

      toast.success('Google Docs source updated');
    } catch (error) {
      console.error(error);
      toast.error(error.message || 'Unable to save configuration');
    } finally {
      setSaving(false);
    }
  }, [accountId, documents, folders, primitive]);

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
        <h3 className="text-base font-semibold text-default-700">Documents</h3>
        <p className="text-small text-default-500">
          Choose specific documents to sync for this primitive. Leave empty to rely on folder selections.
        </p>
        <Button
          variant="flat"
          color="primary"
          onPress={handlePickDocuments}
          isDisabled={!accountId}
        >
          Add from Google Drive
        </Button>
        <h4 className="text-small font-semibold text-default-700">Selected documents</h4>
        {renderSelectionList(documents, handleRemoveDocument, 'No documents selected.')}
      </div>

      <div className="space-y-2">
        <h3 className="text-base font-semibold text-default-700">Folders</h3>
        <p className="text-small text-default-500">
          All Google Docs within these folders will sync unless you limit the selection above.
        </p>
        <Button
          variant="flat"
          color="primary"
          onPress={handlePickFolders}
          isDisabled={!accountId}
        >
          Add folders from Google Drive
        </Button>
        <h4 className="text-small font-semibold text-default-700">Selected folders</h4>
        {renderSelectionList(folders, handleRemoveFolder, 'No folders selected.')}
      </div>

      <div>
        {!accountId && (
          <p className="mb-3 text-small text-warning-500">
            Connect this primitive to a Google Docs integration account to configure it.
          </p>
        )}
        <Button
          color="primary"
          variant="solid"
          onPress={handleSave}
          isDisabled={saving || !primitive?.setField}
          isLoading={saving}
        >
          Save Selection
        </Button>
      </div>
    </div>
  )
}
