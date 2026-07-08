import type { User } from '@supabase/supabase-js'

import type { UpdateUserVariables } from './types'
import { Keys } from '../query/Keys'
import type { SupabaseException } from '../types'
import { useMutation } from '../useMutation'
import { useQueryClient } from '../useQueryClient'
import { useSupabase } from '../useSupabase'

/**
 * Updates the current user — any subset of `email`, `phone`, `password`, and
 * `data` (merged into `user_metadata`). One hook collapses Appwrite's separate
 * `useUpdateName` / `useUpdateEmail` / `useUpdatePassword` / `useUpdatePhone` /
 * `useUpdatePrefs` (name and prefs are both just metadata now).
 *
 * Changing `email`/`phone` may require confirmation depending on project
 * settings; the change only takes effect once confirmed. On success the fresh
 * user is written into the auth cache.
 *
 * @example
 * ```tsx
 * const { mutate } = useUpdateUser()
 * mutate({ data: { name: 'New Name' } })
 * mutate({ password: 'new-password' })
 * ```
 */
export function useUpdateUser() {
  const { supabase } = useSupabase()
  const queryClient = useQueryClient()

  return useMutation<User, SupabaseException, UpdateUserVariables>({
    mutationKey: [...Keys.auth().key(), 'update'],
    mutationFn: async ({ email, phone, password, data }) => {
      const { data: result, error } = await supabase.auth.updateUser({
        email,
        phone,
        password,
        data,
      })
      if (error) throw error
      return result.user
    },
    onSuccess: (user) => {
      queryClient.setQueryData(Keys.auth().key(), user)
    },
  })
}
