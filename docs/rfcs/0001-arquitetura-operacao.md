# Acelera Screen — proposta de arquitetura e operação
Data: 07/11/2026
Estado: rascunho para discussão; infraestrutura não inspecionada e capacidade não homologada.
Repositório informado: https://github.com/willradoux/aceleraScreem
Nome de produto: Acelera Screen. Preservar a grafia atual do repositório até decisão do proprietário.

## 1. Objetivo e contexto
Criar salas privadas de áudio, câmera e compartilhamento de tela para membros do AceleraDev, acessíveis pelo navegador e integradas ao Discord. React com interface funcional; refinamento visual posterior. Backend em TypeScript e Express.

O site da comunidade apresenta encontros, projetos, networking e atividades de preparação profissional centrados no Discord [1]. Isso orienta os cenários: estudo em grupo, revisão de projetos, entrevistas simuladas, mentorias e encontros com apresentadores convidados. Esses cenários são propostas de uso, não funcionalidades existentes.

A KVM1 será o ponto de partida para um piloto com acesso controlado. O plano publicado anuncia 1 vCPU, 4 GB de RAM, 50 GB NVMe e 4 TB de transferência [2]; falta verificar o contrato e a máquina real. Nada neste documento comprova que ela comporte determinado número de pessoas.

O alvo futuro é até 500 participantes simultâneos sob um perfil de uso definido, com poucos apresentadores em cada sala. O dimensionamento depende também do total de salas, faixas de áudio, telas, câmeras e qualidade recebida. Mil membros cadastrados não equivalem a mil conexões de mídia.

## 2. Decisões propostas
- Monorepo e aplicação modular; regras centralizadas no Express.
- React + Vite para web estática, servida pelo proxy, sem servidor de desenvolvimento em produção.
- LiveKit self-hosted para mídia WebRTC no piloto; integração isolada para permitir separar sua hospedagem.
- PostgreSQL para estado durável, sessões da aplicação, convites, auditoria e tarefas pendentes.
- Bot como processo independente, usando Gateway e uma biblioteca mantida como discord.js. Sem mídia passando pelo bot.
- Redis interno para a configuração de produção do LiveKit, conforme o deployment adotado [3]. Não acrescentar uma segunda infraestrutura de filas para a aplicação.
- Docker Compose, versões fixadas e imagens construídas na CI. Sem Kubernetes no piloto.
- Sem gravação, uploads de arquivos, controle remoto, acesso anônimo, aplicativo desktop dedicado ou sincronização de áudio com canais de voz do Discord na primeira versão.
- Limites globais e por sala, com admissão controlada no servidor.
- Uma única VPS implica ponto único de falha. Não prometer disponibilidade contínua ou chamadas sem interrupção.

## 3. Componentes e fronteiras
| Componente | Função | Exposição |
|---|---|---|
| Proxy de entrada | HTTPS, web estática, rotas da API e sinalização | Pública, portas necessárias |
| API Express | Autenticação, regras, convites, moderação e credenciais de mídia | Atrás do proxy |
| Bot Discord | Comandos, mensagens da sala e eventos de membros | Conexão de saída; sem porta pública própria |
| LiveKit | Transporte de áudio, câmera, tela e sinalização | Portas de mídia; sinalização por TLS |
| TURN integrado | Conectividade de clientes em redes restritas | Portas explícitas; autenticado |
| PostgreSQL | Dados duráveis e tarefas da aplicação | Rede interna |
| Redis | Coordenação do LiveKit, se incluído no deployment | Interno ou loopback |
| Coletor leve | Métricas e logs com retenção limitada | Interno; alertas fora da VPS |

O navegador recebe autorização da API e conecta diretamente ao serviço de mídia. Express não encaminha pacotes de áudio/vídeo. Se a API parar, as sessões de mídia existentes podem continuar; novas entradas, moderação e renovação da sessão da aplicação ficam limitadas. Esse comportamento precisa ser testado.

A API é a autoridade de negócio. O LiveKit é a fonte da presença efetiva. Reconciliação periódica e webhooks autenticados corrigem divergências; eventos não devem ser a única fonte de verdade.

