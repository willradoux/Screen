# Registro de decisões

Estado inicial: todas as propostas abaixo estão abertas. As escolhas já expressas pelo proprietário — React, TypeScript/Express, Discord e KVM1 inicial — são restrições de partida.

| ID | Proposta | O que falta validar | Estado |
|---|---|---|---|
| D01 | Monorepo e backend modular | Familiaridade da equipe e gerenciador de pacotes | Proposta |
| D02 | LiveKit self-hosted no piloto | Conectividade, consumo e política de revogação | Proposta |
| D03 | Bot separado via Gateway | Intents, responsáveis e acesso à aplicação Discord | Proposta |
| D04 | PostgreSQL para estado durável | Modelo, migrations, sessões e backups | Proposta |
| D05 | Redis interno conforme deployment LiveKit | Necessidade e orçamento de recursos | Proposta |
| D06 | Compose com entrada TLS compatível com TURN | Serviços existentes, porta 443 e domínio | Proposta |
| D07 | Membros elegíveis, sem convidados externos | Cargos e regras atuais da comunidade | Proposta |
| D08 | Limites globais e por sala | Perfil real de carga e metas de qualidade | Proposta |
| D09 | Regras de expulsão e reentrada | Janela aceitável e solução tecnicamente comprovada | Em aberto |
| D10 | Piloto em host único e contingência externa | Orçamento, RTO/RPO e criticidade dos eventos | Proposta |
| D11 | Web React funcional | Vite e matriz inicial de navegadores | Proposta |
| D12 | Dados mínimos e sem gravação inicial | Retenção e responsáveis pela operação | Proposta |

## Como registrar aprovação

Para cada decisão, adicionar: data, responsável pela decisão, link da discussão, alternativa escolhida, justificativa, consequências e condição que motivaria revisão. Não marcar como aceita apenas porque o documento existe.

Estados: Proposta → Aceita ou Rejeitada. Uma decisão aceita pode ser substituída por outra com vínculo explícito.

## Questões que bloqueiam a implantação

- A VPS está vazia? Há Coolify, proxy, sites ou bancos usando recursos e portas?
- Qual domínio estará disponível? Quem controla o DNS?
- Quais cargos dão acesso e quem pode criar/moderar salas?
- Qual custo mensal e indisponibilidade a comunidade consegue aceitar?
- A expulsão exige bloqueio imediato de qualquer token anterior?
- Qual perfil de evento será homologado primeiro?

