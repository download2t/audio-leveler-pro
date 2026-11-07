import { formatElapsed, formatGain } from '../../../core/format';
import type { BatchReport } from '../../../shared/types';
import { Button } from './ui/Button';
import { Modal } from './ui/Modal';

export function ReportModal({
  report,
  onClose,
  onOpenOutput,
  onSaveCsv
}: {
  report: BatchReport;
  onClose: () => void;
  onOpenOutput: (dir: string) => void;
  onSaveCsv: () => void;
}) {
  const normalize = report.mode === 'normalize';
  const title = report.cancelled
    ? 'Processamento cancelado'
    : normalize
      ? 'Normalização concluída'
      : 'Análise concluída';

  const cards = [
    { label: normalize ? 'Arquivos processados' : 'Arquivos analisados', value: String(normalize ? report.processed : report.analyzed), tone: 'success' },
    { label: 'Arquivos com erro', value: String(report.failed.length), tone: report.failed.length ? 'danger' : undefined },
    { label: 'Ignorados', value: String(report.skipped.length) },
    { label: 'Tempo total', value: formatElapsed(report.totalTimeMs) },
    ...(normalize ? [{ label: 'Ganho médio aplicado', value: formatGain(report.averageGainDb) }] : [])
  ];

  return (
    <Modal
      title={title}
      onClose={onClose}
      footer={
        <>
          <Button icon="download" onClick={onSaveCsv}>
            Salvar relatório CSV
          </Button>
          {report.outputDir && (
            <Button icon="folderOpen" onClick={() => onOpenOutput(report.outputDir as string)}>
              Abrir pasta de saída
            </Button>
          )}
          <Button variant="primary" onClick={onClose}>
            Fechar
          </Button>
        </>
      }
    >
      <div className="report-cards">
        {cards.map((c) => (
          <div key={c.label} className={`report-card ${c.tone ? `report-${c.tone}` : ''}`}>
            <span className="report-value">{c.value}</span>
            <span className="report-label">{c.label}</span>
          </div>
        ))}
      </div>

      {normalize && (
        <p className="report-line">
          <strong>Pasta de saída:</strong> {report.outputDir ?? 'arquivos originais substituídos'}
        </p>
      )}
      {report.cancelled && (
        <p className="report-line muted">Arquivos que não chegaram a ser processados permanecem pendentes.</p>
      )}

      {report.failed.length > 0 && (
        <div className="report-list">
          <h4>Arquivos com erro</h4>
          <ul>
            {report.failed.map((f) => (
              <li key={f.id}>
                <strong>{f.name}</strong>
                <span>{f.error}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
      {report.skipped.length > 0 && (
        <div className="report-list">
          <h4>Arquivos ignorados</h4>
          <ul>
            {report.skipped.map((f) => (
              <li key={f.id}>
                <strong>{f.name}</strong>
                <span>{f.reason}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Modal>
  );
}
