import express from 'express';
import crypto from 'node:crypto';
import mongoose from 'mongoose';
import axios from 'axios';
import Organization from '../model/Organization.js';
import { fetchPrimitive, fetchPrimitives } from '../SharedFunctions.js';
import FlowQueue from '../flow_queue.js';
import { createWorkflowInstance } from '../workflow.js';
import Primitive from '../model/Primitive.js';
import { getLogger } from '../logger.js';
import { postProgressCard, slackBotAvailable } from '../slack_client.js';

const router = express.Router();
const logger = getLogger('slack', 'debug');
const { ObjectId } = mongoose.Types;

async function sendDelayedSlackResponse(responseUrl, payload) {
  if (!responseUrl) {
    logger.warn('No response_url available for delayed Slack message');
    return;
  }
  try {
    await axios.post(responseUrl, {
      response_type: 'ephemeral',
      ...payload,
    });
  } catch (error) {
    logger.error('Failed to send delayed Slack response', error);
  }
}

function rawBodySaver(req, res, buf) {
  if (buf?.length) {
    req.rawBody = buf.toString('utf8');
  }
}

router.use(express.urlencoded({ extended: true, verify: rawBodySaver }));
router.use(express.json({ verify: rawBodySaver }));

function normalizeId(value) {
  if (!value) {
    return undefined;
  }
  if (typeof value === 'string') {
    return value;
  }
  if (value?.toString) {
    return value.toString();
  }
  return undefined;
}

function verifySlackRequest(req) {
  const signingSecret = process.env.SLACK_SIGNING_SECRET;
  if (!signingSecret) {
    logger.error('SLACK_SIGNING_SECRET is not configured');
    return false;
  }
  const timestamp = req.headers['x-slack-request-timestamp'];
  const signature = req.headers['x-slack-signature'];
  if (!timestamp || !signature) {
    return false;
  }
  const fiveMinutesAgo = Math.floor(Date.now() / 1000) - (60 * 5);
  if (Number(timestamp) < fiveMinutesAgo) {
    return false;
  }
  const rawBody = req.rawBody ?? '';
  const base = `v0:${timestamp}:${rawBody}`;
  const hmac = crypto.createHmac('sha256', signingSecret);
  hmac.update(base);
  const expected = `v0=${hmac.digest('hex')}`;
  try {
    return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
  } catch (error) {
    logger.warn('Failed to compare Slack signatures', error);
    return false;
  }
}

async function loadOrganizationByTeam(teamId) {
  if (!teamId) {
    return null;
  }
  return Organization.findOne({ 'slack.teamId': teamId });
}

function sanitizeWorkflowRecord(flow) {
  if (!flow) {
    return null;
  }
  return {
    id: normalizeId(flow._id),
    plainId: flow.plainId ?? null,
    title: flow.title ?? null,
    workspaceId: normalizeId(flow.workspaceId),
  };
}

async function loadEnabledWorkflows(organization) {
  const configured = organization?.slack?.enabledWorkflows ?? [];
  const ids = configured
    .map((value) => normalizeId(value))
    .filter((value) => value && ObjectId.isValid(value));
  if (ids.length === 0) {
    return [];
  }
  const uniqueIds = [...new Set(ids)].map((value) => new ObjectId(value));
  const flows = await fetchPrimitives(uniqueIds, {
    type: 'flow',
    workspaceId: { $in: organization.workspaces.map(d=>d.toString()) ?? [] },
  }, {
    _id: 1,
    plainId: 1,
    title: 1,
    workspaceId: 1,
  }) ?? [];
  return flows
    .map((flow) => sanitizeWorkflowRecord(flow))
    .filter(Boolean);
}

function determineRunAsUserId(organization) {
  const explicit = normalizeId(organization?.slack?.runAsUserId);
  if (explicit) {
    return explicit;
  }
  const members = organization?.members ?? [];
  const rolePriority = ['owner', 'admin', 'editor', 'viewer'];
  for (const role of rolePriority) {
    const match = members.find((member) => member.role === role && normalizeId(member.user));
    if (match) {
      return normalizeId(match.user);
    }
  }
  return null;
}

function buildResultsUrl(organization, instanceId) {
  const base = (organization?.slack?.resultsBaseUrl ?? '').trim() || process.env.APP_BASE_URL;
  if (!base) {
    return null;
  }
  try {
    const url = new URL(base);
    const trimmed = url.pathname?.endsWith('/') ? url.pathname.slice(0, -1) : url.pathname;
    url.pathname = `${trimmed ?? ''}/item/${instanceId}`;
    url.search = '';
    url.hash = '';
    return url.toString();
  } catch (error) {
    const safeBase = base.replace(/\/?$/, '');
    return `${safeBase}/item/${instanceId}`;
  }
}

