import express from 'express';
import IntegrationQueue from '../integration_queue.js';
import IntegrationAccount from '../model/IntegrationAccount.js';
import { fetchPrimitive } from '../SharedFunctions.js';
import { getIntegration, listIntegrations } from '../integrations/index.js';
import { createIntegrationState, consumeIntegrationState } from '../integrations/state.js';

const router = express.Router();

function ensureWorkspaceAccess(req, workspaceId) {
  if (!workspaceId) {
    return false;
  }
  const ids = (req.user?.workspaceIds ?? []).map((id) => id.toString());
  return ids.includes(workspaceId.toString());
}

router.get('/providers', (req, res) => {
  res.json({ providers: listIntegrations() });
});

router.get('/accounts', async (req, res) => {
  try {
    const { provider, workspaceId } = req.query;
    const filter = { userId: req.user._id };
    if (provider) {
      filter.provider = provider;
    }
    if (workspaceId) {
      if (!ensureWorkspaceAccess(req, workspaceId)) {
        return res.status(403).json({ error: 'Forbidden' });
      }
      filter.workspaceId = workspaceId;
    } else {
      filter.workspaceId = { $in: req.user.workspaceIds ?? [] };
    }
    const accounts = await IntegrationAccount.find(filter).lean();
    res.json({
      accounts: accounts.map((account) => ({
        id: account._id.toString(),
        provider: account.provider,
        workspaceId: account.workspaceId?.toString?.() ?? account.workspaceId,
        scope: account.scope ?? [],
        expiresAt: account.expiresAt ?? null,
        metadata: account.metadata ?? {},
        createdAt: account.createdAt,
        updatedAt: account.updatedAt,
      })),
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/external/:id/sync', async (req, res) => {
  try {
    const { id } = req.params;
    const primitive = await fetchPrimitive(id, { workspaceId: { $in: req.user.workspaceIds ?? [] } });
    if (!primitive) {
      return res.status(404).json({ error: 'Primitive not found' });
    }
    if (primitive.type !== 'external') {
      return res.status(400).json({ error: 'Primitive is not an external integration' });
    }
    await IntegrationQueue().enqueueSync(primitive, {
      provider: req.body?.provider,
      accountId: req.body?.accountId,
      since: req.body?.since,
    });
    res.json({ queued: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/:provider/oauth/start', async (req, res) => {
  try {
    const { provider } = req.params;
    const integration = getIntegration(provider);
    if (!integration) {
      return res.status(404).json({ error: 'Unknown integration provider' });
    }
    const workspaceId = req.query.workspaceId ?? req.user.workspaceIds?.[0];
    if (!workspaceId) {
      return res.status(400).json({ error: 'workspaceId is required' });
    }
    if (!ensureWorkspaceAccess(req, workspaceId)) {
      return res.status(403).json({ error: 'Forbidden' });
    }
    const redirectUri = req.query.redirectUri || integration.defaultRedirectUri;
    const scopes = req.query.scopes
      ? String(req.query.scopes).split(',').map((s) => s.trim()).filter(Boolean)
      : undefined;
    const state = await createIntegrationState({
      provider,
      userId: req.user._id,
      workspaceId,
      redirectUri,
      returnTo: req.query.returnTo,
    });
    const authorizationUrl = integration.getAuthorizationUrl({
      state,
      redirectUri,
      scopes,
    });
    res.json({ authorizationUrl, state });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/:provider/oauth/callback', async (req, res) => {
  try {
    const { provider } = req.params;
    const { code, state } = req.query;
    if (!code || !state) {
      return res.status(400).json({ error: 'Missing code or state' });
    }
    const integration = getIntegration(provider);
    if (!integration) {
      return res.status(404).json({ error: 'Unknown integration provider' });
    }
    const context = await consumeIntegrationState(state);
    if (!context || context.provider !== provider) {
      return res.status(400).json({ error: 'Invalid or expired state parameter' });
    }
    if (req.user?._id && context.userId && req.user._id.toString() !== context.userId.toString()) {
      return res.status(403).json({ error: 'Forbidden' });
    }
    if (!ensureWorkspaceAccess({ user: req.user }, context.workspaceId)) {
      return res.status(403).json({ error: 'Forbidden' });
    }
    const tokens = await integration.exchangeCodeForToken({
      code,
      redirectUri: context.redirectUri,
    });
    const update = {
      provider,
      userId: context.userId,
      workspaceId: context.workspaceId,
      accessToken: tokens.accessToken,
      scope: Array.isArray(tokens.scope)
        ? tokens.scope
        : tokens.scope
          ? String(tokens.scope).split(' ')
          : integration.scopes,
    };
    if (tokens.refreshToken) {
      update.refreshToken = tokens.refreshToken;
    }
    if (tokens.expiresAt) {
      update.expiresAt = tokens.expiresAt;
    } else if (tokens.expiresIn) {
      update.expiresAt = new Date(Date.now() + Number(tokens.expiresIn) * 1000);
    }
    if (tokens.metadata) {
      update.metadata = tokens.metadata;
    }
    const account = await IntegrationAccount.findOneAndUpdate(
      { provider, userId: context.userId, workspaceId: context.workspaceId },
      { $set: update },
      { new: true, upsert: true, setDefaultsOnInsert: true },
    );
    const payload = {
      success: true,
      provider,
      account: account.toSafeObject ? account.toSafeObject() : {
        id: account._id.toString(),
        provider: account.provider,
        workspaceId: account.workspaceId?.toString?.() ?? account.workspaceId,
        scope: account.scope ?? [],
        expiresAt: account.expiresAt ?? null,
        metadata: account.metadata ?? {},
        createdAt: account.createdAt,
        updatedAt: account.updatedAt,
      },
    };
    if (context.returnTo) {
      try {
        const redirectUrl = new URL(context.returnTo);
        redirectUrl.searchParams.set('integration', provider);
        redirectUrl.searchParams.set('status', 'success');
        redirectUrl.searchParams.set('accountId', payload.account.id);
        return res.redirect(redirectUrl.toString());
      } catch (err) {
        // fall through to JSON response if redirect fails
      }
    }
    res.json(payload);
  } catch (error) {
    if (req.query?.state) {
      try { await consumeIntegrationState(req.query.state); } catch (_) { /* noop */ }
    }
    res.status(500).json({ error: error.message });
  }
});

export default router;
