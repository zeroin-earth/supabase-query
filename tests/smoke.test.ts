import { expect, test } from 'bun:test'

import { version } from '../src/index.shared'

test('package builds and exports load', () => {
  expect(version).toBe('0.1.0')
})
