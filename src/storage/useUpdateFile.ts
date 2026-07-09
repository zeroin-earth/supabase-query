import type { UpdateFileVariables, UploadResult } from './types'
import { Keys } from '../query/Keys'
import type { SupabaseException } from '../types'
import { useMutation } from '../useMutation'
import { useQueryClient } from '../useQueryClient'
import { useSupabase } from '../useSupabase'

/**
 * Replaces a file's contents at `path` (`supabase.storage.from(bucket).update()`),
 * the successor to Appwrite's `useUpdateFile`. Appwrite's `useUpdateFile` renamed
 * or re-permissioned a file; in Supabase renaming is {@link useMoveFile}-style
 * (`move`) and access is governed by storage RLS — this hook overwrites the bytes.
 * Invalidates the file's metadata and the bucket's file list on success.
 *
 * @example
 * ```tsx
 * const { mutate } = useUpdateFile()
 * mutate({ bucket: 'avatars', path: `${userId}/me.png`, file: newFile })
 * ```
 *
 * @returns A `UseMutationResult` whose `data` is the updated object
 *   ({@link UploadResult}: `{ id, path, fullPath }`).
 */
export function useUpdateFile() {
  const { supabase } = useSupabase()
  const queryClient = useQueryClient()

  return useMutation<UploadResult, SupabaseException, UpdateFileVariables>({
    mutationKey: Keys.buckets().files().update(),
    mutationFn: async ({ bucket, path, file, options }) => {
      const { data, error } = await supabase.storage.from(bucket).update(path, file, options)
      if (error) throw error
      return data
    },
    onSuccess: (_data, { bucket, path }) => {
      void queryClient.invalidateQueries({ queryKey: Keys.bucket(bucket).file(path).key() })
      void queryClient.invalidateQueries({ queryKey: Keys.bucket(bucket).files().key() })
    },
  })
}
