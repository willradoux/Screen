import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { Icon } from './Icon';

/*
 * Campo de data e hora do Screen (no lugar do calendário do navegador, que não dá para
 * estilizar). O valor é o mesmo de um `<input type="datetime-local">`: "2026-12-05T20:00", no
 * relógio do navegador, ou "" (vazio). Então `localInputToIso` / `isoToLocalInput` seguem valendo.
 *
 * Dá para digitar ("05/12/2026 20:00") ou escolher no calendário (dias, hora e minuto).
 */

const MONTHS = [
  'janeiro',
  'fevereiro',
  'março',
  'abril',
  'maio',
  'junho',
  'julho',
  'agosto',
  'setembro',
  'outubro',
  'novembro',
  'dezembro',
];
const WEEKDAYS = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S'];
const WEEKDAY_NAMES = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'];
const HOURS = Array.from({ length: 24 }, (_, i) => i);
const MINUTES = Array.from({ length: 12 }, (_, i) => i * 5);
const DEFAULT_TIME = { h: 20, m: 0 };

const pad = (n: number) => String(n).padStart(2, '0');

interface Parts {
  y: number;
  mo: number; // 0-11
  d: number;
  h: number;
  m: number;
}

function parseValue(value: string): Parts | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(value);
  if (!m) return null;
  return { y: +m[1]!, mo: +m[2]! - 1, d: +m[3]!, h: +m[4]!, m: +m[5]! };
}

const toValue = (p: Parts) => `${p.y}-${pad(p.mo + 1)}-${pad(p.d)}T${pad(p.h)}:${pad(p.m)}`;
const toText = (p: Parts) => `${pad(p.d)}/${pad(p.mo + 1)}/${p.y} ${pad(p.h)}:${pad(p.m)}`;

/** "05/12/2026 20:00" (ou "5/12/2026 8:05") → partes; null se não for uma data válida. */
function parseText(text: string): Parts | null {
  const m = /^\s*(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{1,2}):(\d{2})\s*$/.exec(text);
  if (!m) return null;
  const p = { d: +m[1]!, mo: +m[2]! - 1, y: +m[3]!, h: +m[4]!, m: +m[5]! };
  const date = new Date(p.y, p.mo, p.d, p.h, p.m);
  const ok =
    date.getFullYear() === p.y &&
    date.getMonth() === p.mo &&
    date.getDate() === p.d &&
    p.h < 24 &&
    p.m < 60;
  return ok ? p : null;
}

const sameDay = (a: Date, b: Date) =>
  a.getFullYear() === b.getFullYear() &&
  a.getMonth() === b.getMonth() &&
  a.getDate() === b.getDate();

