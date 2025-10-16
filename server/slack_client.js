import axios from 'axios';
import { getLogger } from './logger.js';

const logger = getLogger('slack-client', 'debug');

const SLACK_API_BASE = 'https://slack.com/api';
const PROGRESS_SEGMENTS = 10;
const PROGRESS_FILLED_EMOJI = ':large_green_square:';
const PROGRESS_EMPTY_EMOJI = ':white_large_square:';

function getBotToken() {
  const token = process.env.SLACK_BOT_TOKEN;
  if (!token) {
    logger.warn('SLACK_BOT_TOKEN is not configured; Slack bot updates are disabled.');
  }
  return token;
}

async function callSlackApi(method, payload) {
  const token = getBotToken();
  if (!token) {
    return null;
  }

  try {
    const response = await axios.post(
      `${SLACK_API_BASE}/${method}`,
      payload,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      },
    );
    if (!response?.data?.ok) {
      const error = response?.data?.error ?? 'unknown_error';
      throw new Error(error);
    }
    return response.data;
  } catch (error) {
    const slackError = error?.response?.data?.error ?? error.message ?? error;
    logger.error(`Slack API ${method} failed`, slackError);
    throw error;
  }
}

function normalizeChannelType(value) {
  if (!value) {
    return null;
  }
  return String(value).toLowerCase();
}

function isLikelyDirectMessage({ channel, channelType, isDirectMessage }) {
  if (isDirectMessage) {
    return true;
  }
  if (channel && channel.startsWith('D')) {
    return true;
  }
  const normalized = normalizeChannelType(channelType);
  if (normalized === 'im' || normalized === 'directmessage') {
    return true;
  }
  return false;
}

async function openDirectMessageChannel(userId) {
  if (!userId) {
    return null;
  }
  try {
    const response = await callSlackApi('conversations.open', { users: userId });
    return response?.channel?.id ?? null;
  } catch (error) {
    const reason = error?.message ?? 'unknown_error';
    logger.debug(`Failed to open Slack DM channel for user ${userId}`, reason);
    return null;
  }
}

async function resolveTargetChannel({
  channel,
  channelType,
  isDirectMessage,
  userId,
}) {
  let targetChannel = channel ?? null;
  const needsDirectMessage = isLikelyDirectMessage({ channel, channelType, isDirectMessage });
  if (userId && (needsDirectMessage || !targetChannel)) {
    const directChannel = await openDirectMessageChannel(userId);
    if (directChannel) {
      targetChannel = directChannel;
    }
  }
  return targetChannel;
}

function normalizePercent(value) {
  const numeric = Number.parseFloat(value);
  if (!Number.isFinite(numeric)) {
    return 0;
  }
  return Math.max(0, Math.min(100, Math.round(numeric)));
}

function renderProgressBar(percent) {
  const clamped = normalizePercent(percent);
  const filled = Math.round((clamped / 100) * PROGRESS_SEGMENTS);
  const safeFilled = Math.max(0, Math.min(PROGRESS_SEGMENTS, filled));
  const remaining = PROGRESS_SEGMENTS - safeFilled;
  return `${PROGRESS_FILLED_EMOJI.repeat(safeFilled)}${PROGRESS_EMPTY_EMOJI.repeat(remaining)}`;
}

function describeStatus(status, failed, isComplete) {
  switch (status) {
    case 'complete':
      return failed > 0 ? 'Completed with issues' : 'Completed';
    case 'error':
      return 'Error';
    case 'waiting':
      return 'Waiting';
    case 'running':
      return failed > 0 ? 'Running with failures' : 'Running';
    case 'not_started':
      return 'Not started';
    case 'starting':
      return 'Starting';
    default:
      if (isComplete) {
        return failed > 0 ? 'Completed with issues' : 'Completed';
      }
      return status ? status.charAt(0).toUpperCase() + status.slice(1) : 'Status unknown';
  }
}

