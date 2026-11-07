# Audio Leveler Pro — Suíte Multimídia · Arquitetura

Evolução do normalizador para uma suíte com 7 módulos. Princípio central: **toda operação vira um
`JobPlan` (lista de passos FFmpeg) que entra em uma única fila** (`BatchProcessingService`). Os
módulos só descrevem *o que* fazer; a fila cuida de *como* executar (concorrência, pausa, cancelamento,
progresso, velocidade, ETA, histórico).

## 1. Visão geral

```
┌──────────────────────────── Renderer (React) ─────────────────────────────┐
│ Shell: Sidebar · área do módulo · barra global da fila · toasts           │
│ Módulos (montados sob demanda, mantêm estado ao trocar):                  │
│  Normalizador · Conversor de Áudio · Conversor de Vídeo · Editor de Áudio │
│  Editor de Vídeo · Ferramentas em Lote (Fila/Histórico/Lote c/ preset)    │
│  Configurações (tema, pastas, FFmpeg, presets, Sobre/créditos)            │
│ Hooks: useMediaFiles · useQueue · usePresets · useHistory · useSettings   │
└───────────────▲───────────────────────────────────────┬───────────────────┘
                │ eventos (fila, normalizador)           │ window.api (preload)
┌───────────────┴──────────────────── Main ─────────────▼───────────────────┐
│ ipc/  → roteia cada OperationRequest para o serviço do módulo             │
│                                                                           │
│  AudioConverterService ─┐                                                 │
│  VideoConverterService ─┤  probe (MediaProbe c/ cache)                    │
│  AudioEditorService ────┼─► core/commands (builders puros) ─► JobPlan ─┐  │
│  VideoEditorService ────┘                                              │  │
│                                                                        ▼  │
│  BatchProcessingService (fila única): ordem, concorrência, pausar/continuar,│
│     cancelar, reordenar, repetir · progresso/velocidade/ETA · entrega     │
│     atômica (workDir → rename) · grava HistoryStore                       │
│                                                                           │
│  NormalizerService (fluxo em 2 fases já existente: análise → ganho → export)│
│  Stores: SettingsStore · PresetStore · HistoryStore (JSON em userData)    │
│  ffmpeg/runner (spawn, -progress, kill/suspend) · locator · logger        │
└───────────────────────────────────────────────────────────────────────────┘
                ▲
┌───────────────┴──────────── Core (puro, testável, compartilhado) ─────────┐
│ commands/audioConvert · videoConvert · audioEdit · videoEdit · loop       │
│ estimates (tamanho/tempo) · queueMath (velocidade/ETA) · time (hh:mm:ss)  │
│ gain · parsers (+ MediaInfo) · ffmpegArgs · pool · stats · settings       │
└───────────────────────────────────────────────────────────────────────────┘
```

## 2. Modelo de execução

```ts
interface JobStep { args: string[]; durationSec: number; cwd?: string; label: string }
interface JobPlan {
  module: OperationModule;        // 'audio-convert' | 'video-convert' | 'audio-edit' | 'video-edit'
  title: string;  inputs: string[];
  workDir: string;                // pasta privada (dentro da pasta de saída → rename atômico)
  steps: JobStep[];               // executados em sequência (ex.: loop = 1) unidade 2) repetição)
  deliver: { from: string; to: string }[];   // arquivos finais
  deliverDir?: { from: string; to: string }; // dividir: move todos os pedaços
}
```

- Builders em `core/commands` recebem `MediaInfo` + opções e devolvem passos, arquivos auxiliares
  (`prepare`: copiar legenda/imagem/fonte, escrever texto) e avisos. São puros, então dá para testar
  sem FFmpeg e reaproveitar na prévia do comando exibida na interface.
- Caminhos dentro de filtros (`subtitles`, `drawtext`) usam **nomes relativos no `workDir`**, com
  `cwd = workDir`. Isso elimina os problemas de escape de `C:\…` em filtergraphs.
- **Nunca sobrescreve**: o nome final é reservado na fila e conferido no disco. Se já existir,
  vira `nome (1).ext`. Falha ou cancelamento apagam o `workDir`, então nada fica pela metade.

## 3. Fila (`BatchProcessingService`)

| Ação | Comportamento |
| --- | --- |
| Adicionar | `enqueue(plans)` → jobs `queued`. Inicia automaticamente, salvo se a fila estiver pausada |
| Pausar | macOS/Linux: `SIGSTOP` nos FFmpeg em execução (pausa real). Windows: não existe suspensão via Node, então os jobs em execução são interrompidos e voltam ao topo da fila, reiniciando ao continuar |
| Continuar | `SIGCONT` / retoma o agendamento |
| Cancelar | um job (mata o processo) ou todos |
| Reordenar | mover para cima/baixo/topo/fim (somente jobs na fila) |
| Repetir | jobs com erro ou cancelados voltam para a fila (o plano fica guardado) |
| Indicadores | progresso por job e geral (ponderado pela duração), velocidade (× tempo real), ETA por job e da fila |

Snapshots são enviados ao renderer a cada 150 ms (no máximo). Ao terminar, cada job vira uma
entrada no **histórico** (persistido, últimos 500).

## 4. Módulos

