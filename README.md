# Hikvision Card Reader Backend

A production-grade Node.js/TypeScript backend that connects to Hikvision card readers via HTTP event streaming, captures real-time access control events, persists them to SQL Server, and exposes them through a JWT-authenticated REST API.

Built for industrial environments where tracking employee access across multiple entry points is critical.

---

## Architecture

```
┌─────────────────┐    HTTP Streaming (ISAPI)     ┌──────────────────────────┐
│  Hikvision      │ ◄─────────────────────────────│                          │
│  Reader 1       │    Digest Authentication      │                          │
│  (172.23.xx.xx) │                               │                          │
└─────────────────┘                               │    Hikvision Backend     │
                                                  │                          │
┌─────────────────┐    HTTP Streaming (ISAPI)     │  ┌──────────────────┐    │
│  Hikvision      │ ◄─────────────────────────────│  │  Event Buffer    │    │
│  Reader 2       │                               │  │  (in-memory)     │    │
│  (172.23.xx.xx) │                               │  └────────┬─────────┘    │
└─────────────────┘                               │           │              │
                                                  │           ▼              │
┌─────────────────┐                               │  ┌──────────────────┐    │
│  Hikvision      │ ◄─────────────────────────────│  │  Batch Insert    │    │
│  Reader 3-30    │                               │  │  → SQL Server    │    │
│  (172.23.xx.xx) │                               │  └──────────────────┘    │
└─────────────────┘                               │                          │
                                                  │  REST API (port 4000)    │
                                                  │  JWT + LDAP Auth         │
                                                  └────────────┬─────────────┘
                                                               │
                                                     ┌──────────▼──────────┐
                                                     │  Client / Dashboard │
                                                     └─────────────────────┘
```

## Tech Stack

| Layer            | Technology                    |
| ---------------- | ----------------------------- |
| Runtime          | Node.js 20 (ES Modules)       |
| Language         | TypeScript 5.3 (strict mode)  |
| Framework        | Express.js 5                  |
| Database         | Microsoft SQL Server (mssql)  |
| Authentication   | JWT + LDAP (Active Directory) |
| Validation       | Zod                           |
| Logging          | Pino                          |
| Email Alerts     | Nodemailer                    |
| Testing          | Vitest + Supertest            |
| Containerization | Docker (multi-stage)          |

## Project Structure

```
src/
├── api/
│   ├── middleware/        # Auth, CORS, rate limiting, error handling
│   ├── routes/            # API route definitions
│   └── validators/        # Zod request validation schemas
├── core/
│   ├── domain/            # TypeScript interfaces & types
│   └── services/          # Business logic layer
├── infrastructure/
│   ├── devices/           # Hikvision reader communication
│   ├── buffer/            # Event buffering & batch processing
│   ├── database/          # SQL Server connection & queries
│   ├── logging/           # Pino logger configuration
│   └── notifications/     # Email alert service
├── stores/                # In-memory data stores
├── app.ts                 # Express app setup
└── server.ts              # Entry point
```

## Getting Started

### Prerequisites

- Node.js 20+
- Microsoft SQL Server
- Hikvision card readers (e.g., DS-K1A802AMF-B) on the same network

### Installation

```bash
git clone https://github.com/iannyman/backend.git
cd backend
npm install
```

### Configuration

Create a `.env` file in the project root:

```env
# Server
PORT=4000
NODE_ENV=development

# Hikvision Device Credentials
DEVICE_USER=admin
DEVICE_PASS=your_device_password

# SQL Server
DB_SERVER=your_sql_host
DB_DATABASE=AppData
DB_USER=sa
DB_PASSWORD=your_db_password

# LDAP / Active Directory
LDAP_URL_IP=ldap://your-domain-controller
LDAP_SEARCH_BASE=dc=your,dc=domain
LDAP_BIND_DN=cn=readuser,dc=your,dc=domain
LDAP_BIND_PASSWORD=your_ldap_password

# Security
JWT_SECRET=your_jwt_secret
JWT_EXPIRES_IN=24h
API_RATE_LIMIT=100

# Email Alerts (optional)
SMTP_HOST=smtp.example.com
SMTP_PORT=587
MAIL_FROM=noreply@example.com
MAIL_TO=admin@company.com

# Readers (JSON array)
READERS=[{"name":"Name_x","ip":"172.23.xx.xx"},{"name":"Name_y","ip":"172.23.xx.xx"}]
```

### Running

```bash
# Development (hot reload)
npm run dev

# Production build
npm run build
npm start

# Docker
docker compose up -d
```

## API Reference

All endpoints (except `/health`) require a JWT token in the `Authorization: Bearer <token>` header.

### Authentication

```
POST /auth/login          # Authenticate via LDAP → returns JWT
POST /auth/verify         # Validate an existing token
```

### Events

```
GET /events                    # All card scan events
GET /events/reader/:name       # Events from a specific reader
GET /events/employee/:id       # Events for a specific employee
```

### Readers

```
GET /readers                   # All readers with online/offline status
GET /readers/:name             # Single reader status
GET /readers?online=false      # Filter by status
```

### Buffer

```
GET /buffer/stats              # Event buffer statistics
POST /buffer/flush             # Manually flush buffer to SQL Server
```

### Health

```
GET /health                    # Service health check
```

### Example

```bash
# Login
curl -X POST http://localhost:4000/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"secret"}'

# Get all events
curl http://localhost:4000/events \
  -H "Authorization: Bearer <token>"

# Get offline readers
curl http://localhost:4000/readers?online=false \
  -H "Authorization: Bearer <token>"
```

## Key Features

- **Real-time streaming** — Persistent HTTP connections via ISAPI `/Event/notification/alertStream`
- **Automatic reconnection** — 3-second retry on connection failures, no events lost
- **Event buffering** — In-memory buffer with batch insertion to SQL Server
- **LDAP authentication** — Validates credentials against Active Directory
- **JWT authorization** — Token-based API access with 24h expiration
- **Rate limiting** — 100 req/15min for API, 5 req/15min for auth endpoints
- **Multi-reader support** — Monitors 20-30+ readers concurrently
- **Email alerts** — Notifications when readers go offline or errors occur
- **Structured logging** — JSON logs via Pino for production observability
- **Request validation** — Zod schemas for all API inputs

## Event Data

When a card is scanned, the reader streams:

```json
{
  "ipAddress": "192.0.0.64",
  "dateTime": "2026-03-25T13:53:37+02:00",
  "eventType": "AccessControllerEvent",
  "AccessControllerEvent": {
    "deviceName": "DS-K1A802AMF-B",
    "majorEventType": 5,
    "cardNo": "0783293105",
    "employeeNoString": "7400",
    "cardReaderNo": 1,
    "doorNo": 1
  }
}
```

The backend parses this into a structured event record, buffers it, and batch-inserts into SQL Server via stored procedure.

## Testing

```bash
npm test               # Run all tests
npm run test:coverage   # Generate coverage report
npm run lint            # Lint with ESLint
npm run lint:fix        # Auto-fix lint issues
```

## Docker

```bash
# Build and run
docker compose up -d

# View logs
docker compose logs -f

# Stop
docker compose down
```

## Troubleshooting

| Issue                 | Solution                                                           |
| --------------------- | ------------------------------------------------------------------ |
| Reader not connecting | Verify IP, check HTTP accessibility, confirm credentials in `.env` |
| No events appearing   | Confirm reader supports ISAPI alertStream, check reader event log  |
| API returns 401       | Authenticate at `/auth/login` first, include Bearer token header   |
| SQL insert failures   | Check SQL Server connectivity, verify stored procedure exists      |

## License

ISC
