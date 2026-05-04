'use strict';

const conversationService = require('../services/conversationService');

/**
 * GET /ask-ai — Render the conversational AI workspace.
 */
exports.page = async (req, res, next) => {
  try {
    const ws = req.workspace;
    const [threads, ctx] = await Promise.all([
      conversationService.listThreads({ workspaceId: ws.id, ownerUserId: req.user.id, limit: 30 }),
      conversationService.loadWorkspaceContext(ws.id),
    ]);
    res.render('ask-ai', {
      title: 'Ask AI',
      threads: threads,
      workspaceContext: ctx,
      starterPrompts: conversationService.suggestStarterPrompts(ctx),
    });
  } catch (err) {
    next(err);
  }
};

/**
 * GET /api/conversations — list user's threads.
 */
exports.listThreads = async (req, res, next) => {
  try {
    const threads = await conversationService.listThreads({
      workspaceId: req.workspace.id,
      ownerUserId: req.user.id,
    });
    res.json({ threads });
  } catch (err) {
    next(err);
  }
};

/**
 * POST /api/conversations — create a new thread (no message yet).
 * Body: { dataSourceId? }
 */
exports.createThread = async (req, res, next) => {
  try {
    const db = require('../models');
    const dataSourceId = req.body.dataSourceId || null;
    const thread = await db.ConversationThread.create({
      workspaceId: req.workspace.id,
      ownerUserId: req.user.id,
      dataSourceId,
      title: 'New conversation',
      status: 'active',
      lastMessageAt: new Date(),
    });
    res.json({ thread, messages: [] });
  } catch (err) {
    next(err);
  }
};

/**
 * GET /api/conversations/:id — load a thread + all messages.
 */
exports.getThread = async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    const data = await conversationService.getThread({ workspaceId: req.workspace.id, threadId: id });
    if (!data) return res.status(404).json({ error: 'Thread not found.' });
    res.json(data);
  } catch (err) {
    next(err);
  }
};

/**
 * POST /api/conversations/:id/messages — send a message and get AI reply.
 * Body: { content, dataSourceId? }
 *
 * Special: when :id === 'new', creates a thread on the fly.
 */
exports.sendMessage = async (req, res, next) => {
  try {
    const idParam = req.params.id;
    const threadId = (idParam && idParam !== 'new') ? parseInt(idParam, 10) : null;
    const content = String(req.body.content || '');
    const dataSourceId = req.body.dataSourceId || null;
    if (!content.trim()) return res.status(400).json({ error: 'Message content is required.' });

    const result = await conversationService.sendUserMessage({
      workspace: req.workspace,
      user: req.user,
      threadId,
      dataSourceId,
      content,
    });
    res.json(result);
  } catch (err) {
    if (err && err.name === 'AiQuotaExceededError') {
      return res.status(402).json({
        error: 'AI prompt limit reached for this month.',
        quotaExceeded: true,
        info: err.info,
        upgradeUrl: '/billing?limit_hit=ai&plan=' + (req.workspace && req.workspace.plan || 'starter'),
      });
    }
    next(err);
  }
};

/**
 * DELETE /api/conversations/:id
 */
exports.deleteThread = async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    const ok = await conversationService.deleteThread({ workspaceId: req.workspace.id, threadId: id });
    res.json({ success: ok });
  } catch (err) {
    next(err);
  }
};

/**
 * PATCH /api/conversations/:id — rename a thread.
 */
exports.renameThread = async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    const t = await conversationService.renameThread({
      workspaceId: req.workspace.id,
      threadId: id,
      title: req.body.title,
    });
    if (!t) return res.status(404).json({ error: 'Thread not found.' });
    res.json({ thread: t });
  } catch (err) {
    next(err);
  }
};