| Módulo | Entrada | Saída | Destaques |
| --- | --- | --- | --- |
| Normalizador | áudio | 1:1 | inalterado (LUFS/RG/Pico/RMS); grava no histórico |
| Conversor de Áudio | áudio (lote) | 1:1 | MP3/WAV/FLAC/AAC/M4A/OGG/OPUS/WMA, codec, bitrate, 44.1/48/96 kHz, canais, metadados, estimativa de tamanho |
| Conversor de Vídeo | vídeo (lote) | 1:1 | MP4/MKV/AVI/MOV/WEBM/MPEG/FLV, H264/H265/AV1/VP9 (validado por contêiner), resolução, qualidade (CRF), FPS, áudio; tamanho original/estimado, tempo estimado, comando FFmpeg |
| Editor de Áudio | áudio | 1:1 ou N:1 | juntar (com crossfade), dividir, cortar, remover silêncio, fade in, fade out, volume, velocidade (com ou sem preservar o tom), mono/estéreo, Loop/Estender |
| Editor de Vídeo | vídeo | 1:1, N:1, 1:N | juntar, cortar, dividir, remover trechos, redimensionar, rotacionar, espelhar, extrair/substituir áudio, legenda (gravada ou faixa), marca d'água (imagem/texto), GIF, Loop/Estender |
| Ferramentas em Lote | qualquer | — | fila (pausar/continuar/cancelar/reordenar), histórico, aplicar um preset a centenas de arquivos |
| Configurações | — | — | tema, pastas padrão, paralelismo, caminhos do FFmpeg, presets, logs, Sobre/créditos |

### Loop / Estender

`n` repetições ou duração-alvo `T` para um clipe de duração `d`:

- **Sem transição:** `-stream_loop` + cópia de streams, repetições inteiras (`n = ⌈T/d⌉`).
- **Corte exato:** igual ao anterior, cortado exatamente em `T`.
- **Fade entre loops:** passo 1 gera a unidade com fade in/out; passo 2 a repete por cópia e corta em `T`.
- **Crossfade:** passo 1 gera uma **unidade de loop contínua**: o corpo `[t, d−t]` mais o crossfade da
  cauda `[d−t, d]` com a cabeça `[0, t]`, com duração `d − t`. O passo 2 repete essa unidade por
  cópia, então o custo não cresce com o número de repetições (10 min a partir de 3 s continua rápido).

## 5. Presets

`Preset { id, name, module: 'audio-convert' | 'video-convert', options, builtin }`.
Presets embutidos: YouTube 1080p, YouTube Shorts, TikTok, Instagram Reels, WhatsApp, Telegram,
Podcast MP3 128 kbps, Podcast MP3 320 kbps e FLAC Lossless. Presets do usuário são criados a partir
das opções atuais ("Salvar como preset") e persistidos em `presets.json`. Podem ser aplicados no
módulo ou em lote, em Ferramentas em Lote.

## 6. IPC (novos canais)

`media:scan`, `media:probe`, `ops:preview`, `ops:enqueue`, `queue:get|pause|resume|cancel|cancelAll|move|retry|remove|clearFinished`,
`queue:event`, `presets:list|save|delete`, `history:list|clear`, `dialog:pick-media|pick-file|pick-dir`.

`OperationRequest` é uma união discriminada por `module`. A prévia (`ops:preview`) e o enfileiramento
(`ops:enqueue`) passam pelo mesmo serviço, então o comando mostrado é o comando executado.

## 7. Estrutura de pastas (novos itens)

```
src/shared/media.ts            tipos/constantes de formatos, codecs, ferramentas, operações
src/shared/presets.ts          presets embutidos
src/core/time.ts               parse/format de tempo
src/core/estimates.ts          tamanho e tempo estimados
src/core/queueMath.ts          velocidade, ETA, progresso agregado
src/core/commands/             common · audioConvert · videoConvert · audioEdit · videoEdit · loop
src/main/media/probe.ts        ffprobe → MediaInfo (cache por caminho+mtime)
src/main/services/             AudioConverterService · VideoConverterService · AudioEditorService
                               VideoEditorService · NormalizerService · BatchProcessingService · planning
src/main/stores/               jsonStore · presetStore · historyStore
src/main/ipc/                  normalizer · media · queue
src/renderer/src/shell/        Sidebar · QueueBar · ModuleHeader
src/renderer/src/modules/      normalizer · audioConverter · videoConverter · audioEditor
                               videoEditor · batch · settings
src/renderer/src/components/media/  MediaFileList · PresetBar · CommandPreview · OutputDirField · ToolPicker
```

## 8. Decisões e limites

- Paralelismo da fila padrão = 2, porque os encoders de vídeo já usam várias threads cada.
- AV1 usa `libaom-av1 -cpu-used 6 -row-mt 1`: qualidade boa, mas lento. A estimativa de tempo já leva isso em conta.
- MPEG força MPEG-2 + MP2 (o contêiner não aceita os outros codecs). WEBM aceita só VP9/AV1 + Opus/Vorbis.
  Codecs incompatíveis ficam desabilitados na interface e são corrigidos com aviso.
- Tamanho e tempo estimados são heurísticos (bits por pixel × qualidade, velocidade de referência por
  codec × núcleos). A interface os rotula como estimativas.
