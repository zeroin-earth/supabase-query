interface Auth {
  auth?: string
}

interface Schema {
  schema?: string
}

interface Table {
  tbl?: string
}

interface Row {
  row?: string
}

interface Bucket {
  bucket?: string
}

interface FileResource {
  file?: string
}

interface Actionable {
  actionable?: string
}

interface Func {
  func?: string
}

interface Team {
  team?: string
}

interface Membership {
  membership?: string
}

/**
 * Fluent, type-safe query-key factory.
 *
 * The class mechanism is ported verbatim from the Appwrite library; only the
 * resource verbs are renamed to Postgres/Supabase terms (see the migration
 * plan §4). The root literal is `'supabase'` and the two old DB hierarchies
 * (`databases`/`collections`/`documents` and `tablesDB`/`table`/`rows`)
 * collapse into a single `schema → table → row` chain.
 */
export class Keys<T> {
  private keys: string[] = ['supabase']
  private _type!: T

  private constructor() {}

  private static create<T>(...segments: string[]) {
    const k = new Keys<T>()
    k.keys.push(...segments)
    return k
  }

  static auth() {
    return Keys.create<Auth>('auth')
  }

  static schema(name: string = 'public') {
    return Keys.create<Schema>('schema', name)
  }

  static buckets() {
    return Keys.create<Bucket>('buckets')
  }

  static bucket(id: string) {
    return Keys.create<Bucket>('buckets', id)
  }

  static functions() {
    return Keys.create<Func>('functions')
  }

  static function(name: string) {
    return Keys.create<Func>('functions', name)
  }

  static teams() {
    return Keys.create<Team>('teams')
  }

  static team(id: string) {
    return Keys.create<Team>('teams', id)
  }

  anonymous(this: Keys<Auth>) {
    this.keys.push('anonymous')
    return this as unknown as Keys<Actionable>
  }

  emailOtp(this: Keys<Auth>) {
    this.keys.push('emailOtp')
    return this as unknown as Keys<Actionable>
  }

  emailVerification(this: Keys<Auth>) {
    this.keys.push('emailVerification')
    return this as unknown as Keys<Actionable>
  }

  magicLink(this: Keys<Auth>) {
    this.keys.push('magicLink')
    return this as unknown as Keys<Actionable>
  }

  mfaAuthenticator(this: Keys<Auth>) {
    this.keys.push('mfaAuthenticator')
    return this as unknown as Keys<Actionable>
  }

  mfaChallenge(this: Keys<Auth>) {
    this.keys.push('mfaChallenge')
    return this as unknown as Keys<Actionable>
  }

  mfaCodes(this: Keys<Auth>) {
    this.keys.push('mfaCodes')
    return this as unknown as Keys<Actionable>
  }

  oauth(this: Keys<Auth>) {
    this.keys.push('oauth')
    return this as unknown as Keys<Actionable>
  }

  phoneOtp(this: Keys<Auth>) {
    this.keys.push('phoneOtp')
    return this as unknown as Keys<Actionable>
  }

  phoneVerification(this: Keys<Auth>) {
    this.keys.push('phoneVerification')
    return this as unknown as Keys<Actionable>
  }

  identity(this: Keys<Auth>) {
    this.keys.push('identity')
    return this as unknown as Keys<Actionable>
  }

  prefs(this: Keys<Auth>) {
    this.keys.push('prefs')
    return this as unknown as Keys<Actionable>
  }

  login(this: Keys<Auth>) {
    this.keys.push('login')
    return this as unknown as Keys<Actionable>
  }

  signUp(this: Keys<Auth>) {
    this.keys.push('signUp')
    return this as unknown as Keys<Actionable>
  }

  name(this: Keys<Auth>) {
    this.keys.push('name')
    return this as unknown as Keys<Actionable>
  }

  email(this: Keys<Auth>) {
    this.keys.push('email')
    return this as unknown as Keys<Actionable>
  }

  phone(this: Keys<Auth>) {
    this.keys.push('phone')
    return this as unknown as Keys<Actionable>
  }

  password(this: Keys<Auth>) {
    this.keys.push('password')
    return this as unknown as Keys<Actionable>
  }

  recovery(this: Keys<Auth>) {
    this.keys.push('recovery')
    return this as unknown as Keys<Actionable>
  }

  mfa(this: Keys<Auth>) {
    this.keys.push('mfa')
    return this as unknown as Keys<Actionable>
  }

  verification(this: Keys<Auth>) {
    this.keys.push('verification')
    return this as unknown as Keys<Actionable>
  }

  session(this: Keys<Auth>) {
    return [...this.keys, 'session'] as const
  }

  identities(this: Keys<Auth>) {
    return [...this.keys, 'identities'] as const
  }

  mfaFactors(this: Keys<Auth>) {
    return [...this.keys, 'mfaFactors'] as const
  }

  tables(this: Keys<Schema>) {
    return [...this.keys, 'tables'] as const
  }

  table(this: Keys<Schema>, name: string) {
    this.keys.push('table', name)
    return this as unknown as Keys<Table>
  }

  rows(this: Keys<Table>) {
    this.keys.push('rows')
    return this as unknown as Keys<Actionable>
  }

  row(this: Keys<Table>, id: string) {
    this.keys.push('row', id)
    return this as unknown as Keys<Row>
  }

  files(this: Keys<Bucket>) {
    this.keys.push('files')
    return this as unknown as Keys<Actionable>
  }

  file(this: Keys<Bucket>, id: string) {
    this.keys.push('files', id)
    return this as unknown as Keys<FileResource>
  }

  teamName(this: Keys<Team>) {
    this.keys.push('name')
    return this as unknown as Keys<Actionable>
  }

  teamPrefs(this: Keys<Team>) {
    this.keys.push('prefs')
    return this as unknown as Keys<Actionable>
  }

  memberships(this: Keys<Team>) {
    this.keys.push('memberships')
    return this as unknown as Keys<Actionable>
  }

  membership(this: Keys<Team>, id: string) {
    this.keys.push('memberships', id)
    return this as unknown as Keys<Membership>
  }

  membershipStatus(this: Keys<Team>) {
    this.keys.push('membershipStatus')
    return this as unknown as Keys<Actionable>
  }

  create() {
    return [...this.keys, 'create'] as const
  }

  upsert() {
    return [...this.keys, 'upsert'] as const
  }

  update() {
    return [...this.keys, 'update'] as const
  }

  delete() {
    return [...this.keys, 'delete'] as const
  }

  key() {
    return [...this.keys] as const
  }
}
