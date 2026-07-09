import type { DeleteFileVariables, FileObject } from './types'
import { Keys } from '../query/Keys'
import type { SupabaseException } from '../types'
import { useMutation } from '../useMutation'
import { useQueryClient } from '../useQueryClient'
import { useSupabase } from '../useSupabase'

/**
 * Deletes one or more files from a bucket (`supabase.storage.from(bucket).remove()`),
 * the successor to Appwrite's `useDeleteFile`. On success it removes each file's
 * cached metadata and invalidates the bucket's file list. `remove` takes an array,
 * so this hook accepts a single `path` or several.
 *
 * @example
 * ```tsx
 * const { mutate } = useDeleteFile()
 * mutate({ bucket: 'avatars', paths: `${userId}/me.png` })
 * mutate({ bucket: 'avatars', paths: ['a.png', 'b.png'] })
 * ```
 *
 * @returns A `UseMutationResult` whose `data` is the removed objects ({@link FileObject}`[]`).
 */
export function useDeleteFile() {
  const { supabase } = useSupabase()
  const queryClient = useQueryClient()

  return useMutation<FileObject[], SupabaseException, DeleteFileVariables>({
    mutationKey: Keys.buckets().files().delete(),
    mutationFn: async ({ bucket, paths }) => {
      const list = Array.isArray(paths) ? paths : [paths]
      const { data, error } = await supabase.storage.from(bucket).remove(list)
      if (error) throw error
      return data
    },
    onSuccess: (_data, { bucket, paths }) => {
      const list = Array.isArray(paths) ? paths : [paths]
      for (const path of list) {
        queryClient.removeQueries({ queryKey: Keys.bucket(bucket).file(path).key() })
      }
      void queryClient.invalidateQueries({ queryKey: Keys.bucket(bucket).files().key() })
    },
  })
}
