# Screem — contexto para agentes e colaboradores

Atualizado em 08/11/2026, com base na `main` de `willradoux/Screen` até o commit `0ab17f8`. Leia o código e a documentação atuais antes de implementar: este arquivo é um ponto de partida, não substitui o contrato da API.

## O projeto e as pessoas

**Screem** é a plataforma de chamadas, transmissão de tela, câmera e microfone da comunidade **Acelera DEV** (cerca de mil membros no Discord). A ideia surgiu da necessidade de fazer lives e reuniões da comunidade com controle próprio, vinculadas ao servidor, sem depender das restrições de transmissão dos canais do Discord ou de uma reunião externa. Em conversas anteriores o produto também foi chamado de **Acelera Screen**; o nome atual no repositório é Screem. O site da comunidade é <https://aceleradev.com.br/>.

| Pessoa | Contexto e responsabilidade combinada |
| --- | --- |
| **Will** (`willradoux`) | Idealizador, responsável pelo produto e pelo **frontend**; define prioridades e valida a experiência. Quer alterações diretamente na `main`, sem abrir PR para o próprio trabalho neste momento. |
| **Flazo** (`flazo0`) | Colaborador que implementou a base atual do monorepo, bot, API, frontend inicial e infraestrutura. **Está configurando o deploy automático**; coordenar mudanças de infra/deploy com ele para evitar conflito. |
| **Marujo** | Vai ajudar em **partes do backend**. A divisão concreta de tarefas ainda precisa ser combinada com Will e Flazo; não presumir que já recebeu acesso, tarefa ou prazo. |
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
| Frontend | React + TypeScript, Vite, Tailwind CSS; **Render** para o site estático, conforme conversa mais recente. |
| API e bot | Node.js + TypeScript, Express, Socket.IO e discord.js; Docker na **Hostinger KVM1**, com Coolify em configuração. |
| Estado e autenticação | MongoDB/Mongoose, login Discord OAuth2, sessão por cookie; bot acompanha cargos e voice state. |
| Mídia | WebRTC via LiveKit (SFU) e Coturn para redes restritivas; ambos na VPS; Socket.IO transporta eventos de aplicação, não vídeo/áudio. |

Há **duas receitas de infraestrutura** no repositório (`infra/docker-compose.yml` com Caddy e `infra/coolify/docker-compose.yml` com proxy do Coolify). Os documentos mais antigos e `apps/web/vercel.json` ainda apontam para **Vercel**. `render.yaml` propõe **API e web** no Render, mas a decisão relatada por Will é **web no Render, backend/bot/mídia/banco na VPS**. Antes de publicar, alinhar uma única configuração de produção, inclusive cabeçalhos/CSP e variáveis do front para o Render; não ativar o Blueprint completo do Render por engano.

Em produção, o frontend e a API precisam de **subdomínios do mesmo domínio pai** para o cookie de sessão (`app.*` e `api.*`, com `SESSION_COOKIE_DOMAIN` correto). `live.*` e `turn.*` apontam para a VPS; a mídia e o TURN precisam de portas apropriadas e não passam pelo proxy HTTP comum. MongoDB e métricas permanecem em rede interna. A documentação exata está em `docs/infra/deploy-coolify.md` e `docs/infra/README.md`.

## Estado real do repositório

- Monorepo npm workspaces, Node.js `>=22`: `apps/api`, `apps/web` e `packages/shared`. O backend concentra API REST, Socket.IO, bot e integração LiveKit. O front já tem login, sala, controles de mídia, grid, reuniões, moderação, configurações e auditoria.
- Contratos em `docs/backend/` e OpenAPI em `/api/v1/docs`; documentação do front em `docs/frontend/README.md`; visão, arquitetura e roadmap em `docs/`. Seguir esses contratos ao mudar API ou UI e atualizar docs/testes quando houver alteração de comportamento.
- Infra declarada em `infra/`, Dockerfiles e `render.yaml`; CI do GitHub Actions executa lint, typecheck, testes e build. Existem testes automatizados, inclusive integração com substitutos de serviços externos; isso **não equivale a um teste real** de Discord, LiveKit e redes móveis.
- O último commit incorporado antes deste arquivo, `0ab17f8`, adicionou `ADMIN_ROLE_IDS` para cargos admin fixos via ambiente; consultar `docs/backend/permissoes.md` e a implementação atual antes de configurar privilégios.
- As fases 0–8 constam como implementadas no `docs/03-roadmap.md`; a fase 9 é parcial. **Não há comprovação aqui** de deploy operacional, webhook de deploy automático ativado, teste em VPS limpa, restauração de backup, teste real entre navegadores ou teste de carga na KVM1. Flazo está trabalhando no deploy; pedir/registrar evidência após executar cada etapa.