## 4. Topologia, DNS e porta 443
Usar nomes conceituais app.DOMINIO, rtc.DOMINIO e turn.DOMINIO. O domínio final depende do controle de DNS; não pressupor acesso a aceleradev.com.br.

Escolher uma topologia única de entrada:
- Web e API na mesma origem, com /api, simplificando cookies e política de origem.
- rtc e turn com DNS apontando ao serviço de mídia.
- TURN/TLS acessível em TCP 443 para redes restritas.
- Se web e TURN dividirem um IP, usar roteamento de camada 4 por SNI e configuração compatível, como a base oficial para VM do LiveKit. Um proxy HTTP comum isoladamente não resolve TURN.
- O modelo oficial usa Compose e Caddy com configuração específica [3]. Não executar o instalador sobre uma VPS com proxy existente sem revisar conflitos.
- Se Coolify/Traefik já ocupar 443, integrar conscientemente o ponto de entrada ou separar a mídia em outra máquina/IP. Não iniciar dois serviços disputando a mesma porta.
- Cloudflare pode proteger a parte HTTP. O proxy HTTP padrão não é transporte genérico para WebRTC/TURN; manter os registros de mídia apropriados em DNS-only na topologia inicial [4].
- Isso expõe o IP do servidor de mídia. Se for o mesmo IP da aplicação, não afirmar que a origem está oculta ou que toda a infraestrutura tem proteção do proxy Cloudflare.

Portas propostas, a confirmar na configuração final [5]:
| Porta | Uso | Regra |
|---|---|---|
| TCP 80 | Emissão/redirecionamento de certificados, conforme método | Abrir se necessário |
| TCP 443 | HTTPS, WSS e TURN/TLS com roteamento adequado | Pública |
| TCP 7881 | Fallback WebRTC sobre TCP | Pública se habilitada |
| UDP 7882 | Mux de mídia, se escolhido | Pública; alternativa à faixa UDP |
| UDP 3478 | TURN/UDP e STUN, conforme configuração | Pública se habilitada |
| TCP 7880 | API/sinalização interna do LiveKit | Não publicar diretamente |
| TCP 5432 e 6379 | PostgreSQL e Redis | Não publicar |
| SSH | Administração | Restrito ao acesso administrativo |

A alternativa ao UDP mux é a faixa definida pelo LiveKit; não abrir as duas opções sem necessidade. Confirmar regras no firewall do provedor, no host e nas redes Docker. Portas publicadas pelo Docker podem contornar regras comuns do UFW [6]. Verificar de fora o que está acessível. Não usar TURN aberto.

## 5. Bot Discord: configuração e comportamento
Criar aplicações distintas para desenvolvimento e produção. Testar primeiro em servidor Discord de testes e registrar comandos por guild. O token de produção não vai para máquinas de todos os colaboradores.

Instalação:
- Escopos de instalação bot e applications.commands.
- Permissões de canal limitadas a ver o canal, enviar mensagens e inserir links/embeds quando necessário.
- Não solicitar Administrator, Manage Roles, leitura ampla de mensagens ou permissões de voz.
- Intents GUILDS e GUILD_MEMBERS para eventos relevantes de membros e cargos. Habilitar o intent privilegiado no portal; verificar requisitos vigentes de aprovação [7].
- Sem MESSAGE_CONTENT e sem presença de todos os membros.
- Validar o guild_id permitido em toda ação; restringir o contexto dos comandos ao servidor.
- Configurar cargos autorizados por IDs, nunca por nomes mutáveis.

Comandos iniciais:
| Comando | Responsabilidade |
|---|---|
| /screen criar | Criar sala com modalidade, acesso e limites permitidos |
| /screen entrar | Obter link de uma sala à qual o usuário pode ter acesso |
| /screen convidar | Criar convite a membro elegível |
| /screen encerrar | Encerrar sala após autorização |
| /screen status | Informar estado sem revelar salas privadas a terceiros |

