import EnvConfig from '../../../config/EnvConfig.ts';
import AudioConstant from '../../audio/constant/AudioConstant.ts';

interface JobIds { evaluationId: string; messageId: string; attempt: number; }

// Builds the Rhythm job shared by full submissions and segment practice
export default class EvaluationJobBuilderService {
  constructor(
    private readonly createReadUrl: (storageKey: string) => string | Promise<string>,
    private readonly now: () => Date
  ) {}

  async build(sheet: Practice.SheetTemplate, ids: JobIds, studentUrl: string, callbackPath: string): Promise<Audio.Job> {
    return {
      evaluationId: ids.evaluationId, messageId: ids.messageId, attempt: ids.attempt,
      templateUrl: await this.createReadUrl(sheet.referenceAudio?.storageKey ?? ''),
      studentUrl, instrumentId: AudioConstant.rhythmInstruments[sheet.instrument.code] ?? sheet.instrument.code,
      requestedAt: this.now().toISOString(), callbackUrl: `${EnvConfig.fileStoragePublicBaseUrl}${callbackPath}`,
      // Lets Rhythm reuse the stored teacher analysis instead of analysing the reference audio again
      ...(sheet.analysisStatus === 'READY' && sheet.analysisJobId ? { templateAnalysisId: sheet.analysisJobId } : {})
    };
  }
}
