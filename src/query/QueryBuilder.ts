type FieldValue<T, K extends keyof T> = T[K]

/**
 * A PostgREST filter or modifier, recorded as a serializable `{ fn, args }`
 * descriptor. `fn` is always a real method name on a supabase-js
 * `PostgrestFilterBuilder`, so {@link QueryBuilder.applyTo} can replay it with
 * `builder[fn](...args)`.
 */
export type PostgrestOp = {
  kind: 'postgrest'
  fn:
    | 'eq'
    | 'neq'
    | 'gt'
    | 'gte'
    | 'lt'
    | 'lte'
    | 'like'
    | 'ilike'
    | 'is'
    | 'in'
    | 'contains'
    | 'containedBy'
    | 'textSearch'
    | 'or'
    | 'not'
    | 'order'
    | 'limit'
    | 'range'
    | 'select'
  args: unknown[]
}

/**
 * A PostGIS spatial predicate. PostgREST cannot express these as chained
 * filters, so the `db/` layer inspects {@link QueryBuilder.geoOps} and routes
 * the query to a spatial RPC instead of `.from().select()` (migration plan §5).
 * It is still serialized into the query key via {@link QueryBuilder.build}.
 */
export type GeoOp = {
  kind: 'geo'
  fn:
    | 'distanceEqual'
    | 'distanceNotEqual'
    | 'distanceGreaterThan'
    | 'distanceLessThan'
    | 'intersects'
    | 'notIntersects'
    | 'crosses'
    | 'notCrosses'
    | 'overlaps'
    | 'notOverlaps'
    | 'touches'
    | 'notTouches'
  column: string
  args: unknown[]
}

export type QueryOp = PostgrestOp | GeoOp

/** Minimal shape of a supabase-js `PostgrestFilterBuilder` for `applyTo`. */
type Chainable = { [fn: string]: (...args: unknown[]) => unknown }

/**
 * Type-safe, serializable query builder for PostgREST.
 *
 * The Appwrite builder produced a `string[]` that was both sent to the API and
 * embedded in the query key. PostgREST filters are applied by chaining methods
 * on a builder object, which is not serializable. To keep query keys stable,
 * this builder records a serializable list of `{ fn, args }` descriptors that
 * are (a) hashed into the query key via {@link build} and (b) replayed onto a
 * live `PostgrestFilterBuilder` via {@link applyTo}. Geo predicates are
 * recorded separately and routed to an RPC by the `db/` layer.
 *
 * The fluent method names mirror the old Appwrite surface so consumer
 * call-sites don't change; each maps to a PostgREST operator (plan §5).
 */
export class QueryBuilder<T extends Record<string, unknown>> {
  private ops: QueryOp[] = []

  private push(fn: PostgrestOp['fn'], ...args: unknown[]): this {
    this.ops.push({ kind: 'postgrest', fn, args })
    return this
  }

  private pushGeo(fn: GeoOp['fn'], column: string, ...args: unknown[]): this {
    this.ops.push({ kind: 'geo', fn, column, args })
    return this
  }

  // --- PostgREST-native filters ---------------------------------------------

  eq<K extends keyof T & string>(field: K, value: FieldValue<T, K>): this {
    return this.push('eq', field, value)
  }

  neq<K extends keyof T & string>(field: K, value: FieldValue<T, K>): this {
    return this.push('neq', field, value)
  }

  gt<K extends keyof T & string>(field: K, value: FieldValue<T, K>): this {
    return this.push('gt', field, value)
  }

  gte<K extends keyof T & string>(field: K, value: FieldValue<T, K>): this {
    return this.push('gte', field, value)
  }

  lt<K extends keyof T & string>(field: K, value: FieldValue<T, K>): this {
    return this.push('lt', field, value)
  }

  lte<K extends keyof T & string>(field: K, value: FieldValue<T, K>): this {
    return this.push('lte', field, value)
  }

  like<K extends keyof T & string>(field: K, pattern: string): this {
    return this.push('like', field, pattern)
  }

