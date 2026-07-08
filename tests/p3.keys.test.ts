import { describe, expect, test } from 'bun:test'

import { Keys } from '../src/query/Keys'

describe('Keys — root + auth', () => {
  test('auth root equals the placeholder auth-state key', () => {
    expect(Keys.auth().key()).toEqual(['supabase', 'auth'])
  })

  test('every key is rooted at "supabase"', () => {
    expect(Keys.schema().key()[0]).toBe('supabase')
    expect(Keys.buckets().key()[0]).toBe('supabase')
  })

  test('auth verbs', () => {
    expect(Keys.auth().login().key()).toEqual(['supabase', 'auth', 'login'])
    expect(Keys.auth().signUp().key()).toEqual(['supabase', 'auth', 'signUp'])
    expect(Keys.auth().oauth().key()).toEqual(['supabase', 'auth', 'oauth'])
    expect(Keys.auth().magicLink().key()).toEqual(['supabase', 'auth', 'magicLink'])
    expect(Keys.auth().emailOtp().key()).toEqual(['supabase', 'auth', 'emailOtp'])
    expect(Keys.auth().phoneOtp().key()).toEqual(['supabase', 'auth', 'phoneOtp'])
    expect(Keys.auth().anonymous().key()).toEqual(['supabase', 'auth', 'anonymous'])
    expect(Keys.auth().mfa().key()).toEqual(['supabase', 'auth', 'mfa'])
  })

  test('auth terminals', () => {
    expect(Keys.auth().session()).toEqual(['supabase', 'auth', 'session'])
    expect(Keys.auth().identities()).toEqual(['supabase', 'auth', 'identities'])
    expect(Keys.auth().mfaFactors()).toEqual(['supabase', 'auth', 'mfaFactors'])
  })
})

describe('Keys — schema/table/row (unified DB hierarchy)', () => {
  test('schema defaults to public', () => {
    expect(Keys.schema().key()).toEqual(['supabase', 'schema', 'public'])
    expect(Keys.schema('analytics').key()).toEqual(['supabase', 'schema', 'analytics'])
  })

  test('tables list', () => {
    expect(Keys.schema().tables()).toEqual(['supabase', 'schema', 'public', 'tables'])
  })

  test('table + rows', () => {
    expect(Keys.schema().table('todos').rows().key()).toEqual([
      'supabase',
      'schema',
      'public',
      'table',
      'todos',
      'rows',
    ])
  })

  test('table + single row', () => {
    expect(Keys.schema().table('todos').row('abc').key()).toEqual([
      'supabase',
      'schema',
      'public',
      'table',
      'todos',
      'row',
      'abc',
    ])
  })

  test('mutation leaves on rows', () => {
    const rows = () => Keys.schema().table('todos').rows()
    expect(rows().create()).toEqual([
      'supabase',
      'schema',
      'public',
      'table',
      'todos',
      'rows',
      'create',
    ])
    expect(rows().update()).toEqual([
      'supabase',
      'schema',
      'public',
      'table',
      'todos',
      'rows',
      'update',
    ])
    expect(rows().upsert().at(-1)).toBe('upsert')
    expect(rows().delete().at(-1)).toBe('delete')
  })
})

describe('Keys — storage / functions / teams', () => {
  test('buckets + files', () => {
    expect(Keys.buckets().key()).toEqual(['supabase', 'buckets'])
    expect(Keys.bucket('avatars').files().key()).toEqual(['supabase', 'buckets', 'avatars', 'files'])
    expect(Keys.bucket('avatars').file('a.png').key()).toEqual([
      'supabase',
      'buckets',
      'avatars',
      'files',
      'a.png',
    ])
  })

  test('functions by name (no executions)', () => {
    expect(Keys.functions().key()).toEqual(['supabase', 'functions'])
    expect(Keys.function('send-push').key()).toEqual(['supabase', 'functions', 'send-push'])
    // `.executions()` was intentionally dropped — no client API.
    expect('executions' in Keys.function('x')).toBe(false)
  })

  test('teams + memberships', () => {
    expect(Keys.team('t1').memberships().key()).toEqual(['supabase', 'teams', 't1', 'memberships'])
    expect(Keys.team('t1').membership('u1').key()).toEqual([
      'supabase',
      'teams',
      't1',
      'memberships',
      'u1',
    ])
  })
})

describe('Keys — dropped verbs are gone', () => {
  test('no appwrite-era statics remain', () => {
    for (const verb of ['account', 'databases', 'tablesDB', 'locale', 'messaging']) {
      expect(verb in Keys).toBe(false)
    }
  })
})