export function DateTimeField({
  id,
  value,
  onChange,
  placeholder = 'dd/mm/aaaa hh:mm',
  describedBy,
}: {
  id: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  describedBy?: string;
}) {
  const parts = parseValue(value);
  const [text, setText] = useState(parts ? toText(parts) : '');
  const [open, setOpen] = useState(false);
  const now = new Date();
  const [view, setView] = useState(() => ({
    y: parts?.y ?? now.getFullYear(),
    mo: parts?.mo ?? now.getMonth(),
  }));
  const [dir, setDir] = useState<'next' | 'prev'>('next');
  const box = useRef<HTMLDivElement>(null);
  const popId = useId();

  // O valor mudou por fora (ou pelo calendário): o texto acompanha.
  useEffect(() => {
    const p = parseValue(value);
    setText((t) => {
      const typed = parseText(t);
      if (p && typed && toValue(typed) === value) return t;
      return p ? toText(p) : value === '' && parseText(t) ? '' : t;
    });
  }, [value]);

  // Fecha com Esc e clicando fora.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false);
        box.current?.querySelector<HTMLButtonElement>('.dt-toggle')?.focus();
      }
    };
    const onDown = (e: PointerEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('pointerdown', onDown, true);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('pointerdown', onDown, true);
    };
  }, [open]);

  const days = useMemo(() => {
    const first = new Date(view.y, view.mo, 1);
    const start = new Date(view.y, view.mo, 1 - first.getDay());
    return Array.from(
      { length: 42 },
      (_, i) => new Date(start.getFullYear(), start.getMonth(), start.getDate() + i),
    );
  }, [view]);

  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const selected = parts ? new Date(parts.y, parts.mo, parts.d) : null;

  const pick = (next: Partial<Parts>) => {
    const base: Parts = parts ?? {
      y: view.y,
      mo: view.mo,
      d: today.getDate(),
      ...DEFAULT_TIME,
    };
    const p = { ...base, ...next };
    onChange(toValue(p));
    setText(toText(p));
  };

  const move = (delta: number) => {
    setDir(delta > 0 ? 'next' : 'prev');
    setView((v) => {
      const d = new Date(v.y, v.mo + delta, 1);
      return { y: d.getFullYear(), mo: d.getMonth() };
    });
  };

  /** Rola só a coluna (não a página) até a hora/minuto escolhido. */
  const scrollSelected = (el: HTMLElement | null) => {
    const target = el?.querySelector<HTMLElement>('[aria-pressed="true"]');
    if (el && target)
      el.scrollTop = target.offsetTop - el.clientHeight / 2 + target.clientHeight / 2;
  };

  return (
    <div ref={box} className="dt-field" data-open={open || undefined}>
      <div className="dt-input">
        <input
          id={id}
          type="text"
          inputMode="numeric"
          autoComplete="off"
          placeholder={placeholder}
          value={text}
          aria-describedby={describedBy}
          onChange={(e) => {
            const t = e.target.value;
            setText(t);
            if (t.trim() === '') onChange('');
            const p = parseText(t);
            if (p) {
              onChange(toValue(p));
              setView({ y: p.y, mo: p.mo });
            }
          }}
          onFocus={() => setOpen(true)}
        />
        <button
          type="button"
          className="dt-toggle"
          aria-label={open ? 'Fechar calendário' : 'Abrir calendário'}
          aria-expanded={open}
          aria-controls={popId}
          onClick={() => setOpen((o) => !o)}
        >
          <Icon name="calendar_month" size="1.15rem" />
        </button>
      </div>

      {open && (
        <div id={popId} role="dialog" aria-label="Escolher data e hora" className="dt-pop">
          <div className="dt-cal">
            <div className="dt-head">
              <button type="button" aria-label="Mês anterior" onClick={() => move(-1)}>
                <Icon name="arrow_back" size="1.05rem" />
              </button>
              <p className="dt-month" aria-live="polite">
                {MONTHS[view.mo]} {view.y}
              </p>
              <button type="button" aria-label="Próximo mês" onClick={() => move(1)}>
                <Icon name="arrow_forward" size="1.05rem" />
              </button>
            </div>
            <div className="dt-week" aria-hidden="true">
              {WEEKDAYS.map((w, i) => (
                <span key={i}>{w}</span>
              ))}
            </div>
            <div key={`${view.y}-${view.mo}`} className="dt-days" data-dir={dir}>
              {days.map((day) => {
                const other = day.getMonth() !== view.mo;
                const past = day < today;
                const on = selected !== null && sameDay(day, selected);
                return (
                  <button
                    key={day.toISOString()}
                    type="button"
                    disabled={past}
                    aria-pressed={on}
                    aria-label={`${WEEKDAY_NAMES[day.getDay()]}, ${day.getDate()} de ${MONTHS[day.getMonth()]}`}
                    data-other={other || undefined}
                    data-today={sameDay(day, today) || undefined}
                    onClick={() => {
                      pick({ y: day.getFullYear(), mo: day.getMonth(), d: day.getDate() });
                      if (other) setView({ y: day.getFullYear(), mo: day.getMonth() });
                    }}
                  >
                    {day.getDate()}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="dt-time">
            <p className="dt-time-label">Horário</p>
            <div className="dt-cols">
              <div className="dt-col" role="group" aria-label="Hora" ref={scrollSelected}>
                {HOURS.map((h) => (
                  <button
                    key={h}
                    type="button"
                    aria-pressed={(parts?.h ?? -1) === h}
                    aria-label={`${h} horas`}
                    onClick={() => pick({ h })}
                  >
                    {pad(h)}
                  </button>
                ))}
              </div>
              <div className="dt-col" role="group" aria-label="Minuto" ref={scrollSelected}>
                {MINUTES.map((m) => (
                  <button
                    key={m}
                    type="button"
                    aria-pressed={(parts?.m ?? -1) === m}
                    aria-label={`${m} minutos`}
                    onClick={() => pick({ m })}
                  >
                    {pad(m)}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="dt-foot">
            <button
              type="button"
              className="dt-link"
              onClick={() => {
                onChange('');
                setText('');
                setOpen(false);
              }}
            >
              Abrir agora (sem data)
            </button>
            <button
              type="button"
              className="btn btn-primary dt-done"
              onClick={() => setOpen(false)}
            >
              Pronto
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
