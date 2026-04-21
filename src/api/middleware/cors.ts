import cors from 'cors';
import type { CorsOptions } from 'cors';

const origin = process.env.CORS_ORIGIN || '*';

const corsOptions: CorsOptions = {
    origin,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: true,
};

export const corsMiddleware = cors(corsOptions);