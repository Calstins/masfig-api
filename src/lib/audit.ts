import type { Prisma } from '../generated/prisma/client.js'
import { prisma } from '../db.js'

export async function audit(
  userId: number | null | undefined,
  action: string,
  entity: string,
  entityId?: string | number | null,
  meta?: Prisma.InputJsonValue,
) {
  try {
    await prisma.auditLog.create({
      data: { userId: userId ?? null, action, entity, entityId: entityId == null ? null : String(entityId), meta },
    })
  } catch (err) {
    // Audit failure must be visible, never silently swallowed, but must not break the request.
    console.error('[audit] failed to write audit log', { action, entity, entityId, err: (err as Error).message })
  }
}