  ilike<K extends keyof T & string>(field: K, pattern: string): this {
    return this.push('ilike', field, pattern)
  }

  is<K extends keyof T & string>(field: K, value: boolean | null): this {
    return this.push('is', field, value)
  }

  in<K extends keyof T & string>(field: K, values: FieldValue<T, K>[]): this {
    return this.push('in', field, values)
  }

  contains<K extends keyof T & string>(field: K, value: unknown): this {
    return this.push('contains', field, value)
  }

  containedBy<K extends keyof T & string>(field: K, value: unknown): this {
    return this.push('containedBy', field, value)
  }

  textSearch<K extends keyof T & string>(
    field: K,
    query: string,
    options?: { config?: string; type?: 'plain' | 'phrase' | 'websearch' },
  ): this {
    return options
      ? this.push('textSearch', field, query, options)
      : this.push('textSearch', field, query)
  }

  or(filters: string, options?: { foreignTable?: string; referencedTable?: string }): this {
    return options ? this.push('or', filters, options) : this.push('or', filters)
  }

  not<K extends keyof T & string>(field: K, operator: string, value: unknown): this {
    return this.push('not', field, operator, value)
  }

  // --- Aliases mirroring the old Appwrite fluent surface --------------------

  equal<K extends keyof T & string>(field: K, value: FieldValue<T, K> | FieldValue<T, K>[]): this {
    return Array.isArray(value) ? this.push('in', field, value) : this.push('eq', field, value)
  }

  notEqual<K extends keyof T & string>(field: K, value: FieldValue<T, K>): this {
    return this.push('neq', field, value)
  }

  lessThan<K extends keyof T & string>(field: K, value: FieldValue<T, K>): this {
    return this.push('lt', field, value)
  }

  lessThanEqual<K extends keyof T & string>(field: K, value: FieldValue<T, K>): this {
    return this.push('lte', field, value)
  }

  greaterThan<K extends keyof T & string>(field: K, value: FieldValue<T, K>): this {
    return this.push('gt', field, value)
  }

  greaterThanEqual<K extends keyof T & string>(field: K, value: FieldValue<T, K>): this {
    return this.push('gte', field, value)
  }

  isNull<K extends keyof T & string>(field: K): this {
    return this.push('is', field, null)
  }

  isNotNull<K extends keyof T & string>(field: K): this {
    return this.push('not', field, 'is', null)
  }

  startsWith<K extends keyof T & string>(field: K, prefix: string): this {
    return this.push('like', field, `${prefix}%`)
  }

  endsWith<K extends keyof T & string>(field: K, suffix: string): this {
    return this.push('like', field, `%${suffix}`)
  }

  search<K extends keyof T & string>(field: K, term: string): this {
    return this.push('textSearch', field, term)
  }

  between<K extends keyof T & string>(
    field: K,
    start: FieldValue<T, K>,
    end: FieldValue<T, K>,
  ): this {
    return this.push('gte', field, start).push('lte', field, end)
  }

  cursorAfter<K extends keyof T & string>(field: K, cursor: FieldValue<T, K>): this {
    return this.push('gt', field, cursor).push('order', field, { ascending: true })
  }

  cursorBefore<K extends keyof T & string>(field: K, cursor: FieldValue<T, K>): this {
    return this.push('lt', field, cursor).push('order', field, { ascending: false })
  }

  // --- Modifiers ------------------------------------------------------------

  select(columns: string): this {
    return this.push('select', columns)
  }

  order<K extends keyof T & string>(
    field: K,
    options?: { ascending?: boolean; nullsFirst?: boolean; referencedTable?: string },
  ): this {
    return options ? this.push('order', field, options) : this.push('order', field)
  }

  orderAsc<K extends keyof T & string>(field: K): this {
    return this.push('order', field, { ascending: true })
  }

  orderDesc<K extends keyof T & string>(field: K): this {
    return this.push('order', field, { ascending: false })
  }

