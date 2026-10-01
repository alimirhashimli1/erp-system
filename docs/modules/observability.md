# Observability basics: logs, request IDs, health checks

## Why bother in a learning project?

On one laptop you debug with `console.log` and a breakpoint. With several instances behind
a load balancer, you can't attach a debugger and you can't `grep` five machines. You get
three things: **logs**, **metrics/traces**, and **health signals**. Phase 0 sets up the
first and third properly so later modules inherit them for free.

## Structured logs (Pino)

- Each line is JSON (`{"level":30,"req":{"id":…,"method":…,"url":…},"msg":…}`), so a log
  platform can filter `req.id = X` or `level >= 50` instead of regex-searching prose.
- **Allow-list, not deny-list:** request serializers emit only id, method, URL and status.
  Headers (tokens, cookies) and bodies (passwords, PII) never enter the log pipeline;
  redaction rules are a second line of defence.
- Pretty single-line output in development only; JSON everywhere else.

## Request IDs (correlation)

nginx stamps `X-Request-Id`; the API reuses it if well-formed (`[\w-]{1,64}`, to block log
injection) or generates a UUID, and echoes it back. One ID now ties together the nginx
access log, every API log line and the user's bug report.

## Health checks (Terminus)

| Endpoint            | Question                  | Checks                                            | Used by                                   |
| ------------------- | ------------------------- | ------------------------------------------------- | ----------------------------------------- |
| `/api/health/live`  | Is the process alive?     | nothing external                                  | Docker `HEALTHCHECK` (restart if failing) |
| `/api/health/ready` | Can it serve traffic now? | Postgres `SELECT 1`, Redis `PING` (1.5 s timeout) | load balancer / dashboard                 |

Keeping liveness dependency-free matters: if the DB blips and liveness checked the DB,
the orchestrator would restart every API container at once, turning a blip into an outage.

## Later (Phase 5)

Metrics (request rate, error rate, latency percentiles), OpenTelemetry traces across
API → DB → queue, and log shipping.
