import type { Request, Response } from 'express';
import MessageConstant from '../../../constants/MessageConstant.ts';
import ApiResponse from '../../../utils/ApiResponse.ts';
import MusicLibraryConstant from '../constant/MusicLibraryConstant.ts';
import SheetMusicService from '../service/SheetMusicService.ts';

const SUCCESS = MusicLibraryConstant.successMessages;

export default class LecturerSheetMusicController {
  static async listForPiece(request: Request, response: Response): Promise<Response> {
    const { id } = request.validated!.params as { id: string };
    return ApiResponse.sendSuccessResponse(response, { data: await SheetMusicService.listForPiece(request.auth!.user.userId, id) });
  }

  static async getSheetMusic(request: Request, response: Response): Promise<Response> {
    const { id } = request.validated!.params as { id: string };
    return ApiResponse.sendSuccessResponse(response, { data: await SheetMusicService.getSheetMusic(request.auth!.user.userId, id) });
  }

  static async createSheetMusic(request: Request, response: Response): Promise<Response> {
    const { id } = request.validated!.params as { id: string };
    const sheetMusicInput = request.validated!.body as MusicLibrary.SheetMusicCreateInput;
    return ApiResponse.sendSuccessResponse(response, {
      statusCode: 201,
      data: await SheetMusicService.createSheetMusic(request.auth!.user.userId, id, sheetMusicInput),
      message: MessageConstant.format('MSG-01', SUCCESS.SHEET_CREATED)
    });
  }

  static async updateSheetMusic(request: Request, response: Response): Promise<Response> {
    const { id } = request.validated!.params as { id: string };
    const sheetMusicInput = request.validated!.body as MusicLibrary.SheetMusicUpdateInput;
    return ApiResponse.sendSuccessResponse(response, {
      data: await SheetMusicService.updateSheetMusic(request.auth!.user.userId, id, sheetMusicInput),
      message: MessageConstant.format('MSG-01', SUCCESS.SHEET_UPDATED)
    });
  }

  static async replaceFile(request: Request, response: Response): Promise<Response> {
    const { id, slot } = request.validated!.params as { id: string; slot: MusicLibrary.SheetSlot };
    const { fileId } = request.validated!.body as { fileId: string };
    return ApiResponse.sendSuccessResponse(response, {
      data: await SheetMusicService.replaceFile(request.auth!.user.userId, id, slot, fileId),
      message: MessageConstant.format('MSG-01', SUCCESS.FILE_REPLACED)
    });
  }

  static async setVisibility(request: Request, response: Response): Promise<Response> {
    const { id } = request.validated!.params as { id: string };
    const { visibility } = request.validated!.body as { visibility: MusicLibrary.Visibility };
    return ApiResponse.sendSuccessResponse(response, {
      data: await SheetMusicService.setVisibility(request.auth!.user.userId, id, visibility),
      message: MessageConstant.format('MSG-01', visibility === 'PUBLIC' ? SUCCESS.SHEET_SHOWN : SUCCESS.SHEET_HIDDEN)
    });
  }
}
