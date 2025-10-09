import React, { useMemo, useState } from 'react';
import { Modal, ModalBody, ModalContent, ModalHeader } from '@heroui/react';
import toast from 'react-hot-toast';
import AirtableConfigurator from './AirtableConfigurator.jsx';
import GoogleDocsConfigurator from './GoogleDocsConfigurator.jsx';

export default function IntegrationConfigModal({
  isOpen,
  onClose,
  provider,
  account,
  onAccountUpdated,
}) {
  const [saving, setSaving] = useState(false);

  const providerName = provider?.name ?? account?.provider;

  const handleClose = () => {
    if (saving) {
      return;
    }
    setSaving(false);
    onClose?.();
  };

  const handleSave = async (payload) => {
    if (!account?.id) {
      return;
    }
    try {
      setSaving(true);
      const response = await fetch(`/api/integrations/accounts/${account.id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          metadata: {
            ...(account.metadata ?? {}),
            [providerName]: payload,
          },
        }),
      });
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body?.error || `Failed to save configuration (${response.status})`);
      }
      const body = await response.json();
      const updatedAccount = body?.account;
      if (updatedAccount) {
        onAccountUpdated?.(updatedAccount);
      }
      toast.success('Configuration saved');
      setSaving(false);
      onClose?.();
    } catch (error) {
      console.error(error);
      toast.error(error.message || 'Unable to save configuration');
      setSaving(false);
    }
  };

  const content = useMemo(() => {
    if (!providerName || !account) {
      return null;
    }
    switch (providerName) {
      case 'airtable':
        return (
          <AirtableConfigurator
            account={account}
            saving={saving}
            onSubmit={handleSave}
            onCancel={handleClose}
          />
        );
      case 'google-docs':
        return (
          <GoogleDocsConfigurator
            account={account}
            saving={saving}
            onSubmit={handleSave}
            onCancel={handleClose}
          />
        );
      default:
        return (
          <div className="space-y-3">
            <p className="text-sm text-default-500">
              Configuration for this integration is not yet supported.
            </p>
          </div>
        );
    }
  }, [account, handleClose, handleSave, providerName, saving]);

  const modalTitle = provider?.title || provider?.name || account?.provider || 'Integration';

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      isDismissable={!saving}
      size="lg"
      scrollBehavior="inside"
    >
      <ModalContent>
        <ModalHeader className="flex flex-col gap-1 text-lg font-semibold">
          Configure {modalTitle}
        </ModalHeader>
        <ModalBody>
          {content}
        </ModalBody>
      </ModalContent>
    </Modal>
  );
}
