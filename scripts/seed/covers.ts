/**
 * Generates branded blog cover illustrations (1600x900 JPEG) with sharp, from simple line-art SVG.
 * No network access and no stock-photo licensing involved. Each cover is deterministic.
 */
import sharp from 'sharp'

const RED = '#a83236'
const INK = '#231f20'

type Motif = (c: string) => string

const stroke = (c: string) => `fill="none" stroke="${c}" stroke-width="7" stroke-linecap="round" stroke-linejoin="round"`

// Each motif draws inside a 400x400 box.
export const MOTIFS: Record<string, Motif> = {
  oven: (c) => `<g ${stroke(c)}><rect x="40" y="70" width="320" height="260" rx="26"/><rect x="80" y="150" width="240" height="140" rx="14"/><circle cx="110" cy="112" r="11"/><circle cx="160" cy="112" r="11"/><circle cx="210" cy="112" r="11"/><path d="M130 250c20-34 40 8 60-26s30 12 70-8"/></g>`,
  mixer: (c) => `<g ${stroke(c)}><path d="M110 110h150c20 0 35 14 35 32v18H110z"/><path d="M295 150v50c0 18-14 32-32 32"/><path d="M185 160v90"/><path d="M185 250c-34 0-62 16-62 40v10h124v-10c0-24-28-40-62-40z"/><path d="M120 330h130"/></g>`,
  fridge: (c) => `<g ${stroke(c)}><rect x="105" y="40" width="190" height="320" rx="22"/><path d="M105 170h190"/><path d="M140 100v30M140 210v60"/><path d="M130 360v16M270 360v16"/></g>`,
  pot: (c) => `<g ${stroke(c)}><path d="M80 170h240v110c0 30-22 52-52 52H132c-30 0-52-22-52-52z"/><path d="M80 200H50M320 200h30"/><path d="M110 170c0-26 20-40 90-40s90 14 90 40"/><path d="M200 130v-20"/><path d="M160 90c-14-18 14-30 0-50M200 90c-14-18 14-30 0-50M240 90c-14-18 14-30 0-50"/></g>`,
  scale: (c) => `<g ${stroke(c)}><rect x="80" y="170" width="240" height="160" rx="26"/><path d="M130 170a70 70 0 0 1 140 0"/><path d="M200 170l30-40"/><path d="M130 260h140"/></g>`,
  slicer: (c) => `<g ${stroke(c)}><circle cx="170" cy="170" r="100"/><circle cx="170" cy="170" r="22"/><path d="M60 330h290l-30-60H110z"/><path d="M270 120l70-30"/></g>`,
  box: (c) => `<g ${stroke(c)}><path d="M200 50l140 70v160l-140 70-140-70V120z"/><path d="M60 120l140 70 140-70"/><path d="M200 190v160"/><path d="M130 85l140 70"/></g>`,
  truck: (c) => `<g ${stroke(c)}><path d="M40 120h190v160H40z"/><path d="M230 170h70l50 50v60h-120"/><circle cx="110" cy="300" r="30"/><circle cx="290" cy="300" r="30"/><path d="M260 170v50h60"/></g>`,
  hat: (c) => `<g ${stroke(c)}><path d="M110 250c-48-6-64-56-34-84 14-14 34-16 50-8 6-40 40-62 74-62s68 22 74 62c16-8 36-6 50 8 30 28 14 78-34 84z"/><path d="M110 250v64h180v-64"/><path d="M110 282h180"/></g>`,
  flame: (c) => `<g ${stroke(c)}><path d="M200 50c24 56 90 86 90 170a90 90 0 0 1-180 0c0-40 22-62 40-84 6 26 22 38 34 38-8-44 0-90 16-124z"/><path d="M200 340c-26 0-44-18-44-44 0-28 28-44 44-76 16 32 44 48 44 76 0 26-18 44-44 44z"/></g>`,
  bread: (c) => `<g ${stroke(c)}><path d="M70 210c-24-8-34-46-10-72 22-24 70-34 140-34s118 10 140 34c24 26 14 64-10 72v96c0 16-12 26-28 26H98c-16 0-28-10-28-26z"/><path d="M150 130l-14 40M210 124l-14 44M270 130l-14 40"/></g>`,
}

export const COVER_STYLES = ['split', 'band', 'circle'] as const
type CoverStyle = (typeof COVER_STYLES)[number]

function svg(motif: string, style: CoverStyle, second: string): string {
  const W = 1600, H = 900
  const m = MOTIFS[motif]
  const m2 = MOTIFS[second]
  let bg = ''
  let big = ''
  let small = ''
  if (style === 'split') {
    bg = `<rect width="${W}" height="${H}" fill="#faf8f6"/><rect x="900" width="700" height="${H}" fill="${RED}"/><circle cx="1250" cy="450" r="260" fill="#ffffff" opacity=".12"/>`
    big = `<g transform="translate(1050 250) scale(1.0)">${m('#ffffff')}</g>`
    small = `<g transform="translate(240 250) scale(1.0)" opacity=".9">${m2(RED)}</g><g transform="translate(80 600) scale(.4)" opacity=".5">${m(INK)}</g>`
  } else if (style === 'band') {
    bg = `<rect width="${W}" height="${H}" fill="${RED}"/><rect y="560" width="${W}" height="340" fill="#faf8f6"/>`
    big = `<g transform="translate(600 120) scale(1.5)">${m('#ffffff')}</g>`
    small = `<g transform="translate(160 640) scale(.55)">${m2(RED)}</g><g transform="translate(1180 640) scale(.55)">${m(INK)}</g>`
  } else {
    bg = `<rect width="${W}" height="${H}" fill="#f1ece8"/><circle cx="800" cy="450" r="380" fill="${RED}"/><circle cx="800" cy="450" r="320" fill="none" stroke="#fff" stroke-opacity=".35" stroke-width="3" stroke-dasharray="6 14"/>`
    big = `<g transform="translate(600 250) scale(1.0)">${m('#ffffff')}</g>`
    small = `<g transform="translate(120 120) scale(.55)">${m2(INK)}</g><g transform="translate(1240 560) scale(.55)">${m2(RED)}</g>`
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">${bg}${small}${big}</svg>`
}

export async function makeCover(motif: string, style: CoverStyle, second: string): Promise<Buffer> {
  return sharp(Buffer.from(svg(motif, style, second))).jpeg({ quality: 86, mozjpeg: true }).toBuffer()
}
