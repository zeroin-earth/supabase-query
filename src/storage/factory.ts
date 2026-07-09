import { useCreateFile } from './useCreateFile'
import { useDeleteFile } from './useDeleteFile'
import { useFile } from './useFile'
import { useFileDownload } from './useFileDownload'
import { useFilePreview } from './useFilePreview'
import { useFiles } from './useFiles'
import { useFileView } from './useFileView'
import { useSignedUrl } from './useSignedUrl'
import { useUpdateFile } from './useUpdateFile'

/**
 * The `storage/` hook set returned by `createSupabaseQuery`.
 *
 * Like `makeAuthHooks`, this isn't parameterized by the consumer's `Database` —
 * storage buckets are runtime resources addressed by bucket + path, not part of
 * the generated schema type — so it just bundles the hooks (kept symmetric with
 * `makeDbHooks`/`makeAuthHooks` so all three spread into the factory the same way).
 * @internal
 */
export function makeStorageHooks() {
  return {
    useFiles,
    useFile,
    useCreateFile,
    useUpdateFile,
    useDeleteFile,
    useFileDownload,
    useFileView,
    useFilePreview,
    useSignedUrl,
  }
}
