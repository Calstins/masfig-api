import type { Role } from '../generated/prisma/enums.js'

export type Permission =
  | 'content:write' // create/edit/publish products, categories, FAQs, posts
  | 'content:delete'
  | 'media:upload'
  | 'media:delete-own'
  | 'media:delete-any'
  | 'sections:write' // hero/settings/footer/etc and theme
  | 'enquiries:manage'
  | 'users:manage'
  | 'rebuild:trigger'
  | 'audit:read'

const EDITOR: Permission[] = ['content:write', 'media:upload', 'media:delete-own', 'enquiries:manage']
const ADMIN: Permission[] = [
  ...EDITOR,
  'content:delete',
  'media:delete-any',
  'sections:write',
  'users:manage',
  'rebuild:trigger',
  'audit:read',
]

const TABLE: Record<Role, ReadonlySet<Permission>> = {
  ADMIN: new Set(ADMIN),
  EDITOR: new Set(EDITOR),
}

export const can = (role: Role, permission: Permission) => TABLE[role].has(permission)
