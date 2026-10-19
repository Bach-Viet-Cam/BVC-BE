import type { Request, Response } from 'express';
import MessageConstant from '../../../constants/MessageConstant.ts';
import ApiResponse from '../../../utils/ApiResponse.ts';
import MusicLibraryConstant from '../constant/MusicLibraryConstant.ts';
import PieceService from '../service/PieceService.ts';

const SUCCESS = MusicLibraryConstant.successMessages;

export default class LecturerPieceController {
  static async listPieces(request: Request, response: Response): Promise<Response> {
    const query = request.validated!.query as MusicLibrary.LecturerPieceQuery;
    return ApiResponse.sendSuccessResponse(response, { data: await PieceService.listPieces(request.auth!.user.userId, query) });
  }

  static async getPiece(request: Request, response: Response): Promise<Response> {
    const { id } = request.validated!.params as { id: string };
    return ApiResponse.sendSuccessResponse(response, { data: await PieceService.getPiece(request.auth!.user.userId, id) });
  }

  static async createPiece(request: Request, response: Response): Promise<Response> {
    const pieceInput = request.validated!.body as MusicLibrary.PieceInput;
    return ApiResponse.sendSuccessResponse(response, {
      statusCode: 201,
      data: await PieceService.createPiece(request.auth!.user.userId, pieceInput),
      message: MessageConstant.format('MSG-01', SUCCESS.PIECE_CREATED)
    });
  }

  static async updatePiece(request: Request, response: Response): Promise<Response> {
    const { id } = request.validated!.params as { id: string };
    const pieceInput = request.validated!.body as MusicLibrary.PieceInput;
    return ApiResponse.sendSuccessResponse(response, {
      data: await PieceService.updatePiece(request.auth!.user.userId, id, pieceInput),
      message: MessageConstant.format('MSG-01', SUCCESS.PIECE_UPDATED)
    });
  }

  static async setVisibility(request: Request, response: Response): Promise<Response> {
    const { id } = request.validated!.params as { id: string };
    const { visibility } = request.validated!.body as { visibility: MusicLibrary.Visibility };
    return ApiResponse.sendSuccessResponse(response, {
      data: await PieceService.setVisibility(request.auth!.user.userId, id, visibility),
      message: MessageConstant.format('MSG-01', visibility === 'PUBLIC' ? SUCCESS.PIECE_SHOWN : SUCCESS.PIECE_HIDDEN)
    });
  }

  static async replaceCover(request: Request, response: Response): Promise<Response> {
    const { id } = request.validated!.params as { id: string };
    const { fileId } = request.validated!.body as { fileId: string };
    return ApiResponse.sendSuccessResponse(response, {
      data: await PieceService.replaceCover(request.auth!.user.userId, id, fileId),
      message: MessageConstant.format('MSG-01', SUCCESS.COVER_UPDATED)
    });
  }

  static async removeCover(request: Request, response: Response): Promise<Response> {
    const { id } = request.validated!.params as { id: string };
    return ApiResponse.sendSuccessResponse(response, {
      data: await PieceService.removeCover(request.auth!.user.userId, id),
      message: MessageConstant.format('MSG-01', SUCCESS.COVER_REMOVED)
    });
  }
}
