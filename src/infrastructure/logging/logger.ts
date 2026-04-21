import pino from 'pino';
import { config } from '../../config/index.js';
import { join } from 'path';
import { existsSync } from 'fs';
import { mkdir } from 'fs/promises';
import pinoPretty from 'pino-pretty';

const logLevel = config.logging.level;
const prettyPrint = config.logging.prettyPrint;

// Ensure logs directory exists
const logsDir = './logs';
if (!existsSync(logsDir)) {
  await mkdir(logsDir, { recursive: true });
}

const tz = process.env.TZ || 'UTC';

function tzParts(timeZone: string) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    hour12: false,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  }).formatToParts(new Date());
  return Object.fromEntries(parts.map(p => [p.type, p.value]));
}

// Create current date string for log filename
function getLogFilename(): string {
  const p = tzParts(tz);
  return `app-${p.year}-${p.month}-${p.day}.log`;
}

// Create streams array for multistream
const streams: Array<{ level: string; stream: any }> = [
  // Always write to file (JSON format)
  {
    level: logLevel,
    stream: pino.destination({
      dest: join(logsDir, getLogFilename()),
      sync: false, // Async for better performance
    }),
  },
];

// Add console with pretty print based on environment
if (prettyPrint) {
  streams.unshift({
    level: logLevel,
    stream: pinoPretty({
      colorize: true,
      translateTime: 'SYS:standard',
      ignore: 'pid,hostname',
      singleLine: false,
    }),
  });
}

export const logger = pino(
  {
    level: logLevel,
    formatters: {
      level: label => ({ level: label }),
    },
    timestamp: () => {
      const d = new Date();
      const p = tzParts(tz);
      const u = tzParts('UTC');
      const ms = String(d.getMilliseconds()).padStart(3, '0');
      const localMin = +p.hour * 60 + +p.minute;
      const utcMin = +u.hour * 60 + +u.minute;
      let diff = localMin - utcMin;
      if (diff > 720) diff -= 1440;
      if (diff < -720) diff += 1440;
      const sign = diff >= 0 ? '+' : '-';
      const hh = String(Math.floor(Math.abs(diff) / 60)).padStart(2, '0');
      const mm = String(Math.abs(diff) % 60).padStart(2, '0');
      return `,"time":"${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}:${p.second}.${ms}${sign}${hh}:${mm}"`;
    },
  },
  pino.multistream(streams)
);

// Function to get current log file path
export function getCurrentLogFile(): string {
  return join(logsDir, getLogFilename());
}

export default logger;
