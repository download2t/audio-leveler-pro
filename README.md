# Audio Leveler Pro — Suíte Multimídia

Aplicativo desktop multiplataforma (Windows, macOS e Linux) para **normalizar, converter e editar
áudio e vídeo em lote**. Todas as operações passam por uma única **fila de processamento** com
pausa, cancelamento, reordenação, velocidade e tempo restante, e cada execução fica registrada no
**histórico**.

Feito com **Electron + React + TypeScript (strict)** e **FFmpeg/FFprobe**, que já vêm embutidos.

**Desenvolvido por Matheus D. Barros.**

---

## Módulos

| Módulo | O que faz |
| --- | --- |
| **Normalizador de Áudio** | Nivela o volume de centenas de músicas por **LUFS** (−23/−18/−16/−14/−12/personalizado), **ReplayGain** (Track/Album), **Pico** ou **RMS**, com proteção de true peak, prévia do ganho ao vivo, metadados e capa preservados e relatório final |
| **Conversor de Áudio** | MP3, WAV, FLAC, AAC, M4A, OGG, OPUS e WMA; codec, bitrate, frequência (44,1/48/96 kHz), canais, metadados; estimativa de tamanho e prévia do comando |
| **Conversor de Vídeo** | MP4, MKV, AVI, MOV, WEBM, MPEG e FLV; H.264, H.265, AV1 e VP9 (validados por contêiner); resolução (original, 4K, 1440p, 1080p, 720p, 480p, personalizada); qualidade; FPS; áudio (codec, bitrate, canais); mostra tamanho original, tamanho e tempo estimados e o comando FFmpeg |
| **Editor de Áudio** | Juntar (com crossfade), dividir (duração, partes ou pontos), cortar, remover silêncio, fade in, fade out, volume, velocidade (com ou sem manter o tom), mono/estéreo e **Loop / Estender**, sempre em lote |
| **Editor de Vídeo** | Juntar, cortar (rápido ou preciso), dividir, remover trechos, redimensionar, rotacionar, espelhar, extrair áudio, substituir áudio, legenda (gravada ou como faixa), marca d'água (imagem ou texto), gerar GIF e **Loop / Estender** |
| **Ferramentas em Lote** | **Fila** (pausar, continuar, cancelar, reordenar, repetir; progresso individual e geral, velocidade, ETA), **Histórico** e **Lote com preset** (aplicar um preset a centenas de arquivos de áudio e vídeo misturados) |
| **Configurações** | Tema claro/escuro/sistema, tarefas simultâneas, pastas padrão, caminhos do FFmpeg, presets salvos, logs e Sobre (créditos) |

### Loop / Estender

Repete um vídeo ou áudio **N vezes** ou **até a duração desejada**. Exemplo: um vídeo de 30 s com
meta de 10 min é repetido automaticamente até 10:00. Transições disponíveis:

- **Corte exato:** repetições sem transição, cortadas exatamente na duração-alvo.
- **Crossfade:** o fim de cada repetição se mistura ao início da próxima (loop contínuo).
- **Fade:** cada repetição tem fade in e fade out.
- **Nenhuma:** repete o arquivo inteiro, sem cortar.

O app gera uma "unidade de loop" uma única vez e a repete por cópia de stream, então estender para
horas leva segundos em vez de recodificar tudo.

### Presets

Prontos: **YouTube 1080p, YouTube Shorts, TikTok, Instagram Reels, WhatsApp, Telegram, Podcast MP3
128 kbps, Podcast MP3 320 kbps, FLAC Lossless**. Nos conversores, "Salvar" cria um preset com as
opções atuais. Os presets ficam em `presets.json` e podem ser aplicados em lote em
Ferramentas em Lote → Lote com preset.

### Segurança dos arquivos

- Os originais **nunca** são sobrescritos (a única exceção é a opção explícita do Normalizador, que
  pede confirmação dupla).
- Cada tarefa trabalha em uma pasta temporária e só move os arquivos prontos para a saída. Se houver
  erro ou cancelamento, nada fica pela metade.
- Nomes repetidos viram `nome (1).ext`, `nome (2).ext` etc.

---

## Instalação e execução

Pré-requisitos: **Node.js 20+** (testado com Node 24) e npm.

```bash
npm install
```

```bash
npm run dev
```

O `npm install` baixa os binários do FFmpeg/FFprobe para a sua plataforma (`ffmpeg-static` / `ffprobe-static`).

### Scripts

| Comando | Descrição |
| --- | --- |
| `npm run dev` | Modo desenvolvimento com hot reload |
| `npm run build` | Typecheck (main + renderer) e build de produção em `out/` |
| `npm start` | Executa o build de produção |
| `npm test` | Testes unitários e de integração (Vitest) |
| `npm run typecheck` | Verificação de tipos em modo strict |
| `npm run dist` | Gera instalador para a plataforma atual em `dist/` |
| `npm run dist:win` / `dist:mac` / `dist:linux` | Instalador específico (NSIS, DMG, AppImage/deb) |

