export * from './index.shared'

// Web-only exports: the DOM provider (with React Query Devtools), the web
// network adapter (watches `navigator.onLine`), and the `createSupabaseQuery`
// factory bound to the DOM provider. RN-only deps never mix in here.
export { webNetworkAdapter } from './offline/network/web'

import { makeCreateSupabaseQuery } from './createSupabaseQuery'
import { SupabaseProvider } from './SupabaseProvider'

export { SupabaseProvider }
export const createSupabaseQuery = makeCreateSupabaseQuery(SupabaseProvider)
