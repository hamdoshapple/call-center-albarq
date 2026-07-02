import { Request, Response } from 'express';
import {
  aiRepo,
  ensureAiDefaults,
  getAiStatus,
  runPlayground,
  syncOllamaModels,
  updateAiSettings,
} from '../services/ai.service.js';
import { runAiSkill } from '../services/ai-engine.service.js';

function ok(res: Response, data: unknown) {
  return res.json({ ok: true, data });
}

function fail(res: Response, err: unknown) {
  const message = err instanceof Error ? err.message : String(err);
  return res.status(400).json({ ok: false, error: message });
}

export async function aiBootstrap(_req: Request, res: Response) {
  try {
    await ensureAiDefaults();
    return ok(res, { message: 'AI defaults are ready' });
  } catch (err) {
    return fail(res, err);
  }
}

export async function aiStatus(_req: Request, res: Response) {
  try {
    return ok(res, await getAiStatus());
  } catch (err) {
    return fail(res, err);
  }
}

export async function aiSettings(_req: Request, res: Response) {
  try {
    await ensureAiDefaults();
    return ok(res, await aiRepo.settings());
  } catch (err) {
    return fail(res, err);
  }
}

export async function aiUpdateSettings(req: Request, res: Response) {
  try {
    return ok(res, await updateAiSettings(req.body || {}));
  } catch (err) {
    return fail(res, err);
  }
}

export async function aiProviders(_req: Request, res: Response) {
  try {
    await ensureAiDefaults();
    return ok(res, await aiRepo.providers());
  } catch (err) {
    return fail(res, err);
  }
}

export async function aiModels(_req: Request, res: Response) {
  try {
    await ensureAiDefaults();
    return ok(res, await aiRepo.models());
  } catch (err) {
    return fail(res, err);
  }
}

export async function aiSyncOllamaModels(_req: Request, res: Response) {
  try {
    return ok(res, await syncOllamaModels());
  } catch (err) {
    return fail(res, err);
  }
}

export async function aiPrompts(_req: Request, res: Response) {
  try {
    await ensureAiDefaults();
    return ok(res, await aiRepo.prompts());
  } catch (err) {
    return fail(res, err);
  }
}

export async function aiSkills(_req: Request, res: Response) {
  try {
    await ensureAiDefaults();
    return ok(res, await aiRepo.skills());
  } catch (err) {
    return fail(res, err);
  }
}

export async function aiTools(_req: Request, res: Response) {
  try {
    await ensureAiDefaults();
    return ok(res, await aiRepo.tools());
  } catch (err) {
    return fail(res, err);
  }
}

export async function aiRules(_req: Request, res: Response) {
  try {
    await ensureAiDefaults();
    return ok(res, await aiRepo.rules());
  } catch (err) {
    return fail(res, err);
  }
}

export async function aiLogs(_req: Request, res: Response) {
  try {
    return ok(res, await aiRepo.logs());
  } catch (err) {
    return fail(res, err);
  }
}

export async function aiPlaygroundRun(req: Request, res: Response) {
  try {
    const prompt = String(req.body?.prompt || '').trim();
    if (!prompt) return res.status(400).json({ ok: false, error: 'Prompt is required' });

    return ok(res, await runPlayground(prompt));
  } catch (err) {
    return fail(res, err);
  }
}


export async function aiRunSkill(req: Request, res: Response) {
  try {
    const skillKey = String(req.params.key || '').trim();
    const input = String(req.body?.input || '').trim();
    const context = req.body?.context;

    if (!skillKey) return res.status(400).json({ ok: false, error: 'Skill key is required' });
    if (!input) return res.status(400).json({ ok: false, error: 'Input is required' });

    return ok(res, await runAiSkill({ skillKey, input, context }));
  } catch (err) {
    return fail(res, err);
  }
}


