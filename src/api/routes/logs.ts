import { Router } from 'express';
import { optionalAuthenticate } from '../middleware/auth.js';
import fs from 'fs/promises';
import path from 'path';

const router = Router();

// GET /logs/file - return today's log file content
router.get('/', optionalAuthenticate, async (_req, res) => {
  try {
    const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
    const fileName = `app-${today}.log`;

    const logFilePath = path.join(process.cwd(), 'logs', fileName);

    // Read file
    const fileContent = await fs.readFile(logFilePath, 'utf-8');

    // Convert NDJSON -> JSON array
    const logs = fileContent
      .split('\n')
      .filter(line => line.trim() !== '')
      .map(line => {
        try {
          return JSON.parse(line);
        } catch (err) {
          return { error: 'Invalid JSON line', raw: line };
        }
      });

    res.json({
      file: fileName,
      count: logs.length,
      logs,
    });

  } catch {
    res.status(500).json({
      error: 'Failed to read log file'
    });
  }
});

export default router;