function buildProgressText({
  workflowLabel,
  statusLabel,
  percent,
  completed,
  failed,
  total,
  running,
  pending,
}) {
  const percentDisplay = normalizePercent(percent);
  const finished = (completed ?? 0) + (failed ?? 0);
  const totalDisplay = Number.isFinite(total) && total > 0 ? total : null;
  const stepsSummary = totalDisplay != null
    ? `${finished}/${totalDisplay} steps`
    : `${finished} finished step${finished === 1 ? '' : 's'}`;
  const progressBar = renderProgressBar(percentDisplay);
  const runningSummary = (() => {
    if (running > 0 && pending > 0) {
      return `${running} running, ${pending} waiting`;
    }
    if (running > 0) {
      return `${running} running`;
    }
    if (pending > 0) {
      return `${pending} waiting`;
    }
    return null;
  })();
  const issueSummary = failed > 0 ? `${failed} failed` : null;
  const parts = [
    `${workflowLabel} – ${statusLabel}`,
    `Progress ${renderProgressBar(percentDisplay)} ${percentDisplay}% (${stepsSummary})`,
  ];
  if (issueSummary) {
    parts.push(`Issues: ${issueSummary}`);
  }
  if (runningSummary) {
    parts.push(`Current queue: ${runningSummary}`);
  }
  return parts.join('. ');
}

function buildProgressBlocks({
  icon = ':gear:',
  workflowLabel,
  status,
  percent,
  completed,
  failed,
  total,
  running = 0,
  pending = 0,
  resultsUrl,
  initiatedBy,
  initiatedAt,
  requestTitle,
}) {
  const statusLabel = describeStatus(status, failed, status === 'complete');
  const percentDisplay = normalizePercent(percent);
  const finished = (completed ?? 0) + (failed ?? 0);
  const totalDisplay = Number.isFinite(total) && total > 0 ? total : null;
  const stepsSummary = totalDisplay != null
    ? `${finished}/${totalDisplay} steps`
    : `${finished} step${finished === 1 ? '' : 's'} done`;
  const pendingCount = Number.isFinite(pending) ? pending : 0;
  const runningCount = Number.isFinite(running) ? running : 0;
  const progressBar = renderProgressBar(percentDisplay);

  const fields = [
    {
      type: 'mrkdwn',
      text: `*Progress*\n${progressBar} ${percentDisplay}%`,
    },
    {
      type: 'mrkdwn',
      text: `*Steps*\n${stepsSummary}`,
    },
  ];

  if (pendingCount > 0 || runningCount > 0) {
    const details = [
      runningCount > 0 ? `${runningCount} running` : null,
      pendingCount > 0 ? `${pendingCount} waiting` : null,
    ].filter(Boolean).join(', ');
    if (details) {
      fields.push({
        type: 'mrkdwn',
        text: `*In Flight*\n${details}`,
      });
    }
  }

  if (failed > 0) {
    fields.push({
      type: 'mrkdwn',
      text: `*Issues*\n${failed} failed`,
    });
  }

  const blocks = [
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `${icon} *${workflowLabel}*\n*Status:* ${statusLabel}`,
      },
    },
    {
      type: 'section',
      fields,
    },
  ];

  if (resultsUrl) {
    blocks.push({
      type: 'actions',
      elements: [
        {
          type: 'button',
          text: {
            type: 'plain_text',
            text: 'View results',
            emoji: true,
          },
          url: resultsUrl,
        },
      ],
    });
  }

  const contextElements = [];
  if (requestTitle) {
    contextElements.push({
      type: 'mrkdwn',
      text: `*Request:* ${requestTitle}`,
    });
  }
  if (initiatedBy) {
    contextElements.push({
      type: 'mrkdwn',
      text: `*Requested by:* ${initiatedBy}`,
    });
  }
  if (initiatedAt) {
    const started = new Date(initiatedAt);
    if (!Number.isNaN(started.getTime())) {
      contextElements.push({
        type: 'mrkdwn',
        text: `*Started:* ${started.toLocaleString()}`,
      });
    }
  }
  if (contextElements.length > 0) {
    blocks.push({
      type: 'context',
      elements: contextElements,
    });
  }

  const text = buildProgressText({
    workflowLabel,
    statusLabel,
    percent: percentDisplay,
    completed,
    failed,
    total,
    running,
    pending,
  });

  return { blocks, text };
}

