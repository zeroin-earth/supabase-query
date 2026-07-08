import { useAdjustColumn } from './useIncrementColumn'

/**
 * Mutation hook to atomically decrement a numeric column via an RPC, with an
 * optimistic decrease that rolls back on error. Shares the increment RPC with a
 * negated amount (migration plan §8.7).
 *
 * @example
 * ```tsx
 * const { mutate } = useDecrementColumn()
 * mutate({ table: 'todos', id, column: 'priority', amount: 1 })
 * ```
 */
export function useDecrementColumn() {
  return useAdjustColumn(-1)
}
