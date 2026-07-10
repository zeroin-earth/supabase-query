import type { QueryBuilder } from '../query/QueryBuilder'
import type { QueryOptions } from '../types'

/** A plain typed Postgres row. Unlike Appwrite there is no `data` JSON blob to
 * unwrap — columns are first-class, so a row is just its column object. */
export type Row = Record<string, unknown>

/** The result of a list read: the rows plus the `exact` total from PostgREST. */
export type RowsResult<TRow> = {
  /** `count: 'exact'` from PostgREST — the total matching rows, ignoring range. */
  total: number
  rows: TRow[]
}

/**
 * A function that configures a {@link QueryBuilder}. This is the second argument
 * to the read hooks: `useRows('todos', (q) => q.eq('done', false))`.
 */
export type BuilderFn<TRow extends Row> = (q: QueryBuilder<TRow>) => QueryBuilder<TRow>

/** Shared read options for the list/single read hooks. */
export type ReadOptions = QueryOptions & {
  /** Postgres schema — defaults to `'public'`. */
  schema?: string
  /** PostgREST select string (columns + embeds), e.g. `'*, author(*)'`. Defaults to `'*'`. */
  select?: string
  /** Subscribe to realtime `postgres_changes` for this table (default `true`). */
  subscribe?: boolean
  /**
   * When the query uses a geo predicate (see {@link QueryBuilder} `distance*`),
   * the name of the PostGIS RPC to route it to (e.g. `'places_within'`). Required
   * whenever the builder records a geo op (migration plan §5/§8.7).
   */
  geoRpc?: string
}

// --- Mutation variable shapes ------------------------------------------------
// Each carries `table` (+ optional `schema`) so the offline replay registry (P5)
// can reconstruct the call from the persisted variables alone — the closure is
// not available on replay.

export type CreateRowVariables<TInsert = Row> = {
  table: string
  schema?: string
  values: TInsert
}

export type UpdateRowVariables<TUpdate = Row> = {
  table: string
  schema?: string
  id: string
  values: TUpdate
}

export type UpsertRowVariables<TInsert = Row> = {
  table: string
  schema?: string
  values: TInsert
  /** Conflict target column(s) for the upsert; defaults to `'id'`. */
  onConflict?: string
}

export type DeleteRowVariables = {
  table: string
  schema?: string
  id: string
}

export type IncrementColumnVariables = {
  table: string
  schema?: string
  id: string
  column: string
  /** Amount to add (increment) — defaults to `1`. Decrement passes a negative. */
  amount?: number
  /** Name of the increment RPC; defaults to `'increment_column'` (migration plan §8.7). */
  rpc?: string
}

/** Identifies one row across every cache entry that can hold it. */
export type RowTarget = { schema: string; table: string; id: string }

/** Where a removed row sat in each cached list, so it can be restored in place. */
export type RowPositions = [queryKey: readonly unknown[], index: number][]

/** Optimistic-update context shared by the row mutation hooks. */
export type RowMutationContext = {
  /**
   * Snapshot of the *single-row* cache entries only. Cached lists are rolled back
   * by re-applying {@link RowMutationContext.baseSnapshot} (or reinserting the
   * removed row), never by snapshotting them: a paused mutation's context is
   * persisted to storage, and whole list arrays would bloat it.
   */
  previousEntries: [queryKey: readonly unknown[], data: unknown][]
  rowKey: readonly unknown[]
  /**
   * A deep copy of the row before the optimistic patch, captured by
   * `useUpdateRow` from the row cache or, failing that, from any cached list.
   * Persisted through dehydration so it can serve as the "base" for three-way
   * conflict resolution when a paused mutation is replayed (offline engine,
   * migration plan §6.5).
   */
  baseSnapshot?: Record<string, unknown>
  /** Set by `useUpdateRow.onMutate` when the mutation was created offline, so its
   * mutationFn routes the in-session resume through {@link conflictAwareUpdate}. */
  willPerformOfflineMutation?: boolean
  /** The row `useDeleteRow` optimistically removed, for restoring it on error. */
  removedRow?: Row
  /** Where that row sat in each cached list, so the restore preserves ordering. */
  removedPositions?: RowPositions
}
