import { Router } from 'express';
import {
  aiBootstrap,
  aiLogs,
  aiModels,
  aiPlaygroundRun,
  aiPrompts,
  aiProviders,
  aiRules,
  aiSettings,
  aiSkills,
  aiStatus,
  aiSyncOllamaModels,
  aiTools,
  aiUpdateSettings,
} from '../controllers/ai.controller.js';

const router = Router();

router.post('/bootstrap', aiBootstrap);
router.get('/status', aiStatus);

router.get('/settings', aiSettings);
router.put('/settings', aiUpdateSettings);

router.get('/providers', aiProviders);

router.get('/models', aiModels);
router.post('/models/sync-ollama', aiSyncOllamaModels);

router.get('/prompts', aiPrompts);
router.get('/skills', aiSkills);
router.get('/tools', aiTools);
router.get('/rules', aiRules);

router.post('/playground/run', aiPlaygroundRun);
router.get('/logs', aiLogs);

export default router;
