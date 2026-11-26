import { Router } from 'express';
import type { Env } from '../config/env.js';
import {
  assembleDiscordSystem,
  type DiscordSystem,
  type DiscordSystemDeps,
} from '../discord/bootstrap.js';
import type { SettingsRepo } from '../modules/settings/settings.types.js';
import type { Logger } from '../shared/logger.js';
import { DevGateway } from './dev-discord.js';
import {
  DEV_ADMIN_ROLE,
  DEV_CHANNELS,
  DEV_MOD_ROLE,
  DEV_PERSONAS,
  DEV_TEXT_CHANNEL,
  DEV_VOICE_CHANNEL,
  DEV_VOICE_CHANNEL_2,
} from './personas.js';

/** O sistema do bot com o Discord de mentira (as regras são as de verdade). */
export function createDevDiscordSystem(
  env: Env,
  logger: Logger,
  deps: DiscordSystemDeps,
): DiscordSystem & { devGateway: DevGateway } {
  const devGateway = new DevGateway(logger);
  const system = assembleDiscordSystem(env, logger, deps, devGateway, (parts) => ({
    async start() {
      await parts.live.reconcile();
      parts.onReady();
      logger.warn('[dev] Discord de mentira ligado: login e bot simulados (/api/v1/dev)');
    },
    async stop() {},
  }));
  return { ...system, devGateway };
}

/** Configuração inicial do servidor de mentira: calls com live, canal de avisos e cargos. */
export async function seedDevSettings(settings: SettingsRepo, guildId: string): Promise<void> {
  const current = await settings.get(guildId);
  if (current.liveChannelIds.length === 0) {
    await settings.update(
      guildId,
      {
        liveChannelIds: [DEV_VOICE_CHANNEL, DEV_VOICE_CHANNEL_2],
        announceChannelId: DEV_TEXT_CHANNEL,
        logChannelId: DEV_TEXT_CHANNEL,
      },
      'dev',
    );
  }
  if (!current.adminRoleIds.includes(DEV_ADMIN_ROLE)) {
    await settings.modifyList(guildId, 'adminRoleIds', 'add', DEV_ADMIN_ROLE, 'dev');
  }
  if (!current.modRoleIds.includes(DEV_MOD_ROLE)) {
    await settings.modifyList(guildId, 'modRoleIds', 'add', DEV_MOD_ROLE, 'dev');
  }
}

const esc = (s: string) =>
  s.replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!,
  );

const page = (title: string, body: string) => `<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)}</title>
<style>
body{margin:0;background:#0b0b0f;color:#f2f2f5;font:15px/1.5 system-ui,sans-serif}
main{max-width:720px;margin:0 auto;padding:32px 16px}
h1{font-size:22px;margin:0 0 4px} p.sub{color:#9a9aa6;margin:0 0 24px}
.list{display:grid;gap:8px} a.btn,span.tag{display:inline-block;text-decoration:none}
a.btn{background:#ff7a45;color:#1a0b05;font-weight:700;border-radius:10px;padding:10px 14px}
a.btn.ghost{background:#26262e;color:#f2f2f5}
.row{display:flex;align-items:center;gap:10px;flex-wrap:wrap;background:#15151b;border-radius:12px;padding:12px}
.row b{min-width:70px} span.tag{background:#26262e;border-radius:999px;padding:2px 8px;font-size:12px;color:#c9c9d1}
.msg{background:#15151b;border-left:4px solid #ff7a45;border-radius:8px;padding:10px 12px;margin:8px 0}
.msg small{color:#9a9aa6}
</style></head><body><main>${body}</main></body></html>`;

/**
 * Páginas do modo dev (só existem com DEV_FAKE_DISCORD=true):
 *  - /api/v1/dev/login: a tela "do Discord" onde se escolhe quem entra;
 *  - /api/v1/dev: quem está em qual call (entrar/sair simula o Discord) e o que o bot mandou.
 */
