import React, { useCallback, useEffect, useMemo, useState } from 'react';
import AirtablePrimitiveConfigurator from './AirtablePrimitiveConfigurator.jsx';
import ExternalPrimitiveMappingsEditor from './ExternalPrimitiveMappingsEditor.jsx';

export default function ExternalPrimitiveConfigurator({ primitive, provider, loadingProviders }) {
  const providerName = primitive?.referenceParameters?.provider;
  const accountId = primitive?.referenceParameters?.integrationAccountId
    ?? primitive?.resources?.integration?.accountId
    ?? primitive?.referenceParameters?.accountId;

  const primitiveFields = provider?.configuration?.primitive ?? [];

  const providerSupportsPrimitiveConfig = primitiveFields.length > 0;
  const providerLoading = loadingProviders || (providerName && provider === undefined);

  const deriveAvailableFields = useCallback((targetPrimitive) => {
    const source = targetPrimitive?.referenceParameters?.source ?? {};
    if (Array.isArray(source.tableFields) && source.tableFields.length > 0) {
      return source.tableFields;
    }
    if (source.fields && typeof source.fields === 'object') {
      return Object.entries(source.fields).map(([name, details]) => ({
        id: name,
        name: details?.name ?? name,
        type: details?.type,
      }));
    }
    const sample = targetPrimitive?.referenceParameters?.sampleRecord?.fields;
    if (sample && typeof sample === 'object') {
      return Object.keys(sample).map((name) => ({ id: name, name }));
    }
    return [];
  }, []);

  const [availableFields, setAvailableFields] = useState(() => deriveAvailableFields(primitive));

  useEffect(() => {
    setAvailableFields(deriveAvailableFields(primitive));
  }, [deriveAvailableFields, primitive?.referenceParameters]);

  const handleFieldsPreview = useCallback((fields) => {
    setAvailableFields(Array.isArray(fields) ? fields : []);
  }, []);

  const configurator = useMemo(() => {
    if (!providerName || !providerSupportsPrimitiveConfig) {
      return null;
    }

    switch (providerName) {
      case 'airtable':
        return (
          <AirtablePrimitiveConfigurator
            primitive={primitive}
            accountId={accountId}
            onFieldsPreview={handleFieldsPreview}
          />
        );
      default:
        return null;
    }
  }, [accountId, handleFieldsPreview, primitive, providerName, providerSupportsPrimitiveConfig]);

  const providerSection = useMemo(() => {
    if (providerLoading && !provider) {
      return (
        <p className="mt-3 text-sm text-default-500">Loading provider details…</p>
      );
    }

    if (!providerName) {
      return (
        <p className="mt-3 text-sm text-default-500">
          Set a provider for this external primitive to configure it.
        </p>
      );
    }

    if (!provider) {
      return (
        <p className="mt-3 text-sm text-danger-500">
          Provider "{providerName}" is not registered. Please reconnect the integration.
        </p>
      );
    }

    if (!providerSupportsPrimitiveConfig) {
      return (
        <p className="mt-3 text-sm text-default-500">
          {provider.title || provider.name} does not require additional configuration for each primitive.
        </p>
      );
    }

    if (!accountId) {
      return (
        <p className="mt-3 text-sm text-warning-500">
          Connect this primitive to an integration account before configuring it.
        </p>
      );
    }

    if (!configurator) {
      return (
        <p className="mt-3 text-sm text-default-500">
          Configuration UI for {provider.title || provider.name} is not yet available.
        </p>
      );
    }

    return configurator;
  }, [
    accountId,
    configurator,
    providerLoading,
    provider,
    providerName,
    providerSupportsPrimitiveConfig,
  ]);

  return (
    <div className="space-y-6">
      {providerSection}
      <ExternalPrimitiveMappingsEditor
        primitive={primitive}
        availableFields={availableFields}
      />
    </div>
  );
}
