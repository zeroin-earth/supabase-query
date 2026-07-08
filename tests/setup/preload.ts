import { GlobalRegistrator } from '@happy-dom/global-registrator'
import { configure } from '@testing-library/react'

// happy-dom replaces the global `WebSocket` with a DOM stub that can't reach the
// local Realtime server. Capture Bun's native WebSocket first so the realtime
// integration tests can inject it as the supabase-js realtime transport.
;(globalThis as unknown as { __NATIVE_WEBSOCKET__?: typeof WebSocket }).__NATIVE_WEBSOCKET__ =
  globalThis.WebSocket

// Register a DOM into the global scope so component/hook tests can render.
GlobalRegistrator.register({ url: 'http://localhost' })
configure({ asyncUtilTimeout: 5000 })
