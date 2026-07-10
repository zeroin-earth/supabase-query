// The `db/` module — the merge of the Appwrite `databases/` + `tablesDB/` APIs
// into one Postgres `row`/`table` surface (migration plan §6.1).

export { getRowQuery, getRowsQuery } from './queryOptions'
export type { RowQueryParams, RowsQueryParams } from './queryOptions'
export { subscribeToTable } from './realtime'
export type { PostgresChangePayload, SubscribeOptions } from './realtime'

// Read hooks
export { useRow, useSuspenseRow } from './useRow'
export { useRows, useSuspenseRows } from './useRows'
export { useInfiniteRows } from './useInfiniteRows'
export { useRowsWithPagination, useSuspenseRowsWithPagination } from './useRowsWithPagination'

// Mutation hooks + their standalone fns (the fns feed the offline registry, P5)
export { createRowFn, useCreateRow } from './useCreateRow'
export { updateRowFn, useUpdateRow } from './useUpdateRow'
export { upsertRowFn, useUpsertRow } from './useUpsertRow'
export { deleteRowFn, useDeleteRow } from './useDeleteRow'
export { incrementColumnFn, useAdjustColumn, useIncrementColumn } from './useIncrementColumn'
export { useDecrementColumn } from './useDecrementColumn'

export type {
  BuilderFn,
  CreateRowVariables,
  DeleteRowVariables,
  IncrementColumnVariables,
  ReadOptions,
  Row,
  RowMutationContext,
  RowPositions,
  RowsResult,
  RowTarget,
  UpdateRowVariables,
  UpsertRowVariables,
} from './types'
