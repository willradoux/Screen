# Preparação do ambiente

Estado: plano; nenhum servidor ou serviço provisionado nesta etapa.

## Inventário antes da implantação

| Item | Situação |
|---|---|
| Sistema operacional, região e recursos contratados | A confirmar |
| CPU, RAM, disco e rede em uso | A medir |
| Serviços e containers existentes | A inventariar |
| Proxy/Coolify e ocupação de 80/443 | A confirmar |
| Domínio e acesso ao DNS | A definir |
| Firewall do provedor, host e Docker | A revisar |
| Backup externo e teste de restauração | A definir |
| Responsável principal e substituto | A definir |
| Orçamento e contingência para eventos | A definir |

Registrar o resultado sem expor credenciais ou detalhes de acesso administrativo no repo.

## Desenvolvimento proposto

React/Vite, API Express e processo do bot no monorepo. Banco e mídia locais em Compose após a validação da RFC. Versões de Node, bibliotecas e gerenciador de pacotes serão fixadas junto com o bootstrap.

Usar aplicação Discord de teste em guild separada. A primeira prova de mídia deve validar duas pessoas em redes distintas antes de aumentar a carga. Não compartilhar token do bot de produção com toda a equipe.

## Produção proposta

Imagens construídas na CI, web estática e API atrás de HTTPS, banco privado, LiveKit e TURN com configuração de rede própria. Não compilar a aplicação na KVM1 durante eventos.

HTTPS e TURN/TLS precisam de solução explícita para a porta 443. Conferir o proxy existente antes de escolher roteamento por SNI ou separar a mídia. Detalhes e fontes estão na [RFC, seção 4](rfcs/0001-arquitetura-operacao.md#4-topologia-dns-e-porta-443).

## Configuração

[.env.example](../.env.example) é um inventário de campos propostos; nenhum código os consome ainda. Gerar e guardar segredos por ambiente fora do versionamento. Não executar um deployment preenchendo campos aleatoriamente.

## Critério para iniciar o bootstrap

- Decisões D01–D06 suficientemente resolvidas.
- Fluxo de acesso e configuração de teste definidos.
- Branch de trabalho e orientações de contribuição revisadas.
- Versões e comandos de desenvolvimento escolhidos.
- Produção permanece separada do teste.

## Critério para publicar o piloto

Conectividade UDP e TURN, acesso e moderação testados, limites medidos, backup restaurado, monitor externo e rollback ensaiados. Uma chamada que funciona localmente não comprova prontidão de produção.

