import { z } from 'zod';
import ZodFieldRule from '../../../utils/ZodFieldRule.ts';
import MusicLibraryConstant from '../constant/MusicLibraryConstant.ts';

const LABELS = MusicLibraryConstant.fieldLabels;
const LIMITS = MusicLibraryConstant.fieldLimits;
const PAGE_SIZES = MusicLibraryConstant.pageSizes;

const emptyObject = z.object({});
const idParams = z.object({ id: z.string().min(1) });
const visibilitySchema = z.enum(['PUBLIC', 'HIDDEN']);
const searchKeyword = z.string().trim().max(LIMITS.SEARCH).optional();
const optionalId = z.string().trim().optional().transform((value) => value || undefined);

// "?genreIds[]=a" arrives as key "genreIds[]" with the default Express query parser
function mergeBracketArrayKeys(rawQuery: unknown): unknown {
  if (!rawQuery || typeof rawQuery !== 'object') return rawQuery;
  const mergedQuery: Record<string, unknown> = { ...(rawQuery as Record<string, unknown>) };
  Object.keys(mergedQuery).filter((key) => key.endsWith('[]')).forEach((bracketKey) => {
    const plainKey = bracketKey.slice(0, -2);
    const bracketValues = ([] as unknown[]).concat(mergedQuery[bracketKey]);
    mergedQuery[plainKey] = ([] as unknown[]).concat(mergedQuery[plainKey] ?? [], bracketValues);
    delete mergedQuery[bracketKey];
  });
  return mergedQuery;
}

const pieceBody = z.object({
  title: ZodFieldRule.requiredText(LABELS.title, LIMITS.PIECE_TITLE),
  composer: ZodFieldRule.optionalText(LABELS.composer, LIMITS.PIECE_COMPOSER),
  description: ZodFieldRule.optionalText(LABELS.description, LIMITS.PIECE_DESCRIPTION),
  genreId: ZodFieldRule.requiredId(LABELS.genreId),
  levelId: ZodFieldRule.requiredId(LABELS.levelId),
  visibility: visibilitySchema.optional(),
  coverFileId: z.string().trim().min(1).nullable().optional()
});

const sheetMusicCreateBody = z.object({
  instrumentId: ZodFieldRule.requiredId(LABELS.instrumentId),
  kind: z.enum(['MAIN', 'LEVEL']).optional(),
  name: ZodFieldRule.requiredText(LABELS.name, LIMITS.SHEET_NAME),
  levelId: ZodFieldRule.requiredId(LABELS.levelId),
  description: ZodFieldRule.optionalText(LABELS.description, LIMITS.SHEET_DESCRIPTION),
  sheetFileId: ZodFieldRule.requiredId(LABELS.sheetFileId),
  referenceAudioId: z.string().trim().min(1).nullable().optional(),
  tutorialVideoId: z.string().trim().min(1).nullable().optional(),
  visibility: visibilitySchema.optional()
});

const sheetMusicUpdateBody = z.object({
  instrumentId: ZodFieldRule.requiredId(LABELS.instrumentId).optional(),
  kind: z.enum(['MAIN', 'LEVEL']).optional(),
  name: ZodFieldRule.requiredText(LABELS.name, LIMITS.SHEET_NAME).optional(),
  levelId: ZodFieldRule.requiredId(LABELS.levelId).optional(),
  description: ZodFieldRule.optionalText(LABELS.description, LIMITS.SHEET_DESCRIPTION),
  visibility: visibilitySchema.optional()
});

export default class MusicLibraryValidation {
  // ----- Uploads -----
  static readonly presignSchema = z.object({
    body: z.object({
      kind: z.enum(['COVER', 'SHEET', 'AUDIO', 'VIDEO']),
      fileName: ZodFieldRule.requiredText(LABELS.fileName, 255),
      mimeType: z.string().trim().min(1).max(255),
      size: z.coerce.number().int().positive()
    }),
    params: emptyObject,
    query: emptyObject
  });

