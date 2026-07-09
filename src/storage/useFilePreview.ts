import { useMemo } from 'react'

import type { TransformOptions } from './types'
import { useSupabase } from '../useSupabase'

/**
 * Returns a public URL for a file with image transformations applied
 * (`getPublicUrl(path, { transform })`), the successor to Appwrite's
 * `useFilePreview`. Synchronous and memoized (no request). Supabase's
 * transform options replace Appwrite's flat resize/crop/border params:
 * `{ width, height, resize, quality, format }`. For **private** buckets, pass
 * the same `transform` to {@link useSignedUrl}.
 *
 * @example
 * ```tsx
 * const url = useFilePreview({
 *   bucket: 'public-assets',
 *   path: 'me.png',
 *   transform: { width: 100, height: 100, resize: 'cover' },
 * })
 * ```
 *
 * @param params - `bucket`, object `path`, optional `transform`, and optional
 *   `download`.
 * @returns The transformed public URL string.
 */
export function useFilePreview({
  bucket,
  path,
  transform,
  download,
}: {
  bucket: string
  path: string
  transform?: TransformOptions
  download?: string | boolean
}) {
  const { supabase } = useSupabase()

  return useMemo(
    () => supabase.storage.from(bucket).getPublicUrl(path, { transform, download }).data.publicUrl,
    [supabase, bucket, path, transform, download],
  )
}
