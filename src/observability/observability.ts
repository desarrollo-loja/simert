import { randomUUID } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import type { INestApplication } from '@nestjs/common';

const CORRELATION_HEADER = 'X-Correlation-ID';
const SAFE_ID = /^[A-Za-z0-9._:-]{1,128}$/;
const counters = new Map<string, number>();
const startedAt = Date.now();

function routeLabel(request: Request): string {
  return request.path
    .replace(/[0-9a-f]{8}-[0-9a-f-]{27,}/gi, ':id')
    .replace(/\/\d+(?=\/|$)/g, '/:id');
}

function label(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

function increment(key: string): void {
  counters.set(key, (counters.get(key) || 0) + 1);
}

function renderMetrics(service: string): string {
  const lines = [
    '# HELP simert_http_requests_total Total HTTP requests completed.',
    '# TYPE simert_http_requests_total counter',
  ];
  for (const [key, count] of counters) {
    const [method, route, status] = key.split('|');
    lines.push(`simert_http_requests_total{service="${label(service)}",method="${label(method)}",route="${label(route)}",status="${label(status)}"} ${count}`);
  }
  lines.push('# HELP simert_process_uptime_seconds Process uptime in seconds.');
  lines.push('# TYPE simert_process_uptime_seconds gauge');
  lines.push(`simert_process_uptime_seconds{service="${label(service)}"} ${((Date.now() - startedAt) / 1000).toFixed(3)}`);
  lines.push('# HELP simert_process_memory_bytes Resident process memory in bytes.');
  lines.push('# TYPE simert_process_memory_bytes gauge');
  lines.push(`simert_process_memory_bytes{service="${label(service)}"} ${process.memoryUsage().rss}`);
  return `${lines.join('\n')}\n`;
}

/** Installs correlation IDs, structured access logs, health and Prometheus metrics. */
export function setupObservability(app: INestApplication, service: string): void {
  app.use((request: Request, response: Response, next: NextFunction) => {
    const supplied = request.header(CORRELATION_HEADER) || '';
    const correlationId = SAFE_ID.test(supplied) ? supplied : randomUUID();
    response.setHeader(CORRELATION_HEADER, correlationId);
    const start = process.hrtime.bigint();
    response.on('finish', () => {
      const durationMs = Number(process.hrtime.bigint() - start) / 1e6;
      const route = routeLabel(request);
      increment(`${request.method}|${route}|${response.statusCode}`);
      // Deliberately log metadata only: never headers, tokens, body or query values.
      console.log(JSON.stringify({ service, correlationId, method: request.method, route, status: response.statusCode, durationMs: Number(durationMs.toFixed(3)) }));
    });
    next();
  });

  const http = app.getHttpAdapter();
  http.get('/health', (_request: Request, response: Response) => response.status(200).json({ status: 'ok', service }));
  http.get('/metrics', (_request: Request, response: Response) => response.type('text/plain').send(renderMetrics(service)));
}
