declare namespace Express {
  interface Request {
    auth?: {
      user: Backend.UserDTO;
    };
    validated?: {
      body: unknown;
      params: unknown;
      query: unknown;
    };
  }
}
