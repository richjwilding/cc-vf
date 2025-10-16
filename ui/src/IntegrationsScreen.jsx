import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Button, Card, CardBody, CardHeader, Chip, Divider, Spinner, Input, Checkbox } from "@heroui/react";
import toast from "react-hot-toast";
import MainStore from "./MainStore";
import IntegrationConfigModal from "./integrations/IntegrationConfigModal.jsx";
import useDataEvent from "./CustomHook";

function formatDate(value) {
  if (!value) {
    return null;
  }
  try {
    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) {
      return null;
    }
    return date.toLocaleString();
  } catch (error) {
    return null;
  }
}

function idToString(value) {
  if (!value) {
    return undefined;
  }
  if (typeof value === "string") {
    return value;
  }
  if (value?.toString) {
    return value.toString();
  }
  return undefined;
}

function SlackWorkflowManager() {
  const mainstore = MainStore();
  const organization = mainstore.activeOrganization;
  const primitives = mainstore.primitives();
  const [teamId, setTeamId] = useState("");
  const [resultsBaseUrl, setResultsBaseUrl] = useState("");
  const [selectedWorkflows, setSelectedWorkflows] = useState(new Set());
  const [saving, setSaving] = useState(false);

  useDataEvent("organization_updated", organization?.id);
  useDataEvent("new_primitive delete_primitive set_field", undefined);

  const enabledWorkflowsKey = useMemo(() => {
    return JSON.stringify((organization?.slack?.enabledWorkflows ?? []).map(idToString).filter(Boolean));
  }, [organization?.slack?.enabledWorkflows]);

  useEffect(() => {
    if (!organization) {
      return;
    }
    const slackConfig = organization.slack ?? {};
    const initialIds = (slackConfig.enabledWorkflows ?? [])
      .map(idToString)
      .filter(Boolean);
    setTeamId(slackConfig.teamId ?? "");
    setResultsBaseUrl(slackConfig.resultsBaseUrl ?? "");
    setSelectedWorkflows(new Set(initialIds));
  }, [organization?.id, organization?.slack?.teamId, organization?.slack?.resultsBaseUrl, enabledWorkflowsKey]);

  const availableWorkflows = useMemo(() => {
    if (!organization) {
      return [];
    }
    const workspaceIds = new Set((organization.workspaces ?? []).map(idToString).filter(Boolean));
    return primitives
      .filter((primitive) => primitive?.type === "flow" && workspaceIds.has(idToString(primitive.workspaceId)))
      .map((primitive) => ({
        id: idToString(primitive.id),
        plainId: primitive.plainId ?? null,
        title: primitive.title ?? (primitive.plainId != null ? `Workflow ${primitive.plainId}` : "Workflow"),
      }))
      .filter((workflow) => workflow.id)
      .sort((a, b) => (a.title ?? "").localeCompare(b.title ?? ""));
  }, [organization, primitives]);

  const toggleWorkflow = useCallback((id, selected) => {
    setSelectedWorkflows((prev) => {
      const next = new Set(prev);
      if (selected) {
        next.add(id);
      } else {
        next.delete(id);
      }
      return next;
    });
  }, []);

  const handleSelectAll = useCallback(() => {
    setSelectedWorkflows(new Set(availableWorkflows.map((workflow) => workflow.id)));
  }, [availableWorkflows]);

  const handleClearAll = useCallback(() => {
    setSelectedWorkflows(new Set());
  }, []);

  const handleSave = useCallback(async () => {
    if (!organization) {
      return;
    }
    setSaving(true);
    try {
      const response = await fetch(`/api/organizations/${organization.id}/slack/workflows`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          teamId: teamId.trim() || null,
          resultsBaseUrl: resultsBaseUrl.trim() || null,
          enabledWorkflowIds: Array.from(selectedWorkflows),
        }),
      });
      if (!response.ok) {
        throw new Error(`Save failed (${response.status})`);
      }
      const body = await response.json();
      const slack = body?.slack ?? {};
      const updatedOrganization = {
        ...organization,
        slack: {
          teamId: slack.teamId ?? null,
          resultsBaseUrl: slack.resultsBaseUrl ?? null,
          runAsUserId: slack.runAsUserId ?? null,
          enabledWorkflows: slack.enabledWorkflows ?? [],
        },
      };
      mainstore.data.organizations[organization.id] = updatedOrganization;
      if (mainstore.activeOrganization?.id === organization.id) {
        mainstore.activeOrganization = updatedOrganization;
      }
      mainstore.triggerCallback("organization_updated", [organization.id], updatedOrganization, true);
      toast.success("Slack configuration saved");
    } catch (error) {
      console.error(error);
      toast.error(error.message || "Failed to save Slack settings");
    } finally {
      setSaving(false);
    }
  }, [organization, teamId, resultsBaseUrl, selectedWorkflows, mainstore]);

  if (!organization) {
    return null;
  }

  return (
    <Card className="border border-default-200" shadow="sm">
      <CardHeader>
        <div className="flex flex-col gap-1">
          <h2 className="text-large font-semibold text-foreground">Slack</h2>
          <p className="text-small text-default-500">
            Allow teammates to run Sense workflows directly from Slack slash commands.
          </p>
        </div>
      </CardHeader>
      <CardBody className="flex flex-col gap-6">
        <div className="grid gap-4 md:grid-cols-2">
          <Input
            label="Slack team ID"
            labelPlacement="outside"
            placeholder="T0123456789"
            value={teamId}
            onValueChange={setTeamId}
            size="sm"
          />
          <Input
            label="Results link base URL"
            labelPlacement="outside"
            placeholder="https://app.sense.ai"
            description="Used to build the results link shared in Slack responses."
            value={resultsBaseUrl}
            onValueChange={setResultsBaseUrl}
            size="sm"
          />
        </div>

        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <p className="text-small font-medium text-foreground">Workflows available in Slack</p>
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="light"
                onPress={handleClearAll}
                isDisabled={selectedWorkflows.size === 0}
              >
                Clear all
              </Button>
              <Button
                size="sm"
                variant="light"
                onPress={handleSelectAll}
                isDisabled={availableWorkflows.length === 0}
              >
                Select all
              </Button>
            </div>
          </div>
          {availableWorkflows.length === 0 ? (
            <p className="text-small text-default-500">
              No workflows available. Create a workflow in one of the organization's workspaces to expose it to Slack.
            </p>
          ) : (
            <div className="grid gap-2">
              {availableWorkflows.map((workflow) => {
                const identifier = workflow.plainId != null ? `#${workflow.plainId}` : workflow.id;
                const isSelected = selectedWorkflows.has(workflow.id);
                return (
                  <Checkbox
                    key={workflow.id}
                    size="sm"
                    isSelected={isSelected}
                    onValueChange={(selected) => toggleWorkflow(workflow.id, selected)}
                  >
                    <span className="font-medium text-foreground">{workflow.title}</span>
                    <span className="ml-2 text-xs text-default-400">{identifier}</span>
                  </Checkbox>
                );
              })}
            </div>
          )}
        </div>

        <div className="flex justify-end">
          <Button
            color="primary"
            onPress={handleSave}
            isDisabled={saving}
            isLoading={saving}
          >
            Save Slack settings
          </Button>
        </div>
      </CardBody>
    </Card>
  );
}

