# 01 - Visão geral

## Problema

A comunidade Acelera DEV gosta de transmitir tela e câmera enquanto programa. O Discord limita qualidade e número de espectadores, e as reuniões mensais dependem de ferramentas externas (Meet).

## Solução

Um site (Screem) ligado ao servidor Discord:

1. Existe uma **categoria de lives** com canais de voz.
2. Quando alguém entra num desses canais, o **bot** envia no canal de texto um **embed com botão** que abre um **link único** da sala.
3. No site, a pessoa faz **login com Discord**. O backend consulta o estado de voz do Discord: **só entra quem está de fato no canal de voz** correspondente.
4. Dentro da sala dá para transmitir **câmera, tela e microfone**, ver os outros e conversar.
5. O mesmo site hospeda as **reuniões mensais**, criadas por admins via comando, com data e hora, aviso automático no canal de avisos e moderação.

## Casos de uso

| # | Caso | Ator |
|---|---|---|
| UC1 | Entrar num canal de voz de live e receber o link | Membro |
| UC2 | Abrir o link, logar e entrar na sala | Membro |
| UC3 | Transmitir câmera, tela e/ou microfone | Membro |
| UC4 | Assistir transmissões de outros | Membro |
| UC5 | Criar reunião imediata por comando | Admin |
| UC6 | Agendar reunião com data e hora | Admin |
| UC7 | Aviso automático no canal de avisos | Bot |
| UC8 | Mutar, expulsar, bloquear tela de alguém | Admin / Mod |
| UC9 | Alterar configurações do servidor (categoria, canal de avisos, cargos) | Admin |
| UC10 | Encerrar sala | Admin / Mod / sistema |
| UC11 | Auditar ações de moderação | Admin |

## Escopo do MVP

- Login Discord, verificação de presença na call.
- Salas de live ligadas a canais de voz, criadas e encerradas pelo bot.
- Câmera, tela e microfone via LiveKit.
- Embed com botão enviado pelo bot.
- Papéis (membro, mod, admin) mapeados dos cargos do Discord.
- Moderação básica: mutar, expulsar, encerrar.
- Reuniões criadas por comando, com agendamento e aviso.

## Fora de escopo (por enquanto)

- Gravação das sessões.
- Chat persistente com histórico longo (haverá chat efêmero da sala).
- App mobile nativo.
- Múltiplos servidores Discord (o modelo de dados já prevê `guildId`, mas o MVP atende um só).
- Pagamentos.

## Requisitos não funcionais

| Tema | Meta |
|---|---|
| Latência | Vídeo abaixo de 300 ms em condições normais |
| Capacidade | Piloto: salas de até 25 participantes, 5 publicando ao mesmo tempo |
| Disponibilidade | Melhor esforço (comunidade), com restart automático dos containers |
| Segurança | Nenhum acesso sem login Discord e presença validada |
| Portabilidade | Frontend substituível sem mudar o backend |
| Observabilidade | Logs estruturados, métricas básicas e auditoria de moderação |
