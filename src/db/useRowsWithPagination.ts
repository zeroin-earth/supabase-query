import { useRef, useState } from 'react'

import type { BuilderFn, ReadOptions, Row } from './types'
import { useRows, useSuspenseRows } from './useRows'

function usePaginationState(limit: number) {
  const [page, setPage] = useState(1)
  const totalRef = useRef(0)
  const offset = (page - 1) * limit

  const nextPage = () => {
    setPage((prev) => {
      const currentOffset = (prev - 1) * limit
      return totalRef.current > 0 && currentOffset + limit < totalRef.current ? prev + 1 : prev
    })
  }

  const previousPage = () => setPage((prev) => (prev > 1 ? prev - 1 : prev))

  const handlePageChange = (newPage: number) => {
    if (newPage < 1) return
    if (totalRef.current > 0 && newPage > Math.ceil(totalRef.current / limit)) return
    setPage(newPage)
  }

  return { page, offset, totalRef, nextPage, previousPage, handlePageChange }
}

/**
 * Fetches a page of rows with classic prev/next pagination via PostgREST
 * `.range()`. Default page size is 25.
 *
 * @typeParam TRow - The row's column shape.
 *
 * @example
 * ```tsx
 * const { rows, page, nextPage, previousPage, hasNextPage } =
 *   useRowsWithPagination('todos', (q) => q.eq('done', false), { limit: 10 })
 * ```
 *
 * @param table - The table name.
 * @param builder - Optional fluent filter/modifier builder.
 * @param options - `limit` (page size) plus the standard {@link ReadOptions}.
 * @returns `rows`, `total`, `page`, `hasNextPage`, `hasPreviousPage`,
 *   `nextPage()`, `previousPage()`, `handlePageChange(page)`, and status flags.
 */
export function useRowsWithPagination<TRow extends Row = Row>(
  table: string,
  builder?: BuilderFn<TRow>,
  { limit = 25, ...options }: ReadOptions & { limit?: number } = {},
) {
  const { page, offset, totalRef, nextPage, previousPage, handlePageChange } =
    usePaginationState(limit)

  const pagedBuilder: BuilderFn<TRow> = (q) =>
    (builder ? builder(q) : q).range(offset, offset + limit - 1)

  const result = useRows<TRow>(table, pagedBuilder, options)

  const total = result.total ?? 0
  totalRef.current = total

  return {
    rows: result.rows ?? [],
    total,
    page,
    hasNextPage: total > 0 && offset + limit < total,
    hasPreviousPage: page > 1,
    handlePageChange,
    nextPage,
    previousPage,
    isLoading: result.isLoading,
    isError: result.isError,
    error: result.error,
    isFetching: result.isFetching,
  }
}

/**
 * Suspense variant of {@link useRowsWithPagination}. Suspends while the page loads.
 *
 * @example
 * ```tsx
 * const { rows, page, nextPage, hasNextPage } = useSuspenseRowsWithPagination('todos')
 * ```
 */
export function useSuspenseRowsWithPagination<TRow extends Row = Row>(
  table: string,
  builder?: BuilderFn<TRow>,
  { limit = 25, ...options }: ReadOptions & { limit?: number } = {},
) {
  const { page, offset, totalRef, nextPage, previousPage, handlePageChange } =
    usePaginationState(limit)

  const pagedBuilder: BuilderFn<TRow> = (q) =>
    (builder ? builder(q) : q).range(offset, offset + limit - 1)

  const result = useSuspenseRows<TRow>(table, pagedBuilder, options)

  const total = result.total ?? 0
  totalRef.current = total

  return {
    rows: result.rows ?? [],
    total,
    page,
    hasNextPage: total > 0 && offset + limit < total,
    hasPreviousPage: page > 1,
    handlePageChange,
    nextPage,
    previousPage,
    isLoading: result.isLoading,
    isError: result.isError,
    error: result.error,
    isFetching: result.isFetching,
  }
}
