import { getFileQuery } from './queryOptions'
import type { FileInfo, FileVariables } from './types'
import type { QueryOptions, SupabaseException } from '../types'
import { useQuery } from '../useQuery'
import { useSupabase } from '../useSupabase'

/**
 * Fetches a single file's metadata (`supabase.storage.from(bucket).info(path)`),
 * the successor to Appwrite's `useFile`. Note Supabase addresses objects by
 * **path**, not a file id.
 *
 * @example
 * ```tsx
 * const { file, isLoading } = useFile({ bucket: 'avatars', path: 'me.png' })
 * // file.name, file.metadata.mimetype, file.metadata.size, …
 * ```
 *
 * @param variables - `bucket` and object `path`.
 * @param opts - Optional TanStack query options.
 * @returns The query result plus a `file` accessor ({@link FileInfo}).
 */
export function useFile({ bucket, path }: FileVariables, opts: QueryOptions = {}) {
  const { supabase } = useSupabase()
  const result = useQuery<FileInfo, SupabaseException>({
    ...getFileQuery(supabase, { bucket, path }),
    ...opts,
  })
  return { ...result, file: result.data }
}
