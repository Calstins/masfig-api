// Server-side Facebook Page feed. The page access token lives only in the database and is never sent to browsers.
export const GRAPH_VERSION = 'v21.0'
export const FEED_LIMIT = 4
const CACHE_MS = 5 * 60_000

export type FacebookConfig = { pageId: string; pageUrl: string; pageName: string; accessToken: string }

export type FeedPost = {
  id: string
  message: string
  createdTime: string
  permalink: string
  image: string | null
  isVideo: boolean
  /** Facebook's own video player URL, safe to place in an iframe. */
  videoEmbedUrl: string | null
}

type GraphPost = {
  id: string
  message?: string
  created_time?: string
  permalink_url?: string
  full_picture?: string
  status_type?: string
  attachments?: { data?: { media_type?: string; type?: string; url?: string; media?: { image?: { src?: string } } }[] }
}

export type Fetcher = (url: string) => Promise<{ ok: boolean; status: number; json: () => Promise<unknown> }>

export function videoEmbedUrl(permalink: string): string {
  return `https://www.facebook.com/plugins/video.php?href=${encodeURIComponent(permalink)}&show_text=false&width=560`
}

export function mapPost(p: GraphPost, pageUrl: string): FeedPost {
  const att = p.attachments?.data?.[0]
  const isVideo = p.status_type === 'added_video' || att?.media_type === 'video' || /video/.test(att?.type ?? '')
  const permalink = p.permalink_url || att?.url || pageUrl
  return {
    id: p.id,
    message: (p.message ?? '').slice(0, 400),
    createdTime: p.created_time ?? '',
    permalink,
    image: p.full_picture || att?.media?.image?.src || null,
    isVideo,
    videoEmbedUrl: isVideo ? videoEmbedUrl(permalink) : null,
  }
}

const cache = new Map<string, { at: number; posts: FeedPost[] }>()
export const clearFeedCache = () => cache.clear()

/** Returns the latest posts; on a Graph API failure serves the last good copy if there is one. */
export async function fetchLatestPosts(cfg: FacebookConfig, fetcher: Fetcher = fetch as unknown as Fetcher, now = Date.now()): Promise<{ posts: FeedPost[]; stale: boolean }> {
  const key = cfg.pageId
  const hit = cache.get(key)
  if (hit && now - hit.at < CACHE_MS) return { posts: hit.posts, stale: false }
  const fields = 'id,message,created_time,permalink_url,full_picture,status_type,attachments{media_type,type,url,media}'
  const url = `https://graph.facebook.com/${GRAPH_VERSION}/${encodeURIComponent(cfg.pageId)}/published_posts?fields=${encodeURIComponent(fields)}&limit=${FEED_LIMIT}&access_token=${encodeURIComponent(cfg.accessToken)}`
  try {
    const r = await fetcher(url)
    if (!r.ok) throw new Error(`Graph API ${r.status}`)
    const body = (await r.json()) as { data?: GraphPost[] }
    const posts = (body.data ?? []).slice(0, FEED_LIMIT).map((p) => mapPost(p, cfg.pageUrl))
    cache.set(key, { at: now, posts })
    return { posts, stale: false }
  } catch {
    if (hit) return { posts: hit.posts, stale: true }
    return { posts: [], stale: true }
  }
}
