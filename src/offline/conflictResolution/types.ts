/**
 * A row participating in conflict resolution. Unlike Appwrite (which wrapped
 * fields in a `Models.DefaultDocument` with a `data` JSON blob) a Supabase row
 * is a plain column object, so the strategies operate on `Record<string, unknown>`
 * directly. The logic below is otherwise unchanged from the Appwrite library.
 */
export type ConflictDocument = Record<string, unknown>

export type ConflictStrategy =
  | 'last-write-wins'
  | 'server-wins' // discard local mutation, keep remote
  | 'merge-shallow' // { ...localChanges, ...remoteChanges }
  | ((context: ConflictContext) => Record<string, string | number | boolean | null> | 'abort')

export type ConflictContext = {
  base: ConflictDocument // snapshot from when mutation was created
  remote: ConflictDocument // current server state (fetched at replay time)
  local: ConflictDocument // what the user wanted to write
  mutationKey: string[]
}
