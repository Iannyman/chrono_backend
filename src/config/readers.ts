export interface ReaderConfig {
  name: string;
  ip: string;
  port?: number;
}

const readers: ReaderConfig[] = [];

// Load readers from environment variable as JSON
// Example: READERS=[{"name":"308","ip":"172.23.43.92"},{"name":"304DW","ip":"172.23.43.16"}]
if (process.env.READERS) {
  try {
    const envReaders = JSON.parse(process.env.READERS) as ReaderConfig[];
    readers.splice(0, readers.length, ...envReaders);
  } catch {
    throw new Error('Invalid READERS environment variable. Must be a valid JSON array.');
  }
}

export default readers;
