import { useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Icon, type IconName } from '../components/Icon';
import { ThemeToggle } from '../components/ThemeToggle';

interface Feature {
  icon: IconName;
  title: string;
  text: string;
}

interface Step {
  title: string;
  body: ReactNode;
}

const FEATURES: Feature[] = [
  {
    icon: 'videocam',
    title: 'Lives nas calls do Discord',
    text: 'Entrou numa call habilitada? O bot abre a sala e manda o link no chat da própria call. Só quem está na call entra.',
  },
  {
    icon: 'screen_share',
    title: 'Câmera, tela e microfone',
    text: 'Transmita só a câmera, só a tela ou as duas juntas. Tudo começa desligado, e você liga quando quiser.',
  },
  {
    icon: 'calendar_month',
    title: 'Reuniões agendadas',
    text: 'Com data, hora e contagem regressiva. Não precisa estar numa call do Discord para entrar.',
  },
  {
    icon: 'front_hand',
    title: 'Pedir a palavra',
    text: 'Nas reuniões, levante a mão. A moderação vê a fila e dá a palavra na ordem.',
  },
  {
    icon: 'closed_caption',
    title: 'Legendas ao vivo',
    text: 'Veja o que cada um fala escrito na tela. Ótimo para quem está sem som ou em lugar barulhento.',
  },
  {
    icon: 'palette',
    title: 'Fundo, voz e enquadramento',
    text: 'Desfoque ou troque o fundo da câmera, use voz de robô, eco ou rádio e escolha como o vídeo aparece na sua tela.',
  },
  {
    icon: 'bedtime',
    title: 'Economia de recursos',
    text: 'Se ninguém está transmitindo, o vídeo entra em espera e volta quando alguém abre o link. A live continua aberta.',
  },
  {
    icon: 'radio_button_checked',
    title: 'Gravação de reuniões',
    text: 'Os admins gravam a reunião inteira, só o áudio, uma pessoa ou só a tela. Todos são avisados. O arquivo fica 10 dias.',
  },
  {
    icon: 'qr_code_2',
    title: 'QR code e app',
    text: 'Abra a sala no celular lendo o QR code e instale o Screem como aplicativo.',
  },
  {
    icon: 'dashboard',
    title: 'Painel de administração',
    text: 'Configure calls, canais e cargos escolhendo em listas, dê acesso a quem ajuda e veja estatísticas do servidor.',
  },
  {
    icon: 'history',
    title: 'Logs e auditoria',
    text: 'Tudo que os admins fazem e quem entra e sai das salas fica registrado, inclusive no canal de logs do Discord.',
  },
  {
    icon: 'lock',
    title: 'Seguro por padrão',
    text: 'Login com Discord, acesso conferido no servidor, nada de senha própria e dados mínimos guardados.',
  },
];

