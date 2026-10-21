import type { Request, Response } from 'express';
import ApiResponse from '../../../utils/ApiResponse.ts';
import CatalogService from '../service/CatalogService.ts';
import LibraryService from '../service/LibraryService.ts';

export default class LibraryController {
  static async listPieces(request: Request, response: Response): Promise<Response> {
    const query = request.validated!.query as MusicLibrary.LibraryPieceQuery;
    return ApiResponse.sendSuccessResponse(response, { data: await LibraryService.listPieces(request.auth?.user, query) });
  }

  static async getPiece(request: Request, response: Response): Promise<Response> {
    const { id } = request.validated!.params as { id: string };
    return ApiResponse.sendSuccessResponse(response, { data: await LibraryService.getPieceDetail(request.auth?.user, id) });
  }

  static async getSheetMusic(request: Request, response: Response): Promise<Response> {
    const { id } = request.validated!.params as { id: string };
    return ApiResponse.sendSuccessResponse(response, { data: await LibraryService.getSheetMusicViewer(request.auth?.user, id) });
  }

  static async getFilters(_request: Request, response: Response): Promise<Response> {
    return ApiResponse.sendSuccessResponse(response, { data: await CatalogService.getLibraryFilters() });
  }
}
