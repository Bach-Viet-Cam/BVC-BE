import type { Router } from 'express';
import AsyncHandler from '../../../utils/AsyncHandler.ts';
import { validateRequest } from '../../../middlewares/ValidateMiddleware.ts';
import { requireAuthenticatedUser } from '../../auth/middleware/AuthMiddleware.ts';
import FileStorageFactoryService from '../../storage/service/FileStorageFactoryService.ts';
import AudioController from '../controller/AudioController.ts';
import AudioValidation from '../validation/AudioValidation.ts';
import AudioUploadService from '../service/AudioUploadService.ts';
import AudioEvaluationService from '../service/AudioEvaluationService.ts';
import RhythmPublisherService from '../service/RhythmPublisherService.ts';
import { uploadAudio } from '../middleware/AudioUploadMiddleware.ts';

export default class AudioRoute {
  register(router: Router): void {
    const storage = new FileStorageFactoryService().create();
    const controller = new AudioController(new AudioUploadService(storage), new AudioEvaluationService(storage, RhythmPublisherService.instance));
    const validation = new AudioValidation();
    const auth = AsyncHandler.wrap(requireAuthenticatedUser);
    router.post('/audio-uploads', auth, AsyncHandler.wrap(uploadAudio()), AsyncHandler.wrap(controller.upload));
    router.post('/audio-evaluations', auth, validateRequest(validation.createSchema), AsyncHandler.wrap(controller.create));
    router.get('/audio-evaluations/:evaluationId', auth, validateRequest(validation.statusSchema), AsyncHandler.wrap(controller.get));
  }
}
