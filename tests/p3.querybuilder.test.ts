import { describe, expect, test } from 'bun:test'

import { q } from '../src/query/QueryBuilder'

type Todo = {
  id: string
  title: string
  done: boolean
  priority: number
  created_at: string
  location: unknown
}

/**
 * A stand-in for supabase-js's `PostgrestFilterBuilder`: every chained call is
 * recorded so we can assert `applyTo` replayed the exact ops in order.
 */
function makeMockBuilder() {
  const calls: { fn: string; args: unknown[] }[] = []
  const builder = new Proxy(
    {},
    {
      get(_t, fn: string) {
        return (...args: unknown[]) => {
          calls.push({ fn, args })
          return builder
        }
      },
    },
  )
  return { builder, calls }
}

describe('QueryBuilder — build() descriptor shape', () => {
  test('records serializable postgrest ops in order', () => {
    const ops = q<Todo>().eq('done', false).order('created_at', { ascending: false }).limit(10).build()

    expect(ops).toEqual([
      { kind: 'postgrest', fn: 'eq', args: ['done', false] },
      { kind: 'postgrest', fn: 'order', args: ['created_at', { ascending: false }] },
      { kind: 'postgrest', fn: 'limit', args: [10] },
    ])
  })

  test('build() returns a fresh copy (immutable snapshot)', () => {
    const builder = q<Todo>().eq('done', false)
    const a = builder.build()
    builder.eq('priority', 1)
    expect(a).toHaveLength(1)
    expect(builder.build()).toHaveLength(2)
  })

  test('descriptor is JSON-serializable (stable query key)', () => {
    const ops = q<Todo>().eq('title', 'x').build()
    expect(JSON.parse(JSON.stringify(ops))).toEqual(ops)
  })
})

describe('QueryBuilder — Appwrite-era aliases map to PostgREST', () => {
  test('comparison aliases', () => {
    expect(q<Todo>().greaterThan('priority', 1).build()[0]).toMatchObject({ fn: 'gt' })
    expect(q<Todo>().lessThanEqual('priority', 5).build()[0]).toMatchObject({ fn: 'lte' })
    expect(q<Todo>().notEqual('done', true).build()[0]).toMatchObject({ fn: 'neq' })
  })

  test('equal with an array becomes in()', () => {
    expect(q<Todo>().equal('priority', [1, 2, 3]).build()[0]).toEqual({
      kind: 'postgrest',
      fn: 'in',
      args: ['priority', [1, 2, 3]],
    })
  })

  test('isNull / isNotNull', () => {
    expect(q<Todo>().isNull('title').build()[0]).toEqual({
      kind: 'postgrest',
      fn: 'is',
      args: ['title', null],
    })
    expect(q<Todo>().isNotNull('title').build()[0]).toEqual({
      kind: 'postgrest',
      fn: 'not',
      args: ['title', 'is', null],
    })
  })

  test('startsWith / endsWith use like patterns', () => {
    expect(q<Todo>().startsWith('title', 'foo').build()[0]).toMatchObject({
      fn: 'like',
      args: ['title', 'foo%'],
    })
    expect(q<Todo>().endsWith('title', 'bar').build()[0]).toMatchObject({
      fn: 'like',
      args: ['title', '%bar'],
    })
  })

  test('between expands to gte + lte', () => {
    expect(q<Todo>().between('priority', 1, 5).build()).toEqual([
      { kind: 'postgrest', fn: 'gte', args: ['priority', 1] },
      { kind: 'postgrest', fn: 'lte', args: ['priority', 5] },
    ])
  })

  test('cursorAfter expands to gt + order', () => {
    expect(q<Todo>().cursorAfter('id', 'abc').build()).toEqual([
      { kind: 'postgrest', fn: 'gt', args: ['id', 'abc'] },
      { kind: 'postgrest', fn: 'order', args: ['id', { ascending: true }] },
    ])
  })
})

describe('QueryBuilder — applyTo replays onto a filter builder', () => {
  test('chains ops in recorded order, skipping geo ops', () => {
    const { builder, calls } = makeMockBuilder()

    q<Todo>()
      .eq('done', false)
      .gt('priority', 2)
      .distanceLessThan('location', 40, -73, 1000)
      .order('created_at', { ascending: false })
      .applyTo(builder)

    expect(calls).toEqual([
      { fn: 'eq', args: ['done', false] },
      { fn: 'gt', args: ['priority', 2] },
      { fn: 'order', args: ['created_at', { ascending: false }] },
    ])
  })

  test('returns the (final) builder for further chaining', () => {
    const { builder } = makeMockBuilder()
    expect(q<Todo>().eq('done', false).applyTo(builder)).toBe(builder)
  })
})

describe('QueryBuilder — geo predicates route to RPC', () => {
  test('geoOps + hasGeo capture spatial predicates', () => {
    const builder = q<Todo>().eq('done', false).distanceLessThan('location', 40.7, -73.9, 500)

    expect(builder.hasGeo()).toBe(true)
    expect(builder.geoOps()).toEqual([
      {
        kind: 'geo',
        fn: 'distanceLessThan',
        column: 'location',
        args: [40.7, -73.9, 500, true],
      },
    ])
  })

  test('geo ops are still part of build() (hashed into the key)', () => {
    const ops = q<Todo>().intersects('location', [[0, 0]]).build()
    expect(ops[0]).toMatchObject({ kind: 'geo', fn: 'intersects', column: 'location' })
  })

  test('no geo → hasGeo is false', () => {
    expect(q<Todo>().eq('done', false).hasGeo()).toBe(false)
  })
})
