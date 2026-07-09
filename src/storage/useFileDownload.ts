import type { DownloadFileVariables } from './types'
import { Keys } from '../query/Keys'
import type { SupabaseException } from '../types'
import { useMutation } from '../useMutation'
import { useSupabase } from '../useSupabase'

/**
 * Downloads a file's bytes from a **private** bucket as a `Blob`
 * (`supabase.storage.from(bucket).download()`), the successor to Appwrite's
 * `useFileDownload`. Unlike Appwrite (which returned a download *URL*), this
 * fetches the object body, so it is exposed as a mutation you trigger on demand
 * rather than a query that runs on mount. For **public** buckets, use
 * {@link useFileView} to get a URL instead; for private buckets you need a URL
 * (e.g. for an `<img>` src), use {@link useSignedUrl}.
 *
 * @example
 * ```tsx
 * const { mutateAsync } = useFileDownload()
 * const blob = await mutateAsync({ bucket: 'avatars', path: `${userId}/me.png` })
 * const objectUrl = URL.createObjectURL(blob)
 * ```
 *
 * @returns A `UseMutationResult` whose `data` is the downloaded `Blob`.
 */
export function useFileDownload() {
  const { supabase } = useSupabase()

  return useMutation<Blob, SupabaseException, DownloadFileVariables>({
    mutationKey: [...Keys.buckets().files().key(), 'download'],
    mutationFn: async ({ bucket, path, options }) => {
      const { data, error } = await supabase.storage.from(bucket).download(path, options)
      if (error) throw error
      return data
    },
  })
}
