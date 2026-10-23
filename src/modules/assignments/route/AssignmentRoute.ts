import express from 'express';
import type { RequestHandler, Router } from 'express';
import AsyncHandler from '../../../utils/AsyncHandler.ts';
import { validateRequest } from '../../../middlewares/ValidateMiddleware.ts';
import AuthConstant from '../../auth/constant/AuthConstant.ts';
import { requireAuthenticatedUser, requireRoles } from '../../auth/middleware/AuthMiddleware.ts';
import AssignmentController from '../controller/AssignmentController.ts';
import AssignmentValidation from '../validation/AssignmentValidation.ts';

const lecturerOnly: RequestHandler[] = [AsyncHandler.wrap(requireAuthenticatedUser), requireRoles(AuthConstant.roles.TEACHER)];

// Practice assignments managed by the class lecturer (sub-project 3a).
export default class AssignmentRoute {
  static register(router: Router): void {
    const assignmentRouter = express.Router();
    const wrap = AsyncHandler.wrap;

    assignmentRouter.get('/', validateRequest(AssignmentValidation.listSchema), ...lecturerOnly, wrap(AssignmentController.listAssignments));
    // Registered before '/:id' so "sheet-music" is not read as an assignment id.
    assignmentRouter.get('/sheet-music', validateRequest(AssignmentValidation.sheetMusicSchema), ...lecturerOnly, wrap(AssignmentController.listClassSheetMusic));
    assignmentRouter.get('/:id', validateRequest(AssignmentValidation.idSchema), ...lecturerOnly, wrap(AssignmentController.getAssignment));
    assignmentRouter.get(
      '/:id/students/:studentId/submissions',
      validateRequest(AssignmentValidation.studentSubmissionsSchema),
      ...lecturerOnly,
      wrap(AssignmentController.getStudentSubmissions)
    );
    assignmentRouter.post('/', validateRequest(AssignmentValidation.createSchema), ...lecturerOnly, wrap(AssignmentController.createAssignment));
    assignmentRouter.put('/:id', validateRequest(AssignmentValidation.updateSchema), ...lecturerOnly, wrap(AssignmentController.updateAssignment));
    assignmentRouter.delete('/:id', validateRequest(AssignmentValidation.idSchema), ...lecturerOnly, wrap(AssignmentController.deleteAssignment));
    assignmentRouter.post('/:id/publish', validateRequest(AssignmentValidation.idSchema), ...lecturerOnly, wrap(AssignmentController.publishAssignment));
    assignmentRouter.post('/:id/close', validateRequest(AssignmentValidation.idSchema), ...lecturerOnly, wrap(AssignmentController.closeAssignment));
    assignmentRouter.post('/:id/reopen', validateRequest(AssignmentValidation.idSchema), ...lecturerOnly, wrap(AssignmentController.reopenAssignment));

    router.use('/assignments', assignmentRouter);

    const submissionRouter = express.Router();
    submissionRouter.put('/:id/comment', validateRequest(AssignmentValidation.commentSchema), ...lecturerOnly, wrap(AssignmentController.saveComment));
    router.use('/submissions', submissionRouter);
  }
}
