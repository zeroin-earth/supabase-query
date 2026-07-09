// The `storage/` module: hooks over `supabase.storage` (migration plan §6.2).
// Also available fully wired via the `createSupabaseQuery` factory
// (`makeStorageHooks`). Not `Database`-parameterized — buckets are runtime
// resources addressed by bucket + path, not part of the generated schema type.

export { getFilesQuery, getFileQuery } from './queryOptions'
export { useFiles } from './useFiles'
export { useFile } from './useFile'
export { useCreateFile } from './useCreateFile'
export { useUpdateFile } from './useUpdateFile'
export { useDeleteFile } from './useDeleteFile'
export { useFileDownload } from './useFileDownload'
export { useFileView } from './useFileView'
export { useFilePreview } from './useFilePreview'
export { useSignedUrl } from './useSignedUrl'
export type {
  CreateFileVariables,
  DeleteFileVariables,
  DownloadFileVariables,
  DownloadOptions,
  FileBody,
  FileInfo,
  FileObject,
  FileOptions,
  FilesVariables,
  FileVariables,
  SearchOptions,
  TransformOptions,
  UpdateFileVariables,
  UploadResult,
} from './types'