export default function IntegrationsScreen() {
  const mainstore = MainStore();
  const [providers, setProviders] = useState([]);
  const [accounts, setAccounts] = useState([]);
  const [loadingProviders, setLoadingProviders] = useState(false);
  const [loadingAccounts, setLoadingAccounts] = useState(false);
  const [startingProvider, setStartingProvider] = useState(null);
  const [pendingResult, setPendingResult] = useState(null);
  const [configAccount, setConfigAccount] = useState(null);
  const [configProvider, setConfigProvider] = useState(null);

  const workspaceId = mainstore.activeWorkspaceId;
  const workspace = workspaceId ? mainstore.workspace(workspaceId) : null;

  const accountsByProvider = useMemo(() => {
    const grouped = new Map();
    for (const account of accounts) {
      if (!account?.provider) continue;
      if (!grouped.has(account.provider)) {
        grouped.set(account.provider, []);
      }
      grouped.get(account.provider).push(account);
    }
    return grouped;
  }, [accounts]);

  const loadProviders = useCallback(async () => {
    setLoadingProviders(true);
    try {
      const response = await fetch("/api/integrations/providers");
      if (!response.ok) {
        throw new Error(`Failed to fetch providers (${response.status})`);
      }
      const body = await response.json();
      setProviders(Array.isArray(body?.providers) ? body.providers : []);
    } catch (error) {
      console.error(error);
      toast.error(error.message || "Unable to load integration providers");
    } finally {
      setLoadingProviders(false);
    }
  }, []);

  const loadAccounts = useCallback(async () => {
    setLoadingAccounts(true);
    try {
      const search = new URLSearchParams();
      if (workspaceId) {
        search.set("workspaceId", workspaceId);
      }
      const response = await fetch(`/api/integrations/accounts${search.size ? `?${search.toString()}` : ""}`);
      if (!response.ok) {
        throw new Error(`Failed to fetch accounts (${response.status})`);
      }
      const body = await response.json();
      setAccounts(Array.isArray(body?.accounts) ? body.accounts : []);
    } catch (error) {
      console.error(error);
      toast.error(error.message || "Unable to load integration accounts");
    } finally {
      setLoadingAccounts(false);
    }
  }, [workspaceId]);

  const handleAccountUpdated = useCallback((updatedAccount) => {
    if (!updatedAccount?.id) {
      return;
    }
    setAccounts((prev) => prev.map((account) => (
      account.id === updatedAccount.id ? updatedAccount : account
    )));
  }, []);

  const closeConfigurator = useCallback(() => {
    setConfigAccount(null);
    setConfigProvider(null);
  }, []);

  useEffect(() => {
    loadProviders();
  }, [loadProviders]);

  useEffect(() => {
    loadAccounts();
  }, [loadAccounts]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.has("status") || params.has("integration") || params.has("accountId")) {
      setPendingResult({
        status: params.get("status"),
        provider: params.get("integration"),
        accountId: params.get("accountId"),
      });
      params.delete("status");
      params.delete("integration");
      params.delete("accountId");
      const next = params.toString();
      const nextUrl = `${window.location.pathname}${next ? `?${next}` : ""}${window.location.hash ?? ""}`;
      window.history.replaceState({}, document.title, nextUrl);
    }
  }, []);

  useEffect(() => {
    if (!pendingResult) {
      return;
    }
    if (pendingResult.status === "success") {
      const providerInfo = providers.find((entry) => entry.name === pendingResult.provider);
      const label = providerInfo?.title || providerInfo?.name || pendingResult.provider;
      toast.success(`Connected to ${label || "integration"}`);
      loadAccounts();
    } else if (pendingResult.status && pendingResult.status !== "success") {
      toast.error("Integration authorization failed");
    }
    setPendingResult(null);
  }, [pendingResult, providers, loadAccounts]);

  const startOAuth = useCallback(async (providerName) => {
    if (!providerName) {
      return;
    }
    if (!workspaceId) {
      toast.error("Select a workspace before connecting an integration");
      return;
    }
    setStartingProvider(providerName);
    try {
      const params = new URLSearchParams({ workspaceId });
      const returnUrl = new URL(window.location.origin);
      returnUrl.pathname = "/integrations";
      returnUrl.search = "";
      returnUrl.hash = "";
      params.set("returnTo", returnUrl.toString());
      const response = await fetch(`/api/integrations/${providerName}/oauth/start?${params.toString()}`);
      if (!response.ok) {
        throw new Error(`Failed to start authorization (${response.status})`);
      }
      const body = await response.json();
      if (!body?.authorizationUrl) {
        throw new Error("Missing authorization URL");
      }
      window.location.href = body.authorizationUrl;
    } catch (error) {
      console.error(error);
      toast.error(error.message || "Unable to start authorization");
      setStartingProvider(null);
    }
  }, [workspaceId]);

  const renderProviderCard = (provider) => {
    const providerAccounts = accountsByProvider.get(provider.name) ?? [];
    const hasAccounts = providerAccounts.length > 0;
    const configuration = provider.configuration ?? {};
    const accountConfigFields = configuration.account ?? [];
    const primitiveConfigFields = configuration.primitive ?? [];
    const supportsAccountConfig = accountConfigFields.length > 0;
    const supportsPrimitiveConfig = primitiveConfigFields.length > 0;

    return (
      <Card key={provider.name} shadow="sm" className="border border-default-200">
        <CardHeader className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-large font-semibold text-foreground">{provider.title || provider.name}</h2>
            {provider.description && (
              <p className="mt-1 text-small text-default-500">{provider.description}</p>
            )}
            {provider.scopes?.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-2">
                {provider.scopes.map((scope) => (
                  <Chip key={scope} size="sm" variant="flat" color="secondary">
                    {scope}
                  </Chip>
                ))}
              </div>
            )}
          </div>
          <Button
            color="primary"
            radius="full"
            onPress={() => startOAuth(provider.name)}
            isLoading={startingProvider === provider.name}
          >
            {hasAccounts ? "Connect another account" : "Connect"}
          </Button>
        </CardHeader>
        <CardBody className="space-y-4">
          {loadingAccounts && providerAccounts.length === 0 ? (
            <div className="flex items-center gap-2 text-small text-default-500">
              <Spinner size="sm" />
              <span>Loading connections…</span>
            </div>
          ) : hasAccounts ? (
            <div className="space-y-3">
              {providerAccounts.map((account) => {
                return (
                  <div
                    key={account.id}
                    className="rounded-large border border-default-200 bg-default-100/50 p-4"
                  >
                    <div className="flex flex-col gap-2 text-small">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="font-medium text-foreground">Authorized account</span>
                        {account.expiresAt && (
                          <Chip size="sm" variant="flat" color="success">
                            Refreshes {formatDate(account.expiresAt)}
                          </Chip>
                        )}
                      </div>
                      <div className="text-default-500">
                        Connected {formatDate(account.createdAt) || "recently"}
                      </div>
                      {account.scope?.length > 0 && (
                        <div className="text-default-500">
                          Scope: {account.scope.join(", ")}
                        </div>
                      )}
                      {account.metadata && Object.keys(account.metadata).length > 0 ? (
                        <div className="text-default-500">
                          <p className="text-xs uppercase tracking-wide text-default-400">Metadata</p>
                          <pre className="max-h-32 overflow-auto rounded-medium bg-default-200/60 p-2 text-xs text-default-600">
                            {JSON.stringify(account.metadata, null, 2)}
                          </pre>
                        </div>
                      ) : null}
                      <div className="flex flex-wrap items-center justify-between gap-2 text-default-400">
                        <span>
                          Updated {formatDate(account.updatedAt) || formatDate(account.createdAt) || "recently"}
                        </span>
                        {supportsAccountConfig && (
                          <Button
                            size="sm"
                            variant="bordered"
                            onPress={() => {
                              setConfigProvider(provider);
                              setConfigAccount(account);
                            }}
                          >
                            Configure
                          </Button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="text-small text-default-500">
              No accounts connected yet. Use the Connect button to authorize access.
            </p>
          )}
          {supportsPrimitiveConfig && (
            <div className="text-xs text-default-500">
              Additional configuration is applied per external primitive:
              {' '}
              {primitiveConfigFields.map((field) => field.label || field.key).join(', ')}.
            </div>
          )}
        </CardBody>
      </Card>
    );
  };

  return (
    <div className="flex h-full w-full justify-center overflow-y-auto bg-content1">
      <div className="flex w-full max-w-4xl flex-col gap-6 p-6">
        <header className="flex flex-col gap-2">
          <h1 className="text-2xl font-semibold text-foreground">Integrations</h1>
          <p className="text-small text-default-500">
            Connect external data sources to sync records into your workspace.
          </p>
          {workspace && (
            <p className="text-small text-default-400">
              Managing connections for <span className="font-medium text-default-500">{workspace.title}</span>
            </p>
          )}
          {!workspaceId && (
            <Chip color="warning" variant="flat" size="sm" className="w-fit">
              Select a workspace to enable connections
            </Chip>
          )}
        </header>

        <SlackWorkflowManager />

        <Divider />

        {loadingProviders && providers.length === 0 ? (
          <div className="flex items-center gap-2 text-small text-default-500">
            <Spinner size="sm" />
            <span>Loading providers…</span>
          </div>
        ) : providers.length > 0 ? (
          providers.map((provider) => renderProviderCard(provider))
        ) : (
          <Card className="border border-default-200" shadow="sm">
            <CardBody>
              <p className="text-small text-default-500">
                No integrations are currently available. Check back soon for new connection options.
              </p>
            </CardBody>
          </Card>
        )}

        <IntegrationConfigModal
          isOpen={Boolean(configAccount)}
          provider={configProvider}
          account={configAccount}
          onClose={closeConfigurator}
          onAccountUpdated={handleAccountUpdated}
        />
      </div>
    </div>
  );
}
