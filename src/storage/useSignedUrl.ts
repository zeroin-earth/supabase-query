import type { TransformOptions } from './types'
import { Keys } from '../query/Keys'
import type { QueryOptions, SupabaseException } from '../types'
import { useQuery } from '../useQuery'
import { useSupabase } from '../useSupabase'

/**
 * Creates a time-limited signed URL for a file in a **private** bucket
 * (`supabase.storage.from(bucket).createSignedUrl()`). This is the private-bucket
 * counterpart to {@link useFileView}: unlike a public URL it requires a request
 * (it's minted server-side and expires), so it's a query rather than a synchronous
 * hook. There was no Appwrite equivalent — Appwrite's URLs carried access tokens
 * inline; Supabase mints signed URLs on demand.
 *
 * @example
 * ```tsx
 * const { url, isLoading } = useSignedUrl({ bucket: 'user-files', path: `${uid}/doc.pdf` })
 * ```
 *
 * @param params - `bucket`, object `path`, `expiresIn` seconds (default 3600),
 *   optional image `transform`, and optional `download`.
 * @param opts - Optional TanStack query options.
 * @returns The query result plus a `url` accessor (the signed URL string).
 */
export function useSignedUrl(
  {
    bucket,
    path,
    expiresIn = 3600,
    transform,
    download,
  }: {
    bucket: string
    path: string
    expiresIn?: number
    transform?: TransformOptions
    download?: string | boolean
  },
  opts: QueryOptions = {},
) {
  const { supabase } = useSupabase()

  const result = useQuery<string, SupabaseException>({
    queryKey: [
      ...Keys.bucket(bucket).file(path).key(),
      'signedUrl',
      expiresIn,
      download ?? false,
      transform ?? null,
    ],
    queryFn: async () => {
      const { data, error } = await supabase.storage
        .from(bucket)
        .createSignedUrl(path, expiresIn, { transform, download })
      if (error) throw error
      return data.signedUrl
    },
    ...opts,
  })

  return { ...result, url: result.data }
}
