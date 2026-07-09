import type { CreateFileVariables, UploadResult } from './types'
import { Keys } from '../query/Keys'
import type { SupabaseException } from '../types'
import { useMutation } from '../useMutation'
import { useQueryClient } from '../useQueryClient'
import { useSupabase } from '../useSupabase'

/**
 * Uploads a file to a storage bucket (`supabase.storage.from(bucket).upload()`),
 * the successor to Appwrite's `useCreateFile`. Invalidates the bucket's file list
 * on success. Access is governed by storage RLS policies (§8.6) — there is no
 * `permissions` argument.
 *
 * > Unlike Appwrite's chunked upload, supabase-js does not report upload
 * > progress; for large resumable uploads use the TUS endpoint directly.
 *
 * @example
 * ```tsx
 * const { mutate, isPending } = useCreateFile()
 * mutate({ bucket: 'avatars', path: `${userId}/me.png`, file, options: { upsert: false } })
 * ```
 *
 * @returns A `UseMutationResult` whose `data` is the created object
 *   ({@link UploadResult}: `{ id, path, fullPath }`).
 */
export function useCreateFile() {
  const { supabase } = useSupabase()
  const queryClient = useQueryClient()

  return useMutation<UploadResult, SupabaseException, CreateFileVariables>({
    mutationKey: Keys.buckets().files().create(),
    mutationFn: async ({ bucket, path, file, options }) => {
      const { data, error } = await supabase.storage.from(bucket).upload(path, file, options)
      if (error) throw error
      return data
    },
    onSuccess: (_data, { bucket }) => {
      void queryClient.invalidateQueries({ queryKey: Keys.bucket(bucket).files().key() })
    },
  })
}