> O `ffmpeg-static` baixa apenas o binário da plataforma em que o `npm install` rodou. Gere cada
> instalador **na própria plataforma** (ou em CI com uma máquina de cada SO).

**Windows: erro `Cannot create symbolic link` no `winCodeSign`.** O pacote de ferramentas que o
electron-builder baixa contém dois symlinks de macOS, e o Windows só permite criar symlinks com
privilégio de administrador ou com o **Modo de Desenvolvedor** ativado. Você pode ativar o Modo de
Desenvolvedor (Configurações → Sistema → Para desenvolvedores) ou extrair o pacote manualmente,
ignorando esses dois arquivos, que não são usados no build Windows:

```bash
node_modules/7zip-bin/win/x64/7za.exe x -y "$LOCALAPPDATA"/electron-builder/Cache/winCodeSign/*.7z -o"$LOCALAPPDATA/electron-builder/Cache/winCodeSign/winCodeSign-2.6.0"
```

Rode o comando na pasta do projeto (Git Bash), depois de uma tentativa de build que tenha falhado, e então rode `npm run dist:win` de novo.

### Usar outro FFmpeg

A ordem de busca é: caminho configurado em `settings.json` (`ffmpegPath` / `ffprobePath`) →
binário embutido → `ffmpeg`/`ffprobe` do `PATH`. O selo no cabeçalho mostra a versão em uso.
As configurações ficam em:

- Windows: `%APPDATA%/Audio Leveler Pro/settings.json`
- macOS: `~/Library/Application Support/Audio Leveler Pro/settings.json`
- Linux: `~/.config/Audio Leveler Pro/settings.json`

---

## Como usar

### Conversores e editores

1. Escolha o módulo no menu lateral e arraste arquivos ou pastas para a janela.
2. Ajuste as opções (ou escolha um preset). A prévia mostra quantas tarefas serão criadas, o tamanho
   estimado, o tempo estimado, avisos de compatibilidade e o comando FFmpeg exato.
3. Clique em **Adicionar à fila**. A barra inferior mostra o progresso em qualquer módulo, e
   **Ferramentas em Lote** permite pausar, cancelar, reordenar e repetir tarefas.
4. Ao terminar, use o ícone ↗ na fila ou no histórico para abrir o arquivo gerado.

### Normalizador

1. Arraste arquivos ou pastas para a janela (ou use **Arquivos** / **Pasta**).
2. Escolha o modo no painel esquerdo, por exemplo **LUFS → −14 (Spotify/YouTube)**.
3. Confira a **pasta de saída** (padrão: `Músicas/Audio Leveler Pro`).
4. Opcional: clique em **Analisar** para medir tudo antes. A tabela passa a mostrar o volume atual,
   o volume final previsto e o ganho, que se atualizam na hora quando você muda o alvo.
5. Clique em **Normalizar**. Se houver arquivos selecionados, só eles são processados.
6. Ao final aparece o relatório, com opções para abrir a pasta de saída e salvar em CSV.

### Qual modo escolher?

- **LUFS (recomendado):** mede a loudness percebida (EBU R128 / ITU-R BS.1770). É o padrão das
  plataformas de streaming. Use **−14** para música em geral, **−16** para podcasts e **−23** para broadcast.
- **ReplayGain:** mesma medição, com referência de −18 LUFS (ReplayGain 2.0). O **Album Gain**
  aplica um único ganho a todas as faixas do álbum, preservando a dinâmica entre elas. Os álbuns
  são agrupados pela tag `album` + `album_artist` (ou pela pasta).
- **Pico:** leva o maior pico de cada faixa ao alvo (ex.: −1 dBFS). Não iguala a percepção de volume.
- **RMS:** iguala a energia média. É mais simples que LUFS e não considera a curva de audição.

### Proteção de pico

Aumentar o volume pode levar os picos acima de 0 dBFS. Nos modos LUFS, ReplayGain e RMS:

- **Limitador** (padrão): aplica o ganho completo e um `alimiter` com teto no valor configurado.
  Na tabela aparece o selo **LIM**.
- **Reduzir ganho:** limita o ganho para que o true peak fique abaixo do teto. Não há limitador,
  mas a faixa pode ficar abaixo do alvo.
- **Nenhuma:** aplica o ganho puro. Se houver risco, a tabela mostra o selo **CLIP**.

O **ganho máximo** (padrão +20 dB) evita amplificar ruído de faixas quase silenciosas (selo **MAX**).

---

## Arquitetura

A arquitetura completa, com diagramas, modelo de execução e decisões, está em
**[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)**. Em resumo:

```
Renderer (React) ── window.api ──► Main
  Sidebar · módulos · barra da fila      ipc → AudioConverterService · VideoConverterService
                                               AudioEditorService · VideoEditorService
                                               NormalizerService
                                                   │  core/commands (builders puros) → JobPlan
                                                   ▼
                                         BatchProcessingService (fila única) → FFmpeg
                                         PresetStore · HistoryStore · SettingsStore
```