function workflowDisplayName(workflow) {
  if (!workflow) {
    return 'workflow';
  }
  const identifier = workflow.plainId != null ? `#${workflow.plainId}` : workflow.id;
  return `${workflow.title ?? 'Workflow'} (${identifier})`;
}

function flowInstanceDisplayName(instance, workflow) {
  const fallback = workflowDisplayName(workflow);
  if (!instance) {
    return fallback;
  }
  const title = instance.title ?? workflow?.title ?? 'Workflow run';
  const plainId = instance.plainId;
  if (plainId != null) {
    return `${title} (#${plainId})`;
  }
  const identifier = normalizeId(instance._id ?? instance.id);
  return identifier ? `${title} (${identifier})` : title;
}

function buildHelpMessage(workflows) {
  const lines = [
    '*Sense Slack Commands*',
    '`/sense workflows` – list available workflows',
    '`/sense run <workflow>` – create and start a workflow',
    '`/sense instances [workflow]` – list recent runs',
  ];
  if (workflows.length > 0) {
    lines.push('', 'Configured workflows:');
    workflows.slice(0, 5).forEach((workflow) => {
      const identifier = workflow.plainId != null ? `#${workflow.plainId}` : workflow.id;
      lines.push(`• ${workflow.title ?? 'Workflow'} (${identifier})`);
    });
  }
  return lines.join('\n');
}

function listWorkflowsMessage(workflows) {
  if (workflows.length === 0) {
    return 'No workflows are currently enabled for Slack commands.';
  }
  const lines = ['*Available workflows:*'];
  workflows.forEach((workflow) => {
    const identifier = workflow.plainId != null ? `#${workflow.plainId}` : workflow.id;
    lines.push(`• ${workflow.title ?? 'Workflow'} (${identifier})`);
  });
  lines.push('', 'Run a workflow with `/sense run <workflow>`');
  return lines.join('\n');
}

function statusLabel(status) {
  switch (status) {
    case 'running':
      return 'Running';
    case 'complete':
      return 'Complete';
    case 'error':
      return 'Error';
    case 'waiting':
      return 'Waiting';
    case 'not_started':
      return 'Not started';
    default:
      return status ? status.charAt(0).toUpperCase() + status.slice(1) : 'Unknown';
  }
}

function formatTimestamp(value) {
  if (!value) {
    return '';
  }
  try {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      return '';
    }
    return date.toLocaleString();
  } catch (error) {
    return '';
  }
}

async function fetchRecentInstances(workflow, limit = 5) {
  if (!workflow?.id) {
    return [];
  }
  const parentKey = `parentPrimitives.${workflow.id}`;
  const query = {
    type: 'flowinstance',
    [parentKey]: { $exists: true },
    deleted: { $exists: false },
  };
  if (workflow.workspaceId) {
    query.workspaceId = workflow.workspaceId;
  }
  const instances = await Primitive.find(query, {
    title: 1,
    plainId: 1,
    processing: 1,
  })
    .sort({ _id: -1 })
    .limit(limit)
    .lean();
  return instances.map((instance) => ({
    id: normalizeId(instance._id),
    title: instance.title ?? null,
    plainId: instance.plainId ?? null,
    status: instance.processing?.flow?.status ?? 'not_started',
    started: instance.processing?.flow?.started ?? null,
    completed: instance.processing?.flow?.completed ?? null,
  }));
}

function formatInstancesSection(workflow, instances, organization) {
  const header = `*${workflow.title ?? 'Workflow'}*`;
  if (instances.length === 0) {
    return `${header}\n• No runs found.`;
  }
  const lines = [header];
  instances.forEach((instance) => {
    const status = statusLabel(instance.status);
    const timestamp = formatTimestamp(instance.started);
    const link = buildResultsUrl(organization, instance.id);
    const linkText = link ? `<${link}|View results>` : `Instance ${instance.id}`;
    const suffix = timestamp ? ` – started ${timestamp}` : '';
    lines.push(`• ${status}${suffix} – ${linkText}`);
  });
  return lines.join('\n');
}

