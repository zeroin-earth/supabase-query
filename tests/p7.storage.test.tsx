import * as React from 'react'
import { QueryClient } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import { afterAll, beforeAll, describe, expect, test } from 'bun:test'

import { type AuthedUser, createAuthedUser } from './setup/localStack'
import type { SupabaseHooksClient } from '../src/client'
import { useCreateFile } from '../src/storage/useCreateFile'
import { useDeleteFile } from '../src/storage/useDeleteFile'
import { useFile } from '../src/storage/useFile'
import { useFileDownload } from '../src/storage/useFileDownload'
import { useFilePreview } from '../src/storage/useFilePreview'
import { useFiles } from '../src/storage/useFiles'
import { useFileView } from '../src/storage/useFileView'
import { useSignedUrl } from '../src/storage/useSignedUrl'
import { useUpdateFile } from '../src/storage/useUpdateFile'
import { SupabaseProvider } from '../src/SupabaseProvider'

const PRIVATE_BUCKET = 'user-files'
const PUBLIC_BUCKET = 'public-assets'

let authed: AuthedUser

beforeAll(async () => {
  authed = await createAuthedUser()
})

afterAll(async () => {
  await authed.cleanup()
})

/** Provider + fresh QueryClient bound to the authed client. */
function setup() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity }, mutations: { retry: false } },
  })
  const client = { supabase: authed.supabase } as SupabaseHooksClient
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <SupabaseProvider client={client} queryClient={queryClient}>
      {children}
    </SupabaseProvider>
  )
  return { queryClient, wrapper }
}

/** A unique object path under the user's own prefix (satisfies owner RLS). */
function uniquePath(name = 'file.txt') {
  return `${authed.uid}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}-${name}`
}

const textBlob = (text: string) => new Blob([text], { type: 'text/plain' })

describe('P7 storage — private bucket CRUD', () => {
  test('useCreateFile uploads and useFiles lists the object', async () => {
    const { wrapper } = setup()
    const path = uniquePath()

    const create = renderHook(() => useCreateFile(), { wrapper })
    let uploaded: { path: string } | undefined
    await act(async () => {
      uploaded = await create.result.current.mutateAsync({
        bucket: PRIVATE_BUCKET,
        path,
        file: textBlob('hello world'),
      })
    })
    expect(uploaded?.path).toBe(path)

    // list the folder the object lives in and find it by name
    const folder = path.slice(0, path.lastIndexOf('/'))
    const name = path.slice(path.lastIndexOf('/') + 1)
    const list = renderHook(() => useFiles({ bucket: PRIVATE_BUCKET, path: folder }), { wrapper })
    await waitFor(() => expect(list.result.current.isSuccess).toBe(true))
    expect(list.result.current.files?.some((f) => f.name === name)).toBe(true)
  })

  test('useFile returns metadata for an uploaded object', async () => {
    const { wrapper } = setup()
    const path = uniquePath('info.txt')

    const create = renderHook(() => useCreateFile(), { wrapper })
    await act(async () => {
      await create.result.current.mutateAsync({
        bucket: PRIVATE_BUCKET,
        path,
        file: textBlob('metadata please'),
      })
    })

    const info = renderHook(() => useFile({ bucket: PRIVATE_BUCKET, path }), { wrapper })
    await waitFor(() => expect(info.result.current.isSuccess).toBe(true))
    expect(info.result.current.file?.name).toBe(path)
  })

  test('useFileDownload returns the object bytes as a Blob', async () => {
    const { wrapper } = setup()
    const path = uniquePath('download.txt')
    const contents = 'download me'

    const create = renderHook(() => useCreateFile(), { wrapper })
    await act(async () => {
      await create.result.current.mutateAsync({
        bucket: PRIVATE_BUCKET,
        path,
        file: textBlob(contents),
      })
    })

    const download = renderHook(() => useFileDownload(), { wrapper })
    let blob: Blob
    await act(async () => {
      blob = await download.result.current.mutateAsync({ bucket: PRIVATE_BUCKET, path })
    })
    expect(await blob!.text()).toBe(contents)
  })

  test('useUpdateFile overwrites the object contents', async () => {
    const { wrapper } = setup()
    const path = uniquePath('update.txt')

    const create = renderHook(() => useCreateFile(), { wrapper })
    await act(async () => {
      await create.result.current.mutateAsync({
        bucket: PRIVATE_BUCKET,
        path,
        file: textBlob('v1'),
      })
    })

    const update = renderHook(() => useUpdateFile(), { wrapper })
    let updated: { path: string } | undefined
    await act(async () => {
      updated = await update.result.current.mutateAsync({
        bucket: PRIVATE_BUCKET,
        path,
        file: textBlob('v2'),
      })
    })
    expect(updated?.path).toBe(path)

    const { data, error } = await authed.supabase.storage.from(PRIVATE_BUCKET).download(path)
    expect(error).toBeNull()
    expect(await data!.text()).toBe('v2')
  })

  test('useDeleteFile removes the object', async () => {
    const { wrapper } = setup()
    const path = uniquePath('delete.txt')

    const create = renderHook(() => useCreateFile(), { wrapper })
    await act(async () => {
      await create.result.current.mutateAsync({
        bucket: PRIVATE_BUCKET,
        path,
        file: textBlob('bye'),
      })
    })

    const del = renderHook(() => useDeleteFile(), { wrapper })
    await act(async () => {
      await del.result.current.mutateAsync({ bucket: PRIVATE_BUCKET, paths: path })
    })

    const { data } = await authed.supabase.storage.from(PRIVATE_BUCKET).download(path)
    expect(data).toBeNull()
  })
})

describe('P7 storage — URLs', () => {
  test('useSignedUrl mints a URL that serves the private object', async () => {
    const { wrapper } = setup()
    const path = uniquePath('signed.txt')
    const contents = 'signed contents'

    const create = renderHook(() => useCreateFile(), { wrapper })
    await act(async () => {
      await create.result.current.mutateAsync({
        bucket: PRIVATE_BUCKET,
        path,
        file: textBlob(contents),
      })
    })

    const signed = renderHook(() => useSignedUrl({ bucket: PRIVATE_BUCKET, path }), { wrapper })
    await waitFor(() => expect(signed.result.current.isSuccess).toBe(true))
    const url = signed.result.current.url!
    expect(url).toContain('token=')

    const res = await fetch(url)
    expect(res.ok).toBe(true)
    expect(await res.text()).toBe(contents)
  })

  test('useFileView returns a public URL that serves the object', async () => {
    const { wrapper } = setup()
    const path = uniquePath('public.txt')
    const contents = 'public contents'

    const create = renderHook(() => useCreateFile(), { wrapper })
    await act(async () => {
      await create.result.current.mutateAsync({
        bucket: PUBLIC_BUCKET,
        path,
        file: textBlob(contents),
      })
    })

    const view = renderHook(() => useFileView({ bucket: PUBLIC_BUCKET, path }), { wrapper })
    const url = view.result.current
    expect(url).toContain(`/public/${PUBLIC_BUCKET}/`)

    const res = await fetch(url)
    expect(res.ok).toBe(true)
    expect(await res.text()).toBe(contents)
  })

  test('useFilePreview encodes image transform options in the URL', async () => {
    const { wrapper } = setup()
    const view = renderHook(
      () =>
        useFilePreview({
          bucket: PUBLIC_BUCKET,
          path: 'some/image.png',
          transform: { width: 100, height: 100 },
        }),
      { wrapper },
    )
    const url = view.result.current
    expect(url).toContain('/render/image/public/')
    expect(url).toContain('width=100')
    expect(url).toContain('height=100')
  })
})
