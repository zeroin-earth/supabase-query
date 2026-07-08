import type { BuilderFn, Row, RowsResult } from './types'
import { Keys } from '../query/Keys'
import type { GeoOp, QueryBuilder } from '../query/QueryBuilder'
import { q } from '../query/QueryBuilder'
import type { AnySupabaseClient } from '../types'

/** Maps a geo predicate's recorded args to the arguments of a PostGIS RPC.
 * Only radius (`distance*`) predicates auto-route; other spatial ops need a
 * bespoke RPC called directly (see migration plan §5). */
function geoRpcArgs(op: GeoOp): Record<string, unknown> {
  if (op.fn.startsWith('distance')) {
    const [latitude, longitude, meters] = op.args as [number, number, number]
    return { p_lat: latitude, p_lng: longitude, p_meters: meters }
  }
  throw new Error(
    `supabase-query: geo predicate "${op.fn}" cannot be auto-routed to an RPC. ` +
      `Call its spatial RPC directly (see migration plan §5).`,
  )
}

async function runGeoQuery<TRow extends Row>(
  supabase: AnySupabaseClient,
  builder: QueryBuilder<TRow>,
  geoRpc: string | undefined,
): Promise<RowsResult<TRow>> {
  if (!geoRpc) {
    throw new Error(
      'supabase-query: this query uses a geo predicate; pass `geoRpc` naming the ' +
        'PostGIS RPC to route it to (migration plan §5/§8.7).',
    )
  }
  const op = builder.geoOps()[0]
  if (!op) throw new Error('supabase-query: runGeoQuery called without a geo predicate.')
  const { data, error } = await supabase.rpc(geoRpc, geoRpcArgs(op))
  if (error) throw error
  const rows = (data ?? []) as TRow[]
  return { total: rows.length, rows }
}

export type RowsQueryParams<TRow extends Row> = {
  schema?: string
  table: string
  select?: string
  builder?: BuilderFn<TRow>
  geoRpc?: string
}

/**
 * Builds the `{ queryKey, queryFn }` for a list read. The serialized builder ops
 * and select string are folded into the query key so it stays stable and
 * cacheable (the PostgREST filter builder itself is not serializable — plan §5).
 * A geo predicate reroutes the `queryFn` to a spatial RPC instead of `.from()`.
 */
export function getRowsQuery<TRow extends Row>(
  supabase: AnySupabaseClient,
  { schema = 'public', table, select = '*', builder, geoRpc }: RowsQueryParams<TRow>,
) {
  const qb = builder?.(q<TRow>())
  const ops = qb?.build() ?? []

  return {
    queryKey: [...Keys.schema(schema).table(table).rows().key(), { ops, select }] as const,
    queryFn: async (): Promise<RowsResult<TRow>> => {
      if (qb?.hasGeo()) {
        return runGeoQuery<TRow>(supabase, qb, geoRpc)
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const base: any = supabase.from(table).select(select, { count: 'exact' })
      const { data, error, count } = await (qb ? qb.applyTo(base) : base)
      if (error) throw error

      const rows = (data ?? []) as TRow[]
      return { total: count ?? rows.length, rows }
    },
  }
}

export type RowQueryParams = {
  schema?: string
  table: string
  id: string
  select?: string
}

/**
 * Builds the `{ queryKey, queryFn }` for a single-row read via
 * `.select().eq('id', id).single()`. The key omits the select string so
 * optimistic writes and realtime updates target one canonical row entry.
 */
export function getRowQuery<TRow extends Row>(
  supabase: AnySupabaseClient,
  { schema = 'public', table, id, select = '*' }: RowQueryParams,
) {
  return {
    queryKey: Keys.schema(schema).table(table).row(id).key(),
    queryFn: async (): Promise<TRow> => {
      const { data, error } = await supabase.from(table).select(select).eq('id', id).single()
      if (error) throw error
      return data as unknown as TRow
    },
  }
}
