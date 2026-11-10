# Capacidade: reunião com centenas de pessoas

## Como a sala grande funciona

Em uma reunião com 300 a 500 pessoas, quase todo mundo só **assiste**. O desenho para isso:

- **Palco.** Com o palco ligado (botão "Palco" em Pessoas), **ninguém transmite**, nem moderação, nem admin. Só **admin** sobe pessoas ao palco (e sobe a si mesmo). Quem está no palco transmite câmera, microfone e tela.
- **Plateia só recebe.** Sem permissão de publicar, a plateia não gera vídeo para o servidor: o custo é o que o servidor **envia**.
- **Quadrados só do palco.** A tela mostra apenas quem está no palco; a plateia vira um número. Em salas sem palco, acima de 24 pessoas, só quem tem câmera, tela ou voz ganha quadrado.
- **Plateia recebe um único vídeo.** Em sala de 100+ pessoas, quem só assiste é inscrito em **um** vídeo por vez: o fixado, senão a tela compartilhada, senão quem falou por último no palco. Os outros vídeos do palco ficam sem inscrição (não custam nada ao servidor). O áudio do palco continua para todos.
- **Palco publica leve** (salas de 100+): câmera 360p a ~0,45 Mbps com camadas menores (simulcast), tela de slides em 720p a 10 quadros (~0,8 Mbps), voz de 24 kbps **sem RED** (a redundância dobraria a banda de áudio por espectador).
- **Camada mais fraca para quem assiste.** Câmeras: camada média acima de 60 pessoas, baixa acima de 200. Telas só perdem qualidade acima de 300.
- **Lista de pessoas** paginada (60 por vez), com busca, e recarregada no máximo a cada 1,2 s. Para quem só assiste ela começa fechada.
- **Limite de pessoas**: até 500 por live e por reunião (Configurações, `/config limite-live`, criação da reunião). O valor já salvo nas configurações **não muda sozinho**: ajuste em Configurações > Limite de pessoas por live.

## O gargalo é o servidor, não o código

Cada espectador recebe, em tempo real, cada vídeo e cada áudio do palco. Conta aproximada de banda **de saída** do servidor:

| Palco | Espectadores | Vídeo por espectador (média) | Saída total |
|---|---|---|---|
| 1 câmera | 500 | ~0,6 Mbps | ~300 Mbps |
| 1 câmera + 1 tela | 500 | ~0,6 + ~1,5 Mbps | ~1 Gbps |
| 3 câmeras + 1 tela | 500 | ~0,6 x 3 + ~1,5 Mbps | ~1,7 Gbps |

(Estimativas, não medições.) Além da banda, o servidor copia e encaminha esses pacotes: isso cobra CPU. Uma VPS pequena (1 vCPU e 4 GB, como a KVM 1) dividindo a máquina com API, MongoDB, site e Coolify **não deve aguentar** 500 pessoas com vídeo. Pode aguentar muitas pessoas só com áudio, ou poucas dezenas com vídeo. **Só o teste abaixo diz o número real.**

## Teste de estresse

`infra/scripts/load-test.sh` usa o `lk load-test` do LiveKit para simular palestrantes e espectadores.

1. Rode **de outro computador** (ou outra VPS), não do servidor testado.
2. Comece pequeno e suba: `100 2 120`, depois `200 2 120`, `300 2 120`, `500 2 120`.
3. No servidor, acompanhe `docker stats` e `htop`. Sinais de limite: CPU do contêiner do LiveKit perto de 100% do que a VPS tem, rede saturada, queda de qualidade ou pessoas desconectando no relatório do teste.
4. O maior número que roda com folga (CPU abaixo de ~70%) é a sua capacidade. Coloque esse valor como limite de pessoas.

O que o teste **não** cobre: login do Discord, API e MongoDB (esses carregam pouco: uma entrada por pessoa).

## O que já foi ajustado no servidor (1 vCPU e 4 GB)

- LiveKit com **prioridade de CPU** (`cpu_shares: 4096`) e o Egress de gravação com a mais baixa (`256`): **não grave durante um evento grande** nesta VPS.
- MongoDB com cache limitado a 0,5 GB (o padrão é metade da RAM).
- Limite de arquivos abertos do LiveKit em 65536 e log em `warn`.
- Faça **Redeploy da stack inteira** no Coolify para estas opções valerem.

## Contas por espectador (com as técnicas acima)

Cada espectador recebe 1 vídeo (~0,15 a 0,45 Mbps na camada baixa/média) e o áudio de cada pessoa no palco (~24 kbps e 50 pacotes por segundo cada). Para 500 espectadores e 2 pessoas falando no palco: ~100 a 220 Mbps de vídeo e ~50 mil pacotes de áudio por segundo, mais os de vídeo. É a ordem de grandeza onde 1 vCPU **pode** chegar no limite; o teste de estresse é o que decide.

## Se a VPS atual não aguentar

Em ordem de custo-benefício:

1. **Subir de plano da VPS** (mais vCPU e rede de 1 Gbps ou mais) e dar prioridade ao LiveKit.
2. **Mover só o LiveKit** para um servidor próprio (mais vCPU, boa rede), mantendo o resto onde está: troca `LIVEKIT_URL`/`LIVEKIT_PUBLIC_URL`.
3. **Transmissão em várias câmeras só no palco principal** e telas em qualidade menor para plateias grandes.
