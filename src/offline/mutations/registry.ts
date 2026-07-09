import type { QueryClient } from '@tanstack/react-query'

import { conflictAwareUpdate } from './conflictAwareUpdate'
import type { IncrementColumnVariables } from '../../db/types'
import { createRowFn } from '../../db/useCreateRow'
import { deleteRowFn } from '../../db/useDeleteRow'
import { incrementColumnFn } from '../../db/useIncrementColumn'
import { upsertRowFn } from '../../db/useUpsertRow'
import { Keys } from '../../query/Keys'
import { deleteTeamFn } from '../../teams/useDeleteTeam'
import { updateTeamNameFn } from '../../teams/useUpdateTeamName'
import { updateTeamPrefsFn } from '../../teams/useUpdateTeamPrefs'
import type { AnySupabaseClient } from '../../types'
import type { ConflictStrategy } from '../conflictResolution/types'
import type { MutationFn, Vars } from '../types'

/**
 * Wraps a standalone Supabase mutation fn (`createRowFn`, `deleteRowFn`, …) into
 * the registry's {@link MutationFn} signature. The standalone fns carry `table`
 * (and `id`/`schema`) inside their variables, so a paused mutation can be
 * replayed from its persisted variables alone — the hook's closure is gone by
 * then. This replaces the Appwrite `gqlMutation` factory.
 */
function supabaseMutation(
  fn: (client: AnySupabaseClient, variables: never) => Promise<unknown>,
): MutationFn {
  return (client, variables) => fn(client, variables as never)
}

type MutationEntry = {
  mutationKey: readonly string[]
  mutationFn: MutationFn
}

// Only *data* mutations belong in the offline replay queue. Auth mutations go
// through GoTrue, which is inherently online (it mints/refreshes tokens
// server-side), so they are deliberately absent here (migration plan §6.5). The
// row `update` entry is registered separately in `hydrateMutationDefaults` so it
// can carry the user's conflict-resolution strategy.
//
// Teams (P9): only the plain-table team writes are offline-queueable —
// `useUpdateTeamName`/`useUpdateTeamPrefs`/`useDeleteTeam` (`.from('teams')`).
// `create_team` and every membership op are RPC / Edge-Function calls and stay
// online-only, exactly like auth (migration plan §8.8 "Offline wiring"). These
// use the canonical `teams` table name; a name-overridden project's offline
// *restart* replay falls back to canonical (an accepted edge case, §8.8).
export const mutationRegistry: MutationEntry[] = [
  {
    mutationKey: Keys.schema().table('').rows().create(),
    mutationFn: supabaseMutation(createRowFn),
  },
  {
    mutationKey: Keys.schema().table('').rows().delete(),
    mutationFn: supabaseMutation(deleteRowFn),
  },
  {
    mutationKey: Keys.schema().table('').rows().upsert(),
    mutationFn: supabaseMutation(upsertRowFn),
  },
  {
    mutationKey: [...Keys.schema().table('').rows().key(), 'incrementColumn'],
    mutationFn: supabaseMutation(incrementColumnFn),
  },
  {
    // Decrement stores a positive `amount` in its variables (the hook negates at
    // call time), so the replay must negate too, matching `useDecrementColumn`.
    mutationKey: [...Keys.schema().table('').rows().key(), 'decrementColumn'],
    mutationFn: (client, variables) => {
      const vars = variables as IncrementColumnVariables
      return incrementColumnFn(client, { ...vars, amount: -(vars.amount ?? 1) })
    },
  },
  // Teams — offline-queueable plain-table writes (P9).
  {
    mutationKey: Keys.teams().teamName().update(),
    mutationFn: supabaseMutation(updateTeamNameFn),
  },
  {
    mutationKey: Keys.teams().teamPrefs().update(),
    mutationFn: supabaseMutation(updateTeamPrefsFn),
  },
  {
    mutationKey: Keys.teams().delete(),
    mutationFn: supabaseMutation(deleteTeamFn),
  },
]

/**
 * Registers all mutation defaults with the QueryClient so that
 * dehydrated/persisted mutations can be replayed on app restart.
 *
 * Call once during app initialization, before rehydrating the persisted
 * mutation cache.
 */
export function hydrateMutationDefaults(
  queryClient: QueryClient,
  client: AnySupabaseClient,
  options?: { conflictStrategy?: ConflictStrategy },
) {
  for (const entry of mutationRegistry) {
    queryClient.setMutationDefaults(entry.mutationKey, {
      mutationFn: (variables: Vars) => entry.mutationFn(client, variables, queryClient),
      scope: { id: 'supabase' },
    })
  }

  // Register the row update mutation with conflict-resolution awareness.
  const strategy = options?.conflictStrategy ?? 'last-write-wins'
  queryClient.setMutationDefaults(Keys.schema().table('').rows().update(), {
    mutationFn: (variables: Vars) => conflictAwareUpdate(strategy)(client, variables, queryClient),
    scope: { id: 'supabase' },
  })
}
