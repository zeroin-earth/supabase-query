import { renderHook } from '@testing-library/react'
import { expect, test } from 'bun:test'

import { createSupabaseClient, useSupabase } from '../src/index.shared'

test('createSupabaseClient returns one client exposing every service', () => {
  const { supabase } = createSupabaseClient({
    url: 'http://localhost:54321',
    anonKey: 'test-anon-key',
  })

  expect(typeof supabase.from).toBe('function')
  expect(typeof supabase.auth.getUser).toBe('function')
  expect(typeof supabase.storage.from).toBe('function')
  expect(typeof supabase.functions.invoke).toBe('function')
  expect(typeof supabase.channel).toBe('function')
  expect(typeof supabase.rpc).toBe('function')
})

test('useSupabase throws when used outside a provider', () => {
  expect(() => renderHook(() => useSupabase())).toThrow('Wrap your app in <SupabaseProvider>')
})
