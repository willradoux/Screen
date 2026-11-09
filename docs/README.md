# Documentação do Screem

Screem é uma plataforma open-source de transmissão de tela, câmera e microfone feita para o servidor Discord **Acelera DEV**. Também serve para as reuniões mensais do servidor, no lugar do Google Meet.

> **Regra de ouro:** o frontend vai mudar. Por isso o backend é a fonte da verdade e tudo que ele expõe (REST, Socket.IO, webhooks, permissões) está documentado em `docs/backend/`. Qualquer frontend novo deve ser construído só com essa documentação.

## Índice

| Documento | Conteúdo |
|---|---|
| [01 - Visão geral](01-visao-geral.md) | O que é, para quem, casos de uso, escopo e fora de escopo |
| [02 - Arquitetura](02-arquitetura.md) | Componentes, diagramas, fluxos principais, decisões |
| [03 - Roadmap](03-roadmap.md) | Fases, entregas e critérios de aceite |
| [04 - Glossário](04-glossario.md) | Termos usados no projeto |
| [05 - Contribuição](05-contribuicao.md) | Padrões de código, commits, branches, testes |
| [Backend](backend/README.md) | Índice da documentação do backend |
| [Frontend](frontend/README.md) | Contrato do frontend e como trocá-lo |
| [Infra](infra/README.md) | Deploy, Docker, LiveKit, Coturn, observabilidade |
| [Painel e recursos](painel-de-administracao.md) | Painel de admin, lives x reuniões, sessão em espera, gravação, efeitos, logs |
| [Deploy no Coolify](infra/deploy-coolify.md) | Passo a passo do deploy na VPS com Coolify |
| [Teste real](infra/teste-real.md) | Roteiro passo a passo para testar com o Discord e o LiveKit de verdade |
| [Teste de carga](infra/teste-de-carga.md) | Plano e comandos para medir a capacidade (ainda não executado) |

## Documentação do backend (a mais importante)

1. [Estrutura do projeto](backend/estrutura-do-projeto.md)
2. [Autenticação (Discord OAuth2 e sessão)](backend/autenticacao.md)
3. [Permissões e papéis](backend/permissoes.md)
4. [API REST](backend/api-rest.md)
5. [Eventos Socket.IO](backend/eventos-socketio.md)
6. [Modelo de dados (MongoDB)](backend/modelo-de-dados.md)
7. [Bot do Discord](backend/bot-discord.md)
8. [LiveKit e WebRTC](backend/livekit-webrtc.md)
9. [Reuniões e agendamento](backend/reunioes.md)
10. [Variáveis de ambiente](backend/variaveis-de-ambiente.md)
11. [Segurança](backend/seguranca.md)
12. [Erros e códigos](backend/erros.md)
13. [Testes](backend/testes.md)

## Convenções desta documentação

- Escrita em português do Brasil. Nomes de código, rotas e campos ficam em inglês.
- Todo endpoint, evento e campo novo **deve** ser documentado no mesmo PR que o cria.
- Exemplos de requisição e resposta usam JSON real.
- Onde algo ainda não existe, está marcado como `[planejado]`.
