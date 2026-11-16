import { config } from '../config.js'

interface EnquiryNotice {
  id: number
  kind: string
  name: string
  phone: string
  email?: string | null
  company?: string | null
  message: string
  quantity?: string | null
  productName?: string | null
  pageUrl?: string | null
}

/** Email the sales inbox via Resend when configured. Returns false (and logs) when it cannot send. */
export async function notifyEnquiry(e: EnquiryNotice): Promise<boolean> {
  if (!config.resendApiKey || !config.notifyEmail || !config.mailFrom) return false
  const lines = [
    `New ${e.kind.toLowerCase()} enquiry #${e.id}`,
    `Name: ${e.name}`,
    `Phone: ${e.phone}`,
    e.email ? `Email: ${e.email}` : null,
    e.company ? `Company: ${e.company}` : null,
    e.productName ? `Product: ${e.productName}` : null,
    e.quantity ? `Quantity: ${e.quantity}` : null,
    e.pageUrl ? `Page: ${e.pageUrl}` : null,
    '',
    e.message,
  ].filter((l): l is string => l !== null)
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${config.resendApiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: config.mailFrom,
        to: [config.notifyEmail],
        subject: `New enquiry #${e.id}${e.productName ? ` — ${e.productName}` : ''}`,
        text: lines.join('\n'),
      }),
      signal: AbortSignal.timeout(5000),
    })
    if (!res.ok) {
      console.error('[notify] email provider responded', res.status)
      return false
    }
    return true
  } catch (err) {
    console.error('[notify] email error:', (err as Error).message)
    return false
  }
}
