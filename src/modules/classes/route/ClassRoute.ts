import express from 'express';
import type { RequestHandler, Router } from 'express';
import AsyncHandler from '../../../utils/AsyncHandler.ts';
import { validateRequest } from '../../../middlewares/ValidateMiddleware.ts';
import AuthConstant from '../../auth/constant/AuthConstant.ts';
import { requireAuthenticatedUser, requireRoles } from '../../auth/middleware/AuthMiddleware.ts';
import ClassController from '../controller/ClassController.ts';
import { receiveImportFile } from '../middleware/ImportUploadMiddleware.ts';
import ClassValidation from '../validation/ClassValidation.ts';

const lecturerOnly: RequestHandler[] = [
  AsyncHandler.wrap(requireAuthenticatedUser),
  requireRoles(AuthConstant.roles.TEACHER)
];

// M03 class management, lecturer-owned classes only (permission matrix SRS §2.1).
export default class ClassRoute {
  static register(router: Router): void {
    const classRouter = express.Router();
    const wrap = AsyncHandler.wrap;

    classRouter.get('/', validateRequest(ClassValidation.listClassesSchema), ...lecturerOnly, wrap(ClassController.listClasses));
    classRouter.post('/', validateRequest(ClassValidation.createClassSchema), ...lecturerOnly, wrap(ClassController.createClass));
    classRouter.get('/semesters', validateRequest(ClassValidation.semestersSchema), ...lecturerOnly, wrap(ClassController.listSemesters));
    classRouter.get('/import-template', validateRequest(ClassValidation.templateSchema), ...lecturerOnly, wrap(ClassController.downloadImportTemplate));
    classRouter.get('/:id', validateRequest(ClassValidation.classIdSchema), ...lecturerOnly, wrap(ClassController.getClass));
    classRouter.patch('/:id', validateRequest(ClassValidation.updateClassSchema), ...lecturerOnly, wrap(ClassController.updateClass));
    classRouter.post('/:id/end', validateRequest(ClassValidation.classIdSchema), ...lecturerOnly, wrap(ClassController.endClass));

    classRouter.get('/:id/members', validateRequest(ClassValidation.listMembersSchema), ...lecturerOnly, wrap(ClassController.listMembers));
    classRouter.get('/:id/members/lookup', validateRequest(ClassValidation.lookupMemberSchema), ...lecturerOnly, wrap(ClassController.lookupMember));
    classRouter.post('/:id/members', validateRequest(ClassValidation.addMemberSchema), ...lecturerOnly, wrap(ClassController.addMember));
    classRouter.delete('/:id/members/:studentId', validateRequest(ClassValidation.memberParamsSchema), ...lecturerOnly, wrap(ClassController.removeMember));

    classRouter.post('/:id/imports', validateRequest(ClassValidation.classIdSchema), ...lecturerOnly, receiveImportFile, wrap(ClassController.previewImport));
    classRouter.post('/:id/imports/:logId/confirm', validateRequest(ClassValidation.importLogParamsSchema), ...lecturerOnly, wrap(ClassController.confirmImport));
    classRouter.post('/:id/imports/:logId/cancel', validateRequest(ClassValidation.importLogParamsSchema), ...lecturerOnly, wrap(ClassController.cancelImport));

    router.use('/classes', classRouter);
  }
}
