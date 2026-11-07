# Acelera Screen

Salas privadas de áudio, câmera e compartilhamento de tela para a comunidade AceleraDev, integradas ao Discord.

**Estado: planejamento para revisão da equipe.** O repositório organiza propostas; ainda não contém uma aplicação executável nem configura a VPS.

## Comece por aqui

1. [Escopo do primeiro piloto](docs/escopo.md)
2. [Decisões para validar](docs/decisoes.md)
3. [Arquitetura e operação — RFC 001](docs/rfcs/0001-arquitetura-operacao.md)
4. [Preparação do ambiente](docs/ambiente.md)
5. [Etapas de implementação](docs/backlog.md)
6. [Roteiro de revisão](docs/revisao.md)
7. [Sugestão WebRTC + Socket.IO](docs/adr/0013-webrtc-socketio.md)

## Direção do projeto

| Definido pelo projeto | Proposto, sujeito a validação |
|---|---|
| React no frontend | Vite e organização em monorepo |
| TypeScript + Express no backend | LiveKit para mídia e TURN |
| Integração com Discord | Bot separado usando Gateway |
| Acesso restrito à comunidade | PostgreSQL e Redis conforme deployment |
| KVM1 como infraestrutura inicial | Docker Compose e proxy compatível com TURN |
| UI funcional primeiro | Limites do piloto definidos por testes |

A meta futura de 500 participantes não é capacidade já comprovada. A sala terá limites distintos para público, apresentadores, câmeras e telas. A capacidade global também será controlada.

## Estrutura prevista após validação

| Caminho | Responsabilidade futura |
|---|---|
| apps/web | Interface React |
| apps/api | Regras e API Express |
| apps/bot | Integração Discord |
| packages/contracts | Contratos e validação compartilhados |
| infra | Configuração local e de implantação |
| docs | Propostas, decisões e procedimentos |

Esses componentes ainda não foram inicializados. A estrutura é uma proposta, não uma lista de serviços existentes.

## Como participar

Leia [CONTRIBUTING.md](CONTRIBUTING.md), comente uma decisão por vez e registre justificativas. Use os modelos de issue e PR incluídos. O backlog distingue as primeiras issues abertas das tarefas de implementação ainda propostas.

## Revisão inicial

As propostas estão em uma branch dedicada e devem ser discutidas no pull request antes da implementação. Nenhuma VPS foi alterada. O próximo passo é validar as decisões e iniciar o bootstrap conforme o [backlog](docs/backlog.md).

## Acompanhamento no GitHub

- [P01 — Validar escopo e arquitetura](https://github.com/willradoux/aceleraScreem/issues/1)
- [P02 — Inventariar VPS e DNS](https://github.com/willradoux/aceleraScreem/issues/2)
- [P03 — Preparar bot de teste](https://github.com/willradoux/aceleraScreem/issues/3)
- [P14 — Avaliar WebRTC e Socket.IO](https://github.com/willradoux/aceleraScreem/issues/4)
