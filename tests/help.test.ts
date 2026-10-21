import { describe, expect, it } from 'vitest'
import {
  HELP_ARTICLES,
  HELP_CATEGORIES,
  helpArticleById,
  searchHelp,
} from '@/features/help/helpContent'

describe('help content', () => {
  it('uses unique article ids', () => {
    const ids = HELP_ARTICLES.map((article) => article.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('keeps every article inside a declared category', () => {
    for (const article of HELP_ARTICLES) {
      expect(HELP_CATEGORIES).toContain(article.category)
    }
  })

  it('provides actionable content for every article', () => {
    for (const article of HELP_ARTICLES) {
      expect(article.title.length).toBeGreaterThan(0)
      expect(article.summary.length).toBeGreaterThan(0)
      expect(article.what.length).toBeGreaterThan(0)
      expect(article.steps.length).toBeGreaterThan(0)
      expect(article.keywords.length).toBeGreaterThan(0)
    }
  })

  it('finds an article by id', () => {
    expect(helpArticleById('orders')?.title).toMatch(/order/i)
    expect(helpArticleById('missing-article')).toBeUndefined()
  })

  it('searches titles, keywords, steps and troubleshooting terms', () => {
    expect(searchHelp('password').some((article) => article.id === 'security')).toBe(true)
    expect(searchHelp('index').some((article) => article.id === 'troubleshooting')).toBe(true)
    expect(searchHelp('advance').some((article) => article.id === 'payments')).toBe(true)
    expect(searchHelp('no-such-topic-xyz')).toHaveLength(0)
    expect(searchHelp('')).toHaveLength(HELP_ARTICLES.length)
  })
})
