import { jsx as _jsx, Fragment as _Fragment, jsxs as _jsxs } from "react/jsx-runtime";
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Icon } from '../components/Icon';
import { ThemeToggle } from '../components/ThemeToggle';
import { SplitPanels } from '../components/SplitPanels';
import { LogoMark } from '../components/Wordmark';
const FEATURES = [
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
        text: 'Abra a sala no celular lendo o QR code e instale o Screen como aplicativo.',
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
const MEMBER_STEPS = [
    {
        title: 'Entre com o Discord',
        body: (_jsxs(_Fragment, { children: ["Clique em ", _jsx("strong", { children: "Entrar com Discord" }), " e autorize. Voc\u00EA precisa estar no servidor da comunidade."] })),
    },
    {
        title: 'Para uma live: entre na call',
        body: (_jsx(_Fragment, { children: "Entre numa call habilitada no Discord. O bot manda uma mensagem com um bot\u00E3o no chat da call. Clique nele para abrir a sala. Se voc\u00EA n\u00E3o estiver na call, o site avisa e libera sozinho assim que voc\u00EA entrar." })),
    },
    {
        title: 'Para uma reunião: use o link ou a aba Reuniões',
        body: (_jsxs(_Fragment, { children: ["Em ", _jsx("strong", { children: "Reuni\u00F5es" }), " voc\u00EA v\u00EA as pr\u00F3ximas, com quanto tempo falta. Antes do hor\u00E1rio a sala n\u00E3o abre; na hora, ela abre sozinha. Voc\u00EA n\u00E3o precisa estar numa call."] })),
    },
    {
        title: 'Ligue o que quiser',
        body: (_jsxs(_Fragment, { children: ["Na sala, os bot\u00F5es redondos controlam ", _jsx("strong", { children: "microfone" }), ", ", _jsx("strong", { children: "c\u00E2mera" }), " e", ' ', _jsx("strong", { children: "tela" }), ". Tudo come\u00E7a desligado. D\u00E1 para transmitir s\u00F3 a c\u00E2mera, s\u00F3 a tela ou as duas."] })),
    },
    {
        title: 'Compartilhar tela: só no computador',
        body: (_jsx(_Fragment, { children: "Celulares e tablets n\u00E3o permitem compartilhar tela no navegador, nem instalando o app. No celular voc\u00EA transmite a c\u00E2mera; para mostrar a tela, entre pelo computador." })),
    },
    {
        title: 'Ajuste como você vê o vídeo',
        body: (_jsxs(_Fragment, { children: ["No bot\u00E3o ", _jsx("strong", { children: "V\u00EDdeo" }), ", escolha entre preencher ou mostrar tudo, a parte da imagem e o formato (horizontal, vertical, quadrado ou autom\u00E1tico). S\u00F3 muda na sua tela. No autom\u00E1tico, quem transmite na vertical aparece na vertical."] })),
    },
    {
        title: 'Capriche com os Efeitos',
        body: (_jsxs(_Fragment, { children: ["Em ", _jsx("strong", { children: "Efeitos" }), ": fundo desfocado ou com imagem (ligue a c\u00E2mera antes), voz de rob\u00F4, eco ou r\u00E1dio (ligue o microfone antes) e ", _jsx("strong", { children: "legendas ao vivo" }), ". As legendas e o fundo funcionam melhor no Chrome e no Edge."] })),
    },
    {
        title: 'Pedir a palavra',
        body: (_jsxs(_Fragment, { children: ["Nas reuni\u00F5es, clique em ", _jsx("strong", { children: "Pedir a palavra" }), ". Quando a modera\u00E7\u00E3o der a palavra, voc\u00EA pode ligar o microfone mesmo no modo palestra."] })),
    },
    {
        title: 'Abrir no celular e instalar',
        body: (_jsxs(_Fragment, { children: ["Na tela de entrada da sala, abra ", _jsx("strong", { children: "Abrir no celular (QR code)" }), " e leia com a c\u00E2mera. Para instalar o Screen como app, use ", _jsx("strong", { children: "Instalar app" }), " no cabe\u00E7alho (ou \u201CAdicionar \u00E0 tela de in\u00EDcio\u201D no iPhone)."] })),
    },
    {
        title: 'Se algo der errado',
        body: (_jsx(_Fragment, { children: "Os avisos dizem o que aconteceu e o que fazer. Se aparecer um c\u00F3digo de erro, mande-o para um admin: ele leva direto ao problema nos logs. Avisos como \u201Co bot n\u00E3o est\u00E1 no servidor\u201D s\u00E3o para um admin resolver." })),
    },
];
const ADMIN_STEPS = [
    {
        title: 'Quem é admin',
        body: (_jsxs(_Fragment, { children: ["O dono do servidor, quem tem a permiss\u00E3o Administrador do Discord e quem tem um cargo de admin configurado. Moderadores veem o Painel e moderam reuni\u00F5es. Quem n\u00E3o tem cargo e precisa ajudar entra em ", _jsx("strong", { children: "Pessoas" }), "."] })),
    },
    {
        title: '1. Configurações: o que escolher primeiro',
        body: (_jsxs(_Fragment, { children: ["Abra ", _jsx("strong", { children: "Configura\u00E7\u00F5es" }), " e escolha, nas listas: as", ' ', _jsx("strong", { children: "calls com live" }), " (pode marcar a categoria inteira), o", ' ', _jsx("strong", { children: "canal de avisos" }), " das reuni\u00F5es e, se quiser, o ", _jsx("strong", { children: "canal de logs" }), ' ', "e o cargo marcado nos avisos. Os cargos de admin e de moderador tamb\u00E9m ficam aqui. Deixe o cargo de men\u00E7\u00E3o vazio para n\u00E3o marcar ningu\u00E9m."] })),
    },
    {
        title: '2. Dê acesso a quem ajuda (Pessoas)',
        body: (_jsxs(_Fragment, { children: ["Em ", _jsx("strong", { children: "Pessoas" }), ", informe o ID do Discord (ative o Modo desenvolvedor e use \u201CCopiar ID do usu\u00E1rio\u201D) e escolha Admin ou Moderador. A pessoa entra com o Discord dela e j\u00E1 v\u00EA o painel, mesmo sem cargo e at\u00E9 fora do servidor."] })),
    },
    {
        title: '3. Lives: o que acontece sozinho',
        body: (_jsxs(_Fragment, { children: ["Quando algu\u00E9m entra numa call habilitada, o bot abre a live e manda o link no chat da call. Quando a call esvazia, a live encerra. Se ningu\u00E9m transmite c\u00E2mera ou tela por alguns minutos, o v\u00EDdeo entra em ", _jsx("strong", { children: "espera" }), " (voc\u00EA ajusta os minutos em Configura\u00E7\u00F5es). Em lives n\u00E3o existe modera\u00E7\u00E3o."] })),
    },
    {
        title: '4. Criar uma reunião',
        body: (_jsxs(_Fragment, { children: ["Em ", _jsx("strong", { children: "Gerenciar reuni\u00F5es" }), ", preencha t\u00EDtulo e, se quiser, data e hora. Deixe a data em branco para abrir agora. Criar ", _jsx("em", { children: "n\u00E3o" }), " avisa ningu\u00E9m: quando quiser divulgar, clique em ", _jsx("strong", { children: "Enviar aviso" }), ". Os lembretes (24 h, 1 h e 5 min antes) come\u00E7am depois da divulga\u00E7\u00E3o. D\u00E1 para reagendar, abrir antes da hora, cancelar e ver o relat\u00F3rio de presen\u00E7a."] })),
    },
    {
        title: '5. Moderar uma reunião',
        body: (_jsxs(_Fragment, { children: ["No painel ", _jsx("strong", { children: "Pessoas" }), " da sala: silenciar, expulsar, banir (por tempo), tornar palestrante, ", _jsx("strong", { children: "Silenciar todos" }), ", ", _jsx("strong", { children: "Desligar c\u00E2meras" }), ", ligar o", ' ', _jsx("strong", { children: "modo palestra" }), " e encerrar. Em \u201CQuerem falar\u201D voc\u00EA d\u00E1 a palavra na ordem. Ningu\u00E9m age sobre quem tem papel igual ou maior."] })),
    },
    {
        title: '6. Gravar uma reunião',
        body: (_jsxs(_Fragment, { children: ["Com a reuni\u00E3o aberta, use ", _jsx("strong", { children: "Grava\u00E7\u00E3o" }), ", escolha o que gravar (todos, quem fala, s\u00F3 \u00E1udio, uma pessoa ou a tela de uma pessoa) e comece. Todos veem o aviso de grava\u00E7\u00E3o. Depois, em ", _jsx("strong", { children: "Grava\u00E7\u00F5es" }), ", baixe o arquivo em at\u00E9 ", _jsx("strong", { children: "10 dias" }), ": passado o prazo ele \u00E9 apagado de vez. Avise os participantes no convite."] })),
    },
    {
        title: '7. Estatísticas e auditoria',
        body: (_jsxs(_Fragment, { children: [_jsx("strong", { children: "Estat\u00EDsticas" }), " mostra lives, reuni\u00F5es, pessoas, tempo conectado e o ranking de participa\u00E7\u00E3o (7, 30 ou 90 dias). ", _jsx("strong", { children: "Auditoria" }), " lista cada a\u00E7\u00E3o de admin e modera\u00E7\u00E3o, com quem fez e quando."] })),
    },
    {
        title: '8. Canal de logs',
        body: (_jsx(_Fragment, { children: "Se voc\u00EA escolheu um canal de logs, o bot escreve nele: quem abriu e encerrou lives, quem entrou e saiu das salas, a\u00E7\u00F5es de admin, grava\u00E7\u00F5es e erros com a explica\u00E7\u00E3o do que fazer. Sem canal escolhido, nada \u00E9 enviado." })),
    },
    {
        title: 'Problemas comuns',
        body: (_jsxs("ul", { className: "list-disc space-y-1 pl-5", children: [_jsxs("li", { children: [_jsx("strong", { children: "\u201CConfigura\u00E7\u00E3o incompleta\u201D no topo:" }), " falta escolher calls ou o canal de avisos, ou o bot n\u00E3o est\u00E1 no servidor."] }), _jsxs("li", { children: [_jsx("strong", { children: "Bot n\u00E3o escreve no chat da call:" }), " d\u00EA a ele Ver Canal, Enviar Mensagens e Inserir Links nesse canal. Enquanto isso, o link vai para o canal de texto alternativo, se voc\u00EA escolheu um."] }), _jsxs("li", { children: [_jsx("strong", { children: "Grava\u00E7\u00E3o n\u00E3o inicia:" }), " confira se os servi\u00E7os \u201Cegress\u201D e \u201Credis\u201D est\u00E3o no ar no Coolify."] }), _jsxs("li", { children: [_jsx("strong", { children: "Login n\u00E3o funciona:" }), " o endere\u00E7o de retorno do Discord e o dom\u00EDnio do site e da API precisam ser do mesmo dom\u00EDnio-pai."] })] })),
    },
];
const TABS = [
    { id: 'recursos', label: 'O que tem', icon: 'info' },
    { id: 'membros', label: 'Tutorial para membros', icon: 'group' },
    { id: 'admins', label: 'Tutorial para admins', icon: 'dashboard' },
];
function StepList({ steps }) {
    return (_jsx("ol", { className: "stagger mt-3 space-y-2", children: steps.map((s, i) => (_jsxs("li", { className: "surface flex gap-4 p-4", "data-testid": "step", children: [_jsx("span", { className: "tabular flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-white/8 text-[13px] font-bold text-brand-300", children: i + 1 }), _jsxs("div", { className: "min-w-0 space-y-1", children: [_jsx("h3", { className: "text-base font-semibold text-zinc-50", children: s.title }), _jsx("div", { className: "text-sm leading-relaxed text-zinc-300", children: s.body })] })] }, s.title))) }));
}
/**
 * Página pública (sem login) que apresenta o Screen e ensina a usar, para membros e para admins.
 */
export function FeaturesPage() {
    const initial = (typeof location !== 'undefined' ? location.hash.replace('#', '') : '');
    const [tab, setTab] = useState(TABS.some((t) => t.id === initial) ? initial : 'recursos');
    function choose(next) {
        setTab(next);
        try {
            history.replaceState(null, '', `#${next}`);
        }
        catch {
            // Sem histórico (ambientes restritos): a aba continua funcionando.
        }
    }
    return (_jsxs(SplitPanels, { sideLabel: "Guia do Screen", side: _jsxs(_Fragment, { children: [_jsxs(Link, { to: "/", "aria-label": "Screen \u2014 in\u00EDcio", className: "hub-brand hub-brand-top", children: [_jsx(LogoMark, { className: "h-8" }), _jsx("span", { children: "screen" })] }), _jsx("p", { className: "hub-group mt-0", children: "Guia" }), _jsx("div", { role: "tablist", "aria-label": "Se\u00E7\u00F5es", "aria-orientation": "vertical", className: "hub-nav", children: TABS.map((t) => (_jsxs("button", { type: "button", role: "tab", "aria-selected": tab === t.id, "data-active": tab === t.id ? 'true' : 'false', onClick: () => choose(t.id), className: "hub-link", children: [_jsx(Icon, { name: t.icon, size: "1.15rem" }), _jsx("span", { className: "min-w-0 flex-1 truncate text-left", children: t.label }), tab === t.id && _jsx("span", { "aria-hidden": "true", className: "hub-dot" })] }, t.id))) }), _jsxs("div", { className: "hub-footer", children: [_jsxs("div", { className: "flex items-center gap-2 px-1 pb-1", children: [_jsx("span", { className: "flex-1 text-[11px] leading-snug text-zinc-500", children: "Projeto aberto da comunidade Acelera DEV." }), _jsx(ThemeToggle, {})] }), _jsx(Link, { to: "/", className: "btn btn-primary w-full", children: "Entrar" })] })] }), children: [_jsxs("header", { className: "rise max-w-2xl", children: [_jsxs("p", { className: "eyebrow", children: [_jsx("span", { "aria-hidden": "true", className: "h-1.5 w-1.5 rounded-full bg-brand-400" }), "Guia de uso"] }), _jsx("h1", { className: "mt-3 text-2xl font-bold tracking-[-0.03em] text-balance text-zinc-50 sm:text-3xl", children: "Transmita tela, c\u00E2mera e voz com a comunidade" }), _jsxs("p", { className: "mt-2 text-[15px] leading-relaxed text-zinc-400", children: ["O Screen liga o Discord a salas de v\u00EDdeo: lives nas calls, reuni\u00F5es agendadas, pedir a palavra, legendas, grava\u00E7\u00E3o e um painel para os admins.", ' ', _jsx("strong", { className: "text-zinc-200", children: "Sem instalar nada." })] })] }), _jsxs("div", { className: "mt-8", children: [tab === 'recursos' && (_jsx("section", { "aria-label": "O que tem", className: "stagger grid gap-2 sm:grid-cols-2", children: FEATURES.map((f) => (_jsxs("article", { className: "surface flex gap-3.5 p-4", "data-testid": "feature", children: [_jsx("span", { className: "mt-0.5 flex h-9 w-9 flex-none items-center justify-center rounded-xl bg-white/6 text-brand-300", children: _jsx(Icon, { name: f.icon, size: "1.2rem" }) }), _jsxs("div", { className: "min-w-0", children: [_jsx("h2", { className: "text-[15px] font-semibold text-zinc-50", children: f.title }), _jsx("p", { className: "mt-0.5 text-[13px] leading-relaxed text-zinc-400", children: f.text })] })] }, f.title))) })), tab === 'membros' && (_jsxs("section", { "aria-label": "Tutorial para membros", className: "rise", children: [_jsx("h2", { className: "text-lg font-semibold text-zinc-50", children: "Como usar" }), _jsx(StepList, { steps: MEMBER_STEPS })] })), tab === 'admins' && (_jsxs("section", { "aria-label": "Tutorial para admins", className: "rise", children: [_jsx("h2", { className: "text-lg font-semibold text-zinc-50", children: "Como administrar" }), _jsx(StepList, { steps: ADMIN_STEPS })] }))] })] }));
}
