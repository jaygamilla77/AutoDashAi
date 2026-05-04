'use strict';

/**
 * Conversation Service — orchestrator for the "Ask AI" workspace.
 *
 * Phase 1 scope:
 *   - Persist multi-turn conversations per workspace + user.
 *   - Build workspace-aware system context (data sources + schemas).
 *   - Send the conversation to Azure OpenAI through aiService (which already
 *     respects the workspace's BYO endpoint preference).
 *   - Detect simple structured intents (chart / dashboard / summarise / question)
 *     so the UI can render quick action buttons next to the assistant's reply.
 *   - Enforce monthly AI-prompt quota with auto-rollover.
 *
 * Future phases (NOT done here):
 *   - SSE / streaming
 *   - Inline chart rendering against live data
 *   - Tool-calling loop (forecast, anomaly, dashboard refinement)
 *   - Saveable / shareable sessions
 */

const db = require('../models');
const aiService = require('./aiService');
const planService = require('./planService');

const MAX_CONTEXT_MESSAGES = 12;     // How many recent turns to send to the LLM
const MAX_DATA_SOURCES_IN_CTX = 6;   // Cap to keep the prompt tight
const MAX_COLUMNS_PER_SCHEMA = 25;

class AiQuotaExceededError extends Error {
  constructor(info) {
    super('AI prompt quota exceeded for this month.');
    this.name = 'AiQuotaExceededError';
    this.info = info;
  }
}

/* ───────────────────────── Quota ───────────────────────── */

function startOfMonth(d) {
  const x = new Date(d);
  return new Date(x.getFullYear(), x.getMonth(), 1, 0, 0, 0, 0);
}

async function rolloverIfNeeded(workspace) {
  const now = new Date();
  const reset = workspace.aiPromptsResetAt ? new Date(workspace.aiPromptsResetAt) : null;
  if (!reset || now >= reset) {
    workspace.aiPromptsUsedThisMonth = 0;
    // Next rollover = first day of next month
    const next = startOfMonth(new Date(now.getFullYear(), now.getMonth() + 1, 1));
    workspace.aiPromptsResetAt = next;
    await workspace.save();
  }
}

async function enforceAiQuota(workspace) {
  if (!workspace) return;
  await rolloverIfNeeded(workspace);
  const limits = planService.getLimits(workspace.plan || 'starter');
  const limit = limits.aiGenerationsPerMonth;
  if (limit === Infinity || limit == null) return;
  if ((workspace.aiPromptsUsedThisMonth || 0) >= limit) {
    throw new AiQuotaExceededError({
      plan: workspace.plan,
      limit,
      used: workspace.aiPromptsUsedThisMonth,
      resetAt: workspace.aiPromptsResetAt,
    });
  }
}

async function bumpAiQuota(workspace) {
  if (!workspace) return;
  workspace.aiPromptsUsedThisMonth = (workspace.aiPromptsUsedThisMonth || 0) + 1;
  await workspace.save();
}

/* ─────────────────────── Context build ─────────────────── */

async function loadWorkspaceContext(workspaceId) {
  const sources = await db.DataSource.findAll({
    where: { workspaceId },
    order: [['createdAt', 'DESC']],
    limit: MAX_DATA_SOURCES_IN_CTX,
    attributes: ['id', 'name', 'sourceType'],
  });

  const schemas = sources.length
    ? await db.DataSourceSchema.findAll({
        where: { dataSourceId: sources.map((s) => s.id) },
        attributes: ['dataSourceId', 'datasetName', 'schemaJson'],
      })
    : [];

  const schemaByDsId = {};
  schemas.forEach((s) => {
    if (!schemaByDsId[s.dataSourceId]) schemaByDsId[s.dataSourceId] = [];
    schemaByDsId[s.dataSourceId].push(s);
  });

  return sources.map((s) => {
    const datasets = (schemaByDsId[s.id] || []).map((sc) => {
      let cols = [];
      try {
        const parsed = JSON.parse(sc.schemaJson || '[]');
        cols = (Array.isArray(parsed) ? parsed : []).slice(0, MAX_COLUMNS_PER_SCHEMA).map((c) => ({
          name: c.name || c.displayName || c.key,
          type: c.type,
          role: c.role,
        }));
      } catch (_) { /* ignore */ }
      return { datasetName: sc.datasetName, columns: cols };
    });
    return {
      id: s.id,
      name: s.name,
      type: s.sourceType,
      datasets,
    };
  });
}

function formatContextForPrompt(ctx) {
  if (!ctx.length) {
    return 'The user has not connected any data sources yet. Politely encourage them to upload a CSV/Excel/JSON file or connect a database from the Sources page before asking analytical questions.';
  }
  const lines = ['The user has the following data sources available in their workspace. Reference them by name when relevant.'];
  ctx.forEach((s, i) => {
    lines.push(`\n#${i + 1} ${s.name} (${s.type})${s.description ? ' — ' + s.description : ''}`);
    s.datasets.forEach((ds) => {
      const cols = ds.columns.map((c) => `${c.name}:${c.type || '?'}${c.role ? '/' + c.role : ''}`).join(', ');
      lines.push(`   • ${ds.datasetName}: [${cols || 'no schema captured'}]`);
    });
  });
  return lines.join('\n');
}

