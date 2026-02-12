# 🌸 Blossom-server

blossom-server is a Typescript implementation of a [Blossom Server](https://github.com/hzrd149/blossom)

## Supported BUDs

- [x] BUD-01
- [x] BUD-02
- [ ] ~~BUD~03~~ N/A
- [x] BUD-04
- [x] BUD-05
- [x] BUD-06
- [ ] BUD-08

## Project Setup

### Prerequisites

- [Node.js](https://nodejs.org/) v22+
- [pnpm](https://pnpm.io/) v9.12+
- [Docker](https://www.docker.com/) (for containerized deployment)

### Environment Variables

Copy the example env file and fill in the values:

```sh
cp .env.example .env
```

| Variable | Description | Default |
|---|---|---|
| `PORT` | Server port | `3000` |
| `BLOSSOM_ADMIN_PASSWORD` | Admin dashboard password | Auto-generated on each start |
| `BLOSSOM_UPLOAD_TOKEN` | Token required for uploads (via `X-JFKSOCIAL-Token` header) | - |
| `DATABASE_HOST` | PostgreSQL host | `localhost` |
| `DATABASE_PORT` | PostgreSQL port | `5432` |
| `DATABASE_USER` | PostgreSQL user | `postgres` |
| `DATABASE_PASSWORD` | PostgreSQL password | - |
| `DATABASE_NAME` | PostgreSQL database name | `blossom` |
| `S3_ACCESS_KEY` | S3 access key (if using S3 storage) | - |
| `S3_SECRET_KEY` | S3 secret key (if using S3 storage) | - |
| `S3_BUCKET` | S3 bucket name | - |
| `S3_REGION` | S3 region | - |
| `S3_ENDPOINT` | S3 endpoint URL | - |

Environment variables can also be referenced in `config.yml` using the `${VAR_NAME}` syntax.

### Configuration

Copy the example config and modify it to your needs:

```sh
cp config.example.yml config.yml
```

See [`config.example.yml`](./config.example.yml) for all available options including storage, discovery, upload/media optimization, and access rules.

## Running with Docker (Recommended)

The easiest way to deploy is using Docker Compose:

```sh
# 1. Set up env and config
cp .env.example .env
cp config.example.yml config.yml

# 2. Edit .env and config.yml with your values
nano .env
nano config.yml

# 3. Build and start the container
pnpm docker:deploy
```

This runs `docker compose up -d --build --force-recreate --remove-orphans` under the hood, which will:

- Build the Docker image from the Dockerfile
- Start the container in detached mode
- Mount the `data` volume, `config.yml`, and `public/` directory
- Expose the port defined in your `.env` file (defaults to `3096`)
- Pass all database environment variables to the container

To view logs:

```sh
docker compose logs -f
```

To stop the container:

```sh
docker compose down
```

### Docker Compose with PostgreSQL

The `docker-compose.yml` includes a commented-out PostgreSQL service. To use it, uncomment the `postgres` service and its `depends_on` block in the `jfk-blossom` service, then run `pnpm docker:deploy`.

## Running with npx

This app is also packaged as an npm module which you can easily run:

```sh
# copy the example config
wget https://raw.githubusercontent.com/hzrd149/blossom-server/master/config.example.yml -O config.yml
# run using npx
npx blossom-server-ts
```

## Running from Source

### Install and Build

```sh
git clone https://github.com/hzrd149/blossom-server.git
cd blossom-server
pnpm install
cd admin && pnpm install && cd ../
pnpm build
```

### Configure

```sh
cp .env.example .env
cp config.example.yml config.yml
# edit both files with your values
```

### Start

```sh
pnpm start
# or
node .
```

### Development

```sh
pnpm dev
```

Once the server is running you can open `http://localhost:3000` to access the server.

## Routes

### Client-Side Pages

| Route | Description |
|---|---|
| `/` | Home page - public upload/mirror UI |
| `/admin` | Admin dashboard (React app, requires basic auth) |

### Blossom API (Backend)

| Method | Route | Auth | Description |
|---|---|---|---|
| `HEAD` | `/upload` | Optional | Check if uploads are enabled and auth is valid |
| `PUT` | `/upload` | Nostr (`upload`) | Upload a blob |
| `HEAD` | `/media` | Optional | Check if media uploads are enabled |
| `PUT` | `/media` | Nostr (`media`) | Upload and optimize media (image/video) |
| `PUT` | `/mirror` | Nostr (`upload`) | Mirror a blob from a URL |
| `GET` | `/list/:pubkey` | Nostr (`list`) | List blobs owned by a pubkey |
| `HEAD` | `/:hash` | None | Check if a blob exists (returns type and size) |
| `GET` | `/:hash` | None | Fetch/download a blob by SHA-256 hash |
| `DELETE` | `/:hash` | Nostr (`delete`) | Remove ownership of a blob |

### Admin API (Backend)

All admin API routes are mounted at `/api` and require HTTP Basic Auth (`username` / `password` from `config.yml`).

| Method | Route | Description |
|---|---|---|
| `ALL` | `/api/auth` | Verify admin credentials |
| `GET` | `/api/blobs` | List all blobs (supports filter, sort, pagination) |
| `GET` | `/api/blobs/:id` | Get a single blob by SHA-256 |
| `DELETE` | `/api/blobs/:id` | Delete a blob from storage and database |
| `GET` | `/api/rules` | List storage rules |
| `GET` | `/api/rules/:id` | Get a single rule by index |
| `GET` | `/api/users` | List all users (blob owners) |

# Blossom Server - Project Structure

```
blossom-server/
├── admin/                          # Admin dashboard (React + Vite)
│   └── src/
│       ├── blobs/
│       │   ├── BlobList.tsx
│       │   ├── BlobPreview.tsx
│       │   ├── ShowBlob.tsx
│       │   └── index.ts
│       ├── helpers/
│       │   └── string.ts
│       ├── rules/
│       │   ├── RuleList.tsx
│       │   └── index.ts
│       ├── users/
│       │   ├── UserList.tsx
│       │   └── index.ts
│       ├── App.tsx
│       ├── Layout.tsx
│       ├── authProvider.ts
│       ├── dataProvider.ts
│       └── index.tsx
├── src/                            # Source code (TypeScript)
│   ├── admin-api/                  # Admin API routes
│   │   ├── auth.ts
│   │   ├── blobs.ts
│   │   ├── helpers.ts
│   │   ├── index.ts
│   │   ├── router.ts
│   │   ├── rules.ts
│   │   └── users.ts
│   ├── api/                        # Blossom API routes
│   │   ├── delete.ts
│   │   ├── fetch.ts
│   │   ├── has.ts
│   │   ├── index.ts
│   │   ├── list.ts
│   │   ├── media.ts
│   │   ├── mirror.ts
│   │   ├── router.ts
│   │   └── upload.ts
│   ├── db/                         # Database layer (Drizzle ORM)
│   │   ├── db.ts
│   │   ├── index.ts
│   │   ├── methods.ts
│   │   └── schema.ts
│   ├── discover/                   # Blob discovery
│   │   ├── nostr.ts
│   │   └── upstream.ts
│   ├── helpers/                    # Utility functions
│   │   ├── blob.ts
│   │   ├── error.ts
│   │   ├── file.ts
│   │   ├── object.ts
│   │   ├── sql.ts
│   │   └── stream.ts
│   ├── optimize/                   # Media optimization
│   │   ├── image.ts
│   │   ├── index.ts
│   │   └── video.ts
│   ├── rules/                      # Access rules
│   │   └── index.ts
│   ├── storage/                    # Blob storage
│   │   ├── index.ts
│   │   └── upload.ts
│   ├── transport/                  # HTTP transport
│   │   └── http.ts
│   ├── config.ts
│   ├── helpers.ts
│   ├── index.ts                    # App entry point
│   ├── logger.ts
│   ├── ndk.ts
│   ├── polyfill.ts
│   ├── types.ts
│   └── user-profiles.ts
├── drizzle/                        # Database migrations
│   └── 0000_jittery_mole_man.sql
├── Dockerfile
├── docker-compose.yml
├── config.example.yml
├── drizzle.config.ts
├── package.json
└── tsconfig.json
```
