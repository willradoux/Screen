# Capacidade: reunião com centenas de pessoas

## Como a sala grande funciona

Em uma reunião com 300 a 500 pessoas, quase todo mundo só **assiste**. O desenho para isso:

- **Palco.** Com o palco ligado (botão "Palco" em Pessoas), **ninguém transmite**, nem moderação, nem admin. Só **admin** sobe pessoas ao palco (e sobe a si mesmo). Quem está no palco transmite câmera, microfone e tela.
- **Plateia só recebe.** Sem permissão de publicar, a plateia não gera vídeo para o servidor: o custo é o que o servidor **envia**.
- **Quadrados só do palco.** A tela mostra apenas quem está no palco; a plateia vira um número. Em salas sem palco, acima de 24 pessoas, só quem tem câmera, tela ou voz ganha quadrado.
- **Qualidade média nas câmeras** quando a sala passa de 60 pessoas (o LiveKit entrega a camada simulcast do meio, bem mais leve). Telas continuam na melhor qualidade.
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

## Se a VPS atual não aguentar

Em ordem de custo-benefício:

1. **Subir de plano da VPS** (mais vCPU e rede de 1 Gbps ou mais) e dar prioridade ao LiveKit.
2. **Mover só o LiveKit** para um servidor próprio (mais vCPU, boa rede), mantendo o resto onde está: troca `LIVEKIT_URL`/`LIVEKIT_PUBLIC_URL`.
3. **Transmissão em várias câmeras só no palco principal** e telas em qualidade menor para plateias grandes.
