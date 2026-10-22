<a id="生产部署总览"></a>

# Production deployment overview

**English** | **[简体中文](DEPLOYMENT.zh-CN.md)**

This article explains Docker Compose deployment on a common Linux host. Synology uses GHCR single image and fixed project `mn`, please read [`NAS_DEPLOYMENT.md`](NAS_DEPLOYMENT.md) directly.

| Scenario | Usage file | Application form |
| --- | --- | --- |
| Local development | `docker-compose.yml` | Only start PostgreSQL/Redis, Web/API is started by pnpm |
| Normal Linux production | `docker-compose.prod.yml` | Standalone Web/API container, built locally on the host |
| Synology production | `docker-compose.nas.yml` | GHCR single application image, Container Manager management |

The following applies only to normal Linux production. Externally hosted databases, PITR and Redis are not in the current Compose configuration, and the connection and startup dependencies need to be adjusted according to the selected environment. Reason: The repository implementation is a native service and cannot promise that no configuration changes will be required when changing suppliers.

<a id="1-前置条件"></a>

## 1. Preconditions

- A Linux host supporting Docker Engine and Compose v2. Reason: The current deployment portal uses Docker Compose, which needs to be able to run containers and dependent services.
- Two HTTPS addresses under the same primary domain, such as `https://massage-note.example.com` and `https://api.massage-note.example.com`. Same site is required for secure session cookies to work properly. Reason: SameSite sessions must work under the actual same site access address.
- The reverse proxy or load balancer is responsible for TLS, certificate renewal, and proxying Web/API to the local machine `127.0.0.1:3000` and `127.0.0.1:4000` respectively. Reason: The application port only listens to the local machine, and HTTPS and certificates are provided by the external layer.
- The Firebase project has enabled phone login and added the web domain name to Authorized domains. Reason: Real phone number verification depends on the supplier's activation status and source domain name.
- Each database and Redis password use different random values; if the password in the URL contains reserved characters, it must be percent-encoded. Reason: Credentials should be isolated and URL reserved characters need to be encoded for proper connection.

<a id="2-生产变量"></a>

## 2. Production variables

Copy the template and save it on the server only:

```bash
cp .env.production.example .env.production
chmod 600 .env.production
```

Required:

- `WEB_ORIGIN`: The Web Origin actually accessed by the browser, which cannot contain paths or trailing slashes. Reason: Cookie write requests are accurately verified based on the complete Origin.
- `PUBLIC_API_BASE_URL`: The public API address must end with `/api/v1`; it will be written into the front-end package when the Web is built. Reason: The request address within the browser package is determined by the build period value.
- PostgreSQL admin and application passwords, two connection URLs, Redis passwords. Reason: Migration, online requests and rate limiting use different connection identities.
- Firebase Web four public configurations and Admin three private configurations. Newlines in `FIREBASE_PRIVATE_KEY` are written as `\n`. Reason: Public configuration and Admin private key use different environment boundaries.

Optional:

- `MINIMAX_API_KEY`, `MINIMAX_MODEL` and `MINIMAX_TRANSCRIPTION_MODEL`: complex natural language work record, AI financial explanation and short recording transcription; text and voice share the same API key, the text model defaults to `MiniMax-M3`, and the transcription model defaults to `music-cover`. Reason: Text and transliteration share the Provider configuration. If not configured, the core business will not be blocked.

Any production environment must not set `DEV_AUTH_ENABLED=true` or compile development logins into the web. Reason: The development portal does not provide real authentication, production builds must turn it off.

<a id="3-构建和启动"></a>

## 3. Build and launch

Verify variable expansion first, then start:

```bash
docker compose --env-file .env.production -f docker-compose.prod.yml config --quiet
docker compose --env-file .env.production -f docker-compose.prod.yml up -d --build
docker compose --env-file .env.production -f docker-compose.prod.yml ps
```

The startup sequence is PostgreSQL → Database Migration → Permission Hardening → API → Web. The application container uses a non-root user; the database application account can only read and write business tables, and cannot update or delete audits, AI query logs, and real-time outboxes. Reason: The current schema can only be accessed with a restricted account after migration and hardening are completed.

examine:

```bash
curl --fail https://api.massage-note.example.com/api/v1/health
curl --fail https://api.massage-note.example.com/api/v1/health/ready
curl --fail https://massage-note.example.com/login
```

<a id="4-反向代理要求"></a>

## 4. Reverse proxy requirements

- Only expose 443; do not expose PostgreSQL, Redis, 3000, or 4000 directly to the public network. Reason: Browsers should not connect directly to databases, caches, or internal services.
- API proxies must preserve `Host`, `Origin`, `X-Forwarded-For`, `X-Forwarded-Proto` and `Last-Event-ID`. Reason: Source, current limit and event resumption depend on the original request header.
- SSE path `/api/v1/stores/*/events` Turn off proxy buffering, allow long connections, and set read timeout to at least 75 seconds. Reason: Streaming events cannot wait for the proxy to buffer before reaching the client.
- Request body limit is at least 9 MB to accommodate short recordings up to 8 MB; other interfaces may use lower limits. Reason: There is an existing size limit for recording uploads, and the proxy cannot truncate it in advance.
- Neither the Web nor the API may be embedded in third-party pages; the application itself already returns CSP with `X-Frame-Options: DENY`. Reason: Embedding of response headers is currently prohibited and proxies should not weaken it.

<a id="5-首次上线验收"></a>

## 5. First online acceptance

Use the [Release Checklist](RELEASE_CHECKLIST.md) to check the evidence of this release, and the user will complete the real phone number, multiple devices and business acceptance; the default is only command line/API verification. Reason: Automation cannot prove external login and send delivery, and the old settlement layout and financial formula should not be maintained repeatedly on the deployment page.

<a id="6-升级"></a>

## 6. Upgrade

```bash
# 先备份并验证校验和
docker compose --env-file .env.production -f docker-compose.prod.yml build
docker compose --env-file .env.production -f docker-compose.prod.yml up -d
```

The migration service will execute `prisma migrate deploy` before starting the new API. When deleting columns or irreversible data transformation is involved, it must be split into multiple releases of "first expand, then migrate data, and finally shrink". Do not let the old and new containers read incompatible schema in the same upgrade. Reason: Old and new containers cannot access incompatible schemas at the same time, and application rollback cannot reverse data transformations.

The Synology production environment does not use the native build commands in this section, but uses GitHub Actions to publish a single image to GHCR; see [NAS_DEPLOYMENT.md](NAS_DEPLOYMENT.md). GHCR only saves application images and browser public configurations, and all Admin private keys, AI/voice keys, and database passwords are injected when the NAS is running. Reason: NAS uses CI single image, which is a different link from ordinary Linux local build.