- **`src/core/`** concentra a lógica pura e testável: builders de comandos FFmpeg para cada operação,
  estimativas de tamanho e tempo, cálculo de ganho e progresso/ETA da fila. O mesmo código gera a
  prévia exibida na tela e o comando executado.
- **Serviços** (`src/main/services/`): cada módulo tem sua classe, que faz o probe dos arquivos,
  monta os `JobPlan`s e os envia para a fila.
- **`BatchProcessingService`**: concorrência configurável, pausar/continuar (macOS/Linux suspendem o
  processo; no Windows a tarefa em andamento volta para a fila e reinicia), cancelar, reordenar,
  repetir, entrega atômica e histórico.
- **Segurança do Electron:** `contextIsolation`, `sandbox`, CSP restritiva, IPC validado.

### Estrutura de pastas

```
src/
├── shared/      tipos, defaults, presets embutidos, contrato IPC
├── core/        lógica pura (+ __tests__)
│   └── commands/   audioConvert · videoConvert · audioEdit · videoEdit · loop · common
├── main/
│   ├── services/   AudioConverterService · VideoConverterService · AudioEditorService
│   │               VideoEditorService · NormalizerService · BatchProcessingService
│   ├── stores/     presetStore · historyStore · jsonStore
│   ├── media/      probe (FFprobe → MediaInfo com cache)
│   ├── ffmpeg/     runner (spawn, progresso, cancelamento) · locator
│   └── ipc.ts · ipcMedia.ts · index.ts
├── preload/     contextBridge → window.api
└── renderer/src/
    ├── shell/      Sidebar · QueueBar · ModuleLayout
    ├── modules/    normalizer · audioConverter · videoConverter · audioEditor
    │               videoEditor · batch · settings
    ├── components/ media/ (lista, presets, prévia, campos) · ui/ · normalizador
    └── hooks/      useMediaFiles · useOperation · useQueue · usePresets · useSettings…
```

### Dependências

| Pacote | Uso |
| --- | --- |
| `ffmpeg-static`, `ffprobe-static` | Binários embutidos (únicas dependências de runtime) |
| `electron`, `electron-vite`, `vite`, `@vitejs/plugin-react` | Shell desktop e build |
| `react`, `react-dom`, `typescript` | Interface e tipagem strict |
| `vitest` | Testes |
| `electron-builder` | Instaladores (NSIS, DMG, AppImage, deb) |

---

## Testes

```bash
npm test
```

- **Unitários:** builders de todos os comandos (conversões, cada ferramenta dos editores, Loop/Estender),
  validação de codecs por contêiner, estimativas, tempo, cálculo da fila/ETA, cálculo de ganho,
  parsers do FFmpeg, fila (concorrência, ordem, cancelamento, falha + repetição, pausa no Windows),
  caminhos de saída, scanner, reducer e filtros da interface.
- **Integração com o FFmpeg real** (pulados se os binários não estiverem disponíveis): converte para os
  8 formatos de áudio e os 7 de vídeo, executa **todas** as ferramentas dos editores e o Loop/Estender
  com cada transição, conferindo duração, resolução, codecs e metadados das saídas. Também cobre o
  pipeline completo do normalizador.

---

## Limitações conhecidas

- **Pausa no Windows:** o Windows não permite suspender um processo pelo Node, então tarefas que estavam
  rodando reiniciam do começo ao continuar (no macOS e no Linux a pausa é real).
- **Estimativas** de tamanho e tempo são heurísticas: dependem do conteúdo do vídeo e da máquina.
- **AV1** (libaom) produz arquivos pequenos, mas é bem mais lento que H.264/H.265.
- **Marca d'água em texto** usa uma fonte do sistema (Arial no Windows/macOS, DejaVu no Linux).

- **Capa:** é mantida em MP3, FLAC e M4A. WAV, AAC (ADTS) e OGG não suportam capa como stream de
  imagem no FFmpeg, então ela é descartada nesses formatos.
- **AAC bruto (.aac):** o contêiner ADTS não guarda metadados.
- **Album Gain:** a loudness do álbum é a média energética das faixas ponderada pela duração. É
  equivalente a medir o álbum concatenado, a menos de pequenas diferenças de gating.
- **Formatos com perda** (MP3/AAC/OGG) são recodificados ao aplicar o ganho. Use o bitrate original
  ou um maior para evitar perda perceptível. Formatos sem perda mantêm a qualidade integral.
- O **volume final** exibido é uma estimativa calculada a partir da análise. Para conferir, basta
  importar os arquivos gerados e clicar em **Analisar**.

## Créditos

Desenvolvido por **Matheus D. Barros**.

O processamento de áudio e vídeo usa o [FFmpeg](https://ffmpeg.org), distribuído sob a licença GPL.

## Licença

MIT
