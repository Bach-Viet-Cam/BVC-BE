import { parse } from 'cookie';
import type { Request, Response } from 'express';
import ApiResponse from '../../../utils/ApiResponse.ts';
import AuthConstant from '../constant/AuthConstant.ts';
import AuthService from '../service/AuthService.ts';

export default class AuthController {
  static getRefreshToken(request: Request): string | undefined {
    const cookies = parse(request.headers.cookie || '');
    return cookies[AuthService.getRefreshTokenCookieName()];
  }

  static async googleAuth(request: Request, response: Response): Promise<Response> {
    const requestBody = request.validated?.body ?? request.body;
    const authResult = await AuthService.authenticateWithGoogle(requestBody as Backend.GoogleAuthRequest);
    AuthService.setRefreshTokenCookie(response, authResult.refreshToken);
    return ApiResponse.sendSuccessResponse(response, {
      statusCode: 200,
      data: { accessToken: authResult.accessToken, user: authResult.user },
      message: AuthConstant.messages.GOOGLE_LOGIN_SUCCESS
    });
  }

  static async refresh(request: Request, response: Response): Promise<Response> {
    const authResult = await AuthService.refreshAccessToken(AuthController.getRefreshToken(request));
    AuthService.setRefreshTokenCookie(response, authResult.refreshToken);
    return ApiResponse.sendSuccessResponse(response, {
      data: { accessToken: authResult.accessToken, user: authResult.user }
    });
  }

  static async logout(request: Request, response: Response): Promise<Response> {
    await AuthService.logout(AuthController.getRefreshToken(request));
    AuthService.clearRefreshTokenCookie(response);
    return ApiResponse.sendSuccessResponse(response, {
      data: null,
      message: AuthConstant.messages.LOGOUT_SUCCESS
    });
  }

  static async getMe(request: Request, response: Response): Promise<Response> {
    return ApiResponse.sendSuccessResponse(response, {
      data: (request.auth as { user: Backend.UserDTO }).user
    });
  }
}