O bot responde ou adia a resposta em até 3 segundos; tarefas externas continuam após o reconhecimento [8]. Erros de permissão e dados sensíveis usam respostas privadas quando disponíveis. Em canais públicos, listar somente salas autorizadas para aquele contexto.

Cada interaction_id é uma chave de idempotência: retries não criam salas duplicadas. Um timeout de resposta não significa automaticamente que a operação falhou. Consultar o resultado antes de repetir.

O processo do bot chama a API interna por credencial de serviço restrita. A API identifica o ator, verifica guild e permissões; não confia em parâmetros de papel enviados pelo cliente. Não manter cópias independentes das regras.

Usar heartbeat/reconexão/resume fornecidos pela biblioteca, com backoff, limites de retries e respeito aos rate limits [9]. Limitar cache de membros e evitar buscar toda a guild repetidamente. Não registrar comandos em toda reconexão.

A perda de cargo ou saída da comunidade invalida elegibilidade na aplicação. Eventos aceleram a atualização, mas uma consulta atual e reconciliação são necessárias após desconexão do bot. Nunca depender apenas de um evento que pode ter sido perdido.

## 6. Autenticação e acesso
Login via OAuth2 Authorization Code, com state vinculado à sessão e uso único. Escopos iniciais identify e guilds.members.read [10]. Redirect URIs exatas, HTTPS em produção e destinos de retorno permitidos. Não solicitar email sem necessidade.

Sessão opaca em cookie HttpOnly, Secure e SameSite apropriado; rotação após login. Estado da sessão no servidor, expiração e revogação. Proteção CSRF nas operações autenticadas e política de origem restrita. Tokens OAuth armazenados cifrados somente se necessários para revalidação, com chave fora do banco; nunca em logs, URLs públicas ou armazenamento persistente do navegador.

Acesso exige simultaneamente:
1. Sessão válida.
2. Membro elegível da guild; considerar estado de verificação pendente.
3. Cargo de acesso ativo, se a comunidade usa esse cargo.
4. Permissão na sala.
5. Ausência de bloqueio.
6. Vaga e orçamento operacional disponíveis.

Como a comunidade vende acesso anual [1], perguntar quais cargos representam acesso vigente. Estar na guild pode não representar elegibilidade comercial atual. Não integrar cobrança sem necessidade: o sistema consome o sinal de acesso definido pela comunidade.

Convidado é membro elegível convidado à sala. Convidados externos exigem futura decisão explícita, fluxo de verificação e política própria.

Convites devem ter alta entropia, hash no banco, validade, escopo por sala, limite de uso e revogação. Se destinados a uma pessoa, vincular ao Discord ID. Não colocar credenciais de mídia no link enviado ao Discord.

## 7. Permissões de mídia e revogação
A API emite credenciais com identidade interna opaca, sala específica e permissões mínimas. Espectador não publica áudio, câmera, tela nem dados arbitrários. Não enviar chaves administrativas ao navegador. Moderação passa pela API.

A autorização para transmitir muda no servidor. Para limitar o número de telas, conceder screen_share apenas a participantes que tenham obtido uma reserva válida. O cliente não escolhe seu próprio papel. Conferir publicações efetivas e reconciliar reservas.

Limitação relevante: no self-hosted do LiveKit, expulsão e mudança de permissão não invalidam automaticamente credenciais anteriores; tokens podem ser renovados pelo próprio servidor [11]. TTL curto não desconecta uma sessão existente e não garante expulsão permanente imediata.

O piloto exige:
- Bloqueio de novas emissões, remoção da sessão e atualização de permissões.
- Rechecagem de tentativas de reentrada e reconciliação.
- Teste com tokens originais e renovados antes/depois da expulsão e do rebaixamento.
- Registro explícito da janela residual; remover por webhook é reação posterior à entrada, não barreira anterior.

Se o requisito for impedir toda reentrada imediatamente após expulsão, a solução de revogação na admissão é um bloqueador de lançamento. Avaliar serviço com suporte adequado ou mecanismo de admissão compatível e testado. Não chamar o piloto de revogação imediata sem comprovação.