  limit(count: number): this {
    return this.push('limit', count)
  }

  range(from: number, to: number): this {
    return this.push('range', from, to)
  }

  // --- PostGIS geo predicates (routed to an RPC by the db layer) ------------

  distanceEqual<K extends keyof T & string>(
    field: K,
    latitude: number,
    longitude: number,
    distance: number,
    meters: boolean = true,
  ): this {
    return this.pushGeo('distanceEqual', field, latitude, longitude, distance, meters)
  }

  distanceNotEqual<K extends keyof T & string>(
    field: K,
    latitude: number,
    longitude: number,
    distance: number,
    meters: boolean = true,
  ): this {
    return this.pushGeo('distanceNotEqual', field, latitude, longitude, distance, meters)
  }

  distanceGreaterThan<K extends keyof T & string>(
    field: K,
    latitude: number,
    longitude: number,
    distance: number,
    meters: boolean = true,
  ): this {
    return this.pushGeo('distanceGreaterThan', field, latitude, longitude, distance, meters)
  }

  distanceLessThan<K extends keyof T & string>(
    field: K,
    latitude: number,
    longitude: number,
    distance: number,
    meters: boolean = true,
  ): this {
    return this.pushGeo('distanceLessThan', field, latitude, longitude, distance, meters)
  }

  intersects<K extends keyof T & string>(field: K, points: [number, number][]): this {
    return this.pushGeo('intersects', field, points)
  }

  notIntersects<K extends keyof T & string>(field: K, points: [number, number][]): this {
    return this.pushGeo('notIntersects', field, points)
  }

  crosses<K extends keyof T & string>(field: K, points: [number, number][]): this {
    return this.pushGeo('crosses', field, points)
  }

  notCrosses<K extends keyof T & string>(field: K, points: [number, number][]): this {
    return this.pushGeo('notCrosses', field, points)
  }

  overlaps<K extends keyof T & string>(field: K, points: [number, number][]): this {
    return this.pushGeo('overlaps', field, points)
  }

  notOverlaps<K extends keyof T & string>(field: K, points: [number, number][]): this {
    return this.pushGeo('notOverlaps', field, points)
  }

  touches<K extends keyof T & string>(field: K, points: [number, number][]): this {
    return this.pushGeo('touches', field, points)
  }

  notTouches<K extends keyof T & string>(field: K, points: [number, number][]): this {
    return this.pushGeo('notTouches', field, points)
  }

  // --- Terminals ------------------------------------------------------------

  /** Serializable descriptor list — hash this into the query key. */
  build(): QueryOp[] {
    return [...this.ops]
  }

  /** Just the geo predicates, for the `db/` layer to route to an RPC. */
  geoOps(): GeoOp[] {
    return this.ops.filter((op): op is GeoOp => op.kind === 'geo')
  }

  /** Whether any geo predicate was recorded (i.e. this query needs an RPC). */
  hasGeo(): boolean {
    return this.ops.some((op) => op.kind === 'geo')
  }

  /**
   * Replays the recorded PostgREST ops onto a live supabase-js filter builder.
   * Geo ops are skipped — the `db/` layer handles them via {@link geoOps}.
   */
  applyTo<Q extends Chainable>(query: Q): Q {
    return this.ops.reduce<Q>((acc, op) => {
      if (op.kind === 'geo') return acc
      const method = acc[op.fn] as (...args: unknown[]) => unknown
      // Call as a bound method — supabase-js filter builders rely on `this`.
      return method.call(acc, ...op.args) as Q
    }, query)
  }
}

/**
 * Creates a new type-safe {@link QueryBuilder} instance.
 *
 * @example
 * ```ts
 * const ops = q<Todo>()
 *   .eq('done', false)
 *   .order('created_at', { ascending: false })
 *   .build()
 * ```
 */
export function q<T extends Record<string, unknown>>(): QueryBuilder<T> {
  return new QueryBuilder<T>()
}