/* ─────────────────────── Prompts ─────────────────────── */

function buildSystemPrompt(workspaceCtx) {
  return [
    'You are AutoDash AI, a senior data analyst, BI consultant and dashboard designer embedded inside a multi-tenant SaaS analytics product.',
    'You help non-technical business users understand their data, build dashboards, and discover insights through natural conversation.',
    '',
    'Style:',
    '- Concise, executive tone. Lead with the answer; explanations second.',
    '- Use Markdown: short paragraphs, bullet lists, **bold** key numbers, code fences for SQL/JSON.',
    '- When you need more info, ask ONE focused follow-up question (date range, dimension, metric, etc.).',
    '- Never invent data values. If the user has no data sources or you lack the schema, say so and suggest the next concrete step.',
    '',
    'Capabilities you can offer:',
    '- Summarise a dataset or KPI',
    '- Recommend the best chart type for a question',
    '- Suggest KPIs / dashboards for a role (Executive, HR, Finance, Sales, Operations)',
    '- Point users to the AI Builder to actually generate a chart or full dashboard',
    '',
    'Workspace context (current user):',
    formatContextForPrompt(workspaceCtx),
  ].join('\n');
}

const INTENT_SYSTEM_PROMPT = [
  'You classify a user message in a data-analytics chat. Return ONLY JSON:',
  '{ "intent": "chart" | "dashboard" | "summarize" | "question" | "clarify" | "smalltalk", "topic": "<short noun phrase or empty>", "needsDataSource": true|false }',
  '',
  '- "chart"      → user wants a single visualization (e.g. "show top 10 employees by productivity").',
  '- "dashboard"  → user wants a multi-panel dashboard or page ("build me an HR dashboard").',
  '- "summarize"  → user wants narrative insight ("explain", "what happened", "trend", "anomaly").',
  '- "question"   → general analytical or product question that does NOT need to render anything.',
  '- "clarify"    → user is replying to a previous follow-up (continuation).',
  '- "smalltalk"  → greetings / thanks / off-topic chitchat.',
].join('\n');

async function classifyIntent(userText) {
  const res = await aiService.chatJSON(INTENT_SYSTEM_PROMPT, userText, { max_tokens: 120 });
  if (!res || typeof res !== 'object') {
    return { intent: 'question', topic: '', needsDataSource: false };
  }
  const allowed = ['chart', 'dashboard', 'summarize', 'question', 'clarify', 'smalltalk'];
  return {
    intent: allowed.includes(res.intent) ? res.intent : 'question',
    topic: typeof res.topic === 'string' ? res.topic.slice(0, 120) : '',
    needsDataSource: !!res.needsDataSource,
  };
}

/* ──────────────── Quick-action payload builder ──────────────── */

// Phase 1 quick actions are deep-links into the existing AI Builder /
// dashboard generator. Phase 2 will replace these with inline rendering.
function buildAction(intent, prompt, workspaceCtx) {
  const firstSourceId = workspaceCtx[0] ? workspaceCtx[0].id : null;
  const enc = encodeURIComponent(prompt || '');
  if (intent === 'chart') {
    return {
      type: 'open_builder',
      label: 'Open in AI Builder',
      href: `/ai-builder?prompt=${enc}${firstSourceId ? '&sourceId=' + firstSourceId : ''}`,
      helper: 'Generate this chart on a real canvas',
    };
  }
  if (intent === 'dashboard') {
    return {
      type: 'open_dashboard_generator',
      label: 'Generate full dashboard',
      href: `/wizard?prompt=${enc}${firstSourceId ? '&sourceId=' + firstSourceId : ''}`,
      helper: 'Use the wizard to build a multi-panel dashboard',
    };
  }
  return null;
}

/* ──────────────── Main entry: reply to a user message ──────────────── */

async function ensureThread({ workspaceId, ownerUserId, dataSourceId, threadId }) {
  if (threadId) {
    const t = await db.ConversationThread.findOne({ where: { id: threadId, workspaceId } });
    if (t) return t;
  }
  return db.ConversationThread.create({
    workspaceId,
    ownerUserId,
    dataSourceId: dataSourceId || null,
    title: 'New conversation',
    status: 'active',
    lastMessageAt: new Date(),
  });
}

async function loadRecentMessages(threadId) {
  const rows = await db.ConversationMessage.findAll({
    where: { threadId },
    order: [['id', 'DESC']],
    limit: MAX_CONTEXT_MESSAGES,
  });
  return rows.reverse();
}

function maybeRetitle(thread, firstUserMessage) {
  if (thread.title && thread.title !== 'New conversation') return null;
  const t = String(firstUserMessage || '').trim().replace(/\s+/g, ' ').slice(0, 60);
  return t || null;
}

