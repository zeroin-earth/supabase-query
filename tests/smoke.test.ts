import { expect, test } from 'bun:test'

import pkg from '../package.json' with { type: 'json' }
import { version } from '../src/index.shared'

test('package builds and exports load', () => {
  expect(version).toBeTruthy()
})

// Pinning the literal here is what let the exported `version` sit at 0.1.0 while
// the package shipped 1.0.0. Compare the two instead.
test('the exported version matches package.json', () => {
  expect(version).toBe(pkg.version)
})
