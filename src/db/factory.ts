import type { MutateOptions, UseMutationResult } from '@tanstack/react-query'

import type { BuilderFn, ReadOptions, Row } from './types'
import { useCreateRow as useCreateRowBase } from './useCreateRow'
import { useDecrementColumn as useDecrementColumnBase } from './useDecrementColumn'
import { useDeleteRow as useDeleteRowBase } from './useDeleteRow'
import { useIncrementColumn as useIncrementColumnBase } from './useIncrementColumn'
import { useInfiniteRows as useInfiniteRowsBase } from './useInfiniteRows'
import { useRow as useRowBase, useSuspenseRow as useSuspenseRowBase } from './useRow'
import { useRows as useRowsBase, useSuspenseRows as useSuspenseRowsBase } from './useRows'
import {
  useRowsWithPagination as useRowsWithPaginationBase,
  useSuspenseRowsWithPagination as useSuspenseRowsWithPaginationBase,
} from './useRowsWithPagination'
import { useUpdateRow as useUpdateRowBase } from './useUpdateRow'
import { useUpsertRow as useUpsertRowBase } from './useUpsertRow'
import type { AnyDatabase } from '../types'

// --- Schema-driven type helpers ----------------------------------------------
// These infer table names + row/insert/update shapes from the consumer's
// generated `Database` type. When `Database` is the permissive `AnyDatabase`,
// they collapse to `string`/`Row`, keeping the untyped path working.

type TablesOf<DB> = DB extends { public: { Tables: infer T } } ? T : never
type TableName<DB> = keyof TablesOf<DB> & string
type RowOf<DB, T extends TableName<DB>> = TablesOf<DB>[T] extends { Row: infer R }
  ? R & Row
  : Row
type InsertOf<DB, T extends TableName<DB>> = TablesOf<DB>[T] extends { Insert: infer I }
  ? I & Row
  : Row
type UpdateOf<DB, T extends TableName<DB>> = TablesOf<DB>[T] extends { Update: infer U }
  ? U & Row
  : Row
/** Numeric columns of a row — the only valid targets for increment/decrement. */
type NumericColumn<TRow> = {
  [K in keyof TRow]: TRow[K] extends number ? K : never
}[keyof TRow] &
  string

/** Re-binds a base mutation (whose variables carry `table`) to a table-curried,
 * ergonomic input shape while preserving every other field of the result. */
function bindMutation<TData, TError, TBaseVars, TCtx, TInput>(
  base: UseMutationResult<TData, TError, TBaseVars, TCtx>,
  adapt: (input: TInput) => TBaseVars,
) {
  return {
    ...base,
    mutate: (input: TInput, options?: MutateOptions<TData, TError, TBaseVars, TCtx>) =>
      base.mutate(adapt(input), options),
    mutateAsync: (input: TInput, options?: MutateOptions<TData, TError, TBaseVars, TCtx>) =>
      base.mutateAsync(adapt(input), options),
  }
}

/**
 * Builds the `Database`-typed `db/` hook set returned by `createSupabaseQuery`.
 * Table names autocomplete and row/insert/update types infer from the schema, so
 * consumers never hand-write `<Row>` generics — the successor to the gql.tada
 * autocomplete the Appwrite library had (migration plan §3).
 * @internal
 */