export async function aiSetDefaultModel(req: Request, res: Response) {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).json({ ok: false, error: 'Invalid model id' });

    const { setDefaultAiModel } = await import('../services/ai.service.js');
    return ok(res, await setDefaultAiModel(id));
  } catch (err) {
    return fail(res, err);
  }
}

export async function aiUpdatePrompt(req: Request, res: Response) {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).json({ ok: false, error: 'Invalid prompt id' });

    const { updateAiPrompt } = await import('../services/ai.service.js');
    return ok(res, await updateAiPrompt(id, req.body || {}));
  } catch (err) {
    return fail(res, err);
  }
}

export async function aiUpdateSkill(req: Request, res: Response) {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).json({ ok: false, error: 'Invalid skill id' });

    const { updateAiSkill } = await import('../services/ai.service.js');
    return ok(res, await updateAiSkill(id, req.body || {}));
  } catch (err) {
    return fail(res, err);
  }
}

export async function aiUpdateTool(req: Request, res: Response) {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).json({ ok: false, error: 'Invalid tool id' });

    const { updateAiTool } = await import('../services/ai.service.js');
    return ok(res, await updateAiTool(id, req.body || {}));
  } catch (err) {
    return fail(res, err);
  }
}

export async function aiUpdateRule(req: Request, res: Response) {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).json({ ok: false, error: 'Invalid rule id' });

    const { updateAiRule } = await import('../services/ai.service.js');
    return ok(res, await updateAiRule(id, req.body || {}));
  } catch (err) {
    return fail(res, err);
  }
}

export async function aiRunTool(req: Request, res: Response) {
  try {
    const key = String(req.params.key || '').trim();
    if (!key) return res.status(400).json({ ok: false, error: 'Tool key is required' });

    const { runAiTool } = await import('../services/ai-tools/tool-engine.service.js');

    return ok(res, await runAiTool({
      toolKey: key,
      params: req.body?.params || {},
      source: req.body?.source || 'manual',
    }));
  } catch (err) {
    return fail(res, err);
  }
}

export async function aiToolHandlers(_req: Request, res: Response) {
  try {
    const { listAiToolHandlers } = await import('../services/ai-tools/tool-engine.service.js');
    return ok(res, await listAiToolHandlers());
  } catch (err) {
    return fail(res, err);
  }
}

export async function aiConversationIngest(req: Request, res: Response) {
  try {
    const { ingestAiConversationMessage } = await import('../services/ai-conversation.service.js');

    const message = String(req.body?.message || '').trim();
    if (!message) return res.status(400).json({ ok: false, error: 'message is required' });

    return ok(res, await ingestAiConversationMessage({
      channel: String(req.body?.channel || 'manual'),
      externalKey: req.body?.externalKey ? String(req.body.externalKey) : undefined,
      customerPhone: req.body?.customerPhone ? String(req.body.customerPhone) : undefined,
      customerName: req.body?.customerName ? String(req.body.customerName) : undefined,
      message,
      source: req.body?.source ? String(req.body.source) : 'manual',
      metaJson: req.body?.metaJson || undefined,
    }));
  } catch (err) {
    return fail(res, err);
  }
}

export async function aiConversations(_req: Request, res: Response) {
  try {
    const { listAiConversations } = await import('../services/ai-conversation.service.js');
    return ok(res, await listAiConversations());
  } catch (err) {
    return fail(res, err);
  }
}

export async function aiConversationGet(req: Request, res: Response) {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).json({ ok: false, error: 'Invalid conversation id' });

    const { getAiConversation } = await import('../services/ai-conversation.service.js');
    return ok(res, await getAiConversation(id));
  } catch (err) {
    return fail(res, err);
  }
}

export async function aiConversationDecide(req: Request, res: Response) {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).json({ ok: false, error: 'Invalid conversation id' });

    const { decideAiConversationReply } = await import('../services/ai-conversation.service.js');
    return ok(res, await decideAiConversationReply(id));
  } catch (err) {
    return fail(res, err);
  }
}