Credenciais de mídia são bearer tokens: impedir vazamentos, usar duração curta e não prometer que não possam ser reutilizadas se roubadas. Acesso privado e criptografia de transporte não equivalem a criptografia ponta a ponta. Decidir E2EE separadamente se o caso de uso exigir.

## 8. Regras de sala e limites
Modalidades:
- Grupo: interação entre membros, limitado por número de fontes e participantes.
- Palco: poucos apresentadores, audiência e pedidos para participar.

Limites independentes: total de salas, participantes globais, participantes por sala, apresentadores, microfones ativos, câmeras, telas e qualidade máxima. Administradores definem o teto; donos só escolhem abaixo dele.

Configuração inicial de ensaio proposta: uma sala, até 10 participantes, uma tela, até duas câmeras e dois apresentadores. Isso é um ponto de partida para teste, não capacidade garantida nem limite comercial definitivo.

Usar reserva de vaga transacional com prazo e identidade estável; duas entradas simultâneas não podem ocupar a última vaga. Limite no servidor de mídia complementa a reserva. Definir uma presença por usuário/sala no piloto e comportamento explícito para outra aba/dispositivo.

Estados da sala: creating, open, closing, closed, failed. As transições têm precondições. Persistir intenção, executar efeito externo e reconciliar antes de divulgar a sala. Dados e API externa não participam da mesma transação; usar tarefas duráveis/outbox e operações idempotentes.

Se o dono desconectar, aplicar tolerância de reconexão proposta de 2 minutos. Moderador já nomeado continua atuando. Nunca promover automaticamente um espectador. Encerrar sala vazia após prazo proposto de 5 minutos, sujeito a ajuste.

Quando sobrecarregado, bloquear novas salas/entradas e informar indisponibilidade temporária. Qualidade pode reduzir dentro de uma política definida; priorizar áudio e tela legível. Não reiniciar tudo automaticamente em resposta a CPU alta.

## 9. Otimização e orçamento
- Simulcast e adaptive stream quando apropriados; assinar apenas as telas selecionadas e câmeras visíveis [12].
- Tela de código: começar os testes com resolução legível e 10–15 fps; vídeo em movimento é outro perfil.
- Câmeras: começar em 360p/720p adaptativo. Não enviar miniaturas em máxima qualidade.
- Não transcodificar, compor mosaico ou gravar na KVM1.
- Áudio passa no Screen; usuários devem evitar manter o mesmo microfone ativo em duas chamadas.
- Cache curto para consultas Discord com limites e invalidação; decisões críticas exigem dados atuais.
- Pool pequeno do PostgreSQL, queries indexadas, paginação e limites de payload.
- Limitar frequência e tamanho de mensagens de dados, mão levantada e atualizações de layout.
- Compilar imagens fora da VPS; limitar logs, retenção de métricas e acúmulo de imagens antigas.
- Reservar folga de memória e CPU. Medir consumo de idle, carga real e picos antes de fixar limites de containers. Limite arbitrário pode matar o serviço de mídia por OOM.
- Swap é proteção limitada, não capacidade para chamadas em tempo real.
- Evitar dashboards pesados e agentes de observabilidade redundantes nessa máquina.

Cálculo ilustrativo: saída aproximada é a soma dos bitrates recebidos por todos os espectadores. Um único fluxo a 2 Mbps para 500 pessoas gera aproximadamente 1 Gbps e 450 GB/h, sem overhead ou outras fontes. Transferência mensal e velocidade instantânea de rede são restrições diferentes.

Medir horas de espectadores, uso de TURN e custo por evento. Usar alertas de franquia e previsão de consumo. Limites de salas precisam considerar a soma global; dez salas pequenas também podem saturar o host.

