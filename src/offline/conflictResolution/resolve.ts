import type { ConflictContext, ConflictStrategy } from './types'

/**
 * Applies a conflict resolution strategy to produce the merged row data that
 * should be sent to the server, or `'abort'` to discard the mutation.
 *
 * Pure, backend-agnostic logic — ported verbatim from the Appwrite library.
 *
 * @returns The resolved field-level data (not the full row — just the fields to
 *          write), or `'abort'` if the mutation should be dropped.
 */
export function resolveConflict(
  context: ConflictContext,
  strategy: ConflictStrategy,
): Record<string, unknown> | 'abort' {
  if (typeof strategy === 'function') {
    return strategy(context)
  }

  switch (strategy) {
    case 'last-write-wins':
      return extractChangedFields(context.base, context.local)

    case 'server-wins':
      return 'abort'

    case 'merge-shallow': {
      const localChanges = extractChangedFields(context.base, context.local)
      const remoteChanges = extractChangedFields(context.base, context.remote)

      // Remote changes win where both sides modified the same field
      return { ...localChanges, ...remoteChanges }
    }
  }
}

/**
 * Returns only the fields in `updated` that differ from `original`.
 */
function extractChangedFields(
  original: Record<string, unknown>,
  updated: Record<string, unknown>,
): Record<string, unknown> {
  const changes: Record<string, unknown> = {}

  for (const key of Object.keys(updated)) {
    if (JSON.stringify(original[key]) !== JSON.stringify(updated[key])) {
      changes[key] = updated[key]
    }
  }

  return changes
}
