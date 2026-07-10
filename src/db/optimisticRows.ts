import type { QueryClient } from '@tanstack/react-query'

import type { Row, RowPositions, RowsResult, RowTarget } from './types'
import { Keys } from '../query/Keys'

type ListCache = RowsResult<Row>

/** The key prefix every `useRows` cache entry for this table shares. */
export function listsKeyOf({ schema, table }: Omit<RowTarget, 'id'>) {
  return Keys.schema(schema).table(table).rows().key()
}

export function rowKeyOf({ schema, table, id }: RowTarget) {
  return Keys.schema(schema).table(table).row(id).key()
}

/**
 * A cached list read is `{ total, rows }`. `getRowsQuery` appends `{ ops, select }`
 * to the shared prefix, so a prefix match returns every filter variant — guard on
 * the shape rather than assume.
 */
function isListCache(value: unknown): value is ListCache {
  return typeof value === 'object' && value !== null && Array.isArray((value as ListCache).rows)
}

/**
 * Cancels in-flight reads that an optimistic write is about to overwrite — both
 * the single-row entry and every list variant for the table.
 */
export async function cancelRowQueries(queryClient: QueryClient, target: RowTarget) {
  await Promise.all([
    queryClient.cancelQueries({ queryKey: rowKeyOf(target) }),
    queryClient.cancelQueries({ queryKey: listsKeyOf(target) }),
  ])
}

/**
 * The row as currently cached: the single-row entry if some `useRow` populated
 * it, otherwise the copy carried inside any cached list.
 *
 * The list fallback is what makes optimistic writes and offline conflict
 * resolution work for a screen built only from `useRows` — the common case. A
 * row-cache-only lookup returns `undefined` there, silently degrading
 * `conflictAwareUpdate` to a blind update.
 *
 * The single-row entry is preferred because it is always a full row. A list read
 * with a narrowed `select` yields a partial one, which is a weaker conflict base:
 * `merge-shallow` treats every column missing from the base as remotely changed.
 */
export function findCachedRow(queryClient: QueryClient, target: RowTarget): Row | undefined {
  const cached = queryClient.getQueryData<Row>(rowKeyOf(target))
  if (cached) return cached

  for (const [, data] of queryClient.getQueriesData({ queryKey: listsKeyOf(target) })) {
    if (!isListCache(data)) continue
    const found = data.rows.find((row) => row.id === target.id)
    if (found) return found
  }
  return undefined
}

/**
 * Merges `patch` into the row's copy inside every cached list that holds it.
 *
 * This cannot re-evaluate a list's filters — the builder ops are serialized into
 * the query key, not replayable here — so a row patched out of a filtered list
 * stays visible until an invalidation refetches. Hide it client-side if that
 * matters before the round trip.
 */
export function patchRowInLists(queryClient: QueryClient, target: RowTarget, patch: Row) {
  queryClient.setQueriesData<ListCache>({ queryKey: listsKeyOf(target) }, (old) =>
    isListCache(old)
      ? {
          ...old,
          rows: old.rows.map((row) => (row.id === target.id ? { ...row, ...patch } : row)),
        }
      : old,
  )
}

/**
 * Merges `patch` into the row wherever it is cached: the single-row entry and
 * every list that contains it. The single-row entry is only updated if it already
 * exists — an optimistic write should not conjure a cache entry no hook asked for.
 */
export function patchRow(queryClient: QueryClient, target: RowTarget, patch: Row) {
  queryClient.setQueryData<Row>(rowKeyOf(target), (old) => (old ? { ...old, ...patch } : old))
  patchRowInLists(queryClient, target, patch)
}

/**
 * Drops the row from every cached list (decrementing `total`) and returns where
 * it sat, so a failed delete can restore the original ordering rather than
 * appending the row back at the end.
 */
export function removeRowFromLists(queryClient: QueryClient, target: RowTarget): RowPositions {
  const positions: RowPositions = []

  for (const [queryKey, data] of queryClient.getQueriesData({ queryKey: listsKeyOf(target) })) {
    if (!isListCache(data)) continue
    const index = data.rows.findIndex((row) => row.id === target.id)
    if (index === -1) continue

    positions.push([queryKey, index])
    queryClient.setQueryData<ListCache>(queryKey, {
      total: Math.max(0, data.total - 1),
      rows: [...data.rows.slice(0, index), ...data.rows.slice(index + 1)],
    })
  }

  return positions
}

/** Undoes {@link removeRowFromLists}, restoring `row` to its original index. */
export function reinsertRowIntoLists(queryClient: QueryClient, positions: RowPositions, row: Row) {
  for (const [queryKey, index] of positions) {
    queryClient.setQueryData<ListCache>(queryKey, (old) =>
      isListCache(old)
        ? {
            total: old.total + 1,
            rows: [...old.rows.slice(0, index), row, ...old.rows.slice(index)],
          }
        : old,
    )
  }
}
