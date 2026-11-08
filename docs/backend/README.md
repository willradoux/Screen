# Documentação do backend

O backend (`apps/api`) é um único serviço Node.js + TypeScript que reúne:

- **API REST** (Express) sob `/api`
- **Tempo real** (Socket.IO) em `/socket.io`
- **Bot do Discord** (discord.js)
- **Integração LiveKit** (tokens, moderação, webhooks) em `/api/livekit/webhook`

Ele é a **única fonte da verdade** para autorização. O frontend nunca decide quem pode o quê.

## Leitura recomendada

| Se você quer... | Leia |
|---|---|
| Entender as pastas e módulos | [estrutura-do-projeto.md](estrutura-do-projeto.md) |
| Fazer login e manter sessão | [autenticacao.md](autenticacao.md) |
| Saber quem pode fazer o quê | [permissoes.md](permissoes.md) |
| Consumir a API | [api-rest.md](api-rest.md) |
| Receber eventos ao vivo | [eventos-socketio.md](eventos-socketio.md) |
| Entender o banco | [modelo-de-dados.md](modelo-de-dados.md) |
| Configurar o bot e comandos | [bot-discord.md](bot-discord.md) |
| Conectar mídia | [livekit-webrtc.md](livekit-webrtc.md) |
| Criar e agendar reuniões | [reunioes.md](reunioes.md) |
| Configurar ambiente | [variaveis-de-ambiente.md](variaveis-de-ambiente.md) |
| Revisar segurança | [seguranca.md](seguranca.md) |
| Tratar erros | [erros.md](erros.md) |
| Testar | [testes.md](testes.md) |

## Princípios

1. **Nunca confiar no cliente.** Presença, papel e permissões são checados no servidor a cada ação sensível.
2. **Contrato estável.** Rotas versionadas em `/api/v1`. Mudança incompatível cria `/api/v2`.
3. **Idempotência onde importa.** Criar sala para o mesmo canal duas vezes devolve a mesma sala.
4. **Tudo auditável.** Ações de moderação e administração geram registro.
5. **Falhar de forma clara.** Erros têm `code` estável e legível por máquina.

## Versionamento da API

- Base: `https://api.exemplo.com/api/v1`
- Mudanças compatíveis (campo novo opcional) entram sem mudar a versão.
- Mudanças incompatíveis exigem nova versão e período de convivência.
- A especificação OpenAPI fica em `/api/v1/docs` e em `apps/api/openapi.json`.

## Comandos úteis

```bash
npm run dev -w apps/api        # desenvolvimento com reload
npm run build -w apps/api      # compilar
npm test -w apps/api           # testes
npm run lint                   # lint em todo o monorepo
```
