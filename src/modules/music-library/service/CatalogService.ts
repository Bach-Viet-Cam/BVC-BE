import AppError from '../../../utils/AppError.ts';
import MusicLibraryConstant from '../constant/MusicLibraryConstant.ts';
import MusicLibraryDTO from '../dto/MusicLibraryDTO.ts';
import CatalogRepository from '../repository/CatalogRepository.ts';

const MESSAGES = MusicLibraryConstant.messages;
const LABELS = MusicLibraryConstant.fieldLabels;

export default class CatalogService {
  static async readConfigNumber(configKey: string, fallback: number): Promise<number> {
    const [configRow] = await CatalogRepository.findConfigValues([configKey]);
    const parsedValue = Number(configRow?.value);
    return Number.isFinite(parsedValue) && parsedValue > 0 ? parsedValue : fallback;
  }

  static async getFileRules(kind: MusicLibrary.MediaKind): Promise<MusicLibrary.FileRules> {
    const mediaRule = MusicLibraryConstant.mediaRules[kind];
    const maxMb = await CatalogService.readConfigNumber(mediaRule.configKey, mediaRule.defaultMaxMb);
    return {
      extensions: [...mediaRule.extensions],
      formatLabel: mediaRule.formatLabel,
      maxMb,
      maxBytes: Math.floor(maxMb * 1024 * 1024)
    };
  }

  static async getAudioDurationRange(): Promise<{ minSec: number; maxSec: number }> {
    const durationConfig = MusicLibraryConstant.audioDurationConfig;
    const [minSec, maxSec] = await Promise.all([
      CatalogService.readConfigNumber(durationConfig.MIN_KEY, durationConfig.DEFAULT_MIN_SEC),
      CatalogService.readConfigNumber(durationConfig.MAX_KEY, durationConfig.DEFAULT_MAX_SEC)
    ]);
    return { minSec, maxSec };
  }

  static async getLibraryFilters() {
    const [genres, levels, instruments] = await Promise.all([
      CatalogRepository.listActiveCategories('GENRE'),
      CatalogRepository.listActiveCategories('LEVEL'),
      CatalogRepository.listActiveInstruments()
    ]);
    return {
      genres: genres.map(MusicLibraryDTO.toCategoryRef),
      levels: levels.map(MusicLibraryDTO.toCategoryRef),
      instruments: instruments.map(MusicLibraryDTO.toCategoryRef)
    };
  }

  // GBR-44: an inactive category can be kept when it was already attached, but not newly chosen
  static async assertCategory(
    type: 'GENRE' | 'LEVEL',
    categoryId: string,
    field: 'genreId' | 'levelId',
    previousCategoryId?: string
  ): Promise<void> {
    const [category] = await CatalogRepository.findCategoriesByIds(type, [categoryId]);
    if (!category) throw AppError.withMessage(400, 'MSG-35', { field: LABELS[field] }, field);
    if (category.status !== 'ACTIVE' && category.id !== previousCategoryId) {
      throw AppError.withMessage(400, 'MSG-08', MESSAGES.CATEGORY_INACTIVE, field);
    }
  }

  // GBR-44: a sheet keeps its inactive instrument, but an inactive instrument cannot be newly chosen
  static async assertInstrument(instrumentId: string, previousInstrumentId?: string): Promise<void> {
    const [instrument] = await CatalogRepository.findInstrumentsByIds([instrumentId]);
    if (!instrument) throw AppError.withMessage(400, 'MSG-35', { field: LABELS.instrumentId }, 'instrumentId');
    if (!instrument.isActive && instrument.id !== previousInstrumentId) {
      throw AppError.withMessage(400, 'MSG-08', MESSAGES.CATEGORY_INACTIVE, 'instrumentId');
    }
  }
}