## Próximo trabalho e limites de capacidade

**Will / frontend:** estabilizar fluxo de login e sala em dispositivos reais; implementar seleção de qualidade/resolução de vídeo e tela com limites seguros; detectar mudança de orientação vertical/horizontal no celular; adaptar o mosaico à proporção real da câmera para evitar grandes áreas pretas, respeitando enquadramento/privacidade. Hoje `apps/web/src/room/Stage.tsx` fixa tiles em `aspect-video`, e `Controls.tsx` usa resolução fixa para compartilhamento. Essa melhoria foi pedida por Will e **ainda não está pronta**. Priorizar interação, estados de erro e acessibilidade antes de polimento visual.

**Marujo / backend, após divisão com a equipe:** ajudar a revisar segurança do acesso, presença e capacidade, integração Discord/LiveKit, falhas e contratos que o front consome. Evitar desenvolver em paralelo com Flazo nas mesmas áreas sem combinar limites de responsabilidade.

**Flazo / infraestrutura:** concluir e documentar o deploy automático de `main` com separação web/serviços da VPS, segredos no painel, health/readiness, monitoramento, rollback e backup com restauração testada. O repositório contém instruções manuais; configuração ativa no Coolify/Render deve ser confirmada na plataforma.

**Escala:** o objetivo discutido é atender a comunidade (~1.000 membros) e, idealmente, centenas de espectadores, **sem pressupor 500 transmissores simultâneos**. Uma KVM1 é uma restrição de CPU, memória e, sobretudo, banda de saída. `docs/infra/teste-de-carga.md` propõe primeiro um piloto de **25 participantes com 5 publicando**; não extrapolar esse número para 500 sem medição real, limites de sala/publicadores, observabilidade e plano de crescimento.

## Decisões e riscos a validar antes de chamar de produção

- Confirmação da exceção para staff entrar em live sem estar na voz; revisar também o acesso quando o bot perde a conexão ou uma pessoa perde o cargo.
- Ao sair da voz, o código usa timers em memória para a tolerância e remove a pessoa do LiveKit. Testar reinícios durante a tolerância e tentativa de reutilizar token já emitido; a remoção de participante por si só não deve ser tratada como revogação criptográfica do token.
- Confirmar comportamento de lotação em entradas simultâneas, limites de publicação por sala e distribuição de banda; medir em 4G e redes corporativas para validar Coturn.
- Conferir proteção de cookies, CORS, CSP no **Render**, assinatura dos webhooks, escopos mínimos do bot, backup externo e restauração. Não publicar portas do MongoDB ou métricas.
- Definir operacionalmente: domínios, quem administra Discord/Render/Coolify, como fazer rollback, alertas, contato em incidentes e critérios de aceite do piloto. Evitar registrar segredos ou dados reais no Git.

## Instrução de trabalho para o agente

Comece com `README.md`, `docs/01-visao-geral.md`, `docs/02-arquitetura.md`, `docs/03-roadmap.md` e a documentação da área afetada. Consulte a `main` atual, pois Flazo está fazendo commits. Para o front, veja `apps/web/src/room/`, `apps/web/src/lib/api.ts` e `docs/frontend/README.md`; para o back, veja `apps/api/src/`, `packages/shared/`, `docs/backend/` e OpenAPI. Antes de enviar mudança, rode `npm ci`, `npm run lint`, `npm run typecheck`, `npm test` e `npm run build` conforme o impacto. Preserve o trabalho paralelo, não reescreva histórico nem faça deploy sem alinhar o estado efetivo com Flazo e Will. Informe sempre o que foi implementado, o que foi realmente testado e o que continua pendente.