async function sendUserMessage({ workspace, user, threadId, dataSourceId, content }) {
  if (!content || !String(content).trim()) {
    throw new Error('Message content is required.');
  }

  await enforceAiQuota(workspace);

  const thread = await ensureThread({
    workspaceId: workspace.id,
    ownerUserId: user.id,
    dataSourceId,
    threadId,
  });

  // Persist the user message first so it's visible even if AI fails
  const userMsg = await db.ConversationMessage.create({
    threadId: thread.id,
    workspaceId: workspace.id,
    role: 'user',
    content: String(content),
  });

  // Load conversation history (including the just-saved user msg)
  const history = await loadRecentMessages(thread.id);
  const workspaceCtx = await loadWorkspaceContext(workspace.id);
  const systemPrompt = buildSystemPrompt(workspaceCtx);

  // Build OpenAI-style messages: system + alternating history.
  // We pass history as a single concatenated user message so we can keep
  // using aiService.chat (which only accepts system+user). Phase 2 will
  // expose a true messages array.
  const transcript = history
    .map((m) => `${m.role === 'assistant' ? 'Assistant' : 'User'}: ${m.content}`)
    .join('\n\n');

  // Classify intent in parallel with main reply (best-effort, ignore errors)
  let intent = { intent: 'question', topic: '', needsDataSource: false };
  let replyText = null;
  const start = Date.now();
  try {
    [intent, replyText] = await Promise.all([
      classifyIntent(content).catch(() => ({ intent: 'question', topic: '', needsDataSource: false })),
      aiService.chat(systemPrompt, transcript, { max_tokens: 800, workspace }),
    ]);
  } catch (err) {
    replyText = null;
  }
  const latency = Date.now() - start;

  if (!replyText) {
    const errMsg = await db.ConversationMessage.create({
      threadId: thread.id,
      workspaceId: workspace.id,
      role: 'assistant',
      content: 'Sorry, I could not generate a response right now. Please try again — or check your AI configuration in **Settings → AI**.',
      errorText: 'aiService returned null',
      latencyMs: latency,
    });
    thread.lastMessageAt = new Date();
    thread.messageCount = (thread.messageCount || 0) + 2;
    await thread.save();
    return { thread, userMessage: userMsg, assistantMessage: errMsg, intent: 'question' };
  }

  const action = buildAction(intent.intent, content, workspaceCtx);

  const asstMsg = await db.ConversationMessage.create({
    threadId: thread.id,
    workspaceId: workspace.id,
    role: 'assistant',
    content: replyText,
    intent: intent.intent,
    actionJson: action ? JSON.stringify(action) : null,
    latencyMs: latency,
  });

  // Bookkeeping
  thread.lastMessageAt = new Date();
  thread.messageCount = (thread.messageCount || 0) + 2;
  const newTitle = maybeRetitle(thread, content);
  if (newTitle) thread.title = newTitle;
  await thread.save();

  await bumpAiQuota(workspace);

  return { thread, userMessage: userMsg, assistantMessage: asstMsg, intent: intent.intent };
}

/* ─────────────────────── Listing helpers ─────────────────────── */

async function listThreads({ workspaceId, ownerUserId, limit = 50 }) {
  return db.ConversationThread.findAll({
    where: { workspaceId, ownerUserId },
    order: [['lastMessageAt', 'DESC'], ['createdAt', 'DESC']],
    limit,
  });
}

async function getThread({ workspaceId, threadId }) {
  const thread = await db.ConversationThread.findOne({ where: { id: threadId, workspaceId } });
  if (!thread) return null;
  const messages = await db.ConversationMessage.findAll({
    where: { threadId: thread.id },
    order: [['id', 'ASC']],
  });
  return { thread, messages };
}

async function deleteThread({ workspaceId, threadId }) {
  const t = await db.ConversationThread.findOne({ where: { id: threadId, workspaceId } });
  if (!t) return false;
  await db.ConversationMessage.destroy({ where: { threadId: t.id } });
  await t.destroy();
  return true;
}

async function renameThread({ workspaceId, threadId, title }) {
  const t = await db.ConversationThread.findOne({ where: { id: threadId, workspaceId } });
  if (!t) return null;
  t.title = String(title || '').slice(0, 200) || t.title;
  await t.save();
  return t;
}

/* ─────────── Suggested starter prompts (right rail) ─────────── */

function suggestStarterPrompts(workspaceCtx) {
  if (!workspaceCtx.length) {
    return [
      'How do I connect my first data source?',
      'What kind of dashboards can AutoDash AI build?',
      'Which file formats does this support?',
    ];
  }
  const first = workspaceCtx[0];
  const ds = (first.datasets[0] && first.datasets[0].datasetName) || first.name;
  return [
    `Summarize the ${ds} dataset in 3 bullets`,
    `Suggest 5 KPIs I should track from ${ds}`,
    `Build me an executive dashboard from ${first.name}`,
    `What trends or anomalies do you see in ${ds}?`,
    `Compare key metrics by category in ${ds}`,
  ];
}

module.exports = {
  AiQuotaExceededError,
  sendUserMessage,
  listThreads,
  getThread,
  deleteThread,
  renameThread,
  loadWorkspaceContext,
  suggestStarterPrompts,
  enforceAiQuota,
};
