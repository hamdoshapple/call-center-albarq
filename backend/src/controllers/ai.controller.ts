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
