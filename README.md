# Kraft/Trade

Kraft/Trade is a full-stack cryptocurrency paper-trading platform. It relays live Binance Spot market data, gives every new user a configurable paper balance, and simulates market, limit, and stop-loss orders without moving real funds or cryptocurrency.

> **Paper trading only.** The application does not use Binance account APIs, exchange API keys, embedded wallets, deposits, withdrawals, or real asset custody.

## Contents

- [Features](#features)
- [Technology](#technology)
- [Architecture](#architecture)
- [Project structure](#project-structure)
- [Local setup](#local-setup)
- [Configuration](#configuration)
- [Authentication and onboarding](#authentication-and-onboarding)
- [Trading behavior](#trading-behavior)
- [REST API](#rest-api)
- [Socket.IO API](#socketio-api)
- [Data model](#data-model)
- [Testing](#testing)
- [Deployment](#deployment)
- [Security](#security)
- [Troubleshooting](#troubleshooting)

## Features

- Privy email and Google authentication with login, registration, and logout
- First-login onboarding that stores the verified Privy email and a user-provided name
- Live prices and 24-hour market statistics for BTC, ETH, SOL, BNB, XRP, and DOGE against USDT
- Live 20-level Binance order-book depth for the selected market
- Interactive one-minute price chart with historical data, range controls, and hover inspection
- Simulated market, limit, and sell stop-loss orders
- Server-side conditional-order monitoring, cancellation, and execution notifications
- Paper wallet, current holdings, average cost, market value, and unrealized profit/loss
- Paginated transaction history and idempotent order submission
- Privacy-conscious leaderboard ranked by paper portfolio return
- Responsive desktop, tablet, and mobile interface

## Technology

| Layer | Technology |
|---|---|
| Web application | React 19, Vite, TypeScript |
| Authentication | Privy React SDK and Privy Node SDK |
| REST API | Node.js, Express, Zod |
| Live application transport | Socket.IO |
| Market-data transport | Binance WebSocket API through `ws` |
| Database | PostgreSQL, Prisma ORM |
| Monetary arithmetic | PostgreSQL `DECIMAL` and `decimal.js` |
| Security and logging | Helmet, CORS, rate limiting, Pino |
| Testing | Vitest |
| Local infrastructure | Docker Compose |
| Production targets | Vercel for the web app; Railway for API and PostgreSQL |

## Architecture

```mermaid
flowchart LR
    Browser["React web app"]
    Privy["Privy authentication"]
    API["Express REST API"]
    Socket["Socket.IO server"]
    Market["Binance WebSocket relay"]
    BinanceREST["Binance REST API"]
    DB[("PostgreSQL")]

    Browser -->|"Login and access token"| Privy
    Browser -->|"Bearer token + JSON"| API
    Browser <-->|"Authenticated live events"| Socket
    API --> DB
    Socket --> Market
    Market <-->|"Ticker, depth, kline streams"| BinanceWS["Binance Spot WebSocket"]
    API -->|"Historical candles"| BinanceREST
    Socket --> DB
```

### Responsibility boundaries

- **React web app:** renders market data, validates basic form input, requests trades, and merges REST and Socket.IO updates by immutable IDs.
- **Express API:** authenticates requests, owns wallet and order state, validates all trading rules, and returns authoritative portfolio data.
- **Socket.IO server:** authenticates each connection, relays live market events, and pushes order and portfolio changes.
- **Binance relay:** maintains a shared upstream connection, subscribes and unsubscribes to supported streams, caches the latest execution quote, and reconnects with exponential backoff.
- **PostgreSQL:** stores users, wallets, holdings, orders, and immutable trades.
- **Privy:** owns login credentials and verifies user email addresses. The application stores the Privy DID, verified email, and chosen display name; it never stores passwords.

### Market-data flow

1. The browser establishes an authenticated Socket.IO connection.
2. The browser subscribes to supported markets.
3. The API reference-counts subscriptions and sends Binance `SUBSCRIBE` or `UNSUBSCRIBE` messages.
4. Binance ticker, partial-depth, and kline frames are parsed into shared application types.
5. Ticker prices are cached server-side and broadcast to connected clients.
6. The same server-side ticker event evaluates pending limit and stop-loss orders.

### Order execution flow

1. The browser submits a quantity, side, symbol, and unique `clientOrderId`.
2. The API verifies the Privy access token and looks up the local user.
3. Zod validates the request shape and decimal precision.
4. The server obtains its own live price; a client-supplied execution price is never accepted.
5. Wallet, holding, order, and trade changes are committed in one serializable transaction.
6. The response returns the executed trade and authoritative portfolio.
7. Socket.IO publishes matching execution and portfolio events. The UI deduplicates the two delivery paths using the trade ID.

## Project structure

```text
.
├── apps/
│   ├── api/
│   │   ├── prisma/             # Schema and SQL migrations
│   │   └── src/
│   │       ├── auth.ts         # Privy verification and local user provisioning
│   │       ├── index.ts        # Express routes and Socket.IO server
│   │       ├── market-data.ts  # Binance relay and candle retrieval
│   │       └── trading.ts      # Portfolio and order execution domain logic
│   └── web/
│       └── src/
│           ├── App.tsx         # Authentication, onboarding, and trading UI
│           ├── Chart.tsx       # Interactive price visualization
│           ├── api.ts          # Typed REST client
│           └── useMarket.ts    # Socket.IO market client
├── packages/shared/            # Shared Zod schemas and TypeScript contracts
├── .github/workflows/ci.yml    # CI verification
├── docker-compose.yml          # Local PostgreSQL
└── railway.toml                # API deployment configuration
```

## Local setup

### Prerequisites

- Node.js 20 or newer
- npm 10 or newer
- Docker Desktop or another Docker Compose-compatible runtime
- A Privy application with email or Google login enabled

### 1. Install dependencies

```bash
npm install
```

### 2. Start PostgreSQL

```bash
docker compose up -d
```

The default Compose service exposes PostgreSQL on `localhost:5432` with:

- Database: `kraftbase_trade`
- User: `trader`
- Password: `trader`

These credentials are intended for local development only.

### 3. Create environment files

```bash
cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env
```

Update `apps/api/.env`:

```dotenv
DATABASE_URL=postgresql://trader:trader@localhost:5432/kraftbase_trade
PRIVY_APP_ID=your-privy-app-id
PRIVY_APP_SECRET=your-privy-app-secret
WEB_ORIGIN=http://localhost:5173
PORT=4000
STARTING_BALANCE=10000
ALLOW_DEMO_AUTH=false
```

Update `apps/web/.env`:

```dotenv
VITE_API_URL=http://localhost:4000
VITE_PRIVY_APP_ID=your-privy-app-id
VITE_DEMO_MODE=false
```

The frontend and backend must use the same Privy app ID. Never put `PRIVY_APP_SECRET` in the web environment file or in any `VITE_` variable because Vite variables are public browser configuration.

### 4. Configure Privy

In the Privy dashboard:

1. Enable email and, optionally, Google login.
2. Add `http://localhost:5173` to the allowed origins.
3. Copy the app ID to both environment files.
4. Copy the app secret only to `apps/api/.env`.

Embedded wallets are disabled by the web application.

### 5. Generate Prisma and apply migrations

```bash
npm run db:generate
npm run db:migrate
```

For a non-interactive or production-style migration against an existing database:

```bash
npm run db:deploy -w @kraftbase/api
```

### 6. Start the application

```bash
npm run dev
```

| Service | Local URL |
|---|---|
| Web app | [http://localhost:5173](http://localhost:5173) |
| REST and Socket.IO API | [http://localhost:4000](http://localhost:4000) |
| Liveness check | [http://localhost:4000/health](http://localhost:4000/health) |
| Readiness check | [http://localhost:4000/ready](http://localhost:4000/ready) |

### Demo authentication

For local interface evaluation without Privy, set:

```dotenv
# apps/api/.env
ALLOW_DEMO_AUTH=true

# apps/web/.env
VITE_DEMO_MODE=true
```

Demo mode uses a local synthetic identity and must never be enabled in production.

## Configuration

### API variables

| Variable | Required | Default | Description |
|---|---:|---|---|
| `DATABASE_URL` | Yes | — | PostgreSQL connection URL used by Prisma. |
| `PRIVY_APP_ID` | Yes in production | `demo-app` | Privy application identifier. |
| `PRIVY_APP_SECRET` | Yes in production | `demo-secret` | Server-only credential used by the Privy SDK. |
| `PRIVY_VERIFICATION_KEY` | No | — | Optional local JWT verification key. |
| `WEB_ORIGIN` | Yes | `http://localhost:5173` | Comma-separated CORS allowlist for browser origins. |
| `PORT` | No | `4000` | HTTP and Socket.IO listening port. |
| `STARTING_BALANCE` | No | `10000` | Initial paper USDT balance for new users. |
| `ALLOW_DEMO_AUTH` | No | `false` | Enables the local `demo-token` bypass. Never enable in production. |

### Web variables

| Variable | Required | Default | Description |
|---|---:|---|---|
| `VITE_API_URL` | Yes | `http://localhost:4000` | Public REST and Socket.IO server origin. |
| `VITE_PRIVY_APP_ID` | Yes | `demo-app` | Public Privy app identifier. |
| `VITE_DEMO_MODE` | No | `false` | Uses the local demo identity. Never enable in production. |

## Authentication and onboarding

1. The user signs in through Privy with email or Google.
2. Privy issues an access token to the browser.
3. The browser sends the token in the `Authorization` header and Socket.IO handshake.
4. The backend verifies the token with the Privy Node SDK and uses its user ID as the stable identity.
5. On first access, the backend creates a local user and a wallet with `STARTING_BALANCE` USDT.
6. The backend retrieves the verified email from the Privy user record.
7. If the local user has no display name, the web app presents the onboarding form.
8. The submitted name is validated and saved. Returning users proceed directly to the dashboard.

Passwords and refresh tokens are never stored in PostgreSQL or application logs.

## Trading behavior

### Supported markets

`BTCUSDT`, `ETHUSDT`, `SOLUSDT`, `BNBUSDT`, `XRPUSDT`, and `DOGEUSDT`.

All balances and portfolio values use USDT as the quote currency.

### Market orders

- Execute immediately at the latest server-side Binance ticker price.
- Are rejected if the server has no price or the quote is more than five seconds old.
- Require a minimum notional value of 1 USDT.
- Support up to eight decimal places for quantity.
- Revalidate available cash or holdings inside the database transaction.

### Limit orders

- Limit buy: triggers when the live price is less than or equal to the trigger price.
- Limit sell: triggers when the live price is greater than or equal to the trigger price.
- Funds are validated when the order is created and revalidated when it triggers.
- Funds and holdings are not reserved, so a pending order can be rejected later if another trade consumes the required balance.

### Stop-loss orders

- Supported only for selling an existing holding.
- Trigger when the live price is less than or equal to the stop price.
- Use the current server-side market price at execution, not the configured stop price.
- Remain cancellable while their status is `PENDING`.

### Consistency and idempotency

- Each client generates a UUID `clientOrderId`.
- `(userId, clientOrderId)` is unique in PostgreSQL.
- Retrying the same submission returns the existing result instead of trading twice.
- Wallet, holding, order, and trade records are updated using a serializable Prisma transaction.
- Transaction serialization conflicts are retried up to three times.
- Triggered conditional orders are atomically claimed so rapid ticker frames cannot execute the same order twice.

## REST API

The base URL is `http://localhost:4000` locally. JSON is used for request and response bodies.

### Authentication

Except for health checks, market listing, and historical candles, endpoints require:

```http
Authorization: Bearer <privy-access-token>
Content-Type: application/json
```

Example shell variables:

```bash
export API_URL=http://localhost:4000
export TOKEN='<privy-access-token>'
```

### Error format

```json
{
  "error": "Insufficient USDT balance",
  "details": []
}
```

`details` is included for schema-validation failures. Common status codes are:

| Status | Meaning |
|---:|---|
| `400` | Invalid order, precision, balance, holding, or minimum notional. |
| `401` | Missing, expired, or invalid Privy access token. |
| `404` | Unsupported market or pending order not found. |
| `409` | Conditional order was already processed. |
| `422` | Authenticated Privy account has no verified email. |
| `429` | API or order rate limit exceeded. |
| `503` | Live execution quote is missing or stale. |

### Health

#### `GET /health`

Process liveness check. Does not access the database.

```json
{ "status": "ok" }
```

#### `GET /ready`

Database readiness check.

```json
{ "status": "ready" }
```

Returns `503` with `{ "status": "not_ready" }` when PostgreSQL is unavailable.

### User profile

#### `GET /api/v1/me`

Returns the authenticated local profile.

```json
{
  "user": {
    "id": "cm...",
    "name": "Aarav Sharma",
    "email": "aarav@example.com",
    "profileComplete": true
  }
}
```

#### `POST /api/v1/me/profile`

Completes first-login onboarding. The email cannot be submitted or changed through this endpoint; it comes from the verified Privy account.

```bash
curl -X POST "$API_URL/api/v1/me/profile" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name":"Aarav Sharma"}'
```

Name length must be between 2 and 60 characters after trimming.

### Wallet and holdings

#### `GET /api/v1/wallet`

```json
{
  "cashBalance": "9750.25",
  "currency": "USDT",
  "updatedAt": "2026-07-16T13:51:01.797Z"
}
```

#### `GET /api/v1/holdings`

```json
{
  "holdings": [
    {
      "asset": "BTC",
      "quantity": "0.0025",
      "averageCost": "100000"
    }
  ]
}
```

Only positive holdings are returned.

### Markets and candles

#### `GET /api/v1/markets`

Public endpoint returning supported symbols.

```json
{
  "markets": ["BTCUSDT", "ETHUSDT", "SOLUSDT", "BNBUSDT", "XRPUSDT", "DOGEUSDT"]
}
```

#### `GET /api/v1/markets/:symbol/candles?limit=120`

Public proxy for Binance one-minute klines. `limit` is clamped between 20 and 500.

```json
{
  "candles": [
    {
      "symbol": "BTCUSDT",
      "time": 1784209800000,
      "open": 100000,
      "high": 100200,
      "low": 99850,
      "close": 100100,
      "volume": 12.5,
      "closed": true
    }
  ]
}
```

### Market orders

#### `POST /api/v1/orders/market`

```bash
curl -X POST "$API_URL/api/v1/orders/market" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "symbol":"BTCUSDT",
    "side":"BUY",
    "quantity":"0.001",
    "clientOrderId":"a34b6468-89ec-45da-908c-c3c0efaf45be"
  }'
```

Successful response:

```json
{
  "duplicate": false,
  "trade": {
    "id": "cm...",
    "symbol": "BTCUSDT",
    "side": "BUY",
    "quantity": "0.001",
    "price": "100000",
    "quoteAmount": "100",
    "executedAt": "2026-07-16T14:30:00.000Z"
  },
  "portfolio": {
    "wallet": {
      "cashBalance": "9900",
      "currency": "USDT",
      "updatedAt": "2026-07-16T14:30:00.000Z"
    },
    "holdings": [
      { "asset": "BTC", "quantity": "0.001", "averageCost": "100000" }
    ]
  }
}
```

### Conditional orders

#### `POST /api/v1/orders/conditional`

Create a limit order:

```bash
curl -X POST "$API_URL/api/v1/orders/conditional" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "symbol":"ETHUSDT",
    "side":"BUY",
    "type":"LIMIT",
    "quantity":"0.1",
    "triggerPrice":"3000",
    "clientOrderId":"8dbac379-3283-428a-a594-aee3a35524e8"
  }'
```

Create a stop-loss order:

```json
{
  "symbol": "ETHUSDT",
  "side": "SELL",
  "type": "STOP_LOSS",
  "quantity": "0.1",
  "triggerPrice": "2800",
  "clientOrderId": "c882e734-d3df-4766-a11d-5b3e149ab8f3"
}
```

Response:

```json
{
  "duplicate": false,
  "order": {
    "id": "cm...",
    "symbol": "ETHUSDT",
    "side": "BUY",
    "type": "LIMIT",
    "status": "PENDING",
    "quantity": "0.1",
    "triggerPrice": "3000",
    "executionPrice": null,
    "createdAt": "2026-07-16T14:35:00.000Z",
    "rejectionReason": null
  }
}
```

#### `DELETE /api/v1/orders/:id`

Cancels an order only while it is `PENDING`.

```bash
curl -X DELETE "$API_URL/api/v1/orders/cm_order_id" \
  -H "Authorization: Bearer $TOKEN"
```

### Orders and trades

#### `GET /api/v1/orders?limit=25`

Returns the authenticated user's newest orders. `limit` is clamped between 1 and 100.

Order status is one of `PENDING`, `EXECUTED`, `REJECTED`, or `CANCELED`. Order type is one of `MARKET`, `LIMIT`, or `STOP_LOSS`.

#### `GET /api/v1/trades?limit=25&cursor=<trade-id>`

Returns immutable executed trades, newest first.

```json
{
  "trades": [],
  "nextCursor": null
}
```

Pass `nextCursor` as `cursor` to load the next page. `limit` is clamped between 1 and 100.

### Leaderboard

#### `GET /api/v1/leaderboard`

Returns up to 20 users ranked by current paper portfolio value relative to `STARTING_BALANCE`.

```json
{
  "entries": [
    {
      "rank": 1,
      "alias": "Aarav Sharma",
      "portfolioValue": "10450.25",
      "returnPercent": "4.50",
      "isCurrentUser": true
    }
  ]
}
```

When a user has not completed onboarding, the API uses an anonymous generated alias.

## Socket.IO API

Socket.IO runs on the same origin and port as the REST API.

### Connection authentication

```ts
import { io } from "socket.io-client";

const socket = io("http://localhost:4000", {
  auth: { token: privyAccessToken },
  transports: ["websocket", "polling"]
});
```

Missing or invalid tokens reject the connection with `Unauthorized`.

### Client events

#### `market:subscribe`

```ts
socket.emit("market:subscribe", { symbol: "BTCUSDT" });
```

#### `market:unsubscribe`

```ts
socket.emit("market:unsubscribe", { symbol: "BTCUSDT" });
```

Unsupported symbols and duplicate subscriptions are ignored.

### Server events

#### `market:ticker`

```json
{
  "symbol": "BTCUSDT",
  "price": "100100.00",
  "changePercent": "1.25",
  "high": "101000.00",
  "low": "98000.00",
  "volume": "123456789.00",
  "updatedAt": 1784209800000
}
```

#### `market:depth`

```json
{
  "symbol": "BTCUSDT",
  "bids": [["100099.00", "0.42"]],
  "asks": [["100101.00", "0.35"]],
  "updatedAt": 1784209800000
}
```

Each price level is `[price, quantity]`. The relay subscribes to Binance partial depth with 20 levels and 100 ms updates.

#### `market:candle`

```json
{
  "symbol": "BTCUSDT",
  "time": 1784209800000,
  "open": 100000,
  "high": 100200,
  "low": 99850,
  "close": 100100,
  "volume": 12.5,
  "closed": false
}
```

#### `market:status`

```json
{ "connected": true, "message": "Live market connected" }
```

The event also reports upstream interruptions and reconnect attempts.

#### `portfolio:updated`

Contains the same `portfolio` shape returned by market-order execution.

#### `order:executed`

```json
{
  "trade": { "id": "cm...", "symbol": "BTCUSDT", "side": "BUY" },
  "portfolio": { "wallet": {}, "holdings": [] }
}
```

The actual event contains the complete `TradeView` and `PortfolioView` fields documented above.

#### `order:updated`

```json
{
  "order": {
    "id": "cm...",
    "type": "LIMIT",
    "status": "EXECUTED"
  },
  "message": "LIMIT order executed"
}
```

Emitted when a conditional order is placed, executed, rejected, or canceled.

## Data model

| Model | Purpose | Important constraints |
|---|---|---|
| `User` | Local profile linked to a Privy DID. | `privyDid` is unique. |
| `Wallet` | User's available paper USDT. | One wallet per user. `DECIMAL(24,8)`. |
| `Holding` | Quantity and average cost for a crypto asset. | Unique by user and asset. |
| `Order` | Market or conditional-order lifecycle. | `clientOrderId` unique per user. |
| `Trade` | Immutable record of an execution. | Exactly one trade per executed order. |

Deleting a user cascades to their wallet, holdings, orders, and trades. Deleting an order referenced by a trade is restricted.

## Testing

Run the complete verification suite:

```bash
npm run typecheck
npm test
npm run build
```

Current automated coverage includes:

- Market-order request validation
- Conditional-order and stop-loss rules
- Onboarding name validation
- REST client authorization headers and API errors
- REST and Socket.IO trade-event deduplication
- Defensive transaction-history deduplication

The GitHub Actions workflow installs dependencies, generates Prisma, runs type checks and tests, and creates production builds for pull requests and pushes to `main`.

## Deployment

### API and PostgreSQL on Railway

1. Create a Railway project from the repository.
2. Add a Railway PostgreSQL service.
3. Add an API service using the repository root.
4. Railway will use `railway.toml` to install dependencies, generate Prisma, build shared and API packages, deploy migrations, and start the server.
5. Set:
   - `DATABASE_URL` from Railway PostgreSQL
   - `PRIVY_APP_ID`
   - `PRIVY_APP_SECRET`
   - `WEB_ORIGIN` to the final Vercel origin
   - `ALLOW_DEMO_AUTH=false`
6. Confirm `/health` and `/ready` return `200`.

The API requires a persistent process because it maintains Binance and Socket.IO connections. Do not deploy it as a short-lived serverless function.

### Web application on Vercel

1. Import the same repository into Vercel.
2. Set the root directory to `apps/web`.
3. Set:
   - `VITE_API_URL=https://<railway-api-domain>`
   - `VITE_PRIVY_APP_ID=<privy-app-id>`
   - `VITE_DEMO_MODE=false`
4. Build and deploy.
5. Update API `WEB_ORIGIN` with the exact Vercel origin.
6. Add the Vercel origin to Privy's allowed origins.

### Production smoke test

1. Load the Vercel application over HTTPS.
2. Register a new Privy account.
3. Complete name onboarding and verify the email shown by the application.
4. Confirm live tickers, selected-market depth, and chart updates.
5. Execute a small market buy and verify wallet, holding, history, and notification updates.
6. Create and cancel a limit order.
7. Create a reachable conditional order and verify server-side execution.
8. Confirm the leaderboard updates.
9. Verify API logs do not contain bearer tokens or secrets.

## Security

- Privy access tokens are verified on REST requests and Socket.IO handshakes.
- The server derives identity and verified email from Privy; clients cannot choose another user ID or email.
- The server never trusts client prices, balances, portfolio values, or execution results.
- Money and quantities use decimal arithmetic instead of JavaScript floating point in the execution path.
- Helmet security headers and strict CORS origin allowlists are enabled.
- API requests and order submissions have separate rate limits.
- Request bodies are limited to 32 KB.
- Authorization headers are redacted from structured logs.
- Secrets are read from ignored environment files and server deployment variables.
- Demo authentication is opt-in and disabled by default.

Before production deployment, rotate any secret that has been exposed in logs, source control, screenshots, or chat messages.

## Troubleshooting

### `ready` returns `503`

PostgreSQL is unavailable or migrations have not been applied.

```bash
docker compose ps
docker compose logs postgres
npm run db:deploy -w @kraftbase/api
```

### Login opens but the API returns `401`

- Confirm both apps use the same Privy app ID.
- Confirm the backend app secret belongs to that app ID.
- Add `http://localhost:5173` or the production web origin to Privy.
- Log out and sign in again to refresh the access token.

### Onboarding reports no verified email

The Privy account must have a verified email-linked account. Enable email or Google login in Privy and sign in through one of those methods.

### Prices remain in `Connecting`

- Check API logs for Binance connection errors.
- Confirm the machine or hosting region can reach `wss://stream.binance.com:9443/ws`.
- Binance market data may be restricted in some regions.
- Confirm the API is deployed as a persistent service and supports WebSocket traffic.

### Orders return `503`

The server refuses execution when its latest ticker is absent or older than five seconds. Wait for `Markets live` before submitting.

### Prisma Client is out of date

```bash
npm run db:generate
npm run typecheck
```

### Ports are already in use

```bash
lsof -nP -iTCP:4000 -sTCP:LISTEN
lsof -nP -iTCP:5173 -sTCP:LISTEN
```

Stop the conflicting processes or change `PORT` and `VITE_API_URL` together.
