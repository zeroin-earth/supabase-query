import { useContext } from 'react'
import { QueryClientContext } from '@tanstack/react-query'

/**
 * Returns the TanStack Query `QueryClient` from the nearest `QueryClientProvider`.
 * Throws if called outside a provider.
 */
export function useQueryClient() {
  const ctx = useContext(QueryClientContext)
  if (!ctx) throw new Error('Wrap your app in <QueryClientProvider>')
  return ctx
}
