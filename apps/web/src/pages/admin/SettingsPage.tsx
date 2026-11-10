import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { Alert, Button, Card, Field, PageTitle, Spinner, inputClass } from '../../components/ui';
import { api } from '../../lib/api';
import { describeError } from '../../lib/errors';
import type { GuildChannel, GuildRole, Settings, SettingsPatch } from '../../lib/types';
import { useAsync } from '../../lib/useAsync';

/** Valores do formulário. Tudo que é "lista" já é uma lista de IDs escolhidos nos seletores. */
export interface SettingsForm {
  liveChannelIds: string[];
  liveCategoryId: string;
  liveTextChannelId: string;
  announceChannelId: string;
  logChannelId: string;
  mentionRoleId: string;
  adminRoleIds: string[];
  modRoleIds: string[];
  meetingAllowedRoleIds: string[];
  maxParticipantsLive: string;
  graceSeconds: string;
  emptyLiveEndSeconds: string;
  idleSessionMinutes: string;
  activationGraceMinutes: string;
}

export const toForm = (s: Settings): SettingsForm => ({
  liveChannelIds: s.liveChannelIds,
  liveCategoryId: s.liveCategoryId ?? '',
  liveTextChannelId: s.liveTextChannelId ?? '',
  announceChannelId: s.announceChannelId ?? '',
  logChannelId: s.logChannelId ?? '',
  mentionRoleId: s.mentionRoleId ?? '',
  adminRoleIds: s.adminRoleIds,
  modRoleIds: s.modRoleIds,
  meetingAllowedRoleIds: s.meetingAllowedRoleIds,
  maxParticipantsLive: String(s.maxParticipantsLive),
  graceSeconds: String(s.graceSeconds),
  emptyLiveEndSeconds: s.emptyLiveEndSeconds === null ? '' : String(s.emptyLiveEndSeconds),
  idleSessionMinutes: String(s.idleSessionMinutes),
  activationGraceMinutes: String(s.activationGraceMinutes),
});

const sameSet = (a: string[], b: string[]) =>
  a.length === b.length && [...a].sort().join(',') === [...b].sort().join(',');

type StringKey =
  'liveCategoryId' | 'liveTextChannelId' | 'announceChannelId' | 'logChannelId' | 'mentionRoleId';
type ListKey = 'liveChannelIds' | 'adminRoleIds' | 'modRoleIds' | 'meetingAllowedRoleIds';

/**
 * Compara o formulário com o que está salvo e monta só o que mudou (o `PATCH` não
 * mexe no resto). Devolve os erros de preenchimento, se houver.
 */
export function buildSettingsPatch(
  original: Settings,
  form: SettingsForm,
): { patch: SettingsPatch } | { errors: string[] } {
  const errors: string[] = [];
  const patch: SettingsPatch = {};

  // Seletores: vazio = "nenhum" (limpa).
  for (const key of [
    'liveCategoryId',
    'liveTextChannelId',
    'announceChannelId',
    'logChannelId',
    'mentionRoleId',
  ] as StringKey[]) {
    const value = form[key];
    if (value === '') {
      if (original[key] !== null) patch[key] = null;
    } else if (value !== original[key]) {
      patch[key] = value;
    }
  }

  for (const key of [
    'liveChannelIds',
    'adminRoleIds',
    'modRoleIds',
    'meetingAllowedRoleIds',
  ] as ListKey[]) {
    if (!sameSet(form[key], original[key])) patch[key] = form[key];
  }

  const int = (
    key: 'maxParticipantsLive' | 'graceSeconds' | 'idleSessionMinutes' | 'activationGraceMinutes',
    label: string,
    min: number,
    max: number,
  ) => {
    const n = Number(form[key]);
    if (!Number.isInteger(n) || n < min || n > max) {
      errors.push(`${label}: um número inteiro de ${min} a ${max}.`);
    } else if (n !== original[key]) patch[key] = n;
  };
  int('maxParticipantsLive', 'Limite de pessoas por live', 2, 500);
  int('graceSeconds', 'Tolerância ao sair da call (segundos)', 5, 300);
  int('idleSessionMinutes', 'Minutos sem transmissão até a sessão entrar em espera', 1, 240);
  int('activationGraceMinutes', 'Minutos para começar a transmitir depois de ativar', 1, 60);

  if (form.emptyLiveEndSeconds.trim() === '') {
    if (original.emptyLiveEndSeconds !== null) patch.emptyLiveEndSeconds = null;
  } else {
    const n = Number(form.emptyLiveEndSeconds);
    if (!Number.isInteger(n) || n < 10 || n > 3600) {
      errors.push('Tempo com a call vazia: um número inteiro de 10 a 3600 segundos (ou vazio).');
    } else if (n !== original.emptyLiveEndSeconds) patch.emptyLiveEndSeconds = n;
  }

  return errors.length > 0 ? { errors } : { patch };
}

