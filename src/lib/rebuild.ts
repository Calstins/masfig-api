import { config } from '../config.js'

export type RebuildStatus = 'triggered' | 'not_configured' | 'failed'

/** Ask Cloudflare Pages to rebuild the static site. Never throws. */
export async function triggerRebuild(reason: string): Promise<RebuildStatus> {
  if (!config.deployHookUrl) return 'not_configured'
  try {
    const res = await fetch(config.deployHookUrl, { method: 'POST', signal: AbortSignal.timeout(5000) })
    if (!res.ok) {
      console.error('[rebuild] deploy hook responded', res.status, 'reason:', reason)
      return 'failed'
    }
    return 'triggered'
  } catch (err) {
    console.error('[rebuild] deploy hook error:', (err as Error).message, 'reason:', reason)
    return 'failed'
  }
}
