# Screem — contexto para agentes e colaboradores

Atualizado em 09/11/2026, com base na `main` de `willradoux/Screen` até o commit `2d32672`. Leia o código e a documentação atuais antes de implementar: este arquivo é um ponto de partida, não substitui o contrato da API.

## O projeto e as pessoas

**Screem** é a plataforma de chamadas, transmissão de tela, câmera e microfone da comunidade **Acelera DEV** (cerca de mil membros no Discord). A ideia surgiu da necessidade de fazer lives e reuniões da comunidade com controle próprio, vinculadas ao servidor, sem depender das restrições de transmissão dos canais do Discord ou de uma reunião externa. Em conversas anteriores o produto também foi chamado de **Acelera Screen**; o nome atual no repositório é Screem. O site da comunidade é <https://aceleradev.com.br/>.

| Pessoa | Contexto e responsabilidade combinada |
| --- | --- |
| **Will** (`willradoux`) | Idealizador, responsável pelo produto e pelo **frontend**; define prioridades e valida a experiência. Quer alterações diretamente na `main`, sem abrir PR para o próprio trabalho neste momento. |
| **Flazo** (`flazo0`) | Colaborador que construiu a base do monorepo, bot, API, frontend e infraestrutura e segue responsável pelo **backend e pela infraestrutura**. **Está configurando o deploy automático**; coordenar mudanças de infra/deploy com ele para evitar conflito. |
| **PC** | Dono/referência da comunidade Acelera DEV e parte interessada no funcionamento das lives e reuniões. Não atribuir a ele aprovação técnica ou acesso administrativo sem confirmação. |
| **Membros, mods e admins** | Usuários finais; os papéis efetivos vêm dos cargos/permissões do Discord e das configurações do Screem, não dos nomes acima. |

Repositório atual: <https://github.com/willradoux/Screen>. O endereço antigo `willradoux/aceleraScreem` redireciona para ele. A visibilidade atual do repositório é **pública**; confirmar com Will se isso reflete a intenção, pois no início ele cogitou acesso privado. Nunca adicionar credenciais, tokens, IDs sensíveis de bootstrap ou dados pessoais a este arquivo.

## Fluxos do produto

1. **Live vinculada à voz do Discord:** a pessoa entra em um canal de voz na categoria configurada; o bot cria/reutiliza uma sala, publica um embed com botão e link `/r/:roomId` no canal de texto configurado. Ao abrir, faz login com Discord; o servidor verifica a participação na guilda e, para membros comuns, a presença **naquele** canal de voz. Só então emite token do LiveKit. A pessoa transmite ou assiste conforme suas permissões. Ao sair da voz, recebe aviso e uma tolerância configurável antes de ser removida da live.
2. **Reunião da comunidade:** um admin cria ou agenda via `/reuniao` ou painel, com título, horário, cargos admitidos e avisos/lembretes no Discord. O link abre a sala no site; participantes autenticados na guilda não precisam entrar em voz no Discord. Mods/admins controlam a sala conforme a matriz de permissões.
3. **Moderação:** silenciar fontes de mídia, remover ou banir da sala, escolher palestrantes, ativar modo palestra, encerrar sala e consultar auditoria. Admins gerenciam reuniões e configurações; mods têm capacidades limitadas. Aplicar regras no **backend** e nos grants do LiveKit, nunca apenas na UI.

O link identifica a sala, mas **não é credencial de acesso**. Lives admitem uma exceção implementada: `MOD` e `ADMIN` podem entrar sem estar no canal de voz para moderar (`apps/api/src/modules/rooms/access.ts`). Confirmar com Will se essa exceção é desejada: a descrição original do produto dizia que quem sai da call não deve se conectar.

## Stack acordada e topologia pretendida

| Camada | Tecnologias e destino pretendido |
| --- | --- |
| Frontend | React + TypeScript, Vite, Tailwind CSS; site estático servido por nginx na própria VPS (Coolify); Render e Vercel foram descartados. |
| API e bot | Node.js + TypeScript, Express, Socket.IO e discord.js; Docker na **Hostinger KVM1**, com Coolify em configuração. |
| Estado e autenticação | MongoDB/Mongoose, login Discord OAuth2, sessão por cookie; bot acompanha cargos e voice state. |
| Mídia | WebRTC via LiveKit (SFU) e Coturn para redes restritivas; ambos na VPS; Socket.IO transporta eventos de aplicação, não vídeo/áudio. |

Há **duas receitas de infraestrutura** no repositório (`infra/docker-compose.yml` com Caddy e `infra/coolify/docker-compose.yml` com proxy do Coolify). Os documentos mais antigos e `apps/web/vercel.json` ainda apontam para **Vercel**. `render.yaml` propõe **API e web** no Render, mas a decisão relatada por Will é **web no Render, backend/bot/mídia/banco na VPS**. Antes de publicar, alinhar uma única configuração de produção, inclusive cabeçalhos/CSP e variáveis do front para o Render; não ativar o Blueprint completo do Render por engano.

Em produção, o frontend e a API precisam de **subdomínios do mesmo domínio pai** para o cookie de sessão (`app.*` e `api.*`, com `SESSION_COOKIE_DOMAIN` correto). `live.*` e `turn.*` apontam para a VPS; a mídia e o TURN precisam de portas apropriadas e não passam pelo proxy HTTP comum. MongoDB e métricas permanecem em rede interna. A documentação exata está em `docs/infra/deploy-coolify.md` e `docs/infra/README.md`.

