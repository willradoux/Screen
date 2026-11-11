import { useId, useState, type ReactNode } from 'react';
import { PageTitle } from '../components/ui';
import { playSound, readSounds, saveSounds } from '../lib/sounds';
import {
  MODES,
  THEMES,
  readMode,
  readMotion,
  readTheme,
  saveMode,
  saveMotion,
  saveTheme,
  type Mode,
  type Motion,
  type Theme,
} from '../lib/theme';

/** Um grupo de ajustes: título em negrito e as linhas embaixo (como as configurações de um app). */
function Group({ title, children }: { title: string; children: ReactNode }) {
  const id = useId();
  return (
    <section aria-labelledby={id} className="pref-group">
      <h2 id={id} className="pref-group-title">
        {title}
      </h2>
      {children}
    </section>
  );
}

/** Uma linha: nome e explicação à esquerda, o controle à direita. */
function Row({
  label,
  hint,
  control,
  labelId,
}: {
  label: string;
  hint?: ReactNode;
  control: ReactNode;
  labelId?: string;
}) {
  return (
    <div className="pref-row">
      <div className="min-w-0">
        <p id={labelId} className="pref-label">
          {label}
        </p>
        {hint && <p className="pref-hint">{hint}</p>}
      </div>
      <div className="pref-control">{control}</div>
    </div>
  );
}

function Switch({
  on,
  onChange,
  labelledBy,
}: {
  on: boolean;
  onChange: () => void;
  labelledBy: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-labelledby={labelledBy}
      onClick={onChange}
      className="switch"
      data-on={on || undefined}
    >
      <span className="switch-knob" />
    </button>
  );
}

/** Preferências de quem usa: modo, tema, animações e sons. Ficam salvas neste navegador. */
export function PreferencesPage() {
  const [theme, setTheme] = useState<Theme>(() => readTheme());
  const [mode, setMode] = useState<Mode>(() => readMode());
  const [motion, setMotion] = useState<Motion>(() => readMotion());
  const [sounds, setSounds] = useState(() => readSounds());
  const motionId = useId();
  const soundsId = useId();
  const modeId = useId();

  function choose(next: Theme) {
    saveTheme(next);
    setTheme(next);
    setMode(readMode()); // modo e cor são independentes; relê só por garantia
  }

  return (
    <>
      <PageTitle description="Valem só para você, neste navegador.">Preferências</PageTitle>

      <div className="pref-list">
        <Group title="Aparência">
          <Row
            label="Modo"
            labelId={modeId}
            hint="Escuro deixa os painéis pretos; claro, brancos."
            control={
              <div role="radiogroup" aria-labelledby={modeId} className="pref-segment">
                {MODES.map((o) => (
                  <button
                    key={o.value}
                    type="button"
                    role="radio"
                    aria-checked={mode === o.value}
                    onClick={() => {
                      saveMode(o.value);
                      setMode(o.value);
                    }}
                  >
                    {o.label}
                  </button>
                ))}
              </div>
            }
          />
          <div className="pref-row pt-3">
            <div>
              <p className="pref-label">Cor dos detalhes</p>
              <p className="pref-hint">
                Vale no escuro e no claro: botão de entrar, chaves, item ativo e capas.
              </p>
            </div>
          </div>
          <div role="radiogroup" aria-label="Cor dos detalhes" className="pref-themes">
            {THEMES.map((o) => {
              const on = theme === o.value;
              return (
                <button
                  key={o.value}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  onClick={() => choose(o.value)}
                  className="pref-theme"
                >
                  <span
                    aria-hidden="true"
                    className="pref-theme-swatch"
                    style={{
                      backgroundImage: `linear-gradient(135deg, ${o.swatch[0]}, ${o.swatch[1]})`,
                    }}
                  />
                  <span className="pref-theme-name">{o.label}</span>
                  <span className="pref-theme-text">{o.text}</span>
                </button>
              );
            })}
          </div>
        </Group>

        <Group title="Movimento">
          <Row
            label="Animações"
            labelId={motionId}
            hint="Desligue se o movimento incomodar ou se o aparelho for mais lento. A abertura, as transições e o fundo ficam parados."
            control={
              <Switch
                on={motion === 'on'}
                labelledBy={motionId}
                onChange={() => {
                  const next: Motion = motion === 'on' ? 'off' : 'on';
                  saveMotion(next);
                  setMotion(next);
                }}
              />
            }
          />
        </Group>

        <Group title="Sons">
          <Row
            label="Sons da sala"
            labelId={soundsId}
            hint="Um toque curto quando alguém entra ou sai da sala e quando chega um aviso."
            control={
              <Switch
                on={sounds}
                labelledBy={soundsId}
                onChange={() => {
                  saveSounds(!sounds);
                  setSounds(!sounds);
                  if (!sounds) playSound('notify');
                }}
              />
            }
          />
        </Group>

        <Group title="Conta">
          <Row
            label="Login pelo Discord"
            hint="O Screen não guarda senha: quem você é e seus cargos vêm do Discord."
            control={<span className="pref-value">Conectado</span>}
          />
        </Group>
      </div>
    </>
  );
}
