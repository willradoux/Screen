import { useState, type ReactNode } from 'react';
import { PageTitle } from '../components/ui';
import { PillTabs } from '../components/fluid/PillTabs';
import { ADMIN_STEPS, MEMBER_STEPS, type Step } from './FeaturesPage';

type Audience = 'membros' | 'moderacao' | 'admins';

/** Para a moderação: quem é quem e como moderar (os mesmos textos do tutorial dos admins). */
const MOD_STEPS: Step[] = ADMIN_STEPS.filter((s) =>
  ['Quem é admin', '5. Moderar uma reunião', '6. Estatísticas e auditoria'].includes(s.title),
);

const AUDIENCES: { id: Audience; label: string; steps: Step[] }[] = [
  { id: 'membros', label: 'Pra quem participa', steps: MEMBER_STEPS },
  { id: 'moderacao', label: 'Pra moderação', steps: MOD_STEPS },
  { id: 'admins', label: 'Pra admins', steps: ADMIN_STEPS },
];

const FAQ: { q: string; a: ReactNode }[] = [
  {
    q: 'Por que não consigo entrar numa live?',
    a: 'Só entra quem está naquela call do Discord. Entre na call e abra o link de novo. Reuniões não pedem call.',
  },
  {
    q: 'Por que não consigo falar?',
    a: 'Com o palco ligado, só quem está no palco fala e transmite. Nas reuniões, use “Pedir a palavra” e espere a moderação te dar a vez.',
  },
  {
    q: 'O chat fica salvo?',
    a: 'Não. O chat vale enquanto a sala está aberta; quando ela fecha, as mensagens somem.',
  },
  {
    q: 'Dá pra usar no celular?',
    a: 'Dá. Abra pelo QR code da tela de entrada da sala ou instale o Screen como app pelo navegador. Compartilhar a tela só funciona no computador.',
  },
];

/** O Guia dentro do site (com o menu): passos por público e as perguntas mais comuns. */
export function GuidePage() {
  const [who, setWho] = useState<Audience>('membros');
  const current = AUDIENCES.find((a) => a.id === who)!;
  return (
    <>
      <PageTitle description="Como usar o screen, do primeiro clique à moderação.">Guia</PageTitle>

      <div className="mb-6 w-fit max-w-full">
        <PillTabs
          label="Pra quem"
          value={who}
          onChange={(v) => setWho(v as Audience)}
          tabs={AUDIENCES.map((a) => ({ value: a.id, label: a.label }))}
        />
      </div>

      <section aria-label={current.label} className="guide-steps stagger">
        {current.steps.map((s, i) => (
          <article key={s.title} className="guide-step" data-testid="step">
            <p className="guide-num tabular">{String(i + 1).padStart(2, '0')}</p>
            <h2 className="guide-title">{s.title.replace(/^\d+\.\s*/, '')}</h2>
            <div className="guide-body">{s.body}</div>
          </article>
        ))}
      </section>

      <section aria-labelledby="guide-faq" className="mt-12">
        <h2 id="guide-faq" className="guide-faq-title">
          Perguntas comuns
        </h2>
        <dl className="guide-faq">
          {FAQ.map((f) => (
            <div key={f.q}>
              <dt>{f.q}</dt>
              <dd>{f.a}</dd>
            </div>
          ))}
        </dl>
      </section>
    </>
  );
}