## 10. Falhas e continuidade
| Falha | Comportamento planejado | Limite |
|---|---|---|
| Bot desconecta | Chamada continua; site funciona; reconectar bot | Comandos/eventos ficam atrasados |
| API indisponível | Preservar mídia já conectada, suspender mutações | Novas entradas e moderação podem falhar |
| Discord fora/rate limit | Não autorizar novos acessos sem validação suficiente | Política de tolerância para sessões existentes |
| PostgreSQL fora | Recusar mutações e novas admissões | Não simular sucesso nem usar estado vazio |
| LiveKit cai | Informar desconexão, retentar com backoff e recuperar sala conforme regra | Mídia interrompida |
| VPS/provedor cai | Alertar externamente e executar contingência | Todos os serviços locais indisponíveis |
| Disco/memória quase cheios | Alertar, reduzir novas admissões, intervenção controlada | Reiniciar pode agravar perda de estado |
| Deploy com regressão | Voltar imagem anterior compatível | Migração destrutiva pode impedir rollback |

Para indisponibilidade do Discord, proposta: negar novas autorizações privilegiadas; permitir apenas uma janela curta e documentada para sessões já elegíveis. Prazo final depende da política de revogação. Depois da janela, restringir/encerrar conforme regra. Não vender validação contínua se a origem de identidade está indisponível.

Restart policy recupera processos que saem. Healthcheck apenas marca estado; Compose não reinicia automaticamente todo container unhealthy. Separar liveness de readiness, usar supervisão com backoff e evitar loops destrutivos.

Vários containers na mesma VPS não são alta disponibilidade. Separar mídia da aplicação reduz interferência, mas ainda deixa cada host como ponto de falha. Redis, banco, proxy, DNS e bot também entram no desenho de continuidade.

LiveKit self-hosted distribui salas entre nós, mas uma sala fica em um único nó [13]. Drenagem ajuda em manutenção planejada; não significa migração transparente de uma sala após crash.

Para eventos importantes: ter moderador responsável, comunicação de incidente e uma sala alternativa em serviço independente previamente escolhido. Não pressupor que o Discord resolverá a contingência, pois suas limitações motivaram o projeto. Uma página de status e alertas devem estar fora do host afetado.

## 11. Segurança do host e dos dados
- SSH por chave, contas administrativas individuais e acesso restrito.
- Atualizações de segurança com janela de manutenção; reinícios avisados.
- Banco com usuário de privilégio mínimo; migrations com credencial separada quando viável.
- Segredos separados por ambiente, excluídos do git, logs e imagens. Rotação e responsáveis definidos.
- Containers da aplicação sem root, sem modo privilegiado e sem socket Docker. Somente volumes necessários.
- Se LiveKit usar host networking, revisar escutas/binds do host; não assumir isolamento da rede bridge.
- Endpoint de webhooks LiveKit com verificação oficial de assinatura/corpo e deduplicação.
- Se futuramente os comandos Discord migrarem para HTTP, validar assinatura Ed25519 e timestamp no corpo original [14].
- Rate limit por usuário e origem, sem bloquear todos os membros de uma rede compartilhada; confiar em cabeçalhos de proxy apenas dos proxies conhecidos.
- Validar schemas e autorização de cada recurso, inclusive leitura de lista e metadados de salas.
- Logs sem tokens, cookies, SDP integral ou conteúdo de tela. Sanitizar nomes e textos.
- Sem gravação por padrão; aviso de uso dos dispositivos. Não impedir por promessa a gravação externa por um participante.
- Minimização de dados; retenção e exclusão de dados definidas com a comunidade. Proposta técnica: logs operacionais 7 dias e auditoria 30 dias, a revisar.
- Provedor deve oferecer proteção de rede compatível. TLS e rate limit HTTP não impedem saturação por tráfego de mídia ou ataques volumétricos.

## 12. Banco e tarefas
Tabelas propostas: users, community_settings, sessions, rooms, room_memberships, room_role_grants, invites, bans, admission_leases, audit_events, outbox_jobs e processed_events.

Discord IDs como texto para evitar perda de precisão; IDs internos opacos. Índices nas relações de sala/usuário, validade, estado de tarefas e eventos únicos.