export function devRoutes(env: Env, system: ReturnType<typeof createDevDiscordSystem>): Router {
  const router = Router();
  const html = (res: import('express').Response, body: string) => {
    res
      .status(200)
      .setHeader('Content-Security-Policy', "default-src 'none'; style-src 'unsafe-inline'")
      .type('html')
      .send(body);
  };

  router.get('/login', (req, res) => {
    const state = typeof req.query.state === 'string' ? req.query.state : '';
    const back = new URL(env.DISCORD_REDIRECT_URI);
    const items = DEV_PERSONAS.map((p) => {
      back.searchParams.set('code', `dev:${p.id}`);
      back.searchParams.set('state', state);
      const role = p.roles.includes(DEV_ADMIN_ROLE)
        ? 'Admin'
        : p.roles.includes(DEV_MOD_ROLE)
          ? 'Mod'
          : 'Membro';
      return `<div class="row"><b>${esc(p.name)}</b><span class="tag">${role}${p.owner ? ' · dono' : ''}</span>
<a class="btn" href="${esc(back.toString())}">Entrar como ${esc(p.name)}</a></div>`;
    }).join('');
    html(
      res,
      page(
        'Entrar (modo dev)',
        `<h1>Entrar no Screen (modo dev)</h1><p class="sub">Discord de mentira: escolha quem você é.</p><div class="list">${items}</div>`,
      ),
    );
  });

  router.get('/voice', async (req, res, next) => {
    try {
      const userId = String(req.query.user ?? '');
      const channel = req.query.channel ? String(req.query.channel) : null;
      if (!DEV_PERSONAS.some((p) => p.id === userId)) return res.status(400).send('pessoa?');
      if (channel && !DEV_CHANNELS.some((c) => c.id === channel && c.kind === 'voice')) {
        return res.status(400).send('canal?');
      }
      const old = system.devGateway.voiceStates.get(userId) ?? null;
      if (channel) system.devGateway.voiceStates.set(userId, channel);
      else system.devGateway.voiceStates.delete(userId);
      await system.live.handle({ userId, oldChannelId: old, newChannelId: channel });
      res.redirect(303, '/api/v1/dev');
    } catch (err) {
      next(err);
    }
  });

  router.get('/', (_req, res) => {
    const voice = DEV_CHANNELS.filter((c) => c.kind === 'voice');
    const rows = DEV_PERSONAS.map((p) => {
      const at = system.devGateway.voiceStates.get(p.id);
      const where = at ? (voice.find((v) => v.id === at)?.name ?? at) : 'fora das calls';
      const links = voice
        .map(
          (v) =>
            `<a class="btn ghost" href="/api/v1/dev/voice?user=${p.id}&channel=${v.id}">Entrar em ${esc(v.name)}</a>`,
        )
        .join('');
      const leave = at
        ? `<a class="btn ghost" href="/api/v1/dev/voice?user=${p.id}">Sair da call</a>`
        : '';
      return `<div class="row"><b>${esc(p.name)}</b><span class="tag">${esc(where)}</span>${links}${leave}</div>`;
    }).join('');
    const msgs =
      system.devGateway.messages
        .map((m) => {
          const e = (m.payload.embeds[0] ?? {}) as { title?: string; description?: string };
          const ch = DEV_CHANNELS.find((c) => c.id === m.channelId)?.name ?? m.channelId;
          return `<div class="msg"><small>#${esc(ch)} · ${esc(m.at)}${m.edited ? ' · editada' : ''}</small><br><b>${esc(e.title ?? m.payload.content ?? '(sem título)')}</b><br>${esc(e.description ?? '')}</div>`;
        })
        .join('') || '<p class="sub">O bot ainda não mandou nada.</p>';
    html(
      res,
      page(
        'Modo dev',
        `<h1>Discord de mentira</h1><p class="sub">Entrar numa call abre a live, como no Discord. Abra o site em <a class="btn ghost" href="${esc(env.WEB_URL)}">${esc(env.WEB_URL)}</a></p>
<div class="list">${rows}</div><h2>O que o bot mandou</h2>${msgs}`,
      ),
    );
  });

  return router;
}