export async function postProgressCard(options) {
  const {
    channel,
    channelType,
    isDirectMessage = false,
    userId,
    workflowLabel,
    status = 'starting',
    percent = 0,
    completed = 0,
    failed = 0,
    total = 0,
    running = 0,
    pending = 0,
    resultsUrl,
    icon = ':gear:',
    initiatedBy,
    initiatedAt,
    requestTitle,
  } = options ?? {};

  const targetChannel = await resolveTargetChannel({
    channel,
    channelType,
    isDirectMessage,
    userId,
  });

  if (!targetChannel) {
    logger.warn('Cannot post Slack progress card without a channel');
    return null;
  }

  const payload = buildProgressBlocks({
    icon,
    workflowLabel,
    status,
    percent,
    completed,
    failed,
    total,
    running,
    pending,
    resultsUrl,
    initiatedBy,
    initiatedAt,
    requestTitle,
  });

  async function sendMessage(channelId) {
    return callSlackApi('chat.postMessage', {
      channel: channelId,
      text: payload.text,
      blocks: payload.blocks,
      unfurl_links: false,
      unfurl_media: false,
    });
  }

  try {
    const response = await sendMessage(targetChannel);
    return response
      ? {
        ok: response.ok,
        ts: response.ts,
        channel: response.channel,
        message: response.message,
      }
      : null;
  } catch (error) {
    if (error?.message === 'channel_not_found' && userId) {
      const directChannel = await openDirectMessageChannel(userId);
      if (directChannel && directChannel !== targetChannel) {
        try {
          const response = await sendMessage(directChannel);
          return response
            ? {
              ok: response.ok,
              ts: response.ts,
              channel: response.channel,
              message: response.message,
            }
            : null;
        } catch (retryError) {
          logger.warn('Retry to post Slack progress card failed', retryError?.message ?? retryError);
        }
      }
    }
    return null;
  }
}

export async function updateProgressCard(options) {
  const {
    channel,
    ts,
    workflowLabel,
    status,
    percent,
    completed,
    failed,
    total,
    running = 0,
    pending = 0,
    resultsUrl,
    icon = ':gear:',
    initiatedBy,
    initiatedAt,
    requestTitle,
  } = options ?? {};

  if (!channel || !ts) {
    logger.warn('Cannot update Slack progress card without channel and ts');
    return false;
  }

  const payload = buildProgressBlocks({
    icon,
    workflowLabel,
    status,
    percent,
    completed,
    failed,
    total,
    running,
    pending,
    resultsUrl,
    initiatedBy,
    initiatedAt,
    requestTitle,
  });

  try {
    const response = await callSlackApi('chat.update', {
      channel,
      ts,
      text: payload.text,
      blocks: payload.blocks,
      unfurl_links: false,
      unfurl_media: false,
    });
    return Boolean(response?.ok);
  } catch (error) {
    return false;
  }
}

export async function postCompletionMessage(options) {
  const {
    channel,
    channelType,
    isDirectMessage = false,
    userId,
    workflowLabel,
    completed,
    failed,
    total,
    resultsUrl,
    status,
  } = options ?? {};

  const targetChannel = await resolveTargetChannel({
    channel,
    channelType,
    isDirectMessage,
    userId,
  });

  if (!targetChannel) {
    logger.warn('Cannot post Slack completion message without a channel');
    return null;
  }

  const finished = (completed ?? 0) + (failed ?? 0);
  const totalDisplay = Number.isFinite(total) && total > 0 ? total : finished;
  const percent = totalDisplay > 0 ? Math.round((finished / totalDisplay) * 100) : 100;
  const normalizedStatus = status ?? (failed > 0 ? 'error' : 'complete');
  const hadIssues = failed > 0 || normalizedStatus === 'error';
  let emoji = ':white_check_mark:';
  if (normalizedStatus === 'error') {
    emoji = ':x:';
  } else if (hadIssues) {
    emoji = ':warning:';
  }
  let summary;
  if (normalizedStatus === 'error' && failed === 0) {
    summary = 'encountered an error';
  } else if (failed > 0) {
    summary = `finished with ${failed} issue${failed === 1 ? '' : 's'}`;
  } else {
    summary = 'completed successfully';
  }
  const parts = [
    `${emoji} ${workflowLabel} ${summary}.`,
    `Progress ${finished}/${totalDisplay} steps (${percent}%).`,
  ];
  if (resultsUrl) {
    parts.push(`<${resultsUrl}|Open results>`);
  }

  async function sendCompletionMessage(channelId) {
    const response = await callSlackApi('chat.postMessage', {
      channel: channelId,
      text: parts.join(' '),
      unfurl_links: false,
      unfurl_media: false,
    });
    return response
      ? { ok: response.ok, ts: response.ts, channel: response.channel }
      : null;
  }

  try {
    return await sendCompletionMessage(targetChannel);
  } catch (error) {
    if (error?.message === 'channel_not_found' && userId) {
      const directChannel = await openDirectMessageChannel(userId);
      if (directChannel && directChannel !== targetChannel) {
        try {
          return await sendCompletionMessage(directChannel);
        } catch (retryError) {
          logger.warn('Retry to post Slack completion message failed', retryError?.message ?? retryError);
        }
      }
    }
    return null;
  }
}

export function slackBotAvailable() {
  return Boolean(process.env.SLACK_BOT_TOKEN);
}
