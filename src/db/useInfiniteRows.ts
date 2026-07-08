import { useCallback, useEffect, useState } from 'react'

import type { BuilderFn, ReadOptions, Row } from './types'
import { useRows } from './useRows'

/**
 * Fetches rows with offset-based infinite scroll, accumulating results across
 * pages via PostgREST `.range()`. Default page size is 25.
 *
 * @typeParam TRow - The row's column shape.
 *
 * @example
 * ```tsx
 * const { rows, fetchNextPage, hasNextPage, isFetchingNextPage } =
 *   useInfiniteRows('todos', (q) => q.order('created_at', { ascending: false }), { limit: 20 })
 * ```
 *
 * @param table - The table name.
 * @param builder - Optional fluent filter/modifier builder (applied to every page).
 * @param options - `limit` (page size) plus the standard {@link ReadOptions}.
 * @returns Accumulated `rows`, `total`, `hasNextPage`, `fetchNextPage()`,
 *   `isFetchingNextPage`, `reset()`, and standard query status flags.
 */
export function useInfiniteRows<TRow extends Row = Row>(
  table: string,
  builder?: BuilderFn<TRow>,
  { limit = 25, ...options }: ReadOptions & { limit?: number } = {},
) {
  const [page, setPage] = useState(1)
  const [accumulated, setAccumulated] = useState<TRow[]>([])

  const offset = (page - 1) * limit
  const pagedBuilder: BuilderFn<TRow> = (q) => (builder ? builder(q) : q).range(offset, offset + limit - 1)

  const result = useRows<TRow>(table, pagedBuilder, options)
  const { rows, total: totalRaw, isFetching } = result

  // Accumulate rows across pages (guards against double-appends on refetch).
  useEffect(() => {
    if (!rows) return
    if (page === 1) {
      setAccumulated([...rows])
    } else {
      setAccumulated((prev) => {
        const expectedLength = (page - 1) * limit + rows.length
        return prev.length < expectedLength ? [...prev, ...rows] : prev
      })
    }
  }, [rows, page, limit])

  const total = totalRaw ?? 0
  const hasNextPage = total > 0 && offset + limit < total

  const fetchNextPage = useCallback(() => {
    if (hasNextPage && !isFetching) setPage((prev) => prev + 1)
  }, [hasNextPage, isFetching])

  const reset = useCallback(() => {
    setAccumulated([])
    setPage(1)
  }, [])

  return {
    rows: accumulated,
    total,
    hasNextPage,
    fetchNextPage,
    isFetchingNextPage: page > 1 && isFetching,
    reset,
    isLoading: result.isLoading,
    isError: result.isError,
    error: result.error,
    isFetching,
  }
}
