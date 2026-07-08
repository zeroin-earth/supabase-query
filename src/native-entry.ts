export * from './index.shared'

// React Native-only exports: the native provider (no web devtools), the RN
// network adapter (watches NetInfo), and the `createSupabaseQuery` factory bound
// to the native provider. tsdown emits this to `react-native/index.*`.
export { reactNativeNetworkAdapter } from './offline/network/native'

import { makeCreateSupabaseQuery } from './createSupabaseQuery'
import { SupabaseProvider } from './SupabaseProviderNative'

export { SupabaseProvider }
export const createSupabaseQuery = makeCreateSupabaseQuery(SupabaseProvider)
