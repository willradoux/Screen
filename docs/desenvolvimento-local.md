# Rodar o Screen no computador (sem Discord)

O **modo dev** roda o Screen inteiro com um "Discord de mentira": login com pessoas fixas, bot simulado e calls de voz simuladas. As regras (salas, lives, reuniões, moderação, chat) são **as de verdade**; só a conversa com o Discord é falsa. Serve para desenvolver, testar telas e mostrar o projeto sem precisar de bot, token ou servidor do Discord.

> Nunca roda em produção: a API se recusa a subir com `DEV_FAKE_DISCORD=true` fora de `NODE_ENV=development`.

## 1. Uma vez só

```bash
npm install
cp apps/api/.env.example apps/api/.env
# no apps/api/.env, preencha só:
#   COOKIE_SECRET=qualquer-coisa-com-32-ou-mais-caracteres
#   TOKEN_ENCRYPTION_KEY=   (gere com: openssl rand -base64 32)
# Os campos DISCORD_* podem ficar vazios no modo dev.
```

## 2. Toda vez

```bash
docker compose -f infra/docker-compose.dev.yml up -d   # MongoDB + LiveKit
npm run dev:fake -w apps/api                           # API com o Discord de mentira (porta 3000)
npm run dev -w apps/web                                # site (porta 5173)
```

Abra **http://localhost:5173** → "Entrar com Discord" → escolha quem você é.

## 3. As pessoas e o servidor de mentira

| Pessoa | Papel |
|---|---|
| Will | Admin (dono do servidor) |
| Ana | Mod |
| Beto, Caio, Duda | Membros |

Calls de voz: **call-geral** e **estudos** (as duas viram live). Canal de texto: **avisos** (avisos de reunião e logs).

Para ter várias pessoas na mesma sala, use **um navegador (ou janela anônima) por pessoa**: o login fica no cookie, então cada janela pode ser alguém diferente.

## 4. Simular a call do Discord

Abra **http://localhost:3000/api/v1/dev**:

- **Entrar em call-geral**: a pessoa "entra na call" e a live abre de verdade (o bot mandaria o link no chat da call).
- **Sair da call**: como no Discord; a live fecha quando a call esvazia.
- Embaixo aparece **o que o bot mandou** (embeds de live, avisos e logs), em vez de ir para o Discord.

Reuniões funcionam pelo site: entre como **Will** → Gerenciar reuniões → crie uma.

## 5. Câmera, microfone e tela

Funcionam no navegador normalmente em `localhost`. Para testar no celular na mesma rede, o navegador exige HTTPS para câmera/mic (em `http://IP:5173` eles ficam bloqueados).

## Onde fica o código

`apps/api/src/dev/`: as pessoas e canais (`personas.ts`), o login e o bot de mentira (`dev-discord.ts`) e as páginas `/api/v1/dev` (`dev-system.ts`). As regras do bot são montadas por `assembleDiscordSystem` (`src/discord/bootstrap.ts`), igual em produção.
