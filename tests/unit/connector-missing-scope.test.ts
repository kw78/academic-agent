import { describe, expect, it } from 'vitest'
import { selectMissingItems } from '@academic/connectors'

function item(courseId: string, externalItemId?: string) {
  return { courseId, source: { externalItemId } }
}

describe('selectMissingItems', () => {
  it('reports items absent from a complete snapshot', () => {
    const items = [item('c1', 'a'), item('c1', 'b'), item('c1', 'c')]
    const missing = selectMissingItems(items, new Set(['a']))
    expect(missing.map((entry) => entry.source.externalItemId)).toEqual(['b', 'c'])
  })

  it('treats items without a stable external id as missing', () => {
    const items = [item('c1', undefined), item('c1', 'a')]
    expect(selectMissingItems(items, new Set(['a']))).toHaveLength(1)
  })

  it('ignores out-of-scope courses so a term-filtered sync is not partial', () => {
    const items = [item('c1', 'a'), item('c2', 'old-1'), item('c2', 'old-2')]
    const missing = selectMissingItems(items, new Set(['a']), new Set(['c1']))
    expect(missing).toEqual([])
  })

  it('still reports missing items inside the declared scope', () => {
    const items = [item('c1', 'a'), item('c1', 'removed'), item('c2', 'old')]
    const missing = selectMissingItems(
      items,
      new Set(['a']),
      new Set(['c1', 'c2']),
    )
    expect(missing.map((entry) => entry.source.externalItemId)).toEqual([
      'removed',
      'old',
    ])
  })
})
