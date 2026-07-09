import type { FileInfo, FileObject, FilesVariables, FileVariables } from './types'
import { Keys } from '../query/Keys'
import type { AnySupabaseClient } from '../types'

/**
 * Query config for listing files in a bucket (`storage.from(bucket).list()`).
 * Cached under `Keys.bucket(bucket).files()` plus any `path`/`options` so
 * distinct listings don't collide.
 */
export function getFilesQuery(supabase: AnySupabaseClient, { bucket, path, options }: FilesVariables) {
  return {
    queryKey: [
      ...Keys.bucket(bucket).files().key(),
      ...(path ? [path] : []),
      ...(options ? [options] : []),
    ],
    queryFn: async (): Promise<FileObject[]> => {
      const { data, error } = await supabase.storage.from(bucket).list(path, options)
      if (error) throw error
      return data
    },
  }
}

/**
 * Query config for a single file's metadata (`storage.from(bucket).info()`).
 * Cached under `Keys.bucket(bucket).file(path)` — the same key the create/update/
 * delete mutations invalidate.
 */
export function getFileQuery(supabase: AnySupabaseClient, { bucket, path }: FileVariables) {
  return {
    queryKey: Keys.bucket(bucket).file(path).key(),
    queryFn: async (): Promise<FileInfo> => {
      const { data, error } = await supabase.storage.from(bucket).info(path)
      if (error) throw error
      return data
    },
  }
}
