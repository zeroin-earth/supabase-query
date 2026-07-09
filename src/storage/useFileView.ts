import { useMemo } from 'react'

import { useSupabase } from '../useSupabase'

/**
 * Returns the public URL for a file in a **public** bucket
 * (`supabase.storage.from(bucket).getPublicUrl(path)`), the successor to
 * Appwrite's `useFileView`. This is synchronous and memoized (no request) — the
 * URL is derived from the bucket + path. For **private** buckets use
 * {@link useSignedUrl} instead.
 *
 * @example
 * ```tsx
 * const url = useFileView({ bucket: 'public-assets', path: 'logo.png' })
 * // <img src={url} />
 * ```
 *
 * @param params - `bucket`, object `path`, and optional `download` (`true` or a
 *   filename) to serve the file as an attachment.
 * @returns The public URL string.
 */
export function useFileView({
  bucket,
  path,
  download,
}: {
  bucket: string
  path: string
  download?: string | boolean
}) {
  const { supabase } = useSupabase()

  return useMemo(
    () => supabase.storage.from(bucket).getPublicUrl(path, { download }).data.publicUrl,
    [supabase, bucket, path, download],
  )
}
