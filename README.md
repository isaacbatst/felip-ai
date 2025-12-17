# Felip AI

A Telegram bot application with TDLib worker integration using BullMQ for queue management.

## Architecture

- **nest_api**: NestJS API service handling Telegram bot commands and processing messages
- **tdlib_worker**: Separate worker service handling TDLib operations
- **Redis**: Message queue broker for BullMQ communication between services

## Prerequisites

- Docker and Docker Compose
- pnpm (v10.25.0)
- Node.js

## Setup

1. **Clone the repository** (if not already done)

2. **Install dependencies**:
   ```bash
   pnpm install
   ```

3. **Configure environment variables**:
   ```bash
   cp .env.example .env
   # Edit .env with your configuration
   ```

4. **Start Redis**:
   ```bash
   docker-compose up -d redis
   ```

5. **Start the services**:
   ```bash
   # Start nest_api
   pnpm dev:nest

   # In another terminal, start tdlib_worker
   pnpm dev:worker
   ```

## Docker Compose

The `docker-compose.yml` file includes:

- **Redis**: Message queue service for BullMQ
  - Port: 6379 (configurable via `REDIS_PORT`)
  - Password: Optional (set via `REDIS_PASSWORD`)
  - Data persistence: Volume `redis-data`

### Redis Commands

```bash
# Start Redis
docker-compose up -d redis

# Stop Redis
docker-compose stop redis

# View Redis logs
docker-compose logs -f redis

# Connect to Redis CLI
docker-compose exec redis redis-cli
# Or with password:
docker-compose exec redis redis-cli -a $REDIS_PASSWORD
```

## Development

### Running Services

```bash
# Run both services in parallel (if needed)
pnpm dev:nest    # NestJS API
pnpm dev:worker  # TDLib Worker
```

### Building

```bash
# Build both services
pnpm build

# Build individual services
pnpm build:nest
pnpm build:worker
```

## Environment Variables

See `.env.example` for all available environment variables.

### Required Variables

- `TELEGRAM_BOT_TOKEN`: Telegram bot token
- `TELEGRAM_API_ID`: Telegram API ID
- `TELEGRAM_API_HASH`: Telegram API hash
- `GOOGLE_SPREADSHEET_ID`: Google Sheets spreadsheet ID
- `GOOGLE_SERVICE_ACCOUNT_KEY_FILE`: Path to service account key file
- `OPENAI_API_KEY`: OpenAI API key

### Optional Variables

- `REDIS_HOST`: Redis host (default: localhost)
- `REDIS_PORT`: Redis port (default: 6379)
- `REDIS_PASSWORD`: Redis password (optional)
- Queue names (defaults provided)

## Queue Architecture

The application uses BullMQ queues for communication:

- **tdlib-commands**: Commands from nest_api to tdlib_worker
- **tdlib-responses**: Responses from tdlib_worker to nest_api
- **tdlib-updates**: Updates from tdlib_worker to nest_api
- **telegram-user-messages**: User messages for processing
- **telegram-bot-messages**: Bot messages for processing

## License

UNLICENSED