const MEMBER_STEPS: Step[] = [
  {
    title: 'Entre com o Discord',
    body: (
      <>
        Clique em <strong>Entrar com Discord</strong> e autorize. Você precisa estar no servidor da
        comunidade.
      </>
    ),
  },
  {
    title: 'Para uma live: entre na call',
    body: (
      <>
        Entre numa call habilitada no Discord. O bot manda uma mensagem com um botão no chat da
        call. Clique nele para abrir a sala. Se você não estiver na call, o site avisa e libera
        sozinho assim que você entrar.
      </>
    ),
  },
  {
    title: 'Para uma reunião: use o link ou a aba Reuniões',
    body: (
      <>
        Em <strong>Reuniões</strong> você vê as próximas, com quanto tempo falta. Antes do horário a
        sala não abre; na hora, ela abre sozinha. Você não precisa estar numa call.
      </>
    ),
  },
  {
    title: 'Ligue o que quiser',
    body: (
      <>
        Na sala, os botões redondos controlam <strong>microfone</strong>, <strong>câmera</strong> e{' '}
        <strong>tela</strong>. Tudo começa desligado. Dá para transmitir só a câmera, só a tela ou
        as duas.
      </>
    ),
  },
  {
    title: 'Compartilhar tela: só no computador',
    body: (
      <>
        Celulares e tablets não permitem compartilhar tela no navegador, nem instalando o app. No
        celular você transmite a câmera; para mostrar a tela, entre pelo computador.
      </>
    ),
  },
  {
    title: 'Ajuste como você vê o vídeo',
    body: (
      <>
        No botão <strong>Vídeo</strong>, escolha entre preencher ou mostrar tudo, a parte da imagem
        e o formato (horizontal, vertical, quadrado ou automático). Só muda na sua tela. No
        automático, quem transmite na vertical aparece na vertical.
      </>
    ),
  },
  {
    title: 'Capriche com os Efeitos',
    body: (
      <>
        Em <strong>Efeitos</strong>: fundo desfocado ou com imagem (ligue a câmera antes), voz de
        robô, eco ou rádio (ligue o microfone antes) e <strong>legendas ao vivo</strong>. As
        legendas e o fundo funcionam melhor no Chrome e no Edge.
      </>
    ),
  },
  {
    title: 'Pedir a palavra',
    body: (
      <>
        Nas reuniões, clique em <strong>Pedir a palavra</strong>. Quando a moderação der a palavra,
        você pode ligar o microfone mesmo no modo palestra.
      </>
    ),
  },
  {
    title: 'Abrir no celular e instalar',
    body: (
      <>
        Na tela de entrada da sala, abra <strong>Abrir no celular (QR code)</strong> e leia com a
        câmera. Para instalar o Screem como app, use <strong>Instalar app</strong> no cabeçalho (ou
        “Adicionar à tela de início” no iPhone).
      </>
    ),
  },
  {
    title: 'Se algo der errado',
    body: (
      <>
        Os avisos dizem o que aconteceu e o que fazer. Se aparecer um código de erro, mande-o para
        um admin: ele leva direto ao problema nos logs. Avisos como “o bot não está no servidor” são
        para um admin resolver.
      </>
    ),
  },
];

