import express from 'express';
import type { Router } from 'express';
import EnvConfig from '../../../config/EnvConfig.ts';
import { validateRequest } from '../../../middlewares/ValidateMiddleware.ts';
import AsyncHandler from '../../../utils/AsyncHandler.ts';
import { attachOptionalUser, requireAuthenticatedUser, requireRoles } from '../../auth/middleware/AuthMiddleware.ts';
import MusicLibraryConstant from '../constant/MusicLibraryConstant.ts';
import AnalysisController from '../controller/AnalysisController.ts';
import LecturerPieceController from '../controller/LecturerPieceController.ts';
import LecturerSheetMusicController from '../controller/LecturerSheetMusicController.ts';
import LibraryController from '../controller/LibraryController.ts';
import SavedItemController from '../controller/SavedItemController.ts';
import UploadController from '../controller/UploadController.ts';
import { requireCallbackSecret } from '../middleware/InternalCallbackMiddleware.ts';
import MusicLibraryValidation from '../validation/MusicLibraryValidation.ts';

const ROLES = MusicLibraryConstant.roles;
const wrap = AsyncHandler.wrap;

export default class MusicLibraryRoute {
  static register(router: Router): void {
    router.use('/lecturer', MusicLibraryRoute.createLecturerRouter());
    router.use('/uploads', MusicLibraryRoute.createUploadRouter());
    router.use('/library', MusicLibraryRoute.createLibraryRouter());
    router.use('/me/saved', MusicLibraryRoute.createSavedRouter());
    router.use('/internal', MusicLibraryRoute.createInternalRouter());
  }

  static createLecturerRouter(): Router {
    const lecturerRouter = express.Router();
    const lecturerOnly = [wrap(requireAuthenticatedUser), requireRoles(ROLES.LECTURER)];
    const validation = MusicLibraryValidation;
    const pieces = LecturerPieceController;
    const sheets = LecturerSheetMusicController;

    lecturerRouter.get('/pieces', validateRequest(validation.lecturerPieceListSchema), ...lecturerOnly, wrap(pieces.listPieces));
    lecturerRouter.post('/pieces', validateRequest(validation.createPieceSchema), ...lecturerOnly, wrap(pieces.createPiece));
    lecturerRouter.get('/pieces/:id', validateRequest(validation.pieceIdSchema), ...lecturerOnly, wrap(pieces.getPiece));
    lecturerRouter.put('/pieces/:id', validateRequest(validation.updatePieceSchema), ...lecturerOnly, wrap(pieces.updatePiece));
    lecturerRouter.patch('/pieces/:id/visibility', validateRequest(validation.visibilitySchema), ...lecturerOnly, wrap(pieces.setVisibility));
    lecturerRouter.put('/pieces/:id/cover', validateRequest(validation.coverSchema), ...lecturerOnly, wrap(pieces.replaceCover));
    lecturerRouter.delete('/pieces/:id/cover', validateRequest(validation.pieceIdSchema), ...lecturerOnly, wrap(pieces.removeCover));

    lecturerRouter.get('/pieces/:id/sheet-music', validateRequest(validation.pieceIdSchema), ...lecturerOnly, wrap(sheets.listForPiece));
    lecturerRouter.post('/pieces/:id/sheet-music', validateRequest(validation.createSheetMusicSchema), ...lecturerOnly, wrap(sheets.createSheetMusic));
    lecturerRouter.get('/sheet-music/:id', validateRequest(validation.idSchema), ...lecturerOnly, wrap(sheets.getSheetMusic));
    lecturerRouter.put('/sheet-music/:id', validateRequest(validation.updateSheetMusicSchema), ...lecturerOnly, wrap(sheets.updateSheetMusic));
    lecturerRouter.put('/sheet-music/:id/files/:slot', validateRequest(validation.sheetMusicFileSchema), ...lecturerOnly, wrap(sheets.replaceFile));
    lecturerRouter.patch('/sheet-music/:id/visibility', validateRequest(validation.visibilitySchema), ...lecturerOnly, wrap(sheets.setVisibility));
    return lecturerRouter;
  }

  static createUploadRouter(): Router {
    const uploadRouter = express.Router();
    const lecturerOnly = [wrap(requireAuthenticatedUser), requireRoles(ROLES.LECTURER)];
    uploadRouter.post('/presign', validateRequest(MusicLibraryValidation.presignSchema), ...lecturerOnly, wrap(UploadController.createPresignedUpload));
    uploadRouter.post('/:id/confirm', validateRequest(MusicLibraryValidation.confirmUploadSchema), ...lecturerOnly, wrap(UploadController.confirmUpload));
    return uploadRouter;
  }

  static createLibraryRouter(): Router {
    const libraryRouter = express.Router();
    const optionalUser = wrap(attachOptionalUser);
    libraryRouter.get('/filters', wrap(LibraryController.getFilters));
    libraryRouter.get('/pieces', validateRequest(MusicLibraryValidation.libraryPieceListSchema), optionalUser, wrap(LibraryController.listPieces));
    libraryRouter.get('/pieces/:id', validateRequest(MusicLibraryValidation.idSchema), optionalUser, wrap(LibraryController.getPiece));
    libraryRouter.get('/sheet-music/:id', validateRequest(MusicLibraryValidation.idSchema), optionalUser, wrap(LibraryController.getSheetMusic));
    return libraryRouter;
  }

  static createSavedRouter(): Router {
    const savedRouter = express.Router();
    const studentOnly = [wrap(requireAuthenticatedUser), requireRoles(ROLES.STUDENT)];
    const idSchema = validateRequest(MusicLibraryValidation.idSchema);
    savedRouter.get('/', validateRequest(MusicLibraryValidation.savedListSchema), ...studentOnly, wrap(SavedItemController.listSaved));
    savedRouter.put('/pieces/:id', idSchema, ...studentOnly, wrap(SavedItemController.savePiece));
    savedRouter.delete('/pieces/:id', idSchema, ...studentOnly, wrap(SavedItemController.unsavePiece));
    savedRouter.put('/sheet-music/:id', idSchema, ...studentOnly, wrap(SavedItemController.saveSheetMusic));
    savedRouter.delete('/sheet-music/:id', idSchema, ...studentOnly, wrap(SavedItemController.unsaveSheetMusic));
    return savedRouter;
  }

  static createInternalRouter(): Router {
    const internalRouter = express.Router();
    internalRouter.post(
      '/sheet-music/:id/analysis',
      validateRequest(MusicLibraryValidation.analysisCallbackSchema),
      requireCallbackSecret,
      wrap(AnalysisController.handleCallback)
    );
    if (EnvConfig.mockAiService) {
      internalRouter.post('/mock-ai/jobs/reference-analysis', wrap(AnalysisController.acceptMockJob));
      internalRouter.delete('/mock-ai/jobs/:jobId', wrap(AnalysisController.cancelMockJob));
    }
    return internalRouter;
  }
}
