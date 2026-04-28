import dotenv from 'dotenv';

dotenv.config();

interface ServerConfig {
  port: number;
  nodeEnv: string;
}

interface DeviceConfig {
  user: string;
  password: string;
}

interface EmailConfig {
  host: string;
  port: number;
  user?: string;
  pass?: string;
  secure: boolean;
  from: string;
  to: string[];
  subject: string;
}

interface SecurityConfig {
  jwtSecret: string;
  jwtExpiresIn: string;
  apiRateLimit: number;
}

interface DatabaseConfig {
  server: string;
  database: string;
  user: string;
  password: string;
  encrypt: boolean;
  trustServerCertificate: boolean;
  connectionTimeout: number;
  requestTimeout: number;
}

interface LoggingConfig {
  level: string;
  prettyPrint: boolean;
}

export interface Config {
  server: ServerConfig;
  device: DeviceConfig;
  db: DatabaseConfig;
  email: EmailConfig;
  security: SecurityConfig;
  logging: LoggingConfig;
}

function getServerConfig(): ServerConfig {
  return {
    port: parseInt(process.env.PORT || '4000', 10),
    nodeEnv: process.env.NODE_ENV || 'development',
  };
}

function getDeviceConfig(): DeviceConfig {
  const user = process.env.DEVICE_USER;
  const password = process.env.DEVICE_PASS;

  if (!user || !password) {
    throw new Error('DEVICE_USER and DEVICE_PASS environment variables are required');
  }

  return { user, password };
}

function getEmailConfig(): EmailConfig {
  const mailTo = process.env.MAIL_TO || '';
  return {
    host: process.env.SMTP_HOST || '',
    port: parseInt(process.env.SMTP_PORT || '587', 10),
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
    secure: process.env.SMTP_SECURE === 'true',
    from: process.env.MAIL_FROM || 'noreply@example.com',
    to: mailTo.split(/[;,]/).map(e => e.trim()).filter(Boolean),
    subject: process.env.MAIL_SUBJECT || 'Access Control Alert',
  };
}

function getSecurityConfig(): SecurityConfig {
  const jwtSecret = process.env.JWT_SECRET;
  if (!jwtSecret) {
    throw new Error('JWT_SECRET environment variable is required');
  }

  return {
    jwtSecret,
    jwtExpiresIn: process.env.JWT_EXPIRES_IN || '24h',
    apiRateLimit: parseInt(process.env.API_RATE_LIMIT || '100', 10),
  };
}

function getLoggingConfig(): LoggingConfig {
  return {
    level: process.env.LOG_LEVEL || 'info',
    prettyPrint: process.env.LOG_PRETTY_PRINT !== 'false',
  };
}

function getDbConfig(): DatabaseConfig {
  const server = process.env.DB_SERVER;
  const database = process.env.DB_DATABASE;
  const user = process.env.DB_USER;
  const password = process.env.DB_PASSWORD;

  if (!server || !database || !user || !password) {
    throw new Error('DB_SERVER, DB_DATABASE, DB_USER, and DB_PASSWORD environment variables are required');
  }

  return {
    server,
    database,
    user,
    password,
    encrypt: process.env.DB_ENCRYPT !== 'false',
    trustServerCertificate: process.env.DB_TRUST_CERT === 'true',
    connectionTimeout: parseInt(process.env.DB_CONNECTION_TIMEOUT || '30000', 10),
    requestTimeout: parseInt(process.env.DB_REQUEST_TIMEOUT || '30000', 10),
  };
}

export const config: Config = {
  server: getServerConfig(),
  device: getDeviceConfig(),
  db: getDbConfig(),
  email: getEmailConfig(),
  security: getSecurityConfig(),
  logging: getLoggingConfig(),
};

export default config;