  static readonly confirmUploadSchema = z.object({ body: emptyObject.optional(), params: idParams, query: emptyObject });
  // Body is the raw file stream, read by the controller
  static readonly uploadContentSchema = z.object({ body: z.unknown(), params: idParams, query: emptyObject });

  // ----- Lecturer: pieces -----
  static readonly lecturerPieceListSchema = z.object({
    body: z.unknown(),
    params: emptyObject,
    query: z.object({
      q: searchKeyword,
      genreId: optionalId,
      instrumentId: optionalId,
      levelId: optionalId,
      visibility: z.enum(['ALL', 'PUBLIC', 'HIDDEN', 'ADMIN_HIDDEN']).default('ALL'),
      page: ZodFieldRule.page(),
      pageSize: ZodFieldRule.pageSize(PAGE_SIZES.LECTURER_PIECES, PAGE_SIZES.MAX)
    })
  });

  static readonly pieceIdSchema = z.object({ body: z.unknown(), params: idParams, query: z.unknown() });
  static readonly createPieceSchema = z.object({ body: pieceBody, params: emptyObject, query: emptyObject });
  static readonly updatePieceSchema = z.object({ body: pieceBody, params: idParams, query: emptyObject });
  static readonly visibilitySchema = z.object({
    body: z.object({ visibility: visibilitySchema }),
    params: idParams,
    query: emptyObject
  });
  static readonly coverSchema = z.object({
    body: z.object({ fileId: ZodFieldRule.requiredId(LABELS.fileId) }),
    params: idParams,
    query: emptyObject
  });

  // ----- Lecturer: sheet music -----
  static readonly createSheetMusicSchema = z.object({ body: sheetMusicCreateBody, params: idParams, query: emptyObject });
  static readonly updateSheetMusicSchema = z.object({ body: sheetMusicUpdateBody, params: idParams, query: emptyObject });
  static readonly sheetMusicFileSchema = z.object({
    body: z.object({ fileId: ZodFieldRule.requiredId(LABELS.fileId) }),
    params: z.object({ id: z.string().min(1), slot: z.enum(['sheet', 'audio', 'video']) }),
    query: emptyObject
  });

  // ----- Public library -----
  static readonly libraryPieceListSchema = z.object({
    body: z.unknown(),
    params: emptyObject,
    query: z.preprocess(mergeBracketArrayKeys, z.object({
      q: searchKeyword,
      genreIds: ZodFieldRule.queryIdList(),
      instrumentIds: ZodFieldRule.queryIdList(),
      levelIds: ZodFieldRule.queryIdList(),
      sort: z.enum(['newest', 'title_asc', 'title_desc']).default('newest'),
      page: ZodFieldRule.page(),
      pageSize: ZodFieldRule.pageSize(PAGE_SIZES.LIBRARY_PIECES, PAGE_SIZES.MAX)
    }))
  });

  static readonly idSchema = MusicLibraryValidation.pieceIdSchema;

  // ----- Saved items -----
  static readonly savedListSchema = z.object({
    body: z.unknown(),
    params: emptyObject,
    query: z.object({
      type: z.enum(['PIECE', 'SHEET_MUSIC']).default('PIECE'),
      page: ZodFieldRule.page(),
      pageSize: ZodFieldRule.pageSize(PAGE_SIZES.SAVED_ITEMS, PAGE_SIZES.MAX)
    })
  });

  // ----- AI callback -----
  static readonly analysisCallbackSchema = z.object({
    body: z.object({
      jobId: z.string().min(1).optional(),
      status: z.enum(['READY', 'ERROR']),
      analysisFileUrl: z.string().min(1).max(2000).optional(),
      reason: z.string().max(1000).optional(),
      timeSignatureMissing: z.boolean().optional()
    }).refine((callbackBody) => callbackBody.status !== 'READY' || Boolean(callbackBody.analysisFileUrl), {
      message: 'analysisFileUrl is required when status is READY',
      path: ['analysisFileUrl']
    }),
    params: idParams,
    query: emptyObject
  });
}