Sessões, autorização e auditoria têm durabilidade; presença de mídia é reconciliada. Reservas expiram de forma controlada. Atualização de sala pode usar versão para evitar sobrescrita concorrente. Jobs com retries limitados, backoff e erro permanente visível. Chaves únicas em interaction_id/event_id previnem duplicação.

## 13. Backups e recuperação
- Backup PostgreSQL diário cifrado fora da VPS; retenção inicial proposta de 7 diários e 4 semanais.
- Configuração reproduzível em git; segredos recuperáveis por canal separado e autorizado.
- Teste de restauração antes do piloto e periodicamente. Snapshot local/provedor sozinho não basta.
- Meta inicial proposta: perda máxima de 24 h de dados persistidos (RPO) e recuperação em até 60 min (RTO), somente após ensaio que comprove esses tempos.
- Sessões de vídeo em andamento não são recuperadas por backup.
- Para requisitos mais fortes, estudar backups contínuos/PITR e infraestrutura redundante; custo e complexidade separados.
- Definir quem tem acesso às cópias e quem executa recuperação se Will estiver indisponível.

## 14. Observabilidade e testes de aceitação
Métricas: CPU, memória, OOM, disco, tráfego e franquia; event loop e latência da API; conexão e filas do banco; estado Gateway; participantes, fontes, falhas de entrada, reconexões, perda de pacotes, jitter, RTT e uso de TURN.

Monitor externo de HTTPS e teste sintético de chamada. Página carregando não prova que áudio funciona. Painéis/metrics administrativos privados. Alertas em canal que não dependa somente da VPS e, idealmente, não apenas do Discord.

Metas propostas para o piloto, sujeitas à aferição:
- Pelo menos 99% de entradas válidas bem-sucedidas em rede suportada durante o ensaio.
- p95 de entrada na mídia até 5 s, excluindo login e diálogo de permissão.
- API própria p95 até 500 ms sob carga aprovada, medindo separadamente dependências externas.
- Sem OOM/restarts não planejados e folga operacional de CPU/memória.
- Compartilhamento legível e áudio avaliado em clientes reais.

Executar carga fora da VPS testada, em etapas 5, 10, 20 e seguintes somente após aprovação da anterior. Testar perfil real de tela/câmera, várias salas e conexões TURN forçadas; teste de áudio sintético sozinho não valida vídeo. Carga consome franquia [15].

Testes obrigatórios: não membro, cargo revogado, convite vazado, ID de sala alheia, token adulterado, token antigo após expulsão, publicação sem permissão, última vaga concorrente, duplicação de comando/webhook, queda do bot, reinício API, falha do banco, disco cheio em ambiente de teste, atualização e restauração.

Compatibilidade: priorizar Chrome/Edge atuais em desktop no piloto; validar Firefox/Safari antes de anunciá-los como suportados. Captura de áudio do sistema/aba varia por navegador e SO; documentar limitações. PWA não elimina limitações de captura.

## 15. Desenvolvimento, CI e deploy
- Branch principal protegida onde o plano do GitHub permitir; PR com revisão e checks obrigatórios.
- CI: lint, typecheck, testes de autorização/integração, build e verificação de dependências/segredos.
- Sem segredos de produção em jobs de PR não confiáveis; permissões mínimas do token da CI.
- Imagens imutáveis por commit; versões pinadas; evitar latest.
- Ambiente local com Compose e .env.example sem valores reais. Aplicação Discord de teste e nomes de sala separados.
- Não rodar uma segunda pilha completa de staging permanentemente na KVM1 sem orçamento; usar desenvolvimento local e ambiente temporário separado para carga.
- Deploy por procedimento explícito, credencial restrita, verificação de saúde e rollback.
- Migrations compatíveis com versão anterior; mudanças destrutivas em etapa separada e com backup.
- Atualizar frontend/API/bot independentemente do LiveKit. Atualizar mídia com drenagem e janela sem salas ativas no host único.
- Não prometer zero downtime na KVM1 nem atualizar automaticamente o serviço de mídia durante eventos.