export function makeDbHooks<Database = AnyDatabase>() {
  type T = TableName<Database>

  return {
    /** Fetch one row by id, kept live via realtime. */
    useRow<Tn extends T>(table: Tn, id: string, options?: ReadOptions) {
      return useRowBase<RowOf<Database, Tn>>(table, id, options)
    },
    useSuspenseRow<Tn extends T>(table: Tn, id: string, options?: ReadOptions) {
      return useSuspenseRowBase<RowOf<Database, Tn>>(table, id, options)
    },

    /** Fetch a filtered list of rows, kept live via realtime. */
    useRows<Tn extends T>(
      table: Tn,
      builder?: BuilderFn<RowOf<Database, Tn>>,
      options?: ReadOptions,
    ) {
      return useRowsBase<RowOf<Database, Tn>>(table, builder, options)
    },
    useSuspenseRows<Tn extends T>(
      table: Tn,
      builder?: BuilderFn<RowOf<Database, Tn>>,
      options?: ReadOptions,
    ) {
      return useSuspenseRowsBase<RowOf<Database, Tn>>(table, builder, options)
    },

    /** Offset-based infinite scroll. */
    useInfiniteRows<Tn extends T>(
      table: Tn,
      builder?: BuilderFn<RowOf<Database, Tn>>,
      options?: ReadOptions & { limit?: number },
    ) {
      return useInfiniteRowsBase<RowOf<Database, Tn>>(table, builder, options)
    },

    /** Classic prev/next pagination. */
    useRowsWithPagination<Tn extends T>(
      table: Tn,
      builder?: BuilderFn<RowOf<Database, Tn>>,
      options?: ReadOptions & { limit?: number },
    ) {
      return useRowsWithPaginationBase<RowOf<Database, Tn>>(table, builder, options)
    },
    useSuspenseRowsWithPagination<Tn extends T>(
      table: Tn,
      builder?: BuilderFn<RowOf<Database, Tn>>,
      options?: ReadOptions & { limit?: number },
    ) {
      return useSuspenseRowsWithPaginationBase<RowOf<Database, Tn>>(table, builder, options)
    },

    /** Insert a row: `mutate(values)`. */
    useCreateRow<Tn extends T>(table: Tn, schema = 'public') {
      const base = useCreateRowBase<RowOf<Database, Tn>, InsertOf<Database, Tn>>()
      return bindMutation(base, (values: InsertOf<Database, Tn>) => ({ table, schema, values }))
    },

    /** Patch a row (optimistic): `mutate({ id, values })`. */
    useUpdateRow<Tn extends T>(table: Tn, schema = 'public') {
      const base = useUpdateRowBaseTyped<Database, Tn>()
      return bindMutation(
        base,
        ({ id, values }: { id: string; values: UpdateOf<Database, Tn> }) => ({
          table,
          schema,
          id,
          values,
        }),
      )
    },

    /** Upsert a row: `mutate(values)`; `onConflict` defaults to `'id'`. */
    useUpsertRow<Tn extends T>(table: Tn, { schema = 'public', onConflict = 'id' } = {}) {
      const base = useUpsertRowBaseTyped<Database, Tn>()
      return bindMutation(base, (values: InsertOf<Database, Tn>) => ({
        table,
        schema,
        values,
        onConflict,
      }))
    },

    /** Delete a row (optimistic): `mutate(id)`. */
    useDeleteRow<Tn extends T>(table: Tn, schema = 'public') {
      const base = useDeleteRowBase()
      return bindMutation(base, (id: string) => ({ table, schema, id }))
    },

    /** Atomically increment a numeric column (optimistic): `mutate({ id, column, amount? })`. */
    useIncrementColumn<Tn extends T>(table: Tn, schema = 'public') {
      const base = useIncrementColumnBase()
      return bindMutation(
        base,
        ({
          id,
          column,
          amount,
        }: {
          id: string
          column: NumericColumn<RowOf<Database, Tn>>
          amount?: number
        }) => ({ table, schema, id, column, amount }),
      )
    },

    /** Atomically decrement a numeric column (optimistic): `mutate({ id, column, amount? })`. */
    useDecrementColumn<Tn extends T>(table: Tn, schema = 'public') {
      const base = useDecrementColumnBase()
      return bindMutation(
        base,
        ({
          id,
          column,
          amount,
        }: {
          id: string
          column: NumericColumn<RowOf<Database, Tn>>
          amount?: number
        }) => ({ table, schema, id, column, amount }),
      )
    },
  }
}

// The update/upsert base hooks take two generics; small typed shims keep the
// factory bodies above readable.
function useUpdateRowBaseTyped<Database, Tn extends TableName<Database>>() {
  return useUpdateRowBase<RowOf<Database, Tn>, UpdateOf<Database, Tn>>()
}
function useUpsertRowBaseTyped<Database, Tn extends TableName<Database>>() {
  return useUpsertRowBase<RowOf<Database, Tn>, InsertOf<Database, Tn>>()
}