// ---------- seletores ----------

function Select({
  id,
  value,
  onChange,
  options,
  empty,
}: {
  id: string;
  value: string;
  onChange: (v: string) => void;
  options: { id: string; label: string }[];
  empty: string;
}) {
  // Se o item salvo foi apagado no Discord, ainda aparece (marcado) para ser trocado.
  const known = options.some((o) => o.id === value);
  return (
    <select id={id} className={inputClass} value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="">{empty}</option>
      {!known && value !== '' && <option value={value}>(item removido do servidor)</option>}
      {options.map((o) => (
        <option key={o.id} value={o.id}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

function CheckList({
  legend,
  items,
  selected,
  onChange,
  emptyText,
}: {
  legend: string;
  items: { id: string; label: string; group?: string }[];
  selected: string[];
  onChange: (ids: string[]) => void;
  emptyText: string;
}) {
  const toggle = (id: string, on: boolean) =>
    onChange(on ? [...selected, id] : selected.filter((s) => s !== id));
  const groups = [...new Set(items.map((i) => i.group ?? ''))];
  // Itens salvos que não existem mais no servidor continuam visíveis, para poderem ser removidos.
  const orphans = selected.filter((s) => !items.some((i) => i.id === s));

  return (
    <fieldset className="space-y-2">
      <legend className="text-sm font-medium text-zinc-200">{legend}</legend>
      {items.length === 0 && <p className="text-sm text-zinc-500">{emptyText}</p>}
      {groups.map((group) => {
        const inGroup = items.filter((i) => (i.group ?? '') === group);
        const allOn = inGroup.every((i) => selected.includes(i.id));
        return (
          <div key={group || 'sem-grupo'} className="space-y-1">
            {group && (
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
                  {group}
                </p>
                <button
                  type="button"
                  className="text-xs text-brand-300 underline"
                  onClick={() =>
                    onChange(
                      allOn
                        ? selected.filter((s) => !inGroup.some((i) => i.id === s))
                        : [...new Set([...selected, ...inGroup.map((i) => i.id)])],
                    )
                  }
                >
                  {allOn ? 'Desmarcar todas' : 'Marcar todas'}
                </button>
              </div>
            )}
            <div className="grid gap-1 sm:grid-cols-2">
              {inGroup.map((i) => (
                <label key={i.id} className="flex items-center gap-2 text-sm text-zinc-300">
                  <input
                    type="checkbox"
                    checked={selected.includes(i.id)}
                    onChange={(e) => toggle(i.id, e.target.checked)}
                  />
                  {i.label}
                </label>
              ))}
            </div>
          </div>
        );
      })}
      {orphans.map((id) => (
        <label key={id} className="flex items-center gap-2 text-sm text-amber-300">
          <input type="checkbox" checked onChange={() => toggle(id, false)} />
          Item removido do servidor ({id})
        </label>
      ))}
    </fieldset>
  );
}

function Section({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  return (
    <Card className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold text-zinc-50">{title}</h2>
        {hint && <p className="mt-1 text-sm text-zinc-500">{hint}</p>}
      </div>
      {children}
    </Card>
  );
}

// ---------- editor ----------

function SettingsEditor({
  settings,
  channels,
  roles,
  onSaved,
}: {
  settings: Settings;
  channels: GuildChannel[];
  roles: GuildRole[];
  onSaved: (s: Settings) => void;
}) {
  const [form, setForm] = useState<SettingsForm>(toForm(settings));
  const [errors, setErrors] = useState<string[]>([]);
  const [apiError, setApiError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => setForm(toForm(settings)), [settings]);

  const categories = channels.filter((c) => c.kind === 'category');
  const categoryName = (id: string | null) =>
    categories.find((c) => c.id === id)?.name ?? 'Sem categoria';
  const voices = channels
    .filter((c) => c.kind === 'voice')
    .sort(
      (a, b) =>
        categoryName(a.parentId).localeCompare(categoryName(b.parentId)) ||
        a.name.localeCompare(b.name),
    );
  const texts = channels.filter((c) => c.kind === 'text');
  const textOptions = texts.map((c) => ({ id: c.id, label: `#${c.name}` }));
  const roleOptions = roles.map((r) => ({ id: r.id, label: r.name }));

  const set = <K extends keyof SettingsForm>(key: K, value: SettingsForm[K]) =>
    setForm((f) => ({ ...f, [key]: value }));
  const setNum = (key: keyof SettingsForm) => (e: { target: { value: string } }) =>
    set(key, e.target.value as never);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setSaved(false);
    setApiError(null);
    const built = buildSettingsPatch(settings, form);
    if ('errors' in built) return setErrors(built.errors);
    setErrors([]);
    if (Object.keys(built.patch).length === 0) return setSaved(true);

    setSaving(true);
    try {
      onSaved(await api.settings.update(built.patch));
      setSaved(true);
    } catch (err) {
      setApiError(describeError(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <form
      noValidate
      onSubmit={(e) => void submit(e)}
      className="space-y-6"
      aria-label="Configurações"
    >
      <Section
        title="Calls com live"
        hint="Marque as calls onde a pessoa pode transmitir tela e câmera. Quando alguém entra numa delas, o bot abre a sessão e manda o link no chat da própria call."
      >
        <CheckList
          legend="Calls de voz"
          items={voices.map((v) => ({ id: v.id, label: v.name, group: categoryName(v.parentId) }))}
          selected={form.liveChannelIds}
          onChange={(ids) => set('liveChannelIds', ids)}
          emptyText="Nenhuma call de voz encontrada. O bot está no servidor certo?"
        />
        <Field
          label="Ou uma categoria inteira (opcional)"
          htmlFor="s-cat"
          hint="Todas as calls desta categoria também viram live, inclusive as criadas depois."
        >
          <Select
            id="s-cat"
            value={form.liveCategoryId}
            onChange={(v) => set('liveCategoryId', v)}
            options={categories.map((c) => ({ id: c.id, label: c.name }))}
            empty="Nenhuma"
          />
        </Field>
        <Field
          label="Canal de texto alternativo (opcional)"
          htmlFor="s-live"
          hint="Plano B: se o bot não puder escrever no chat da call, o link vai para este canal."
        >
          <Select
            id="s-live"
            value={form.liveTextChannelId}
            onChange={(v) => set('liveTextChannelId', v)}
            options={textOptions}
            empty="Nenhum"
          />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Limite de pessoas por live" htmlFor="s-max">
            <input
              id="s-max"
              type="number"
              min={2}
              max={100}
              className={inputClass}
              value={form.maxParticipantsLive}
              onChange={setNum('maxParticipantsLive')}
            />
          </Field>
          <Field
            label="Tolerância ao sair da call (s)"
            htmlFor="s-grace"
            hint="Tempo para voltar antes de ser removido da live."
          >
            <input
              id="s-grace"
              type="number"
              min={5}
              max={300}
              className={inputClass}
              value={form.graceSeconds}
              onChange={setNum('graceSeconds')}
            />
          </Field>
          <Field
            label="Encerrar a live após call vazia (s)"
            htmlFor="s-empty"
            hint="Vazio = padrão do servidor (60 s)."
          >
            <input
              id="s-empty"
              type="number"
              min={10}
              max={3600}
              className={inputClass}
              value={form.emptyLiveEndSeconds}
              onChange={setNum('emptyLiveEndSeconds')}
            />
          </Field>
        </div>
      </Section>

      <Section
        title="Sessão de vídeo (economia de recursos)"
        hint="A live fica aberta enquanto houver gente na call, mas o vídeo só fica no ar enquanto alguém usa. Quando ninguém está transmitindo, a sessão vai para a espera e é ativada de novo quando alguém entra pelo link."
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            label="Minutos sem câmera/tela até entrar em espera"
            htmlFor="s-idle"
            hint="Conta a partir da última pessoa que parou de transmitir."
          >
            <input
              id="s-idle"
              type="number"
              min={1}
              max={240}
              className={inputClass}
              value={form.idleSessionMinutes}
              onChange={setNum('idleSessionMinutes')}
            />
          </Field>
          <Field
            label="Minutos para começar a transmitir ao ativar"
            htmlFor="s-act"
            hint="Depois de ativar, alguém precisa transmitir dentro desse prazo."
          >
            <input
              id="s-act"
              type="number"
              min={1}
              max={60}
              className={inputClass}
              value={form.activationGraceMinutes}
              onChange={setNum('activationGraceMinutes')}
            />
          </Field>
        </div>
      </Section>

      <Section title="Reuniões">
        <Field
          label="Canal de avisos"
          htmlFor="s-ann"
          hint="Onde a reunião é divulgada quando você clica em Enviar aviso, e onde saem os lembretes."
        >
          <Select
            id="s-ann"
            value={form.announceChannelId}
            onChange={(v) => set('announceChannelId', v)}
            options={textOptions}
            empty="Nenhum"
          />
        </Field>
        <Field
          label="Cargo marcado nos avisos"
          htmlFor="s-mention"
          hint="Vazio = não marca ninguém."
        >
          <Select
            id="s-mention"
            value={form.mentionRoleId}
            onChange={(v) => set('mentionRoleId', v)}
            options={roleOptions}
            empty="Ninguém"
          />
        </Field>
        <CheckList
          legend="Cargos que podem entrar nas reuniões"
          items={roleOptions}
          selected={form.meetingAllowedRoleIds}
          onChange={(ids) => set('meetingAllowedRoleIds', ids)}
          emptyText="Nenhum cargo encontrado."
        />
        <p className="text-xs text-zinc-500">
          Nenhum marcado = todos os membros. Moderação entra sempre.
        </p>
      </Section>

      <Section
        title="Quem administra"
        hint="Quem tem estes cargos no Discord acessa o painel. O dono do servidor e quem tem a permissão Administrador já são admin. Para dar acesso a alguém sem cargo, use a aba Pessoas."
      >
        <CheckList
          legend="Cargos de administrador (configuram tudo e gerenciam reuniões)"
          items={roleOptions}
          selected={form.adminRoleIds}
          onChange={(ids) => set('adminRoleIds', ids)}
          emptyText="Nenhum cargo encontrado."
        />
        <CheckList
          legend="Cargos de moderador (veem o painel e moderam reuniões)"
          items={roleOptions}
          selected={form.modRoleIds}
          onChange={(ids) => set('modRoleIds', ids)}
          emptyText="Nenhum cargo encontrado."
        />
      </Section>

      <Section
        title="Registro (logs)"
        hint="O bot escreve neste canal o que os admins fazem e os erros do sistema, explicando o que aconteceu e o que fazer."
      >
        <Field label="Canal de logs" htmlFor="s-log">
          <Select
            id="s-log"
            value={form.logChannelId}
            onChange={(v) => set('logChannelId', v)}
            options={textOptions}
            empty="Desligado"
          />
        </Field>
      </Section>

      {errors.length > 0 && (
        <Alert tone="error" title="Confira os campos">
          <ul className="list-disc pl-5">
            {errors.map((e) => (
              <li key={e}>{e}</li>
            ))}
          </ul>
        </Alert>
      )}
      {apiError && <Alert tone="error">{apiError}</Alert>}
      {saved && <Alert tone="success">Configurações salvas.</Alert>}

      <Button type="submit" variant="primary" loading={saving}>
        Salvar
      </Button>
    </form>
  );
}

export function SettingsPage() {
  const { state } = useAsync(async () => {
    const [settings, catalog] = await Promise.all([api.settings.get(), api.guild.catalog()]);
    return { settings, ...catalog };
  });
  const [current, setCurrent] = useState<Settings | null>(null);

  return (
    <>
      <PageTitle description="Calls, canais, cargos e tempos do servidor.">Configurações</PageTitle>
      {state.status === 'loading' && <Spinner label="Carregando…" />}
      {state.status === 'error' && <Alert tone="error">{describeError(state.error)}</Alert>}
      {state.status === 'ready' && (
        <SettingsEditor
          settings={current ?? state.data.settings}
          channels={state.data.channels}
          roles={state.data.roles}
          onSaved={setCurrent}
        />
      )}
    </>
  );
}