function findWorkflowByIdentifier(workflows, identifier) {
  if (!identifier) {
    return null;
  }
  const cleaned = identifier.replace(/^#/, '').toLowerCase();
  return workflows.find((workflow) => {
    if (workflow.id && workflow.id.toLowerCase() === identifier.toLowerCase()) {
      return true;
    }
    if (workflow.plainId != null && String(workflow.plainId) === cleaned) {
      return true;
    }
    if (workflow.title && workflow.title.toLowerCase() === identifier.toLowerCase()) {
      return true;
    }
    const short = workflow.title.split(" ")[0]
    if (short.toLowerCase() === identifier.toLowerCase()) {
      return true;
    }
    return false;
  }) ?? null;
}

function respond(res, text) {
  return res.json({ response_type: 'ephemeral', text });
}

async function handleWorkflowRunAsync({
  workflow,
  organization,
  title,
  responseUrl,
  runAsUserId,
  slackContext = {},
}) {
  try {
    const flowPrimitive = await fetchPrimitive(workflow.id, {
      type: 'flow',
      workspaceId: workflow.workspaceId,
    });
    if (!flowPrimitive) {
      logger.warn('Workflow not found when attempting to run from Slack', workflow.id);
      await sendDelayedSlackResponse(responseUrl, { text: 'Unable to load the requested workflow.' });
      return;
    }

    const instanceData = { title, 'inputPins-1': title };
    const created = await createWorkflowInstance(flowPrimitive, {
      data: instanceData,
    });

    const instanceId = normalizeId(created?.id ?? created?._id);
    const instance = instanceId
      ? await fetchPrimitive(instanceId, { workspaceId: workflow.workspaceId })
      : null;
    if (!instance) {
      logger.error('Failed to load created workflow instance for Slack command', created);
      await sendDelayedSlackResponse(responseUrl, { text: 'Workflow instance could not be created.' });
      return;
    }

    const instanceIdentifier = normalizeId(instance.id ?? instance._id);
    const instancePlainId = instance.plainId ?? null;
    const instanceDisplayName = flowInstanceDisplayName(instance, workflow);
    const link = buildResultsUrl(organization, instanceIdentifier);

    const initiatedAt = new Date().toISOString();
    const metadata = {
      ...slackContext,
      responseUrl: responseUrl ?? null,
      initiatedAt,
      workflowId: workflow.id,
      workflowPlainId: workflow.plainId ?? null,
      workflowTitle: workflow.title ?? null,
      workflowDisplayName: workflowDisplayName(workflow),
      instanceDisplayName,
      instancePlainId,
      resultsUrl: link ?? null,
      instanceId: instanceIdentifier,
      lastProgressPercent: null,
      lastProgressCompleted: 0,
      lastProgressFailed: 0,
      lastProgressAt: null,
      requestTitle: title || null,
      botUpdatesEnabled: slackBotAvailable(),
      botChannelId: slackContext.channelId ?? null,
      botChannelType: slackContext.channelType ?? null,
      botChannelIsDirect: slackContext.isDirectMessage ?? false,
      botMessageTs: null,
      botCardPostedAt: null,
      finalMessageSent: false,
      finalMessageTs: null,
      finalMessageAt: null,
      requestUserName: slackContext.userName ?? null,
      requestUserId: slackContext.userId ?? null,
    };

    if (metadata.botUpdatesEnabled && metadata.botChannelId) {
      try {
        const card = await postProgressCard({
          channel: metadata.botChannelId,
          channelType: metadata.botChannelType,
          isDirectMessage: metadata.botChannelIsDirect,
          userId: metadata.requestUserId,
          workflowLabel: metadata.instanceDisplayName,
          status: 'starting',
          percent: 0,
          completed: 0,
          failed: 0,
          total: 0,
          resultsUrl: metadata.resultsUrl,
          initiatedBy: metadata.requestUserName ? `@${metadata.requestUserName}` : null,
          initiatedAt,
          requestTitle: metadata.requestTitle,
        });
        if (card?.ts) {
          metadata.botMessageTs = card.ts;
          metadata.botCardPostedAt = new Date().toISOString();
          metadata.botChannelId = card.channel ?? metadata.botChannelId;
          if (card?.channel) {
            metadata.botChannelIsDirect = card.channel.startsWith('D');
            metadata.botChannelType = metadata.botChannelIsDirect ? 'im' : metadata.botChannelType;
          }
        }
      } catch (cardError) {
        logger.error('Failed to post Slack progress card', cardError);
      }
    }

    await Primitive.updateOne(
      { _id: instanceIdentifier },
      { $set: { 'slack.workflow': metadata } },
    );
    instance.slack = {
      ...(instance.slack ?? {}),
      workflow: metadata,
    };

    try {
      await FlowQueue().runFlowInstance(instance, {
        instantiatedBy: runAsUserId,
        organizationId: normalizeId(organization._id),
        force: true,
      });
    } catch (runError) {
      logger.error('Failed to enqueue workflow instance for Slack command', runError);
      await sendDelayedSlackResponse(responseUrl, {
        text: 'Workflow instance was created but failed to start. Please try again from Sense.',
      });
      return;
    }

    const lines = [`Started ${metadata.instanceDisplayName || workflowDisplayName(workflow)}.`];
    if (link) {
      lines.push(`Track progress: <${link}|View results>.`);
    } else {
      lines.push(`Track progress in Sense by opening item ${instanceIdentifier}.`);
    }
    if (metadata.botMessageTs) {
      const channelName = metadata.channelName ?? null;
      const channelDisplay = channelName
        ? (channelName.startsWith('#') ? channelName : `#${channelName}`)
        : (metadata.botChannelId ? `<#${metadata.botChannelId}>` : 'this channel');
      lines.push(`I'll keep the progress card updated in ${channelDisplay}.`);
    }
    await sendDelayedSlackResponse(responseUrl, { text: lines.join('\n') });
  } catch (error) {
    logger.error('Unhandled Slack workflow run error', error);
    await sendDelayedSlackResponse(responseUrl, { text: 'Something went wrong while starting that workflow.' });
  }
}

router.post('/command', async (req, res) => {
  try {
    if (!verifySlackRequest(req)) {
      return res.status(401).send('Invalid signature');
    }

    const payload = req.body ?? {};
    if (payload.type === 'url_verification' && payload.challenge) {
      return res.json({ challenge: payload.challenge });
    }

    const teamId = payload.team_id || payload.enterprise_id;
    const organization = await loadOrganizationByTeam(teamId);
    if (!organization) {
      return respond(res, 'No Sense organization is configured for this Slack workspace.');
    }

    const workflows = await loadEnabledWorkflows(organization);
    const commandText = (payload.text ?? '').trim();

    if (!commandText || /^help$/i.test(commandText)) {
      return respond(res, buildHelpMessage(workflows));
    }

    const [action, ...args] = commandText.split(/\s+/);
    const actionKey = action?.toLowerCase?.() ?? '';

    if (actionKey === 'workflows' || actionKey === 'list') {
      return respond(res, listWorkflowsMessage(workflows));
    }

    if (actionKey === 'instances' || actionKey === 'runs' || actionKey === 'status') {
      if (workflows.length === 0) {
        return respond(res, 'No workflows are currently enabled for Slack commands.');
      }
      let targetWorkflows = workflows;
      if (args.length > 0) {
        const target = findWorkflowByIdentifier(workflows, args[0]);
        if (!target) {
          return respond(res, `I couldn't find a workflow matching "${args[0]}".`);
        }
        targetWorkflows = [target];
      }

      const sections = [];
      for (const workflow of targetWorkflows) {
        const instances = await fetchRecentInstances(workflow);
        sections.push(formatInstancesSection(workflow, instances, organization));
      }
      return respond(res, sections.join('\n\n'));
    }

    if (actionKey === 'run' || actionKey === 'start') {
      if (workflows.length === 0) {
        return respond(res, 'No workflows are currently enabled for Slack commands.');
      }
      if (args.length === 0) {
        return respond(res, 'Please specify which workflow to run.');
      }
      const workflow = findWorkflowByIdentifier(workflows, args[0]);
      if (!workflow) {
        return respond(res, `I couldn't find a workflow matching "${args[0]}".`);
      }

      const runAsUserId = determineRunAsUserId(organization);
      if (!runAsUserId) {
        return respond(res, 'No eligible user is available to run workflows. Please set a run user in the Sense app.');
      }

      const responseUrl = payload.response_url;
      const title = args.slice(1).join(' ').trim();
      const channelId = payload.channel_id ?? null;
      const channelName = payload.channel_name ?? null;
      const isDirectMessage = Boolean(
        (channelId && channelId.startsWith('D')) || (channelName && channelName.toLowerCase() === 'directmessage'),
      );
      const slackContext = {
        command: payload.command ?? null,
        teamId: payload.team_id ?? null,
        enterpriseId: payload.enterprise_id ?? null,
        channelId,
        channelName,
        channelType: isDirectMessage ? 'im' : (channelName ?? null),
        isDirectMessage,
        triggerId: payload.trigger_id ?? null,
        userId: payload.user_id ?? null,
        userName: payload.user_name ?? null,
        text: payload.text ?? '',
        organizationId: normalizeId(organization._id),
      };
      setImmediate(() => {
        handleWorkflowRunAsync({
          workflow,
          organization,
          title,
          responseUrl,
          runAsUserId,
          slackContext,
        }).catch((error) => {
          logger.error('Failed to handle Slack run command asynchronously', error);
        });
      });

      return respond(res, `Starting ${workflowDisplayName(workflow)}. I'll update you here once it's running.`);
    }

    return respond(res, buildHelpMessage(workflows));
  } catch (error) {
    logger.error('Unhandled Slack command error', error);
    return respond(res, 'Something went wrong while handling that request.');
  }
});

export default router;