const ADMIN_STEPS: Step[] = [
  {
    title: 'Quem é admin',
    body: (
      <>
        O dono do servidor, quem tem a permissão Administrador do Discord e quem tem um cargo de
        admin configurado. Moderadores veem o Painel e moderam reuniões. Quem não tem cargo e
        precisa ajudar entra em <strong>Pessoas</strong>.
      </>
    ),
  },
  {
    title: '1. Configurações: o que escolher primeiro',
    body: (
      <>
        Abra <strong>Configurações</strong> e escolha, nas listas: as{' '}
        <strong>calls com live</strong> (pode marcar a categoria inteira), o{' '}
        <strong>canal de avisos</strong> das reuniões e, se quiser, o <strong>canal de logs</strong>{' '}
        e o cargo marcado nos avisos. Os cargos de admin e de moderador também ficam aqui. Deixe o
        cargo de menção vazio para não marcar ninguém.
      </>
    ),
  },
  {
    title: '2. Dê acesso a quem ajuda (Pessoas)',
    body: (
      <>
        Em <strong>Pessoas</strong>, informe o ID do Discord (ative o Modo desenvolvedor e use
        “Copiar ID do usuário”) e escolha Admin ou Moderador. A pessoa entra com o Discord dela e já
        vê o painel, mesmo sem cargo e até fora do servidor.
      </>
    ),
  },
  {
    title: '3. Lives: o que acontece sozinho',
    body: (
      <>
        Quando alguém entra numa call habilitada, o bot abre a live e manda o link no chat da call.
        Quando a call esvazia, a live encerra. Se ninguém transmite câmera ou tela por alguns
        minutos, o vídeo entra em <strong>espera</strong> (você ajusta os minutos em Configurações).
        Em lives não existe moderação.
      </>
    ),
  },
  {
    title: '4. Criar uma reunião',
    body: (
      <>
        Em <strong>Gerenciar reuniões</strong>, preencha título e, se quiser, data e hora. Deixe a
        data em branco para abrir agora. Criar <em>não</em> avisa ninguém: quando quiser divulgar,
        clique em <strong>Enviar aviso</strong>. Os lembretes (24 h, 1 h e 5 min antes) começam
        depois da divulgação. Dá para reagendar, abrir antes da hora, cancelar e ver o relatório de
        presença.
      </>
    ),
  },
  {
    title: '5. Moderar uma reunião',
    body: (
      <>
        No painel <strong>Pessoas</strong> da sala: silenciar, expulsar, banir (por tempo), tornar
        palestrante, <strong>Silenciar todos</strong>, <strong>Desligar câmeras</strong>, ligar o{' '}
        <strong>modo palestra</strong> e encerrar. Em “Querem falar” você dá a palavra na ordem.
        Ninguém age sobre quem tem papel igual ou maior.
      </>
    ),
  },
  {
    title: '6. Gravar uma reunião',
    body: (
      <>
        Com a reunião aberta, use <strong>Gravação</strong>, escolha o que gravar (todos, quem fala,
        só áudio, uma pessoa ou a tela de uma pessoa) e comece. Todos veem o aviso de gravação.
        Depois, em <strong>Gravações</strong>, baixe o arquivo em até <strong>10 dias</strong>:
        passado o prazo ele é apagado de vez. Avise os participantes no convite.
      </>
    ),
  },
  {
    title: '7. Estatísticas e auditoria',
    body: (
      <>
        <strong>Estatísticas</strong> mostra lives, reuniões, pessoas, tempo conectado e o ranking
        de participação (7, 30 ou 90 dias). <strong>Auditoria</strong> lista cada ação de admin e
        moderação, com quem fez e quando.
      </>
    ),
  },
  {
    title: '8. Canal de logs',
    body: (
      <>
        Se você escolheu um canal de logs, o bot escreve nele: quem abriu e encerrou lives, quem
        entrou e saiu das salas, ações de admin, gravações e erros com a explicação do que fazer.
        Sem canal escolhido, nada é enviado.
      </>
    ),
  },
  {
    title: 'Problemas comuns',
    body: (
      <ul className="list-disc space-y-1 pl-5">
        <li>
          <strong>“Configuração incompleta” no topo:</strong> falta escolher calls ou o canal de
          avisos, ou o bot não está no servidor.
        </li>
        <li>
          <strong>Bot não escreve no chat da call:</strong> dê a ele Ver Canal, Enviar Mensagens e
          Inserir Links nesse canal. Enquanto isso, o link vai para o canal de texto alternativo, se
          você escolheu um.
        </li>
        <li>
          <strong>Gravação não inicia:</strong> confira se os serviços “egress” e “redis” estão no
          ar no Coolify.
        </li>
        <li>
          <strong>Login não funciona:</strong> o endereço de retorno do Discord e o domínio do site
          e da API precisam ser do mesmo domínio-pai.
        </li>
      </ul>
    ),
  },
];

type Tab = 'recursos' | 'membros' | 'admins';

const TABS: { id: Tab; label: string; icon: IconName }[] = [
  { id: 'recursos', label: 'O que tem', icon: 'info' },
  { id: 'membros', label: 'Tutorial para membros', icon: 'group' },
  { id: 'admins', label: 'Tutorial para admins', icon: 'dashboard' },
];

function StepList({ steps }: { steps: Step[] }) {
  return (
    <ol className="space-y-3">
      {steps.map((s, i) => (
        <li
          key={s.title}
          className="flex gap-4 rounded-2xl border border-zinc-800 bg-zinc-900/70 p-4"
          data-testid="step"
        >
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand-500/15 font-display text-sm font-bold text-brand-300">
            {i + 1}
          </span>
          <div className="min-w-0 space-y-1">
            <h3 className="font-display text-base font-semibold text-zinc-50">{s.title}</h3>
            <div className="text-sm leading-relaxed text-zinc-300">{s.body}</div>
          </div>
        </li>
      ))}
    </ol>
  );
}

