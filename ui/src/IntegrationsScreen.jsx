import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Button, Card, CardBody, CardHeader, Chip, Divider, Spinner } from "@heroui/react";
import toast from "react-hot-toast";
import MainStore from "./MainStore";

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

export default function IntegrationsScreen() {
  const mainstore = MainStore();
  const [providers, setProviders] = useState([]);
  const [accounts, setAccounts] = useState([]);
  const [loadingProviders, setLoadingProviders] = useState(false);
  const [loadingAccounts, setLoadingAccounts] = useState(false);
  const [startingProvider, setStartingProvider] = useState(null);
  const [pendingResult, setPendingResult] = useState(null);

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
              {providerAccounts.map((account) => (
                <div
                  key={account.id}
                  className="rounded-large border border-default-200 bg-default-100/50 p-4"
                >
                  <div className="flex flex-col gap-1 text-small">
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
                    {account.metadata && Object.keys(account.metadata).length > 0 && (
                      <div className="text-default-500">
                        {Object.entries(account.metadata).map(([key, value]) => (
                          <div key={key}>
                            <span className="font-medium capitalize">{key}:</span> {String(value)}
                          </div>
                        ))}
                      </div>
                    )}
                    <div className="text-default-400">
                      Updated {formatDate(account.updatedAt) || formatDate(account.createdAt) || "recently"}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-small text-default-500">
              No accounts connected yet. Use the Connect button to authorize access.
            </p>
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
      </div>
    </div>
  );
}
