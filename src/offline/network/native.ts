import NetInfo, { type NetInfoState } from '@react-native-community/netinfo'

import type { NetworkAdapter } from '../types'

export function reactNativeNetworkAdapter(): NetworkAdapter {
  return {
    listen: (callback) => {
      const handleConnectivityChange = (state: NetInfoState) => {
        callback(state.isConnected ?? false)
      }

      const unsubscribe = NetInfo.addEventListener(handleConnectivityChange)

      // Initial status
      void NetInfo.fetch().then((state: NetInfoState) => {
        callback(state.isConnected ?? false)
      })

      return () => {
        unsubscribe()
      }
    },
  }
}
