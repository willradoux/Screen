import { createServer, type Server } from 'node:http';
import type { RequestHandler } from 'express';
import { collectDefaultMetrics, Counter, Gauge, Histogram, Registry } from 'prom-client';
import type { Logger } from '../shared/logger.js';

/**
 * Métricas no formato Prometheus. Ficam numa porta própria e interna
 * (`METRICS_PORT`, que o compose NÃO publica), não na API pública.
 * Ver docs/infra/README.md#observabilidade.
 */
export const registry = new Registry();
collectDefaultMetrics({ register: registry, prefix: 'screem_' });

const common = { registers: [registry] };

export const metrics = {
  httpRequests: new Counter({
    name: 'screem_http_requests_total',
    help: 'Requisições HTTP atendidas',
    labelNames: ['method', 'route', 'status'] as const,
    ...common,
  }),
  httpDuration: new Histogram({
    name: 'screem_http_request_duration_seconds',
    help: 'Duração das requisições HTTP',
    labelNames: ['method', 'route'] as const,
    buckets: [0.005, 0.025, 0.1, 0.25, 0.5, 1, 2.5, 5],
    ...common,
  }),
  logins: new Counter({
    name: 'screem_logins_total',
    help: 'Logins com Discord por resultado (ok ou o código do erro)',
    labelNames: ['result'] as const,
    ...common,
  }),
  webhookEvents: new Counter({
    name: 'screem_livekit_webhook_events_total',
    help: 'Eventos recebidos do LiveKit',
    labelNames: ['event'] as const,
    ...common,
  }),
  auditActions: new Counter({
    name: 'screem_audit_actions_total',
    help: 'Ações de moderação e administração registradas na auditoria',
    labelNames: ['action'] as const,
    ...common,
  }),
  schedulerActions: new Counter({
    name: 'screem_scheduler_actions_total',
    help: 'O que o agendador de reuniões fez (opened, reminded, ended)',
    labelNames: ['kind'] as const,
    ...common,
  }),
  socketConnections: new Gauge({
    name: 'screem_socket_connections',
    help: 'Conexões Socket.IO abertas',
    ...common,
  }),
  roomsOpen: new Gauge({
    name: 'screem_rooms_open',
    help: 'Salas abertas agora',
    labelNames: ['type'] as const,
    ...common,
  }),
  participants: new Gauge({
    name: 'screem_participants_connected',
    help: 'Pessoas conectadas às salas agora',
    ...common,
  }),
  botReady: new Gauge({
    name: 'screem_bot_ready',
    help: '1 se o bot do Discord está conectado',
    ...common,
  }),
};

/** Rota como padrão (`/api/v1/rooms/:id`), nunca o caminho real: evita explodir os rótulos. */
export function routeLabel(req: { baseUrl: string; route?: { path?: unknown } }): string {
  const path = req.route?.path;
  return typeof path === 'string' ? `${req.baseUrl}${path}` : 'unmatched';
}

/**
 * Guarda onde o roteador da API está montado (`/api/v1`). Quando um erro sobe do roteador, o
 * Express já restaurou `req.baseUrl` para vazio no fim da requisição; sem isto o rótulo
 * perderia o prefixo.
 */
export const mountPoint: RequestHandler = (req, res, next) => {
  res.locals.metricsBase = req.baseUrl;
  next();
};

/** Conta e mede cada requisição quando ela termina. */
export function httpMetrics(): RequestHandler {
  return (req, res, next) => {
    const end = metrics.httpDuration.startTimer();
    res.on('finish', () => {
      const route = routeLabel({
        baseUrl: (res.locals.metricsBase as string | undefined) ?? req.baseUrl,
        route: req.route,
      });
      metrics.httpRequests.inc({ method: req.method, route, status: String(res.statusCode) });
      end({ method: req.method, route });
    });
    next();
  };
}

export interface GaugeSources {
  openLiveCount: () => Promise<number>;
  openMeetingCount: () => Promise<number>;
  connectedParticipants: () => Promise<number>;
}

/** Atualiza os medidores que vêm do banco. Chamado a cada leitura de `/metrics`. */
export async function refreshGauges(sources: GaugeSources): Promise<void> {
  const [live, meeting, participants] = await Promise.all([
    sources.openLiveCount(),
    sources.openMeetingCount(),
    sources.connectedParticipants(),
  ]);
  metrics.roomsOpen.set({ type: 'LIVE' }, live);
  metrics.roomsOpen.set({ type: 'MEETING' }, meeting);
  metrics.participants.set(participants);
}

/**
 * Servidor mínimo só para o Prometheus. Qualquer outro caminho dá 404 e o
 * banco só é consultado quando alguém lê `/metrics`.
 */
export function startMetricsServer(
  port: number,
  refresh: () => Promise<void>,
  logger: Logger,
): Server {
  const server = createServer((req, res) => {
    if (req.method !== 'GET' || req.url !== '/metrics') {
      res.writeHead(404).end();
      return;
    }
    refresh()
      .catch((err) => logger.warn({ err }, 'falha ao atualizar métricas do banco'))
      .then(() => registry.metrics())
      .then((body) => {
        res.writeHead(200, { 'Content-Type': registry.contentType }).end(body);
      })
      .catch((err) => {
        logger.error({ err }, 'falha ao gerar métricas');
        res.writeHead(500).end();
      });
  });
  server.listen(port, () => logger.info(`métricas em :${port}/metrics`));
  return server;
}
