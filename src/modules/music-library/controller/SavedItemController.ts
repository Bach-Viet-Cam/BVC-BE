import type { Request, Response } from 'express';
import MessageConstant from '../../../constants/MessageConstant.ts';
import ApiResponse from '../../../utils/ApiResponse.ts';
import MusicLibraryConstant from '../constant/MusicLibraryConstant.ts';
import SavedItemService from '../service/SavedItemService.ts';

const SUCCESS = MusicLibraryConstant.successMessages;

export default class SavedItemController {
  static async listSaved(request: Request, response: Response): Promise<Response> {
    const query = request.validated!.query as MusicLibrary.SavedQuery;
    return ApiResponse.sendSuccessResponse(response, { data: await SavedItemService.listSaved(request.auth!.user.userId, query) });
  }

  static async savePiece(request: Request, response: Response): Promise<Response> {
    const { id } = request.validated!.params as { id: string };
    await SavedItemService.savePiece(request.auth!.user.userId, id);
    return ApiResponse.sendSuccessResponse(response, {
      data: { isSaved: true },
      message: MessageConstant.format('MSG-01', SUCCESS.PIECE_SAVED)
    });
  }

  static async unsavePiece(request: Request, response: Response): Promise<Response> {
    const { id } = request.validated!.params as { id: string };
    await SavedItemService.unsave(request.auth!.user.userId, 'PIECE', id);
    return ApiResponse.sendSuccessResponse(response, {
      data: { isSaved: false },
      message: MessageConstant.format('MSG-01', SUCCESS.PIECE_UNSAVED)
    });
  }

  static async saveSheetMusic(request: Request, response: Response): Promise<Response> {
    const { id } = request.validated!.params as { id: string };
    await SavedItemService.saveSheetMusic(request.auth!.user.userId, id);
    return ApiResponse.sendSuccessResponse(response, {
      data: { isSaved: true },
      message: MessageConstant.format('MSG-01', SUCCESS.SHEET_SAVED)
    });
  }

  static async unsaveSheetMusic(request: Request, response: Response): Promise<Response> {
    const { id } = request.validated!.params as { id: string };
    await SavedItemService.unsave(request.auth!.user.userId, 'SHEET_MUSIC', id);
    return ApiResponse.sendSuccessResponse(response, {
      data: { isSaved: false },
      message: MessageConstant.format('MSG-01', SUCCESS.SHEET_UNSAVED)
    });
  }
}
