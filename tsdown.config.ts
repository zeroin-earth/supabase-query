import { defineConfig } from 'tsdown'

// Dual build: a web entry (dist/) and a React Native entry (react-native/).
//
// Unlike the Appwrite original, there is no post-build import-swap step:
// `@supabase/supabase-js` is a single universal package that runs on both web
// and React Native, so the two entries differ only in which platform-specific
// helpers they re-export (e.g. web vs. native network adapters), keeping
// RN-only deps out of the web bundle and DOM-only code out of the native one.
//
// Using the object `entry` form (`{ index: … }`) makes the native build emit
// `react-native/index.*` directly — no rename needed.

// tsdown auto-externalizes everything in `dependencies` + `peerDependencies`,
// so react, @supabase/supabase-js, @tanstack/*, and the RN peers are left
// unbundled without an explicit `external` list.
const shared = {
  format: ['esm', 'cjs'] as const,
  dts: true,
  sourcemap: true,
  clean: true,
  treeshake: true,
  minify: true,
}

export default defineConfig([
  {
    ...shared,
    entry: { index: 'src/index.ts' },
    outDir: 'dist',
  },
  {
    ...shared,
    entry: { index: 'src/native-entry.ts' },
    outDir: 'react-native',
  },
])