/**
 * Página pública (sem login) que apresenta o Screem e ensina a usar, para membros e para admins.
 */
export function FeaturesPage() {
  const initial = (typeof location !== 'undefined' ? location.hash.replace('#', '') : '') as Tab;
  const [tab, setTab] = useState<Tab>(TABS.some((t) => t.id === initial) ? initial : 'recursos');

  function choose(next: Tab) {
    setTab(next);
    try {
      history.replaceState(null, '', `#${next}`);
    } catch {
      // Sem histórico (ambientes restritos): a aba continua funcionando.
    }
  }

  return (
    <div className="min-h-dvh">
      <header className="sticky top-0 z-30 border-b border-zinc-800/80 bg-zinc-950/85 pt-[env(safe-area-inset-top)] backdrop-blur-xl">
        <div className="mx-auto flex max-w-5xl items-center gap-3 px-4 py-2.5">
          <Link
            to="/"
            className="flex items-center gap-2 font-display text-lg font-bold text-zinc-50"
          >
            <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-brand-500 text-on-brand">
              <Icon name="play_arrow" size="1.3rem" />
            </span>
            Screem
          </Link>
          <div className="ml-auto flex items-center gap-2">
            <ThemeToggle />
            <Link
              to="/"
              className="rounded-xl bg-brand-500 px-4 py-2 text-sm font-semibold text-on-brand hover:bg-brand-400"
            >
              Entrar
            </Link>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl space-y-10 px-4 py-10">
        <section className="space-y-4 text-center">
          <p className="text-sm font-medium text-brand-300">Acelera DEV</p>
          <h1 className="font-display text-4xl font-bold text-zinc-50 sm:text-5xl">
            Transmita tela, câmera e voz com a comunidade
          </h1>
          <p className="mx-auto max-w-2xl text-lg text-zinc-400">
            O Screem liga o Discord a salas de vídeo: lives nas calls, reuniões agendadas, pedir a
            palavra, legendas, gravação e um painel para os admins. Sem instalar nada.
          </p>
          <Link
            to="/"
            className="inline-flex items-center gap-2 rounded-xl bg-brand-500 px-6 py-3 text-base font-semibold text-on-brand hover:bg-brand-400"
          >
            Entrar com Discord
            <Icon name="chevron_right" />
          </Link>
        </section>

        <div
          role="tablist"
          aria-label="Seções"
          className="flex flex-wrap justify-center gap-2 rounded-2xl bg-zinc-900/70 p-1.5"
        >
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={tab === t.id}
              onClick={() => choose(t.id)}
              className={`inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold transition-colors ${
                tab === t.id
                  ? 'bg-brand-500 text-on-brand'
                  : 'text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {tab === 'recursos' && (
          <section aria-label="O que tem" className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map((f) => (
              <article
                key={f.title}
                className="space-y-2 rounded-2xl border border-zinc-800 bg-zinc-900/70 p-5"
                data-testid="feature"
              >
                <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-brand-500/15 text-brand-300">
                  <Icon name={f.icon} size="1.5rem" />
                </span>
                <h2 className="font-display text-lg font-semibold text-zinc-50">{f.title}</h2>
                <p className="text-sm leading-relaxed text-zinc-400">{f.text}</p>
              </article>
            ))}
          </section>
        )}

        {tab === 'membros' && (
          <section aria-label="Tutorial para membros" className="space-y-4">
            <h2 className="font-display text-2xl font-semibold text-zinc-50">Como usar</h2>
            <StepList steps={MEMBER_STEPS} />
          </section>
        )}

        {tab === 'admins' && (
          <section aria-label="Tutorial para admins" className="space-y-4">
            <h2 className="font-display text-2xl font-semibold text-zinc-50">Como administrar</h2>
            <StepList steps={ADMIN_STEPS} />
          </section>
        )}

        <footer className="border-t border-zinc-800 pt-6 text-center text-sm text-zinc-500">
          Projeto aberto da comunidade Acelera DEV.
        </footer>
      </main>
    </div>
  );
}
