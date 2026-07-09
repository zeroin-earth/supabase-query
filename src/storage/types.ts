import type { AnySupabaseClient } from '../types'

// The storage types below are all derived from the live `storage.from()` API
// so they always match the installed `@supabase/storage-js` version — without
// importing that transitive package (only `@supabase/supabase-js` is a declared
// dependency). This mirrors how `src/types.ts` derives `StorageError`.

/** The file API instance returned by `supabase.storage.from(bucket)`. */
type StorageFileApi = ReturnType<AnySupabaseClient['storage']['from']>

/** Metadata for a file entry returned by {@link useFiles} (`storage.from().list()`). */
export type FileObject = NonNullable<Awaited<ReturnType<StorageFileApi['list']>>['data']>[number]

/** Detailed metadata for a single file via {@link useFile} (`storage.from().info()`). */
export type FileInfo = NonNullable<Awaited<ReturnType<StorageFileApi['info']>>['data']>

/** The `{ id, path, fullPath }` returned by {@link useCreateFile}/{@link useUpdateFile}. */
export type UploadResult = NonNullable<Awaited<ReturnType<StorageFileApi['upload']>>['data']>

/** The binary body accepted by `upload`/`update` (File, Blob, ArrayBuffer, string, …). */
export type FileBody = Parameters<StorageFileApi['upload']>[1]

/** Upload/update options — `cacheControl`, `contentType`, `upsert`, … */
export type FileOptions = NonNullable<Parameters<StorageFileApi['upload']>[2]>

/** `list()` options — `limit`, `offset`, `search`, `sortBy`. */
export type SearchOptions = NonNullable<Parameters<StorageFileApi['list']>[1]>

/** Image transform options for previews / signed URLs (`width`, `height`, `resize`, …). */
export type TransformOptions = NonNullable<
  NonNullable<Parameters<StorageFileApi['createSignedUrl']>[2]>['transform']
>

/** `download()` options — currently `{ transform }`. */
export type DownloadOptions = NonNullable<Parameters<StorageFileApi['download']>[1]>

// --- Variable shapes ----------------------------------------------------------
// Supabase addresses objects by **bucket + path** (not Appwrite's `bucketId` +
// `fileId`): `path` is the object's key within the bucket, e.g. `avatars/me.png`.

/** Variables for {@link useFiles}. */
export type FilesVariables = {
  bucket: string
  /** Folder prefix to list within the bucket. Omit to list the bucket root. */
  path?: string
  options?: SearchOptions
}

/** Variables for {@link useFile}. */
export type FileVariables = { bucket: string; path: string }

/** Variables for {@link useCreateFile}. */
export type CreateFileVariables = {
  bucket: string
  /** Destination object path within the bucket, e.g. `avatars/me.png`. */
  path: string
  file: FileBody
  options?: FileOptions
}

/** Variables for {@link useUpdateFile} — replaces the object's contents at `path`. */
export type UpdateFileVariables = CreateFileVariables

/** Variables for {@link useDeleteFile}. */
export type DeleteFileVariables = {
  bucket: string
  /** One path or several — both delete the matching objects in one request. */
  paths: string | string[]
}

/** Variables for {@link useFileDownload}. */
export type DownloadFileVariables = {
  bucket: string
  path: string
  options?: DownloadOptions
}
