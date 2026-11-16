export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
    public extra?: Record<string, unknown>,
  ) {
    super(message)
  }
}

export const badRequest = (m: string, extra?: Record<string, unknown>) => new HttpError(400, m, extra)
export const unauthorized = (m = 'Unauthenticated') => new HttpError(401, m)
export const forbidden = (m = 'Forbidden', extra?: Record<string, unknown>) => new HttpError(403, m, extra)
export const notFound = (m = 'Not found') => new HttpError(404, m)
export const conflict = (m: string, extra?: Record<string, unknown>) => new HttpError(409, m, extra)
export const unprocessable = (m: string, extra?: Record<string, unknown>) => new HttpError(422, m, extra)
