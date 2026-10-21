import { describe, expect, it } from 'vitest'
import {
  HELP_ARTICLES,
  HELP_CATEGORIES,
  TRAINING_PATHS,
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
      expect(article.when.length).toBeGreaterThan(0)
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

  it('exposes the guides the onboarding paths depend on', () => {
    const expected = [
      'getting-started',
      'training',
      'daily-checklist',
      'navigation',
      'switch-outlet',
      'orders',
      'order-status',
      'bookings',
      'booking-edits',
      'production',
      'inventory',
      'deliveries',
      'delivery-reconciliation',
      'payments',
      'printing',
      'finance',
      'cash-sessions',
      'reports',
      'accounting-export',
      'data-limits',
      'roles',
      'departments',
      'outlet-admin',
      'department-admin',
      'staff',
      'settings',
      'security',
      'troubleshooting',
      'data-safety',
      'search-shortcuts',
      'products',
      'product-pricing',
      'product-images',
      'customers',
      'dashboard',
    ]
    for (const id of expected) {
      expect(helpArticleById(id), `missing help article: ${id}`).toBeDefined()
    }
  })

  it('only links training paths to articles that exist', () => {
    for (const path of TRAINING_PATHS) {
      expect(path.articleIds.length).toBeGreaterThan(0)
      for (const id of path.articleIds) {
        expect(helpArticleById(id), `training path "${path.title}" links to missing article ${id}`).toBeDefined()
      }
    }
  })

  it('starts every training path with an existing article', () => {
    for (const path of TRAINING_PATHS) {
      expect(helpArticleById(path.articleIds[0])).toBeDefined()
    }
  })

  it('marks the unresolved delivery reconciliation workflow instead of presenting it as settled', () => {
    const reconciliation = helpArticleById('delivery-reconciliation')
    expect(reconciliation?.pending?.length ?? 0).toBeGreaterThan(0)
    expect(reconciliation?.pending?.join(' ').toLowerCase()).toContain('pending')

    const deliveries = helpArticleById('deliveries')
    expect(deliveries?.pending?.length ?? 0).toBeGreaterThan(0)
    expect(deliveries?.pending?.join(' ').toLowerCase()).toContain('reconciliation')
  })

  it('states prerequisites where a workflow cannot start without them', () => {
    const bookings = helpArticleById('booking-edits')
    expect(bookings?.prerequisites?.length ?? 0).toBeGreaterThan(0)
    expect(bookings?.limitations?.join(' ')).toContain('Ready')

    const cash = helpArticleById('cash-sessions')
    expect(cash?.prerequisites?.length ?? 0).toBeGreaterThan(0)
    expect(cash?.what.toLowerCase()).toContain('expected cash')
  })

  it('documents the delivery collection permissions and the manual reconciliation policy', () => {
    const deliveries = helpArticleById('deliveries')
    expect(deliveries?.permission).toContain('paymentsManage')
    expect(deliveries?.limitations?.join(' ')).toContain('pending reconciliation')
    expect(deliveries?.limitations?.join(' ')).toContain('before dispatch')
  })

  it('finds guides by the operational words staff actually use', () => {
    expect(searchHelp('reconciliation').some((article) => article.id === 'delivery-reconciliation')).toBe(true)
    expect(searchHelp('cash session').some((article) => article.id === 'cash-sessions')).toBe(true)
    expect(searchHelp('revision').some((article) => article.id === 'booking-edits')).toBe(true)
    expect(searchHelp('cap').some((article) => article.id === 'data-limits')).toBe(true)
    expect(searchHelp('variance').some((article) => article.id === 'cash-sessions')).toBe(true)
  })
})
