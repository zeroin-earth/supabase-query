import { getFilesQuery } from './queryOptions'
import type { FileObject, FilesVariables } from './types'
import type { QueryOptions, SupabaseException } from '../types'
import { useQuery } from '../useQuery'
import { useSupabase } from '../useSupabase'

/**
 * Lists files in a storage bucket (`supabase.storage.from(bucket).list()`), the
 * successor to Appwrite's `useFiles`. Pass a folder `path` to list within it and
 * `options` (`limit`/`offset`/`search`/`sortBy`) to paginate or filter.
 *
 * @example
 * ```tsx
 * const { files, isLoading } = useFiles({ bucket: 'avatars', options: { limit: 25 } })
 * ```
 *
 * @param variables - `bucket`, optional folder `path`, and list `options`.
 * @param opts - Optional TanStack query options.
 * @returns The query result plus a `files` accessor ({@link FileObject}`[]`).
 */
export function useFiles({ bucket, path, options }: FilesVariables, opts: QueryOptions = {}) {
  const { supabase } = useSupabase()
  const result = useQuery<FileObject[], SupabaseException>({
    ...getFilesQuery(supabase, { bucket, path, options }),
    ...opts,
  })
  return { ...result, files: result.data }
}
