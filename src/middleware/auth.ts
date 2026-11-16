import type { NextFunction, Request, RequestHandler, Response } from 'express'
import jwt from 'jsonwebtoken'
import { config } from '../config.js'
import { prisma } from '../db.js'
import type { Role } from '../generated/prisma/enums.js'
import { forbidden, unauthorized } from '../lib/errors.js'
import { can, type Permission } from '../lib/permissions.js'

export interface AuthUser {
  id: number
  name: string
  email: string
  role: Role
  mustChangePassword: boolean
  sessionId: string
}

declare module 'express-serve-static-core' {
  interface Request {
    user?: AuthUser
  }
}

export function signToken(userId: number, sessionId: string): string {
  return jwt.sign({ sub: String(userId) }, config.jwtSecret, {
    algorithm: 'HS256',
    jwtid: sessionId,
    expiresIn: `${config.sessionDays}d`,
  })
}

/** Verifies the bearer token, then re-reads session and user from the database on every request. */
export const authenticate: RequestHandler = async (req, _res, next) => {
  try {
    const header = req.header('authorization') ?? ''
    const token = header.startsWith('Bearer ') ? header.slice(7) : ''
    if (!token) throw unauthorized()
    let payload: jwt.JwtPayload
    try {
      const decoded = jwt.verify(token, config.jwtSecret, { algorithms: ['HS256'] })
      if (typeof decoded === 'string' || !decoded.jti || !decoded.sub) throw new Error('bad payload')
      payload = decoded
    } catch {
      throw unauthorized()
    }
    const session = await prisma.session.findUnique({ where: { id: payload.jti! }, include: { user: true } })
    if (!session || session.revokedAt || session.expiresAt < new Date()) throw unauthorized()
    const u = session.user
    if (!u.active || String(u.id) !== payload.sub) throw unauthorized()
    req.user = {
      id: u.id,
      name: u.name,
      email: u.email,
      role: u.role,
      mustChangePassword: u.mustChangePassword,
      sessionId: session.id,
    }
    next()
  } catch (err) {
    next(err)
  }
}

/** Use after `authenticate`. Blocks accounts that still owe a password change. */
export function requirePermission(permission: Permission): RequestHandler {
  return (req: Request, _res: Response, next: NextFunction) => {
    const u = req.user
    if (!u) return next(unauthorized())
    if (u.mustChangePassword) {
      return next(forbidden('Password change required', { code: 'PASSWORD_CHANGE_REQUIRED' }))
    }
    if (!can(u.role, permission)) return next(forbidden('You do not have permission to do this'))
    next()
  }
}