## Estado real do repositório

- Monorepo npm workspaces, Node.js `>=22`: `apps/api`, `apps/web` e `packages/shared`. O backend concentra API REST (44 endpoints), Socket.IO, bot, integração LiveKit, gravação por Egress, estatísticas e painel. O front já tem login, salas, calls, reuniões, sala completa (palco, controles, efeitos, legendas, mãos, gravação, QR), painel de administração (visão geral, configurações, pessoas, estatísticas, gravações, auditoria) e PWA.
- Contratos em `docs/backend/` e OpenAPI em `/api/v1/docs`; documentação do front em `docs/frontend/README.md`; visão, arquitetura e roadmap em `docs/`. Seguir esses contratos ao mudar API ou UI e atualizar docs/testes quando houver alteração de comportamento.
- Infra declarada em `infra/`, Dockerfiles (`apps/api`, `apps/web`) e `infra/coolify/docker-compose.yml`; CI do GitHub Actions executa lint, typecheck, testes e build. Existem testes automatizados, inclusive integração com substitutos de serviços externos; isso **não equivale a um teste real** de Discord, LiveKit e redes móveis.
- O commit `2d32672` encerra a entrega da Fase 10 (painel de administração, gravações, efeitos, legendas, PWA, QR e mãos levantadas). O bot usa `/config` e `/reuniao`; privilégios por cargo e `ADMIN_ROLE_IDS` estão em `docs/backend/permissoes.md`.
- As fases 0–8 e a 10 constam como entregues em `docs/03-roadmap.md`; a fase 9 é parcial (faltam teste de carga e restauração de backup). **Não há comprovação aqui** de deploy operacional, webhook de deploy automático ativado, teste em VPS limpa, teste real com Discord/LiveKit/Egress, teste real entre navegadores ou teste de carga na KVM1. Flazo está trabalhando no deploy; pedir/registrar evidência após executar cada etapa.

## Próximo trabalho e limites de capacidade

**Will / frontend:** revisão visual com o site aberto; ajuste fino de proporções na sala com vídeo real; seleção de qualidade/resolução de vídeo e tela (hoje a tela compartilha fixa em 1080p/30 e a câmera usa o padrão do navegador); mudança de tom de voz (grave/aguda); teste real em Chrome, Firefox e Safari com câmera, microfone e tela. O enquadramento por transmissão (proporção automática, preencher/mostrar tudo, posição) e a orientação vertical/horizontal **já estão implementados** em `VideoSettings.tsx`, `videoPrefs.ts` e `Stage.tsx`. Priorizar interação, estados de erro e acessibilidade antes de polimento visual.

**Flazo / infraestrutura:** concluir e documentar o deploy automático de `main` com separação web/serviços da VPS, segredos no painel, health/readiness, monitoramento, rollback e backup com restauração testada. O repositório contém instruções manuais; configuração ativa no Coolify deve ser confirmada na plataforma.

**Escala:** o objetivo discutido é atender a comunidade (~1.000 membros) e, idealmente, centenas de espectadores, **sem pressupor 500 transmissores simultâneos**. Uma KVM1 é uma restrição de CPU, memória e, sobretudo, banda de saída. `docs/infra/teste-de-carga.md` propõe primeiro um piloto de **25 participantes com 5 publicando**; não extrapolar esse número para 500 sem medição real, limites de sala/publicadores, observabilidade e plano de crescimento.

## Decisões e riscos a validar antes de chamar de produção

- Confirmação da exceção para staff entrar em live sem estar na voz; revisar também o acesso quando o bot perde a conexão ou uma pessoa perde o cargo.
- Ao sair da voz, o código usa timers em memória para a tolerância e remove a pessoa do LiveKit. Testar reinícios durante a tolerância e tentativa de reutilizar token já emitido; a remoção de participante por si só não deve ser tratada como revogação criptográfica do token.
- Confirmar comportamento de lotação em entradas simultâneas, limites de publicação por sala e distribuição de banda; medir em 4G e redes corporativas para validar Coturn.
- Conferir proteção de cookies, CORS, CSP no nginx do frontend (`apps/web/nginx.conf`), assinatura dos webhooks, escopos mínimos do bot, backup externo e restauração. Não publicar portas do MongoDB ou métricas.
- Definir operacionalmente: domínios, quem administra Discord/Coolify, como fazer rollback, alertas, contato em incidentes e critérios de aceite do piloto. Evitar registrar segredos ou dados reais no Git.

## Instrução de trabalho para o agente

Comece com `README.md`, `docs/01-visao-geral.md`, `docs/02-arquitetura.md`, `docs/03-roadmap.md` e a documentação da área afetada. Consulte a `main` atual, pois Flazo está fazendo commits. Para o front, veja `apps/web/src/room/`, `apps/web/src/lib/api.ts` e `docs/frontend/README.md`; para o back, veja `apps/api/src/`, `packages/shared/`, `docs/backend/` e OpenAPI. Antes de enviar mudança, rode `npm ci`, `npm run lint`, `npm run typecheck`, `npm test` e `npm run build` conforme o impacto. Preserve o trabalho paralelo, não reescreva histórico nem faça deploy sem alinhar o estado efetivo com Flazo e Will. Informe sempre o que foi implementado, o que foi realmente testado e o que continua pendente.