## 16. Entregas e critérios de saída
1. Inventário: confirmar VPS, workloads, DNS, portas, regiões, orçamento, cargos e acessos.
2. Prova de conectividade: HTTPS, login de teste, áudio/tela, UDP e TURN/TLS.
3. Regras: salas, acesso, papéis, convites, capacidade e revogação documentada.
4. Integração Discord: comandos, Gateway, idempotência, atualização de mensagens e cargos.
5. Operação: logs, métricas, backup restaurado, alerta externo, rollback e contingência.
6. Piloto fechado: carga real e falhas controladas com poucos membros.
7. Expansão: aumentar limites apenas após registrar capacidade, qualidade e custo.
8. Eventos maiores: separar mídia e reavaliar redundância antes de assumir meta de 500.

Interface suficiente para validar: login, lista autorizada, criação, sala, prévia de dispositivos, permissões negadas, lotação, reconexão e encerramento. Estética fica para depois.

## 17. Revisão da proposta no repositório
Título proposto: RFC: arquitetura, bot Discord e operação do Acelera Screen na KVM1

Corpo: problema da comunidade, escopo do piloto, decisões acima, limites de disponibilidade, critérios de aceitação, riscos e perguntas pendentes. A RFC é uma proposta revisável, não um anúncio de capacidade garantida.

Após discussão, dividir em issues com entregas verificáveis e criar base do ambiente. Não publicar segredos, IPs administrativos ou dados de membros na issue.

Esta RFC está em revisão. O repositório estava vazio ao preparar esta branch. A infraestrutura real precisa ser inspecionada antes da implementação. As propostas e metas não representam serviços implantados nem resultados de testes.

## 18. Pendências que mudam a implantação
- VPS: sistema operacional, região, recursos contratados, ocupação, serviços existentes, Coolify/proxy e portas em uso.
- DNS: domínio disponível e responsável por alterações.
- Discord: guild_id, cargos elegíveis/administrativos, canal de publicação e responsável pela aplicação do bot.
- Carga: pico simultâneo esperado no piloto, número de salas e perfil de áudio/vídeo.
- Continuidade: orçamento mensal, criticidade dos eventos, prazo de recuperação aceitável e serviço de contingência.
- Segurança: tolerância à janela de revogação e eventual exigência de E2EE.
- GitHub: definir revisores e política de contribuição; confirmar a grafia desejada do projeto.
- Contas e segredos devem ser configurados em canais apropriados; nunca solicitar senhas ou tokens em mensagens.

## Fontes técnicas
Consultadas em 07/11/2026. Configurações finais devem ser validadas contra as versões fixadas.
1. AceleraDev: https://aceleradev.com.br/
2. Hostinger VPS: https://www.hostinger.com/br/servidor-vps
3. LiveKit em VM: https://docs.livekit.io/transport/self-hosting/vm/
4. Cloudflare portas e proxy: https://developers.cloudflare.com/fundamentals/reference/network-ports/ e https://developers.cloudflare.com/dns/proxy-status/
5. LiveKit firewall: https://docs.livekit.io/transport/self-hosting/ports-firewall/
6. Docker firewall: https://docs.docker.com/engine/network/packet-filtering-firewalls/
7. Discord Gateway intents: https://github.com/discord/discord-api-docs/blob/main/developers/events/gateway.mdx
8. Discord interações: https://github.com/discord/discord-api-docs/blob/main/developers/interactions/receiving-and-responding.mdx
9. Discord eventos: https://github.com/discord/discord-api-docs/blob/main/developers/events/overview.mdx
10. Discord OAuth2: https://github.com/discord/discord-api-docs/blob/main/developers/topics/oauth2.mdx
11. LiveKit tokens e revogação: https://docs.livekit.io/frontends/reference/tokens-grants/
12. LiveKit assinatura de mídia: https://docs.livekit.io/transport/media/subscribe/
13. LiveKit distribuição: https://docs.livekit.io/transport/self-hosting/distributed/
14. Discord verificação de interações: https://github.com/discord/discord-api-docs/blob/main/developers/interactions/overview.mdx
15. LiveKit benchmarks: https://docs.livekit.io/transport/self-hosting/benchmark/

