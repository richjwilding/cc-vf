const MAX_HISTORY_ENTRIES = 500;

function normalizeChatEntry(entry) {
  if (!entry || typeof entry !== 'object') {
    return null;
  }

  const role = typeof entry.role === 'string' ? entry.role : 'assistant';
  const content = typeof entry.content === 'string' ? entry.content : '';

  const normalized = { role, content };

  if (entry.hidden === true) {
    normalized.hidden = true;
  }
  if (entry.preview === true) {
    normalized.preview = true;
  }
  if (entry.context && typeof entry.context === 'object') {
    normalized.context = entry.context;
  }
  if (typeof entry.resultFor === 'string') {
    normalized.resultFor = entry.resultFor;
  }
  if (typeof entry.name === 'string') {
    normalized.name = entry.name;
  }

  return normalized;
}

export function sanitizeChatHistory(messages) {
  if (!Array.isArray(messages) || messages.length === 0) {
    return [];
  }

  const trimmed = messages.slice(-MAX_HISTORY_ENTRIES);
  return trimmed
    .map((entry) => normalizeChatEntry(entry))
    .filter(Boolean);
}

export function createHistoryRecorder(initialMessages = []) {
  const messages = sanitizeChatHistory(initialMessages);
  let displayContent = '';
  let actionCounter = 0;

  const applyAssistantUpdate = (text, hidden = false, extra = {}) => {
    const baseEntry = {
      role: 'assistant',
      content: typeof text === 'string' ? text : '',
      ...(hidden ? { hidden: true } : {}),
      ...extra,
    };

    const normalized = normalizeChatEntry(baseEntry);
    if (!normalized) {
      return;
    }

    const last = messages[messages.length - 1];
    const canUpdateExisting =
      last &&
      last.role === 'assistant' &&
      last.preview !== true &&
      !last.context &&
      !normalized.context;

    if (canUpdateExisting) {
      Object.assign(last, normalized);
    } else {
      messages.push(normalized);
    }
  };

  const handleContent = (payload) => {
    if (typeof payload.content !== 'string') {
      return;
    }

    let content = payload.content;
    if (content.startsWith('__SC_BK')) {
      const rewind = content.match(/__SC_BK(\d+)__/);
      if (rewind) {
        const rewindCount = parseInt(rewind[1], 10) || 0;
        displayContent = rewindCount > 0
          ? displayContent.slice(0, Math.max(0, displayContent.length - rewindCount))
          : displayContent;
        content = content.slice(rewind[0].length);
      }
    }

    displayContent += content;

    if (displayContent.includes('[[agent_running]]')) {
      displayContent = displayContent.replace('[[agent_running]]', '');
    } else {
      const updateMatch = displayContent.match(/\[\[update:[^\]]*\]\]$/);
      if (updateMatch) {
        displayContent = displayContent.slice(0, -updateMatch[0].length);
      }
    }

    applyAssistantUpdate(displayContent, payload.hidden === true);

    if (payload.hidden) {
      displayContent = '';
    }
  };

  const handleContext = (payload) => {
    const contextData = payload?.context?.context;
    let contextText = '';

    if (contextData?.canCreate) {
      const itemText = typeof contextData.action_title === 'string'
        ? contextData.action_title
        : 'Add query to canvas';
      const itemId = actionCounter++;
      contextText = `[[action_item:${itemId}:${itemText}]]`;
    }

    const hidden = contextData?.canCreate ? false : true;

    const other = { ...payload };
    delete other.content;
    delete other.preview;

    applyAssistantUpdate(contextText, hidden, other);
    displayContent = '';
  };

  const handlePreview = (payload) => {
    const { preview, ...other } = payload;
    applyAssistantUpdate(typeof preview === 'string' ? preview : '', false, {
      ...other,
      preview: true,
    });
    displayContent = '';
  };

  const process = (payload = {}) => {
    if (!payload || typeof payload !== 'object') {
      return;
    }
    if (payload.done || payload.agent_mode) {
      return;
    }

    if (typeof payload.content === 'string' && payload.content.length) {
      handleContent(payload);
      return;
    }

    if (payload.context) {
      handleContext(payload);
      return;
    }

    if (payload.preview) {
      handlePreview(payload);
      return;
    }
  };

  const finalize = () => sanitizeChatHistory(messages);

  return {
    process,
    finalize,
    getMessages: () => messages,
  };
}

export function normalizeChatEntryForTesting(entry) {
  return normalizeChatEntry(entry);
}
