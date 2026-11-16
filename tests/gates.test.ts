import { describe, expect, it } from 'vitest'
import { categoryGate, postGate, productGate } from '../src/lib/gates.js'
import { slugify } from '../src/lib/slug.js'
import { can } from '../src/lib/permissions.js'

const text = (n: number) => 'x'.repeat(n)

describe('gates (pure)', () => {
  it('product gate passes a complete product', () => {
    expect(productGate({ name: 'Oven', slug: 'oven', description: text(150), seoTitle: text(40), seoDescription: text(100), priceMode: 'QUOTE', price: null, images: [{ alt: 'a' }], categoryPublished: true })).toEqual([])
  })
  it('product gate flags every problem at once', () => {
    const m = productGate({ name: '', slug: '', description: '', seoTitle: '', seoDescription: '', priceMode: 'PRICE', price: 0, images: [{ alt: ' ' }], categoryPublished: false })
    expect(m.length).toBeGreaterThanOrEqual(7)
  })
  it('SEO length limits are enforced at both ends', () => {
    const base = { name: 'a', slug: 'a', description: text(150), priceMode: 'QUOTE' as const, price: null, images: [{ alt: 'a' }], categoryPublished: true }
    expect(productGate({ ...base, seoTitle: text(9), seoDescription: text(100) })).toHaveLength(1)
    expect(productGate({ ...base, seoTitle: text(71), seoDescription: text(100) })).toHaveLength(1)
    expect(productGate({ ...base, seoTitle: text(40), seoDescription: text(171) })).toHaveLength(1)
    expect(productGate({ ...base, seoTitle: text(40), seoDescription: text(49) })).toHaveLength(1)
  })
  it('category and post gates', () => {
    expect(categoryGate({ name: 'a', slug: 'a', intro: text(10), seoTitle: '', seoDescription: '', hasImage: false, imageAlt: '' }).length).toBeGreaterThanOrEqual(4)
    expect(postGate({ title: 't', slug: 't', excerpt: text(60), body: text(700), hasCover: true, coverAlt: 'alt', seoTitle: text(30), seoDescription: text(100) })).toEqual([])
    expect(postGate({ title: 't', slug: 't', excerpt: text(60), body: text(100), hasCover: true, coverAlt: '', seoTitle: text(30), seoDescription: text(100) }).length).toBe(2)
  })
  it('slugify handles punctuation, accents and ampersands', () => {
    expect(slugify('Bakery & Pastry Equipment!')).toBe('bakery-and-pastry-equipment')
    expect(slugify('  Café Ovens  ')).toBe('cafe-ovens')
  })
  it('permission matrix matches the spec', () => {
    expect(can('EDITOR', 'content:write')).toBe(true)
    expect(can('EDITOR', 'content:delete')).toBe(false)
    expect(can('EDITOR', 'users:manage')).toBe(false)
    expect(can('EDITOR', 'sections:write')).toBe(false)
    expect(can('ADMIN', 'audit:read')).toBe(true)
  })
})
