import express from 'express';
import type { Router } from 'express';
import AsyncHandler from '../../../utils/AsyncHandler.ts';
import { validateRequest } from '../../../middlewares/ValidateMiddleware.ts';
import { requireAuthenticatedUser } from '../../auth/middleware/AuthMiddleware.ts';
import MyNotificationController from '../controller/MyNotificationController.ts';
import NotificationValidation from '../validation/NotificationValidation.ts';

// Inbox for every signed-in role (SRS: "Thông báo – Xem của mình").
export default class MyNotificationRoute {
  static register(router: Router): void {
    const inboxRouter = express.Router();
    inboxRouter.use(AsyncHandler.wrap(requireAuthenticatedUser));
    inboxRouter.get('/', validateRequest(NotificationValidation.myListSchema), AsyncHandler.wrap(MyNotificationController.list));
    inboxRouter.get('/unread-count', validateRequest(NotificationValidation.emptySchema), AsyncHandler.wrap(MyNotificationController.countUnread));
    inboxRouter.patch('/read-all', validateRequest(NotificationValidation.emptySchema), AsyncHandler.wrap(MyNotificationController.markAllRead));
    inboxRouter.patch('/:id/read', validateRequest(NotificationValidation.idSchema), AsyncHandler.wrap(MyNotificationController.markRead));
    router.use('/me/notifications', inboxRouter);
  }
}
