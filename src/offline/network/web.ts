import type { NetworkAdapter } from '../types'

export function webNetworkAdapter(): NetworkAdapter {
  return {
    listen: (callback) => {
      const updateOnlineStatus = () => {
        callback(navigator.onLine)
      }

      window.addEventListener('online', updateOnlineStatus)
      window.addEventListener('offline', updateOnlineStatus)

      // Initial status
      callback(navigator.onLine)

      return () => {
        window.removeEventListener('online', updateOnlineStatus)
        window.removeEventListener('offline', updateOnlineStatus)
      }
    },
  }
}
