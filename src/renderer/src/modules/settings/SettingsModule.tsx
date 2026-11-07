import type { ReactNode } from 'react';
import { APP_CREDITS, MAX_CONCURRENCY } from '../../../../shared/defaults';
import type { ThemeMode } from '../../../../shared/types';
import { OutputDirField } from '../../components/media/Fields';
import { Button } from '../../components/ui/Button';
import { Field } from '../../components/ui/Field';
import { Icon } from '../../components/ui/Icon';
import { NumberField, Segmented } from '../../components/ui/Inputs';
import { ModuleHeader } from '../../shell/ModuleLayout';
import { useApp } from '../../state/AppContext';

function Card({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="settings-card">
      <h3 className="panel-section-title">{title}</h3>
      {children}
    </section>
  );
}

export function SettingsModule() {
  const { settingsApi, env, refreshEnv, presets } = useApp();
  const s = settingsApi.settings;
  if (!s) return null;
  const custom = presets.presets.filter((p) => !p.builtin);

  const pickBinary = async (key: 'ffmpegPath' | 'ffprobePath'): Promise<void> => {
    const file = await window.api.pickAuxFile('executable');
    if (!file) return;
    settingsApi.update((prev) => ({ ...prev, [key]: file }));
    window.setTimeout(refreshEnv, 600);
  };
  const resetBinary = (key: 'ffmpegPath' | 'ffprobePath'): void => {
    settingsApi.update((prev) => ({ ...prev, [key]: '' }));
    window.setTimeout(refreshEnv, 600);
  };

  return (
    <div className="module">
      <ModuleHeader icon="gear" title="Configurações" subtitle="Aparência, processamento, pastas, FFmpeg, presets e informações do aplicativo" />
      <div className="module-body settings-grid">
        <Card title="Aparência">
          <Field label="Tema">
            <Segmented<ThemeMode>
              value={s.theme}
              onChange={(theme) => settingsApi.update((prev) => ({ ...prev, theme }))}
              options={[
                { value: 'system', label: 'Sistema' },
                { value: 'light', label: 'Claro' },
                { value: 'dark', label: 'Escuro' }
              ]}
            />
          </Field>
        </Card>

        <Card title="Processamento">
          <Field label="Tarefas simultâneas na fila" hint={`Conversores e editores. Vídeo já usa vários núcleos por tarefa; ${env ? `este computador tem ${env.cpuCount} núcleos.` : ''}`}>
            <NumberField value={s.media.concurrency} min={1} max={8} step={1} onChange={(c) => settingsApi.update((prev) => ({ ...prev, media: { ...prev.media, concurrency: Math.round(c) } }))} />
          </Field>
          <Field label="Arquivos em paralelo no Normalizador">
            <NumberField value={s.concurrency} min={1} max={MAX_CONCURRENCY} step={1} onChange={(c) => settingsApi.update((prev) => ({ ...prev, concurrency: Math.round(c) }))} />
          </Field>
        </Card>

        <Card title="Pastas">
          <OutputDirField />
          <Field label="Pasta de saída do Normalizador" hint="Configurada no próprio módulo.">
            <span className="path-value" title={s.export.outputDir}>{s.export.outputDir || '—'}</span>
          </Field>
        </Card>

        <Card title="FFmpeg">
          <div className={`pill ${env?.ffmpegVersion ? 'pill-ok' : 'pill-error'}`}>
            <span className="pill-dot" />
            {env?.ffmpegVersion ?? 'FFmpeg não encontrado'}
          </div>
          {(['ffmpegPath', 'ffprobePath'] as const).map((key) => (
            <Field key={key} label={key === 'ffmpegPath' ? 'Executável do FFmpeg' : 'Executável do FFprobe'} hint={s[key] ? 'Caminho personalizado' : 'Usando o binário embutido'}>
              <div className="path-picker">
                <span className="path-value" title={key === 'ffmpegPath' ? env?.ffmpegPath : env?.ffprobePath}>
                  {(key === 'ffmpegPath' ? env?.ffmpegPath : env?.ffprobePath) ?? '—'}
                </span>
                <Button size="sm" icon="file" onClick={() => void pickBinary(key)}>
                  Escolher
                </Button>
                {s[key] && (
                  <Button size="sm" variant="ghost" onClick={() => resetBinary(key)}>
                    Padrão
                  </Button>
                )}
              </div>
            </Field>
          ))}
          <Button variant="ghost" icon="log" onClick={() => void window.api.openLogs()}>
            Abrir pasta de logs
          </Button>
        </Card>

        <Card title="Meus presets">
          {custom.length === 0 ? (
            <p className="field-hint">Nenhum preset personalizado. Use “Salvar” nos conversores para criar o seu.</p>
          ) : (
            <ul className="preset-list">
              {custom.map((p) => (
                <li key={p.id}>
                  <Icon name="star" size={14} />
                  <span>{p.name}</span>
                  <span className="chip">{p.module === 'audio-convert' ? 'Áudio' : 'Vídeo'}</span>
                  <Button variant="ghost" size="sm" icon="trash" aria-label={`Excluir ${p.name}`} onClick={() => void presets.remove(p.id)} />
                </li>
              ))}
            </ul>
          )}
          <p className="field-hint">{presets.presets.filter((p) => p.builtin).length} presets prontos: YouTube, Shorts, TikTok, Reels, WhatsApp, Telegram, Podcast e FLAC.</p>
        </Card>

        <Card title="Sobre">
          <div className="about">
            <span className="brand-logo">
              <Icon name="wave" size={22} />
            </span>
            <div>
              <strong>{APP_CREDITS.appName}</strong>
              <span className="muted">Versão {env?.appVersion ?? '—'} · Suíte multimídia com FFmpeg</span>
            </div>
          </div>
          <div className="credits">
            <Icon name="heart" size={14} />
            <span>
              Desenvolvido por <strong>{APP_CREDITS.developer}</strong>
            </span>
          </div>
          <p className="field-hint">
            Feito com Electron, React e TypeScript. O processamento de áudio e vídeo usa o FFmpeg (ffmpeg.org), distribuído sob a licença GPL.
          </p>
        </Card>
      </div>
    </div>
  );
}
