declare namespace Express {
  interface Request {
    auth?: {
      user: unknown;
    };
    validated?: {
      body: unknown;
      params: unknown;
      query: unknown;
    };
  }
}
