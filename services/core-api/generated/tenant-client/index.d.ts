
/**
 * Client
**/

import * as runtime from './runtime/library.js';
import $Types = runtime.Types // general types
import $Public = runtime.Types.Public
import $Utils = runtime.Types.Utils
import $Extensions = runtime.Types.Extensions
import $Result = runtime.Types.Result

export type PrismaPromise<T> = $Public.PrismaPromise<T>


/**
 * Model UserProfile
 * 
 */
export type UserProfile = $Result.DefaultSelection<Prisma.$UserProfilePayload>
/**
 * Model WorkspaceTemplate
 * 
 */
export type WorkspaceTemplate = $Result.DefaultSelection<Prisma.$WorkspaceTemplatePayload>
/**
 * Model TenantBranding
 * 
 */
export type TenantBranding = $Result.DefaultSelection<Prisma.$TenantBrandingPayload>
/**
 * Model Workspace
 * 
 */
export type Workspace = $Result.DefaultSelection<Prisma.$WorkspacePayload>
/**
 * Model WorkspaceMember
 * 
 */
export type WorkspaceMember = $Result.DefaultSelection<Prisma.$WorkspaceMemberPayload>
/**
 * Model Invitation
 * 
 */
export type Invitation = $Result.DefaultSelection<Prisma.$InvitationPayload>
/**
 * Model AuditLog
 * 
 */
export type AuditLog = $Result.DefaultSelection<Prisma.$AuditLogPayload>
/**
 * Model AbacDecisionLog
 * 
 */
export type AbacDecisionLog = $Result.DefaultSelection<Prisma.$AbacDecisionLogPayload>
/**
 * Model ActionRegistry
 * 
 */
export type ActionRegistry = $Result.DefaultSelection<Prisma.$ActionRegistryPayload>
/**
 * Model WorkspaceRoleAction
 * 
 */
export type WorkspaceRoleAction = $Result.DefaultSelection<Prisma.$WorkspaceRoleActionPayload>

/**
 * ##  Prisma Client ʲˢ
 *
 * Type-safe database client for TypeScript & Node.js
 * @example
 * ```
 * const prisma = new PrismaClient()
 * // Fetch zero or more UserProfiles
 * const userProfiles = await prisma.userProfile.findMany()
 * ```
 *
 *
 * Read more in our [docs](https://www.prisma.io/docs/reference/tools-and-interfaces/prisma-client).
 */
export class PrismaClient<
  ClientOptions extends Prisma.PrismaClientOptions = Prisma.PrismaClientOptions,
  const U = 'log' extends keyof ClientOptions ? ClientOptions['log'] extends Array<Prisma.LogLevel | Prisma.LogDefinition> ? Prisma.GetEvents<ClientOptions['log']> : never : never,
  ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs
> {
  [K: symbol]: { types: Prisma.TypeMap<ExtArgs>['other'] }

    /**
   * ##  Prisma Client ʲˢ
   *
   * Type-safe database client for TypeScript & Node.js
   * @example
   * ```
   * const prisma = new PrismaClient()
   * // Fetch zero or more UserProfiles
   * const userProfiles = await prisma.userProfile.findMany()
   * ```
   *
   *
   * Read more in our [docs](https://www.prisma.io/docs/reference/tools-and-interfaces/prisma-client).
   */

  constructor(optionsArg ?: Prisma.Subset<ClientOptions, Prisma.PrismaClientOptions>);
  $on<V extends U>(eventType: V, callback: (event: V extends 'query' ? Prisma.QueryEvent : Prisma.LogEvent) => void): PrismaClient;

  /**
   * Connect with the database
   */
  $connect(): $Utils.JsPromise<void>;

  /**
   * Disconnect from the database
   */
  $disconnect(): $Utils.JsPromise<void>;

/**
   * Executes a prepared raw query and returns the number of affected rows.
   * @example
   * ```
   * const result = await prisma.$executeRaw`UPDATE User SET cool = ${true} WHERE email = ${'user@email.com'};`
   * ```
   *
   * Read more in our [docs](https://www.prisma.io/docs/reference/tools-and-interfaces/prisma-client/raw-database-access).
   */
  $executeRaw<T = unknown>(query: TemplateStringsArray | Prisma.Sql, ...values: any[]): Prisma.PrismaPromise<number>;

  /**
   * Executes a raw query and returns the number of affected rows.
   * Susceptible to SQL injections, see documentation.
   * @example
   * ```
   * const result = await prisma.$executeRawUnsafe('UPDATE User SET cool = $1 WHERE email = $2 ;', true, 'user@email.com')
   * ```
   *
   * Read more in our [docs](https://www.prisma.io/docs/reference/tools-and-interfaces/prisma-client/raw-database-access).
   */
  $executeRawUnsafe<T = unknown>(query: string, ...values: any[]): Prisma.PrismaPromise<number>;

  /**
   * Performs a prepared raw query and returns the `SELECT` data.
   * @example
   * ```
   * const result = await prisma.$queryRaw`SELECT * FROM User WHERE id = ${1} OR email = ${'user@email.com'};`
   * ```
   *
   * Read more in our [docs](https://www.prisma.io/docs/reference/tools-and-interfaces/prisma-client/raw-database-access).
   */
  $queryRaw<T = unknown>(query: TemplateStringsArray | Prisma.Sql, ...values: any[]): Prisma.PrismaPromise<T>;

  /**
   * Performs a raw query and returns the `SELECT` data.
   * Susceptible to SQL injections, see documentation.
   * @example
   * ```
   * const result = await prisma.$queryRawUnsafe('SELECT * FROM User WHERE id = $1 OR email = $2;', 1, 'user@email.com')
   * ```
   *
   * Read more in our [docs](https://www.prisma.io/docs/reference/tools-and-interfaces/prisma-client/raw-database-access).
   */
  $queryRawUnsafe<T = unknown>(query: string, ...values: any[]): Prisma.PrismaPromise<T>;


  /**
   * Allows the running of a sequence of read/write operations that are guaranteed to either succeed or fail as a whole.
   * @example
   * ```
   * const [george, bob, alice] = await prisma.$transaction([
   *   prisma.user.create({ data: { name: 'George' } }),
   *   prisma.user.create({ data: { name: 'Bob' } }),
   *   prisma.user.create({ data: { name: 'Alice' } }),
   * ])
   * ```
   * 
   * Read more in our [docs](https://www.prisma.io/docs/concepts/components/prisma-client/transactions).
   */
  $transaction<P extends Prisma.PrismaPromise<any>[]>(arg: [...P], options?: { isolationLevel?: Prisma.TransactionIsolationLevel }): $Utils.JsPromise<runtime.Types.Utils.UnwrapTuple<P>>

  $transaction<R>(fn: (prisma: Omit<PrismaClient, runtime.ITXClientDenyList>) => $Utils.JsPromise<R>, options?: { maxWait?: number, timeout?: number, isolationLevel?: Prisma.TransactionIsolationLevel }): $Utils.JsPromise<R>


  $extends: $Extensions.ExtendsHook<"extends", Prisma.TypeMapCb<ClientOptions>, ExtArgs, $Utils.Call<Prisma.TypeMapCb<ClientOptions>, {
    extArgs: ExtArgs
  }>>

      /**
   * `prisma.userProfile`: Exposes CRUD operations for the **UserProfile** model.
    * Example usage:
    * ```ts
    * // Fetch zero or more UserProfiles
    * const userProfiles = await prisma.userProfile.findMany()
    * ```
    */
  get userProfile(): Prisma.UserProfileDelegate<ExtArgs, ClientOptions>;

  /**
   * `prisma.workspaceTemplate`: Exposes CRUD operations for the **WorkspaceTemplate** model.
    * Example usage:
    * ```ts
    * // Fetch zero or more WorkspaceTemplates
    * const workspaceTemplates = await prisma.workspaceTemplate.findMany()
    * ```
    */
  get workspaceTemplate(): Prisma.WorkspaceTemplateDelegate<ExtArgs, ClientOptions>;

  /**
   * `prisma.tenantBranding`: Exposes CRUD operations for the **TenantBranding** model.
    * Example usage:
    * ```ts
    * // Fetch zero or more TenantBrandings
    * const tenantBrandings = await prisma.tenantBranding.findMany()
    * ```
    */
  get tenantBranding(): Prisma.TenantBrandingDelegate<ExtArgs, ClientOptions>;

  /**
   * `prisma.workspace`: Exposes CRUD operations for the **Workspace** model.
    * Example usage:
    * ```ts
    * // Fetch zero or more Workspaces
    * const workspaces = await prisma.workspace.findMany()
    * ```
    */
  get workspace(): Prisma.WorkspaceDelegate<ExtArgs, ClientOptions>;

  /**
   * `prisma.workspaceMember`: Exposes CRUD operations for the **WorkspaceMember** model.
    * Example usage:
    * ```ts
    * // Fetch zero or more WorkspaceMembers
    * const workspaceMembers = await prisma.workspaceMember.findMany()
    * ```
    */
  get workspaceMember(): Prisma.WorkspaceMemberDelegate<ExtArgs, ClientOptions>;

  /**
   * `prisma.invitation`: Exposes CRUD operations for the **Invitation** model.
    * Example usage:
    * ```ts
    * // Fetch zero or more Invitations
    * const invitations = await prisma.invitation.findMany()
    * ```
    */
  get invitation(): Prisma.InvitationDelegate<ExtArgs, ClientOptions>;

  /**
   * `prisma.auditLog`: Exposes CRUD operations for the **AuditLog** model.
    * Example usage:
    * ```ts
    * // Fetch zero or more AuditLogs
    * const auditLogs = await prisma.auditLog.findMany()
    * ```
    */
  get auditLog(): Prisma.AuditLogDelegate<ExtArgs, ClientOptions>;

  /**
   * `prisma.abacDecisionLog`: Exposes CRUD operations for the **AbacDecisionLog** model.
    * Example usage:
    * ```ts
    * // Fetch zero or more AbacDecisionLogs
    * const abacDecisionLogs = await prisma.abacDecisionLog.findMany()
    * ```
    */
  get abacDecisionLog(): Prisma.AbacDecisionLogDelegate<ExtArgs, ClientOptions>;

  /**
   * `prisma.actionRegistry`: Exposes CRUD operations for the **ActionRegistry** model.
    * Example usage:
    * ```ts
    * // Fetch zero or more ActionRegistries
    * const actionRegistries = await prisma.actionRegistry.findMany()
    * ```
    */
  get actionRegistry(): Prisma.ActionRegistryDelegate<ExtArgs, ClientOptions>;

  /**
   * `prisma.workspaceRoleAction`: Exposes CRUD operations for the **WorkspaceRoleAction** model.
    * Example usage:
    * ```ts
    * // Fetch zero or more WorkspaceRoleActions
    * const workspaceRoleActions = await prisma.workspaceRoleAction.findMany()
    * ```
    */
  get workspaceRoleAction(): Prisma.WorkspaceRoleActionDelegate<ExtArgs, ClientOptions>;
}

export namespace Prisma {
  export import DMMF = runtime.DMMF

  export type PrismaPromise<T> = $Public.PrismaPromise<T>

  /**
   * Validator
   */
  export import validator = runtime.Public.validator

  /**
   * Prisma Errors
   */
  export import PrismaClientKnownRequestError = runtime.PrismaClientKnownRequestError
  export import PrismaClientUnknownRequestError = runtime.PrismaClientUnknownRequestError
  export import PrismaClientRustPanicError = runtime.PrismaClientRustPanicError
  export import PrismaClientInitializationError = runtime.PrismaClientInitializationError
  export import PrismaClientValidationError = runtime.PrismaClientValidationError

  /**
   * Re-export of sql-template-tag
   */
  export import sql = runtime.sqltag
  export import empty = runtime.empty
  export import join = runtime.join
  export import raw = runtime.raw
  export import Sql = runtime.Sql



  /**
   * Decimal.js
   */
  export import Decimal = runtime.Decimal

  export type DecimalJsLike = runtime.DecimalJsLike

  /**
   * Metrics
   */
  export type Metrics = runtime.Metrics
  export type Metric<T> = runtime.Metric<T>
  export type MetricHistogram = runtime.MetricHistogram
  export type MetricHistogramBucket = runtime.MetricHistogramBucket

  /**
  * Extensions
  */
  export import Extension = $Extensions.UserArgs
  export import getExtensionContext = runtime.Extensions.getExtensionContext
  export import Args = $Public.Args
  export import Payload = $Public.Payload
  export import Result = $Public.Result
  export import Exact = $Public.Exact

  /**
   * Prisma Client JS version: 6.19.3
   * Query Engine version: c2990dca591cba766e3b7ef5d9e8a84796e47ab7
   */
  export type PrismaVersion = {
    client: string
  }

  export const prismaVersion: PrismaVersion

  /**
   * Utility Types
   */


  export import Bytes = runtime.Bytes
  export import JsonObject = runtime.JsonObject
  export import JsonArray = runtime.JsonArray
  export import JsonValue = runtime.JsonValue
  export import InputJsonObject = runtime.InputJsonObject
  export import InputJsonArray = runtime.InputJsonArray
  export import InputJsonValue = runtime.InputJsonValue

  /**
   * Types of the values used to represent different kinds of `null` values when working with JSON fields.
   *
   * @see https://www.prisma.io/docs/concepts/components/prisma-client/working-with-fields/working-with-json-fields#filtering-on-a-json-field
   */
  namespace NullTypes {
    /**
    * Type of `Prisma.DbNull`.
    *
    * You cannot use other instances of this class. Please use the `Prisma.DbNull` value.
    *
    * @see https://www.prisma.io/docs/concepts/components/prisma-client/working-with-fields/working-with-json-fields#filtering-on-a-json-field
    */
    class DbNull {
      private DbNull: never
      private constructor()
    }

    /**
    * Type of `Prisma.JsonNull`.
    *
    * You cannot use other instances of this class. Please use the `Prisma.JsonNull` value.
    *
    * @see https://www.prisma.io/docs/concepts/components/prisma-client/working-with-fields/working-with-json-fields#filtering-on-a-json-field
    */
    class JsonNull {
      private JsonNull: never
      private constructor()
    }

    /**
    * Type of `Prisma.AnyNull`.
    *
    * You cannot use other instances of this class. Please use the `Prisma.AnyNull` value.
    *
    * @see https://www.prisma.io/docs/concepts/components/prisma-client/working-with-fields/working-with-json-fields#filtering-on-a-json-field
    */
    class AnyNull {
      private AnyNull: never
      private constructor()
    }
  }

  /**
   * Helper for filtering JSON entries that have `null` on the database (empty on the db)
   *
   * @see https://www.prisma.io/docs/concepts/components/prisma-client/working-with-fields/working-with-json-fields#filtering-on-a-json-field
   */
  export const DbNull: NullTypes.DbNull

  /**
   * Helper for filtering JSON entries that have JSON `null` values (not empty on the db)
   *
   * @see https://www.prisma.io/docs/concepts/components/prisma-client/working-with-fields/working-with-json-fields#filtering-on-a-json-field
   */
  export const JsonNull: NullTypes.JsonNull

  /**
   * Helper for filtering JSON entries that are `Prisma.DbNull` or `Prisma.JsonNull`
   *
   * @see https://www.prisma.io/docs/concepts/components/prisma-client/working-with-fields/working-with-json-fields#filtering-on-a-json-field
   */
  export const AnyNull: NullTypes.AnyNull

  type SelectAndInclude = {
    select: any
    include: any
  }

  type SelectAndOmit = {
    select: any
    omit: any
  }

  /**
   * Get the type of the value, that the Promise holds.
   */
  export type PromiseType<T extends PromiseLike<any>> = T extends PromiseLike<infer U> ? U : T;

  /**
   * Get the return type of a function which returns a Promise.
   */
  export type PromiseReturnType<T extends (...args: any) => $Utils.JsPromise<any>> = PromiseType<ReturnType<T>>

  /**
   * From T, pick a set of properties whose keys are in the union K
   */
  type Prisma__Pick<T, K extends keyof T> = {
      [P in K]: T[P];
  };


  export type Enumerable<T> = T | Array<T>;

  export type RequiredKeys<T> = {
    [K in keyof T]-?: {} extends Prisma__Pick<T, K> ? never : K
  }[keyof T]

  export type TruthyKeys<T> = keyof {
    [K in keyof T as T[K] extends false | undefined | null ? never : K]: K
  }

  export type TrueKeys<T> = TruthyKeys<Prisma__Pick<T, RequiredKeys<T>>>

  /**
   * Subset
   * @desc From `T` pick properties that exist in `U`. Simple version of Intersection
   */
  export type Subset<T, U> = {
    [key in keyof T]: key extends keyof U ? T[key] : never;
  };

  /**
   * SelectSubset
   * @desc From `T` pick properties that exist in `U`. Simple version of Intersection.
   * Additionally, it validates, if both select and include are present. If the case, it errors.
   */
  export type SelectSubset<T, U> = {
    [key in keyof T]: key extends keyof U ? T[key] : never
  } &
    (T extends SelectAndInclude
      ? 'Please either choose `select` or `include`.'
      : T extends SelectAndOmit
        ? 'Please either choose `select` or `omit`.'
        : {})

  /**
   * Subset + Intersection
   * @desc From `T` pick properties that exist in `U` and intersect `K`
   */
  export type SubsetIntersection<T, U, K> = {
    [key in keyof T]: key extends keyof U ? T[key] : never
  } &
    K

  type Without<T, U> = { [P in Exclude<keyof T, keyof U>]?: never };

  /**
   * XOR is needed to have a real mutually exclusive union type
   * https://stackoverflow.com/questions/42123407/does-typescript-support-mutually-exclusive-types
   */
  type XOR<T, U> =
    T extends object ?
    U extends object ?
      (Without<T, U> & U) | (Without<U, T> & T)
    : U : T


  /**
   * Is T a Record?
   */
  type IsObject<T extends any> = T extends Array<any>
  ? False
  : T extends Date
  ? False
  : T extends Uint8Array
  ? False
  : T extends BigInt
  ? False
  : T extends object
  ? True
  : False


  /**
   * If it's T[], return T
   */
  export type UnEnumerate<T extends unknown> = T extends Array<infer U> ? U : T

  /**
   * From ts-toolbelt
   */

  type __Either<O extends object, K extends Key> = Omit<O, K> &
    {
      // Merge all but K
      [P in K]: Prisma__Pick<O, P & keyof O> // With K possibilities
    }[K]

  type EitherStrict<O extends object, K extends Key> = Strict<__Either<O, K>>

  type EitherLoose<O extends object, K extends Key> = ComputeRaw<__Either<O, K>>

  type _Either<
    O extends object,
    K extends Key,
    strict extends Boolean
  > = {
    1: EitherStrict<O, K>
    0: EitherLoose<O, K>
  }[strict]

  type Either<
    O extends object,
    K extends Key,
    strict extends Boolean = 1
  > = O extends unknown ? _Either<O, K, strict> : never

  export type Union = any

  type PatchUndefined<O extends object, O1 extends object> = {
    [K in keyof O]: O[K] extends undefined ? At<O1, K> : O[K]
  } & {}

  /** Helper Types for "Merge" **/
  export type IntersectOf<U extends Union> = (
    U extends unknown ? (k: U) => void : never
  ) extends (k: infer I) => void
    ? I
    : never

  export type Overwrite<O extends object, O1 extends object> = {
      [K in keyof O]: K extends keyof O1 ? O1[K] : O[K];
  } & {};

  type _Merge<U extends object> = IntersectOf<Overwrite<U, {
      [K in keyof U]-?: At<U, K>;
  }>>;

  type Key = string | number | symbol;
  type AtBasic<O extends object, K extends Key> = K extends keyof O ? O[K] : never;
  type AtStrict<O extends object, K extends Key> = O[K & keyof O];
  type AtLoose<O extends object, K extends Key> = O extends unknown ? AtStrict<O, K> : never;
  export type At<O extends object, K extends Key, strict extends Boolean = 1> = {
      1: AtStrict<O, K>;
      0: AtLoose<O, K>;
  }[strict];

  export type ComputeRaw<A extends any> = A extends Function ? A : {
    [K in keyof A]: A[K];
  } & {};

  export type OptionalFlat<O> = {
    [K in keyof O]?: O[K];
  } & {};

  type _Record<K extends keyof any, T> = {
    [P in K]: T;
  };

  // cause typescript not to expand types and preserve names
  type NoExpand<T> = T extends unknown ? T : never;

  // this type assumes the passed object is entirely optional
  type AtLeast<O extends object, K extends string> = NoExpand<
    O extends unknown
    ? | (K extends keyof O ? { [P in K]: O[P] } & O : O)
      | {[P in keyof O as P extends K ? P : never]-?: O[P]} & O
    : never>;

  type _Strict<U, _U = U> = U extends unknown ? U & OptionalFlat<_Record<Exclude<Keys<_U>, keyof U>, never>> : never;

  export type Strict<U extends object> = ComputeRaw<_Strict<U>>;
  /** End Helper Types for "Merge" **/

  export type Merge<U extends object> = ComputeRaw<_Merge<Strict<U>>>;

  /**
  A [[Boolean]]
  */
  export type Boolean = True | False

  // /**
  // 1
  // */
  export type True = 1

  /**
  0
  */
  export type False = 0

  export type Not<B extends Boolean> = {
    0: 1
    1: 0
  }[B]

  export type Extends<A1 extends any, A2 extends any> = [A1] extends [never]
    ? 0 // anything `never` is false
    : A1 extends A2
    ? 1
    : 0

  export type Has<U extends Union, U1 extends Union> = Not<
    Extends<Exclude<U1, U>, U1>
  >

  export type Or<B1 extends Boolean, B2 extends Boolean> = {
    0: {
      0: 0
      1: 1
    }
    1: {
      0: 1
      1: 1
    }
  }[B1][B2]

  export type Keys<U extends Union> = U extends unknown ? keyof U : never

  type Cast<A, B> = A extends B ? A : B;

  export const type: unique symbol;



  /**
   * Used by group by
   */

  export type GetScalarType<T, O> = O extends object ? {
    [P in keyof T]: P extends keyof O
      ? O[P]
      : never
  } : never

  type FieldPaths<
    T,
    U = Omit<T, '_avg' | '_sum' | '_count' | '_min' | '_max'>
  > = IsObject<T> extends True ? U : T

  type GetHavingFields<T> = {
    [K in keyof T]: Or<
      Or<Extends<'OR', K>, Extends<'AND', K>>,
      Extends<'NOT', K>
    > extends True
      ? // infer is only needed to not hit TS limit
        // based on the brilliant idea of Pierre-Antoine Mills
        // https://github.com/microsoft/TypeScript/issues/30188#issuecomment-478938437
        T[K] extends infer TK
        ? GetHavingFields<UnEnumerate<TK> extends object ? Merge<UnEnumerate<TK>> : never>
        : never
      : {} extends FieldPaths<T[K]>
      ? never
      : K
  }[keyof T]

  /**
   * Convert tuple to union
   */
  type _TupleToUnion<T> = T extends (infer E)[] ? E : never
  type TupleToUnion<K extends readonly any[]> = _TupleToUnion<K>
  type MaybeTupleToUnion<T> = T extends any[] ? TupleToUnion<T> : T

  /**
   * Like `Pick`, but additionally can also accept an array of keys
   */
  type PickEnumerable<T, K extends Enumerable<keyof T> | keyof T> = Prisma__Pick<T, MaybeTupleToUnion<K>>

  /**
   * Exclude all keys with underscores
   */
  type ExcludeUnderscoreKeys<T extends string> = T extends `_${string}` ? never : T


  export type FieldRef<Model, FieldType> = runtime.FieldRef<Model, FieldType>

  type FieldRefInputType<Model, FieldType> = Model extends never ? never : FieldRef<Model, FieldType>


  export const ModelName: {
    UserProfile: 'UserProfile',
    WorkspaceTemplate: 'WorkspaceTemplate',
    TenantBranding: 'TenantBranding',
    Workspace: 'Workspace',
    WorkspaceMember: 'WorkspaceMember',
    Invitation: 'Invitation',
    AuditLog: 'AuditLog',
    AbacDecisionLog: 'AbacDecisionLog',
    ActionRegistry: 'ActionRegistry',
    WorkspaceRoleAction: 'WorkspaceRoleAction'
  };

  export type ModelName = (typeof ModelName)[keyof typeof ModelName]


  export type Datasources = {
    db?: Datasource
  }

  interface TypeMapCb<ClientOptions = {}> extends $Utils.Fn<{extArgs: $Extensions.InternalArgs }, $Utils.Record<string, any>> {
    returns: Prisma.TypeMap<this['params']['extArgs'], ClientOptions extends { omit: infer OmitOptions } ? OmitOptions : {}>
  }

  export type TypeMap<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs, GlobalOmitOptions = {}> = {
    globalOmitOptions: {
      omit: GlobalOmitOptions
    }
    meta: {
      modelProps: "userProfile" | "workspaceTemplate" | "tenantBranding" | "workspace" | "workspaceMember" | "invitation" | "auditLog" | "abacDecisionLog" | "actionRegistry" | "workspaceRoleAction"
      txIsolationLevel: Prisma.TransactionIsolationLevel
    }
    model: {
      UserProfile: {
        payload: Prisma.$UserProfilePayload<ExtArgs>
        fields: Prisma.UserProfileFieldRefs
        operations: {
          findUnique: {
            args: Prisma.UserProfileFindUniqueArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$UserProfilePayload> | null
          }
          findUniqueOrThrow: {
            args: Prisma.UserProfileFindUniqueOrThrowArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$UserProfilePayload>
          }
          findFirst: {
            args: Prisma.UserProfileFindFirstArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$UserProfilePayload> | null
          }
          findFirstOrThrow: {
            args: Prisma.UserProfileFindFirstOrThrowArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$UserProfilePayload>
          }
          findMany: {
            args: Prisma.UserProfileFindManyArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$UserProfilePayload>[]
          }
          create: {
            args: Prisma.UserProfileCreateArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$UserProfilePayload>
          }
          createMany: {
            args: Prisma.UserProfileCreateManyArgs<ExtArgs>
            result: BatchPayload
          }
          createManyAndReturn: {
            args: Prisma.UserProfileCreateManyAndReturnArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$UserProfilePayload>[]
          }
          delete: {
            args: Prisma.UserProfileDeleteArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$UserProfilePayload>
          }
          update: {
            args: Prisma.UserProfileUpdateArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$UserProfilePayload>
          }
          deleteMany: {
            args: Prisma.UserProfileDeleteManyArgs<ExtArgs>
            result: BatchPayload
          }
          updateMany: {
            args: Prisma.UserProfileUpdateManyArgs<ExtArgs>
            result: BatchPayload
          }
          updateManyAndReturn: {
            args: Prisma.UserProfileUpdateManyAndReturnArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$UserProfilePayload>[]
          }
          upsert: {
            args: Prisma.UserProfileUpsertArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$UserProfilePayload>
          }
          aggregate: {
            args: Prisma.UserProfileAggregateArgs<ExtArgs>
            result: $Utils.Optional<AggregateUserProfile>
          }
          groupBy: {
            args: Prisma.UserProfileGroupByArgs<ExtArgs>
            result: $Utils.Optional<UserProfileGroupByOutputType>[]
          }
          count: {
            args: Prisma.UserProfileCountArgs<ExtArgs>
            result: $Utils.Optional<UserProfileCountAggregateOutputType> | number
          }
        }
      }
      WorkspaceTemplate: {
        payload: Prisma.$WorkspaceTemplatePayload<ExtArgs>
        fields: Prisma.WorkspaceTemplateFieldRefs
        operations: {
          findUnique: {
            args: Prisma.WorkspaceTemplateFindUniqueArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$WorkspaceTemplatePayload> | null
          }
          findUniqueOrThrow: {
            args: Prisma.WorkspaceTemplateFindUniqueOrThrowArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$WorkspaceTemplatePayload>
          }
          findFirst: {
            args: Prisma.WorkspaceTemplateFindFirstArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$WorkspaceTemplatePayload> | null
          }
          findFirstOrThrow: {
            args: Prisma.WorkspaceTemplateFindFirstOrThrowArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$WorkspaceTemplatePayload>
          }
          findMany: {
            args: Prisma.WorkspaceTemplateFindManyArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$WorkspaceTemplatePayload>[]
          }
          create: {
            args: Prisma.WorkspaceTemplateCreateArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$WorkspaceTemplatePayload>
          }
          createMany: {
            args: Prisma.WorkspaceTemplateCreateManyArgs<ExtArgs>
            result: BatchPayload
          }
          createManyAndReturn: {
            args: Prisma.WorkspaceTemplateCreateManyAndReturnArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$WorkspaceTemplatePayload>[]
          }
          delete: {
            args: Prisma.WorkspaceTemplateDeleteArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$WorkspaceTemplatePayload>
          }
          update: {
            args: Prisma.WorkspaceTemplateUpdateArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$WorkspaceTemplatePayload>
          }
          deleteMany: {
            args: Prisma.WorkspaceTemplateDeleteManyArgs<ExtArgs>
            result: BatchPayload
          }
          updateMany: {
            args: Prisma.WorkspaceTemplateUpdateManyArgs<ExtArgs>
            result: BatchPayload
          }
          updateManyAndReturn: {
            args: Prisma.WorkspaceTemplateUpdateManyAndReturnArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$WorkspaceTemplatePayload>[]
          }
          upsert: {
            args: Prisma.WorkspaceTemplateUpsertArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$WorkspaceTemplatePayload>
          }
          aggregate: {
            args: Prisma.WorkspaceTemplateAggregateArgs<ExtArgs>
            result: $Utils.Optional<AggregateWorkspaceTemplate>
          }
          groupBy: {
            args: Prisma.WorkspaceTemplateGroupByArgs<ExtArgs>
            result: $Utils.Optional<WorkspaceTemplateGroupByOutputType>[]
          }
          count: {
            args: Prisma.WorkspaceTemplateCountArgs<ExtArgs>
            result: $Utils.Optional<WorkspaceTemplateCountAggregateOutputType> | number
          }
        }
      }
      TenantBranding: {
        payload: Prisma.$TenantBrandingPayload<ExtArgs>
        fields: Prisma.TenantBrandingFieldRefs
        operations: {
          findUnique: {
            args: Prisma.TenantBrandingFindUniqueArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$TenantBrandingPayload> | null
          }
          findUniqueOrThrow: {
            args: Prisma.TenantBrandingFindUniqueOrThrowArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$TenantBrandingPayload>
          }
          findFirst: {
            args: Prisma.TenantBrandingFindFirstArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$TenantBrandingPayload> | null
          }
          findFirstOrThrow: {
            args: Prisma.TenantBrandingFindFirstOrThrowArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$TenantBrandingPayload>
          }
          findMany: {
            args: Prisma.TenantBrandingFindManyArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$TenantBrandingPayload>[]
          }
          create: {
            args: Prisma.TenantBrandingCreateArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$TenantBrandingPayload>
          }
          createMany: {
            args: Prisma.TenantBrandingCreateManyArgs<ExtArgs>
            result: BatchPayload
          }
          createManyAndReturn: {
            args: Prisma.TenantBrandingCreateManyAndReturnArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$TenantBrandingPayload>[]
          }
          delete: {
            args: Prisma.TenantBrandingDeleteArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$TenantBrandingPayload>
          }
          update: {
            args: Prisma.TenantBrandingUpdateArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$TenantBrandingPayload>
          }
          deleteMany: {
            args: Prisma.TenantBrandingDeleteManyArgs<ExtArgs>
            result: BatchPayload
          }
          updateMany: {
            args: Prisma.TenantBrandingUpdateManyArgs<ExtArgs>
            result: BatchPayload
          }
          updateManyAndReturn: {
            args: Prisma.TenantBrandingUpdateManyAndReturnArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$TenantBrandingPayload>[]
          }
          upsert: {
            args: Prisma.TenantBrandingUpsertArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$TenantBrandingPayload>
          }
          aggregate: {
            args: Prisma.TenantBrandingAggregateArgs<ExtArgs>
            result: $Utils.Optional<AggregateTenantBranding>
          }
          groupBy: {
            args: Prisma.TenantBrandingGroupByArgs<ExtArgs>
            result: $Utils.Optional<TenantBrandingGroupByOutputType>[]
          }
          count: {
            args: Prisma.TenantBrandingCountArgs<ExtArgs>
            result: $Utils.Optional<TenantBrandingCountAggregateOutputType> | number
          }
        }
      }
      Workspace: {
        payload: Prisma.$WorkspacePayload<ExtArgs>
        fields: Prisma.WorkspaceFieldRefs
        operations: {
          findUnique: {
            args: Prisma.WorkspaceFindUniqueArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$WorkspacePayload> | null
          }
          findUniqueOrThrow: {
            args: Prisma.WorkspaceFindUniqueOrThrowArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$WorkspacePayload>
          }
          findFirst: {
            args: Prisma.WorkspaceFindFirstArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$WorkspacePayload> | null
          }
          findFirstOrThrow: {
            args: Prisma.WorkspaceFindFirstOrThrowArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$WorkspacePayload>
          }
          findMany: {
            args: Prisma.WorkspaceFindManyArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$WorkspacePayload>[]
          }
          create: {
            args: Prisma.WorkspaceCreateArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$WorkspacePayload>
          }
          createMany: {
            args: Prisma.WorkspaceCreateManyArgs<ExtArgs>
            result: BatchPayload
          }
          createManyAndReturn: {
            args: Prisma.WorkspaceCreateManyAndReturnArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$WorkspacePayload>[]
          }
          delete: {
            args: Prisma.WorkspaceDeleteArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$WorkspacePayload>
          }
          update: {
            args: Prisma.WorkspaceUpdateArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$WorkspacePayload>
          }
          deleteMany: {
            args: Prisma.WorkspaceDeleteManyArgs<ExtArgs>
            result: BatchPayload
          }
          updateMany: {
            args: Prisma.WorkspaceUpdateManyArgs<ExtArgs>
            result: BatchPayload
          }
          updateManyAndReturn: {
            args: Prisma.WorkspaceUpdateManyAndReturnArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$WorkspacePayload>[]
          }
          upsert: {
            args: Prisma.WorkspaceUpsertArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$WorkspacePayload>
          }
          aggregate: {
            args: Prisma.WorkspaceAggregateArgs<ExtArgs>
            result: $Utils.Optional<AggregateWorkspace>
          }
          groupBy: {
            args: Prisma.WorkspaceGroupByArgs<ExtArgs>
            result: $Utils.Optional<WorkspaceGroupByOutputType>[]
          }
          count: {
            args: Prisma.WorkspaceCountArgs<ExtArgs>
            result: $Utils.Optional<WorkspaceCountAggregateOutputType> | number
          }
        }
      }
      WorkspaceMember: {
        payload: Prisma.$WorkspaceMemberPayload<ExtArgs>
        fields: Prisma.WorkspaceMemberFieldRefs
        operations: {
          findUnique: {
            args: Prisma.WorkspaceMemberFindUniqueArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$WorkspaceMemberPayload> | null
          }
          findUniqueOrThrow: {
            args: Prisma.WorkspaceMemberFindUniqueOrThrowArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$WorkspaceMemberPayload>
          }
          findFirst: {
            args: Prisma.WorkspaceMemberFindFirstArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$WorkspaceMemberPayload> | null
          }
          findFirstOrThrow: {
            args: Prisma.WorkspaceMemberFindFirstOrThrowArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$WorkspaceMemberPayload>
          }
          findMany: {
            args: Prisma.WorkspaceMemberFindManyArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$WorkspaceMemberPayload>[]
          }
          create: {
            args: Prisma.WorkspaceMemberCreateArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$WorkspaceMemberPayload>
          }
          createMany: {
            args: Prisma.WorkspaceMemberCreateManyArgs<ExtArgs>
            result: BatchPayload
          }
          createManyAndReturn: {
            args: Prisma.WorkspaceMemberCreateManyAndReturnArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$WorkspaceMemberPayload>[]
          }
          delete: {
            args: Prisma.WorkspaceMemberDeleteArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$WorkspaceMemberPayload>
          }
          update: {
            args: Prisma.WorkspaceMemberUpdateArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$WorkspaceMemberPayload>
          }
          deleteMany: {
            args: Prisma.WorkspaceMemberDeleteManyArgs<ExtArgs>
            result: BatchPayload
          }
          updateMany: {
            args: Prisma.WorkspaceMemberUpdateManyArgs<ExtArgs>
            result: BatchPayload
          }
          updateManyAndReturn: {
            args: Prisma.WorkspaceMemberUpdateManyAndReturnArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$WorkspaceMemberPayload>[]
          }
          upsert: {
            args: Prisma.WorkspaceMemberUpsertArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$WorkspaceMemberPayload>
          }
          aggregate: {
            args: Prisma.WorkspaceMemberAggregateArgs<ExtArgs>
            result: $Utils.Optional<AggregateWorkspaceMember>
          }
          groupBy: {
            args: Prisma.WorkspaceMemberGroupByArgs<ExtArgs>
            result: $Utils.Optional<WorkspaceMemberGroupByOutputType>[]
          }
          count: {
            args: Prisma.WorkspaceMemberCountArgs<ExtArgs>
            result: $Utils.Optional<WorkspaceMemberCountAggregateOutputType> | number
          }
        }
      }
      Invitation: {
        payload: Prisma.$InvitationPayload<ExtArgs>
        fields: Prisma.InvitationFieldRefs
        operations: {
          findUnique: {
            args: Prisma.InvitationFindUniqueArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$InvitationPayload> | null
          }
          findUniqueOrThrow: {
            args: Prisma.InvitationFindUniqueOrThrowArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$InvitationPayload>
          }
          findFirst: {
            args: Prisma.InvitationFindFirstArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$InvitationPayload> | null
          }
          findFirstOrThrow: {
            args: Prisma.InvitationFindFirstOrThrowArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$InvitationPayload>
          }
          findMany: {
            args: Prisma.InvitationFindManyArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$InvitationPayload>[]
          }
          create: {
            args: Prisma.InvitationCreateArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$InvitationPayload>
          }
          createMany: {
            args: Prisma.InvitationCreateManyArgs<ExtArgs>
            result: BatchPayload
          }
          createManyAndReturn: {
            args: Prisma.InvitationCreateManyAndReturnArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$InvitationPayload>[]
          }
          delete: {
            args: Prisma.InvitationDeleteArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$InvitationPayload>
          }
          update: {
            args: Prisma.InvitationUpdateArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$InvitationPayload>
          }
          deleteMany: {
            args: Prisma.InvitationDeleteManyArgs<ExtArgs>
            result: BatchPayload
          }
          updateMany: {
            args: Prisma.InvitationUpdateManyArgs<ExtArgs>
            result: BatchPayload
          }
          updateManyAndReturn: {
            args: Prisma.InvitationUpdateManyAndReturnArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$InvitationPayload>[]
          }
          upsert: {
            args: Prisma.InvitationUpsertArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$InvitationPayload>
          }
          aggregate: {
            args: Prisma.InvitationAggregateArgs<ExtArgs>
            result: $Utils.Optional<AggregateInvitation>
          }
          groupBy: {
            args: Prisma.InvitationGroupByArgs<ExtArgs>
            result: $Utils.Optional<InvitationGroupByOutputType>[]
          }
          count: {
            args: Prisma.InvitationCountArgs<ExtArgs>
            result: $Utils.Optional<InvitationCountAggregateOutputType> | number
          }
        }
      }
      AuditLog: {
        payload: Prisma.$AuditLogPayload<ExtArgs>
        fields: Prisma.AuditLogFieldRefs
        operations: {
          findUnique: {
            args: Prisma.AuditLogFindUniqueArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$AuditLogPayload> | null
          }
          findUniqueOrThrow: {
            args: Prisma.AuditLogFindUniqueOrThrowArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$AuditLogPayload>
          }
          findFirst: {
            args: Prisma.AuditLogFindFirstArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$AuditLogPayload> | null
          }
          findFirstOrThrow: {
            args: Prisma.AuditLogFindFirstOrThrowArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$AuditLogPayload>
          }
          findMany: {
            args: Prisma.AuditLogFindManyArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$AuditLogPayload>[]
          }
          create: {
            args: Prisma.AuditLogCreateArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$AuditLogPayload>
          }
          createMany: {
            args: Prisma.AuditLogCreateManyArgs<ExtArgs>
            result: BatchPayload
          }
          createManyAndReturn: {
            args: Prisma.AuditLogCreateManyAndReturnArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$AuditLogPayload>[]
          }
          delete: {
            args: Prisma.AuditLogDeleteArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$AuditLogPayload>
          }
          update: {
            args: Prisma.AuditLogUpdateArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$AuditLogPayload>
          }
          deleteMany: {
            args: Prisma.AuditLogDeleteManyArgs<ExtArgs>
            result: BatchPayload
          }
          updateMany: {
            args: Prisma.AuditLogUpdateManyArgs<ExtArgs>
            result: BatchPayload
          }
          updateManyAndReturn: {
            args: Prisma.AuditLogUpdateManyAndReturnArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$AuditLogPayload>[]
          }
          upsert: {
            args: Prisma.AuditLogUpsertArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$AuditLogPayload>
          }
          aggregate: {
            args: Prisma.AuditLogAggregateArgs<ExtArgs>
            result: $Utils.Optional<AggregateAuditLog>
          }
          groupBy: {
            args: Prisma.AuditLogGroupByArgs<ExtArgs>
            result: $Utils.Optional<AuditLogGroupByOutputType>[]
          }
          count: {
            args: Prisma.AuditLogCountArgs<ExtArgs>
            result: $Utils.Optional<AuditLogCountAggregateOutputType> | number
          }
        }
      }
      AbacDecisionLog: {
        payload: Prisma.$AbacDecisionLogPayload<ExtArgs>
        fields: Prisma.AbacDecisionLogFieldRefs
        operations: {
          findUnique: {
            args: Prisma.AbacDecisionLogFindUniqueArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$AbacDecisionLogPayload> | null
          }
          findUniqueOrThrow: {
            args: Prisma.AbacDecisionLogFindUniqueOrThrowArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$AbacDecisionLogPayload>
          }
          findFirst: {
            args: Prisma.AbacDecisionLogFindFirstArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$AbacDecisionLogPayload> | null
          }
          findFirstOrThrow: {
            args: Prisma.AbacDecisionLogFindFirstOrThrowArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$AbacDecisionLogPayload>
          }
          findMany: {
            args: Prisma.AbacDecisionLogFindManyArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$AbacDecisionLogPayload>[]
          }
          create: {
            args: Prisma.AbacDecisionLogCreateArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$AbacDecisionLogPayload>
          }
          createMany: {
            args: Prisma.AbacDecisionLogCreateManyArgs<ExtArgs>
            result: BatchPayload
          }
          createManyAndReturn: {
            args: Prisma.AbacDecisionLogCreateManyAndReturnArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$AbacDecisionLogPayload>[]
          }
          delete: {
            args: Prisma.AbacDecisionLogDeleteArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$AbacDecisionLogPayload>
          }
          update: {
            args: Prisma.AbacDecisionLogUpdateArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$AbacDecisionLogPayload>
          }
          deleteMany: {
            args: Prisma.AbacDecisionLogDeleteManyArgs<ExtArgs>
            result: BatchPayload
          }
          updateMany: {
            args: Prisma.AbacDecisionLogUpdateManyArgs<ExtArgs>
            result: BatchPayload
          }
          updateManyAndReturn: {
            args: Prisma.AbacDecisionLogUpdateManyAndReturnArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$AbacDecisionLogPayload>[]
          }
          upsert: {
            args: Prisma.AbacDecisionLogUpsertArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$AbacDecisionLogPayload>
          }
          aggregate: {
            args: Prisma.AbacDecisionLogAggregateArgs<ExtArgs>
            result: $Utils.Optional<AggregateAbacDecisionLog>
          }
          groupBy: {
            args: Prisma.AbacDecisionLogGroupByArgs<ExtArgs>
            result: $Utils.Optional<AbacDecisionLogGroupByOutputType>[]
          }
          count: {
            args: Prisma.AbacDecisionLogCountArgs<ExtArgs>
            result: $Utils.Optional<AbacDecisionLogCountAggregateOutputType> | number
          }
        }
      }
      ActionRegistry: {
        payload: Prisma.$ActionRegistryPayload<ExtArgs>
        fields: Prisma.ActionRegistryFieldRefs
        operations: {
          findUnique: {
            args: Prisma.ActionRegistryFindUniqueArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$ActionRegistryPayload> | null
          }
          findUniqueOrThrow: {
            args: Prisma.ActionRegistryFindUniqueOrThrowArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$ActionRegistryPayload>
          }
          findFirst: {
            args: Prisma.ActionRegistryFindFirstArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$ActionRegistryPayload> | null
          }
          findFirstOrThrow: {
            args: Prisma.ActionRegistryFindFirstOrThrowArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$ActionRegistryPayload>
          }
          findMany: {
            args: Prisma.ActionRegistryFindManyArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$ActionRegistryPayload>[]
          }
          create: {
            args: Prisma.ActionRegistryCreateArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$ActionRegistryPayload>
          }
          createMany: {
            args: Prisma.ActionRegistryCreateManyArgs<ExtArgs>
            result: BatchPayload
          }
          createManyAndReturn: {
            args: Prisma.ActionRegistryCreateManyAndReturnArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$ActionRegistryPayload>[]
          }
          delete: {
            args: Prisma.ActionRegistryDeleteArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$ActionRegistryPayload>
          }
          update: {
            args: Prisma.ActionRegistryUpdateArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$ActionRegistryPayload>
          }
          deleteMany: {
            args: Prisma.ActionRegistryDeleteManyArgs<ExtArgs>
            result: BatchPayload
          }
          updateMany: {
            args: Prisma.ActionRegistryUpdateManyArgs<ExtArgs>
            result: BatchPayload
          }
          updateManyAndReturn: {
            args: Prisma.ActionRegistryUpdateManyAndReturnArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$ActionRegistryPayload>[]
          }
          upsert: {
            args: Prisma.ActionRegistryUpsertArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$ActionRegistryPayload>
          }
          aggregate: {
            args: Prisma.ActionRegistryAggregateArgs<ExtArgs>
            result: $Utils.Optional<AggregateActionRegistry>
          }
          groupBy: {
            args: Prisma.ActionRegistryGroupByArgs<ExtArgs>
            result: $Utils.Optional<ActionRegistryGroupByOutputType>[]
          }
          count: {
            args: Prisma.ActionRegistryCountArgs<ExtArgs>
            result: $Utils.Optional<ActionRegistryCountAggregateOutputType> | number
          }
        }
      }
      WorkspaceRoleAction: {
        payload: Prisma.$WorkspaceRoleActionPayload<ExtArgs>
        fields: Prisma.WorkspaceRoleActionFieldRefs
        operations: {
          findUnique: {
            args: Prisma.WorkspaceRoleActionFindUniqueArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$WorkspaceRoleActionPayload> | null
          }
          findUniqueOrThrow: {
            args: Prisma.WorkspaceRoleActionFindUniqueOrThrowArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$WorkspaceRoleActionPayload>
          }
          findFirst: {
            args: Prisma.WorkspaceRoleActionFindFirstArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$WorkspaceRoleActionPayload> | null
          }
          findFirstOrThrow: {
            args: Prisma.WorkspaceRoleActionFindFirstOrThrowArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$WorkspaceRoleActionPayload>
          }
          findMany: {
            args: Prisma.WorkspaceRoleActionFindManyArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$WorkspaceRoleActionPayload>[]
          }
          create: {
            args: Prisma.WorkspaceRoleActionCreateArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$WorkspaceRoleActionPayload>
          }
          createMany: {
            args: Prisma.WorkspaceRoleActionCreateManyArgs<ExtArgs>
            result: BatchPayload
          }
          createManyAndReturn: {
            args: Prisma.WorkspaceRoleActionCreateManyAndReturnArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$WorkspaceRoleActionPayload>[]
          }
          delete: {
            args: Prisma.WorkspaceRoleActionDeleteArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$WorkspaceRoleActionPayload>
          }
          update: {
            args: Prisma.WorkspaceRoleActionUpdateArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$WorkspaceRoleActionPayload>
          }
          deleteMany: {
            args: Prisma.WorkspaceRoleActionDeleteManyArgs<ExtArgs>
            result: BatchPayload
          }
          updateMany: {
            args: Prisma.WorkspaceRoleActionUpdateManyArgs<ExtArgs>
            result: BatchPayload
          }
          updateManyAndReturn: {
            args: Prisma.WorkspaceRoleActionUpdateManyAndReturnArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$WorkspaceRoleActionPayload>[]
          }
          upsert: {
            args: Prisma.WorkspaceRoleActionUpsertArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$WorkspaceRoleActionPayload>
          }
          aggregate: {
            args: Prisma.WorkspaceRoleActionAggregateArgs<ExtArgs>
            result: $Utils.Optional<AggregateWorkspaceRoleAction>
          }
          groupBy: {
            args: Prisma.WorkspaceRoleActionGroupByArgs<ExtArgs>
            result: $Utils.Optional<WorkspaceRoleActionGroupByOutputType>[]
          }
          count: {
            args: Prisma.WorkspaceRoleActionCountArgs<ExtArgs>
            result: $Utils.Optional<WorkspaceRoleActionCountAggregateOutputType> | number
          }
        }
      }
    }
  } & {
    other: {
      payload: any
      operations: {
        $executeRaw: {
          args: [query: TemplateStringsArray | Prisma.Sql, ...values: any[]],
          result: any
        }
        $executeRawUnsafe: {
          args: [query: string, ...values: any[]],
          result: any
        }
        $queryRaw: {
          args: [query: TemplateStringsArray | Prisma.Sql, ...values: any[]],
          result: any
        }
        $queryRawUnsafe: {
          args: [query: string, ...values: any[]],
          result: any
        }
      }
    }
  }
  export const defineExtension: $Extensions.ExtendsHook<"define", Prisma.TypeMapCb, $Extensions.DefaultArgs>
  export type DefaultPrismaClient = PrismaClient
  export type ErrorFormat = 'pretty' | 'colorless' | 'minimal'
  export interface PrismaClientOptions {
    /**
     * Overwrites the datasource url from your schema.prisma file
     */
    datasources?: Datasources
    /**
     * Overwrites the datasource url from your schema.prisma file
     */
    datasourceUrl?: string
    /**
     * @default "colorless"
     */
    errorFormat?: ErrorFormat
    /**
     * @example
     * ```
     * // Shorthand for `emit: 'stdout'`
     * log: ['query', 'info', 'warn', 'error']
     * 
     * // Emit as events only
     * log: [
     *   { emit: 'event', level: 'query' },
     *   { emit: 'event', level: 'info' },
     *   { emit: 'event', level: 'warn' }
     *   { emit: 'event', level: 'error' }
     * ]
     * 
     * / Emit as events and log to stdout
     * og: [
     *  { emit: 'stdout', level: 'query' },
     *  { emit: 'stdout', level: 'info' },
     *  { emit: 'stdout', level: 'warn' }
     *  { emit: 'stdout', level: 'error' }
     * 
     * ```
     * Read more in our [docs](https://www.prisma.io/docs/reference/tools-and-interfaces/prisma-client/logging#the-log-option).
     */
    log?: (LogLevel | LogDefinition)[]
    /**
     * The default values for transactionOptions
     * maxWait ?= 2000
     * timeout ?= 5000
     */
    transactionOptions?: {
      maxWait?: number
      timeout?: number
      isolationLevel?: Prisma.TransactionIsolationLevel
    }
    /**
     * Instance of a Driver Adapter, e.g., like one provided by `@prisma/adapter-planetscale`
     */
    adapter?: runtime.SqlDriverAdapterFactory | null
    /**
     * Global configuration for omitting model fields by default.
     * 
     * @example
     * ```
     * const prisma = new PrismaClient({
     *   omit: {
     *     user: {
     *       password: true
     *     }
     *   }
     * })
     * ```
     */
    omit?: Prisma.GlobalOmitConfig
  }
  export type GlobalOmitConfig = {
    userProfile?: UserProfileOmit
    workspaceTemplate?: WorkspaceTemplateOmit
    tenantBranding?: TenantBrandingOmit
    workspace?: WorkspaceOmit
    workspaceMember?: WorkspaceMemberOmit
    invitation?: InvitationOmit
    auditLog?: AuditLogOmit
    abacDecisionLog?: AbacDecisionLogOmit
    actionRegistry?: ActionRegistryOmit
    workspaceRoleAction?: WorkspaceRoleActionOmit
  }

  /* Types for Logging */
  export type LogLevel = 'info' | 'query' | 'warn' | 'error'
  export type LogDefinition = {
    level: LogLevel
    emit: 'stdout' | 'event'
  }

  export type CheckIsLogLevel<T> = T extends LogLevel ? T : never;

  export type GetLogType<T> = CheckIsLogLevel<
    T extends LogDefinition ? T['level'] : T
  >;

  export type GetEvents<T extends any[]> = T extends Array<LogLevel | LogDefinition>
    ? GetLogType<T[number]>
    : never;

  export type QueryEvent = {
    timestamp: Date
    query: string
    params: string
    duration: number
    target: string
  }

  export type LogEvent = {
    timestamp: Date
    message: string
    target: string
  }
  /* End Types for Logging */


  export type PrismaAction =
    | 'findUnique'
    | 'findUniqueOrThrow'
    | 'findMany'
    | 'findFirst'
    | 'findFirstOrThrow'
    | 'create'
    | 'createMany'
    | 'createManyAndReturn'
    | 'update'
    | 'updateMany'
    | 'updateManyAndReturn'
    | 'upsert'
    | 'delete'
    | 'deleteMany'
    | 'executeRaw'
    | 'queryRaw'
    | 'aggregate'
    | 'count'
    | 'runCommandRaw'
    | 'findRaw'
    | 'groupBy'

  // tested in getLogLevel.test.ts
  export function getLogLevel(log: Array<LogLevel | LogDefinition>): LogLevel | undefined;

  /**
   * `PrismaClient` proxy available in interactive transactions.
   */
  export type TransactionClient = Omit<Prisma.DefaultPrismaClient, runtime.ITXClientDenyList>

  export type Datasource = {
    url?: string
  }

  /**
   * Count Types
   */


  /**
   * Count Type UserProfileCountOutputType
   */

  export type UserProfileCountOutputType = {
    workspacesCreated: number
    workspaceMembers: number
    invitationsSent: number
  }

  export type UserProfileCountOutputTypeSelect<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    workspacesCreated?: boolean | UserProfileCountOutputTypeCountWorkspacesCreatedArgs
    workspaceMembers?: boolean | UserProfileCountOutputTypeCountWorkspaceMembersArgs
    invitationsSent?: boolean | UserProfileCountOutputTypeCountInvitationsSentArgs
  }

  // Custom InputTypes
  /**
   * UserProfileCountOutputType without action
   */
  export type UserProfileCountOutputTypeDefaultArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the UserProfileCountOutputType
     */
    select?: UserProfileCountOutputTypeSelect<ExtArgs> | null
  }

  /**
   * UserProfileCountOutputType without action
   */
  export type UserProfileCountOutputTypeCountWorkspacesCreatedArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    where?: WorkspaceWhereInput
  }

  /**
   * UserProfileCountOutputType without action
   */
  export type UserProfileCountOutputTypeCountWorkspaceMembersArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    where?: WorkspaceMemberWhereInput
  }

  /**
   * UserProfileCountOutputType without action
   */
  export type UserProfileCountOutputTypeCountInvitationsSentArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    where?: InvitationWhereInput
  }


  /**
   * Count Type WorkspaceTemplateCountOutputType
   */

  export type WorkspaceTemplateCountOutputType = {
    workspaces: number
  }

  export type WorkspaceTemplateCountOutputTypeSelect<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    workspaces?: boolean | WorkspaceTemplateCountOutputTypeCountWorkspacesArgs
  }

  // Custom InputTypes
  /**
   * WorkspaceTemplateCountOutputType without action
   */
  export type WorkspaceTemplateCountOutputTypeDefaultArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the WorkspaceTemplateCountOutputType
     */
    select?: WorkspaceTemplateCountOutputTypeSelect<ExtArgs> | null
  }

  /**
   * WorkspaceTemplateCountOutputType without action
   */
  export type WorkspaceTemplateCountOutputTypeCountWorkspacesArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    where?: WorkspaceWhereInput
  }


  /**
   * Count Type WorkspaceCountOutputType
   */

  export type WorkspaceCountOutputType = {
    children: number
    members: number
    invitations: number
    roleActions: number
  }

  export type WorkspaceCountOutputTypeSelect<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    children?: boolean | WorkspaceCountOutputTypeCountChildrenArgs
    members?: boolean | WorkspaceCountOutputTypeCountMembersArgs
    invitations?: boolean | WorkspaceCountOutputTypeCountInvitationsArgs
    roleActions?: boolean | WorkspaceCountOutputTypeCountRoleActionsArgs
  }

  // Custom InputTypes
  /**
   * WorkspaceCountOutputType without action
   */
  export type WorkspaceCountOutputTypeDefaultArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the WorkspaceCountOutputType
     */
    select?: WorkspaceCountOutputTypeSelect<ExtArgs> | null
  }

  /**
   * WorkspaceCountOutputType without action
   */
  export type WorkspaceCountOutputTypeCountChildrenArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    where?: WorkspaceWhereInput
  }

  /**
   * WorkspaceCountOutputType without action
   */
  export type WorkspaceCountOutputTypeCountMembersArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    where?: WorkspaceMemberWhereInput
  }

  /**
   * WorkspaceCountOutputType without action
   */
  export type WorkspaceCountOutputTypeCountInvitationsArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    where?: InvitationWhereInput
  }

  /**
   * WorkspaceCountOutputType without action
   */
  export type WorkspaceCountOutputTypeCountRoleActionsArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    where?: WorkspaceRoleActionWhereInput
  }


  /**
   * Models
   */

  /**
   * Model UserProfile
   */

  export type AggregateUserProfile = {
    _count: UserProfileCountAggregateOutputType | null
    _min: UserProfileMinAggregateOutputType | null
    _max: UserProfileMaxAggregateOutputType | null
  }

  export type UserProfileMinAggregateOutputType = {
    userId: string | null
    keycloakUserId: string | null
    email: string | null
    displayName: string | null
    avatarPath: string | null
    timezone: string | null
    language: string | null
    status: string | null
    deletedAt: Date | null
    createdAt: Date | null
    updatedAt: Date | null
  }

  export type UserProfileMaxAggregateOutputType = {
    userId: string | null
    keycloakUserId: string | null
    email: string | null
    displayName: string | null
    avatarPath: string | null
    timezone: string | null
    language: string | null
    status: string | null
    deletedAt: Date | null
    createdAt: Date | null
    updatedAt: Date | null
  }

  export type UserProfileCountAggregateOutputType = {
    userId: number
    keycloakUserId: number
    email: number
    displayName: number
    avatarPath: number
    timezone: number
    language: number
    notificationPrefs: number
    status: number
    deletedAt: number
    createdAt: number
    updatedAt: number
    _all: number
  }


  export type UserProfileMinAggregateInputType = {
    userId?: true
    keycloakUserId?: true
    email?: true
    displayName?: true
    avatarPath?: true
    timezone?: true
    language?: true
    status?: true
    deletedAt?: true
    createdAt?: true
    updatedAt?: true
  }

  export type UserProfileMaxAggregateInputType = {
    userId?: true
    keycloakUserId?: true
    email?: true
    displayName?: true
    avatarPath?: true
    timezone?: true
    language?: true
    status?: true
    deletedAt?: true
    createdAt?: true
    updatedAt?: true
  }

  export type UserProfileCountAggregateInputType = {
    userId?: true
    keycloakUserId?: true
    email?: true
    displayName?: true
    avatarPath?: true
    timezone?: true
    language?: true
    notificationPrefs?: true
    status?: true
    deletedAt?: true
    createdAt?: true
    updatedAt?: true
    _all?: true
  }

  export type UserProfileAggregateArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Filter which UserProfile to aggregate.
     */
    where?: UserProfileWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of UserProfiles to fetch.
     */
    orderBy?: UserProfileOrderByWithRelationInput | UserProfileOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the start position
     */
    cursor?: UserProfileWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` UserProfiles from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` UserProfiles.
     */
    skip?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Count returned UserProfiles
    **/
    _count?: true | UserProfileCountAggregateInputType
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Select which fields to find the minimum value
    **/
    _min?: UserProfileMinAggregateInputType
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Select which fields to find the maximum value
    **/
    _max?: UserProfileMaxAggregateInputType
  }

  export type GetUserProfileAggregateType<T extends UserProfileAggregateArgs> = {
        [P in keyof T & keyof AggregateUserProfile]: P extends '_count' | 'count'
      ? T[P] extends true
        ? number
        : GetScalarType<T[P], AggregateUserProfile[P]>
      : GetScalarType<T[P], AggregateUserProfile[P]>
  }




  export type UserProfileGroupByArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    where?: UserProfileWhereInput
    orderBy?: UserProfileOrderByWithAggregationInput | UserProfileOrderByWithAggregationInput[]
    by: UserProfileScalarFieldEnum[] | UserProfileScalarFieldEnum
    having?: UserProfileScalarWhereWithAggregatesInput
    take?: number
    skip?: number
    _count?: UserProfileCountAggregateInputType | true
    _min?: UserProfileMinAggregateInputType
    _max?: UserProfileMaxAggregateInputType
  }

  export type UserProfileGroupByOutputType = {
    userId: string
    keycloakUserId: string
    email: string
    displayName: string | null
    avatarPath: string | null
    timezone: string
    language: string
    notificationPrefs: JsonValue
    status: string
    deletedAt: Date | null
    createdAt: Date
    updatedAt: Date
    _count: UserProfileCountAggregateOutputType | null
    _min: UserProfileMinAggregateOutputType | null
    _max: UserProfileMaxAggregateOutputType | null
  }

  type GetUserProfileGroupByPayload<T extends UserProfileGroupByArgs> = Prisma.PrismaPromise<
    Array<
      PickEnumerable<UserProfileGroupByOutputType, T['by']> &
        {
          [P in ((keyof T) & (keyof UserProfileGroupByOutputType))]: P extends '_count'
            ? T[P] extends boolean
              ? number
              : GetScalarType<T[P], UserProfileGroupByOutputType[P]>
            : GetScalarType<T[P], UserProfileGroupByOutputType[P]>
        }
      >
    >


  export type UserProfileSelect<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetSelect<{
    userId?: boolean
    keycloakUserId?: boolean
    email?: boolean
    displayName?: boolean
    avatarPath?: boolean
    timezone?: boolean
    language?: boolean
    notificationPrefs?: boolean
    status?: boolean
    deletedAt?: boolean
    createdAt?: boolean
    updatedAt?: boolean
    workspacesCreated?: boolean | UserProfile$workspacesCreatedArgs<ExtArgs>
    workspaceMembers?: boolean | UserProfile$workspaceMembersArgs<ExtArgs>
    invitationsSent?: boolean | UserProfile$invitationsSentArgs<ExtArgs>
    _count?: boolean | UserProfileCountOutputTypeDefaultArgs<ExtArgs>
  }, ExtArgs["result"]["userProfile"]>

  export type UserProfileSelectCreateManyAndReturn<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetSelect<{
    userId?: boolean
    keycloakUserId?: boolean
    email?: boolean
    displayName?: boolean
    avatarPath?: boolean
    timezone?: boolean
    language?: boolean
    notificationPrefs?: boolean
    status?: boolean
    deletedAt?: boolean
    createdAt?: boolean
    updatedAt?: boolean
  }, ExtArgs["result"]["userProfile"]>

  export type UserProfileSelectUpdateManyAndReturn<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetSelect<{
    userId?: boolean
    keycloakUserId?: boolean
    email?: boolean
    displayName?: boolean
    avatarPath?: boolean
    timezone?: boolean
    language?: boolean
    notificationPrefs?: boolean
    status?: boolean
    deletedAt?: boolean
    createdAt?: boolean
    updatedAt?: boolean
  }, ExtArgs["result"]["userProfile"]>

  export type UserProfileSelectScalar = {
    userId?: boolean
    keycloakUserId?: boolean
    email?: boolean
    displayName?: boolean
    avatarPath?: boolean
    timezone?: boolean
    language?: boolean
    notificationPrefs?: boolean
    status?: boolean
    deletedAt?: boolean
    createdAt?: boolean
    updatedAt?: boolean
  }

  export type UserProfileOmit<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetOmit<"userId" | "keycloakUserId" | "email" | "displayName" | "avatarPath" | "timezone" | "language" | "notificationPrefs" | "status" | "deletedAt" | "createdAt" | "updatedAt", ExtArgs["result"]["userProfile"]>
  export type UserProfileInclude<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    workspacesCreated?: boolean | UserProfile$workspacesCreatedArgs<ExtArgs>
    workspaceMembers?: boolean | UserProfile$workspaceMembersArgs<ExtArgs>
    invitationsSent?: boolean | UserProfile$invitationsSentArgs<ExtArgs>
    _count?: boolean | UserProfileCountOutputTypeDefaultArgs<ExtArgs>
  }
  export type UserProfileIncludeCreateManyAndReturn<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {}
  export type UserProfileIncludeUpdateManyAndReturn<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {}

  export type $UserProfilePayload<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    name: "UserProfile"
    objects: {
      workspacesCreated: Prisma.$WorkspacePayload<ExtArgs>[]
      workspaceMembers: Prisma.$WorkspaceMemberPayload<ExtArgs>[]
      invitationsSent: Prisma.$InvitationPayload<ExtArgs>[]
    }
    scalars: $Extensions.GetPayloadResult<{
      userId: string
      keycloakUserId: string
      email: string
      displayName: string | null
      avatarPath: string | null
      timezone: string
      language: string
      notificationPrefs: Prisma.JsonValue
      status: string
      deletedAt: Date | null
      createdAt: Date
      updatedAt: Date
    }, ExtArgs["result"]["userProfile"]>
    composites: {}
  }

  type UserProfileGetPayload<S extends boolean | null | undefined | UserProfileDefaultArgs> = $Result.GetResult<Prisma.$UserProfilePayload, S>

  type UserProfileCountArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> =
    Omit<UserProfileFindManyArgs, 'select' | 'include' | 'distinct' | 'omit'> & {
      select?: UserProfileCountAggregateInputType | true
    }

  export interface UserProfileDelegate<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs, GlobalOmitOptions = {}> {
    [K: symbol]: { types: Prisma.TypeMap<ExtArgs>['model']['UserProfile'], meta: { name: 'UserProfile' } }
    /**
     * Find zero or one UserProfile that matches the filter.
     * @param {UserProfileFindUniqueArgs} args - Arguments to find a UserProfile
     * @example
     * // Get one UserProfile
     * const userProfile = await prisma.userProfile.findUnique({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findUnique<T extends UserProfileFindUniqueArgs>(args: SelectSubset<T, UserProfileFindUniqueArgs<ExtArgs>>): Prisma__UserProfileClient<$Result.GetResult<Prisma.$UserProfilePayload<ExtArgs>, T, "findUnique", GlobalOmitOptions> | null, null, ExtArgs, GlobalOmitOptions>

    /**
     * Find one UserProfile that matches the filter or throw an error with `error.code='P2025'`
     * if no matches were found.
     * @param {UserProfileFindUniqueOrThrowArgs} args - Arguments to find a UserProfile
     * @example
     * // Get one UserProfile
     * const userProfile = await prisma.userProfile.findUniqueOrThrow({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findUniqueOrThrow<T extends UserProfileFindUniqueOrThrowArgs>(args: SelectSubset<T, UserProfileFindUniqueOrThrowArgs<ExtArgs>>): Prisma__UserProfileClient<$Result.GetResult<Prisma.$UserProfilePayload<ExtArgs>, T, "findUniqueOrThrow", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Find the first UserProfile that matches the filter.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {UserProfileFindFirstArgs} args - Arguments to find a UserProfile
     * @example
     * // Get one UserProfile
     * const userProfile = await prisma.userProfile.findFirst({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findFirst<T extends UserProfileFindFirstArgs>(args?: SelectSubset<T, UserProfileFindFirstArgs<ExtArgs>>): Prisma__UserProfileClient<$Result.GetResult<Prisma.$UserProfilePayload<ExtArgs>, T, "findFirst", GlobalOmitOptions> | null, null, ExtArgs, GlobalOmitOptions>

    /**
     * Find the first UserProfile that matches the filter or
     * throw `PrismaKnownClientError` with `P2025` code if no matches were found.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {UserProfileFindFirstOrThrowArgs} args - Arguments to find a UserProfile
     * @example
     * // Get one UserProfile
     * const userProfile = await prisma.userProfile.findFirstOrThrow({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findFirstOrThrow<T extends UserProfileFindFirstOrThrowArgs>(args?: SelectSubset<T, UserProfileFindFirstOrThrowArgs<ExtArgs>>): Prisma__UserProfileClient<$Result.GetResult<Prisma.$UserProfilePayload<ExtArgs>, T, "findFirstOrThrow", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Find zero or more UserProfiles that matches the filter.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {UserProfileFindManyArgs} args - Arguments to filter and select certain fields only.
     * @example
     * // Get all UserProfiles
     * const userProfiles = await prisma.userProfile.findMany()
     * 
     * // Get first 10 UserProfiles
     * const userProfiles = await prisma.userProfile.findMany({ take: 10 })
     * 
     * // Only select the `userId`
     * const userProfileWithUserIdOnly = await prisma.userProfile.findMany({ select: { userId: true } })
     * 
     */
    findMany<T extends UserProfileFindManyArgs>(args?: SelectSubset<T, UserProfileFindManyArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$UserProfilePayload<ExtArgs>, T, "findMany", GlobalOmitOptions>>

    /**
     * Create a UserProfile.
     * @param {UserProfileCreateArgs} args - Arguments to create a UserProfile.
     * @example
     * // Create one UserProfile
     * const UserProfile = await prisma.userProfile.create({
     *   data: {
     *     // ... data to create a UserProfile
     *   }
     * })
     * 
     */
    create<T extends UserProfileCreateArgs>(args: SelectSubset<T, UserProfileCreateArgs<ExtArgs>>): Prisma__UserProfileClient<$Result.GetResult<Prisma.$UserProfilePayload<ExtArgs>, T, "create", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Create many UserProfiles.
     * @param {UserProfileCreateManyArgs} args - Arguments to create many UserProfiles.
     * @example
     * // Create many UserProfiles
     * const userProfile = await prisma.userProfile.createMany({
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     *     
     */
    createMany<T extends UserProfileCreateManyArgs>(args?: SelectSubset<T, UserProfileCreateManyArgs<ExtArgs>>): Prisma.PrismaPromise<BatchPayload>

    /**
     * Create many UserProfiles and returns the data saved in the database.
     * @param {UserProfileCreateManyAndReturnArgs} args - Arguments to create many UserProfiles.
     * @example
     * // Create many UserProfiles
     * const userProfile = await prisma.userProfile.createManyAndReturn({
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * 
     * // Create many UserProfiles and only return the `userId`
     * const userProfileWithUserIdOnly = await prisma.userProfile.createManyAndReturn({
     *   select: { userId: true },
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * 
     */
    createManyAndReturn<T extends UserProfileCreateManyAndReturnArgs>(args?: SelectSubset<T, UserProfileCreateManyAndReturnArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$UserProfilePayload<ExtArgs>, T, "createManyAndReturn", GlobalOmitOptions>>

    /**
     * Delete a UserProfile.
     * @param {UserProfileDeleteArgs} args - Arguments to delete one UserProfile.
     * @example
     * // Delete one UserProfile
     * const UserProfile = await prisma.userProfile.delete({
     *   where: {
     *     // ... filter to delete one UserProfile
     *   }
     * })
     * 
     */
    delete<T extends UserProfileDeleteArgs>(args: SelectSubset<T, UserProfileDeleteArgs<ExtArgs>>): Prisma__UserProfileClient<$Result.GetResult<Prisma.$UserProfilePayload<ExtArgs>, T, "delete", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Update one UserProfile.
     * @param {UserProfileUpdateArgs} args - Arguments to update one UserProfile.
     * @example
     * // Update one UserProfile
     * const userProfile = await prisma.userProfile.update({
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: {
     *     // ... provide data here
     *   }
     * })
     * 
     */
    update<T extends UserProfileUpdateArgs>(args: SelectSubset<T, UserProfileUpdateArgs<ExtArgs>>): Prisma__UserProfileClient<$Result.GetResult<Prisma.$UserProfilePayload<ExtArgs>, T, "update", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Delete zero or more UserProfiles.
     * @param {UserProfileDeleteManyArgs} args - Arguments to filter UserProfiles to delete.
     * @example
     * // Delete a few UserProfiles
     * const { count } = await prisma.userProfile.deleteMany({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     * 
     */
    deleteMany<T extends UserProfileDeleteManyArgs>(args?: SelectSubset<T, UserProfileDeleteManyArgs<ExtArgs>>): Prisma.PrismaPromise<BatchPayload>

    /**
     * Update zero or more UserProfiles.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {UserProfileUpdateManyArgs} args - Arguments to update one or more rows.
     * @example
     * // Update many UserProfiles
     * const userProfile = await prisma.userProfile.updateMany({
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: {
     *     // ... provide data here
     *   }
     * })
     * 
     */
    updateMany<T extends UserProfileUpdateManyArgs>(args: SelectSubset<T, UserProfileUpdateManyArgs<ExtArgs>>): Prisma.PrismaPromise<BatchPayload>

    /**
     * Update zero or more UserProfiles and returns the data updated in the database.
     * @param {UserProfileUpdateManyAndReturnArgs} args - Arguments to update many UserProfiles.
     * @example
     * // Update many UserProfiles
     * const userProfile = await prisma.userProfile.updateManyAndReturn({
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * 
     * // Update zero or more UserProfiles and only return the `userId`
     * const userProfileWithUserIdOnly = await prisma.userProfile.updateManyAndReturn({
     *   select: { userId: true },
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * 
     */
    updateManyAndReturn<T extends UserProfileUpdateManyAndReturnArgs>(args: SelectSubset<T, UserProfileUpdateManyAndReturnArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$UserProfilePayload<ExtArgs>, T, "updateManyAndReturn", GlobalOmitOptions>>

    /**
     * Create or update one UserProfile.
     * @param {UserProfileUpsertArgs} args - Arguments to update or create a UserProfile.
     * @example
     * // Update or create a UserProfile
     * const userProfile = await prisma.userProfile.upsert({
     *   create: {
     *     // ... data to create a UserProfile
     *   },
     *   update: {
     *     // ... in case it already exists, update
     *   },
     *   where: {
     *     // ... the filter for the UserProfile we want to update
     *   }
     * })
     */
    upsert<T extends UserProfileUpsertArgs>(args: SelectSubset<T, UserProfileUpsertArgs<ExtArgs>>): Prisma__UserProfileClient<$Result.GetResult<Prisma.$UserProfilePayload<ExtArgs>, T, "upsert", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>


    /**
     * Count the number of UserProfiles.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {UserProfileCountArgs} args - Arguments to filter UserProfiles to count.
     * @example
     * // Count the number of UserProfiles
     * const count = await prisma.userProfile.count({
     *   where: {
     *     // ... the filter for the UserProfiles we want to count
     *   }
     * })
    **/
    count<T extends UserProfileCountArgs>(
      args?: Subset<T, UserProfileCountArgs>,
    ): Prisma.PrismaPromise<
      T extends $Utils.Record<'select', any>
        ? T['select'] extends true
          ? number
          : GetScalarType<T['select'], UserProfileCountAggregateOutputType>
        : number
    >

    /**
     * Allows you to perform aggregations operations on a UserProfile.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {UserProfileAggregateArgs} args - Select which aggregations you would like to apply and on what fields.
     * @example
     * // Ordered by age ascending
     * // Where email contains prisma.io
     * // Limited to the 10 users
     * const aggregations = await prisma.user.aggregate({
     *   _avg: {
     *     age: true,
     *   },
     *   where: {
     *     email: {
     *       contains: "prisma.io",
     *     },
     *   },
     *   orderBy: {
     *     age: "asc",
     *   },
     *   take: 10,
     * })
    **/
    aggregate<T extends UserProfileAggregateArgs>(args: Subset<T, UserProfileAggregateArgs>): Prisma.PrismaPromise<GetUserProfileAggregateType<T>>

    /**
     * Group by UserProfile.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {UserProfileGroupByArgs} args - Group by arguments.
     * @example
     * // Group by city, order by createdAt, get count
     * const result = await prisma.user.groupBy({
     *   by: ['city', 'createdAt'],
     *   orderBy: {
     *     createdAt: true
     *   },
     *   _count: {
     *     _all: true
     *   },
     * })
     * 
    **/
    groupBy<
      T extends UserProfileGroupByArgs,
      HasSelectOrTake extends Or<
        Extends<'skip', Keys<T>>,
        Extends<'take', Keys<T>>
      >,
      OrderByArg extends True extends HasSelectOrTake
        ? { orderBy: UserProfileGroupByArgs['orderBy'] }
        : { orderBy?: UserProfileGroupByArgs['orderBy'] },
      OrderFields extends ExcludeUnderscoreKeys<Keys<MaybeTupleToUnion<T['orderBy']>>>,
      ByFields extends MaybeTupleToUnion<T['by']>,
      ByValid extends Has<ByFields, OrderFields>,
      HavingFields extends GetHavingFields<T['having']>,
      HavingValid extends Has<ByFields, HavingFields>,
      ByEmpty extends T['by'] extends never[] ? True : False,
      InputErrors extends ByEmpty extends True
      ? `Error: "by" must not be empty.`
      : HavingValid extends False
      ? {
          [P in HavingFields]: P extends ByFields
            ? never
            : P extends string
            ? `Error: Field "${P}" used in "having" needs to be provided in "by".`
            : [
                Error,
                'Field ',
                P,
                ` in "having" needs to be provided in "by"`,
              ]
        }[HavingFields]
      : 'take' extends Keys<T>
      ? 'orderBy' extends Keys<T>
        ? ByValid extends True
          ? {}
          : {
              [P in OrderFields]: P extends ByFields
                ? never
                : `Error: Field "${P}" in "orderBy" needs to be provided in "by"`
            }[OrderFields]
        : 'Error: If you provide "take", you also need to provide "orderBy"'
      : 'skip' extends Keys<T>
      ? 'orderBy' extends Keys<T>
        ? ByValid extends True
          ? {}
          : {
              [P in OrderFields]: P extends ByFields
                ? never
                : `Error: Field "${P}" in "orderBy" needs to be provided in "by"`
            }[OrderFields]
        : 'Error: If you provide "skip", you also need to provide "orderBy"'
      : ByValid extends True
      ? {}
      : {
          [P in OrderFields]: P extends ByFields
            ? never
            : `Error: Field "${P}" in "orderBy" needs to be provided in "by"`
        }[OrderFields]
    >(args: SubsetIntersection<T, UserProfileGroupByArgs, OrderByArg> & InputErrors): {} extends InputErrors ? GetUserProfileGroupByPayload<T> : Prisma.PrismaPromise<InputErrors>
  /**
   * Fields of the UserProfile model
   */
  readonly fields: UserProfileFieldRefs;
  }

  /**
   * The delegate class that acts as a "Promise-like" for UserProfile.
   * Why is this prefixed with `Prisma__`?
   * Because we want to prevent naming conflicts as mentioned in
   * https://github.com/prisma/prisma-client-js/issues/707
   */
  export interface Prisma__UserProfileClient<T, Null = never, ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs, GlobalOmitOptions = {}> extends Prisma.PrismaPromise<T> {
    readonly [Symbol.toStringTag]: "PrismaPromise"
    workspacesCreated<T extends UserProfile$workspacesCreatedArgs<ExtArgs> = {}>(args?: Subset<T, UserProfile$workspacesCreatedArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$WorkspacePayload<ExtArgs>, T, "findMany", GlobalOmitOptions> | Null>
    workspaceMembers<T extends UserProfile$workspaceMembersArgs<ExtArgs> = {}>(args?: Subset<T, UserProfile$workspaceMembersArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$WorkspaceMemberPayload<ExtArgs>, T, "findMany", GlobalOmitOptions> | Null>
    invitationsSent<T extends UserProfile$invitationsSentArgs<ExtArgs> = {}>(args?: Subset<T, UserProfile$invitationsSentArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$InvitationPayload<ExtArgs>, T, "findMany", GlobalOmitOptions> | Null>
    /**
     * Attaches callbacks for the resolution and/or rejection of the Promise.
     * @param onfulfilled The callback to execute when the Promise is resolved.
     * @param onrejected The callback to execute when the Promise is rejected.
     * @returns A Promise for the completion of which ever callback is executed.
     */
    then<TResult1 = T, TResult2 = never>(onfulfilled?: ((value: T) => TResult1 | PromiseLike<TResult1>) | undefined | null, onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | undefined | null): $Utils.JsPromise<TResult1 | TResult2>
    /**
     * Attaches a callback for only the rejection of the Promise.
     * @param onrejected The callback to execute when the Promise is rejected.
     * @returns A Promise for the completion of the callback.
     */
    catch<TResult = never>(onrejected?: ((reason: any) => TResult | PromiseLike<TResult>) | undefined | null): $Utils.JsPromise<T | TResult>
    /**
     * Attaches a callback that is invoked when the Promise is settled (fulfilled or rejected). The
     * resolved value cannot be modified from the callback.
     * @param onfinally The callback to execute when the Promise is settled (fulfilled or rejected).
     * @returns A Promise for the completion of the callback.
     */
    finally(onfinally?: (() => void) | undefined | null): $Utils.JsPromise<T>
  }




  /**
   * Fields of the UserProfile model
   */
  interface UserProfileFieldRefs {
    readonly userId: FieldRef<"UserProfile", 'String'>
    readonly keycloakUserId: FieldRef<"UserProfile", 'String'>
    readonly email: FieldRef<"UserProfile", 'String'>
    readonly displayName: FieldRef<"UserProfile", 'String'>
    readonly avatarPath: FieldRef<"UserProfile", 'String'>
    readonly timezone: FieldRef<"UserProfile", 'String'>
    readonly language: FieldRef<"UserProfile", 'String'>
    readonly notificationPrefs: FieldRef<"UserProfile", 'Json'>
    readonly status: FieldRef<"UserProfile", 'String'>
    readonly deletedAt: FieldRef<"UserProfile", 'DateTime'>
    readonly createdAt: FieldRef<"UserProfile", 'DateTime'>
    readonly updatedAt: FieldRef<"UserProfile", 'DateTime'>
  }
    

  // Custom InputTypes
  /**
   * UserProfile findUnique
   */
  export type UserProfileFindUniqueArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the UserProfile
     */
    select?: UserProfileSelect<ExtArgs> | null
    /**
     * Omit specific fields from the UserProfile
     */
    omit?: UserProfileOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: UserProfileInclude<ExtArgs> | null
    /**
     * Filter, which UserProfile to fetch.
     */
    where: UserProfileWhereUniqueInput
  }

  /**
   * UserProfile findUniqueOrThrow
   */
  export type UserProfileFindUniqueOrThrowArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the UserProfile
     */
    select?: UserProfileSelect<ExtArgs> | null
    /**
     * Omit specific fields from the UserProfile
     */
    omit?: UserProfileOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: UserProfileInclude<ExtArgs> | null
    /**
     * Filter, which UserProfile to fetch.
     */
    where: UserProfileWhereUniqueInput
  }

  /**
   * UserProfile findFirst
   */
  export type UserProfileFindFirstArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the UserProfile
     */
    select?: UserProfileSelect<ExtArgs> | null
    /**
     * Omit specific fields from the UserProfile
     */
    omit?: UserProfileOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: UserProfileInclude<ExtArgs> | null
    /**
     * Filter, which UserProfile to fetch.
     */
    where?: UserProfileWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of UserProfiles to fetch.
     */
    orderBy?: UserProfileOrderByWithRelationInput | UserProfileOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the position for searching for UserProfiles.
     */
    cursor?: UserProfileWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` UserProfiles from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` UserProfiles.
     */
    skip?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/distinct Distinct Docs}
     * 
     * Filter by unique combinations of UserProfiles.
     */
    distinct?: UserProfileScalarFieldEnum | UserProfileScalarFieldEnum[]
  }

  /**
   * UserProfile findFirstOrThrow
   */
  export type UserProfileFindFirstOrThrowArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the UserProfile
     */
    select?: UserProfileSelect<ExtArgs> | null
    /**
     * Omit specific fields from the UserProfile
     */
    omit?: UserProfileOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: UserProfileInclude<ExtArgs> | null
    /**
     * Filter, which UserProfile to fetch.
     */
    where?: UserProfileWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of UserProfiles to fetch.
     */
    orderBy?: UserProfileOrderByWithRelationInput | UserProfileOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the position for searching for UserProfiles.
     */
    cursor?: UserProfileWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` UserProfiles from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` UserProfiles.
     */
    skip?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/distinct Distinct Docs}
     * 
     * Filter by unique combinations of UserProfiles.
     */
    distinct?: UserProfileScalarFieldEnum | UserProfileScalarFieldEnum[]
  }

  /**
   * UserProfile findMany
   */
  export type UserProfileFindManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the UserProfile
     */
    select?: UserProfileSelect<ExtArgs> | null
    /**
     * Omit specific fields from the UserProfile
     */
    omit?: UserProfileOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: UserProfileInclude<ExtArgs> | null
    /**
     * Filter, which UserProfiles to fetch.
     */
    where?: UserProfileWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of UserProfiles to fetch.
     */
    orderBy?: UserProfileOrderByWithRelationInput | UserProfileOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the position for listing UserProfiles.
     */
    cursor?: UserProfileWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` UserProfiles from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` UserProfiles.
     */
    skip?: number
    distinct?: UserProfileScalarFieldEnum | UserProfileScalarFieldEnum[]
  }

  /**
   * UserProfile create
   */
  export type UserProfileCreateArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the UserProfile
     */
    select?: UserProfileSelect<ExtArgs> | null
    /**
     * Omit specific fields from the UserProfile
     */
    omit?: UserProfileOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: UserProfileInclude<ExtArgs> | null
    /**
     * The data needed to create a UserProfile.
     */
    data: XOR<UserProfileCreateInput, UserProfileUncheckedCreateInput>
  }

  /**
   * UserProfile createMany
   */
  export type UserProfileCreateManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * The data used to create many UserProfiles.
     */
    data: UserProfileCreateManyInput | UserProfileCreateManyInput[]
    skipDuplicates?: boolean
  }

  /**
   * UserProfile createManyAndReturn
   */
  export type UserProfileCreateManyAndReturnArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the UserProfile
     */
    select?: UserProfileSelectCreateManyAndReturn<ExtArgs> | null
    /**
     * Omit specific fields from the UserProfile
     */
    omit?: UserProfileOmit<ExtArgs> | null
    /**
     * The data used to create many UserProfiles.
     */
    data: UserProfileCreateManyInput | UserProfileCreateManyInput[]
    skipDuplicates?: boolean
  }

  /**
   * UserProfile update
   */
  export type UserProfileUpdateArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the UserProfile
     */
    select?: UserProfileSelect<ExtArgs> | null
    /**
     * Omit specific fields from the UserProfile
     */
    omit?: UserProfileOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: UserProfileInclude<ExtArgs> | null
    /**
     * The data needed to update a UserProfile.
     */
    data: XOR<UserProfileUpdateInput, UserProfileUncheckedUpdateInput>
    /**
     * Choose, which UserProfile to update.
     */
    where: UserProfileWhereUniqueInput
  }

  /**
   * UserProfile updateMany
   */
  export type UserProfileUpdateManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * The data used to update UserProfiles.
     */
    data: XOR<UserProfileUpdateManyMutationInput, UserProfileUncheckedUpdateManyInput>
    /**
     * Filter which UserProfiles to update
     */
    where?: UserProfileWhereInput
    /**
     * Limit how many UserProfiles to update.
     */
    limit?: number
  }

  /**
   * UserProfile updateManyAndReturn
   */
  export type UserProfileUpdateManyAndReturnArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the UserProfile
     */
    select?: UserProfileSelectUpdateManyAndReturn<ExtArgs> | null
    /**
     * Omit specific fields from the UserProfile
     */
    omit?: UserProfileOmit<ExtArgs> | null
    /**
     * The data used to update UserProfiles.
     */
    data: XOR<UserProfileUpdateManyMutationInput, UserProfileUncheckedUpdateManyInput>
    /**
     * Filter which UserProfiles to update
     */
    where?: UserProfileWhereInput
    /**
     * Limit how many UserProfiles to update.
     */
    limit?: number
  }

  /**
   * UserProfile upsert
   */
  export type UserProfileUpsertArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the UserProfile
     */
    select?: UserProfileSelect<ExtArgs> | null
    /**
     * Omit specific fields from the UserProfile
     */
    omit?: UserProfileOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: UserProfileInclude<ExtArgs> | null
    /**
     * The filter to search for the UserProfile to update in case it exists.
     */
    where: UserProfileWhereUniqueInput
    /**
     * In case the UserProfile found by the `where` argument doesn't exist, create a new UserProfile with this data.
     */
    create: XOR<UserProfileCreateInput, UserProfileUncheckedCreateInput>
    /**
     * In case the UserProfile was found with the provided `where` argument, update it with this data.
     */
    update: XOR<UserProfileUpdateInput, UserProfileUncheckedUpdateInput>
  }

  /**
   * UserProfile delete
   */
  export type UserProfileDeleteArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the UserProfile
     */
    select?: UserProfileSelect<ExtArgs> | null
    /**
     * Omit specific fields from the UserProfile
     */
    omit?: UserProfileOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: UserProfileInclude<ExtArgs> | null
    /**
     * Filter which UserProfile to delete.
     */
    where: UserProfileWhereUniqueInput
  }

  /**
   * UserProfile deleteMany
   */
  export type UserProfileDeleteManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Filter which UserProfiles to delete
     */
    where?: UserProfileWhereInput
    /**
     * Limit how many UserProfiles to delete.
     */
    limit?: number
  }

  /**
   * UserProfile.workspacesCreated
   */
  export type UserProfile$workspacesCreatedArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Workspace
     */
    select?: WorkspaceSelect<ExtArgs> | null
    /**
     * Omit specific fields from the Workspace
     */
    omit?: WorkspaceOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: WorkspaceInclude<ExtArgs> | null
    where?: WorkspaceWhereInput
    orderBy?: WorkspaceOrderByWithRelationInput | WorkspaceOrderByWithRelationInput[]
    cursor?: WorkspaceWhereUniqueInput
    take?: number
    skip?: number
    distinct?: WorkspaceScalarFieldEnum | WorkspaceScalarFieldEnum[]
  }

  /**
   * UserProfile.workspaceMembers
   */
  export type UserProfile$workspaceMembersArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the WorkspaceMember
     */
    select?: WorkspaceMemberSelect<ExtArgs> | null
    /**
     * Omit specific fields from the WorkspaceMember
     */
    omit?: WorkspaceMemberOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: WorkspaceMemberInclude<ExtArgs> | null
    where?: WorkspaceMemberWhereInput
    orderBy?: WorkspaceMemberOrderByWithRelationInput | WorkspaceMemberOrderByWithRelationInput[]
    cursor?: WorkspaceMemberWhereUniqueInput
    take?: number
    skip?: number
    distinct?: WorkspaceMemberScalarFieldEnum | WorkspaceMemberScalarFieldEnum[]
  }

  /**
   * UserProfile.invitationsSent
   */
  export type UserProfile$invitationsSentArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Invitation
     */
    select?: InvitationSelect<ExtArgs> | null
    /**
     * Omit specific fields from the Invitation
     */
    omit?: InvitationOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: InvitationInclude<ExtArgs> | null
    where?: InvitationWhereInput
    orderBy?: InvitationOrderByWithRelationInput | InvitationOrderByWithRelationInput[]
    cursor?: InvitationWhereUniqueInput
    take?: number
    skip?: number
    distinct?: InvitationScalarFieldEnum | InvitationScalarFieldEnum[]
  }

  /**
   * UserProfile without action
   */
  export type UserProfileDefaultArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the UserProfile
     */
    select?: UserProfileSelect<ExtArgs> | null
    /**
     * Omit specific fields from the UserProfile
     */
    omit?: UserProfileOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: UserProfileInclude<ExtArgs> | null
  }


  /**
   * Model WorkspaceTemplate
   */

  export type AggregateWorkspaceTemplate = {
    _count: WorkspaceTemplateCountAggregateOutputType | null
    _avg: WorkspaceTemplateAvgAggregateOutputType | null
    _sum: WorkspaceTemplateSumAggregateOutputType | null
    _min: WorkspaceTemplateMinAggregateOutputType | null
    _max: WorkspaceTemplateMaxAggregateOutputType | null
  }

  export type WorkspaceTemplateAvgAggregateOutputType = {
    version: number | null
  }

  export type WorkspaceTemplateSumAggregateOutputType = {
    version: number | null
  }

  export type WorkspaceTemplateMinAggregateOutputType = {
    id: string | null
    name: string | null
    description: string | null
    isBuiltin: boolean | null
    createdBy: string | null
    version: number | null
    createdAt: Date | null
    updatedAt: Date | null
  }

  export type WorkspaceTemplateMaxAggregateOutputType = {
    id: string | null
    name: string | null
    description: string | null
    isBuiltin: boolean | null
    createdBy: string | null
    version: number | null
    createdAt: Date | null
    updatedAt: Date | null
  }

  export type WorkspaceTemplateCountAggregateOutputType = {
    id: number
    name: number
    description: number
    structure: number
    isBuiltin: number
    createdBy: number
    version: number
    createdAt: number
    updatedAt: number
    _all: number
  }


  export type WorkspaceTemplateAvgAggregateInputType = {
    version?: true
  }

  export type WorkspaceTemplateSumAggregateInputType = {
    version?: true
  }

  export type WorkspaceTemplateMinAggregateInputType = {
    id?: true
    name?: true
    description?: true
    isBuiltin?: true
    createdBy?: true
    version?: true
    createdAt?: true
    updatedAt?: true
  }

  export type WorkspaceTemplateMaxAggregateInputType = {
    id?: true
    name?: true
    description?: true
    isBuiltin?: true
    createdBy?: true
    version?: true
    createdAt?: true
    updatedAt?: true
  }

  export type WorkspaceTemplateCountAggregateInputType = {
    id?: true
    name?: true
    description?: true
    structure?: true
    isBuiltin?: true
    createdBy?: true
    version?: true
    createdAt?: true
    updatedAt?: true
    _all?: true
  }

  export type WorkspaceTemplateAggregateArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Filter which WorkspaceTemplate to aggregate.
     */
    where?: WorkspaceTemplateWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of WorkspaceTemplates to fetch.
     */
    orderBy?: WorkspaceTemplateOrderByWithRelationInput | WorkspaceTemplateOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the start position
     */
    cursor?: WorkspaceTemplateWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` WorkspaceTemplates from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` WorkspaceTemplates.
     */
    skip?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Count returned WorkspaceTemplates
    **/
    _count?: true | WorkspaceTemplateCountAggregateInputType
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Select which fields to average
    **/
    _avg?: WorkspaceTemplateAvgAggregateInputType
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Select which fields to sum
    **/
    _sum?: WorkspaceTemplateSumAggregateInputType
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Select which fields to find the minimum value
    **/
    _min?: WorkspaceTemplateMinAggregateInputType
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Select which fields to find the maximum value
    **/
    _max?: WorkspaceTemplateMaxAggregateInputType
  }

  export type GetWorkspaceTemplateAggregateType<T extends WorkspaceTemplateAggregateArgs> = {
        [P in keyof T & keyof AggregateWorkspaceTemplate]: P extends '_count' | 'count'
      ? T[P] extends true
        ? number
        : GetScalarType<T[P], AggregateWorkspaceTemplate[P]>
      : GetScalarType<T[P], AggregateWorkspaceTemplate[P]>
  }




  export type WorkspaceTemplateGroupByArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    where?: WorkspaceTemplateWhereInput
    orderBy?: WorkspaceTemplateOrderByWithAggregationInput | WorkspaceTemplateOrderByWithAggregationInput[]
    by: WorkspaceTemplateScalarFieldEnum[] | WorkspaceTemplateScalarFieldEnum
    having?: WorkspaceTemplateScalarWhereWithAggregatesInput
    take?: number
    skip?: number
    _count?: WorkspaceTemplateCountAggregateInputType | true
    _avg?: WorkspaceTemplateAvgAggregateInputType
    _sum?: WorkspaceTemplateSumAggregateInputType
    _min?: WorkspaceTemplateMinAggregateInputType
    _max?: WorkspaceTemplateMaxAggregateInputType
  }

  export type WorkspaceTemplateGroupByOutputType = {
    id: string
    name: string
    description: string | null
    structure: JsonValue
    isBuiltin: boolean
    createdBy: string | null
    version: number
    createdAt: Date
    updatedAt: Date
    _count: WorkspaceTemplateCountAggregateOutputType | null
    _avg: WorkspaceTemplateAvgAggregateOutputType | null
    _sum: WorkspaceTemplateSumAggregateOutputType | null
    _min: WorkspaceTemplateMinAggregateOutputType | null
    _max: WorkspaceTemplateMaxAggregateOutputType | null
  }

  type GetWorkspaceTemplateGroupByPayload<T extends WorkspaceTemplateGroupByArgs> = Prisma.PrismaPromise<
    Array<
      PickEnumerable<WorkspaceTemplateGroupByOutputType, T['by']> &
        {
          [P in ((keyof T) & (keyof WorkspaceTemplateGroupByOutputType))]: P extends '_count'
            ? T[P] extends boolean
              ? number
              : GetScalarType<T[P], WorkspaceTemplateGroupByOutputType[P]>
            : GetScalarType<T[P], WorkspaceTemplateGroupByOutputType[P]>
        }
      >
    >


  export type WorkspaceTemplateSelect<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetSelect<{
    id?: boolean
    name?: boolean
    description?: boolean
    structure?: boolean
    isBuiltin?: boolean
    createdBy?: boolean
    version?: boolean
    createdAt?: boolean
    updatedAt?: boolean
    workspaces?: boolean | WorkspaceTemplate$workspacesArgs<ExtArgs>
    _count?: boolean | WorkspaceTemplateCountOutputTypeDefaultArgs<ExtArgs>
  }, ExtArgs["result"]["workspaceTemplate"]>

  export type WorkspaceTemplateSelectCreateManyAndReturn<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetSelect<{
    id?: boolean
    name?: boolean
    description?: boolean
    structure?: boolean
    isBuiltin?: boolean
    createdBy?: boolean
    version?: boolean
    createdAt?: boolean
    updatedAt?: boolean
  }, ExtArgs["result"]["workspaceTemplate"]>

  export type WorkspaceTemplateSelectUpdateManyAndReturn<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetSelect<{
    id?: boolean
    name?: boolean
    description?: boolean
    structure?: boolean
    isBuiltin?: boolean
    createdBy?: boolean
    version?: boolean
    createdAt?: boolean
    updatedAt?: boolean
  }, ExtArgs["result"]["workspaceTemplate"]>

  export type WorkspaceTemplateSelectScalar = {
    id?: boolean
    name?: boolean
    description?: boolean
    structure?: boolean
    isBuiltin?: boolean
    createdBy?: boolean
    version?: boolean
    createdAt?: boolean
    updatedAt?: boolean
  }

  export type WorkspaceTemplateOmit<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetOmit<"id" | "name" | "description" | "structure" | "isBuiltin" | "createdBy" | "version" | "createdAt" | "updatedAt", ExtArgs["result"]["workspaceTemplate"]>
  export type WorkspaceTemplateInclude<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    workspaces?: boolean | WorkspaceTemplate$workspacesArgs<ExtArgs>
    _count?: boolean | WorkspaceTemplateCountOutputTypeDefaultArgs<ExtArgs>
  }
  export type WorkspaceTemplateIncludeCreateManyAndReturn<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {}
  export type WorkspaceTemplateIncludeUpdateManyAndReturn<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {}

  export type $WorkspaceTemplatePayload<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    name: "WorkspaceTemplate"
    objects: {
      workspaces: Prisma.$WorkspacePayload<ExtArgs>[]
    }
    scalars: $Extensions.GetPayloadResult<{
      id: string
      name: string
      description: string | null
      structure: Prisma.JsonValue
      isBuiltin: boolean
      createdBy: string | null
      version: number
      createdAt: Date
      updatedAt: Date
    }, ExtArgs["result"]["workspaceTemplate"]>
    composites: {}
  }

  type WorkspaceTemplateGetPayload<S extends boolean | null | undefined | WorkspaceTemplateDefaultArgs> = $Result.GetResult<Prisma.$WorkspaceTemplatePayload, S>

  type WorkspaceTemplateCountArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> =
    Omit<WorkspaceTemplateFindManyArgs, 'select' | 'include' | 'distinct' | 'omit'> & {
      select?: WorkspaceTemplateCountAggregateInputType | true
    }

  export interface WorkspaceTemplateDelegate<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs, GlobalOmitOptions = {}> {
    [K: symbol]: { types: Prisma.TypeMap<ExtArgs>['model']['WorkspaceTemplate'], meta: { name: 'WorkspaceTemplate' } }
    /**
     * Find zero or one WorkspaceTemplate that matches the filter.
     * @param {WorkspaceTemplateFindUniqueArgs} args - Arguments to find a WorkspaceTemplate
     * @example
     * // Get one WorkspaceTemplate
     * const workspaceTemplate = await prisma.workspaceTemplate.findUnique({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findUnique<T extends WorkspaceTemplateFindUniqueArgs>(args: SelectSubset<T, WorkspaceTemplateFindUniqueArgs<ExtArgs>>): Prisma__WorkspaceTemplateClient<$Result.GetResult<Prisma.$WorkspaceTemplatePayload<ExtArgs>, T, "findUnique", GlobalOmitOptions> | null, null, ExtArgs, GlobalOmitOptions>

    /**
     * Find one WorkspaceTemplate that matches the filter or throw an error with `error.code='P2025'`
     * if no matches were found.
     * @param {WorkspaceTemplateFindUniqueOrThrowArgs} args - Arguments to find a WorkspaceTemplate
     * @example
     * // Get one WorkspaceTemplate
     * const workspaceTemplate = await prisma.workspaceTemplate.findUniqueOrThrow({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findUniqueOrThrow<T extends WorkspaceTemplateFindUniqueOrThrowArgs>(args: SelectSubset<T, WorkspaceTemplateFindUniqueOrThrowArgs<ExtArgs>>): Prisma__WorkspaceTemplateClient<$Result.GetResult<Prisma.$WorkspaceTemplatePayload<ExtArgs>, T, "findUniqueOrThrow", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Find the first WorkspaceTemplate that matches the filter.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {WorkspaceTemplateFindFirstArgs} args - Arguments to find a WorkspaceTemplate
     * @example
     * // Get one WorkspaceTemplate
     * const workspaceTemplate = await prisma.workspaceTemplate.findFirst({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findFirst<T extends WorkspaceTemplateFindFirstArgs>(args?: SelectSubset<T, WorkspaceTemplateFindFirstArgs<ExtArgs>>): Prisma__WorkspaceTemplateClient<$Result.GetResult<Prisma.$WorkspaceTemplatePayload<ExtArgs>, T, "findFirst", GlobalOmitOptions> | null, null, ExtArgs, GlobalOmitOptions>

    /**
     * Find the first WorkspaceTemplate that matches the filter or
     * throw `PrismaKnownClientError` with `P2025` code if no matches were found.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {WorkspaceTemplateFindFirstOrThrowArgs} args - Arguments to find a WorkspaceTemplate
     * @example
     * // Get one WorkspaceTemplate
     * const workspaceTemplate = await prisma.workspaceTemplate.findFirstOrThrow({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findFirstOrThrow<T extends WorkspaceTemplateFindFirstOrThrowArgs>(args?: SelectSubset<T, WorkspaceTemplateFindFirstOrThrowArgs<ExtArgs>>): Prisma__WorkspaceTemplateClient<$Result.GetResult<Prisma.$WorkspaceTemplatePayload<ExtArgs>, T, "findFirstOrThrow", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Find zero or more WorkspaceTemplates that matches the filter.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {WorkspaceTemplateFindManyArgs} args - Arguments to filter and select certain fields only.
     * @example
     * // Get all WorkspaceTemplates
     * const workspaceTemplates = await prisma.workspaceTemplate.findMany()
     * 
     * // Get first 10 WorkspaceTemplates
     * const workspaceTemplates = await prisma.workspaceTemplate.findMany({ take: 10 })
     * 
     * // Only select the `id`
     * const workspaceTemplateWithIdOnly = await prisma.workspaceTemplate.findMany({ select: { id: true } })
     * 
     */
    findMany<T extends WorkspaceTemplateFindManyArgs>(args?: SelectSubset<T, WorkspaceTemplateFindManyArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$WorkspaceTemplatePayload<ExtArgs>, T, "findMany", GlobalOmitOptions>>

    /**
     * Create a WorkspaceTemplate.
     * @param {WorkspaceTemplateCreateArgs} args - Arguments to create a WorkspaceTemplate.
     * @example
     * // Create one WorkspaceTemplate
     * const WorkspaceTemplate = await prisma.workspaceTemplate.create({
     *   data: {
     *     // ... data to create a WorkspaceTemplate
     *   }
     * })
     * 
     */
    create<T extends WorkspaceTemplateCreateArgs>(args: SelectSubset<T, WorkspaceTemplateCreateArgs<ExtArgs>>): Prisma__WorkspaceTemplateClient<$Result.GetResult<Prisma.$WorkspaceTemplatePayload<ExtArgs>, T, "create", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Create many WorkspaceTemplates.
     * @param {WorkspaceTemplateCreateManyArgs} args - Arguments to create many WorkspaceTemplates.
     * @example
     * // Create many WorkspaceTemplates
     * const workspaceTemplate = await prisma.workspaceTemplate.createMany({
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     *     
     */
    createMany<T extends WorkspaceTemplateCreateManyArgs>(args?: SelectSubset<T, WorkspaceTemplateCreateManyArgs<ExtArgs>>): Prisma.PrismaPromise<BatchPayload>

    /**
     * Create many WorkspaceTemplates and returns the data saved in the database.
     * @param {WorkspaceTemplateCreateManyAndReturnArgs} args - Arguments to create many WorkspaceTemplates.
     * @example
     * // Create many WorkspaceTemplates
     * const workspaceTemplate = await prisma.workspaceTemplate.createManyAndReturn({
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * 
     * // Create many WorkspaceTemplates and only return the `id`
     * const workspaceTemplateWithIdOnly = await prisma.workspaceTemplate.createManyAndReturn({
     *   select: { id: true },
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * 
     */
    createManyAndReturn<T extends WorkspaceTemplateCreateManyAndReturnArgs>(args?: SelectSubset<T, WorkspaceTemplateCreateManyAndReturnArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$WorkspaceTemplatePayload<ExtArgs>, T, "createManyAndReturn", GlobalOmitOptions>>

    /**
     * Delete a WorkspaceTemplate.
     * @param {WorkspaceTemplateDeleteArgs} args - Arguments to delete one WorkspaceTemplate.
     * @example
     * // Delete one WorkspaceTemplate
     * const WorkspaceTemplate = await prisma.workspaceTemplate.delete({
     *   where: {
     *     // ... filter to delete one WorkspaceTemplate
     *   }
     * })
     * 
     */
    delete<T extends WorkspaceTemplateDeleteArgs>(args: SelectSubset<T, WorkspaceTemplateDeleteArgs<ExtArgs>>): Prisma__WorkspaceTemplateClient<$Result.GetResult<Prisma.$WorkspaceTemplatePayload<ExtArgs>, T, "delete", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Update one WorkspaceTemplate.
     * @param {WorkspaceTemplateUpdateArgs} args - Arguments to update one WorkspaceTemplate.
     * @example
     * // Update one WorkspaceTemplate
     * const workspaceTemplate = await prisma.workspaceTemplate.update({
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: {
     *     // ... provide data here
     *   }
     * })
     * 
     */
    update<T extends WorkspaceTemplateUpdateArgs>(args: SelectSubset<T, WorkspaceTemplateUpdateArgs<ExtArgs>>): Prisma__WorkspaceTemplateClient<$Result.GetResult<Prisma.$WorkspaceTemplatePayload<ExtArgs>, T, "update", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Delete zero or more WorkspaceTemplates.
     * @param {WorkspaceTemplateDeleteManyArgs} args - Arguments to filter WorkspaceTemplates to delete.
     * @example
     * // Delete a few WorkspaceTemplates
     * const { count } = await prisma.workspaceTemplate.deleteMany({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     * 
     */
    deleteMany<T extends WorkspaceTemplateDeleteManyArgs>(args?: SelectSubset<T, WorkspaceTemplateDeleteManyArgs<ExtArgs>>): Prisma.PrismaPromise<BatchPayload>

    /**
     * Update zero or more WorkspaceTemplates.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {WorkspaceTemplateUpdateManyArgs} args - Arguments to update one or more rows.
     * @example
     * // Update many WorkspaceTemplates
     * const workspaceTemplate = await prisma.workspaceTemplate.updateMany({
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: {
     *     // ... provide data here
     *   }
     * })
     * 
     */
    updateMany<T extends WorkspaceTemplateUpdateManyArgs>(args: SelectSubset<T, WorkspaceTemplateUpdateManyArgs<ExtArgs>>): Prisma.PrismaPromise<BatchPayload>

    /**
     * Update zero or more WorkspaceTemplates and returns the data updated in the database.
     * @param {WorkspaceTemplateUpdateManyAndReturnArgs} args - Arguments to update many WorkspaceTemplates.
     * @example
     * // Update many WorkspaceTemplates
     * const workspaceTemplate = await prisma.workspaceTemplate.updateManyAndReturn({
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * 
     * // Update zero or more WorkspaceTemplates and only return the `id`
     * const workspaceTemplateWithIdOnly = await prisma.workspaceTemplate.updateManyAndReturn({
     *   select: { id: true },
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * 
     */
    updateManyAndReturn<T extends WorkspaceTemplateUpdateManyAndReturnArgs>(args: SelectSubset<T, WorkspaceTemplateUpdateManyAndReturnArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$WorkspaceTemplatePayload<ExtArgs>, T, "updateManyAndReturn", GlobalOmitOptions>>

    /**
     * Create or update one WorkspaceTemplate.
     * @param {WorkspaceTemplateUpsertArgs} args - Arguments to update or create a WorkspaceTemplate.
     * @example
     * // Update or create a WorkspaceTemplate
     * const workspaceTemplate = await prisma.workspaceTemplate.upsert({
     *   create: {
     *     // ... data to create a WorkspaceTemplate
     *   },
     *   update: {
     *     // ... in case it already exists, update
     *   },
     *   where: {
     *     // ... the filter for the WorkspaceTemplate we want to update
     *   }
     * })
     */
    upsert<T extends WorkspaceTemplateUpsertArgs>(args: SelectSubset<T, WorkspaceTemplateUpsertArgs<ExtArgs>>): Prisma__WorkspaceTemplateClient<$Result.GetResult<Prisma.$WorkspaceTemplatePayload<ExtArgs>, T, "upsert", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>


    /**
     * Count the number of WorkspaceTemplates.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {WorkspaceTemplateCountArgs} args - Arguments to filter WorkspaceTemplates to count.
     * @example
     * // Count the number of WorkspaceTemplates
     * const count = await prisma.workspaceTemplate.count({
     *   where: {
     *     // ... the filter for the WorkspaceTemplates we want to count
     *   }
     * })
    **/
    count<T extends WorkspaceTemplateCountArgs>(
      args?: Subset<T, WorkspaceTemplateCountArgs>,
    ): Prisma.PrismaPromise<
      T extends $Utils.Record<'select', any>
        ? T['select'] extends true
          ? number
          : GetScalarType<T['select'], WorkspaceTemplateCountAggregateOutputType>
        : number
    >

    /**
     * Allows you to perform aggregations operations on a WorkspaceTemplate.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {WorkspaceTemplateAggregateArgs} args - Select which aggregations you would like to apply and on what fields.
     * @example
     * // Ordered by age ascending
     * // Where email contains prisma.io
     * // Limited to the 10 users
     * const aggregations = await prisma.user.aggregate({
     *   _avg: {
     *     age: true,
     *   },
     *   where: {
     *     email: {
     *       contains: "prisma.io",
     *     },
     *   },
     *   orderBy: {
     *     age: "asc",
     *   },
     *   take: 10,
     * })
    **/
    aggregate<T extends WorkspaceTemplateAggregateArgs>(args: Subset<T, WorkspaceTemplateAggregateArgs>): Prisma.PrismaPromise<GetWorkspaceTemplateAggregateType<T>>

    /**
     * Group by WorkspaceTemplate.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {WorkspaceTemplateGroupByArgs} args - Group by arguments.
     * @example
     * // Group by city, order by createdAt, get count
     * const result = await prisma.user.groupBy({
     *   by: ['city', 'createdAt'],
     *   orderBy: {
     *     createdAt: true
     *   },
     *   _count: {
     *     _all: true
     *   },
     * })
     * 
    **/
    groupBy<
      T extends WorkspaceTemplateGroupByArgs,
      HasSelectOrTake extends Or<
        Extends<'skip', Keys<T>>,
        Extends<'take', Keys<T>>
      >,
      OrderByArg extends True extends HasSelectOrTake
        ? { orderBy: WorkspaceTemplateGroupByArgs['orderBy'] }
        : { orderBy?: WorkspaceTemplateGroupByArgs['orderBy'] },
      OrderFields extends ExcludeUnderscoreKeys<Keys<MaybeTupleToUnion<T['orderBy']>>>,
      ByFields extends MaybeTupleToUnion<T['by']>,
      ByValid extends Has<ByFields, OrderFields>,
      HavingFields extends GetHavingFields<T['having']>,
      HavingValid extends Has<ByFields, HavingFields>,
      ByEmpty extends T['by'] extends never[] ? True : False,
      InputErrors extends ByEmpty extends True
      ? `Error: "by" must not be empty.`
      : HavingValid extends False
      ? {
          [P in HavingFields]: P extends ByFields
            ? never
            : P extends string
            ? `Error: Field "${P}" used in "having" needs to be provided in "by".`
            : [
                Error,
                'Field ',
                P,
                ` in "having" needs to be provided in "by"`,
              ]
        }[HavingFields]
      : 'take' extends Keys<T>
      ? 'orderBy' extends Keys<T>
        ? ByValid extends True
          ? {}
          : {
              [P in OrderFields]: P extends ByFields
                ? never
                : `Error: Field "${P}" in "orderBy" needs to be provided in "by"`
            }[OrderFields]
        : 'Error: If you provide "take", you also need to provide "orderBy"'
      : 'skip' extends Keys<T>
      ? 'orderBy' extends Keys<T>
        ? ByValid extends True
          ? {}
          : {
              [P in OrderFields]: P extends ByFields
                ? never
                : `Error: Field "${P}" in "orderBy" needs to be provided in "by"`
            }[OrderFields]
        : 'Error: If you provide "skip", you also need to provide "orderBy"'
      : ByValid extends True
      ? {}
      : {
          [P in OrderFields]: P extends ByFields
            ? never
            : `Error: Field "${P}" in "orderBy" needs to be provided in "by"`
        }[OrderFields]
    >(args: SubsetIntersection<T, WorkspaceTemplateGroupByArgs, OrderByArg> & InputErrors): {} extends InputErrors ? GetWorkspaceTemplateGroupByPayload<T> : Prisma.PrismaPromise<InputErrors>
  /**
   * Fields of the WorkspaceTemplate model
   */
  readonly fields: WorkspaceTemplateFieldRefs;
  }

  /**
   * The delegate class that acts as a "Promise-like" for WorkspaceTemplate.
   * Why is this prefixed with `Prisma__`?
   * Because we want to prevent naming conflicts as mentioned in
   * https://github.com/prisma/prisma-client-js/issues/707
   */
  export interface Prisma__WorkspaceTemplateClient<T, Null = never, ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs, GlobalOmitOptions = {}> extends Prisma.PrismaPromise<T> {
    readonly [Symbol.toStringTag]: "PrismaPromise"
    workspaces<T extends WorkspaceTemplate$workspacesArgs<ExtArgs> = {}>(args?: Subset<T, WorkspaceTemplate$workspacesArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$WorkspacePayload<ExtArgs>, T, "findMany", GlobalOmitOptions> | Null>
    /**
     * Attaches callbacks for the resolution and/or rejection of the Promise.
     * @param onfulfilled The callback to execute when the Promise is resolved.
     * @param onrejected The callback to execute when the Promise is rejected.
     * @returns A Promise for the completion of which ever callback is executed.
     */
    then<TResult1 = T, TResult2 = never>(onfulfilled?: ((value: T) => TResult1 | PromiseLike<TResult1>) | undefined | null, onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | undefined | null): $Utils.JsPromise<TResult1 | TResult2>
    /**
     * Attaches a callback for only the rejection of the Promise.
     * @param onrejected The callback to execute when the Promise is rejected.
     * @returns A Promise for the completion of the callback.
     */
    catch<TResult = never>(onrejected?: ((reason: any) => TResult | PromiseLike<TResult>) | undefined | null): $Utils.JsPromise<T | TResult>
    /**
     * Attaches a callback that is invoked when the Promise is settled (fulfilled or rejected). The
     * resolved value cannot be modified from the callback.
     * @param onfinally The callback to execute when the Promise is settled (fulfilled or rejected).
     * @returns A Promise for the completion of the callback.
     */
    finally(onfinally?: (() => void) | undefined | null): $Utils.JsPromise<T>
  }




  /**
   * Fields of the WorkspaceTemplate model
   */
  interface WorkspaceTemplateFieldRefs {
    readonly id: FieldRef<"WorkspaceTemplate", 'String'>
    readonly name: FieldRef<"WorkspaceTemplate", 'String'>
    readonly description: FieldRef<"WorkspaceTemplate", 'String'>
    readonly structure: FieldRef<"WorkspaceTemplate", 'Json'>
    readonly isBuiltin: FieldRef<"WorkspaceTemplate", 'Boolean'>
    readonly createdBy: FieldRef<"WorkspaceTemplate", 'String'>
    readonly version: FieldRef<"WorkspaceTemplate", 'Int'>
    readonly createdAt: FieldRef<"WorkspaceTemplate", 'DateTime'>
    readonly updatedAt: FieldRef<"WorkspaceTemplate", 'DateTime'>
  }
    

  // Custom InputTypes
  /**
   * WorkspaceTemplate findUnique
   */
  export type WorkspaceTemplateFindUniqueArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the WorkspaceTemplate
     */
    select?: WorkspaceTemplateSelect<ExtArgs> | null
    /**
     * Omit specific fields from the WorkspaceTemplate
     */
    omit?: WorkspaceTemplateOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: WorkspaceTemplateInclude<ExtArgs> | null
    /**
     * Filter, which WorkspaceTemplate to fetch.
     */
    where: WorkspaceTemplateWhereUniqueInput
  }

  /**
   * WorkspaceTemplate findUniqueOrThrow
   */
  export type WorkspaceTemplateFindUniqueOrThrowArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the WorkspaceTemplate
     */
    select?: WorkspaceTemplateSelect<ExtArgs> | null
    /**
     * Omit specific fields from the WorkspaceTemplate
     */
    omit?: WorkspaceTemplateOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: WorkspaceTemplateInclude<ExtArgs> | null
    /**
     * Filter, which WorkspaceTemplate to fetch.
     */
    where: WorkspaceTemplateWhereUniqueInput
  }

  /**
   * WorkspaceTemplate findFirst
   */
  export type WorkspaceTemplateFindFirstArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the WorkspaceTemplate
     */
    select?: WorkspaceTemplateSelect<ExtArgs> | null
    /**
     * Omit specific fields from the WorkspaceTemplate
     */
    omit?: WorkspaceTemplateOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: WorkspaceTemplateInclude<ExtArgs> | null
    /**
     * Filter, which WorkspaceTemplate to fetch.
     */
    where?: WorkspaceTemplateWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of WorkspaceTemplates to fetch.
     */
    orderBy?: WorkspaceTemplateOrderByWithRelationInput | WorkspaceTemplateOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the position for searching for WorkspaceTemplates.
     */
    cursor?: WorkspaceTemplateWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` WorkspaceTemplates from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` WorkspaceTemplates.
     */
    skip?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/distinct Distinct Docs}
     * 
     * Filter by unique combinations of WorkspaceTemplates.
     */
    distinct?: WorkspaceTemplateScalarFieldEnum | WorkspaceTemplateScalarFieldEnum[]
  }

  /**
   * WorkspaceTemplate findFirstOrThrow
   */
  export type WorkspaceTemplateFindFirstOrThrowArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the WorkspaceTemplate
     */
    select?: WorkspaceTemplateSelect<ExtArgs> | null
    /**
     * Omit specific fields from the WorkspaceTemplate
     */
    omit?: WorkspaceTemplateOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: WorkspaceTemplateInclude<ExtArgs> | null
    /**
     * Filter, which WorkspaceTemplate to fetch.
     */
    where?: WorkspaceTemplateWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of WorkspaceTemplates to fetch.
     */
    orderBy?: WorkspaceTemplateOrderByWithRelationInput | WorkspaceTemplateOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the position for searching for WorkspaceTemplates.
     */
    cursor?: WorkspaceTemplateWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` WorkspaceTemplates from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` WorkspaceTemplates.
     */
    skip?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/distinct Distinct Docs}
     * 
     * Filter by unique combinations of WorkspaceTemplates.
     */
    distinct?: WorkspaceTemplateScalarFieldEnum | WorkspaceTemplateScalarFieldEnum[]
  }

  /**
   * WorkspaceTemplate findMany
   */
  export type WorkspaceTemplateFindManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the WorkspaceTemplate
     */
    select?: WorkspaceTemplateSelect<ExtArgs> | null
    /**
     * Omit specific fields from the WorkspaceTemplate
     */
    omit?: WorkspaceTemplateOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: WorkspaceTemplateInclude<ExtArgs> | null
    /**
     * Filter, which WorkspaceTemplates to fetch.
     */
    where?: WorkspaceTemplateWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of WorkspaceTemplates to fetch.
     */
    orderBy?: WorkspaceTemplateOrderByWithRelationInput | WorkspaceTemplateOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the position for listing WorkspaceTemplates.
     */
    cursor?: WorkspaceTemplateWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` WorkspaceTemplates from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` WorkspaceTemplates.
     */
    skip?: number
    distinct?: WorkspaceTemplateScalarFieldEnum | WorkspaceTemplateScalarFieldEnum[]
  }

  /**
   * WorkspaceTemplate create
   */
  export type WorkspaceTemplateCreateArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the WorkspaceTemplate
     */
    select?: WorkspaceTemplateSelect<ExtArgs> | null
    /**
     * Omit specific fields from the WorkspaceTemplate
     */
    omit?: WorkspaceTemplateOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: WorkspaceTemplateInclude<ExtArgs> | null
    /**
     * The data needed to create a WorkspaceTemplate.
     */
    data: XOR<WorkspaceTemplateCreateInput, WorkspaceTemplateUncheckedCreateInput>
  }

  /**
   * WorkspaceTemplate createMany
   */
  export type WorkspaceTemplateCreateManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * The data used to create many WorkspaceTemplates.
     */
    data: WorkspaceTemplateCreateManyInput | WorkspaceTemplateCreateManyInput[]
    skipDuplicates?: boolean
  }

  /**
   * WorkspaceTemplate createManyAndReturn
   */
  export type WorkspaceTemplateCreateManyAndReturnArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the WorkspaceTemplate
     */
    select?: WorkspaceTemplateSelectCreateManyAndReturn<ExtArgs> | null
    /**
     * Omit specific fields from the WorkspaceTemplate
     */
    omit?: WorkspaceTemplateOmit<ExtArgs> | null
    /**
     * The data used to create many WorkspaceTemplates.
     */
    data: WorkspaceTemplateCreateManyInput | WorkspaceTemplateCreateManyInput[]
    skipDuplicates?: boolean
  }

  /**
   * WorkspaceTemplate update
   */
  export type WorkspaceTemplateUpdateArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the WorkspaceTemplate
     */
    select?: WorkspaceTemplateSelect<ExtArgs> | null
    /**
     * Omit specific fields from the WorkspaceTemplate
     */
    omit?: WorkspaceTemplateOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: WorkspaceTemplateInclude<ExtArgs> | null
    /**
     * The data needed to update a WorkspaceTemplate.
     */
    data: XOR<WorkspaceTemplateUpdateInput, WorkspaceTemplateUncheckedUpdateInput>
    /**
     * Choose, which WorkspaceTemplate to update.
     */
    where: WorkspaceTemplateWhereUniqueInput
  }

  /**
   * WorkspaceTemplate updateMany
   */
  export type WorkspaceTemplateUpdateManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * The data used to update WorkspaceTemplates.
     */
    data: XOR<WorkspaceTemplateUpdateManyMutationInput, WorkspaceTemplateUncheckedUpdateManyInput>
    /**
     * Filter which WorkspaceTemplates to update
     */
    where?: WorkspaceTemplateWhereInput
    /**
     * Limit how many WorkspaceTemplates to update.
     */
    limit?: number
  }

  /**
   * WorkspaceTemplate updateManyAndReturn
   */
  export type WorkspaceTemplateUpdateManyAndReturnArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the WorkspaceTemplate
     */
    select?: WorkspaceTemplateSelectUpdateManyAndReturn<ExtArgs> | null
    /**
     * Omit specific fields from the WorkspaceTemplate
     */
    omit?: WorkspaceTemplateOmit<ExtArgs> | null
    /**
     * The data used to update WorkspaceTemplates.
     */
    data: XOR<WorkspaceTemplateUpdateManyMutationInput, WorkspaceTemplateUncheckedUpdateManyInput>
    /**
     * Filter which WorkspaceTemplates to update
     */
    where?: WorkspaceTemplateWhereInput
    /**
     * Limit how many WorkspaceTemplates to update.
     */
    limit?: number
  }

  /**
   * WorkspaceTemplate upsert
   */
  export type WorkspaceTemplateUpsertArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the WorkspaceTemplate
     */
    select?: WorkspaceTemplateSelect<ExtArgs> | null
    /**
     * Omit specific fields from the WorkspaceTemplate
     */
    omit?: WorkspaceTemplateOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: WorkspaceTemplateInclude<ExtArgs> | null
    /**
     * The filter to search for the WorkspaceTemplate to update in case it exists.
     */
    where: WorkspaceTemplateWhereUniqueInput
    /**
     * In case the WorkspaceTemplate found by the `where` argument doesn't exist, create a new WorkspaceTemplate with this data.
     */
    create: XOR<WorkspaceTemplateCreateInput, WorkspaceTemplateUncheckedCreateInput>
    /**
     * In case the WorkspaceTemplate was found with the provided `where` argument, update it with this data.
     */
    update: XOR<WorkspaceTemplateUpdateInput, WorkspaceTemplateUncheckedUpdateInput>
  }

  /**
   * WorkspaceTemplate delete
   */
  export type WorkspaceTemplateDeleteArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the WorkspaceTemplate
     */
    select?: WorkspaceTemplateSelect<ExtArgs> | null
    /**
     * Omit specific fields from the WorkspaceTemplate
     */
    omit?: WorkspaceTemplateOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: WorkspaceTemplateInclude<ExtArgs> | null
    /**
     * Filter which WorkspaceTemplate to delete.
     */
    where: WorkspaceTemplateWhereUniqueInput
  }

  /**
   * WorkspaceTemplate deleteMany
   */
  export type WorkspaceTemplateDeleteManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Filter which WorkspaceTemplates to delete
     */
    where?: WorkspaceTemplateWhereInput
    /**
     * Limit how many WorkspaceTemplates to delete.
     */
    limit?: number
  }

  /**
   * WorkspaceTemplate.workspaces
   */
  export type WorkspaceTemplate$workspacesArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Workspace
     */
    select?: WorkspaceSelect<ExtArgs> | null
    /**
     * Omit specific fields from the Workspace
     */
    omit?: WorkspaceOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: WorkspaceInclude<ExtArgs> | null
    where?: WorkspaceWhereInput
    orderBy?: WorkspaceOrderByWithRelationInput | WorkspaceOrderByWithRelationInput[]
    cursor?: WorkspaceWhereUniqueInput
    take?: number
    skip?: number
    distinct?: WorkspaceScalarFieldEnum | WorkspaceScalarFieldEnum[]
  }

  /**
   * WorkspaceTemplate without action
   */
  export type WorkspaceTemplateDefaultArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the WorkspaceTemplate
     */
    select?: WorkspaceTemplateSelect<ExtArgs> | null
    /**
     * Omit specific fields from the WorkspaceTemplate
     */
    omit?: WorkspaceTemplateOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: WorkspaceTemplateInclude<ExtArgs> | null
  }


  /**
   * Model TenantBranding
   */

  export type AggregateTenantBranding = {
    _count: TenantBrandingCountAggregateOutputType | null
    _min: TenantBrandingMinAggregateOutputType | null
    _max: TenantBrandingMaxAggregateOutputType | null
  }

  export type TenantBrandingMinAggregateOutputType = {
    id: string | null
    logoPath: string | null
    primaryColor: string | null
    darkMode: boolean | null
    updatedAt: Date | null
  }

  export type TenantBrandingMaxAggregateOutputType = {
    id: string | null
    logoPath: string | null
    primaryColor: string | null
    darkMode: boolean | null
    updatedAt: Date | null
  }

  export type TenantBrandingCountAggregateOutputType = {
    id: number
    logoPath: number
    primaryColor: number
    darkMode: number
    updatedAt: number
    _all: number
  }


  export type TenantBrandingMinAggregateInputType = {
    id?: true
    logoPath?: true
    primaryColor?: true
    darkMode?: true
    updatedAt?: true
  }

  export type TenantBrandingMaxAggregateInputType = {
    id?: true
    logoPath?: true
    primaryColor?: true
    darkMode?: true
    updatedAt?: true
  }

  export type TenantBrandingCountAggregateInputType = {
    id?: true
    logoPath?: true
    primaryColor?: true
    darkMode?: true
    updatedAt?: true
    _all?: true
  }

  export type TenantBrandingAggregateArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Filter which TenantBranding to aggregate.
     */
    where?: TenantBrandingWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of TenantBrandings to fetch.
     */
    orderBy?: TenantBrandingOrderByWithRelationInput | TenantBrandingOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the start position
     */
    cursor?: TenantBrandingWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` TenantBrandings from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` TenantBrandings.
     */
    skip?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Count returned TenantBrandings
    **/
    _count?: true | TenantBrandingCountAggregateInputType
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Select which fields to find the minimum value
    **/
    _min?: TenantBrandingMinAggregateInputType
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Select which fields to find the maximum value
    **/
    _max?: TenantBrandingMaxAggregateInputType
  }

  export type GetTenantBrandingAggregateType<T extends TenantBrandingAggregateArgs> = {
        [P in keyof T & keyof AggregateTenantBranding]: P extends '_count' | 'count'
      ? T[P] extends true
        ? number
        : GetScalarType<T[P], AggregateTenantBranding[P]>
      : GetScalarType<T[P], AggregateTenantBranding[P]>
  }




  export type TenantBrandingGroupByArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    where?: TenantBrandingWhereInput
    orderBy?: TenantBrandingOrderByWithAggregationInput | TenantBrandingOrderByWithAggregationInput[]
    by: TenantBrandingScalarFieldEnum[] | TenantBrandingScalarFieldEnum
    having?: TenantBrandingScalarWhereWithAggregatesInput
    take?: number
    skip?: number
    _count?: TenantBrandingCountAggregateInputType | true
    _min?: TenantBrandingMinAggregateInputType
    _max?: TenantBrandingMaxAggregateInputType
  }

  export type TenantBrandingGroupByOutputType = {
    id: string
    logoPath: string | null
    primaryColor: string
    darkMode: boolean
    updatedAt: Date
    _count: TenantBrandingCountAggregateOutputType | null
    _min: TenantBrandingMinAggregateOutputType | null
    _max: TenantBrandingMaxAggregateOutputType | null
  }

  type GetTenantBrandingGroupByPayload<T extends TenantBrandingGroupByArgs> = Prisma.PrismaPromise<
    Array<
      PickEnumerable<TenantBrandingGroupByOutputType, T['by']> &
        {
          [P in ((keyof T) & (keyof TenantBrandingGroupByOutputType))]: P extends '_count'
            ? T[P] extends boolean
              ? number
              : GetScalarType<T[P], TenantBrandingGroupByOutputType[P]>
            : GetScalarType<T[P], TenantBrandingGroupByOutputType[P]>
        }
      >
    >


  export type TenantBrandingSelect<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetSelect<{
    id?: boolean
    logoPath?: boolean
    primaryColor?: boolean
    darkMode?: boolean
    updatedAt?: boolean
  }, ExtArgs["result"]["tenantBranding"]>

  export type TenantBrandingSelectCreateManyAndReturn<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetSelect<{
    id?: boolean
    logoPath?: boolean
    primaryColor?: boolean
    darkMode?: boolean
    updatedAt?: boolean
  }, ExtArgs["result"]["tenantBranding"]>

  export type TenantBrandingSelectUpdateManyAndReturn<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetSelect<{
    id?: boolean
    logoPath?: boolean
    primaryColor?: boolean
    darkMode?: boolean
    updatedAt?: boolean
  }, ExtArgs["result"]["tenantBranding"]>

  export type TenantBrandingSelectScalar = {
    id?: boolean
    logoPath?: boolean
    primaryColor?: boolean
    darkMode?: boolean
    updatedAt?: boolean
  }

  export type TenantBrandingOmit<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetOmit<"id" | "logoPath" | "primaryColor" | "darkMode" | "updatedAt", ExtArgs["result"]["tenantBranding"]>

  export type $TenantBrandingPayload<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    name: "TenantBranding"
    objects: {}
    scalars: $Extensions.GetPayloadResult<{
      id: string
      logoPath: string | null
      primaryColor: string
      darkMode: boolean
      updatedAt: Date
    }, ExtArgs["result"]["tenantBranding"]>
    composites: {}
  }

  type TenantBrandingGetPayload<S extends boolean | null | undefined | TenantBrandingDefaultArgs> = $Result.GetResult<Prisma.$TenantBrandingPayload, S>

  type TenantBrandingCountArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> =
    Omit<TenantBrandingFindManyArgs, 'select' | 'include' | 'distinct' | 'omit'> & {
      select?: TenantBrandingCountAggregateInputType | true
    }

  export interface TenantBrandingDelegate<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs, GlobalOmitOptions = {}> {
    [K: symbol]: { types: Prisma.TypeMap<ExtArgs>['model']['TenantBranding'], meta: { name: 'TenantBranding' } }
    /**
     * Find zero or one TenantBranding that matches the filter.
     * @param {TenantBrandingFindUniqueArgs} args - Arguments to find a TenantBranding
     * @example
     * // Get one TenantBranding
     * const tenantBranding = await prisma.tenantBranding.findUnique({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findUnique<T extends TenantBrandingFindUniqueArgs>(args: SelectSubset<T, TenantBrandingFindUniqueArgs<ExtArgs>>): Prisma__TenantBrandingClient<$Result.GetResult<Prisma.$TenantBrandingPayload<ExtArgs>, T, "findUnique", GlobalOmitOptions> | null, null, ExtArgs, GlobalOmitOptions>

    /**
     * Find one TenantBranding that matches the filter or throw an error with `error.code='P2025'`
     * if no matches were found.
     * @param {TenantBrandingFindUniqueOrThrowArgs} args - Arguments to find a TenantBranding
     * @example
     * // Get one TenantBranding
     * const tenantBranding = await prisma.tenantBranding.findUniqueOrThrow({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findUniqueOrThrow<T extends TenantBrandingFindUniqueOrThrowArgs>(args: SelectSubset<T, TenantBrandingFindUniqueOrThrowArgs<ExtArgs>>): Prisma__TenantBrandingClient<$Result.GetResult<Prisma.$TenantBrandingPayload<ExtArgs>, T, "findUniqueOrThrow", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Find the first TenantBranding that matches the filter.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {TenantBrandingFindFirstArgs} args - Arguments to find a TenantBranding
     * @example
     * // Get one TenantBranding
     * const tenantBranding = await prisma.tenantBranding.findFirst({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findFirst<T extends TenantBrandingFindFirstArgs>(args?: SelectSubset<T, TenantBrandingFindFirstArgs<ExtArgs>>): Prisma__TenantBrandingClient<$Result.GetResult<Prisma.$TenantBrandingPayload<ExtArgs>, T, "findFirst", GlobalOmitOptions> | null, null, ExtArgs, GlobalOmitOptions>

    /**
     * Find the first TenantBranding that matches the filter or
     * throw `PrismaKnownClientError` with `P2025` code if no matches were found.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {TenantBrandingFindFirstOrThrowArgs} args - Arguments to find a TenantBranding
     * @example
     * // Get one TenantBranding
     * const tenantBranding = await prisma.tenantBranding.findFirstOrThrow({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findFirstOrThrow<T extends TenantBrandingFindFirstOrThrowArgs>(args?: SelectSubset<T, TenantBrandingFindFirstOrThrowArgs<ExtArgs>>): Prisma__TenantBrandingClient<$Result.GetResult<Prisma.$TenantBrandingPayload<ExtArgs>, T, "findFirstOrThrow", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Find zero or more TenantBrandings that matches the filter.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {TenantBrandingFindManyArgs} args - Arguments to filter and select certain fields only.
     * @example
     * // Get all TenantBrandings
     * const tenantBrandings = await prisma.tenantBranding.findMany()
     * 
     * // Get first 10 TenantBrandings
     * const tenantBrandings = await prisma.tenantBranding.findMany({ take: 10 })
     * 
     * // Only select the `id`
     * const tenantBrandingWithIdOnly = await prisma.tenantBranding.findMany({ select: { id: true } })
     * 
     */
    findMany<T extends TenantBrandingFindManyArgs>(args?: SelectSubset<T, TenantBrandingFindManyArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$TenantBrandingPayload<ExtArgs>, T, "findMany", GlobalOmitOptions>>

    /**
     * Create a TenantBranding.
     * @param {TenantBrandingCreateArgs} args - Arguments to create a TenantBranding.
     * @example
     * // Create one TenantBranding
     * const TenantBranding = await prisma.tenantBranding.create({
     *   data: {
     *     // ... data to create a TenantBranding
     *   }
     * })
     * 
     */
    create<T extends TenantBrandingCreateArgs>(args: SelectSubset<T, TenantBrandingCreateArgs<ExtArgs>>): Prisma__TenantBrandingClient<$Result.GetResult<Prisma.$TenantBrandingPayload<ExtArgs>, T, "create", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Create many TenantBrandings.
     * @param {TenantBrandingCreateManyArgs} args - Arguments to create many TenantBrandings.
     * @example
     * // Create many TenantBrandings
     * const tenantBranding = await prisma.tenantBranding.createMany({
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     *     
     */
    createMany<T extends TenantBrandingCreateManyArgs>(args?: SelectSubset<T, TenantBrandingCreateManyArgs<ExtArgs>>): Prisma.PrismaPromise<BatchPayload>

    /**
     * Create many TenantBrandings and returns the data saved in the database.
     * @param {TenantBrandingCreateManyAndReturnArgs} args - Arguments to create many TenantBrandings.
     * @example
     * // Create many TenantBrandings
     * const tenantBranding = await prisma.tenantBranding.createManyAndReturn({
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * 
     * // Create many TenantBrandings and only return the `id`
     * const tenantBrandingWithIdOnly = await prisma.tenantBranding.createManyAndReturn({
     *   select: { id: true },
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * 
     */
    createManyAndReturn<T extends TenantBrandingCreateManyAndReturnArgs>(args?: SelectSubset<T, TenantBrandingCreateManyAndReturnArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$TenantBrandingPayload<ExtArgs>, T, "createManyAndReturn", GlobalOmitOptions>>

    /**
     * Delete a TenantBranding.
     * @param {TenantBrandingDeleteArgs} args - Arguments to delete one TenantBranding.
     * @example
     * // Delete one TenantBranding
     * const TenantBranding = await prisma.tenantBranding.delete({
     *   where: {
     *     // ... filter to delete one TenantBranding
     *   }
     * })
     * 
     */
    delete<T extends TenantBrandingDeleteArgs>(args: SelectSubset<T, TenantBrandingDeleteArgs<ExtArgs>>): Prisma__TenantBrandingClient<$Result.GetResult<Prisma.$TenantBrandingPayload<ExtArgs>, T, "delete", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Update one TenantBranding.
     * @param {TenantBrandingUpdateArgs} args - Arguments to update one TenantBranding.
     * @example
     * // Update one TenantBranding
     * const tenantBranding = await prisma.tenantBranding.update({
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: {
     *     // ... provide data here
     *   }
     * })
     * 
     */
    update<T extends TenantBrandingUpdateArgs>(args: SelectSubset<T, TenantBrandingUpdateArgs<ExtArgs>>): Prisma__TenantBrandingClient<$Result.GetResult<Prisma.$TenantBrandingPayload<ExtArgs>, T, "update", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Delete zero or more TenantBrandings.
     * @param {TenantBrandingDeleteManyArgs} args - Arguments to filter TenantBrandings to delete.
     * @example
     * // Delete a few TenantBrandings
     * const { count } = await prisma.tenantBranding.deleteMany({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     * 
     */
    deleteMany<T extends TenantBrandingDeleteManyArgs>(args?: SelectSubset<T, TenantBrandingDeleteManyArgs<ExtArgs>>): Prisma.PrismaPromise<BatchPayload>

    /**
     * Update zero or more TenantBrandings.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {TenantBrandingUpdateManyArgs} args - Arguments to update one or more rows.
     * @example
     * // Update many TenantBrandings
     * const tenantBranding = await prisma.tenantBranding.updateMany({
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: {
     *     // ... provide data here
     *   }
     * })
     * 
     */
    updateMany<T extends TenantBrandingUpdateManyArgs>(args: SelectSubset<T, TenantBrandingUpdateManyArgs<ExtArgs>>): Prisma.PrismaPromise<BatchPayload>

    /**
     * Update zero or more TenantBrandings and returns the data updated in the database.
     * @param {TenantBrandingUpdateManyAndReturnArgs} args - Arguments to update many TenantBrandings.
     * @example
     * // Update many TenantBrandings
     * const tenantBranding = await prisma.tenantBranding.updateManyAndReturn({
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * 
     * // Update zero or more TenantBrandings and only return the `id`
     * const tenantBrandingWithIdOnly = await prisma.tenantBranding.updateManyAndReturn({
     *   select: { id: true },
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * 
     */
    updateManyAndReturn<T extends TenantBrandingUpdateManyAndReturnArgs>(args: SelectSubset<T, TenantBrandingUpdateManyAndReturnArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$TenantBrandingPayload<ExtArgs>, T, "updateManyAndReturn", GlobalOmitOptions>>

    /**
     * Create or update one TenantBranding.
     * @param {TenantBrandingUpsertArgs} args - Arguments to update or create a TenantBranding.
     * @example
     * // Update or create a TenantBranding
     * const tenantBranding = await prisma.tenantBranding.upsert({
     *   create: {
     *     // ... data to create a TenantBranding
     *   },
     *   update: {
     *     // ... in case it already exists, update
     *   },
     *   where: {
     *     // ... the filter for the TenantBranding we want to update
     *   }
     * })
     */
    upsert<T extends TenantBrandingUpsertArgs>(args: SelectSubset<T, TenantBrandingUpsertArgs<ExtArgs>>): Prisma__TenantBrandingClient<$Result.GetResult<Prisma.$TenantBrandingPayload<ExtArgs>, T, "upsert", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>


    /**
     * Count the number of TenantBrandings.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {TenantBrandingCountArgs} args - Arguments to filter TenantBrandings to count.
     * @example
     * // Count the number of TenantBrandings
     * const count = await prisma.tenantBranding.count({
     *   where: {
     *     // ... the filter for the TenantBrandings we want to count
     *   }
     * })
    **/
    count<T extends TenantBrandingCountArgs>(
      args?: Subset<T, TenantBrandingCountArgs>,
    ): Prisma.PrismaPromise<
      T extends $Utils.Record<'select', any>
        ? T['select'] extends true
          ? number
          : GetScalarType<T['select'], TenantBrandingCountAggregateOutputType>
        : number
    >

    /**
     * Allows you to perform aggregations operations on a TenantBranding.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {TenantBrandingAggregateArgs} args - Select which aggregations you would like to apply and on what fields.
     * @example
     * // Ordered by age ascending
     * // Where email contains prisma.io
     * // Limited to the 10 users
     * const aggregations = await prisma.user.aggregate({
     *   _avg: {
     *     age: true,
     *   },
     *   where: {
     *     email: {
     *       contains: "prisma.io",
     *     },
     *   },
     *   orderBy: {
     *     age: "asc",
     *   },
     *   take: 10,
     * })
    **/
    aggregate<T extends TenantBrandingAggregateArgs>(args: Subset<T, TenantBrandingAggregateArgs>): Prisma.PrismaPromise<GetTenantBrandingAggregateType<T>>

    /**
     * Group by TenantBranding.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {TenantBrandingGroupByArgs} args - Group by arguments.
     * @example
     * // Group by city, order by createdAt, get count
     * const result = await prisma.user.groupBy({
     *   by: ['city', 'createdAt'],
     *   orderBy: {
     *     createdAt: true
     *   },
     *   _count: {
     *     _all: true
     *   },
     * })
     * 
    **/
    groupBy<
      T extends TenantBrandingGroupByArgs,
      HasSelectOrTake extends Or<
        Extends<'skip', Keys<T>>,
        Extends<'take', Keys<T>>
      >,
      OrderByArg extends True extends HasSelectOrTake
        ? { orderBy: TenantBrandingGroupByArgs['orderBy'] }
        : { orderBy?: TenantBrandingGroupByArgs['orderBy'] },
      OrderFields extends ExcludeUnderscoreKeys<Keys<MaybeTupleToUnion<T['orderBy']>>>,
      ByFields extends MaybeTupleToUnion<T['by']>,
      ByValid extends Has<ByFields, OrderFields>,
      HavingFields extends GetHavingFields<T['having']>,
      HavingValid extends Has<ByFields, HavingFields>,
      ByEmpty extends T['by'] extends never[] ? True : False,
      InputErrors extends ByEmpty extends True
      ? `Error: "by" must not be empty.`
      : HavingValid extends False
      ? {
          [P in HavingFields]: P extends ByFields
            ? never
            : P extends string
            ? `Error: Field "${P}" used in "having" needs to be provided in "by".`
            : [
                Error,
                'Field ',
                P,
                ` in "having" needs to be provided in "by"`,
              ]
        }[HavingFields]
      : 'take' extends Keys<T>
      ? 'orderBy' extends Keys<T>
        ? ByValid extends True
          ? {}
          : {
              [P in OrderFields]: P extends ByFields
                ? never
                : `Error: Field "${P}" in "orderBy" needs to be provided in "by"`
            }[OrderFields]
        : 'Error: If you provide "take", you also need to provide "orderBy"'
      : 'skip' extends Keys<T>
      ? 'orderBy' extends Keys<T>
        ? ByValid extends True
          ? {}
          : {
              [P in OrderFields]: P extends ByFields
                ? never
                : `Error: Field "${P}" in "orderBy" needs to be provided in "by"`
            }[OrderFields]
        : 'Error: If you provide "skip", you also need to provide "orderBy"'
      : ByValid extends True
      ? {}
      : {
          [P in OrderFields]: P extends ByFields
            ? never
            : `Error: Field "${P}" in "orderBy" needs to be provided in "by"`
        }[OrderFields]
    >(args: SubsetIntersection<T, TenantBrandingGroupByArgs, OrderByArg> & InputErrors): {} extends InputErrors ? GetTenantBrandingGroupByPayload<T> : Prisma.PrismaPromise<InputErrors>
  /**
   * Fields of the TenantBranding model
   */
  readonly fields: TenantBrandingFieldRefs;
  }

  /**
   * The delegate class that acts as a "Promise-like" for TenantBranding.
   * Why is this prefixed with `Prisma__`?
   * Because we want to prevent naming conflicts as mentioned in
   * https://github.com/prisma/prisma-client-js/issues/707
   */
  export interface Prisma__TenantBrandingClient<T, Null = never, ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs, GlobalOmitOptions = {}> extends Prisma.PrismaPromise<T> {
    readonly [Symbol.toStringTag]: "PrismaPromise"
    /**
     * Attaches callbacks for the resolution and/or rejection of the Promise.
     * @param onfulfilled The callback to execute when the Promise is resolved.
     * @param onrejected The callback to execute when the Promise is rejected.
     * @returns A Promise for the completion of which ever callback is executed.
     */
    then<TResult1 = T, TResult2 = never>(onfulfilled?: ((value: T) => TResult1 | PromiseLike<TResult1>) | undefined | null, onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | undefined | null): $Utils.JsPromise<TResult1 | TResult2>
    /**
     * Attaches a callback for only the rejection of the Promise.
     * @param onrejected The callback to execute when the Promise is rejected.
     * @returns A Promise for the completion of the callback.
     */
    catch<TResult = never>(onrejected?: ((reason: any) => TResult | PromiseLike<TResult>) | undefined | null): $Utils.JsPromise<T | TResult>
    /**
     * Attaches a callback that is invoked when the Promise is settled (fulfilled or rejected). The
     * resolved value cannot be modified from the callback.
     * @param onfinally The callback to execute when the Promise is settled (fulfilled or rejected).
     * @returns A Promise for the completion of the callback.
     */
    finally(onfinally?: (() => void) | undefined | null): $Utils.JsPromise<T>
  }




  /**
   * Fields of the TenantBranding model
   */
  interface TenantBrandingFieldRefs {
    readonly id: FieldRef<"TenantBranding", 'String'>
    readonly logoPath: FieldRef<"TenantBranding", 'String'>
    readonly primaryColor: FieldRef<"TenantBranding", 'String'>
    readonly darkMode: FieldRef<"TenantBranding", 'Boolean'>
    readonly updatedAt: FieldRef<"TenantBranding", 'DateTime'>
  }
    

  // Custom InputTypes
  /**
   * TenantBranding findUnique
   */
  export type TenantBrandingFindUniqueArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the TenantBranding
     */
    select?: TenantBrandingSelect<ExtArgs> | null
    /**
     * Omit specific fields from the TenantBranding
     */
    omit?: TenantBrandingOmit<ExtArgs> | null
    /**
     * Filter, which TenantBranding to fetch.
     */
    where: TenantBrandingWhereUniqueInput
  }

  /**
   * TenantBranding findUniqueOrThrow
   */
  export type TenantBrandingFindUniqueOrThrowArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the TenantBranding
     */
    select?: TenantBrandingSelect<ExtArgs> | null
    /**
     * Omit specific fields from the TenantBranding
     */
    omit?: TenantBrandingOmit<ExtArgs> | null
    /**
     * Filter, which TenantBranding to fetch.
     */
    where: TenantBrandingWhereUniqueInput
  }

  /**
   * TenantBranding findFirst
   */
  export type TenantBrandingFindFirstArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the TenantBranding
     */
    select?: TenantBrandingSelect<ExtArgs> | null
    /**
     * Omit specific fields from the TenantBranding
     */
    omit?: TenantBrandingOmit<ExtArgs> | null
    /**
     * Filter, which TenantBranding to fetch.
     */
    where?: TenantBrandingWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of TenantBrandings to fetch.
     */
    orderBy?: TenantBrandingOrderByWithRelationInput | TenantBrandingOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the position for searching for TenantBrandings.
     */
    cursor?: TenantBrandingWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` TenantBrandings from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` TenantBrandings.
     */
    skip?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/distinct Distinct Docs}
     * 
     * Filter by unique combinations of TenantBrandings.
     */
    distinct?: TenantBrandingScalarFieldEnum | TenantBrandingScalarFieldEnum[]
  }

  /**
   * TenantBranding findFirstOrThrow
   */
  export type TenantBrandingFindFirstOrThrowArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the TenantBranding
     */
    select?: TenantBrandingSelect<ExtArgs> | null
    /**
     * Omit specific fields from the TenantBranding
     */
    omit?: TenantBrandingOmit<ExtArgs> | null
    /**
     * Filter, which TenantBranding to fetch.
     */
    where?: TenantBrandingWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of TenantBrandings to fetch.
     */
    orderBy?: TenantBrandingOrderByWithRelationInput | TenantBrandingOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the position for searching for TenantBrandings.
     */
    cursor?: TenantBrandingWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` TenantBrandings from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` TenantBrandings.
     */
    skip?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/distinct Distinct Docs}
     * 
     * Filter by unique combinations of TenantBrandings.
     */
    distinct?: TenantBrandingScalarFieldEnum | TenantBrandingScalarFieldEnum[]
  }

  /**
   * TenantBranding findMany
   */
  export type TenantBrandingFindManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the TenantBranding
     */
    select?: TenantBrandingSelect<ExtArgs> | null
    /**
     * Omit specific fields from the TenantBranding
     */
    omit?: TenantBrandingOmit<ExtArgs> | null
    /**
     * Filter, which TenantBrandings to fetch.
     */
    where?: TenantBrandingWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of TenantBrandings to fetch.
     */
    orderBy?: TenantBrandingOrderByWithRelationInput | TenantBrandingOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the position for listing TenantBrandings.
     */
    cursor?: TenantBrandingWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` TenantBrandings from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` TenantBrandings.
     */
    skip?: number
    distinct?: TenantBrandingScalarFieldEnum | TenantBrandingScalarFieldEnum[]
  }

  /**
   * TenantBranding create
   */
  export type TenantBrandingCreateArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the TenantBranding
     */
    select?: TenantBrandingSelect<ExtArgs> | null
    /**
     * Omit specific fields from the TenantBranding
     */
    omit?: TenantBrandingOmit<ExtArgs> | null
    /**
     * The data needed to create a TenantBranding.
     */
    data: XOR<TenantBrandingCreateInput, TenantBrandingUncheckedCreateInput>
  }

  /**
   * TenantBranding createMany
   */
  export type TenantBrandingCreateManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * The data used to create many TenantBrandings.
     */
    data: TenantBrandingCreateManyInput | TenantBrandingCreateManyInput[]
    skipDuplicates?: boolean
  }

  /**
   * TenantBranding createManyAndReturn
   */
  export type TenantBrandingCreateManyAndReturnArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the TenantBranding
     */
    select?: TenantBrandingSelectCreateManyAndReturn<ExtArgs> | null
    /**
     * Omit specific fields from the TenantBranding
     */
    omit?: TenantBrandingOmit<ExtArgs> | null
    /**
     * The data used to create many TenantBrandings.
     */
    data: TenantBrandingCreateManyInput | TenantBrandingCreateManyInput[]
    skipDuplicates?: boolean
  }

  /**
   * TenantBranding update
   */
  export type TenantBrandingUpdateArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the TenantBranding
     */
    select?: TenantBrandingSelect<ExtArgs> | null
    /**
     * Omit specific fields from the TenantBranding
     */
    omit?: TenantBrandingOmit<ExtArgs> | null
    /**
     * The data needed to update a TenantBranding.
     */
    data: XOR<TenantBrandingUpdateInput, TenantBrandingUncheckedUpdateInput>
    /**
     * Choose, which TenantBranding to update.
     */
    where: TenantBrandingWhereUniqueInput
  }

  /**
   * TenantBranding updateMany
   */
  export type TenantBrandingUpdateManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * The data used to update TenantBrandings.
     */
    data: XOR<TenantBrandingUpdateManyMutationInput, TenantBrandingUncheckedUpdateManyInput>
    /**
     * Filter which TenantBrandings to update
     */
    where?: TenantBrandingWhereInput
    /**
     * Limit how many TenantBrandings to update.
     */
    limit?: number
  }

  /**
   * TenantBranding updateManyAndReturn
   */
  export type TenantBrandingUpdateManyAndReturnArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the TenantBranding
     */
    select?: TenantBrandingSelectUpdateManyAndReturn<ExtArgs> | null
    /**
     * Omit specific fields from the TenantBranding
     */
    omit?: TenantBrandingOmit<ExtArgs> | null
    /**
     * The data used to update TenantBrandings.
     */
    data: XOR<TenantBrandingUpdateManyMutationInput, TenantBrandingUncheckedUpdateManyInput>
    /**
     * Filter which TenantBrandings to update
     */
    where?: TenantBrandingWhereInput
    /**
     * Limit how many TenantBrandings to update.
     */
    limit?: number
  }

  /**
   * TenantBranding upsert
   */
  export type TenantBrandingUpsertArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the TenantBranding
     */
    select?: TenantBrandingSelect<ExtArgs> | null
    /**
     * Omit specific fields from the TenantBranding
     */
    omit?: TenantBrandingOmit<ExtArgs> | null
    /**
     * The filter to search for the TenantBranding to update in case it exists.
     */
    where: TenantBrandingWhereUniqueInput
    /**
     * In case the TenantBranding found by the `where` argument doesn't exist, create a new TenantBranding with this data.
     */
    create: XOR<TenantBrandingCreateInput, TenantBrandingUncheckedCreateInput>
    /**
     * In case the TenantBranding was found with the provided `where` argument, update it with this data.
     */
    update: XOR<TenantBrandingUpdateInput, TenantBrandingUncheckedUpdateInput>
  }

  /**
   * TenantBranding delete
   */
  export type TenantBrandingDeleteArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the TenantBranding
     */
    select?: TenantBrandingSelect<ExtArgs> | null
    /**
     * Omit specific fields from the TenantBranding
     */
    omit?: TenantBrandingOmit<ExtArgs> | null
    /**
     * Filter which TenantBranding to delete.
     */
    where: TenantBrandingWhereUniqueInput
  }

  /**
   * TenantBranding deleteMany
   */
  export type TenantBrandingDeleteManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Filter which TenantBrandings to delete
     */
    where?: TenantBrandingWhereInput
    /**
     * Limit how many TenantBrandings to delete.
     */
    limit?: number
  }

  /**
   * TenantBranding without action
   */
  export type TenantBrandingDefaultArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the TenantBranding
     */
    select?: TenantBrandingSelect<ExtArgs> | null
    /**
     * Omit specific fields from the TenantBranding
     */
    omit?: TenantBrandingOmit<ExtArgs> | null
  }


  /**
   * Model Workspace
   */

  export type AggregateWorkspace = {
    _count: WorkspaceCountAggregateOutputType | null
    _avg: WorkspaceAvgAggregateOutputType | null
    _sum: WorkspaceSumAggregateOutputType | null
    _min: WorkspaceMinAggregateOutputType | null
    _max: WorkspaceMaxAggregateOutputType | null
  }

  export type WorkspaceAvgAggregateOutputType = {
    version: number | null
  }

  export type WorkspaceSumAggregateOutputType = {
    version: number | null
  }

  export type WorkspaceMinAggregateOutputType = {
    id: string | null
    name: string | null
    slug: string | null
    description: string | null
    parentId: string | null
    materializedPath: string | null
    status: string | null
    archivedAt: Date | null
    templateId: string | null
    createdBy: string | null
    version: number | null
    createdAt: Date | null
    updatedAt: Date | null
  }

  export type WorkspaceMaxAggregateOutputType = {
    id: string | null
    name: string | null
    slug: string | null
    description: string | null
    parentId: string | null
    materializedPath: string | null
    status: string | null
    archivedAt: Date | null
    templateId: string | null
    createdBy: string | null
    version: number | null
    createdAt: Date | null
    updatedAt: Date | null
  }

  export type WorkspaceCountAggregateOutputType = {
    id: number
    name: number
    slug: number
    description: number
    parentId: number
    materializedPath: number
    status: number
    archivedAt: number
    templateId: number
    createdBy: number
    version: number
    createdAt: number
    updatedAt: number
    _all: number
  }


  export type WorkspaceAvgAggregateInputType = {
    version?: true
  }

  export type WorkspaceSumAggregateInputType = {
    version?: true
  }

  export type WorkspaceMinAggregateInputType = {
    id?: true
    name?: true
    slug?: true
    description?: true
    parentId?: true
    materializedPath?: true
    status?: true
    archivedAt?: true
    templateId?: true
    createdBy?: true
    version?: true
    createdAt?: true
    updatedAt?: true
  }

  export type WorkspaceMaxAggregateInputType = {
    id?: true
    name?: true
    slug?: true
    description?: true
    parentId?: true
    materializedPath?: true
    status?: true
    archivedAt?: true
    templateId?: true
    createdBy?: true
    version?: true
    createdAt?: true
    updatedAt?: true
  }

  export type WorkspaceCountAggregateInputType = {
    id?: true
    name?: true
    slug?: true
    description?: true
    parentId?: true
    materializedPath?: true
    status?: true
    archivedAt?: true
    templateId?: true
    createdBy?: true
    version?: true
    createdAt?: true
    updatedAt?: true
    _all?: true
  }

  export type WorkspaceAggregateArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Filter which Workspace to aggregate.
     */
    where?: WorkspaceWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of Workspaces to fetch.
     */
    orderBy?: WorkspaceOrderByWithRelationInput | WorkspaceOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the start position
     */
    cursor?: WorkspaceWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` Workspaces from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` Workspaces.
     */
    skip?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Count returned Workspaces
    **/
    _count?: true | WorkspaceCountAggregateInputType
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Select which fields to average
    **/
    _avg?: WorkspaceAvgAggregateInputType
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Select which fields to sum
    **/
    _sum?: WorkspaceSumAggregateInputType
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Select which fields to find the minimum value
    **/
    _min?: WorkspaceMinAggregateInputType
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Select which fields to find the maximum value
    **/
    _max?: WorkspaceMaxAggregateInputType
  }

  export type GetWorkspaceAggregateType<T extends WorkspaceAggregateArgs> = {
        [P in keyof T & keyof AggregateWorkspace]: P extends '_count' | 'count'
      ? T[P] extends true
        ? number
        : GetScalarType<T[P], AggregateWorkspace[P]>
      : GetScalarType<T[P], AggregateWorkspace[P]>
  }




  export type WorkspaceGroupByArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    where?: WorkspaceWhereInput
    orderBy?: WorkspaceOrderByWithAggregationInput | WorkspaceOrderByWithAggregationInput[]
    by: WorkspaceScalarFieldEnum[] | WorkspaceScalarFieldEnum
    having?: WorkspaceScalarWhereWithAggregatesInput
    take?: number
    skip?: number
    _count?: WorkspaceCountAggregateInputType | true
    _avg?: WorkspaceAvgAggregateInputType
    _sum?: WorkspaceSumAggregateInputType
    _min?: WorkspaceMinAggregateInputType
    _max?: WorkspaceMaxAggregateInputType
  }

  export type WorkspaceGroupByOutputType = {
    id: string
    name: string
    slug: string
    description: string | null
    parentId: string | null
    materializedPath: string
    status: string
    archivedAt: Date | null
    templateId: string | null
    createdBy: string
    version: number
    createdAt: Date
    updatedAt: Date
    _count: WorkspaceCountAggregateOutputType | null
    _avg: WorkspaceAvgAggregateOutputType | null
    _sum: WorkspaceSumAggregateOutputType | null
    _min: WorkspaceMinAggregateOutputType | null
    _max: WorkspaceMaxAggregateOutputType | null
  }

  type GetWorkspaceGroupByPayload<T extends WorkspaceGroupByArgs> = Prisma.PrismaPromise<
    Array<
      PickEnumerable<WorkspaceGroupByOutputType, T['by']> &
        {
          [P in ((keyof T) & (keyof WorkspaceGroupByOutputType))]: P extends '_count'
            ? T[P] extends boolean
              ? number
              : GetScalarType<T[P], WorkspaceGroupByOutputType[P]>
            : GetScalarType<T[P], WorkspaceGroupByOutputType[P]>
        }
      >
    >


  export type WorkspaceSelect<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetSelect<{
    id?: boolean
    name?: boolean
    slug?: boolean
    description?: boolean
    parentId?: boolean
    materializedPath?: boolean
    status?: boolean
    archivedAt?: boolean
    templateId?: boolean
    createdBy?: boolean
    version?: boolean
    createdAt?: boolean
    updatedAt?: boolean
    parent?: boolean | Workspace$parentArgs<ExtArgs>
    children?: boolean | Workspace$childrenArgs<ExtArgs>
    template?: boolean | Workspace$templateArgs<ExtArgs>
    creator?: boolean | UserProfileDefaultArgs<ExtArgs>
    members?: boolean | Workspace$membersArgs<ExtArgs>
    invitations?: boolean | Workspace$invitationsArgs<ExtArgs>
    roleActions?: boolean | Workspace$roleActionsArgs<ExtArgs>
    _count?: boolean | WorkspaceCountOutputTypeDefaultArgs<ExtArgs>
  }, ExtArgs["result"]["workspace"]>

  export type WorkspaceSelectCreateManyAndReturn<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetSelect<{
    id?: boolean
    name?: boolean
    slug?: boolean
    description?: boolean
    parentId?: boolean
    materializedPath?: boolean
    status?: boolean
    archivedAt?: boolean
    templateId?: boolean
    createdBy?: boolean
    version?: boolean
    createdAt?: boolean
    updatedAt?: boolean
    parent?: boolean | Workspace$parentArgs<ExtArgs>
    template?: boolean | Workspace$templateArgs<ExtArgs>
    creator?: boolean | UserProfileDefaultArgs<ExtArgs>
  }, ExtArgs["result"]["workspace"]>

  export type WorkspaceSelectUpdateManyAndReturn<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetSelect<{
    id?: boolean
    name?: boolean
    slug?: boolean
    description?: boolean
    parentId?: boolean
    materializedPath?: boolean
    status?: boolean
    archivedAt?: boolean
    templateId?: boolean
    createdBy?: boolean
    version?: boolean
    createdAt?: boolean
    updatedAt?: boolean
    parent?: boolean | Workspace$parentArgs<ExtArgs>
    template?: boolean | Workspace$templateArgs<ExtArgs>
    creator?: boolean | UserProfileDefaultArgs<ExtArgs>
  }, ExtArgs["result"]["workspace"]>

  export type WorkspaceSelectScalar = {
    id?: boolean
    name?: boolean
    slug?: boolean
    description?: boolean
    parentId?: boolean
    materializedPath?: boolean
    status?: boolean
    archivedAt?: boolean
    templateId?: boolean
    createdBy?: boolean
    version?: boolean
    createdAt?: boolean
    updatedAt?: boolean
  }

  export type WorkspaceOmit<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetOmit<"id" | "name" | "slug" | "description" | "parentId" | "materializedPath" | "status" | "archivedAt" | "templateId" | "createdBy" | "version" | "createdAt" | "updatedAt", ExtArgs["result"]["workspace"]>
  export type WorkspaceInclude<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    parent?: boolean | Workspace$parentArgs<ExtArgs>
    children?: boolean | Workspace$childrenArgs<ExtArgs>
    template?: boolean | Workspace$templateArgs<ExtArgs>
    creator?: boolean | UserProfileDefaultArgs<ExtArgs>
    members?: boolean | Workspace$membersArgs<ExtArgs>
    invitations?: boolean | Workspace$invitationsArgs<ExtArgs>
    roleActions?: boolean | Workspace$roleActionsArgs<ExtArgs>
    _count?: boolean | WorkspaceCountOutputTypeDefaultArgs<ExtArgs>
  }
  export type WorkspaceIncludeCreateManyAndReturn<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    parent?: boolean | Workspace$parentArgs<ExtArgs>
    template?: boolean | Workspace$templateArgs<ExtArgs>
    creator?: boolean | UserProfileDefaultArgs<ExtArgs>
  }
  export type WorkspaceIncludeUpdateManyAndReturn<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    parent?: boolean | Workspace$parentArgs<ExtArgs>
    template?: boolean | Workspace$templateArgs<ExtArgs>
    creator?: boolean | UserProfileDefaultArgs<ExtArgs>
  }

  export type $WorkspacePayload<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    name: "Workspace"
    objects: {
      parent: Prisma.$WorkspacePayload<ExtArgs> | null
      children: Prisma.$WorkspacePayload<ExtArgs>[]
      template: Prisma.$WorkspaceTemplatePayload<ExtArgs> | null
      creator: Prisma.$UserProfilePayload<ExtArgs>
      members: Prisma.$WorkspaceMemberPayload<ExtArgs>[]
      invitations: Prisma.$InvitationPayload<ExtArgs>[]
      roleActions: Prisma.$WorkspaceRoleActionPayload<ExtArgs>[]
    }
    scalars: $Extensions.GetPayloadResult<{
      id: string
      name: string
      slug: string
      description: string | null
      parentId: string | null
      materializedPath: string
      status: string
      archivedAt: Date | null
      templateId: string | null
      createdBy: string
      version: number
      createdAt: Date
      updatedAt: Date
    }, ExtArgs["result"]["workspace"]>
    composites: {}
  }

  type WorkspaceGetPayload<S extends boolean | null | undefined | WorkspaceDefaultArgs> = $Result.GetResult<Prisma.$WorkspacePayload, S>

  type WorkspaceCountArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> =
    Omit<WorkspaceFindManyArgs, 'select' | 'include' | 'distinct' | 'omit'> & {
      select?: WorkspaceCountAggregateInputType | true
    }

  export interface WorkspaceDelegate<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs, GlobalOmitOptions = {}> {
    [K: symbol]: { types: Prisma.TypeMap<ExtArgs>['model']['Workspace'], meta: { name: 'Workspace' } }
    /**
     * Find zero or one Workspace that matches the filter.
     * @param {WorkspaceFindUniqueArgs} args - Arguments to find a Workspace
     * @example
     * // Get one Workspace
     * const workspace = await prisma.workspace.findUnique({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findUnique<T extends WorkspaceFindUniqueArgs>(args: SelectSubset<T, WorkspaceFindUniqueArgs<ExtArgs>>): Prisma__WorkspaceClient<$Result.GetResult<Prisma.$WorkspacePayload<ExtArgs>, T, "findUnique", GlobalOmitOptions> | null, null, ExtArgs, GlobalOmitOptions>

    /**
     * Find one Workspace that matches the filter or throw an error with `error.code='P2025'`
     * if no matches were found.
     * @param {WorkspaceFindUniqueOrThrowArgs} args - Arguments to find a Workspace
     * @example
     * // Get one Workspace
     * const workspace = await prisma.workspace.findUniqueOrThrow({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findUniqueOrThrow<T extends WorkspaceFindUniqueOrThrowArgs>(args: SelectSubset<T, WorkspaceFindUniqueOrThrowArgs<ExtArgs>>): Prisma__WorkspaceClient<$Result.GetResult<Prisma.$WorkspacePayload<ExtArgs>, T, "findUniqueOrThrow", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Find the first Workspace that matches the filter.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {WorkspaceFindFirstArgs} args - Arguments to find a Workspace
     * @example
     * // Get one Workspace
     * const workspace = await prisma.workspace.findFirst({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findFirst<T extends WorkspaceFindFirstArgs>(args?: SelectSubset<T, WorkspaceFindFirstArgs<ExtArgs>>): Prisma__WorkspaceClient<$Result.GetResult<Prisma.$WorkspacePayload<ExtArgs>, T, "findFirst", GlobalOmitOptions> | null, null, ExtArgs, GlobalOmitOptions>

    /**
     * Find the first Workspace that matches the filter or
     * throw `PrismaKnownClientError` with `P2025` code if no matches were found.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {WorkspaceFindFirstOrThrowArgs} args - Arguments to find a Workspace
     * @example
     * // Get one Workspace
     * const workspace = await prisma.workspace.findFirstOrThrow({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findFirstOrThrow<T extends WorkspaceFindFirstOrThrowArgs>(args?: SelectSubset<T, WorkspaceFindFirstOrThrowArgs<ExtArgs>>): Prisma__WorkspaceClient<$Result.GetResult<Prisma.$WorkspacePayload<ExtArgs>, T, "findFirstOrThrow", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Find zero or more Workspaces that matches the filter.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {WorkspaceFindManyArgs} args - Arguments to filter and select certain fields only.
     * @example
     * // Get all Workspaces
     * const workspaces = await prisma.workspace.findMany()
     * 
     * // Get first 10 Workspaces
     * const workspaces = await prisma.workspace.findMany({ take: 10 })
     * 
     * // Only select the `id`
     * const workspaceWithIdOnly = await prisma.workspace.findMany({ select: { id: true } })
     * 
     */
    findMany<T extends WorkspaceFindManyArgs>(args?: SelectSubset<T, WorkspaceFindManyArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$WorkspacePayload<ExtArgs>, T, "findMany", GlobalOmitOptions>>

    /**
     * Create a Workspace.
     * @param {WorkspaceCreateArgs} args - Arguments to create a Workspace.
     * @example
     * // Create one Workspace
     * const Workspace = await prisma.workspace.create({
     *   data: {
     *     // ... data to create a Workspace
     *   }
     * })
     * 
     */
    create<T extends WorkspaceCreateArgs>(args: SelectSubset<T, WorkspaceCreateArgs<ExtArgs>>): Prisma__WorkspaceClient<$Result.GetResult<Prisma.$WorkspacePayload<ExtArgs>, T, "create", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Create many Workspaces.
     * @param {WorkspaceCreateManyArgs} args - Arguments to create many Workspaces.
     * @example
     * // Create many Workspaces
     * const workspace = await prisma.workspace.createMany({
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     *     
     */
    createMany<T extends WorkspaceCreateManyArgs>(args?: SelectSubset<T, WorkspaceCreateManyArgs<ExtArgs>>): Prisma.PrismaPromise<BatchPayload>

    /**
     * Create many Workspaces and returns the data saved in the database.
     * @param {WorkspaceCreateManyAndReturnArgs} args - Arguments to create many Workspaces.
     * @example
     * // Create many Workspaces
     * const workspace = await prisma.workspace.createManyAndReturn({
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * 
     * // Create many Workspaces and only return the `id`
     * const workspaceWithIdOnly = await prisma.workspace.createManyAndReturn({
     *   select: { id: true },
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * 
     */
    createManyAndReturn<T extends WorkspaceCreateManyAndReturnArgs>(args?: SelectSubset<T, WorkspaceCreateManyAndReturnArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$WorkspacePayload<ExtArgs>, T, "createManyAndReturn", GlobalOmitOptions>>

    /**
     * Delete a Workspace.
     * @param {WorkspaceDeleteArgs} args - Arguments to delete one Workspace.
     * @example
     * // Delete one Workspace
     * const Workspace = await prisma.workspace.delete({
     *   where: {
     *     // ... filter to delete one Workspace
     *   }
     * })
     * 
     */
    delete<T extends WorkspaceDeleteArgs>(args: SelectSubset<T, WorkspaceDeleteArgs<ExtArgs>>): Prisma__WorkspaceClient<$Result.GetResult<Prisma.$WorkspacePayload<ExtArgs>, T, "delete", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Update one Workspace.
     * @param {WorkspaceUpdateArgs} args - Arguments to update one Workspace.
     * @example
     * // Update one Workspace
     * const workspace = await prisma.workspace.update({
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: {
     *     // ... provide data here
     *   }
     * })
     * 
     */
    update<T extends WorkspaceUpdateArgs>(args: SelectSubset<T, WorkspaceUpdateArgs<ExtArgs>>): Prisma__WorkspaceClient<$Result.GetResult<Prisma.$WorkspacePayload<ExtArgs>, T, "update", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Delete zero or more Workspaces.
     * @param {WorkspaceDeleteManyArgs} args - Arguments to filter Workspaces to delete.
     * @example
     * // Delete a few Workspaces
     * const { count } = await prisma.workspace.deleteMany({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     * 
     */
    deleteMany<T extends WorkspaceDeleteManyArgs>(args?: SelectSubset<T, WorkspaceDeleteManyArgs<ExtArgs>>): Prisma.PrismaPromise<BatchPayload>

    /**
     * Update zero or more Workspaces.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {WorkspaceUpdateManyArgs} args - Arguments to update one or more rows.
     * @example
     * // Update many Workspaces
     * const workspace = await prisma.workspace.updateMany({
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: {
     *     // ... provide data here
     *   }
     * })
     * 
     */
    updateMany<T extends WorkspaceUpdateManyArgs>(args: SelectSubset<T, WorkspaceUpdateManyArgs<ExtArgs>>): Prisma.PrismaPromise<BatchPayload>

    /**
     * Update zero or more Workspaces and returns the data updated in the database.
     * @param {WorkspaceUpdateManyAndReturnArgs} args - Arguments to update many Workspaces.
     * @example
     * // Update many Workspaces
     * const workspace = await prisma.workspace.updateManyAndReturn({
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * 
     * // Update zero or more Workspaces and only return the `id`
     * const workspaceWithIdOnly = await prisma.workspace.updateManyAndReturn({
     *   select: { id: true },
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * 
     */
    updateManyAndReturn<T extends WorkspaceUpdateManyAndReturnArgs>(args: SelectSubset<T, WorkspaceUpdateManyAndReturnArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$WorkspacePayload<ExtArgs>, T, "updateManyAndReturn", GlobalOmitOptions>>

    /**
     * Create or update one Workspace.
     * @param {WorkspaceUpsertArgs} args - Arguments to update or create a Workspace.
     * @example
     * // Update or create a Workspace
     * const workspace = await prisma.workspace.upsert({
     *   create: {
     *     // ... data to create a Workspace
     *   },
     *   update: {
     *     // ... in case it already exists, update
     *   },
     *   where: {
     *     // ... the filter for the Workspace we want to update
     *   }
     * })
     */
    upsert<T extends WorkspaceUpsertArgs>(args: SelectSubset<T, WorkspaceUpsertArgs<ExtArgs>>): Prisma__WorkspaceClient<$Result.GetResult<Prisma.$WorkspacePayload<ExtArgs>, T, "upsert", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>


    /**
     * Count the number of Workspaces.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {WorkspaceCountArgs} args - Arguments to filter Workspaces to count.
     * @example
     * // Count the number of Workspaces
     * const count = await prisma.workspace.count({
     *   where: {
     *     // ... the filter for the Workspaces we want to count
     *   }
     * })
    **/
    count<T extends WorkspaceCountArgs>(
      args?: Subset<T, WorkspaceCountArgs>,
    ): Prisma.PrismaPromise<
      T extends $Utils.Record<'select', any>
        ? T['select'] extends true
          ? number
          : GetScalarType<T['select'], WorkspaceCountAggregateOutputType>
        : number
    >

    /**
     * Allows you to perform aggregations operations on a Workspace.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {WorkspaceAggregateArgs} args - Select which aggregations you would like to apply and on what fields.
     * @example
     * // Ordered by age ascending
     * // Where email contains prisma.io
     * // Limited to the 10 users
     * const aggregations = await prisma.user.aggregate({
     *   _avg: {
     *     age: true,
     *   },
     *   where: {
     *     email: {
     *       contains: "prisma.io",
     *     },
     *   },
     *   orderBy: {
     *     age: "asc",
     *   },
     *   take: 10,
     * })
    **/
    aggregate<T extends WorkspaceAggregateArgs>(args: Subset<T, WorkspaceAggregateArgs>): Prisma.PrismaPromise<GetWorkspaceAggregateType<T>>

    /**
     * Group by Workspace.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {WorkspaceGroupByArgs} args - Group by arguments.
     * @example
     * // Group by city, order by createdAt, get count
     * const result = await prisma.user.groupBy({
     *   by: ['city', 'createdAt'],
     *   orderBy: {
     *     createdAt: true
     *   },
     *   _count: {
     *     _all: true
     *   },
     * })
     * 
    **/
    groupBy<
      T extends WorkspaceGroupByArgs,
      HasSelectOrTake extends Or<
        Extends<'skip', Keys<T>>,
        Extends<'take', Keys<T>>
      >,
      OrderByArg extends True extends HasSelectOrTake
        ? { orderBy: WorkspaceGroupByArgs['orderBy'] }
        : { orderBy?: WorkspaceGroupByArgs['orderBy'] },
      OrderFields extends ExcludeUnderscoreKeys<Keys<MaybeTupleToUnion<T['orderBy']>>>,
      ByFields extends MaybeTupleToUnion<T['by']>,
      ByValid extends Has<ByFields, OrderFields>,
      HavingFields extends GetHavingFields<T['having']>,
      HavingValid extends Has<ByFields, HavingFields>,
      ByEmpty extends T['by'] extends never[] ? True : False,
      InputErrors extends ByEmpty extends True
      ? `Error: "by" must not be empty.`
      : HavingValid extends False
      ? {
          [P in HavingFields]: P extends ByFields
            ? never
            : P extends string
            ? `Error: Field "${P}" used in "having" needs to be provided in "by".`
            : [
                Error,
                'Field ',
                P,
                ` in "having" needs to be provided in "by"`,
              ]
        }[HavingFields]
      : 'take' extends Keys<T>
      ? 'orderBy' extends Keys<T>
        ? ByValid extends True
          ? {}
          : {
              [P in OrderFields]: P extends ByFields
                ? never
                : `Error: Field "${P}" in "orderBy" needs to be provided in "by"`
            }[OrderFields]
        : 'Error: If you provide "take", you also need to provide "orderBy"'
      : 'skip' extends Keys<T>
      ? 'orderBy' extends Keys<T>
        ? ByValid extends True
          ? {}
          : {
              [P in OrderFields]: P extends ByFields
                ? never
                : `Error: Field "${P}" in "orderBy" needs to be provided in "by"`
            }[OrderFields]
        : 'Error: If you provide "skip", you also need to provide "orderBy"'
      : ByValid extends True
      ? {}
      : {
          [P in OrderFields]: P extends ByFields
            ? never
            : `Error: Field "${P}" in "orderBy" needs to be provided in "by"`
        }[OrderFields]
    >(args: SubsetIntersection<T, WorkspaceGroupByArgs, OrderByArg> & InputErrors): {} extends InputErrors ? GetWorkspaceGroupByPayload<T> : Prisma.PrismaPromise<InputErrors>
  /**
   * Fields of the Workspace model
   */
  readonly fields: WorkspaceFieldRefs;
  }

  /**
   * The delegate class that acts as a "Promise-like" for Workspace.
   * Why is this prefixed with `Prisma__`?
   * Because we want to prevent naming conflicts as mentioned in
   * https://github.com/prisma/prisma-client-js/issues/707
   */
  export interface Prisma__WorkspaceClient<T, Null = never, ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs, GlobalOmitOptions = {}> extends Prisma.PrismaPromise<T> {
    readonly [Symbol.toStringTag]: "PrismaPromise"
    parent<T extends Workspace$parentArgs<ExtArgs> = {}>(args?: Subset<T, Workspace$parentArgs<ExtArgs>>): Prisma__WorkspaceClient<$Result.GetResult<Prisma.$WorkspacePayload<ExtArgs>, T, "findUniqueOrThrow", GlobalOmitOptions> | null, null, ExtArgs, GlobalOmitOptions>
    children<T extends Workspace$childrenArgs<ExtArgs> = {}>(args?: Subset<T, Workspace$childrenArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$WorkspacePayload<ExtArgs>, T, "findMany", GlobalOmitOptions> | Null>
    template<T extends Workspace$templateArgs<ExtArgs> = {}>(args?: Subset<T, Workspace$templateArgs<ExtArgs>>): Prisma__WorkspaceTemplateClient<$Result.GetResult<Prisma.$WorkspaceTemplatePayload<ExtArgs>, T, "findUniqueOrThrow", GlobalOmitOptions> | null, null, ExtArgs, GlobalOmitOptions>
    creator<T extends UserProfileDefaultArgs<ExtArgs> = {}>(args?: Subset<T, UserProfileDefaultArgs<ExtArgs>>): Prisma__UserProfileClient<$Result.GetResult<Prisma.$UserProfilePayload<ExtArgs>, T, "findUniqueOrThrow", GlobalOmitOptions> | Null, Null, ExtArgs, GlobalOmitOptions>
    members<T extends Workspace$membersArgs<ExtArgs> = {}>(args?: Subset<T, Workspace$membersArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$WorkspaceMemberPayload<ExtArgs>, T, "findMany", GlobalOmitOptions> | Null>
    invitations<T extends Workspace$invitationsArgs<ExtArgs> = {}>(args?: Subset<T, Workspace$invitationsArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$InvitationPayload<ExtArgs>, T, "findMany", GlobalOmitOptions> | Null>
    roleActions<T extends Workspace$roleActionsArgs<ExtArgs> = {}>(args?: Subset<T, Workspace$roleActionsArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$WorkspaceRoleActionPayload<ExtArgs>, T, "findMany", GlobalOmitOptions> | Null>
    /**
     * Attaches callbacks for the resolution and/or rejection of the Promise.
     * @param onfulfilled The callback to execute when the Promise is resolved.
     * @param onrejected The callback to execute when the Promise is rejected.
     * @returns A Promise for the completion of which ever callback is executed.
     */
    then<TResult1 = T, TResult2 = never>(onfulfilled?: ((value: T) => TResult1 | PromiseLike<TResult1>) | undefined | null, onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | undefined | null): $Utils.JsPromise<TResult1 | TResult2>
    /**
     * Attaches a callback for only the rejection of the Promise.
     * @param onrejected The callback to execute when the Promise is rejected.
     * @returns A Promise for the completion of the callback.
     */
    catch<TResult = never>(onrejected?: ((reason: any) => TResult | PromiseLike<TResult>) | undefined | null): $Utils.JsPromise<T | TResult>
    /**
     * Attaches a callback that is invoked when the Promise is settled (fulfilled or rejected). The
     * resolved value cannot be modified from the callback.
     * @param onfinally The callback to execute when the Promise is settled (fulfilled or rejected).
     * @returns A Promise for the completion of the callback.
     */
    finally(onfinally?: (() => void) | undefined | null): $Utils.JsPromise<T>
  }




  /**
   * Fields of the Workspace model
   */
  interface WorkspaceFieldRefs {
    readonly id: FieldRef<"Workspace", 'String'>
    readonly name: FieldRef<"Workspace", 'String'>
    readonly slug: FieldRef<"Workspace", 'String'>
    readonly description: FieldRef<"Workspace", 'String'>
    readonly parentId: FieldRef<"Workspace", 'String'>
    readonly materializedPath: FieldRef<"Workspace", 'String'>
    readonly status: FieldRef<"Workspace", 'String'>
    readonly archivedAt: FieldRef<"Workspace", 'DateTime'>
    readonly templateId: FieldRef<"Workspace", 'String'>
    readonly createdBy: FieldRef<"Workspace", 'String'>
    readonly version: FieldRef<"Workspace", 'Int'>
    readonly createdAt: FieldRef<"Workspace", 'DateTime'>
    readonly updatedAt: FieldRef<"Workspace", 'DateTime'>
  }
    

  // Custom InputTypes
  /**
   * Workspace findUnique
   */
  export type WorkspaceFindUniqueArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Workspace
     */
    select?: WorkspaceSelect<ExtArgs> | null
    /**
     * Omit specific fields from the Workspace
     */
    omit?: WorkspaceOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: WorkspaceInclude<ExtArgs> | null
    /**
     * Filter, which Workspace to fetch.
     */
    where: WorkspaceWhereUniqueInput
  }

  /**
   * Workspace findUniqueOrThrow
   */
  export type WorkspaceFindUniqueOrThrowArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Workspace
     */
    select?: WorkspaceSelect<ExtArgs> | null
    /**
     * Omit specific fields from the Workspace
     */
    omit?: WorkspaceOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: WorkspaceInclude<ExtArgs> | null
    /**
     * Filter, which Workspace to fetch.
     */
    where: WorkspaceWhereUniqueInput
  }

  /**
   * Workspace findFirst
   */
  export type WorkspaceFindFirstArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Workspace
     */
    select?: WorkspaceSelect<ExtArgs> | null
    /**
     * Omit specific fields from the Workspace
     */
    omit?: WorkspaceOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: WorkspaceInclude<ExtArgs> | null
    /**
     * Filter, which Workspace to fetch.
     */
    where?: WorkspaceWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of Workspaces to fetch.
     */
    orderBy?: WorkspaceOrderByWithRelationInput | WorkspaceOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the position for searching for Workspaces.
     */
    cursor?: WorkspaceWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` Workspaces from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` Workspaces.
     */
    skip?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/distinct Distinct Docs}
     * 
     * Filter by unique combinations of Workspaces.
     */
    distinct?: WorkspaceScalarFieldEnum | WorkspaceScalarFieldEnum[]
  }

  /**
   * Workspace findFirstOrThrow
   */
  export type WorkspaceFindFirstOrThrowArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Workspace
     */
    select?: WorkspaceSelect<ExtArgs> | null
    /**
     * Omit specific fields from the Workspace
     */
    omit?: WorkspaceOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: WorkspaceInclude<ExtArgs> | null
    /**
     * Filter, which Workspace to fetch.
     */
    where?: WorkspaceWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of Workspaces to fetch.
     */
    orderBy?: WorkspaceOrderByWithRelationInput | WorkspaceOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the position for searching for Workspaces.
     */
    cursor?: WorkspaceWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` Workspaces from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` Workspaces.
     */
    skip?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/distinct Distinct Docs}
     * 
     * Filter by unique combinations of Workspaces.
     */
    distinct?: WorkspaceScalarFieldEnum | WorkspaceScalarFieldEnum[]
  }

  /**
   * Workspace findMany
   */
  export type WorkspaceFindManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Workspace
     */
    select?: WorkspaceSelect<ExtArgs> | null
    /**
     * Omit specific fields from the Workspace
     */
    omit?: WorkspaceOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: WorkspaceInclude<ExtArgs> | null
    /**
     * Filter, which Workspaces to fetch.
     */
    where?: WorkspaceWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of Workspaces to fetch.
     */
    orderBy?: WorkspaceOrderByWithRelationInput | WorkspaceOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the position for listing Workspaces.
     */
    cursor?: WorkspaceWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` Workspaces from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` Workspaces.
     */
    skip?: number
    distinct?: WorkspaceScalarFieldEnum | WorkspaceScalarFieldEnum[]
  }

  /**
   * Workspace create
   */
  export type WorkspaceCreateArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Workspace
     */
    select?: WorkspaceSelect<ExtArgs> | null
    /**
     * Omit specific fields from the Workspace
     */
    omit?: WorkspaceOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: WorkspaceInclude<ExtArgs> | null
    /**
     * The data needed to create a Workspace.
     */
    data: XOR<WorkspaceCreateInput, WorkspaceUncheckedCreateInput>
  }

  /**
   * Workspace createMany
   */
  export type WorkspaceCreateManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * The data used to create many Workspaces.
     */
    data: WorkspaceCreateManyInput | WorkspaceCreateManyInput[]
    skipDuplicates?: boolean
  }

  /**
   * Workspace createManyAndReturn
   */
  export type WorkspaceCreateManyAndReturnArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Workspace
     */
    select?: WorkspaceSelectCreateManyAndReturn<ExtArgs> | null
    /**
     * Omit specific fields from the Workspace
     */
    omit?: WorkspaceOmit<ExtArgs> | null
    /**
     * The data used to create many Workspaces.
     */
    data: WorkspaceCreateManyInput | WorkspaceCreateManyInput[]
    skipDuplicates?: boolean
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: WorkspaceIncludeCreateManyAndReturn<ExtArgs> | null
  }

  /**
   * Workspace update
   */
  export type WorkspaceUpdateArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Workspace
     */
    select?: WorkspaceSelect<ExtArgs> | null
    /**
     * Omit specific fields from the Workspace
     */
    omit?: WorkspaceOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: WorkspaceInclude<ExtArgs> | null
    /**
     * The data needed to update a Workspace.
     */
    data: XOR<WorkspaceUpdateInput, WorkspaceUncheckedUpdateInput>
    /**
     * Choose, which Workspace to update.
     */
    where: WorkspaceWhereUniqueInput
  }

  /**
   * Workspace updateMany
   */
  export type WorkspaceUpdateManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * The data used to update Workspaces.
     */
    data: XOR<WorkspaceUpdateManyMutationInput, WorkspaceUncheckedUpdateManyInput>
    /**
     * Filter which Workspaces to update
     */
    where?: WorkspaceWhereInput
    /**
     * Limit how many Workspaces to update.
     */
    limit?: number
  }

  /**
   * Workspace updateManyAndReturn
   */
  export type WorkspaceUpdateManyAndReturnArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Workspace
     */
    select?: WorkspaceSelectUpdateManyAndReturn<ExtArgs> | null
    /**
     * Omit specific fields from the Workspace
     */
    omit?: WorkspaceOmit<ExtArgs> | null
    /**
     * The data used to update Workspaces.
     */
    data: XOR<WorkspaceUpdateManyMutationInput, WorkspaceUncheckedUpdateManyInput>
    /**
     * Filter which Workspaces to update
     */
    where?: WorkspaceWhereInput
    /**
     * Limit how many Workspaces to update.
     */
    limit?: number
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: WorkspaceIncludeUpdateManyAndReturn<ExtArgs> | null
  }

  /**
   * Workspace upsert
   */
  export type WorkspaceUpsertArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Workspace
     */
    select?: WorkspaceSelect<ExtArgs> | null
    /**
     * Omit specific fields from the Workspace
     */
    omit?: WorkspaceOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: WorkspaceInclude<ExtArgs> | null
    /**
     * The filter to search for the Workspace to update in case it exists.
     */
    where: WorkspaceWhereUniqueInput
    /**
     * In case the Workspace found by the `where` argument doesn't exist, create a new Workspace with this data.
     */
    create: XOR<WorkspaceCreateInput, WorkspaceUncheckedCreateInput>
    /**
     * In case the Workspace was found with the provided `where` argument, update it with this data.
     */
    update: XOR<WorkspaceUpdateInput, WorkspaceUncheckedUpdateInput>
  }

  /**
   * Workspace delete
   */
  export type WorkspaceDeleteArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Workspace
     */
    select?: WorkspaceSelect<ExtArgs> | null
    /**
     * Omit specific fields from the Workspace
     */
    omit?: WorkspaceOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: WorkspaceInclude<ExtArgs> | null
    /**
     * Filter which Workspace to delete.
     */
    where: WorkspaceWhereUniqueInput
  }

  /**
   * Workspace deleteMany
   */
  export type WorkspaceDeleteManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Filter which Workspaces to delete
     */
    where?: WorkspaceWhereInput
    /**
     * Limit how many Workspaces to delete.
     */
    limit?: number
  }

  /**
   * Workspace.parent
   */
  export type Workspace$parentArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Workspace
     */
    select?: WorkspaceSelect<ExtArgs> | null
    /**
     * Omit specific fields from the Workspace
     */
    omit?: WorkspaceOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: WorkspaceInclude<ExtArgs> | null
    where?: WorkspaceWhereInput
  }

  /**
   * Workspace.children
   */
  export type Workspace$childrenArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Workspace
     */
    select?: WorkspaceSelect<ExtArgs> | null
    /**
     * Omit specific fields from the Workspace
     */
    omit?: WorkspaceOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: WorkspaceInclude<ExtArgs> | null
    where?: WorkspaceWhereInput
    orderBy?: WorkspaceOrderByWithRelationInput | WorkspaceOrderByWithRelationInput[]
    cursor?: WorkspaceWhereUniqueInput
    take?: number
    skip?: number
    distinct?: WorkspaceScalarFieldEnum | WorkspaceScalarFieldEnum[]
  }

  /**
   * Workspace.template
   */
  export type Workspace$templateArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the WorkspaceTemplate
     */
    select?: WorkspaceTemplateSelect<ExtArgs> | null
    /**
     * Omit specific fields from the WorkspaceTemplate
     */
    omit?: WorkspaceTemplateOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: WorkspaceTemplateInclude<ExtArgs> | null
    where?: WorkspaceTemplateWhereInput
  }

  /**
   * Workspace.members
   */
  export type Workspace$membersArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the WorkspaceMember
     */
    select?: WorkspaceMemberSelect<ExtArgs> | null
    /**
     * Omit specific fields from the WorkspaceMember
     */
    omit?: WorkspaceMemberOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: WorkspaceMemberInclude<ExtArgs> | null
    where?: WorkspaceMemberWhereInput
    orderBy?: WorkspaceMemberOrderByWithRelationInput | WorkspaceMemberOrderByWithRelationInput[]
    cursor?: WorkspaceMemberWhereUniqueInput
    take?: number
    skip?: number
    distinct?: WorkspaceMemberScalarFieldEnum | WorkspaceMemberScalarFieldEnum[]
  }

  /**
   * Workspace.invitations
   */
  export type Workspace$invitationsArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Invitation
     */
    select?: InvitationSelect<ExtArgs> | null
    /**
     * Omit specific fields from the Invitation
     */
    omit?: InvitationOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: InvitationInclude<ExtArgs> | null
    where?: InvitationWhereInput
    orderBy?: InvitationOrderByWithRelationInput | InvitationOrderByWithRelationInput[]
    cursor?: InvitationWhereUniqueInput
    take?: number
    skip?: number
    distinct?: InvitationScalarFieldEnum | InvitationScalarFieldEnum[]
  }

  /**
   * Workspace.roleActions
   */
  export type Workspace$roleActionsArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the WorkspaceRoleAction
     */
    select?: WorkspaceRoleActionSelect<ExtArgs> | null
    /**
     * Omit specific fields from the WorkspaceRoleAction
     */
    omit?: WorkspaceRoleActionOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: WorkspaceRoleActionInclude<ExtArgs> | null
    where?: WorkspaceRoleActionWhereInput
    orderBy?: WorkspaceRoleActionOrderByWithRelationInput | WorkspaceRoleActionOrderByWithRelationInput[]
    cursor?: WorkspaceRoleActionWhereUniqueInput
    take?: number
    skip?: number
    distinct?: WorkspaceRoleActionScalarFieldEnum | WorkspaceRoleActionScalarFieldEnum[]
  }

  /**
   * Workspace without action
   */
  export type WorkspaceDefaultArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Workspace
     */
    select?: WorkspaceSelect<ExtArgs> | null
    /**
     * Omit specific fields from the Workspace
     */
    omit?: WorkspaceOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: WorkspaceInclude<ExtArgs> | null
  }


  /**
   * Model WorkspaceMember
   */

  export type AggregateWorkspaceMember = {
    _count: WorkspaceMemberCountAggregateOutputType | null
    _min: WorkspaceMemberMinAggregateOutputType | null
    _max: WorkspaceMemberMaxAggregateOutputType | null
  }

  export type WorkspaceMemberMinAggregateOutputType = {
    id: string | null
    workspaceId: string | null
    userId: string | null
    role: string | null
    createdAt: Date | null
  }

  export type WorkspaceMemberMaxAggregateOutputType = {
    id: string | null
    workspaceId: string | null
    userId: string | null
    role: string | null
    createdAt: Date | null
  }

  export type WorkspaceMemberCountAggregateOutputType = {
    id: number
    workspaceId: number
    userId: number
    role: number
    createdAt: number
    _all: number
  }


  export type WorkspaceMemberMinAggregateInputType = {
    id?: true
    workspaceId?: true
    userId?: true
    role?: true
    createdAt?: true
  }

  export type WorkspaceMemberMaxAggregateInputType = {
    id?: true
    workspaceId?: true
    userId?: true
    role?: true
    createdAt?: true
  }

  export type WorkspaceMemberCountAggregateInputType = {
    id?: true
    workspaceId?: true
    userId?: true
    role?: true
    createdAt?: true
    _all?: true
  }

  export type WorkspaceMemberAggregateArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Filter which WorkspaceMember to aggregate.
     */
    where?: WorkspaceMemberWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of WorkspaceMembers to fetch.
     */
    orderBy?: WorkspaceMemberOrderByWithRelationInput | WorkspaceMemberOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the start position
     */
    cursor?: WorkspaceMemberWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` WorkspaceMembers from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` WorkspaceMembers.
     */
    skip?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Count returned WorkspaceMembers
    **/
    _count?: true | WorkspaceMemberCountAggregateInputType
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Select which fields to find the minimum value
    **/
    _min?: WorkspaceMemberMinAggregateInputType
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Select which fields to find the maximum value
    **/
    _max?: WorkspaceMemberMaxAggregateInputType
  }

  export type GetWorkspaceMemberAggregateType<T extends WorkspaceMemberAggregateArgs> = {
        [P in keyof T & keyof AggregateWorkspaceMember]: P extends '_count' | 'count'
      ? T[P] extends true
        ? number
        : GetScalarType<T[P], AggregateWorkspaceMember[P]>
      : GetScalarType<T[P], AggregateWorkspaceMember[P]>
  }




  export type WorkspaceMemberGroupByArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    where?: WorkspaceMemberWhereInput
    orderBy?: WorkspaceMemberOrderByWithAggregationInput | WorkspaceMemberOrderByWithAggregationInput[]
    by: WorkspaceMemberScalarFieldEnum[] | WorkspaceMemberScalarFieldEnum
    having?: WorkspaceMemberScalarWhereWithAggregatesInput
    take?: number
    skip?: number
    _count?: WorkspaceMemberCountAggregateInputType | true
    _min?: WorkspaceMemberMinAggregateInputType
    _max?: WorkspaceMemberMaxAggregateInputType
  }

  export type WorkspaceMemberGroupByOutputType = {
    id: string
    workspaceId: string
    userId: string
    role: string
    createdAt: Date
    _count: WorkspaceMemberCountAggregateOutputType | null
    _min: WorkspaceMemberMinAggregateOutputType | null
    _max: WorkspaceMemberMaxAggregateOutputType | null
  }

  type GetWorkspaceMemberGroupByPayload<T extends WorkspaceMemberGroupByArgs> = Prisma.PrismaPromise<
    Array<
      PickEnumerable<WorkspaceMemberGroupByOutputType, T['by']> &
        {
          [P in ((keyof T) & (keyof WorkspaceMemberGroupByOutputType))]: P extends '_count'
            ? T[P] extends boolean
              ? number
              : GetScalarType<T[P], WorkspaceMemberGroupByOutputType[P]>
            : GetScalarType<T[P], WorkspaceMemberGroupByOutputType[P]>
        }
      >
    >


  export type WorkspaceMemberSelect<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetSelect<{
    id?: boolean
    workspaceId?: boolean
    userId?: boolean
    role?: boolean
    createdAt?: boolean
    workspace?: boolean | WorkspaceDefaultArgs<ExtArgs>
    user?: boolean | UserProfileDefaultArgs<ExtArgs>
  }, ExtArgs["result"]["workspaceMember"]>

  export type WorkspaceMemberSelectCreateManyAndReturn<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetSelect<{
    id?: boolean
    workspaceId?: boolean
    userId?: boolean
    role?: boolean
    createdAt?: boolean
    workspace?: boolean | WorkspaceDefaultArgs<ExtArgs>
    user?: boolean | UserProfileDefaultArgs<ExtArgs>
  }, ExtArgs["result"]["workspaceMember"]>

  export type WorkspaceMemberSelectUpdateManyAndReturn<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetSelect<{
    id?: boolean
    workspaceId?: boolean
    userId?: boolean
    role?: boolean
    createdAt?: boolean
    workspace?: boolean | WorkspaceDefaultArgs<ExtArgs>
    user?: boolean | UserProfileDefaultArgs<ExtArgs>
  }, ExtArgs["result"]["workspaceMember"]>

  export type WorkspaceMemberSelectScalar = {
    id?: boolean
    workspaceId?: boolean
    userId?: boolean
    role?: boolean
    createdAt?: boolean
  }

  export type WorkspaceMemberOmit<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetOmit<"id" | "workspaceId" | "userId" | "role" | "createdAt", ExtArgs["result"]["workspaceMember"]>
  export type WorkspaceMemberInclude<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    workspace?: boolean | WorkspaceDefaultArgs<ExtArgs>
    user?: boolean | UserProfileDefaultArgs<ExtArgs>
  }
  export type WorkspaceMemberIncludeCreateManyAndReturn<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    workspace?: boolean | WorkspaceDefaultArgs<ExtArgs>
    user?: boolean | UserProfileDefaultArgs<ExtArgs>
  }
  export type WorkspaceMemberIncludeUpdateManyAndReturn<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    workspace?: boolean | WorkspaceDefaultArgs<ExtArgs>
    user?: boolean | UserProfileDefaultArgs<ExtArgs>
  }

  export type $WorkspaceMemberPayload<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    name: "WorkspaceMember"
    objects: {
      workspace: Prisma.$WorkspacePayload<ExtArgs>
      user: Prisma.$UserProfilePayload<ExtArgs>
    }
    scalars: $Extensions.GetPayloadResult<{
      id: string
      workspaceId: string
      userId: string
      role: string
      createdAt: Date
    }, ExtArgs["result"]["workspaceMember"]>
    composites: {}
  }

  type WorkspaceMemberGetPayload<S extends boolean | null | undefined | WorkspaceMemberDefaultArgs> = $Result.GetResult<Prisma.$WorkspaceMemberPayload, S>

  type WorkspaceMemberCountArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> =
    Omit<WorkspaceMemberFindManyArgs, 'select' | 'include' | 'distinct' | 'omit'> & {
      select?: WorkspaceMemberCountAggregateInputType | true
    }

  export interface WorkspaceMemberDelegate<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs, GlobalOmitOptions = {}> {
    [K: symbol]: { types: Prisma.TypeMap<ExtArgs>['model']['WorkspaceMember'], meta: { name: 'WorkspaceMember' } }
    /**
     * Find zero or one WorkspaceMember that matches the filter.
     * @param {WorkspaceMemberFindUniqueArgs} args - Arguments to find a WorkspaceMember
     * @example
     * // Get one WorkspaceMember
     * const workspaceMember = await prisma.workspaceMember.findUnique({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findUnique<T extends WorkspaceMemberFindUniqueArgs>(args: SelectSubset<T, WorkspaceMemberFindUniqueArgs<ExtArgs>>): Prisma__WorkspaceMemberClient<$Result.GetResult<Prisma.$WorkspaceMemberPayload<ExtArgs>, T, "findUnique", GlobalOmitOptions> | null, null, ExtArgs, GlobalOmitOptions>

    /**
     * Find one WorkspaceMember that matches the filter or throw an error with `error.code='P2025'`
     * if no matches were found.
     * @param {WorkspaceMemberFindUniqueOrThrowArgs} args - Arguments to find a WorkspaceMember
     * @example
     * // Get one WorkspaceMember
     * const workspaceMember = await prisma.workspaceMember.findUniqueOrThrow({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findUniqueOrThrow<T extends WorkspaceMemberFindUniqueOrThrowArgs>(args: SelectSubset<T, WorkspaceMemberFindUniqueOrThrowArgs<ExtArgs>>): Prisma__WorkspaceMemberClient<$Result.GetResult<Prisma.$WorkspaceMemberPayload<ExtArgs>, T, "findUniqueOrThrow", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Find the first WorkspaceMember that matches the filter.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {WorkspaceMemberFindFirstArgs} args - Arguments to find a WorkspaceMember
     * @example
     * // Get one WorkspaceMember
     * const workspaceMember = await prisma.workspaceMember.findFirst({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findFirst<T extends WorkspaceMemberFindFirstArgs>(args?: SelectSubset<T, WorkspaceMemberFindFirstArgs<ExtArgs>>): Prisma__WorkspaceMemberClient<$Result.GetResult<Prisma.$WorkspaceMemberPayload<ExtArgs>, T, "findFirst", GlobalOmitOptions> | null, null, ExtArgs, GlobalOmitOptions>

    /**
     * Find the first WorkspaceMember that matches the filter or
     * throw `PrismaKnownClientError` with `P2025` code if no matches were found.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {WorkspaceMemberFindFirstOrThrowArgs} args - Arguments to find a WorkspaceMember
     * @example
     * // Get one WorkspaceMember
     * const workspaceMember = await prisma.workspaceMember.findFirstOrThrow({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findFirstOrThrow<T extends WorkspaceMemberFindFirstOrThrowArgs>(args?: SelectSubset<T, WorkspaceMemberFindFirstOrThrowArgs<ExtArgs>>): Prisma__WorkspaceMemberClient<$Result.GetResult<Prisma.$WorkspaceMemberPayload<ExtArgs>, T, "findFirstOrThrow", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Find zero or more WorkspaceMembers that matches the filter.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {WorkspaceMemberFindManyArgs} args - Arguments to filter and select certain fields only.
     * @example
     * // Get all WorkspaceMembers
     * const workspaceMembers = await prisma.workspaceMember.findMany()
     * 
     * // Get first 10 WorkspaceMembers
     * const workspaceMembers = await prisma.workspaceMember.findMany({ take: 10 })
     * 
     * // Only select the `id`
     * const workspaceMemberWithIdOnly = await prisma.workspaceMember.findMany({ select: { id: true } })
     * 
     */
    findMany<T extends WorkspaceMemberFindManyArgs>(args?: SelectSubset<T, WorkspaceMemberFindManyArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$WorkspaceMemberPayload<ExtArgs>, T, "findMany", GlobalOmitOptions>>

    /**
     * Create a WorkspaceMember.
     * @param {WorkspaceMemberCreateArgs} args - Arguments to create a WorkspaceMember.
     * @example
     * // Create one WorkspaceMember
     * const WorkspaceMember = await prisma.workspaceMember.create({
     *   data: {
     *     // ... data to create a WorkspaceMember
     *   }
     * })
     * 
     */
    create<T extends WorkspaceMemberCreateArgs>(args: SelectSubset<T, WorkspaceMemberCreateArgs<ExtArgs>>): Prisma__WorkspaceMemberClient<$Result.GetResult<Prisma.$WorkspaceMemberPayload<ExtArgs>, T, "create", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Create many WorkspaceMembers.
     * @param {WorkspaceMemberCreateManyArgs} args - Arguments to create many WorkspaceMembers.
     * @example
     * // Create many WorkspaceMembers
     * const workspaceMember = await prisma.workspaceMember.createMany({
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     *     
     */
    createMany<T extends WorkspaceMemberCreateManyArgs>(args?: SelectSubset<T, WorkspaceMemberCreateManyArgs<ExtArgs>>): Prisma.PrismaPromise<BatchPayload>

    /**
     * Create many WorkspaceMembers and returns the data saved in the database.
     * @param {WorkspaceMemberCreateManyAndReturnArgs} args - Arguments to create many WorkspaceMembers.
     * @example
     * // Create many WorkspaceMembers
     * const workspaceMember = await prisma.workspaceMember.createManyAndReturn({
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * 
     * // Create many WorkspaceMembers and only return the `id`
     * const workspaceMemberWithIdOnly = await prisma.workspaceMember.createManyAndReturn({
     *   select: { id: true },
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * 
     */
    createManyAndReturn<T extends WorkspaceMemberCreateManyAndReturnArgs>(args?: SelectSubset<T, WorkspaceMemberCreateManyAndReturnArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$WorkspaceMemberPayload<ExtArgs>, T, "createManyAndReturn", GlobalOmitOptions>>

    /**
     * Delete a WorkspaceMember.
     * @param {WorkspaceMemberDeleteArgs} args - Arguments to delete one WorkspaceMember.
     * @example
     * // Delete one WorkspaceMember
     * const WorkspaceMember = await prisma.workspaceMember.delete({
     *   where: {
     *     // ... filter to delete one WorkspaceMember
     *   }
     * })
     * 
     */
    delete<T extends WorkspaceMemberDeleteArgs>(args: SelectSubset<T, WorkspaceMemberDeleteArgs<ExtArgs>>): Prisma__WorkspaceMemberClient<$Result.GetResult<Prisma.$WorkspaceMemberPayload<ExtArgs>, T, "delete", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Update one WorkspaceMember.
     * @param {WorkspaceMemberUpdateArgs} args - Arguments to update one WorkspaceMember.
     * @example
     * // Update one WorkspaceMember
     * const workspaceMember = await prisma.workspaceMember.update({
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: {
     *     // ... provide data here
     *   }
     * })
     * 
     */
    update<T extends WorkspaceMemberUpdateArgs>(args: SelectSubset<T, WorkspaceMemberUpdateArgs<ExtArgs>>): Prisma__WorkspaceMemberClient<$Result.GetResult<Prisma.$WorkspaceMemberPayload<ExtArgs>, T, "update", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Delete zero or more WorkspaceMembers.
     * @param {WorkspaceMemberDeleteManyArgs} args - Arguments to filter WorkspaceMembers to delete.
     * @example
     * // Delete a few WorkspaceMembers
     * const { count } = await prisma.workspaceMember.deleteMany({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     * 
     */
    deleteMany<T extends WorkspaceMemberDeleteManyArgs>(args?: SelectSubset<T, WorkspaceMemberDeleteManyArgs<ExtArgs>>): Prisma.PrismaPromise<BatchPayload>

    /**
     * Update zero or more WorkspaceMembers.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {WorkspaceMemberUpdateManyArgs} args - Arguments to update one or more rows.
     * @example
     * // Update many WorkspaceMembers
     * const workspaceMember = await prisma.workspaceMember.updateMany({
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: {
     *     // ... provide data here
     *   }
     * })
     * 
     */
    updateMany<T extends WorkspaceMemberUpdateManyArgs>(args: SelectSubset<T, WorkspaceMemberUpdateManyArgs<ExtArgs>>): Prisma.PrismaPromise<BatchPayload>

    /**
     * Update zero or more WorkspaceMembers and returns the data updated in the database.
     * @param {WorkspaceMemberUpdateManyAndReturnArgs} args - Arguments to update many WorkspaceMembers.
     * @example
     * // Update many WorkspaceMembers
     * const workspaceMember = await prisma.workspaceMember.updateManyAndReturn({
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * 
     * // Update zero or more WorkspaceMembers and only return the `id`
     * const workspaceMemberWithIdOnly = await prisma.workspaceMember.updateManyAndReturn({
     *   select: { id: true },
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * 
     */
    updateManyAndReturn<T extends WorkspaceMemberUpdateManyAndReturnArgs>(args: SelectSubset<T, WorkspaceMemberUpdateManyAndReturnArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$WorkspaceMemberPayload<ExtArgs>, T, "updateManyAndReturn", GlobalOmitOptions>>

    /**
     * Create or update one WorkspaceMember.
     * @param {WorkspaceMemberUpsertArgs} args - Arguments to update or create a WorkspaceMember.
     * @example
     * // Update or create a WorkspaceMember
     * const workspaceMember = await prisma.workspaceMember.upsert({
     *   create: {
     *     // ... data to create a WorkspaceMember
     *   },
     *   update: {
     *     // ... in case it already exists, update
     *   },
     *   where: {
     *     // ... the filter for the WorkspaceMember we want to update
     *   }
     * })
     */
    upsert<T extends WorkspaceMemberUpsertArgs>(args: SelectSubset<T, WorkspaceMemberUpsertArgs<ExtArgs>>): Prisma__WorkspaceMemberClient<$Result.GetResult<Prisma.$WorkspaceMemberPayload<ExtArgs>, T, "upsert", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>


    /**
     * Count the number of WorkspaceMembers.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {WorkspaceMemberCountArgs} args - Arguments to filter WorkspaceMembers to count.
     * @example
     * // Count the number of WorkspaceMembers
     * const count = await prisma.workspaceMember.count({
     *   where: {
     *     // ... the filter for the WorkspaceMembers we want to count
     *   }
     * })
    **/
    count<T extends WorkspaceMemberCountArgs>(
      args?: Subset<T, WorkspaceMemberCountArgs>,
    ): Prisma.PrismaPromise<
      T extends $Utils.Record<'select', any>
        ? T['select'] extends true
          ? number
          : GetScalarType<T['select'], WorkspaceMemberCountAggregateOutputType>
        : number
    >

    /**
     * Allows you to perform aggregations operations on a WorkspaceMember.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {WorkspaceMemberAggregateArgs} args - Select which aggregations you would like to apply and on what fields.
     * @example
     * // Ordered by age ascending
     * // Where email contains prisma.io
     * // Limited to the 10 users
     * const aggregations = await prisma.user.aggregate({
     *   _avg: {
     *     age: true,
     *   },
     *   where: {
     *     email: {
     *       contains: "prisma.io",
     *     },
     *   },
     *   orderBy: {
     *     age: "asc",
     *   },
     *   take: 10,
     * })
    **/
    aggregate<T extends WorkspaceMemberAggregateArgs>(args: Subset<T, WorkspaceMemberAggregateArgs>): Prisma.PrismaPromise<GetWorkspaceMemberAggregateType<T>>

    /**
     * Group by WorkspaceMember.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {WorkspaceMemberGroupByArgs} args - Group by arguments.
     * @example
     * // Group by city, order by createdAt, get count
     * const result = await prisma.user.groupBy({
     *   by: ['city', 'createdAt'],
     *   orderBy: {
     *     createdAt: true
     *   },
     *   _count: {
     *     _all: true
     *   },
     * })
     * 
    **/
    groupBy<
      T extends WorkspaceMemberGroupByArgs,
      HasSelectOrTake extends Or<
        Extends<'skip', Keys<T>>,
        Extends<'take', Keys<T>>
      >,
      OrderByArg extends True extends HasSelectOrTake
        ? { orderBy: WorkspaceMemberGroupByArgs['orderBy'] }
        : { orderBy?: WorkspaceMemberGroupByArgs['orderBy'] },
      OrderFields extends ExcludeUnderscoreKeys<Keys<MaybeTupleToUnion<T['orderBy']>>>,
      ByFields extends MaybeTupleToUnion<T['by']>,
      ByValid extends Has<ByFields, OrderFields>,
      HavingFields extends GetHavingFields<T['having']>,
      HavingValid extends Has<ByFields, HavingFields>,
      ByEmpty extends T['by'] extends never[] ? True : False,
      InputErrors extends ByEmpty extends True
      ? `Error: "by" must not be empty.`
      : HavingValid extends False
      ? {
          [P in HavingFields]: P extends ByFields
            ? never
            : P extends string
            ? `Error: Field "${P}" used in "having" needs to be provided in "by".`
            : [
                Error,
                'Field ',
                P,
                ` in "having" needs to be provided in "by"`,
              ]
        }[HavingFields]
      : 'take' extends Keys<T>
      ? 'orderBy' extends Keys<T>
        ? ByValid extends True
          ? {}
          : {
              [P in OrderFields]: P extends ByFields
                ? never
                : `Error: Field "${P}" in "orderBy" needs to be provided in "by"`
            }[OrderFields]
        : 'Error: If you provide "take", you also need to provide "orderBy"'
      : 'skip' extends Keys<T>
      ? 'orderBy' extends Keys<T>
        ? ByValid extends True
          ? {}
          : {
              [P in OrderFields]: P extends ByFields
                ? never
                : `Error: Field "${P}" in "orderBy" needs to be provided in "by"`
            }[OrderFields]
        : 'Error: If you provide "skip", you also need to provide "orderBy"'
      : ByValid extends True
      ? {}
      : {
          [P in OrderFields]: P extends ByFields
            ? never
            : `Error: Field "${P}" in "orderBy" needs to be provided in "by"`
        }[OrderFields]
    >(args: SubsetIntersection<T, WorkspaceMemberGroupByArgs, OrderByArg> & InputErrors): {} extends InputErrors ? GetWorkspaceMemberGroupByPayload<T> : Prisma.PrismaPromise<InputErrors>
  /**
   * Fields of the WorkspaceMember model
   */
  readonly fields: WorkspaceMemberFieldRefs;
  }

  /**
   * The delegate class that acts as a "Promise-like" for WorkspaceMember.
   * Why is this prefixed with `Prisma__`?
   * Because we want to prevent naming conflicts as mentioned in
   * https://github.com/prisma/prisma-client-js/issues/707
   */
  export interface Prisma__WorkspaceMemberClient<T, Null = never, ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs, GlobalOmitOptions = {}> extends Prisma.PrismaPromise<T> {
    readonly [Symbol.toStringTag]: "PrismaPromise"
    workspace<T extends WorkspaceDefaultArgs<ExtArgs> = {}>(args?: Subset<T, WorkspaceDefaultArgs<ExtArgs>>): Prisma__WorkspaceClient<$Result.GetResult<Prisma.$WorkspacePayload<ExtArgs>, T, "findUniqueOrThrow", GlobalOmitOptions> | Null, Null, ExtArgs, GlobalOmitOptions>
    user<T extends UserProfileDefaultArgs<ExtArgs> = {}>(args?: Subset<T, UserProfileDefaultArgs<ExtArgs>>): Prisma__UserProfileClient<$Result.GetResult<Prisma.$UserProfilePayload<ExtArgs>, T, "findUniqueOrThrow", GlobalOmitOptions> | Null, Null, ExtArgs, GlobalOmitOptions>
    /**
     * Attaches callbacks for the resolution and/or rejection of the Promise.
     * @param onfulfilled The callback to execute when the Promise is resolved.
     * @param onrejected The callback to execute when the Promise is rejected.
     * @returns A Promise for the completion of which ever callback is executed.
     */
    then<TResult1 = T, TResult2 = never>(onfulfilled?: ((value: T) => TResult1 | PromiseLike<TResult1>) | undefined | null, onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | undefined | null): $Utils.JsPromise<TResult1 | TResult2>
    /**
     * Attaches a callback for only the rejection of the Promise.
     * @param onrejected The callback to execute when the Promise is rejected.
     * @returns A Promise for the completion of the callback.
     */
    catch<TResult = never>(onrejected?: ((reason: any) => TResult | PromiseLike<TResult>) | undefined | null): $Utils.JsPromise<T | TResult>
    /**
     * Attaches a callback that is invoked when the Promise is settled (fulfilled or rejected). The
     * resolved value cannot be modified from the callback.
     * @param onfinally The callback to execute when the Promise is settled (fulfilled or rejected).
     * @returns A Promise for the completion of the callback.
     */
    finally(onfinally?: (() => void) | undefined | null): $Utils.JsPromise<T>
  }




  /**
   * Fields of the WorkspaceMember model
   */
  interface WorkspaceMemberFieldRefs {
    readonly id: FieldRef<"WorkspaceMember", 'String'>
    readonly workspaceId: FieldRef<"WorkspaceMember", 'String'>
    readonly userId: FieldRef<"WorkspaceMember", 'String'>
    readonly role: FieldRef<"WorkspaceMember", 'String'>
    readonly createdAt: FieldRef<"WorkspaceMember", 'DateTime'>
  }
    

  // Custom InputTypes
  /**
   * WorkspaceMember findUnique
   */
  export type WorkspaceMemberFindUniqueArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the WorkspaceMember
     */
    select?: WorkspaceMemberSelect<ExtArgs> | null
    /**
     * Omit specific fields from the WorkspaceMember
     */
    omit?: WorkspaceMemberOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: WorkspaceMemberInclude<ExtArgs> | null
    /**
     * Filter, which WorkspaceMember to fetch.
     */
    where: WorkspaceMemberWhereUniqueInput
  }

  /**
   * WorkspaceMember findUniqueOrThrow
   */
  export type WorkspaceMemberFindUniqueOrThrowArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the WorkspaceMember
     */
    select?: WorkspaceMemberSelect<ExtArgs> | null
    /**
     * Omit specific fields from the WorkspaceMember
     */
    omit?: WorkspaceMemberOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: WorkspaceMemberInclude<ExtArgs> | null
    /**
     * Filter, which WorkspaceMember to fetch.
     */
    where: WorkspaceMemberWhereUniqueInput
  }

  /**
   * WorkspaceMember findFirst
   */
  export type WorkspaceMemberFindFirstArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the WorkspaceMember
     */
    select?: WorkspaceMemberSelect<ExtArgs> | null
    /**
     * Omit specific fields from the WorkspaceMember
     */
    omit?: WorkspaceMemberOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: WorkspaceMemberInclude<ExtArgs> | null
    /**
     * Filter, which WorkspaceMember to fetch.
     */
    where?: WorkspaceMemberWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of WorkspaceMembers to fetch.
     */
    orderBy?: WorkspaceMemberOrderByWithRelationInput | WorkspaceMemberOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the position for searching for WorkspaceMembers.
     */
    cursor?: WorkspaceMemberWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` WorkspaceMembers from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` WorkspaceMembers.
     */
    skip?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/distinct Distinct Docs}
     * 
     * Filter by unique combinations of WorkspaceMembers.
     */
    distinct?: WorkspaceMemberScalarFieldEnum | WorkspaceMemberScalarFieldEnum[]
  }

  /**
   * WorkspaceMember findFirstOrThrow
   */
  export type WorkspaceMemberFindFirstOrThrowArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the WorkspaceMember
     */
    select?: WorkspaceMemberSelect<ExtArgs> | null
    /**
     * Omit specific fields from the WorkspaceMember
     */
    omit?: WorkspaceMemberOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: WorkspaceMemberInclude<ExtArgs> | null
    /**
     * Filter, which WorkspaceMember to fetch.
     */
    where?: WorkspaceMemberWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of WorkspaceMembers to fetch.
     */
    orderBy?: WorkspaceMemberOrderByWithRelationInput | WorkspaceMemberOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the position for searching for WorkspaceMembers.
     */
    cursor?: WorkspaceMemberWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` WorkspaceMembers from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` WorkspaceMembers.
     */
    skip?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/distinct Distinct Docs}
     * 
     * Filter by unique combinations of WorkspaceMembers.
     */
    distinct?: WorkspaceMemberScalarFieldEnum | WorkspaceMemberScalarFieldEnum[]
  }

  /**
   * WorkspaceMember findMany
   */
  export type WorkspaceMemberFindManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the WorkspaceMember
     */
    select?: WorkspaceMemberSelect<ExtArgs> | null
    /**
     * Omit specific fields from the WorkspaceMember
     */
    omit?: WorkspaceMemberOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: WorkspaceMemberInclude<ExtArgs> | null
    /**
     * Filter, which WorkspaceMembers to fetch.
     */
    where?: WorkspaceMemberWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of WorkspaceMembers to fetch.
     */
    orderBy?: WorkspaceMemberOrderByWithRelationInput | WorkspaceMemberOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the position for listing WorkspaceMembers.
     */
    cursor?: WorkspaceMemberWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` WorkspaceMembers from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` WorkspaceMembers.
     */
    skip?: number
    distinct?: WorkspaceMemberScalarFieldEnum | WorkspaceMemberScalarFieldEnum[]
  }

  /**
   * WorkspaceMember create
   */
  export type WorkspaceMemberCreateArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the WorkspaceMember
     */
    select?: WorkspaceMemberSelect<ExtArgs> | null
    /**
     * Omit specific fields from the WorkspaceMember
     */
    omit?: WorkspaceMemberOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: WorkspaceMemberInclude<ExtArgs> | null
    /**
     * The data needed to create a WorkspaceMember.
     */
    data: XOR<WorkspaceMemberCreateInput, WorkspaceMemberUncheckedCreateInput>
  }

  /**
   * WorkspaceMember createMany
   */
  export type WorkspaceMemberCreateManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * The data used to create many WorkspaceMembers.
     */
    data: WorkspaceMemberCreateManyInput | WorkspaceMemberCreateManyInput[]
    skipDuplicates?: boolean
  }

  /**
   * WorkspaceMember createManyAndReturn
   */
  export type WorkspaceMemberCreateManyAndReturnArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the WorkspaceMember
     */
    select?: WorkspaceMemberSelectCreateManyAndReturn<ExtArgs> | null
    /**
     * Omit specific fields from the WorkspaceMember
     */
    omit?: WorkspaceMemberOmit<ExtArgs> | null
    /**
     * The data used to create many WorkspaceMembers.
     */
    data: WorkspaceMemberCreateManyInput | WorkspaceMemberCreateManyInput[]
    skipDuplicates?: boolean
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: WorkspaceMemberIncludeCreateManyAndReturn<ExtArgs> | null
  }

  /**
   * WorkspaceMember update
   */
  export type WorkspaceMemberUpdateArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the WorkspaceMember
     */
    select?: WorkspaceMemberSelect<ExtArgs> | null
    /**
     * Omit specific fields from the WorkspaceMember
     */
    omit?: WorkspaceMemberOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: WorkspaceMemberInclude<ExtArgs> | null
    /**
     * The data needed to update a WorkspaceMember.
     */
    data: XOR<WorkspaceMemberUpdateInput, WorkspaceMemberUncheckedUpdateInput>
    /**
     * Choose, which WorkspaceMember to update.
     */
    where: WorkspaceMemberWhereUniqueInput
  }

  /**
   * WorkspaceMember updateMany
   */
  export type WorkspaceMemberUpdateManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * The data used to update WorkspaceMembers.
     */
    data: XOR<WorkspaceMemberUpdateManyMutationInput, WorkspaceMemberUncheckedUpdateManyInput>
    /**
     * Filter which WorkspaceMembers to update
     */
    where?: WorkspaceMemberWhereInput
    /**
     * Limit how many WorkspaceMembers to update.
     */
    limit?: number
  }

  /**
   * WorkspaceMember updateManyAndReturn
   */
  export type WorkspaceMemberUpdateManyAndReturnArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the WorkspaceMember
     */
    select?: WorkspaceMemberSelectUpdateManyAndReturn<ExtArgs> | null
    /**
     * Omit specific fields from the WorkspaceMember
     */
    omit?: WorkspaceMemberOmit<ExtArgs> | null
    /**
     * The data used to update WorkspaceMembers.
     */
    data: XOR<WorkspaceMemberUpdateManyMutationInput, WorkspaceMemberUncheckedUpdateManyInput>
    /**
     * Filter which WorkspaceMembers to update
     */
    where?: WorkspaceMemberWhereInput
    /**
     * Limit how many WorkspaceMembers to update.
     */
    limit?: number
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: WorkspaceMemberIncludeUpdateManyAndReturn<ExtArgs> | null
  }

  /**
   * WorkspaceMember upsert
   */
  export type WorkspaceMemberUpsertArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the WorkspaceMember
     */
    select?: WorkspaceMemberSelect<ExtArgs> | null
    /**
     * Omit specific fields from the WorkspaceMember
     */
    omit?: WorkspaceMemberOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: WorkspaceMemberInclude<ExtArgs> | null
    /**
     * The filter to search for the WorkspaceMember to update in case it exists.
     */
    where: WorkspaceMemberWhereUniqueInput
    /**
     * In case the WorkspaceMember found by the `where` argument doesn't exist, create a new WorkspaceMember with this data.
     */
    create: XOR<WorkspaceMemberCreateInput, WorkspaceMemberUncheckedCreateInput>
    /**
     * In case the WorkspaceMember was found with the provided `where` argument, update it with this data.
     */
    update: XOR<WorkspaceMemberUpdateInput, WorkspaceMemberUncheckedUpdateInput>
  }

  /**
   * WorkspaceMember delete
   */
  export type WorkspaceMemberDeleteArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the WorkspaceMember
     */
    select?: WorkspaceMemberSelect<ExtArgs> | null
    /**
     * Omit specific fields from the WorkspaceMember
     */
    omit?: WorkspaceMemberOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: WorkspaceMemberInclude<ExtArgs> | null
    /**
     * Filter which WorkspaceMember to delete.
     */
    where: WorkspaceMemberWhereUniqueInput
  }

  /**
   * WorkspaceMember deleteMany
   */
  export type WorkspaceMemberDeleteManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Filter which WorkspaceMembers to delete
     */
    where?: WorkspaceMemberWhereInput
    /**
     * Limit how many WorkspaceMembers to delete.
     */
    limit?: number
  }

  /**
   * WorkspaceMember without action
   */
  export type WorkspaceMemberDefaultArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the WorkspaceMember
     */
    select?: WorkspaceMemberSelect<ExtArgs> | null
    /**
     * Omit specific fields from the WorkspaceMember
     */
    omit?: WorkspaceMemberOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: WorkspaceMemberInclude<ExtArgs> | null
  }


  /**
   * Model Invitation
   */

  export type AggregateInvitation = {
    _count: InvitationCountAggregateOutputType | null
    _min: InvitationMinAggregateOutputType | null
    _max: InvitationMaxAggregateOutputType | null
  }

  export type InvitationMinAggregateOutputType = {
    id: string | null
    email: string | null
    workspaceId: string | null
    role: string | null
    status: string | null
    invitedBy: string | null
    token: string | null
    expiresAt: Date | null
    acceptedAt: Date | null
    createdAt: Date | null
  }

  export type InvitationMaxAggregateOutputType = {
    id: string | null
    email: string | null
    workspaceId: string | null
    role: string | null
    status: string | null
    invitedBy: string | null
    token: string | null
    expiresAt: Date | null
    acceptedAt: Date | null
    createdAt: Date | null
  }

  export type InvitationCountAggregateOutputType = {
    id: number
    email: number
    workspaceId: number
    role: number
    status: number
    invitedBy: number
    token: number
    expiresAt: number
    acceptedAt: number
    createdAt: number
    _all: number
  }


  export type InvitationMinAggregateInputType = {
    id?: true
    email?: true
    workspaceId?: true
    role?: true
    status?: true
    invitedBy?: true
    token?: true
    expiresAt?: true
    acceptedAt?: true
    createdAt?: true
  }

  export type InvitationMaxAggregateInputType = {
    id?: true
    email?: true
    workspaceId?: true
    role?: true
    status?: true
    invitedBy?: true
    token?: true
    expiresAt?: true
    acceptedAt?: true
    createdAt?: true
  }

  export type InvitationCountAggregateInputType = {
    id?: true
    email?: true
    workspaceId?: true
    role?: true
    status?: true
    invitedBy?: true
    token?: true
    expiresAt?: true
    acceptedAt?: true
    createdAt?: true
    _all?: true
  }

  export type InvitationAggregateArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Filter which Invitation to aggregate.
     */
    where?: InvitationWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of Invitations to fetch.
     */
    orderBy?: InvitationOrderByWithRelationInput | InvitationOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the start position
     */
    cursor?: InvitationWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` Invitations from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` Invitations.
     */
    skip?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Count returned Invitations
    **/
    _count?: true | InvitationCountAggregateInputType
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Select which fields to find the minimum value
    **/
    _min?: InvitationMinAggregateInputType
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Select which fields to find the maximum value
    **/
    _max?: InvitationMaxAggregateInputType
  }

  export type GetInvitationAggregateType<T extends InvitationAggregateArgs> = {
        [P in keyof T & keyof AggregateInvitation]: P extends '_count' | 'count'
      ? T[P] extends true
        ? number
        : GetScalarType<T[P], AggregateInvitation[P]>
      : GetScalarType<T[P], AggregateInvitation[P]>
  }




  export type InvitationGroupByArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    where?: InvitationWhereInput
    orderBy?: InvitationOrderByWithAggregationInput | InvitationOrderByWithAggregationInput[]
    by: InvitationScalarFieldEnum[] | InvitationScalarFieldEnum
    having?: InvitationScalarWhereWithAggregatesInput
    take?: number
    skip?: number
    _count?: InvitationCountAggregateInputType | true
    _min?: InvitationMinAggregateInputType
    _max?: InvitationMaxAggregateInputType
  }

  export type InvitationGroupByOutputType = {
    id: string
    email: string
    workspaceId: string
    role: string
    status: string
    invitedBy: string
    token: string
    expiresAt: Date
    acceptedAt: Date | null
    createdAt: Date
    _count: InvitationCountAggregateOutputType | null
    _min: InvitationMinAggregateOutputType | null
    _max: InvitationMaxAggregateOutputType | null
  }

  type GetInvitationGroupByPayload<T extends InvitationGroupByArgs> = Prisma.PrismaPromise<
    Array<
      PickEnumerable<InvitationGroupByOutputType, T['by']> &
        {
          [P in ((keyof T) & (keyof InvitationGroupByOutputType))]: P extends '_count'
            ? T[P] extends boolean
              ? number
              : GetScalarType<T[P], InvitationGroupByOutputType[P]>
            : GetScalarType<T[P], InvitationGroupByOutputType[P]>
        }
      >
    >


  export type InvitationSelect<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetSelect<{
    id?: boolean
    email?: boolean
    workspaceId?: boolean
    role?: boolean
    status?: boolean
    invitedBy?: boolean
    token?: boolean
    expiresAt?: boolean
    acceptedAt?: boolean
    createdAt?: boolean
    workspace?: boolean | WorkspaceDefaultArgs<ExtArgs>
    inviter?: boolean | UserProfileDefaultArgs<ExtArgs>
  }, ExtArgs["result"]["invitation"]>

  export type InvitationSelectCreateManyAndReturn<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetSelect<{
    id?: boolean
    email?: boolean
    workspaceId?: boolean
    role?: boolean
    status?: boolean
    invitedBy?: boolean
    token?: boolean
    expiresAt?: boolean
    acceptedAt?: boolean
    createdAt?: boolean
    workspace?: boolean | WorkspaceDefaultArgs<ExtArgs>
    inviter?: boolean | UserProfileDefaultArgs<ExtArgs>
  }, ExtArgs["result"]["invitation"]>

  export type InvitationSelectUpdateManyAndReturn<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetSelect<{
    id?: boolean
    email?: boolean
    workspaceId?: boolean
    role?: boolean
    status?: boolean
    invitedBy?: boolean
    token?: boolean
    expiresAt?: boolean
    acceptedAt?: boolean
    createdAt?: boolean
    workspace?: boolean | WorkspaceDefaultArgs<ExtArgs>
    inviter?: boolean | UserProfileDefaultArgs<ExtArgs>
  }, ExtArgs["result"]["invitation"]>

  export type InvitationSelectScalar = {
    id?: boolean
    email?: boolean
    workspaceId?: boolean
    role?: boolean
    status?: boolean
    invitedBy?: boolean
    token?: boolean
    expiresAt?: boolean
    acceptedAt?: boolean
    createdAt?: boolean
  }

  export type InvitationOmit<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetOmit<"id" | "email" | "workspaceId" | "role" | "status" | "invitedBy" | "token" | "expiresAt" | "acceptedAt" | "createdAt", ExtArgs["result"]["invitation"]>
  export type InvitationInclude<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    workspace?: boolean | WorkspaceDefaultArgs<ExtArgs>
    inviter?: boolean | UserProfileDefaultArgs<ExtArgs>
  }
  export type InvitationIncludeCreateManyAndReturn<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    workspace?: boolean | WorkspaceDefaultArgs<ExtArgs>
    inviter?: boolean | UserProfileDefaultArgs<ExtArgs>
  }
  export type InvitationIncludeUpdateManyAndReturn<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    workspace?: boolean | WorkspaceDefaultArgs<ExtArgs>
    inviter?: boolean | UserProfileDefaultArgs<ExtArgs>
  }

  export type $InvitationPayload<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    name: "Invitation"
    objects: {
      workspace: Prisma.$WorkspacePayload<ExtArgs>
      inviter: Prisma.$UserProfilePayload<ExtArgs>
    }
    scalars: $Extensions.GetPayloadResult<{
      id: string
      email: string
      workspaceId: string
      role: string
      status: string
      invitedBy: string
      token: string
      expiresAt: Date
      acceptedAt: Date | null
      createdAt: Date
    }, ExtArgs["result"]["invitation"]>
    composites: {}
  }

  type InvitationGetPayload<S extends boolean | null | undefined | InvitationDefaultArgs> = $Result.GetResult<Prisma.$InvitationPayload, S>

  type InvitationCountArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> =
    Omit<InvitationFindManyArgs, 'select' | 'include' | 'distinct' | 'omit'> & {
      select?: InvitationCountAggregateInputType | true
    }

  export interface InvitationDelegate<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs, GlobalOmitOptions = {}> {
    [K: symbol]: { types: Prisma.TypeMap<ExtArgs>['model']['Invitation'], meta: { name: 'Invitation' } }
    /**
     * Find zero or one Invitation that matches the filter.
     * @param {InvitationFindUniqueArgs} args - Arguments to find a Invitation
     * @example
     * // Get one Invitation
     * const invitation = await prisma.invitation.findUnique({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findUnique<T extends InvitationFindUniqueArgs>(args: SelectSubset<T, InvitationFindUniqueArgs<ExtArgs>>): Prisma__InvitationClient<$Result.GetResult<Prisma.$InvitationPayload<ExtArgs>, T, "findUnique", GlobalOmitOptions> | null, null, ExtArgs, GlobalOmitOptions>

    /**
     * Find one Invitation that matches the filter or throw an error with `error.code='P2025'`
     * if no matches were found.
     * @param {InvitationFindUniqueOrThrowArgs} args - Arguments to find a Invitation
     * @example
     * // Get one Invitation
     * const invitation = await prisma.invitation.findUniqueOrThrow({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findUniqueOrThrow<T extends InvitationFindUniqueOrThrowArgs>(args: SelectSubset<T, InvitationFindUniqueOrThrowArgs<ExtArgs>>): Prisma__InvitationClient<$Result.GetResult<Prisma.$InvitationPayload<ExtArgs>, T, "findUniqueOrThrow", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Find the first Invitation that matches the filter.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {InvitationFindFirstArgs} args - Arguments to find a Invitation
     * @example
     * // Get one Invitation
     * const invitation = await prisma.invitation.findFirst({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findFirst<T extends InvitationFindFirstArgs>(args?: SelectSubset<T, InvitationFindFirstArgs<ExtArgs>>): Prisma__InvitationClient<$Result.GetResult<Prisma.$InvitationPayload<ExtArgs>, T, "findFirst", GlobalOmitOptions> | null, null, ExtArgs, GlobalOmitOptions>

    /**
     * Find the first Invitation that matches the filter or
     * throw `PrismaKnownClientError` with `P2025` code if no matches were found.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {InvitationFindFirstOrThrowArgs} args - Arguments to find a Invitation
     * @example
     * // Get one Invitation
     * const invitation = await prisma.invitation.findFirstOrThrow({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findFirstOrThrow<T extends InvitationFindFirstOrThrowArgs>(args?: SelectSubset<T, InvitationFindFirstOrThrowArgs<ExtArgs>>): Prisma__InvitationClient<$Result.GetResult<Prisma.$InvitationPayload<ExtArgs>, T, "findFirstOrThrow", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Find zero or more Invitations that matches the filter.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {InvitationFindManyArgs} args - Arguments to filter and select certain fields only.
     * @example
     * // Get all Invitations
     * const invitations = await prisma.invitation.findMany()
     * 
     * // Get first 10 Invitations
     * const invitations = await prisma.invitation.findMany({ take: 10 })
     * 
     * // Only select the `id`
     * const invitationWithIdOnly = await prisma.invitation.findMany({ select: { id: true } })
     * 
     */
    findMany<T extends InvitationFindManyArgs>(args?: SelectSubset<T, InvitationFindManyArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$InvitationPayload<ExtArgs>, T, "findMany", GlobalOmitOptions>>

    /**
     * Create a Invitation.
     * @param {InvitationCreateArgs} args - Arguments to create a Invitation.
     * @example
     * // Create one Invitation
     * const Invitation = await prisma.invitation.create({
     *   data: {
     *     // ... data to create a Invitation
     *   }
     * })
     * 
     */
    create<T extends InvitationCreateArgs>(args: SelectSubset<T, InvitationCreateArgs<ExtArgs>>): Prisma__InvitationClient<$Result.GetResult<Prisma.$InvitationPayload<ExtArgs>, T, "create", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Create many Invitations.
     * @param {InvitationCreateManyArgs} args - Arguments to create many Invitations.
     * @example
     * // Create many Invitations
     * const invitation = await prisma.invitation.createMany({
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     *     
     */
    createMany<T extends InvitationCreateManyArgs>(args?: SelectSubset<T, InvitationCreateManyArgs<ExtArgs>>): Prisma.PrismaPromise<BatchPayload>

    /**
     * Create many Invitations and returns the data saved in the database.
     * @param {InvitationCreateManyAndReturnArgs} args - Arguments to create many Invitations.
     * @example
     * // Create many Invitations
     * const invitation = await prisma.invitation.createManyAndReturn({
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * 
     * // Create many Invitations and only return the `id`
     * const invitationWithIdOnly = await prisma.invitation.createManyAndReturn({
     *   select: { id: true },
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * 
     */
    createManyAndReturn<T extends InvitationCreateManyAndReturnArgs>(args?: SelectSubset<T, InvitationCreateManyAndReturnArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$InvitationPayload<ExtArgs>, T, "createManyAndReturn", GlobalOmitOptions>>

    /**
     * Delete a Invitation.
     * @param {InvitationDeleteArgs} args - Arguments to delete one Invitation.
     * @example
     * // Delete one Invitation
     * const Invitation = await prisma.invitation.delete({
     *   where: {
     *     // ... filter to delete one Invitation
     *   }
     * })
     * 
     */
    delete<T extends InvitationDeleteArgs>(args: SelectSubset<T, InvitationDeleteArgs<ExtArgs>>): Prisma__InvitationClient<$Result.GetResult<Prisma.$InvitationPayload<ExtArgs>, T, "delete", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Update one Invitation.
     * @param {InvitationUpdateArgs} args - Arguments to update one Invitation.
     * @example
     * // Update one Invitation
     * const invitation = await prisma.invitation.update({
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: {
     *     // ... provide data here
     *   }
     * })
     * 
     */
    update<T extends InvitationUpdateArgs>(args: SelectSubset<T, InvitationUpdateArgs<ExtArgs>>): Prisma__InvitationClient<$Result.GetResult<Prisma.$InvitationPayload<ExtArgs>, T, "update", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Delete zero or more Invitations.
     * @param {InvitationDeleteManyArgs} args - Arguments to filter Invitations to delete.
     * @example
     * // Delete a few Invitations
     * const { count } = await prisma.invitation.deleteMany({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     * 
     */
    deleteMany<T extends InvitationDeleteManyArgs>(args?: SelectSubset<T, InvitationDeleteManyArgs<ExtArgs>>): Prisma.PrismaPromise<BatchPayload>

    /**
     * Update zero or more Invitations.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {InvitationUpdateManyArgs} args - Arguments to update one or more rows.
     * @example
     * // Update many Invitations
     * const invitation = await prisma.invitation.updateMany({
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: {
     *     // ... provide data here
     *   }
     * })
     * 
     */
    updateMany<T extends InvitationUpdateManyArgs>(args: SelectSubset<T, InvitationUpdateManyArgs<ExtArgs>>): Prisma.PrismaPromise<BatchPayload>

    /**
     * Update zero or more Invitations and returns the data updated in the database.
     * @param {InvitationUpdateManyAndReturnArgs} args - Arguments to update many Invitations.
     * @example
     * // Update many Invitations
     * const invitation = await prisma.invitation.updateManyAndReturn({
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * 
     * // Update zero or more Invitations and only return the `id`
     * const invitationWithIdOnly = await prisma.invitation.updateManyAndReturn({
     *   select: { id: true },
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * 
     */
    updateManyAndReturn<T extends InvitationUpdateManyAndReturnArgs>(args: SelectSubset<T, InvitationUpdateManyAndReturnArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$InvitationPayload<ExtArgs>, T, "updateManyAndReturn", GlobalOmitOptions>>

    /**
     * Create or update one Invitation.
     * @param {InvitationUpsertArgs} args - Arguments to update or create a Invitation.
     * @example
     * // Update or create a Invitation
     * const invitation = await prisma.invitation.upsert({
     *   create: {
     *     // ... data to create a Invitation
     *   },
     *   update: {
     *     // ... in case it already exists, update
     *   },
     *   where: {
     *     // ... the filter for the Invitation we want to update
     *   }
     * })
     */
    upsert<T extends InvitationUpsertArgs>(args: SelectSubset<T, InvitationUpsertArgs<ExtArgs>>): Prisma__InvitationClient<$Result.GetResult<Prisma.$InvitationPayload<ExtArgs>, T, "upsert", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>


    /**
     * Count the number of Invitations.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {InvitationCountArgs} args - Arguments to filter Invitations to count.
     * @example
     * // Count the number of Invitations
     * const count = await prisma.invitation.count({
     *   where: {
     *     // ... the filter for the Invitations we want to count
     *   }
     * })
    **/
    count<T extends InvitationCountArgs>(
      args?: Subset<T, InvitationCountArgs>,
    ): Prisma.PrismaPromise<
      T extends $Utils.Record<'select', any>
        ? T['select'] extends true
          ? number
          : GetScalarType<T['select'], InvitationCountAggregateOutputType>
        : number
    >

    /**
     * Allows you to perform aggregations operations on a Invitation.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {InvitationAggregateArgs} args - Select which aggregations you would like to apply and on what fields.
     * @example
     * // Ordered by age ascending
     * // Where email contains prisma.io
     * // Limited to the 10 users
     * const aggregations = await prisma.user.aggregate({
     *   _avg: {
     *     age: true,
     *   },
     *   where: {
     *     email: {
     *       contains: "prisma.io",
     *     },
     *   },
     *   orderBy: {
     *     age: "asc",
     *   },
     *   take: 10,
     * })
    **/
    aggregate<T extends InvitationAggregateArgs>(args: Subset<T, InvitationAggregateArgs>): Prisma.PrismaPromise<GetInvitationAggregateType<T>>

    /**
     * Group by Invitation.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {InvitationGroupByArgs} args - Group by arguments.
     * @example
     * // Group by city, order by createdAt, get count
     * const result = await prisma.user.groupBy({
     *   by: ['city', 'createdAt'],
     *   orderBy: {
     *     createdAt: true
     *   },
     *   _count: {
     *     _all: true
     *   },
     * })
     * 
    **/
    groupBy<
      T extends InvitationGroupByArgs,
      HasSelectOrTake extends Or<
        Extends<'skip', Keys<T>>,
        Extends<'take', Keys<T>>
      >,
      OrderByArg extends True extends HasSelectOrTake
        ? { orderBy: InvitationGroupByArgs['orderBy'] }
        : { orderBy?: InvitationGroupByArgs['orderBy'] },
      OrderFields extends ExcludeUnderscoreKeys<Keys<MaybeTupleToUnion<T['orderBy']>>>,
      ByFields extends MaybeTupleToUnion<T['by']>,
      ByValid extends Has<ByFields, OrderFields>,
      HavingFields extends GetHavingFields<T['having']>,
      HavingValid extends Has<ByFields, HavingFields>,
      ByEmpty extends T['by'] extends never[] ? True : False,
      InputErrors extends ByEmpty extends True
      ? `Error: "by" must not be empty.`
      : HavingValid extends False
      ? {
          [P in HavingFields]: P extends ByFields
            ? never
            : P extends string
            ? `Error: Field "${P}" used in "having" needs to be provided in "by".`
            : [
                Error,
                'Field ',
                P,
                ` in "having" needs to be provided in "by"`,
              ]
        }[HavingFields]
      : 'take' extends Keys<T>
      ? 'orderBy' extends Keys<T>
        ? ByValid extends True
          ? {}
          : {
              [P in OrderFields]: P extends ByFields
                ? never
                : `Error: Field "${P}" in "orderBy" needs to be provided in "by"`
            }[OrderFields]
        : 'Error: If you provide "take", you also need to provide "orderBy"'
      : 'skip' extends Keys<T>
      ? 'orderBy' extends Keys<T>
        ? ByValid extends True
          ? {}
          : {
              [P in OrderFields]: P extends ByFields
                ? never
                : `Error: Field "${P}" in "orderBy" needs to be provided in "by"`
            }[OrderFields]
        : 'Error: If you provide "skip", you also need to provide "orderBy"'
      : ByValid extends True
      ? {}
      : {
          [P in OrderFields]: P extends ByFields
            ? never
            : `Error: Field "${P}" in "orderBy" needs to be provided in "by"`
        }[OrderFields]
    >(args: SubsetIntersection<T, InvitationGroupByArgs, OrderByArg> & InputErrors): {} extends InputErrors ? GetInvitationGroupByPayload<T> : Prisma.PrismaPromise<InputErrors>
  /**
   * Fields of the Invitation model
   */
  readonly fields: InvitationFieldRefs;
  }

  /**
   * The delegate class that acts as a "Promise-like" for Invitation.
   * Why is this prefixed with `Prisma__`?
   * Because we want to prevent naming conflicts as mentioned in
   * https://github.com/prisma/prisma-client-js/issues/707
   */
  export interface Prisma__InvitationClient<T, Null = never, ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs, GlobalOmitOptions = {}> extends Prisma.PrismaPromise<T> {
    readonly [Symbol.toStringTag]: "PrismaPromise"
    workspace<T extends WorkspaceDefaultArgs<ExtArgs> = {}>(args?: Subset<T, WorkspaceDefaultArgs<ExtArgs>>): Prisma__WorkspaceClient<$Result.GetResult<Prisma.$WorkspacePayload<ExtArgs>, T, "findUniqueOrThrow", GlobalOmitOptions> | Null, Null, ExtArgs, GlobalOmitOptions>
    inviter<T extends UserProfileDefaultArgs<ExtArgs> = {}>(args?: Subset<T, UserProfileDefaultArgs<ExtArgs>>): Prisma__UserProfileClient<$Result.GetResult<Prisma.$UserProfilePayload<ExtArgs>, T, "findUniqueOrThrow", GlobalOmitOptions> | Null, Null, ExtArgs, GlobalOmitOptions>
    /**
     * Attaches callbacks for the resolution and/or rejection of the Promise.
     * @param onfulfilled The callback to execute when the Promise is resolved.
     * @param onrejected The callback to execute when the Promise is rejected.
     * @returns A Promise for the completion of which ever callback is executed.
     */
    then<TResult1 = T, TResult2 = never>(onfulfilled?: ((value: T) => TResult1 | PromiseLike<TResult1>) | undefined | null, onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | undefined | null): $Utils.JsPromise<TResult1 | TResult2>
    /**
     * Attaches a callback for only the rejection of the Promise.
     * @param onrejected The callback to execute when the Promise is rejected.
     * @returns A Promise for the completion of the callback.
     */
    catch<TResult = never>(onrejected?: ((reason: any) => TResult | PromiseLike<TResult>) | undefined | null): $Utils.JsPromise<T | TResult>
    /**
     * Attaches a callback that is invoked when the Promise is settled (fulfilled or rejected). The
     * resolved value cannot be modified from the callback.
     * @param onfinally The callback to execute when the Promise is settled (fulfilled or rejected).
     * @returns A Promise for the completion of the callback.
     */
    finally(onfinally?: (() => void) | undefined | null): $Utils.JsPromise<T>
  }




  /**
   * Fields of the Invitation model
   */
  interface InvitationFieldRefs {
    readonly id: FieldRef<"Invitation", 'String'>
    readonly email: FieldRef<"Invitation", 'String'>
    readonly workspaceId: FieldRef<"Invitation", 'String'>
    readonly role: FieldRef<"Invitation", 'String'>
    readonly status: FieldRef<"Invitation", 'String'>
    readonly invitedBy: FieldRef<"Invitation", 'String'>
    readonly token: FieldRef<"Invitation", 'String'>
    readonly expiresAt: FieldRef<"Invitation", 'DateTime'>
    readonly acceptedAt: FieldRef<"Invitation", 'DateTime'>
    readonly createdAt: FieldRef<"Invitation", 'DateTime'>
  }
    

  // Custom InputTypes
  /**
   * Invitation findUnique
   */
  export type InvitationFindUniqueArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Invitation
     */
    select?: InvitationSelect<ExtArgs> | null
    /**
     * Omit specific fields from the Invitation
     */
    omit?: InvitationOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: InvitationInclude<ExtArgs> | null
    /**
     * Filter, which Invitation to fetch.
     */
    where: InvitationWhereUniqueInput
  }

  /**
   * Invitation findUniqueOrThrow
   */
  export type InvitationFindUniqueOrThrowArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Invitation
     */
    select?: InvitationSelect<ExtArgs> | null
    /**
     * Omit specific fields from the Invitation
     */
    omit?: InvitationOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: InvitationInclude<ExtArgs> | null
    /**
     * Filter, which Invitation to fetch.
     */
    where: InvitationWhereUniqueInput
  }

  /**
   * Invitation findFirst
   */
  export type InvitationFindFirstArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Invitation
     */
    select?: InvitationSelect<ExtArgs> | null
    /**
     * Omit specific fields from the Invitation
     */
    omit?: InvitationOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: InvitationInclude<ExtArgs> | null
    /**
     * Filter, which Invitation to fetch.
     */
    where?: InvitationWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of Invitations to fetch.
     */
    orderBy?: InvitationOrderByWithRelationInput | InvitationOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the position for searching for Invitations.
     */
    cursor?: InvitationWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` Invitations from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` Invitations.
     */
    skip?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/distinct Distinct Docs}
     * 
     * Filter by unique combinations of Invitations.
     */
    distinct?: InvitationScalarFieldEnum | InvitationScalarFieldEnum[]
  }

  /**
   * Invitation findFirstOrThrow
   */
  export type InvitationFindFirstOrThrowArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Invitation
     */
    select?: InvitationSelect<ExtArgs> | null
    /**
     * Omit specific fields from the Invitation
     */
    omit?: InvitationOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: InvitationInclude<ExtArgs> | null
    /**
     * Filter, which Invitation to fetch.
     */
    where?: InvitationWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of Invitations to fetch.
     */
    orderBy?: InvitationOrderByWithRelationInput | InvitationOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the position for searching for Invitations.
     */
    cursor?: InvitationWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` Invitations from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` Invitations.
     */
    skip?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/distinct Distinct Docs}
     * 
     * Filter by unique combinations of Invitations.
     */
    distinct?: InvitationScalarFieldEnum | InvitationScalarFieldEnum[]
  }

  /**
   * Invitation findMany
   */
  export type InvitationFindManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Invitation
     */
    select?: InvitationSelect<ExtArgs> | null
    /**
     * Omit specific fields from the Invitation
     */
    omit?: InvitationOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: InvitationInclude<ExtArgs> | null
    /**
     * Filter, which Invitations to fetch.
     */
    where?: InvitationWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of Invitations to fetch.
     */
    orderBy?: InvitationOrderByWithRelationInput | InvitationOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the position for listing Invitations.
     */
    cursor?: InvitationWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` Invitations from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` Invitations.
     */
    skip?: number
    distinct?: InvitationScalarFieldEnum | InvitationScalarFieldEnum[]
  }

  /**
   * Invitation create
   */
  export type InvitationCreateArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Invitation
     */
    select?: InvitationSelect<ExtArgs> | null
    /**
     * Omit specific fields from the Invitation
     */
    omit?: InvitationOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: InvitationInclude<ExtArgs> | null
    /**
     * The data needed to create a Invitation.
     */
    data: XOR<InvitationCreateInput, InvitationUncheckedCreateInput>
  }

  /**
   * Invitation createMany
   */
  export type InvitationCreateManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * The data used to create many Invitations.
     */
    data: InvitationCreateManyInput | InvitationCreateManyInput[]
    skipDuplicates?: boolean
  }

  /**
   * Invitation createManyAndReturn
   */
  export type InvitationCreateManyAndReturnArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Invitation
     */
    select?: InvitationSelectCreateManyAndReturn<ExtArgs> | null
    /**
     * Omit specific fields from the Invitation
     */
    omit?: InvitationOmit<ExtArgs> | null
    /**
     * The data used to create many Invitations.
     */
    data: InvitationCreateManyInput | InvitationCreateManyInput[]
    skipDuplicates?: boolean
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: InvitationIncludeCreateManyAndReturn<ExtArgs> | null
  }

  /**
   * Invitation update
   */
  export type InvitationUpdateArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Invitation
     */
    select?: InvitationSelect<ExtArgs> | null
    /**
     * Omit specific fields from the Invitation
     */
    omit?: InvitationOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: InvitationInclude<ExtArgs> | null
    /**
     * The data needed to update a Invitation.
     */
    data: XOR<InvitationUpdateInput, InvitationUncheckedUpdateInput>
    /**
     * Choose, which Invitation to update.
     */
    where: InvitationWhereUniqueInput
  }

  /**
   * Invitation updateMany
   */
  export type InvitationUpdateManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * The data used to update Invitations.
     */
    data: XOR<InvitationUpdateManyMutationInput, InvitationUncheckedUpdateManyInput>
    /**
     * Filter which Invitations to update
     */
    where?: InvitationWhereInput
    /**
     * Limit how many Invitations to update.
     */
    limit?: number
  }

  /**
   * Invitation updateManyAndReturn
   */
  export type InvitationUpdateManyAndReturnArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Invitation
     */
    select?: InvitationSelectUpdateManyAndReturn<ExtArgs> | null
    /**
     * Omit specific fields from the Invitation
     */
    omit?: InvitationOmit<ExtArgs> | null
    /**
     * The data used to update Invitations.
     */
    data: XOR<InvitationUpdateManyMutationInput, InvitationUncheckedUpdateManyInput>
    /**
     * Filter which Invitations to update
     */
    where?: InvitationWhereInput
    /**
     * Limit how many Invitations to update.
     */
    limit?: number
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: InvitationIncludeUpdateManyAndReturn<ExtArgs> | null
  }

  /**
   * Invitation upsert
   */
  export type InvitationUpsertArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Invitation
     */
    select?: InvitationSelect<ExtArgs> | null
    /**
     * Omit specific fields from the Invitation
     */
    omit?: InvitationOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: InvitationInclude<ExtArgs> | null
    /**
     * The filter to search for the Invitation to update in case it exists.
     */
    where: InvitationWhereUniqueInput
    /**
     * In case the Invitation found by the `where` argument doesn't exist, create a new Invitation with this data.
     */
    create: XOR<InvitationCreateInput, InvitationUncheckedCreateInput>
    /**
     * In case the Invitation was found with the provided `where` argument, update it with this data.
     */
    update: XOR<InvitationUpdateInput, InvitationUncheckedUpdateInput>
  }

  /**
   * Invitation delete
   */
  export type InvitationDeleteArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Invitation
     */
    select?: InvitationSelect<ExtArgs> | null
    /**
     * Omit specific fields from the Invitation
     */
    omit?: InvitationOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: InvitationInclude<ExtArgs> | null
    /**
     * Filter which Invitation to delete.
     */
    where: InvitationWhereUniqueInput
  }

  /**
   * Invitation deleteMany
   */
  export type InvitationDeleteManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Filter which Invitations to delete
     */
    where?: InvitationWhereInput
    /**
     * Limit how many Invitations to delete.
     */
    limit?: number
  }

  /**
   * Invitation without action
   */
  export type InvitationDefaultArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Invitation
     */
    select?: InvitationSelect<ExtArgs> | null
    /**
     * Omit specific fields from the Invitation
     */
    omit?: InvitationOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: InvitationInclude<ExtArgs> | null
  }


  /**
   * Model AuditLog
   */

  export type AggregateAuditLog = {
    _count: AuditLogCountAggregateOutputType | null
    _min: AuditLogMinAggregateOutputType | null
    _max: AuditLogMaxAggregateOutputType | null
  }

  export type AuditLogMinAggregateOutputType = {
    id: string | null
    actorId: string | null
    actionType: string | null
    targetType: string | null
    targetId: string | null
    ipAddress: string | null
    createdAt: Date | null
  }

  export type AuditLogMaxAggregateOutputType = {
    id: string | null
    actorId: string | null
    actionType: string | null
    targetType: string | null
    targetId: string | null
    ipAddress: string | null
    createdAt: Date | null
  }

  export type AuditLogCountAggregateOutputType = {
    id: number
    actorId: number
    actionType: number
    targetType: number
    targetId: number
    beforeValue: number
    afterValue: number
    ipAddress: number
    createdAt: number
    _all: number
  }


  export type AuditLogMinAggregateInputType = {
    id?: true
    actorId?: true
    actionType?: true
    targetType?: true
    targetId?: true
    ipAddress?: true
    createdAt?: true
  }

  export type AuditLogMaxAggregateInputType = {
    id?: true
    actorId?: true
    actionType?: true
    targetType?: true
    targetId?: true
    ipAddress?: true
    createdAt?: true
  }

  export type AuditLogCountAggregateInputType = {
    id?: true
    actorId?: true
    actionType?: true
    targetType?: true
    targetId?: true
    beforeValue?: true
    afterValue?: true
    ipAddress?: true
    createdAt?: true
    _all?: true
  }

  export type AuditLogAggregateArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Filter which AuditLog to aggregate.
     */
    where?: AuditLogWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of AuditLogs to fetch.
     */
    orderBy?: AuditLogOrderByWithRelationInput | AuditLogOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the start position
     */
    cursor?: AuditLogWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` AuditLogs from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` AuditLogs.
     */
    skip?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Count returned AuditLogs
    **/
    _count?: true | AuditLogCountAggregateInputType
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Select which fields to find the minimum value
    **/
    _min?: AuditLogMinAggregateInputType
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Select which fields to find the maximum value
    **/
    _max?: AuditLogMaxAggregateInputType
  }

  export type GetAuditLogAggregateType<T extends AuditLogAggregateArgs> = {
        [P in keyof T & keyof AggregateAuditLog]: P extends '_count' | 'count'
      ? T[P] extends true
        ? number
        : GetScalarType<T[P], AggregateAuditLog[P]>
      : GetScalarType<T[P], AggregateAuditLog[P]>
  }




  export type AuditLogGroupByArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    where?: AuditLogWhereInput
    orderBy?: AuditLogOrderByWithAggregationInput | AuditLogOrderByWithAggregationInput[]
    by: AuditLogScalarFieldEnum[] | AuditLogScalarFieldEnum
    having?: AuditLogScalarWhereWithAggregatesInput
    take?: number
    skip?: number
    _count?: AuditLogCountAggregateInputType | true
    _min?: AuditLogMinAggregateInputType
    _max?: AuditLogMaxAggregateInputType
  }

  export type AuditLogGroupByOutputType = {
    id: string
    actorId: string
    actionType: string
    targetType: string
    targetId: string | null
    beforeValue: JsonValue | null
    afterValue: JsonValue | null
    ipAddress: string | null
    createdAt: Date
    _count: AuditLogCountAggregateOutputType | null
    _min: AuditLogMinAggregateOutputType | null
    _max: AuditLogMaxAggregateOutputType | null
  }

  type GetAuditLogGroupByPayload<T extends AuditLogGroupByArgs> = Prisma.PrismaPromise<
    Array<
      PickEnumerable<AuditLogGroupByOutputType, T['by']> &
        {
          [P in ((keyof T) & (keyof AuditLogGroupByOutputType))]: P extends '_count'
            ? T[P] extends boolean
              ? number
              : GetScalarType<T[P], AuditLogGroupByOutputType[P]>
            : GetScalarType<T[P], AuditLogGroupByOutputType[P]>
        }
      >
    >


  export type AuditLogSelect<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetSelect<{
    id?: boolean
    actorId?: boolean
    actionType?: boolean
    targetType?: boolean
    targetId?: boolean
    beforeValue?: boolean
    afterValue?: boolean
    ipAddress?: boolean
    createdAt?: boolean
  }, ExtArgs["result"]["auditLog"]>

  export type AuditLogSelectCreateManyAndReturn<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetSelect<{
    id?: boolean
    actorId?: boolean
    actionType?: boolean
    targetType?: boolean
    targetId?: boolean
    beforeValue?: boolean
    afterValue?: boolean
    ipAddress?: boolean
    createdAt?: boolean
  }, ExtArgs["result"]["auditLog"]>

  export type AuditLogSelectUpdateManyAndReturn<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetSelect<{
    id?: boolean
    actorId?: boolean
    actionType?: boolean
    targetType?: boolean
    targetId?: boolean
    beforeValue?: boolean
    afterValue?: boolean
    ipAddress?: boolean
    createdAt?: boolean
  }, ExtArgs["result"]["auditLog"]>

  export type AuditLogSelectScalar = {
    id?: boolean
    actorId?: boolean
    actionType?: boolean
    targetType?: boolean
    targetId?: boolean
    beforeValue?: boolean
    afterValue?: boolean
    ipAddress?: boolean
    createdAt?: boolean
  }

  export type AuditLogOmit<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetOmit<"id" | "actorId" | "actionType" | "targetType" | "targetId" | "beforeValue" | "afterValue" | "ipAddress" | "createdAt", ExtArgs["result"]["auditLog"]>

  export type $AuditLogPayload<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    name: "AuditLog"
    objects: {}
    scalars: $Extensions.GetPayloadResult<{
      id: string
      actorId: string
      actionType: string
      targetType: string
      targetId: string | null
      beforeValue: Prisma.JsonValue | null
      afterValue: Prisma.JsonValue | null
      ipAddress: string | null
      createdAt: Date
    }, ExtArgs["result"]["auditLog"]>
    composites: {}
  }

  type AuditLogGetPayload<S extends boolean | null | undefined | AuditLogDefaultArgs> = $Result.GetResult<Prisma.$AuditLogPayload, S>

  type AuditLogCountArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> =
    Omit<AuditLogFindManyArgs, 'select' | 'include' | 'distinct' | 'omit'> & {
      select?: AuditLogCountAggregateInputType | true
    }

  export interface AuditLogDelegate<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs, GlobalOmitOptions = {}> {
    [K: symbol]: { types: Prisma.TypeMap<ExtArgs>['model']['AuditLog'], meta: { name: 'AuditLog' } }
    /**
     * Find zero or one AuditLog that matches the filter.
     * @param {AuditLogFindUniqueArgs} args - Arguments to find a AuditLog
     * @example
     * // Get one AuditLog
     * const auditLog = await prisma.auditLog.findUnique({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findUnique<T extends AuditLogFindUniqueArgs>(args: SelectSubset<T, AuditLogFindUniqueArgs<ExtArgs>>): Prisma__AuditLogClient<$Result.GetResult<Prisma.$AuditLogPayload<ExtArgs>, T, "findUnique", GlobalOmitOptions> | null, null, ExtArgs, GlobalOmitOptions>

    /**
     * Find one AuditLog that matches the filter or throw an error with `error.code='P2025'`
     * if no matches were found.
     * @param {AuditLogFindUniqueOrThrowArgs} args - Arguments to find a AuditLog
     * @example
     * // Get one AuditLog
     * const auditLog = await prisma.auditLog.findUniqueOrThrow({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findUniqueOrThrow<T extends AuditLogFindUniqueOrThrowArgs>(args: SelectSubset<T, AuditLogFindUniqueOrThrowArgs<ExtArgs>>): Prisma__AuditLogClient<$Result.GetResult<Prisma.$AuditLogPayload<ExtArgs>, T, "findUniqueOrThrow", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Find the first AuditLog that matches the filter.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {AuditLogFindFirstArgs} args - Arguments to find a AuditLog
     * @example
     * // Get one AuditLog
     * const auditLog = await prisma.auditLog.findFirst({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findFirst<T extends AuditLogFindFirstArgs>(args?: SelectSubset<T, AuditLogFindFirstArgs<ExtArgs>>): Prisma__AuditLogClient<$Result.GetResult<Prisma.$AuditLogPayload<ExtArgs>, T, "findFirst", GlobalOmitOptions> | null, null, ExtArgs, GlobalOmitOptions>

    /**
     * Find the first AuditLog that matches the filter or
     * throw `PrismaKnownClientError` with `P2025` code if no matches were found.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {AuditLogFindFirstOrThrowArgs} args - Arguments to find a AuditLog
     * @example
     * // Get one AuditLog
     * const auditLog = await prisma.auditLog.findFirstOrThrow({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findFirstOrThrow<T extends AuditLogFindFirstOrThrowArgs>(args?: SelectSubset<T, AuditLogFindFirstOrThrowArgs<ExtArgs>>): Prisma__AuditLogClient<$Result.GetResult<Prisma.$AuditLogPayload<ExtArgs>, T, "findFirstOrThrow", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Find zero or more AuditLogs that matches the filter.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {AuditLogFindManyArgs} args - Arguments to filter and select certain fields only.
     * @example
     * // Get all AuditLogs
     * const auditLogs = await prisma.auditLog.findMany()
     * 
     * // Get first 10 AuditLogs
     * const auditLogs = await prisma.auditLog.findMany({ take: 10 })
     * 
     * // Only select the `id`
     * const auditLogWithIdOnly = await prisma.auditLog.findMany({ select: { id: true } })
     * 
     */
    findMany<T extends AuditLogFindManyArgs>(args?: SelectSubset<T, AuditLogFindManyArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$AuditLogPayload<ExtArgs>, T, "findMany", GlobalOmitOptions>>

    /**
     * Create a AuditLog.
     * @param {AuditLogCreateArgs} args - Arguments to create a AuditLog.
     * @example
     * // Create one AuditLog
     * const AuditLog = await prisma.auditLog.create({
     *   data: {
     *     // ... data to create a AuditLog
     *   }
     * })
     * 
     */
    create<T extends AuditLogCreateArgs>(args: SelectSubset<T, AuditLogCreateArgs<ExtArgs>>): Prisma__AuditLogClient<$Result.GetResult<Prisma.$AuditLogPayload<ExtArgs>, T, "create", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Create many AuditLogs.
     * @param {AuditLogCreateManyArgs} args - Arguments to create many AuditLogs.
     * @example
     * // Create many AuditLogs
     * const auditLog = await prisma.auditLog.createMany({
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     *     
     */
    createMany<T extends AuditLogCreateManyArgs>(args?: SelectSubset<T, AuditLogCreateManyArgs<ExtArgs>>): Prisma.PrismaPromise<BatchPayload>

    /**
     * Create many AuditLogs and returns the data saved in the database.
     * @param {AuditLogCreateManyAndReturnArgs} args - Arguments to create many AuditLogs.
     * @example
     * // Create many AuditLogs
     * const auditLog = await prisma.auditLog.createManyAndReturn({
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * 
     * // Create many AuditLogs and only return the `id`
     * const auditLogWithIdOnly = await prisma.auditLog.createManyAndReturn({
     *   select: { id: true },
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * 
     */
    createManyAndReturn<T extends AuditLogCreateManyAndReturnArgs>(args?: SelectSubset<T, AuditLogCreateManyAndReturnArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$AuditLogPayload<ExtArgs>, T, "createManyAndReturn", GlobalOmitOptions>>

    /**
     * Delete a AuditLog.
     * @param {AuditLogDeleteArgs} args - Arguments to delete one AuditLog.
     * @example
     * // Delete one AuditLog
     * const AuditLog = await prisma.auditLog.delete({
     *   where: {
     *     // ... filter to delete one AuditLog
     *   }
     * })
     * 
     */
    delete<T extends AuditLogDeleteArgs>(args: SelectSubset<T, AuditLogDeleteArgs<ExtArgs>>): Prisma__AuditLogClient<$Result.GetResult<Prisma.$AuditLogPayload<ExtArgs>, T, "delete", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Update one AuditLog.
     * @param {AuditLogUpdateArgs} args - Arguments to update one AuditLog.
     * @example
     * // Update one AuditLog
     * const auditLog = await prisma.auditLog.update({
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: {
     *     // ... provide data here
     *   }
     * })
     * 
     */
    update<T extends AuditLogUpdateArgs>(args: SelectSubset<T, AuditLogUpdateArgs<ExtArgs>>): Prisma__AuditLogClient<$Result.GetResult<Prisma.$AuditLogPayload<ExtArgs>, T, "update", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Delete zero or more AuditLogs.
     * @param {AuditLogDeleteManyArgs} args - Arguments to filter AuditLogs to delete.
     * @example
     * // Delete a few AuditLogs
     * const { count } = await prisma.auditLog.deleteMany({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     * 
     */
    deleteMany<T extends AuditLogDeleteManyArgs>(args?: SelectSubset<T, AuditLogDeleteManyArgs<ExtArgs>>): Prisma.PrismaPromise<BatchPayload>

    /**
     * Update zero or more AuditLogs.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {AuditLogUpdateManyArgs} args - Arguments to update one or more rows.
     * @example
     * // Update many AuditLogs
     * const auditLog = await prisma.auditLog.updateMany({
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: {
     *     // ... provide data here
     *   }
     * })
     * 
     */
    updateMany<T extends AuditLogUpdateManyArgs>(args: SelectSubset<T, AuditLogUpdateManyArgs<ExtArgs>>): Prisma.PrismaPromise<BatchPayload>

    /**
     * Update zero or more AuditLogs and returns the data updated in the database.
     * @param {AuditLogUpdateManyAndReturnArgs} args - Arguments to update many AuditLogs.
     * @example
     * // Update many AuditLogs
     * const auditLog = await prisma.auditLog.updateManyAndReturn({
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * 
     * // Update zero or more AuditLogs and only return the `id`
     * const auditLogWithIdOnly = await prisma.auditLog.updateManyAndReturn({
     *   select: { id: true },
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * 
     */
    updateManyAndReturn<T extends AuditLogUpdateManyAndReturnArgs>(args: SelectSubset<T, AuditLogUpdateManyAndReturnArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$AuditLogPayload<ExtArgs>, T, "updateManyAndReturn", GlobalOmitOptions>>

    /**
     * Create or update one AuditLog.
     * @param {AuditLogUpsertArgs} args - Arguments to update or create a AuditLog.
     * @example
     * // Update or create a AuditLog
     * const auditLog = await prisma.auditLog.upsert({
     *   create: {
     *     // ... data to create a AuditLog
     *   },
     *   update: {
     *     // ... in case it already exists, update
     *   },
     *   where: {
     *     // ... the filter for the AuditLog we want to update
     *   }
     * })
     */
    upsert<T extends AuditLogUpsertArgs>(args: SelectSubset<T, AuditLogUpsertArgs<ExtArgs>>): Prisma__AuditLogClient<$Result.GetResult<Prisma.$AuditLogPayload<ExtArgs>, T, "upsert", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>


    /**
     * Count the number of AuditLogs.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {AuditLogCountArgs} args - Arguments to filter AuditLogs to count.
     * @example
     * // Count the number of AuditLogs
     * const count = await prisma.auditLog.count({
     *   where: {
     *     // ... the filter for the AuditLogs we want to count
     *   }
     * })
    **/
    count<T extends AuditLogCountArgs>(
      args?: Subset<T, AuditLogCountArgs>,
    ): Prisma.PrismaPromise<
      T extends $Utils.Record<'select', any>
        ? T['select'] extends true
          ? number
          : GetScalarType<T['select'], AuditLogCountAggregateOutputType>
        : number
    >

    /**
     * Allows you to perform aggregations operations on a AuditLog.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {AuditLogAggregateArgs} args - Select which aggregations you would like to apply and on what fields.
     * @example
     * // Ordered by age ascending
     * // Where email contains prisma.io
     * // Limited to the 10 users
     * const aggregations = await prisma.user.aggregate({
     *   _avg: {
     *     age: true,
     *   },
     *   where: {
     *     email: {
     *       contains: "prisma.io",
     *     },
     *   },
     *   orderBy: {
     *     age: "asc",
     *   },
     *   take: 10,
     * })
    **/
    aggregate<T extends AuditLogAggregateArgs>(args: Subset<T, AuditLogAggregateArgs>): Prisma.PrismaPromise<GetAuditLogAggregateType<T>>

    /**
     * Group by AuditLog.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {AuditLogGroupByArgs} args - Group by arguments.
     * @example
     * // Group by city, order by createdAt, get count
     * const result = await prisma.user.groupBy({
     *   by: ['city', 'createdAt'],
     *   orderBy: {
     *     createdAt: true
     *   },
     *   _count: {
     *     _all: true
     *   },
     * })
     * 
    **/
    groupBy<
      T extends AuditLogGroupByArgs,
      HasSelectOrTake extends Or<
        Extends<'skip', Keys<T>>,
        Extends<'take', Keys<T>>
      >,
      OrderByArg extends True extends HasSelectOrTake
        ? { orderBy: AuditLogGroupByArgs['orderBy'] }
        : { orderBy?: AuditLogGroupByArgs['orderBy'] },
      OrderFields extends ExcludeUnderscoreKeys<Keys<MaybeTupleToUnion<T['orderBy']>>>,
      ByFields extends MaybeTupleToUnion<T['by']>,
      ByValid extends Has<ByFields, OrderFields>,
      HavingFields extends GetHavingFields<T['having']>,
      HavingValid extends Has<ByFields, HavingFields>,
      ByEmpty extends T['by'] extends never[] ? True : False,
      InputErrors extends ByEmpty extends True
      ? `Error: "by" must not be empty.`
      : HavingValid extends False
      ? {
          [P in HavingFields]: P extends ByFields
            ? never
            : P extends string
            ? `Error: Field "${P}" used in "having" needs to be provided in "by".`
            : [
                Error,
                'Field ',
                P,
                ` in "having" needs to be provided in "by"`,
              ]
        }[HavingFields]
      : 'take' extends Keys<T>
      ? 'orderBy' extends Keys<T>
        ? ByValid extends True
          ? {}
          : {
              [P in OrderFields]: P extends ByFields
                ? never
                : `Error: Field "${P}" in "orderBy" needs to be provided in "by"`
            }[OrderFields]
        : 'Error: If you provide "take", you also need to provide "orderBy"'
      : 'skip' extends Keys<T>
      ? 'orderBy' extends Keys<T>
        ? ByValid extends True
          ? {}
          : {
              [P in OrderFields]: P extends ByFields
                ? never
                : `Error: Field "${P}" in "orderBy" needs to be provided in "by"`
            }[OrderFields]
        : 'Error: If you provide "skip", you also need to provide "orderBy"'
      : ByValid extends True
      ? {}
      : {
          [P in OrderFields]: P extends ByFields
            ? never
            : `Error: Field "${P}" in "orderBy" needs to be provided in "by"`
        }[OrderFields]
    >(args: SubsetIntersection<T, AuditLogGroupByArgs, OrderByArg> & InputErrors): {} extends InputErrors ? GetAuditLogGroupByPayload<T> : Prisma.PrismaPromise<InputErrors>
  /**
   * Fields of the AuditLog model
   */
  readonly fields: AuditLogFieldRefs;
  }

  /**
   * The delegate class that acts as a "Promise-like" for AuditLog.
   * Why is this prefixed with `Prisma__`?
   * Because we want to prevent naming conflicts as mentioned in
   * https://github.com/prisma/prisma-client-js/issues/707
   */
  export interface Prisma__AuditLogClient<T, Null = never, ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs, GlobalOmitOptions = {}> extends Prisma.PrismaPromise<T> {
    readonly [Symbol.toStringTag]: "PrismaPromise"
    /**
     * Attaches callbacks for the resolution and/or rejection of the Promise.
     * @param onfulfilled The callback to execute when the Promise is resolved.
     * @param onrejected The callback to execute when the Promise is rejected.
     * @returns A Promise for the completion of which ever callback is executed.
     */
    then<TResult1 = T, TResult2 = never>(onfulfilled?: ((value: T) => TResult1 | PromiseLike<TResult1>) | undefined | null, onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | undefined | null): $Utils.JsPromise<TResult1 | TResult2>
    /**
     * Attaches a callback for only the rejection of the Promise.
     * @param onrejected The callback to execute when the Promise is rejected.
     * @returns A Promise for the completion of the callback.
     */
    catch<TResult = never>(onrejected?: ((reason: any) => TResult | PromiseLike<TResult>) | undefined | null): $Utils.JsPromise<T | TResult>
    /**
     * Attaches a callback that is invoked when the Promise is settled (fulfilled or rejected). The
     * resolved value cannot be modified from the callback.
     * @param onfinally The callback to execute when the Promise is settled (fulfilled or rejected).
     * @returns A Promise for the completion of the callback.
     */
    finally(onfinally?: (() => void) | undefined | null): $Utils.JsPromise<T>
  }




  /**
   * Fields of the AuditLog model
   */
  interface AuditLogFieldRefs {
    readonly id: FieldRef<"AuditLog", 'String'>
    readonly actorId: FieldRef<"AuditLog", 'String'>
    readonly actionType: FieldRef<"AuditLog", 'String'>
    readonly targetType: FieldRef<"AuditLog", 'String'>
    readonly targetId: FieldRef<"AuditLog", 'String'>
    readonly beforeValue: FieldRef<"AuditLog", 'Json'>
    readonly afterValue: FieldRef<"AuditLog", 'Json'>
    readonly ipAddress: FieldRef<"AuditLog", 'String'>
    readonly createdAt: FieldRef<"AuditLog", 'DateTime'>
  }
    

  // Custom InputTypes
  /**
   * AuditLog findUnique
   */
  export type AuditLogFindUniqueArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the AuditLog
     */
    select?: AuditLogSelect<ExtArgs> | null
    /**
     * Omit specific fields from the AuditLog
     */
    omit?: AuditLogOmit<ExtArgs> | null
    /**
     * Filter, which AuditLog to fetch.
     */
    where: AuditLogWhereUniqueInput
  }

  /**
   * AuditLog findUniqueOrThrow
   */
  export type AuditLogFindUniqueOrThrowArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the AuditLog
     */
    select?: AuditLogSelect<ExtArgs> | null
    /**
     * Omit specific fields from the AuditLog
     */
    omit?: AuditLogOmit<ExtArgs> | null
    /**
     * Filter, which AuditLog to fetch.
     */
    where: AuditLogWhereUniqueInput
  }

  /**
   * AuditLog findFirst
   */
  export type AuditLogFindFirstArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the AuditLog
     */
    select?: AuditLogSelect<ExtArgs> | null
    /**
     * Omit specific fields from the AuditLog
     */
    omit?: AuditLogOmit<ExtArgs> | null
    /**
     * Filter, which AuditLog to fetch.
     */
    where?: AuditLogWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of AuditLogs to fetch.
     */
    orderBy?: AuditLogOrderByWithRelationInput | AuditLogOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the position for searching for AuditLogs.
     */
    cursor?: AuditLogWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` AuditLogs from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` AuditLogs.
     */
    skip?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/distinct Distinct Docs}
     * 
     * Filter by unique combinations of AuditLogs.
     */
    distinct?: AuditLogScalarFieldEnum | AuditLogScalarFieldEnum[]
  }

  /**
   * AuditLog findFirstOrThrow
   */
  export type AuditLogFindFirstOrThrowArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the AuditLog
     */
    select?: AuditLogSelect<ExtArgs> | null
    /**
     * Omit specific fields from the AuditLog
     */
    omit?: AuditLogOmit<ExtArgs> | null
    /**
     * Filter, which AuditLog to fetch.
     */
    where?: AuditLogWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of AuditLogs to fetch.
     */
    orderBy?: AuditLogOrderByWithRelationInput | AuditLogOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the position for searching for AuditLogs.
     */
    cursor?: AuditLogWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` AuditLogs from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` AuditLogs.
     */
    skip?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/distinct Distinct Docs}
     * 
     * Filter by unique combinations of AuditLogs.
     */
    distinct?: AuditLogScalarFieldEnum | AuditLogScalarFieldEnum[]
  }

  /**
   * AuditLog findMany
   */
  export type AuditLogFindManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the AuditLog
     */
    select?: AuditLogSelect<ExtArgs> | null
    /**
     * Omit specific fields from the AuditLog
     */
    omit?: AuditLogOmit<ExtArgs> | null
    /**
     * Filter, which AuditLogs to fetch.
     */
    where?: AuditLogWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of AuditLogs to fetch.
     */
    orderBy?: AuditLogOrderByWithRelationInput | AuditLogOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the position for listing AuditLogs.
     */
    cursor?: AuditLogWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` AuditLogs from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` AuditLogs.
     */
    skip?: number
    distinct?: AuditLogScalarFieldEnum | AuditLogScalarFieldEnum[]
  }

  /**
   * AuditLog create
   */
  export type AuditLogCreateArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the AuditLog
     */
    select?: AuditLogSelect<ExtArgs> | null
    /**
     * Omit specific fields from the AuditLog
     */
    omit?: AuditLogOmit<ExtArgs> | null
    /**
     * The data needed to create a AuditLog.
     */
    data: XOR<AuditLogCreateInput, AuditLogUncheckedCreateInput>
  }

  /**
   * AuditLog createMany
   */
  export type AuditLogCreateManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * The data used to create many AuditLogs.
     */
    data: AuditLogCreateManyInput | AuditLogCreateManyInput[]
    skipDuplicates?: boolean
  }

  /**
   * AuditLog createManyAndReturn
   */
  export type AuditLogCreateManyAndReturnArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the AuditLog
     */
    select?: AuditLogSelectCreateManyAndReturn<ExtArgs> | null
    /**
     * Omit specific fields from the AuditLog
     */
    omit?: AuditLogOmit<ExtArgs> | null
    /**
     * The data used to create many AuditLogs.
     */
    data: AuditLogCreateManyInput | AuditLogCreateManyInput[]
    skipDuplicates?: boolean
  }

  /**
   * AuditLog update
   */
  export type AuditLogUpdateArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the AuditLog
     */
    select?: AuditLogSelect<ExtArgs> | null
    /**
     * Omit specific fields from the AuditLog
     */
    omit?: AuditLogOmit<ExtArgs> | null
    /**
     * The data needed to update a AuditLog.
     */
    data: XOR<AuditLogUpdateInput, AuditLogUncheckedUpdateInput>
    /**
     * Choose, which AuditLog to update.
     */
    where: AuditLogWhereUniqueInput
  }

  /**
   * AuditLog updateMany
   */
  export type AuditLogUpdateManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * The data used to update AuditLogs.
     */
    data: XOR<AuditLogUpdateManyMutationInput, AuditLogUncheckedUpdateManyInput>
    /**
     * Filter which AuditLogs to update
     */
    where?: AuditLogWhereInput
    /**
     * Limit how many AuditLogs to update.
     */
    limit?: number
  }

  /**
   * AuditLog updateManyAndReturn
   */
  export type AuditLogUpdateManyAndReturnArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the AuditLog
     */
    select?: AuditLogSelectUpdateManyAndReturn<ExtArgs> | null
    /**
     * Omit specific fields from the AuditLog
     */
    omit?: AuditLogOmit<ExtArgs> | null
    /**
     * The data used to update AuditLogs.
     */
    data: XOR<AuditLogUpdateManyMutationInput, AuditLogUncheckedUpdateManyInput>
    /**
     * Filter which AuditLogs to update
     */
    where?: AuditLogWhereInput
    /**
     * Limit how many AuditLogs to update.
     */
    limit?: number
  }

  /**
   * AuditLog upsert
   */
  export type AuditLogUpsertArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the AuditLog
     */
    select?: AuditLogSelect<ExtArgs> | null
    /**
     * Omit specific fields from the AuditLog
     */
    omit?: AuditLogOmit<ExtArgs> | null
    /**
     * The filter to search for the AuditLog to update in case it exists.
     */
    where: AuditLogWhereUniqueInput
    /**
     * In case the AuditLog found by the `where` argument doesn't exist, create a new AuditLog with this data.
     */
    create: XOR<AuditLogCreateInput, AuditLogUncheckedCreateInput>
    /**
     * In case the AuditLog was found with the provided `where` argument, update it with this data.
     */
    update: XOR<AuditLogUpdateInput, AuditLogUncheckedUpdateInput>
  }

  /**
   * AuditLog delete
   */
  export type AuditLogDeleteArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the AuditLog
     */
    select?: AuditLogSelect<ExtArgs> | null
    /**
     * Omit specific fields from the AuditLog
     */
    omit?: AuditLogOmit<ExtArgs> | null
    /**
     * Filter which AuditLog to delete.
     */
    where: AuditLogWhereUniqueInput
  }

  /**
   * AuditLog deleteMany
   */
  export type AuditLogDeleteManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Filter which AuditLogs to delete
     */
    where?: AuditLogWhereInput
    /**
     * Limit how many AuditLogs to delete.
     */
    limit?: number
  }

  /**
   * AuditLog without action
   */
  export type AuditLogDefaultArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the AuditLog
     */
    select?: AuditLogSelect<ExtArgs> | null
    /**
     * Omit specific fields from the AuditLog
     */
    omit?: AuditLogOmit<ExtArgs> | null
  }


  /**
   * Model AbacDecisionLog
   */

  export type AggregateAbacDecisionLog = {
    _count: AbacDecisionLogCountAggregateOutputType | null
    _min: AbacDecisionLogMinAggregateOutputType | null
    _max: AbacDecisionLogMaxAggregateOutputType | null
  }

  export type AbacDecisionLogMinAggregateOutputType = {
    id: string | null
    userId: string | null
    resourceType: string | null
    resourceId: string | null
    action: string | null
    decision: string | null
    logLevel: string | null
    createdAt: Date | null
  }

  export type AbacDecisionLogMaxAggregateOutputType = {
    id: string | null
    userId: string | null
    resourceType: string | null
    resourceId: string | null
    action: string | null
    decision: string | null
    logLevel: string | null
    createdAt: Date | null
  }

  export type AbacDecisionLogCountAggregateOutputType = {
    id: number
    userId: number
    resourceType: number
    resourceId: number
    action: number
    decision: number
    rulesEvaluated: number
    logLevel: number
    createdAt: number
    _all: number
  }


  export type AbacDecisionLogMinAggregateInputType = {
    id?: true
    userId?: true
    resourceType?: true
    resourceId?: true
    action?: true
    decision?: true
    logLevel?: true
    createdAt?: true
  }

  export type AbacDecisionLogMaxAggregateInputType = {
    id?: true
    userId?: true
    resourceType?: true
    resourceId?: true
    action?: true
    decision?: true
    logLevel?: true
    createdAt?: true
  }

  export type AbacDecisionLogCountAggregateInputType = {
    id?: true
    userId?: true
    resourceType?: true
    resourceId?: true
    action?: true
    decision?: true
    rulesEvaluated?: true
    logLevel?: true
    createdAt?: true
    _all?: true
  }

  export type AbacDecisionLogAggregateArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Filter which AbacDecisionLog to aggregate.
     */
    where?: AbacDecisionLogWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of AbacDecisionLogs to fetch.
     */
    orderBy?: AbacDecisionLogOrderByWithRelationInput | AbacDecisionLogOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the start position
     */
    cursor?: AbacDecisionLogWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` AbacDecisionLogs from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` AbacDecisionLogs.
     */
    skip?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Count returned AbacDecisionLogs
    **/
    _count?: true | AbacDecisionLogCountAggregateInputType
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Select which fields to find the minimum value
    **/
    _min?: AbacDecisionLogMinAggregateInputType
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Select which fields to find the maximum value
    **/
    _max?: AbacDecisionLogMaxAggregateInputType
  }

  export type GetAbacDecisionLogAggregateType<T extends AbacDecisionLogAggregateArgs> = {
        [P in keyof T & keyof AggregateAbacDecisionLog]: P extends '_count' | 'count'
      ? T[P] extends true
        ? number
        : GetScalarType<T[P], AggregateAbacDecisionLog[P]>
      : GetScalarType<T[P], AggregateAbacDecisionLog[P]>
  }




  export type AbacDecisionLogGroupByArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    where?: AbacDecisionLogWhereInput
    orderBy?: AbacDecisionLogOrderByWithAggregationInput | AbacDecisionLogOrderByWithAggregationInput[]
    by: AbacDecisionLogScalarFieldEnum[] | AbacDecisionLogScalarFieldEnum
    having?: AbacDecisionLogScalarWhereWithAggregatesInput
    take?: number
    skip?: number
    _count?: AbacDecisionLogCountAggregateInputType | true
    _min?: AbacDecisionLogMinAggregateInputType
    _max?: AbacDecisionLogMaxAggregateInputType
  }

  export type AbacDecisionLogGroupByOutputType = {
    id: string
    userId: string
    resourceType: string
    resourceId: string | null
    action: string
    decision: string
    rulesEvaluated: JsonValue
    logLevel: string
    createdAt: Date
    _count: AbacDecisionLogCountAggregateOutputType | null
    _min: AbacDecisionLogMinAggregateOutputType | null
    _max: AbacDecisionLogMaxAggregateOutputType | null
  }

  type GetAbacDecisionLogGroupByPayload<T extends AbacDecisionLogGroupByArgs> = Prisma.PrismaPromise<
    Array<
      PickEnumerable<AbacDecisionLogGroupByOutputType, T['by']> &
        {
          [P in ((keyof T) & (keyof AbacDecisionLogGroupByOutputType))]: P extends '_count'
            ? T[P] extends boolean
              ? number
              : GetScalarType<T[P], AbacDecisionLogGroupByOutputType[P]>
            : GetScalarType<T[P], AbacDecisionLogGroupByOutputType[P]>
        }
      >
    >


  export type AbacDecisionLogSelect<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetSelect<{
    id?: boolean
    userId?: boolean
    resourceType?: boolean
    resourceId?: boolean
    action?: boolean
    decision?: boolean
    rulesEvaluated?: boolean
    logLevel?: boolean
    createdAt?: boolean
  }, ExtArgs["result"]["abacDecisionLog"]>

  export type AbacDecisionLogSelectCreateManyAndReturn<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetSelect<{
    id?: boolean
    userId?: boolean
    resourceType?: boolean
    resourceId?: boolean
    action?: boolean
    decision?: boolean
    rulesEvaluated?: boolean
    logLevel?: boolean
    createdAt?: boolean
  }, ExtArgs["result"]["abacDecisionLog"]>

  export type AbacDecisionLogSelectUpdateManyAndReturn<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetSelect<{
    id?: boolean
    userId?: boolean
    resourceType?: boolean
    resourceId?: boolean
    action?: boolean
    decision?: boolean
    rulesEvaluated?: boolean
    logLevel?: boolean
    createdAt?: boolean
  }, ExtArgs["result"]["abacDecisionLog"]>

  export type AbacDecisionLogSelectScalar = {
    id?: boolean
    userId?: boolean
    resourceType?: boolean
    resourceId?: boolean
    action?: boolean
    decision?: boolean
    rulesEvaluated?: boolean
    logLevel?: boolean
    createdAt?: boolean
  }

  export type AbacDecisionLogOmit<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetOmit<"id" | "userId" | "resourceType" | "resourceId" | "action" | "decision" | "rulesEvaluated" | "logLevel" | "createdAt", ExtArgs["result"]["abacDecisionLog"]>

  export type $AbacDecisionLogPayload<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    name: "AbacDecisionLog"
    objects: {}
    scalars: $Extensions.GetPayloadResult<{
      id: string
      userId: string
      resourceType: string
      resourceId: string | null
      action: string
      decision: string
      rulesEvaluated: Prisma.JsonValue
      logLevel: string
      createdAt: Date
    }, ExtArgs["result"]["abacDecisionLog"]>
    composites: {}
  }

  type AbacDecisionLogGetPayload<S extends boolean | null | undefined | AbacDecisionLogDefaultArgs> = $Result.GetResult<Prisma.$AbacDecisionLogPayload, S>

  type AbacDecisionLogCountArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> =
    Omit<AbacDecisionLogFindManyArgs, 'select' | 'include' | 'distinct' | 'omit'> & {
      select?: AbacDecisionLogCountAggregateInputType | true
    }

  export interface AbacDecisionLogDelegate<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs, GlobalOmitOptions = {}> {
    [K: symbol]: { types: Prisma.TypeMap<ExtArgs>['model']['AbacDecisionLog'], meta: { name: 'AbacDecisionLog' } }
    /**
     * Find zero or one AbacDecisionLog that matches the filter.
     * @param {AbacDecisionLogFindUniqueArgs} args - Arguments to find a AbacDecisionLog
     * @example
     * // Get one AbacDecisionLog
     * const abacDecisionLog = await prisma.abacDecisionLog.findUnique({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findUnique<T extends AbacDecisionLogFindUniqueArgs>(args: SelectSubset<T, AbacDecisionLogFindUniqueArgs<ExtArgs>>): Prisma__AbacDecisionLogClient<$Result.GetResult<Prisma.$AbacDecisionLogPayload<ExtArgs>, T, "findUnique", GlobalOmitOptions> | null, null, ExtArgs, GlobalOmitOptions>

    /**
     * Find one AbacDecisionLog that matches the filter or throw an error with `error.code='P2025'`
     * if no matches were found.
     * @param {AbacDecisionLogFindUniqueOrThrowArgs} args - Arguments to find a AbacDecisionLog
     * @example
     * // Get one AbacDecisionLog
     * const abacDecisionLog = await prisma.abacDecisionLog.findUniqueOrThrow({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findUniqueOrThrow<T extends AbacDecisionLogFindUniqueOrThrowArgs>(args: SelectSubset<T, AbacDecisionLogFindUniqueOrThrowArgs<ExtArgs>>): Prisma__AbacDecisionLogClient<$Result.GetResult<Prisma.$AbacDecisionLogPayload<ExtArgs>, T, "findUniqueOrThrow", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Find the first AbacDecisionLog that matches the filter.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {AbacDecisionLogFindFirstArgs} args - Arguments to find a AbacDecisionLog
     * @example
     * // Get one AbacDecisionLog
     * const abacDecisionLog = await prisma.abacDecisionLog.findFirst({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findFirst<T extends AbacDecisionLogFindFirstArgs>(args?: SelectSubset<T, AbacDecisionLogFindFirstArgs<ExtArgs>>): Prisma__AbacDecisionLogClient<$Result.GetResult<Prisma.$AbacDecisionLogPayload<ExtArgs>, T, "findFirst", GlobalOmitOptions> | null, null, ExtArgs, GlobalOmitOptions>

    /**
     * Find the first AbacDecisionLog that matches the filter or
     * throw `PrismaKnownClientError` with `P2025` code if no matches were found.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {AbacDecisionLogFindFirstOrThrowArgs} args - Arguments to find a AbacDecisionLog
     * @example
     * // Get one AbacDecisionLog
     * const abacDecisionLog = await prisma.abacDecisionLog.findFirstOrThrow({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findFirstOrThrow<T extends AbacDecisionLogFindFirstOrThrowArgs>(args?: SelectSubset<T, AbacDecisionLogFindFirstOrThrowArgs<ExtArgs>>): Prisma__AbacDecisionLogClient<$Result.GetResult<Prisma.$AbacDecisionLogPayload<ExtArgs>, T, "findFirstOrThrow", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Find zero or more AbacDecisionLogs that matches the filter.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {AbacDecisionLogFindManyArgs} args - Arguments to filter and select certain fields only.
     * @example
     * // Get all AbacDecisionLogs
     * const abacDecisionLogs = await prisma.abacDecisionLog.findMany()
     * 
     * // Get first 10 AbacDecisionLogs
     * const abacDecisionLogs = await prisma.abacDecisionLog.findMany({ take: 10 })
     * 
     * // Only select the `id`
     * const abacDecisionLogWithIdOnly = await prisma.abacDecisionLog.findMany({ select: { id: true } })
     * 
     */
    findMany<T extends AbacDecisionLogFindManyArgs>(args?: SelectSubset<T, AbacDecisionLogFindManyArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$AbacDecisionLogPayload<ExtArgs>, T, "findMany", GlobalOmitOptions>>

    /**
     * Create a AbacDecisionLog.
     * @param {AbacDecisionLogCreateArgs} args - Arguments to create a AbacDecisionLog.
     * @example
     * // Create one AbacDecisionLog
     * const AbacDecisionLog = await prisma.abacDecisionLog.create({
     *   data: {
     *     // ... data to create a AbacDecisionLog
     *   }
     * })
     * 
     */
    create<T extends AbacDecisionLogCreateArgs>(args: SelectSubset<T, AbacDecisionLogCreateArgs<ExtArgs>>): Prisma__AbacDecisionLogClient<$Result.GetResult<Prisma.$AbacDecisionLogPayload<ExtArgs>, T, "create", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Create many AbacDecisionLogs.
     * @param {AbacDecisionLogCreateManyArgs} args - Arguments to create many AbacDecisionLogs.
     * @example
     * // Create many AbacDecisionLogs
     * const abacDecisionLog = await prisma.abacDecisionLog.createMany({
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     *     
     */
    createMany<T extends AbacDecisionLogCreateManyArgs>(args?: SelectSubset<T, AbacDecisionLogCreateManyArgs<ExtArgs>>): Prisma.PrismaPromise<BatchPayload>

    /**
     * Create many AbacDecisionLogs and returns the data saved in the database.
     * @param {AbacDecisionLogCreateManyAndReturnArgs} args - Arguments to create many AbacDecisionLogs.
     * @example
     * // Create many AbacDecisionLogs
     * const abacDecisionLog = await prisma.abacDecisionLog.createManyAndReturn({
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * 
     * // Create many AbacDecisionLogs and only return the `id`
     * const abacDecisionLogWithIdOnly = await prisma.abacDecisionLog.createManyAndReturn({
     *   select: { id: true },
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * 
     */
    createManyAndReturn<T extends AbacDecisionLogCreateManyAndReturnArgs>(args?: SelectSubset<T, AbacDecisionLogCreateManyAndReturnArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$AbacDecisionLogPayload<ExtArgs>, T, "createManyAndReturn", GlobalOmitOptions>>

    /**
     * Delete a AbacDecisionLog.
     * @param {AbacDecisionLogDeleteArgs} args - Arguments to delete one AbacDecisionLog.
     * @example
     * // Delete one AbacDecisionLog
     * const AbacDecisionLog = await prisma.abacDecisionLog.delete({
     *   where: {
     *     // ... filter to delete one AbacDecisionLog
     *   }
     * })
     * 
     */
    delete<T extends AbacDecisionLogDeleteArgs>(args: SelectSubset<T, AbacDecisionLogDeleteArgs<ExtArgs>>): Prisma__AbacDecisionLogClient<$Result.GetResult<Prisma.$AbacDecisionLogPayload<ExtArgs>, T, "delete", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Update one AbacDecisionLog.
     * @param {AbacDecisionLogUpdateArgs} args - Arguments to update one AbacDecisionLog.
     * @example
     * // Update one AbacDecisionLog
     * const abacDecisionLog = await prisma.abacDecisionLog.update({
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: {
     *     // ... provide data here
     *   }
     * })
     * 
     */
    update<T extends AbacDecisionLogUpdateArgs>(args: SelectSubset<T, AbacDecisionLogUpdateArgs<ExtArgs>>): Prisma__AbacDecisionLogClient<$Result.GetResult<Prisma.$AbacDecisionLogPayload<ExtArgs>, T, "update", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Delete zero or more AbacDecisionLogs.
     * @param {AbacDecisionLogDeleteManyArgs} args - Arguments to filter AbacDecisionLogs to delete.
     * @example
     * // Delete a few AbacDecisionLogs
     * const { count } = await prisma.abacDecisionLog.deleteMany({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     * 
     */
    deleteMany<T extends AbacDecisionLogDeleteManyArgs>(args?: SelectSubset<T, AbacDecisionLogDeleteManyArgs<ExtArgs>>): Prisma.PrismaPromise<BatchPayload>

    /**
     * Update zero or more AbacDecisionLogs.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {AbacDecisionLogUpdateManyArgs} args - Arguments to update one or more rows.
     * @example
     * // Update many AbacDecisionLogs
     * const abacDecisionLog = await prisma.abacDecisionLog.updateMany({
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: {
     *     // ... provide data here
     *   }
     * })
     * 
     */
    updateMany<T extends AbacDecisionLogUpdateManyArgs>(args: SelectSubset<T, AbacDecisionLogUpdateManyArgs<ExtArgs>>): Prisma.PrismaPromise<BatchPayload>

    /**
     * Update zero or more AbacDecisionLogs and returns the data updated in the database.
     * @param {AbacDecisionLogUpdateManyAndReturnArgs} args - Arguments to update many AbacDecisionLogs.
     * @example
     * // Update many AbacDecisionLogs
     * const abacDecisionLog = await prisma.abacDecisionLog.updateManyAndReturn({
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * 
     * // Update zero or more AbacDecisionLogs and only return the `id`
     * const abacDecisionLogWithIdOnly = await prisma.abacDecisionLog.updateManyAndReturn({
     *   select: { id: true },
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * 
     */
    updateManyAndReturn<T extends AbacDecisionLogUpdateManyAndReturnArgs>(args: SelectSubset<T, AbacDecisionLogUpdateManyAndReturnArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$AbacDecisionLogPayload<ExtArgs>, T, "updateManyAndReturn", GlobalOmitOptions>>

    /**
     * Create or update one AbacDecisionLog.
     * @param {AbacDecisionLogUpsertArgs} args - Arguments to update or create a AbacDecisionLog.
     * @example
     * // Update or create a AbacDecisionLog
     * const abacDecisionLog = await prisma.abacDecisionLog.upsert({
     *   create: {
     *     // ... data to create a AbacDecisionLog
     *   },
     *   update: {
     *     // ... in case it already exists, update
     *   },
     *   where: {
     *     // ... the filter for the AbacDecisionLog we want to update
     *   }
     * })
     */
    upsert<T extends AbacDecisionLogUpsertArgs>(args: SelectSubset<T, AbacDecisionLogUpsertArgs<ExtArgs>>): Prisma__AbacDecisionLogClient<$Result.GetResult<Prisma.$AbacDecisionLogPayload<ExtArgs>, T, "upsert", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>


    /**
     * Count the number of AbacDecisionLogs.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {AbacDecisionLogCountArgs} args - Arguments to filter AbacDecisionLogs to count.
     * @example
     * // Count the number of AbacDecisionLogs
     * const count = await prisma.abacDecisionLog.count({
     *   where: {
     *     // ... the filter for the AbacDecisionLogs we want to count
     *   }
     * })
    **/
    count<T extends AbacDecisionLogCountArgs>(
      args?: Subset<T, AbacDecisionLogCountArgs>,
    ): Prisma.PrismaPromise<
      T extends $Utils.Record<'select', any>
        ? T['select'] extends true
          ? number
          : GetScalarType<T['select'], AbacDecisionLogCountAggregateOutputType>
        : number
    >

    /**
     * Allows you to perform aggregations operations on a AbacDecisionLog.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {AbacDecisionLogAggregateArgs} args - Select which aggregations you would like to apply and on what fields.
     * @example
     * // Ordered by age ascending
     * // Where email contains prisma.io
     * // Limited to the 10 users
     * const aggregations = await prisma.user.aggregate({
     *   _avg: {
     *     age: true,
     *   },
     *   where: {
     *     email: {
     *       contains: "prisma.io",
     *     },
     *   },
     *   orderBy: {
     *     age: "asc",
     *   },
     *   take: 10,
     * })
    **/
    aggregate<T extends AbacDecisionLogAggregateArgs>(args: Subset<T, AbacDecisionLogAggregateArgs>): Prisma.PrismaPromise<GetAbacDecisionLogAggregateType<T>>

    /**
     * Group by AbacDecisionLog.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {AbacDecisionLogGroupByArgs} args - Group by arguments.
     * @example
     * // Group by city, order by createdAt, get count
     * const result = await prisma.user.groupBy({
     *   by: ['city', 'createdAt'],
     *   orderBy: {
     *     createdAt: true
     *   },
     *   _count: {
     *     _all: true
     *   },
     * })
     * 
    **/
    groupBy<
      T extends AbacDecisionLogGroupByArgs,
      HasSelectOrTake extends Or<
        Extends<'skip', Keys<T>>,
        Extends<'take', Keys<T>>
      >,
      OrderByArg extends True extends HasSelectOrTake
        ? { orderBy: AbacDecisionLogGroupByArgs['orderBy'] }
        : { orderBy?: AbacDecisionLogGroupByArgs['orderBy'] },
      OrderFields extends ExcludeUnderscoreKeys<Keys<MaybeTupleToUnion<T['orderBy']>>>,
      ByFields extends MaybeTupleToUnion<T['by']>,
      ByValid extends Has<ByFields, OrderFields>,
      HavingFields extends GetHavingFields<T['having']>,
      HavingValid extends Has<ByFields, HavingFields>,
      ByEmpty extends T['by'] extends never[] ? True : False,
      InputErrors extends ByEmpty extends True
      ? `Error: "by" must not be empty.`
      : HavingValid extends False
      ? {
          [P in HavingFields]: P extends ByFields
            ? never
            : P extends string
            ? `Error: Field "${P}" used in "having" needs to be provided in "by".`
            : [
                Error,
                'Field ',
                P,
                ` in "having" needs to be provided in "by"`,
              ]
        }[HavingFields]
      : 'take' extends Keys<T>
      ? 'orderBy' extends Keys<T>
        ? ByValid extends True
          ? {}
          : {
              [P in OrderFields]: P extends ByFields
                ? never
                : `Error: Field "${P}" in "orderBy" needs to be provided in "by"`
            }[OrderFields]
        : 'Error: If you provide "take", you also need to provide "orderBy"'
      : 'skip' extends Keys<T>
      ? 'orderBy' extends Keys<T>
        ? ByValid extends True
          ? {}
          : {
              [P in OrderFields]: P extends ByFields
                ? never
                : `Error: Field "${P}" in "orderBy" needs to be provided in "by"`
            }[OrderFields]
        : 'Error: If you provide "skip", you also need to provide "orderBy"'
      : ByValid extends True
      ? {}
      : {
          [P in OrderFields]: P extends ByFields
            ? never
            : `Error: Field "${P}" in "orderBy" needs to be provided in "by"`
        }[OrderFields]
    >(args: SubsetIntersection<T, AbacDecisionLogGroupByArgs, OrderByArg> & InputErrors): {} extends InputErrors ? GetAbacDecisionLogGroupByPayload<T> : Prisma.PrismaPromise<InputErrors>
  /**
   * Fields of the AbacDecisionLog model
   */
  readonly fields: AbacDecisionLogFieldRefs;
  }

  /**
   * The delegate class that acts as a "Promise-like" for AbacDecisionLog.
   * Why is this prefixed with `Prisma__`?
   * Because we want to prevent naming conflicts as mentioned in
   * https://github.com/prisma/prisma-client-js/issues/707
   */
  export interface Prisma__AbacDecisionLogClient<T, Null = never, ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs, GlobalOmitOptions = {}> extends Prisma.PrismaPromise<T> {
    readonly [Symbol.toStringTag]: "PrismaPromise"
    /**
     * Attaches callbacks for the resolution and/or rejection of the Promise.
     * @param onfulfilled The callback to execute when the Promise is resolved.
     * @param onrejected The callback to execute when the Promise is rejected.
     * @returns A Promise for the completion of which ever callback is executed.
     */
    then<TResult1 = T, TResult2 = never>(onfulfilled?: ((value: T) => TResult1 | PromiseLike<TResult1>) | undefined | null, onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | undefined | null): $Utils.JsPromise<TResult1 | TResult2>
    /**
     * Attaches a callback for only the rejection of the Promise.
     * @param onrejected The callback to execute when the Promise is rejected.
     * @returns A Promise for the completion of the callback.
     */
    catch<TResult = never>(onrejected?: ((reason: any) => TResult | PromiseLike<TResult>) | undefined | null): $Utils.JsPromise<T | TResult>
    /**
     * Attaches a callback that is invoked when the Promise is settled (fulfilled or rejected). The
     * resolved value cannot be modified from the callback.
     * @param onfinally The callback to execute when the Promise is settled (fulfilled or rejected).
     * @returns A Promise for the completion of the callback.
     */
    finally(onfinally?: (() => void) | undefined | null): $Utils.JsPromise<T>
  }




  /**
   * Fields of the AbacDecisionLog model
   */
  interface AbacDecisionLogFieldRefs {
    readonly id: FieldRef<"AbacDecisionLog", 'String'>
    readonly userId: FieldRef<"AbacDecisionLog", 'String'>
    readonly resourceType: FieldRef<"AbacDecisionLog", 'String'>
    readonly resourceId: FieldRef<"AbacDecisionLog", 'String'>
    readonly action: FieldRef<"AbacDecisionLog", 'String'>
    readonly decision: FieldRef<"AbacDecisionLog", 'String'>
    readonly rulesEvaluated: FieldRef<"AbacDecisionLog", 'Json'>
    readonly logLevel: FieldRef<"AbacDecisionLog", 'String'>
    readonly createdAt: FieldRef<"AbacDecisionLog", 'DateTime'>
  }
    

  // Custom InputTypes
  /**
   * AbacDecisionLog findUnique
   */
  export type AbacDecisionLogFindUniqueArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the AbacDecisionLog
     */
    select?: AbacDecisionLogSelect<ExtArgs> | null
    /**
     * Omit specific fields from the AbacDecisionLog
     */
    omit?: AbacDecisionLogOmit<ExtArgs> | null
    /**
     * Filter, which AbacDecisionLog to fetch.
     */
    where: AbacDecisionLogWhereUniqueInput
  }

  /**
   * AbacDecisionLog findUniqueOrThrow
   */
  export type AbacDecisionLogFindUniqueOrThrowArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the AbacDecisionLog
     */
    select?: AbacDecisionLogSelect<ExtArgs> | null
    /**
     * Omit specific fields from the AbacDecisionLog
     */
    omit?: AbacDecisionLogOmit<ExtArgs> | null
    /**
     * Filter, which AbacDecisionLog to fetch.
     */
    where: AbacDecisionLogWhereUniqueInput
  }

  /**
   * AbacDecisionLog findFirst
   */
  export type AbacDecisionLogFindFirstArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the AbacDecisionLog
     */
    select?: AbacDecisionLogSelect<ExtArgs> | null
    /**
     * Omit specific fields from the AbacDecisionLog
     */
    omit?: AbacDecisionLogOmit<ExtArgs> | null
    /**
     * Filter, which AbacDecisionLog to fetch.
     */
    where?: AbacDecisionLogWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of AbacDecisionLogs to fetch.
     */
    orderBy?: AbacDecisionLogOrderByWithRelationInput | AbacDecisionLogOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the position for searching for AbacDecisionLogs.
     */
    cursor?: AbacDecisionLogWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` AbacDecisionLogs from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` AbacDecisionLogs.
     */
    skip?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/distinct Distinct Docs}
     * 
     * Filter by unique combinations of AbacDecisionLogs.
     */
    distinct?: AbacDecisionLogScalarFieldEnum | AbacDecisionLogScalarFieldEnum[]
  }

  /**
   * AbacDecisionLog findFirstOrThrow
   */
  export type AbacDecisionLogFindFirstOrThrowArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the AbacDecisionLog
     */
    select?: AbacDecisionLogSelect<ExtArgs> | null
    /**
     * Omit specific fields from the AbacDecisionLog
     */
    omit?: AbacDecisionLogOmit<ExtArgs> | null
    /**
     * Filter, which AbacDecisionLog to fetch.
     */
    where?: AbacDecisionLogWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of AbacDecisionLogs to fetch.
     */
    orderBy?: AbacDecisionLogOrderByWithRelationInput | AbacDecisionLogOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the position for searching for AbacDecisionLogs.
     */
    cursor?: AbacDecisionLogWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` AbacDecisionLogs from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` AbacDecisionLogs.
     */
    skip?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/distinct Distinct Docs}
     * 
     * Filter by unique combinations of AbacDecisionLogs.
     */
    distinct?: AbacDecisionLogScalarFieldEnum | AbacDecisionLogScalarFieldEnum[]
  }

  /**
   * AbacDecisionLog findMany
   */
  export type AbacDecisionLogFindManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the AbacDecisionLog
     */
    select?: AbacDecisionLogSelect<ExtArgs> | null
    /**
     * Omit specific fields from the AbacDecisionLog
     */
    omit?: AbacDecisionLogOmit<ExtArgs> | null
    /**
     * Filter, which AbacDecisionLogs to fetch.
     */
    where?: AbacDecisionLogWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of AbacDecisionLogs to fetch.
     */
    orderBy?: AbacDecisionLogOrderByWithRelationInput | AbacDecisionLogOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the position for listing AbacDecisionLogs.
     */
    cursor?: AbacDecisionLogWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` AbacDecisionLogs from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` AbacDecisionLogs.
     */
    skip?: number
    distinct?: AbacDecisionLogScalarFieldEnum | AbacDecisionLogScalarFieldEnum[]
  }

  /**
   * AbacDecisionLog create
   */
  export type AbacDecisionLogCreateArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the AbacDecisionLog
     */
    select?: AbacDecisionLogSelect<ExtArgs> | null
    /**
     * Omit specific fields from the AbacDecisionLog
     */
    omit?: AbacDecisionLogOmit<ExtArgs> | null
    /**
     * The data needed to create a AbacDecisionLog.
     */
    data: XOR<AbacDecisionLogCreateInput, AbacDecisionLogUncheckedCreateInput>
  }

  /**
   * AbacDecisionLog createMany
   */
  export type AbacDecisionLogCreateManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * The data used to create many AbacDecisionLogs.
     */
    data: AbacDecisionLogCreateManyInput | AbacDecisionLogCreateManyInput[]
    skipDuplicates?: boolean
  }

  /**
   * AbacDecisionLog createManyAndReturn
   */
  export type AbacDecisionLogCreateManyAndReturnArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the AbacDecisionLog
     */
    select?: AbacDecisionLogSelectCreateManyAndReturn<ExtArgs> | null
    /**
     * Omit specific fields from the AbacDecisionLog
     */
    omit?: AbacDecisionLogOmit<ExtArgs> | null
    /**
     * The data used to create many AbacDecisionLogs.
     */
    data: AbacDecisionLogCreateManyInput | AbacDecisionLogCreateManyInput[]
    skipDuplicates?: boolean
  }

  /**
   * AbacDecisionLog update
   */
  export type AbacDecisionLogUpdateArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the AbacDecisionLog
     */
    select?: AbacDecisionLogSelect<ExtArgs> | null
    /**
     * Omit specific fields from the AbacDecisionLog
     */
    omit?: AbacDecisionLogOmit<ExtArgs> | null
    /**
     * The data needed to update a AbacDecisionLog.
     */
    data: XOR<AbacDecisionLogUpdateInput, AbacDecisionLogUncheckedUpdateInput>
    /**
     * Choose, which AbacDecisionLog to update.
     */
    where: AbacDecisionLogWhereUniqueInput
  }

  /**
   * AbacDecisionLog updateMany
   */
  export type AbacDecisionLogUpdateManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * The data used to update AbacDecisionLogs.
     */
    data: XOR<AbacDecisionLogUpdateManyMutationInput, AbacDecisionLogUncheckedUpdateManyInput>
    /**
     * Filter which AbacDecisionLogs to update
     */
    where?: AbacDecisionLogWhereInput
    /**
     * Limit how many AbacDecisionLogs to update.
     */
    limit?: number
  }

  /**
   * AbacDecisionLog updateManyAndReturn
   */
  export type AbacDecisionLogUpdateManyAndReturnArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the AbacDecisionLog
     */
    select?: AbacDecisionLogSelectUpdateManyAndReturn<ExtArgs> | null
    /**
     * Omit specific fields from the AbacDecisionLog
     */
    omit?: AbacDecisionLogOmit<ExtArgs> | null
    /**
     * The data used to update AbacDecisionLogs.
     */
    data: XOR<AbacDecisionLogUpdateManyMutationInput, AbacDecisionLogUncheckedUpdateManyInput>
    /**
     * Filter which AbacDecisionLogs to update
     */
    where?: AbacDecisionLogWhereInput
    /**
     * Limit how many AbacDecisionLogs to update.
     */
    limit?: number
  }

  /**
   * AbacDecisionLog upsert
   */
  export type AbacDecisionLogUpsertArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the AbacDecisionLog
     */
    select?: AbacDecisionLogSelect<ExtArgs> | null
    /**
     * Omit specific fields from the AbacDecisionLog
     */
    omit?: AbacDecisionLogOmit<ExtArgs> | null
    /**
     * The filter to search for the AbacDecisionLog to update in case it exists.
     */
    where: AbacDecisionLogWhereUniqueInput
    /**
     * In case the AbacDecisionLog found by the `where` argument doesn't exist, create a new AbacDecisionLog with this data.
     */
    create: XOR<AbacDecisionLogCreateInput, AbacDecisionLogUncheckedCreateInput>
    /**
     * In case the AbacDecisionLog was found with the provided `where` argument, update it with this data.
     */
    update: XOR<AbacDecisionLogUpdateInput, AbacDecisionLogUncheckedUpdateInput>
  }

  /**
   * AbacDecisionLog delete
   */
  export type AbacDecisionLogDeleteArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the AbacDecisionLog
     */
    select?: AbacDecisionLogSelect<ExtArgs> | null
    /**
     * Omit specific fields from the AbacDecisionLog
     */
    omit?: AbacDecisionLogOmit<ExtArgs> | null
    /**
     * Filter which AbacDecisionLog to delete.
     */
    where: AbacDecisionLogWhereUniqueInput
  }

  /**
   * AbacDecisionLog deleteMany
   */
  export type AbacDecisionLogDeleteManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Filter which AbacDecisionLogs to delete
     */
    where?: AbacDecisionLogWhereInput
    /**
     * Limit how many AbacDecisionLogs to delete.
     */
    limit?: number
  }

  /**
   * AbacDecisionLog without action
   */
  export type AbacDecisionLogDefaultArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the AbacDecisionLog
     */
    select?: AbacDecisionLogSelect<ExtArgs> | null
    /**
     * Omit specific fields from the AbacDecisionLog
     */
    omit?: AbacDecisionLogOmit<ExtArgs> | null
  }


  /**
   * Model ActionRegistry
   */

  export type AggregateActionRegistry = {
    _count: ActionRegistryCountAggregateOutputType | null
    _min: ActionRegistryMinAggregateOutputType | null
    _max: ActionRegistryMaxAggregateOutputType | null
  }

  export type ActionRegistryMinAggregateOutputType = {
    id: string | null
    pluginId: string | null
    actionKey: string | null
    labelI18nKey: string | null
    description: string | null
    defaultRole: string | null
    createdAt: Date | null
  }

  export type ActionRegistryMaxAggregateOutputType = {
    id: string | null
    pluginId: string | null
    actionKey: string | null
    labelI18nKey: string | null
    description: string | null
    defaultRole: string | null
    createdAt: Date | null
  }

  export type ActionRegistryCountAggregateOutputType = {
    id: number
    pluginId: number
    actionKey: number
    labelI18nKey: number
    description: number
    defaultRole: number
    createdAt: number
    _all: number
  }


  export type ActionRegistryMinAggregateInputType = {
    id?: true
    pluginId?: true
    actionKey?: true
    labelI18nKey?: true
    description?: true
    defaultRole?: true
    createdAt?: true
  }

  export type ActionRegistryMaxAggregateInputType = {
    id?: true
    pluginId?: true
    actionKey?: true
    labelI18nKey?: true
    description?: true
    defaultRole?: true
    createdAt?: true
  }

  export type ActionRegistryCountAggregateInputType = {
    id?: true
    pluginId?: true
    actionKey?: true
    labelI18nKey?: true
    description?: true
    defaultRole?: true
    createdAt?: true
    _all?: true
  }

  export type ActionRegistryAggregateArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Filter which ActionRegistry to aggregate.
     */
    where?: ActionRegistryWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of ActionRegistries to fetch.
     */
    orderBy?: ActionRegistryOrderByWithRelationInput | ActionRegistryOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the start position
     */
    cursor?: ActionRegistryWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` ActionRegistries from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` ActionRegistries.
     */
    skip?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Count returned ActionRegistries
    **/
    _count?: true | ActionRegistryCountAggregateInputType
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Select which fields to find the minimum value
    **/
    _min?: ActionRegistryMinAggregateInputType
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Select which fields to find the maximum value
    **/
    _max?: ActionRegistryMaxAggregateInputType
  }

  export type GetActionRegistryAggregateType<T extends ActionRegistryAggregateArgs> = {
        [P in keyof T & keyof AggregateActionRegistry]: P extends '_count' | 'count'
      ? T[P] extends true
        ? number
        : GetScalarType<T[P], AggregateActionRegistry[P]>
      : GetScalarType<T[P], AggregateActionRegistry[P]>
  }




  export type ActionRegistryGroupByArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    where?: ActionRegistryWhereInput
    orderBy?: ActionRegistryOrderByWithAggregationInput | ActionRegistryOrderByWithAggregationInput[]
    by: ActionRegistryScalarFieldEnum[] | ActionRegistryScalarFieldEnum
    having?: ActionRegistryScalarWhereWithAggregatesInput
    take?: number
    skip?: number
    _count?: ActionRegistryCountAggregateInputType | true
    _min?: ActionRegistryMinAggregateInputType
    _max?: ActionRegistryMaxAggregateInputType
  }

  export type ActionRegistryGroupByOutputType = {
    id: string
    pluginId: string
    actionKey: string
    labelI18nKey: string
    description: string | null
    defaultRole: string
    createdAt: Date
    _count: ActionRegistryCountAggregateOutputType | null
    _min: ActionRegistryMinAggregateOutputType | null
    _max: ActionRegistryMaxAggregateOutputType | null
  }

  type GetActionRegistryGroupByPayload<T extends ActionRegistryGroupByArgs> = Prisma.PrismaPromise<
    Array<
      PickEnumerable<ActionRegistryGroupByOutputType, T['by']> &
        {
          [P in ((keyof T) & (keyof ActionRegistryGroupByOutputType))]: P extends '_count'
            ? T[P] extends boolean
              ? number
              : GetScalarType<T[P], ActionRegistryGroupByOutputType[P]>
            : GetScalarType<T[P], ActionRegistryGroupByOutputType[P]>
        }
      >
    >


  export type ActionRegistrySelect<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetSelect<{
    id?: boolean
    pluginId?: boolean
    actionKey?: boolean
    labelI18nKey?: boolean
    description?: boolean
    defaultRole?: boolean
    createdAt?: boolean
  }, ExtArgs["result"]["actionRegistry"]>

  export type ActionRegistrySelectCreateManyAndReturn<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetSelect<{
    id?: boolean
    pluginId?: boolean
    actionKey?: boolean
    labelI18nKey?: boolean
    description?: boolean
    defaultRole?: boolean
    createdAt?: boolean
  }, ExtArgs["result"]["actionRegistry"]>

  export type ActionRegistrySelectUpdateManyAndReturn<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetSelect<{
    id?: boolean
    pluginId?: boolean
    actionKey?: boolean
    labelI18nKey?: boolean
    description?: boolean
    defaultRole?: boolean
    createdAt?: boolean
  }, ExtArgs["result"]["actionRegistry"]>

  export type ActionRegistrySelectScalar = {
    id?: boolean
    pluginId?: boolean
    actionKey?: boolean
    labelI18nKey?: boolean
    description?: boolean
    defaultRole?: boolean
    createdAt?: boolean
  }

  export type ActionRegistryOmit<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetOmit<"id" | "pluginId" | "actionKey" | "labelI18nKey" | "description" | "defaultRole" | "createdAt", ExtArgs["result"]["actionRegistry"]>

  export type $ActionRegistryPayload<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    name: "ActionRegistry"
    objects: {}
    scalars: $Extensions.GetPayloadResult<{
      id: string
      pluginId: string
      actionKey: string
      labelI18nKey: string
      description: string | null
      defaultRole: string
      createdAt: Date
    }, ExtArgs["result"]["actionRegistry"]>
    composites: {}
  }

  type ActionRegistryGetPayload<S extends boolean | null | undefined | ActionRegistryDefaultArgs> = $Result.GetResult<Prisma.$ActionRegistryPayload, S>

  type ActionRegistryCountArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> =
    Omit<ActionRegistryFindManyArgs, 'select' | 'include' | 'distinct' | 'omit'> & {
      select?: ActionRegistryCountAggregateInputType | true
    }

  export interface ActionRegistryDelegate<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs, GlobalOmitOptions = {}> {
    [K: symbol]: { types: Prisma.TypeMap<ExtArgs>['model']['ActionRegistry'], meta: { name: 'ActionRegistry' } }
    /**
     * Find zero or one ActionRegistry that matches the filter.
     * @param {ActionRegistryFindUniqueArgs} args - Arguments to find a ActionRegistry
     * @example
     * // Get one ActionRegistry
     * const actionRegistry = await prisma.actionRegistry.findUnique({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findUnique<T extends ActionRegistryFindUniqueArgs>(args: SelectSubset<T, ActionRegistryFindUniqueArgs<ExtArgs>>): Prisma__ActionRegistryClient<$Result.GetResult<Prisma.$ActionRegistryPayload<ExtArgs>, T, "findUnique", GlobalOmitOptions> | null, null, ExtArgs, GlobalOmitOptions>

    /**
     * Find one ActionRegistry that matches the filter or throw an error with `error.code='P2025'`
     * if no matches were found.
     * @param {ActionRegistryFindUniqueOrThrowArgs} args - Arguments to find a ActionRegistry
     * @example
     * // Get one ActionRegistry
     * const actionRegistry = await prisma.actionRegistry.findUniqueOrThrow({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findUniqueOrThrow<T extends ActionRegistryFindUniqueOrThrowArgs>(args: SelectSubset<T, ActionRegistryFindUniqueOrThrowArgs<ExtArgs>>): Prisma__ActionRegistryClient<$Result.GetResult<Prisma.$ActionRegistryPayload<ExtArgs>, T, "findUniqueOrThrow", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Find the first ActionRegistry that matches the filter.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {ActionRegistryFindFirstArgs} args - Arguments to find a ActionRegistry
     * @example
     * // Get one ActionRegistry
     * const actionRegistry = await prisma.actionRegistry.findFirst({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findFirst<T extends ActionRegistryFindFirstArgs>(args?: SelectSubset<T, ActionRegistryFindFirstArgs<ExtArgs>>): Prisma__ActionRegistryClient<$Result.GetResult<Prisma.$ActionRegistryPayload<ExtArgs>, T, "findFirst", GlobalOmitOptions> | null, null, ExtArgs, GlobalOmitOptions>

    /**
     * Find the first ActionRegistry that matches the filter or
     * throw `PrismaKnownClientError` with `P2025` code if no matches were found.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {ActionRegistryFindFirstOrThrowArgs} args - Arguments to find a ActionRegistry
     * @example
     * // Get one ActionRegistry
     * const actionRegistry = await prisma.actionRegistry.findFirstOrThrow({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findFirstOrThrow<T extends ActionRegistryFindFirstOrThrowArgs>(args?: SelectSubset<T, ActionRegistryFindFirstOrThrowArgs<ExtArgs>>): Prisma__ActionRegistryClient<$Result.GetResult<Prisma.$ActionRegistryPayload<ExtArgs>, T, "findFirstOrThrow", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Find zero or more ActionRegistries that matches the filter.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {ActionRegistryFindManyArgs} args - Arguments to filter and select certain fields only.
     * @example
     * // Get all ActionRegistries
     * const actionRegistries = await prisma.actionRegistry.findMany()
     * 
     * // Get first 10 ActionRegistries
     * const actionRegistries = await prisma.actionRegistry.findMany({ take: 10 })
     * 
     * // Only select the `id`
     * const actionRegistryWithIdOnly = await prisma.actionRegistry.findMany({ select: { id: true } })
     * 
     */
    findMany<T extends ActionRegistryFindManyArgs>(args?: SelectSubset<T, ActionRegistryFindManyArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$ActionRegistryPayload<ExtArgs>, T, "findMany", GlobalOmitOptions>>

    /**
     * Create a ActionRegistry.
     * @param {ActionRegistryCreateArgs} args - Arguments to create a ActionRegistry.
     * @example
     * // Create one ActionRegistry
     * const ActionRegistry = await prisma.actionRegistry.create({
     *   data: {
     *     // ... data to create a ActionRegistry
     *   }
     * })
     * 
     */
    create<T extends ActionRegistryCreateArgs>(args: SelectSubset<T, ActionRegistryCreateArgs<ExtArgs>>): Prisma__ActionRegistryClient<$Result.GetResult<Prisma.$ActionRegistryPayload<ExtArgs>, T, "create", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Create many ActionRegistries.
     * @param {ActionRegistryCreateManyArgs} args - Arguments to create many ActionRegistries.
     * @example
     * // Create many ActionRegistries
     * const actionRegistry = await prisma.actionRegistry.createMany({
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     *     
     */
    createMany<T extends ActionRegistryCreateManyArgs>(args?: SelectSubset<T, ActionRegistryCreateManyArgs<ExtArgs>>): Prisma.PrismaPromise<BatchPayload>

    /**
     * Create many ActionRegistries and returns the data saved in the database.
     * @param {ActionRegistryCreateManyAndReturnArgs} args - Arguments to create many ActionRegistries.
     * @example
     * // Create many ActionRegistries
     * const actionRegistry = await prisma.actionRegistry.createManyAndReturn({
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * 
     * // Create many ActionRegistries and only return the `id`
     * const actionRegistryWithIdOnly = await prisma.actionRegistry.createManyAndReturn({
     *   select: { id: true },
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * 
     */
    createManyAndReturn<T extends ActionRegistryCreateManyAndReturnArgs>(args?: SelectSubset<T, ActionRegistryCreateManyAndReturnArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$ActionRegistryPayload<ExtArgs>, T, "createManyAndReturn", GlobalOmitOptions>>

    /**
     * Delete a ActionRegistry.
     * @param {ActionRegistryDeleteArgs} args - Arguments to delete one ActionRegistry.
     * @example
     * // Delete one ActionRegistry
     * const ActionRegistry = await prisma.actionRegistry.delete({
     *   where: {
     *     // ... filter to delete one ActionRegistry
     *   }
     * })
     * 
     */
    delete<T extends ActionRegistryDeleteArgs>(args: SelectSubset<T, ActionRegistryDeleteArgs<ExtArgs>>): Prisma__ActionRegistryClient<$Result.GetResult<Prisma.$ActionRegistryPayload<ExtArgs>, T, "delete", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Update one ActionRegistry.
     * @param {ActionRegistryUpdateArgs} args - Arguments to update one ActionRegistry.
     * @example
     * // Update one ActionRegistry
     * const actionRegistry = await prisma.actionRegistry.update({
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: {
     *     // ... provide data here
     *   }
     * })
     * 
     */
    update<T extends ActionRegistryUpdateArgs>(args: SelectSubset<T, ActionRegistryUpdateArgs<ExtArgs>>): Prisma__ActionRegistryClient<$Result.GetResult<Prisma.$ActionRegistryPayload<ExtArgs>, T, "update", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Delete zero or more ActionRegistries.
     * @param {ActionRegistryDeleteManyArgs} args - Arguments to filter ActionRegistries to delete.
     * @example
     * // Delete a few ActionRegistries
     * const { count } = await prisma.actionRegistry.deleteMany({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     * 
     */
    deleteMany<T extends ActionRegistryDeleteManyArgs>(args?: SelectSubset<T, ActionRegistryDeleteManyArgs<ExtArgs>>): Prisma.PrismaPromise<BatchPayload>

    /**
     * Update zero or more ActionRegistries.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {ActionRegistryUpdateManyArgs} args - Arguments to update one or more rows.
     * @example
     * // Update many ActionRegistries
     * const actionRegistry = await prisma.actionRegistry.updateMany({
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: {
     *     // ... provide data here
     *   }
     * })
     * 
     */
    updateMany<T extends ActionRegistryUpdateManyArgs>(args: SelectSubset<T, ActionRegistryUpdateManyArgs<ExtArgs>>): Prisma.PrismaPromise<BatchPayload>

    /**
     * Update zero or more ActionRegistries and returns the data updated in the database.
     * @param {ActionRegistryUpdateManyAndReturnArgs} args - Arguments to update many ActionRegistries.
     * @example
     * // Update many ActionRegistries
     * const actionRegistry = await prisma.actionRegistry.updateManyAndReturn({
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * 
     * // Update zero or more ActionRegistries and only return the `id`
     * const actionRegistryWithIdOnly = await prisma.actionRegistry.updateManyAndReturn({
     *   select: { id: true },
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * 
     */
    updateManyAndReturn<T extends ActionRegistryUpdateManyAndReturnArgs>(args: SelectSubset<T, ActionRegistryUpdateManyAndReturnArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$ActionRegistryPayload<ExtArgs>, T, "updateManyAndReturn", GlobalOmitOptions>>

    /**
     * Create or update one ActionRegistry.
     * @param {ActionRegistryUpsertArgs} args - Arguments to update or create a ActionRegistry.
     * @example
     * // Update or create a ActionRegistry
     * const actionRegistry = await prisma.actionRegistry.upsert({
     *   create: {
     *     // ... data to create a ActionRegistry
     *   },
     *   update: {
     *     // ... in case it already exists, update
     *   },
     *   where: {
     *     // ... the filter for the ActionRegistry we want to update
     *   }
     * })
     */
    upsert<T extends ActionRegistryUpsertArgs>(args: SelectSubset<T, ActionRegistryUpsertArgs<ExtArgs>>): Prisma__ActionRegistryClient<$Result.GetResult<Prisma.$ActionRegistryPayload<ExtArgs>, T, "upsert", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>


    /**
     * Count the number of ActionRegistries.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {ActionRegistryCountArgs} args - Arguments to filter ActionRegistries to count.
     * @example
     * // Count the number of ActionRegistries
     * const count = await prisma.actionRegistry.count({
     *   where: {
     *     // ... the filter for the ActionRegistries we want to count
     *   }
     * })
    **/
    count<T extends ActionRegistryCountArgs>(
      args?: Subset<T, ActionRegistryCountArgs>,
    ): Prisma.PrismaPromise<
      T extends $Utils.Record<'select', any>
        ? T['select'] extends true
          ? number
          : GetScalarType<T['select'], ActionRegistryCountAggregateOutputType>
        : number
    >

    /**
     * Allows you to perform aggregations operations on a ActionRegistry.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {ActionRegistryAggregateArgs} args - Select which aggregations you would like to apply and on what fields.
     * @example
     * // Ordered by age ascending
     * // Where email contains prisma.io
     * // Limited to the 10 users
     * const aggregations = await prisma.user.aggregate({
     *   _avg: {
     *     age: true,
     *   },
     *   where: {
     *     email: {
     *       contains: "prisma.io",
     *     },
     *   },
     *   orderBy: {
     *     age: "asc",
     *   },
     *   take: 10,
     * })
    **/
    aggregate<T extends ActionRegistryAggregateArgs>(args: Subset<T, ActionRegistryAggregateArgs>): Prisma.PrismaPromise<GetActionRegistryAggregateType<T>>

    /**
     * Group by ActionRegistry.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {ActionRegistryGroupByArgs} args - Group by arguments.
     * @example
     * // Group by city, order by createdAt, get count
     * const result = await prisma.user.groupBy({
     *   by: ['city', 'createdAt'],
     *   orderBy: {
     *     createdAt: true
     *   },
     *   _count: {
     *     _all: true
     *   },
     * })
     * 
    **/
    groupBy<
      T extends ActionRegistryGroupByArgs,
      HasSelectOrTake extends Or<
        Extends<'skip', Keys<T>>,
        Extends<'take', Keys<T>>
      >,
      OrderByArg extends True extends HasSelectOrTake
        ? { orderBy: ActionRegistryGroupByArgs['orderBy'] }
        : { orderBy?: ActionRegistryGroupByArgs['orderBy'] },
      OrderFields extends ExcludeUnderscoreKeys<Keys<MaybeTupleToUnion<T['orderBy']>>>,
      ByFields extends MaybeTupleToUnion<T['by']>,
      ByValid extends Has<ByFields, OrderFields>,
      HavingFields extends GetHavingFields<T['having']>,
      HavingValid extends Has<ByFields, HavingFields>,
      ByEmpty extends T['by'] extends never[] ? True : False,
      InputErrors extends ByEmpty extends True
      ? `Error: "by" must not be empty.`
      : HavingValid extends False
      ? {
          [P in HavingFields]: P extends ByFields
            ? never
            : P extends string
            ? `Error: Field "${P}" used in "having" needs to be provided in "by".`
            : [
                Error,
                'Field ',
                P,
                ` in "having" needs to be provided in "by"`,
              ]
        }[HavingFields]
      : 'take' extends Keys<T>
      ? 'orderBy' extends Keys<T>
        ? ByValid extends True
          ? {}
          : {
              [P in OrderFields]: P extends ByFields
                ? never
                : `Error: Field "${P}" in "orderBy" needs to be provided in "by"`
            }[OrderFields]
        : 'Error: If you provide "take", you also need to provide "orderBy"'
      : 'skip' extends Keys<T>
      ? 'orderBy' extends Keys<T>
        ? ByValid extends True
          ? {}
          : {
              [P in OrderFields]: P extends ByFields
                ? never
                : `Error: Field "${P}" in "orderBy" needs to be provided in "by"`
            }[OrderFields]
        : 'Error: If you provide "skip", you also need to provide "orderBy"'
      : ByValid extends True
      ? {}
      : {
          [P in OrderFields]: P extends ByFields
            ? never
            : `Error: Field "${P}" in "orderBy" needs to be provided in "by"`
        }[OrderFields]
    >(args: SubsetIntersection<T, ActionRegistryGroupByArgs, OrderByArg> & InputErrors): {} extends InputErrors ? GetActionRegistryGroupByPayload<T> : Prisma.PrismaPromise<InputErrors>
  /**
   * Fields of the ActionRegistry model
   */
  readonly fields: ActionRegistryFieldRefs;
  }

  /**
   * The delegate class that acts as a "Promise-like" for ActionRegistry.
   * Why is this prefixed with `Prisma__`?
   * Because we want to prevent naming conflicts as mentioned in
   * https://github.com/prisma/prisma-client-js/issues/707
   */
  export interface Prisma__ActionRegistryClient<T, Null = never, ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs, GlobalOmitOptions = {}> extends Prisma.PrismaPromise<T> {
    readonly [Symbol.toStringTag]: "PrismaPromise"
    /**
     * Attaches callbacks for the resolution and/or rejection of the Promise.
     * @param onfulfilled The callback to execute when the Promise is resolved.
     * @param onrejected The callback to execute when the Promise is rejected.
     * @returns A Promise for the completion of which ever callback is executed.
     */
    then<TResult1 = T, TResult2 = never>(onfulfilled?: ((value: T) => TResult1 | PromiseLike<TResult1>) | undefined | null, onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | undefined | null): $Utils.JsPromise<TResult1 | TResult2>
    /**
     * Attaches a callback for only the rejection of the Promise.
     * @param onrejected The callback to execute when the Promise is rejected.
     * @returns A Promise for the completion of the callback.
     */
    catch<TResult = never>(onrejected?: ((reason: any) => TResult | PromiseLike<TResult>) | undefined | null): $Utils.JsPromise<T | TResult>
    /**
     * Attaches a callback that is invoked when the Promise is settled (fulfilled or rejected). The
     * resolved value cannot be modified from the callback.
     * @param onfinally The callback to execute when the Promise is settled (fulfilled or rejected).
     * @returns A Promise for the completion of the callback.
     */
    finally(onfinally?: (() => void) | undefined | null): $Utils.JsPromise<T>
  }




  /**
   * Fields of the ActionRegistry model
   */
  interface ActionRegistryFieldRefs {
    readonly id: FieldRef<"ActionRegistry", 'String'>
    readonly pluginId: FieldRef<"ActionRegistry", 'String'>
    readonly actionKey: FieldRef<"ActionRegistry", 'String'>
    readonly labelI18nKey: FieldRef<"ActionRegistry", 'String'>
    readonly description: FieldRef<"ActionRegistry", 'String'>
    readonly defaultRole: FieldRef<"ActionRegistry", 'String'>
    readonly createdAt: FieldRef<"ActionRegistry", 'DateTime'>
  }
    

  // Custom InputTypes
  /**
   * ActionRegistry findUnique
   */
  export type ActionRegistryFindUniqueArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the ActionRegistry
     */
    select?: ActionRegistrySelect<ExtArgs> | null
    /**
     * Omit specific fields from the ActionRegistry
     */
    omit?: ActionRegistryOmit<ExtArgs> | null
    /**
     * Filter, which ActionRegistry to fetch.
     */
    where: ActionRegistryWhereUniqueInput
  }

  /**
   * ActionRegistry findUniqueOrThrow
   */
  export type ActionRegistryFindUniqueOrThrowArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the ActionRegistry
     */
    select?: ActionRegistrySelect<ExtArgs> | null
    /**
     * Omit specific fields from the ActionRegistry
     */
    omit?: ActionRegistryOmit<ExtArgs> | null
    /**
     * Filter, which ActionRegistry to fetch.
     */
    where: ActionRegistryWhereUniqueInput
  }

  /**
   * ActionRegistry findFirst
   */
  export type ActionRegistryFindFirstArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the ActionRegistry
     */
    select?: ActionRegistrySelect<ExtArgs> | null
    /**
     * Omit specific fields from the ActionRegistry
     */
    omit?: ActionRegistryOmit<ExtArgs> | null
    /**
     * Filter, which ActionRegistry to fetch.
     */
    where?: ActionRegistryWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of ActionRegistries to fetch.
     */
    orderBy?: ActionRegistryOrderByWithRelationInput | ActionRegistryOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the position for searching for ActionRegistries.
     */
    cursor?: ActionRegistryWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` ActionRegistries from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` ActionRegistries.
     */
    skip?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/distinct Distinct Docs}
     * 
     * Filter by unique combinations of ActionRegistries.
     */
    distinct?: ActionRegistryScalarFieldEnum | ActionRegistryScalarFieldEnum[]
  }

  /**
   * ActionRegistry findFirstOrThrow
   */
  export type ActionRegistryFindFirstOrThrowArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the ActionRegistry
     */
    select?: ActionRegistrySelect<ExtArgs> | null
    /**
     * Omit specific fields from the ActionRegistry
     */
    omit?: ActionRegistryOmit<ExtArgs> | null
    /**
     * Filter, which ActionRegistry to fetch.
     */
    where?: ActionRegistryWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of ActionRegistries to fetch.
     */
    orderBy?: ActionRegistryOrderByWithRelationInput | ActionRegistryOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the position for searching for ActionRegistries.
     */
    cursor?: ActionRegistryWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` ActionRegistries from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` ActionRegistries.
     */
    skip?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/distinct Distinct Docs}
     * 
     * Filter by unique combinations of ActionRegistries.
     */
    distinct?: ActionRegistryScalarFieldEnum | ActionRegistryScalarFieldEnum[]
  }

  /**
   * ActionRegistry findMany
   */
  export type ActionRegistryFindManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the ActionRegistry
     */
    select?: ActionRegistrySelect<ExtArgs> | null
    /**
     * Omit specific fields from the ActionRegistry
     */
    omit?: ActionRegistryOmit<ExtArgs> | null
    /**
     * Filter, which ActionRegistries to fetch.
     */
    where?: ActionRegistryWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of ActionRegistries to fetch.
     */
    orderBy?: ActionRegistryOrderByWithRelationInput | ActionRegistryOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the position for listing ActionRegistries.
     */
    cursor?: ActionRegistryWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` ActionRegistries from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` ActionRegistries.
     */
    skip?: number
    distinct?: ActionRegistryScalarFieldEnum | ActionRegistryScalarFieldEnum[]
  }

  /**
   * ActionRegistry create
   */
  export type ActionRegistryCreateArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the ActionRegistry
     */
    select?: ActionRegistrySelect<ExtArgs> | null
    /**
     * Omit specific fields from the ActionRegistry
     */
    omit?: ActionRegistryOmit<ExtArgs> | null
    /**
     * The data needed to create a ActionRegistry.
     */
    data: XOR<ActionRegistryCreateInput, ActionRegistryUncheckedCreateInput>
  }

  /**
   * ActionRegistry createMany
   */
  export type ActionRegistryCreateManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * The data used to create many ActionRegistries.
     */
    data: ActionRegistryCreateManyInput | ActionRegistryCreateManyInput[]
    skipDuplicates?: boolean
  }

  /**
   * ActionRegistry createManyAndReturn
   */
  export type ActionRegistryCreateManyAndReturnArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the ActionRegistry
     */
    select?: ActionRegistrySelectCreateManyAndReturn<ExtArgs> | null
    /**
     * Omit specific fields from the ActionRegistry
     */
    omit?: ActionRegistryOmit<ExtArgs> | null
    /**
     * The data used to create many ActionRegistries.
     */
    data: ActionRegistryCreateManyInput | ActionRegistryCreateManyInput[]
    skipDuplicates?: boolean
  }

  /**
   * ActionRegistry update
   */
  export type ActionRegistryUpdateArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the ActionRegistry
     */
    select?: ActionRegistrySelect<ExtArgs> | null
    /**
     * Omit specific fields from the ActionRegistry
     */
    omit?: ActionRegistryOmit<ExtArgs> | null
    /**
     * The data needed to update a ActionRegistry.
     */
    data: XOR<ActionRegistryUpdateInput, ActionRegistryUncheckedUpdateInput>
    /**
     * Choose, which ActionRegistry to update.
     */
    where: ActionRegistryWhereUniqueInput
  }

  /**
   * ActionRegistry updateMany
   */
  export type ActionRegistryUpdateManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * The data used to update ActionRegistries.
     */
    data: XOR<ActionRegistryUpdateManyMutationInput, ActionRegistryUncheckedUpdateManyInput>
    /**
     * Filter which ActionRegistries to update
     */
    where?: ActionRegistryWhereInput
    /**
     * Limit how many ActionRegistries to update.
     */
    limit?: number
  }

  /**
   * ActionRegistry updateManyAndReturn
   */
  export type ActionRegistryUpdateManyAndReturnArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the ActionRegistry
     */
    select?: ActionRegistrySelectUpdateManyAndReturn<ExtArgs> | null
    /**
     * Omit specific fields from the ActionRegistry
     */
    omit?: ActionRegistryOmit<ExtArgs> | null
    /**
     * The data used to update ActionRegistries.
     */
    data: XOR<ActionRegistryUpdateManyMutationInput, ActionRegistryUncheckedUpdateManyInput>
    /**
     * Filter which ActionRegistries to update
     */
    where?: ActionRegistryWhereInput
    /**
     * Limit how many ActionRegistries to update.
     */
    limit?: number
  }

  /**
   * ActionRegistry upsert
   */
  export type ActionRegistryUpsertArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the ActionRegistry
     */
    select?: ActionRegistrySelect<ExtArgs> | null
    /**
     * Omit specific fields from the ActionRegistry
     */
    omit?: ActionRegistryOmit<ExtArgs> | null
    /**
     * The filter to search for the ActionRegistry to update in case it exists.
     */
    where: ActionRegistryWhereUniqueInput
    /**
     * In case the ActionRegistry found by the `where` argument doesn't exist, create a new ActionRegistry with this data.
     */
    create: XOR<ActionRegistryCreateInput, ActionRegistryUncheckedCreateInput>
    /**
     * In case the ActionRegistry was found with the provided `where` argument, update it with this data.
     */
    update: XOR<ActionRegistryUpdateInput, ActionRegistryUncheckedUpdateInput>
  }

  /**
   * ActionRegistry delete
   */
  export type ActionRegistryDeleteArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the ActionRegistry
     */
    select?: ActionRegistrySelect<ExtArgs> | null
    /**
     * Omit specific fields from the ActionRegistry
     */
    omit?: ActionRegistryOmit<ExtArgs> | null
    /**
     * Filter which ActionRegistry to delete.
     */
    where: ActionRegistryWhereUniqueInput
  }

  /**
   * ActionRegistry deleteMany
   */
  export type ActionRegistryDeleteManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Filter which ActionRegistries to delete
     */
    where?: ActionRegistryWhereInput
    /**
     * Limit how many ActionRegistries to delete.
     */
    limit?: number
  }

  /**
   * ActionRegistry without action
   */
  export type ActionRegistryDefaultArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the ActionRegistry
     */
    select?: ActionRegistrySelect<ExtArgs> | null
    /**
     * Omit specific fields from the ActionRegistry
     */
    omit?: ActionRegistryOmit<ExtArgs> | null
  }


  /**
   * Model WorkspaceRoleAction
   */

  export type AggregateWorkspaceRoleAction = {
    _count: WorkspaceRoleActionCountAggregateOutputType | null
    _min: WorkspaceRoleActionMinAggregateOutputType | null
    _max: WorkspaceRoleActionMaxAggregateOutputType | null
  }

  export type WorkspaceRoleActionMinAggregateOutputType = {
    id: string | null
    workspaceId: string | null
    pluginId: string | null
    actionKey: string | null
    requiredRole: string | null
    isOverridden: boolean | null
    createdAt: Date | null
    updatedAt: Date | null
  }

  export type WorkspaceRoleActionMaxAggregateOutputType = {
    id: string | null
    workspaceId: string | null
    pluginId: string | null
    actionKey: string | null
    requiredRole: string | null
    isOverridden: boolean | null
    createdAt: Date | null
    updatedAt: Date | null
  }

  export type WorkspaceRoleActionCountAggregateOutputType = {
    id: number
    workspaceId: number
    pluginId: number
    actionKey: number
    requiredRole: number
    isOverridden: number
    createdAt: number
    updatedAt: number
    _all: number
  }


  export type WorkspaceRoleActionMinAggregateInputType = {
    id?: true
    workspaceId?: true
    pluginId?: true
    actionKey?: true
    requiredRole?: true
    isOverridden?: true
    createdAt?: true
    updatedAt?: true
  }

  export type WorkspaceRoleActionMaxAggregateInputType = {
    id?: true
    workspaceId?: true
    pluginId?: true
    actionKey?: true
    requiredRole?: true
    isOverridden?: true
    createdAt?: true
    updatedAt?: true
  }

  export type WorkspaceRoleActionCountAggregateInputType = {
    id?: true
    workspaceId?: true
    pluginId?: true
    actionKey?: true
    requiredRole?: true
    isOverridden?: true
    createdAt?: true
    updatedAt?: true
    _all?: true
  }

  export type WorkspaceRoleActionAggregateArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Filter which WorkspaceRoleAction to aggregate.
     */
    where?: WorkspaceRoleActionWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of WorkspaceRoleActions to fetch.
     */
    orderBy?: WorkspaceRoleActionOrderByWithRelationInput | WorkspaceRoleActionOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the start position
     */
    cursor?: WorkspaceRoleActionWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` WorkspaceRoleActions from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` WorkspaceRoleActions.
     */
    skip?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Count returned WorkspaceRoleActions
    **/
    _count?: true | WorkspaceRoleActionCountAggregateInputType
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Select which fields to find the minimum value
    **/
    _min?: WorkspaceRoleActionMinAggregateInputType
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Select which fields to find the maximum value
    **/
    _max?: WorkspaceRoleActionMaxAggregateInputType
  }

  export type GetWorkspaceRoleActionAggregateType<T extends WorkspaceRoleActionAggregateArgs> = {
        [P in keyof T & keyof AggregateWorkspaceRoleAction]: P extends '_count' | 'count'
      ? T[P] extends true
        ? number
        : GetScalarType<T[P], AggregateWorkspaceRoleAction[P]>
      : GetScalarType<T[P], AggregateWorkspaceRoleAction[P]>
  }




  export type WorkspaceRoleActionGroupByArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    where?: WorkspaceRoleActionWhereInput
    orderBy?: WorkspaceRoleActionOrderByWithAggregationInput | WorkspaceRoleActionOrderByWithAggregationInput[]
    by: WorkspaceRoleActionScalarFieldEnum[] | WorkspaceRoleActionScalarFieldEnum
    having?: WorkspaceRoleActionScalarWhereWithAggregatesInput
    take?: number
    skip?: number
    _count?: WorkspaceRoleActionCountAggregateInputType | true
    _min?: WorkspaceRoleActionMinAggregateInputType
    _max?: WorkspaceRoleActionMaxAggregateInputType
  }

  export type WorkspaceRoleActionGroupByOutputType = {
    id: string
    workspaceId: string
    pluginId: string
    actionKey: string
    requiredRole: string
    isOverridden: boolean
    createdAt: Date
    updatedAt: Date
    _count: WorkspaceRoleActionCountAggregateOutputType | null
    _min: WorkspaceRoleActionMinAggregateOutputType | null
    _max: WorkspaceRoleActionMaxAggregateOutputType | null
  }

  type GetWorkspaceRoleActionGroupByPayload<T extends WorkspaceRoleActionGroupByArgs> = Prisma.PrismaPromise<
    Array<
      PickEnumerable<WorkspaceRoleActionGroupByOutputType, T['by']> &
        {
          [P in ((keyof T) & (keyof WorkspaceRoleActionGroupByOutputType))]: P extends '_count'
            ? T[P] extends boolean
              ? number
              : GetScalarType<T[P], WorkspaceRoleActionGroupByOutputType[P]>
            : GetScalarType<T[P], WorkspaceRoleActionGroupByOutputType[P]>
        }
      >
    >


  export type WorkspaceRoleActionSelect<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetSelect<{
    id?: boolean
    workspaceId?: boolean
    pluginId?: boolean
    actionKey?: boolean
    requiredRole?: boolean
    isOverridden?: boolean
    createdAt?: boolean
    updatedAt?: boolean
    workspace?: boolean | WorkspaceDefaultArgs<ExtArgs>
  }, ExtArgs["result"]["workspaceRoleAction"]>

  export type WorkspaceRoleActionSelectCreateManyAndReturn<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetSelect<{
    id?: boolean
    workspaceId?: boolean
    pluginId?: boolean
    actionKey?: boolean
    requiredRole?: boolean
    isOverridden?: boolean
    createdAt?: boolean
    updatedAt?: boolean
    workspace?: boolean | WorkspaceDefaultArgs<ExtArgs>
  }, ExtArgs["result"]["workspaceRoleAction"]>

  export type WorkspaceRoleActionSelectUpdateManyAndReturn<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetSelect<{
    id?: boolean
    workspaceId?: boolean
    pluginId?: boolean
    actionKey?: boolean
    requiredRole?: boolean
    isOverridden?: boolean
    createdAt?: boolean
    updatedAt?: boolean
    workspace?: boolean | WorkspaceDefaultArgs<ExtArgs>
  }, ExtArgs["result"]["workspaceRoleAction"]>

  export type WorkspaceRoleActionSelectScalar = {
    id?: boolean
    workspaceId?: boolean
    pluginId?: boolean
    actionKey?: boolean
    requiredRole?: boolean
    isOverridden?: boolean
    createdAt?: boolean
    updatedAt?: boolean
  }

  export type WorkspaceRoleActionOmit<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetOmit<"id" | "workspaceId" | "pluginId" | "actionKey" | "requiredRole" | "isOverridden" | "createdAt" | "updatedAt", ExtArgs["result"]["workspaceRoleAction"]>
  export type WorkspaceRoleActionInclude<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    workspace?: boolean | WorkspaceDefaultArgs<ExtArgs>
  }
  export type WorkspaceRoleActionIncludeCreateManyAndReturn<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    workspace?: boolean | WorkspaceDefaultArgs<ExtArgs>
  }
  export type WorkspaceRoleActionIncludeUpdateManyAndReturn<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    workspace?: boolean | WorkspaceDefaultArgs<ExtArgs>
  }

  export type $WorkspaceRoleActionPayload<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    name: "WorkspaceRoleAction"
    objects: {
      workspace: Prisma.$WorkspacePayload<ExtArgs>
    }
    scalars: $Extensions.GetPayloadResult<{
      id: string
      workspaceId: string
      pluginId: string
      actionKey: string
      requiredRole: string
      isOverridden: boolean
      createdAt: Date
      updatedAt: Date
    }, ExtArgs["result"]["workspaceRoleAction"]>
    composites: {}
  }

  type WorkspaceRoleActionGetPayload<S extends boolean | null | undefined | WorkspaceRoleActionDefaultArgs> = $Result.GetResult<Prisma.$WorkspaceRoleActionPayload, S>

  type WorkspaceRoleActionCountArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> =
    Omit<WorkspaceRoleActionFindManyArgs, 'select' | 'include' | 'distinct' | 'omit'> & {
      select?: WorkspaceRoleActionCountAggregateInputType | true
    }

  export interface WorkspaceRoleActionDelegate<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs, GlobalOmitOptions = {}> {
    [K: symbol]: { types: Prisma.TypeMap<ExtArgs>['model']['WorkspaceRoleAction'], meta: { name: 'WorkspaceRoleAction' } }
    /**
     * Find zero or one WorkspaceRoleAction that matches the filter.
     * @param {WorkspaceRoleActionFindUniqueArgs} args - Arguments to find a WorkspaceRoleAction
     * @example
     * // Get one WorkspaceRoleAction
     * const workspaceRoleAction = await prisma.workspaceRoleAction.findUnique({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findUnique<T extends WorkspaceRoleActionFindUniqueArgs>(args: SelectSubset<T, WorkspaceRoleActionFindUniqueArgs<ExtArgs>>): Prisma__WorkspaceRoleActionClient<$Result.GetResult<Prisma.$WorkspaceRoleActionPayload<ExtArgs>, T, "findUnique", GlobalOmitOptions> | null, null, ExtArgs, GlobalOmitOptions>

    /**
     * Find one WorkspaceRoleAction that matches the filter or throw an error with `error.code='P2025'`
     * if no matches were found.
     * @param {WorkspaceRoleActionFindUniqueOrThrowArgs} args - Arguments to find a WorkspaceRoleAction
     * @example
     * // Get one WorkspaceRoleAction
     * const workspaceRoleAction = await prisma.workspaceRoleAction.findUniqueOrThrow({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findUniqueOrThrow<T extends WorkspaceRoleActionFindUniqueOrThrowArgs>(args: SelectSubset<T, WorkspaceRoleActionFindUniqueOrThrowArgs<ExtArgs>>): Prisma__WorkspaceRoleActionClient<$Result.GetResult<Prisma.$WorkspaceRoleActionPayload<ExtArgs>, T, "findUniqueOrThrow", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Find the first WorkspaceRoleAction that matches the filter.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {WorkspaceRoleActionFindFirstArgs} args - Arguments to find a WorkspaceRoleAction
     * @example
     * // Get one WorkspaceRoleAction
     * const workspaceRoleAction = await prisma.workspaceRoleAction.findFirst({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findFirst<T extends WorkspaceRoleActionFindFirstArgs>(args?: SelectSubset<T, WorkspaceRoleActionFindFirstArgs<ExtArgs>>): Prisma__WorkspaceRoleActionClient<$Result.GetResult<Prisma.$WorkspaceRoleActionPayload<ExtArgs>, T, "findFirst", GlobalOmitOptions> | null, null, ExtArgs, GlobalOmitOptions>

    /**
     * Find the first WorkspaceRoleAction that matches the filter or
     * throw `PrismaKnownClientError` with `P2025` code if no matches were found.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {WorkspaceRoleActionFindFirstOrThrowArgs} args - Arguments to find a WorkspaceRoleAction
     * @example
     * // Get one WorkspaceRoleAction
     * const workspaceRoleAction = await prisma.workspaceRoleAction.findFirstOrThrow({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findFirstOrThrow<T extends WorkspaceRoleActionFindFirstOrThrowArgs>(args?: SelectSubset<T, WorkspaceRoleActionFindFirstOrThrowArgs<ExtArgs>>): Prisma__WorkspaceRoleActionClient<$Result.GetResult<Prisma.$WorkspaceRoleActionPayload<ExtArgs>, T, "findFirstOrThrow", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Find zero or more WorkspaceRoleActions that matches the filter.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {WorkspaceRoleActionFindManyArgs} args - Arguments to filter and select certain fields only.
     * @example
     * // Get all WorkspaceRoleActions
     * const workspaceRoleActions = await prisma.workspaceRoleAction.findMany()
     * 
     * // Get first 10 WorkspaceRoleActions
     * const workspaceRoleActions = await prisma.workspaceRoleAction.findMany({ take: 10 })
     * 
     * // Only select the `id`
     * const workspaceRoleActionWithIdOnly = await prisma.workspaceRoleAction.findMany({ select: { id: true } })
     * 
     */
    findMany<T extends WorkspaceRoleActionFindManyArgs>(args?: SelectSubset<T, WorkspaceRoleActionFindManyArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$WorkspaceRoleActionPayload<ExtArgs>, T, "findMany", GlobalOmitOptions>>

    /**
     * Create a WorkspaceRoleAction.
     * @param {WorkspaceRoleActionCreateArgs} args - Arguments to create a WorkspaceRoleAction.
     * @example
     * // Create one WorkspaceRoleAction
     * const WorkspaceRoleAction = await prisma.workspaceRoleAction.create({
     *   data: {
     *     // ... data to create a WorkspaceRoleAction
     *   }
     * })
     * 
     */
    create<T extends WorkspaceRoleActionCreateArgs>(args: SelectSubset<T, WorkspaceRoleActionCreateArgs<ExtArgs>>): Prisma__WorkspaceRoleActionClient<$Result.GetResult<Prisma.$WorkspaceRoleActionPayload<ExtArgs>, T, "create", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Create many WorkspaceRoleActions.
     * @param {WorkspaceRoleActionCreateManyArgs} args - Arguments to create many WorkspaceRoleActions.
     * @example
     * // Create many WorkspaceRoleActions
     * const workspaceRoleAction = await prisma.workspaceRoleAction.createMany({
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     *     
     */
    createMany<T extends WorkspaceRoleActionCreateManyArgs>(args?: SelectSubset<T, WorkspaceRoleActionCreateManyArgs<ExtArgs>>): Prisma.PrismaPromise<BatchPayload>

    /**
     * Create many WorkspaceRoleActions and returns the data saved in the database.
     * @param {WorkspaceRoleActionCreateManyAndReturnArgs} args - Arguments to create many WorkspaceRoleActions.
     * @example
     * // Create many WorkspaceRoleActions
     * const workspaceRoleAction = await prisma.workspaceRoleAction.createManyAndReturn({
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * 
     * // Create many WorkspaceRoleActions and only return the `id`
     * const workspaceRoleActionWithIdOnly = await prisma.workspaceRoleAction.createManyAndReturn({
     *   select: { id: true },
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * 
     */
    createManyAndReturn<T extends WorkspaceRoleActionCreateManyAndReturnArgs>(args?: SelectSubset<T, WorkspaceRoleActionCreateManyAndReturnArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$WorkspaceRoleActionPayload<ExtArgs>, T, "createManyAndReturn", GlobalOmitOptions>>

    /**
     * Delete a WorkspaceRoleAction.
     * @param {WorkspaceRoleActionDeleteArgs} args - Arguments to delete one WorkspaceRoleAction.
     * @example
     * // Delete one WorkspaceRoleAction
     * const WorkspaceRoleAction = await prisma.workspaceRoleAction.delete({
     *   where: {
     *     // ... filter to delete one WorkspaceRoleAction
     *   }
     * })
     * 
     */
    delete<T extends WorkspaceRoleActionDeleteArgs>(args: SelectSubset<T, WorkspaceRoleActionDeleteArgs<ExtArgs>>): Prisma__WorkspaceRoleActionClient<$Result.GetResult<Prisma.$WorkspaceRoleActionPayload<ExtArgs>, T, "delete", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Update one WorkspaceRoleAction.
     * @param {WorkspaceRoleActionUpdateArgs} args - Arguments to update one WorkspaceRoleAction.
     * @example
     * // Update one WorkspaceRoleAction
     * const workspaceRoleAction = await prisma.workspaceRoleAction.update({
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: {
     *     // ... provide data here
     *   }
     * })
     * 
     */
    update<T extends WorkspaceRoleActionUpdateArgs>(args: SelectSubset<T, WorkspaceRoleActionUpdateArgs<ExtArgs>>): Prisma__WorkspaceRoleActionClient<$Result.GetResult<Prisma.$WorkspaceRoleActionPayload<ExtArgs>, T, "update", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Delete zero or more WorkspaceRoleActions.
     * @param {WorkspaceRoleActionDeleteManyArgs} args - Arguments to filter WorkspaceRoleActions to delete.
     * @example
     * // Delete a few WorkspaceRoleActions
     * const { count } = await prisma.workspaceRoleAction.deleteMany({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     * 
     */
    deleteMany<T extends WorkspaceRoleActionDeleteManyArgs>(args?: SelectSubset<T, WorkspaceRoleActionDeleteManyArgs<ExtArgs>>): Prisma.PrismaPromise<BatchPayload>

    /**
     * Update zero or more WorkspaceRoleActions.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {WorkspaceRoleActionUpdateManyArgs} args - Arguments to update one or more rows.
     * @example
     * // Update many WorkspaceRoleActions
     * const workspaceRoleAction = await prisma.workspaceRoleAction.updateMany({
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: {
     *     // ... provide data here
     *   }
     * })
     * 
     */
    updateMany<T extends WorkspaceRoleActionUpdateManyArgs>(args: SelectSubset<T, WorkspaceRoleActionUpdateManyArgs<ExtArgs>>): Prisma.PrismaPromise<BatchPayload>

    /**
     * Update zero or more WorkspaceRoleActions and returns the data updated in the database.
     * @param {WorkspaceRoleActionUpdateManyAndReturnArgs} args - Arguments to update many WorkspaceRoleActions.
     * @example
     * // Update many WorkspaceRoleActions
     * const workspaceRoleAction = await prisma.workspaceRoleAction.updateManyAndReturn({
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * 
     * // Update zero or more WorkspaceRoleActions and only return the `id`
     * const workspaceRoleActionWithIdOnly = await prisma.workspaceRoleAction.updateManyAndReturn({
     *   select: { id: true },
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * 
     */
    updateManyAndReturn<T extends WorkspaceRoleActionUpdateManyAndReturnArgs>(args: SelectSubset<T, WorkspaceRoleActionUpdateManyAndReturnArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$WorkspaceRoleActionPayload<ExtArgs>, T, "updateManyAndReturn", GlobalOmitOptions>>

    /**
     * Create or update one WorkspaceRoleAction.
     * @param {WorkspaceRoleActionUpsertArgs} args - Arguments to update or create a WorkspaceRoleAction.
     * @example
     * // Update or create a WorkspaceRoleAction
     * const workspaceRoleAction = await prisma.workspaceRoleAction.upsert({
     *   create: {
     *     // ... data to create a WorkspaceRoleAction
     *   },
     *   update: {
     *     // ... in case it already exists, update
     *   },
     *   where: {
     *     // ... the filter for the WorkspaceRoleAction we want to update
     *   }
     * })
     */
    upsert<T extends WorkspaceRoleActionUpsertArgs>(args: SelectSubset<T, WorkspaceRoleActionUpsertArgs<ExtArgs>>): Prisma__WorkspaceRoleActionClient<$Result.GetResult<Prisma.$WorkspaceRoleActionPayload<ExtArgs>, T, "upsert", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>


    /**
     * Count the number of WorkspaceRoleActions.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {WorkspaceRoleActionCountArgs} args - Arguments to filter WorkspaceRoleActions to count.
     * @example
     * // Count the number of WorkspaceRoleActions
     * const count = await prisma.workspaceRoleAction.count({
     *   where: {
     *     // ... the filter for the WorkspaceRoleActions we want to count
     *   }
     * })
    **/
    count<T extends WorkspaceRoleActionCountArgs>(
      args?: Subset<T, WorkspaceRoleActionCountArgs>,
    ): Prisma.PrismaPromise<
      T extends $Utils.Record<'select', any>
        ? T['select'] extends true
          ? number
          : GetScalarType<T['select'], WorkspaceRoleActionCountAggregateOutputType>
        : number
    >

    /**
     * Allows you to perform aggregations operations on a WorkspaceRoleAction.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {WorkspaceRoleActionAggregateArgs} args - Select which aggregations you would like to apply and on what fields.
     * @example
     * // Ordered by age ascending
     * // Where email contains prisma.io
     * // Limited to the 10 users
     * const aggregations = await prisma.user.aggregate({
     *   _avg: {
     *     age: true,
     *   },
     *   where: {
     *     email: {
     *       contains: "prisma.io",
     *     },
     *   },
     *   orderBy: {
     *     age: "asc",
     *   },
     *   take: 10,
     * })
    **/
    aggregate<T extends WorkspaceRoleActionAggregateArgs>(args: Subset<T, WorkspaceRoleActionAggregateArgs>): Prisma.PrismaPromise<GetWorkspaceRoleActionAggregateType<T>>

    /**
     * Group by WorkspaceRoleAction.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {WorkspaceRoleActionGroupByArgs} args - Group by arguments.
     * @example
     * // Group by city, order by createdAt, get count
     * const result = await prisma.user.groupBy({
     *   by: ['city', 'createdAt'],
     *   orderBy: {
     *     createdAt: true
     *   },
     *   _count: {
     *     _all: true
     *   },
     * })
     * 
    **/
    groupBy<
      T extends WorkspaceRoleActionGroupByArgs,
      HasSelectOrTake extends Or<
        Extends<'skip', Keys<T>>,
        Extends<'take', Keys<T>>
      >,
      OrderByArg extends True extends HasSelectOrTake
        ? { orderBy: WorkspaceRoleActionGroupByArgs['orderBy'] }
        : { orderBy?: WorkspaceRoleActionGroupByArgs['orderBy'] },
      OrderFields extends ExcludeUnderscoreKeys<Keys<MaybeTupleToUnion<T['orderBy']>>>,
      ByFields extends MaybeTupleToUnion<T['by']>,
      ByValid extends Has<ByFields, OrderFields>,
      HavingFields extends GetHavingFields<T['having']>,
      HavingValid extends Has<ByFields, HavingFields>,
      ByEmpty extends T['by'] extends never[] ? True : False,
      InputErrors extends ByEmpty extends True
      ? `Error: "by" must not be empty.`
      : HavingValid extends False
      ? {
          [P in HavingFields]: P extends ByFields
            ? never
            : P extends string
            ? `Error: Field "${P}" used in "having" needs to be provided in "by".`
            : [
                Error,
                'Field ',
                P,
                ` in "having" needs to be provided in "by"`,
              ]
        }[HavingFields]
      : 'take' extends Keys<T>
      ? 'orderBy' extends Keys<T>
        ? ByValid extends True
          ? {}
          : {
              [P in OrderFields]: P extends ByFields
                ? never
                : `Error: Field "${P}" in "orderBy" needs to be provided in "by"`
            }[OrderFields]
        : 'Error: If you provide "take", you also need to provide "orderBy"'
      : 'skip' extends Keys<T>
      ? 'orderBy' extends Keys<T>
        ? ByValid extends True
          ? {}
          : {
              [P in OrderFields]: P extends ByFields
                ? never
                : `Error: Field "${P}" in "orderBy" needs to be provided in "by"`
            }[OrderFields]
        : 'Error: If you provide "skip", you also need to provide "orderBy"'
      : ByValid extends True
      ? {}
      : {
          [P in OrderFields]: P extends ByFields
            ? never
            : `Error: Field "${P}" in "orderBy" needs to be provided in "by"`
        }[OrderFields]
    >(args: SubsetIntersection<T, WorkspaceRoleActionGroupByArgs, OrderByArg> & InputErrors): {} extends InputErrors ? GetWorkspaceRoleActionGroupByPayload<T> : Prisma.PrismaPromise<InputErrors>
  /**
   * Fields of the WorkspaceRoleAction model
   */
  readonly fields: WorkspaceRoleActionFieldRefs;
  }

  /**
   * The delegate class that acts as a "Promise-like" for WorkspaceRoleAction.
   * Why is this prefixed with `Prisma__`?
   * Because we want to prevent naming conflicts as mentioned in
   * https://github.com/prisma/prisma-client-js/issues/707
   */
  export interface Prisma__WorkspaceRoleActionClient<T, Null = never, ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs, GlobalOmitOptions = {}> extends Prisma.PrismaPromise<T> {
    readonly [Symbol.toStringTag]: "PrismaPromise"
    workspace<T extends WorkspaceDefaultArgs<ExtArgs> = {}>(args?: Subset<T, WorkspaceDefaultArgs<ExtArgs>>): Prisma__WorkspaceClient<$Result.GetResult<Prisma.$WorkspacePayload<ExtArgs>, T, "findUniqueOrThrow", GlobalOmitOptions> | Null, Null, ExtArgs, GlobalOmitOptions>
    /**
     * Attaches callbacks for the resolution and/or rejection of the Promise.
     * @param onfulfilled The callback to execute when the Promise is resolved.
     * @param onrejected The callback to execute when the Promise is rejected.
     * @returns A Promise for the completion of which ever callback is executed.
     */
    then<TResult1 = T, TResult2 = never>(onfulfilled?: ((value: T) => TResult1 | PromiseLike<TResult1>) | undefined | null, onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | undefined | null): $Utils.JsPromise<TResult1 | TResult2>
    /**
     * Attaches a callback for only the rejection of the Promise.
     * @param onrejected The callback to execute when the Promise is rejected.
     * @returns A Promise for the completion of the callback.
     */
    catch<TResult = never>(onrejected?: ((reason: any) => TResult | PromiseLike<TResult>) | undefined | null): $Utils.JsPromise<T | TResult>
    /**
     * Attaches a callback that is invoked when the Promise is settled (fulfilled or rejected). The
     * resolved value cannot be modified from the callback.
     * @param onfinally The callback to execute when the Promise is settled (fulfilled or rejected).
     * @returns A Promise for the completion of the callback.
     */
    finally(onfinally?: (() => void) | undefined | null): $Utils.JsPromise<T>
  }




  /**
   * Fields of the WorkspaceRoleAction model
   */
  interface WorkspaceRoleActionFieldRefs {
    readonly id: FieldRef<"WorkspaceRoleAction", 'String'>
    readonly workspaceId: FieldRef<"WorkspaceRoleAction", 'String'>
    readonly pluginId: FieldRef<"WorkspaceRoleAction", 'String'>
    readonly actionKey: FieldRef<"WorkspaceRoleAction", 'String'>
    readonly requiredRole: FieldRef<"WorkspaceRoleAction", 'String'>
    readonly isOverridden: FieldRef<"WorkspaceRoleAction", 'Boolean'>
    readonly createdAt: FieldRef<"WorkspaceRoleAction", 'DateTime'>
    readonly updatedAt: FieldRef<"WorkspaceRoleAction", 'DateTime'>
  }
    

  // Custom InputTypes
  /**
   * WorkspaceRoleAction findUnique
   */
  export type WorkspaceRoleActionFindUniqueArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the WorkspaceRoleAction
     */
    select?: WorkspaceRoleActionSelect<ExtArgs> | null
    /**
     * Omit specific fields from the WorkspaceRoleAction
     */
    omit?: WorkspaceRoleActionOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: WorkspaceRoleActionInclude<ExtArgs> | null
    /**
     * Filter, which WorkspaceRoleAction to fetch.
     */
    where: WorkspaceRoleActionWhereUniqueInput
  }

  /**
   * WorkspaceRoleAction findUniqueOrThrow
   */
  export type WorkspaceRoleActionFindUniqueOrThrowArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the WorkspaceRoleAction
     */
    select?: WorkspaceRoleActionSelect<ExtArgs> | null
    /**
     * Omit specific fields from the WorkspaceRoleAction
     */
    omit?: WorkspaceRoleActionOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: WorkspaceRoleActionInclude<ExtArgs> | null
    /**
     * Filter, which WorkspaceRoleAction to fetch.
     */
    where: WorkspaceRoleActionWhereUniqueInput
  }

  /**
   * WorkspaceRoleAction findFirst
   */
  export type WorkspaceRoleActionFindFirstArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the WorkspaceRoleAction
     */
    select?: WorkspaceRoleActionSelect<ExtArgs> | null
    /**
     * Omit specific fields from the WorkspaceRoleAction
     */
    omit?: WorkspaceRoleActionOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: WorkspaceRoleActionInclude<ExtArgs> | null
    /**
     * Filter, which WorkspaceRoleAction to fetch.
     */
    where?: WorkspaceRoleActionWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of WorkspaceRoleActions to fetch.
     */
    orderBy?: WorkspaceRoleActionOrderByWithRelationInput | WorkspaceRoleActionOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the position for searching for WorkspaceRoleActions.
     */
    cursor?: WorkspaceRoleActionWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` WorkspaceRoleActions from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` WorkspaceRoleActions.
     */
    skip?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/distinct Distinct Docs}
     * 
     * Filter by unique combinations of WorkspaceRoleActions.
     */
    distinct?: WorkspaceRoleActionScalarFieldEnum | WorkspaceRoleActionScalarFieldEnum[]
  }

  /**
   * WorkspaceRoleAction findFirstOrThrow
   */
  export type WorkspaceRoleActionFindFirstOrThrowArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the WorkspaceRoleAction
     */
    select?: WorkspaceRoleActionSelect<ExtArgs> | null
    /**
     * Omit specific fields from the WorkspaceRoleAction
     */
    omit?: WorkspaceRoleActionOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: WorkspaceRoleActionInclude<ExtArgs> | null
    /**
     * Filter, which WorkspaceRoleAction to fetch.
     */
    where?: WorkspaceRoleActionWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of WorkspaceRoleActions to fetch.
     */
    orderBy?: WorkspaceRoleActionOrderByWithRelationInput | WorkspaceRoleActionOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the position for searching for WorkspaceRoleActions.
     */
    cursor?: WorkspaceRoleActionWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` WorkspaceRoleActions from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` WorkspaceRoleActions.
     */
    skip?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/distinct Distinct Docs}
     * 
     * Filter by unique combinations of WorkspaceRoleActions.
     */
    distinct?: WorkspaceRoleActionScalarFieldEnum | WorkspaceRoleActionScalarFieldEnum[]
  }

  /**
   * WorkspaceRoleAction findMany
   */
  export type WorkspaceRoleActionFindManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the WorkspaceRoleAction
     */
    select?: WorkspaceRoleActionSelect<ExtArgs> | null
    /**
     * Omit specific fields from the WorkspaceRoleAction
     */
    omit?: WorkspaceRoleActionOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: WorkspaceRoleActionInclude<ExtArgs> | null
    /**
     * Filter, which WorkspaceRoleActions to fetch.
     */
    where?: WorkspaceRoleActionWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of WorkspaceRoleActions to fetch.
     */
    orderBy?: WorkspaceRoleActionOrderByWithRelationInput | WorkspaceRoleActionOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the position for listing WorkspaceRoleActions.
     */
    cursor?: WorkspaceRoleActionWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` WorkspaceRoleActions from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` WorkspaceRoleActions.
     */
    skip?: number
    distinct?: WorkspaceRoleActionScalarFieldEnum | WorkspaceRoleActionScalarFieldEnum[]
  }

  /**
   * WorkspaceRoleAction create
   */
  export type WorkspaceRoleActionCreateArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the WorkspaceRoleAction
     */
    select?: WorkspaceRoleActionSelect<ExtArgs> | null
    /**
     * Omit specific fields from the WorkspaceRoleAction
     */
    omit?: WorkspaceRoleActionOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: WorkspaceRoleActionInclude<ExtArgs> | null
    /**
     * The data needed to create a WorkspaceRoleAction.
     */
    data: XOR<WorkspaceRoleActionCreateInput, WorkspaceRoleActionUncheckedCreateInput>
  }

  /**
   * WorkspaceRoleAction createMany
   */
  export type WorkspaceRoleActionCreateManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * The data used to create many WorkspaceRoleActions.
     */
    data: WorkspaceRoleActionCreateManyInput | WorkspaceRoleActionCreateManyInput[]
    skipDuplicates?: boolean
  }

  /**
   * WorkspaceRoleAction createManyAndReturn
   */
  export type WorkspaceRoleActionCreateManyAndReturnArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the WorkspaceRoleAction
     */
    select?: WorkspaceRoleActionSelectCreateManyAndReturn<ExtArgs> | null
    /**
     * Omit specific fields from the WorkspaceRoleAction
     */
    omit?: WorkspaceRoleActionOmit<ExtArgs> | null
    /**
     * The data used to create many WorkspaceRoleActions.
     */
    data: WorkspaceRoleActionCreateManyInput | WorkspaceRoleActionCreateManyInput[]
    skipDuplicates?: boolean
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: WorkspaceRoleActionIncludeCreateManyAndReturn<ExtArgs> | null
  }

  /**
   * WorkspaceRoleAction update
   */
  export type WorkspaceRoleActionUpdateArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the WorkspaceRoleAction
     */
    select?: WorkspaceRoleActionSelect<ExtArgs> | null
    /**
     * Omit specific fields from the WorkspaceRoleAction
     */
    omit?: WorkspaceRoleActionOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: WorkspaceRoleActionInclude<ExtArgs> | null
    /**
     * The data needed to update a WorkspaceRoleAction.
     */
    data: XOR<WorkspaceRoleActionUpdateInput, WorkspaceRoleActionUncheckedUpdateInput>
    /**
     * Choose, which WorkspaceRoleAction to update.
     */
    where: WorkspaceRoleActionWhereUniqueInput
  }

  /**
   * WorkspaceRoleAction updateMany
   */
  export type WorkspaceRoleActionUpdateManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * The data used to update WorkspaceRoleActions.
     */
    data: XOR<WorkspaceRoleActionUpdateManyMutationInput, WorkspaceRoleActionUncheckedUpdateManyInput>
    /**
     * Filter which WorkspaceRoleActions to update
     */
    where?: WorkspaceRoleActionWhereInput
    /**
     * Limit how many WorkspaceRoleActions to update.
     */
    limit?: number
  }

  /**
   * WorkspaceRoleAction updateManyAndReturn
   */
  export type WorkspaceRoleActionUpdateManyAndReturnArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the WorkspaceRoleAction
     */
    select?: WorkspaceRoleActionSelectUpdateManyAndReturn<ExtArgs> | null
    /**
     * Omit specific fields from the WorkspaceRoleAction
     */
    omit?: WorkspaceRoleActionOmit<ExtArgs> | null
    /**
     * The data used to update WorkspaceRoleActions.
     */
    data: XOR<WorkspaceRoleActionUpdateManyMutationInput, WorkspaceRoleActionUncheckedUpdateManyInput>
    /**
     * Filter which WorkspaceRoleActions to update
     */
    where?: WorkspaceRoleActionWhereInput
    /**
     * Limit how many WorkspaceRoleActions to update.
     */
    limit?: number
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: WorkspaceRoleActionIncludeUpdateManyAndReturn<ExtArgs> | null
  }

  /**
   * WorkspaceRoleAction upsert
   */
  export type WorkspaceRoleActionUpsertArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the WorkspaceRoleAction
     */
    select?: WorkspaceRoleActionSelect<ExtArgs> | null
    /**
     * Omit specific fields from the WorkspaceRoleAction
     */
    omit?: WorkspaceRoleActionOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: WorkspaceRoleActionInclude<ExtArgs> | null
    /**
     * The filter to search for the WorkspaceRoleAction to update in case it exists.
     */
    where: WorkspaceRoleActionWhereUniqueInput
    /**
     * In case the WorkspaceRoleAction found by the `where` argument doesn't exist, create a new WorkspaceRoleAction with this data.
     */
    create: XOR<WorkspaceRoleActionCreateInput, WorkspaceRoleActionUncheckedCreateInput>
    /**
     * In case the WorkspaceRoleAction was found with the provided `where` argument, update it with this data.
     */
    update: XOR<WorkspaceRoleActionUpdateInput, WorkspaceRoleActionUncheckedUpdateInput>
  }

  /**
   * WorkspaceRoleAction delete
   */
  export type WorkspaceRoleActionDeleteArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the WorkspaceRoleAction
     */
    select?: WorkspaceRoleActionSelect<ExtArgs> | null
    /**
     * Omit specific fields from the WorkspaceRoleAction
     */
    omit?: WorkspaceRoleActionOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: WorkspaceRoleActionInclude<ExtArgs> | null
    /**
     * Filter which WorkspaceRoleAction to delete.
     */
    where: WorkspaceRoleActionWhereUniqueInput
  }

  /**
   * WorkspaceRoleAction deleteMany
   */
  export type WorkspaceRoleActionDeleteManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Filter which WorkspaceRoleActions to delete
     */
    where?: WorkspaceRoleActionWhereInput
    /**
     * Limit how many WorkspaceRoleActions to delete.
     */
    limit?: number
  }

  /**
   * WorkspaceRoleAction without action
   */
  export type WorkspaceRoleActionDefaultArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the WorkspaceRoleAction
     */
    select?: WorkspaceRoleActionSelect<ExtArgs> | null
    /**
     * Omit specific fields from the WorkspaceRoleAction
     */
    omit?: WorkspaceRoleActionOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: WorkspaceRoleActionInclude<ExtArgs> | null
  }


  /**
   * Enums
   */

  export const TransactionIsolationLevel: {
    ReadUncommitted: 'ReadUncommitted',
    ReadCommitted: 'ReadCommitted',
    RepeatableRead: 'RepeatableRead',
    Serializable: 'Serializable'
  };

  export type TransactionIsolationLevel = (typeof TransactionIsolationLevel)[keyof typeof TransactionIsolationLevel]


  export const UserProfileScalarFieldEnum: {
    userId: 'userId',
    keycloakUserId: 'keycloakUserId',
    email: 'email',
    displayName: 'displayName',
    avatarPath: 'avatarPath',
    timezone: 'timezone',
    language: 'language',
    notificationPrefs: 'notificationPrefs',
    status: 'status',
    deletedAt: 'deletedAt',
    createdAt: 'createdAt',
    updatedAt: 'updatedAt'
  };

  export type UserProfileScalarFieldEnum = (typeof UserProfileScalarFieldEnum)[keyof typeof UserProfileScalarFieldEnum]


  export const WorkspaceTemplateScalarFieldEnum: {
    id: 'id',
    name: 'name',
    description: 'description',
    structure: 'structure',
    isBuiltin: 'isBuiltin',
    createdBy: 'createdBy',
    version: 'version',
    createdAt: 'createdAt',
    updatedAt: 'updatedAt'
  };

  export type WorkspaceTemplateScalarFieldEnum = (typeof WorkspaceTemplateScalarFieldEnum)[keyof typeof WorkspaceTemplateScalarFieldEnum]


  export const TenantBrandingScalarFieldEnum: {
    id: 'id',
    logoPath: 'logoPath',
    primaryColor: 'primaryColor',
    darkMode: 'darkMode',
    updatedAt: 'updatedAt'
  };

  export type TenantBrandingScalarFieldEnum = (typeof TenantBrandingScalarFieldEnum)[keyof typeof TenantBrandingScalarFieldEnum]


  export const WorkspaceScalarFieldEnum: {
    id: 'id',
    name: 'name',
    slug: 'slug',
    description: 'description',
    parentId: 'parentId',
    materializedPath: 'materializedPath',
    status: 'status',
    archivedAt: 'archivedAt',
    templateId: 'templateId',
    createdBy: 'createdBy',
    version: 'version',
    createdAt: 'createdAt',
    updatedAt: 'updatedAt'
  };

  export type WorkspaceScalarFieldEnum = (typeof WorkspaceScalarFieldEnum)[keyof typeof WorkspaceScalarFieldEnum]


  export const WorkspaceMemberScalarFieldEnum: {
    id: 'id',
    workspaceId: 'workspaceId',
    userId: 'userId',
    role: 'role',
    createdAt: 'createdAt'
  };

  export type WorkspaceMemberScalarFieldEnum = (typeof WorkspaceMemberScalarFieldEnum)[keyof typeof WorkspaceMemberScalarFieldEnum]


  export const InvitationScalarFieldEnum: {
    id: 'id',
    email: 'email',
    workspaceId: 'workspaceId',
    role: 'role',
    status: 'status',
    invitedBy: 'invitedBy',
    token: 'token',
    expiresAt: 'expiresAt',
    acceptedAt: 'acceptedAt',
    createdAt: 'createdAt'
  };

  export type InvitationScalarFieldEnum = (typeof InvitationScalarFieldEnum)[keyof typeof InvitationScalarFieldEnum]


  export const AuditLogScalarFieldEnum: {
    id: 'id',
    actorId: 'actorId',
    actionType: 'actionType',
    targetType: 'targetType',
    targetId: 'targetId',
    beforeValue: 'beforeValue',
    afterValue: 'afterValue',
    ipAddress: 'ipAddress',
    createdAt: 'createdAt'
  };

  export type AuditLogScalarFieldEnum = (typeof AuditLogScalarFieldEnum)[keyof typeof AuditLogScalarFieldEnum]


  export const AbacDecisionLogScalarFieldEnum: {
    id: 'id',
    userId: 'userId',
    resourceType: 'resourceType',
    resourceId: 'resourceId',
    action: 'action',
    decision: 'decision',
    rulesEvaluated: 'rulesEvaluated',
    logLevel: 'logLevel',
    createdAt: 'createdAt'
  };

  export type AbacDecisionLogScalarFieldEnum = (typeof AbacDecisionLogScalarFieldEnum)[keyof typeof AbacDecisionLogScalarFieldEnum]


  export const ActionRegistryScalarFieldEnum: {
    id: 'id',
    pluginId: 'pluginId',
    actionKey: 'actionKey',
    labelI18nKey: 'labelI18nKey',
    description: 'description',
    defaultRole: 'defaultRole',
    createdAt: 'createdAt'
  };

  export type ActionRegistryScalarFieldEnum = (typeof ActionRegistryScalarFieldEnum)[keyof typeof ActionRegistryScalarFieldEnum]


  export const WorkspaceRoleActionScalarFieldEnum: {
    id: 'id',
    workspaceId: 'workspaceId',
    pluginId: 'pluginId',
    actionKey: 'actionKey',
    requiredRole: 'requiredRole',
    isOverridden: 'isOverridden',
    createdAt: 'createdAt',
    updatedAt: 'updatedAt'
  };

  export type WorkspaceRoleActionScalarFieldEnum = (typeof WorkspaceRoleActionScalarFieldEnum)[keyof typeof WorkspaceRoleActionScalarFieldEnum]


  export const SortOrder: {
    asc: 'asc',
    desc: 'desc'
  };

  export type SortOrder = (typeof SortOrder)[keyof typeof SortOrder]


  export const JsonNullValueInput: {
    JsonNull: typeof JsonNull
  };

  export type JsonNullValueInput = (typeof JsonNullValueInput)[keyof typeof JsonNullValueInput]


  export const NullableJsonNullValueInput: {
    DbNull: typeof DbNull,
    JsonNull: typeof JsonNull
  };

  export type NullableJsonNullValueInput = (typeof NullableJsonNullValueInput)[keyof typeof NullableJsonNullValueInput]


  export const QueryMode: {
    default: 'default',
    insensitive: 'insensitive'
  };

  export type QueryMode = (typeof QueryMode)[keyof typeof QueryMode]


  export const JsonNullValueFilter: {
    DbNull: typeof DbNull,
    JsonNull: typeof JsonNull,
    AnyNull: typeof AnyNull
  };

  export type JsonNullValueFilter = (typeof JsonNullValueFilter)[keyof typeof JsonNullValueFilter]


  export const NullsOrder: {
    first: 'first',
    last: 'last'
  };

  export type NullsOrder = (typeof NullsOrder)[keyof typeof NullsOrder]


  /**
   * Field references
   */


  /**
   * Reference to a field of type 'String'
   */
  export type StringFieldRefInput<$PrismaModel> = FieldRefInputType<$PrismaModel, 'String'>
    


  /**
   * Reference to a field of type 'String[]'
   */
  export type ListStringFieldRefInput<$PrismaModel> = FieldRefInputType<$PrismaModel, 'String[]'>
    


  /**
   * Reference to a field of type 'Json'
   */
  export type JsonFieldRefInput<$PrismaModel> = FieldRefInputType<$PrismaModel, 'Json'>
    


  /**
   * Reference to a field of type 'QueryMode'
   */
  export type EnumQueryModeFieldRefInput<$PrismaModel> = FieldRefInputType<$PrismaModel, 'QueryMode'>
    


  /**
   * Reference to a field of type 'DateTime'
   */
  export type DateTimeFieldRefInput<$PrismaModel> = FieldRefInputType<$PrismaModel, 'DateTime'>
    


  /**
   * Reference to a field of type 'DateTime[]'
   */
  export type ListDateTimeFieldRefInput<$PrismaModel> = FieldRefInputType<$PrismaModel, 'DateTime[]'>
    


  /**
   * Reference to a field of type 'Boolean'
   */
  export type BooleanFieldRefInput<$PrismaModel> = FieldRefInputType<$PrismaModel, 'Boolean'>
    


  /**
   * Reference to a field of type 'Int'
   */
  export type IntFieldRefInput<$PrismaModel> = FieldRefInputType<$PrismaModel, 'Int'>
    


  /**
   * Reference to a field of type 'Int[]'
   */
  export type ListIntFieldRefInput<$PrismaModel> = FieldRefInputType<$PrismaModel, 'Int[]'>
    


  /**
   * Reference to a field of type 'Float'
   */
  export type FloatFieldRefInput<$PrismaModel> = FieldRefInputType<$PrismaModel, 'Float'>
    


  /**
   * Reference to a field of type 'Float[]'
   */
  export type ListFloatFieldRefInput<$PrismaModel> = FieldRefInputType<$PrismaModel, 'Float[]'>
    
  /**
   * Deep Input Types
   */


  export type UserProfileWhereInput = {
    AND?: UserProfileWhereInput | UserProfileWhereInput[]
    OR?: UserProfileWhereInput[]
    NOT?: UserProfileWhereInput | UserProfileWhereInput[]
    userId?: UuidFilter<"UserProfile"> | string
    keycloakUserId?: StringFilter<"UserProfile"> | string
    email?: StringFilter<"UserProfile"> | string
    displayName?: StringNullableFilter<"UserProfile"> | string | null
    avatarPath?: StringNullableFilter<"UserProfile"> | string | null
    timezone?: StringFilter<"UserProfile"> | string
    language?: StringFilter<"UserProfile"> | string
    notificationPrefs?: JsonFilter<"UserProfile">
    status?: StringFilter<"UserProfile"> | string
    deletedAt?: DateTimeNullableFilter<"UserProfile"> | Date | string | null
    createdAt?: DateTimeFilter<"UserProfile"> | Date | string
    updatedAt?: DateTimeFilter<"UserProfile"> | Date | string
    workspacesCreated?: WorkspaceListRelationFilter
    workspaceMembers?: WorkspaceMemberListRelationFilter
    invitationsSent?: InvitationListRelationFilter
  }

  export type UserProfileOrderByWithRelationInput = {
    userId?: SortOrder
    keycloakUserId?: SortOrder
    email?: SortOrder
    displayName?: SortOrderInput | SortOrder
    avatarPath?: SortOrderInput | SortOrder
    timezone?: SortOrder
    language?: SortOrder
    notificationPrefs?: SortOrder
    status?: SortOrder
    deletedAt?: SortOrderInput | SortOrder
    createdAt?: SortOrder
    updatedAt?: SortOrder
    workspacesCreated?: WorkspaceOrderByRelationAggregateInput
    workspaceMembers?: WorkspaceMemberOrderByRelationAggregateInput
    invitationsSent?: InvitationOrderByRelationAggregateInput
  }

  export type UserProfileWhereUniqueInput = Prisma.AtLeast<{
    userId?: string
    keycloakUserId?: string
    AND?: UserProfileWhereInput | UserProfileWhereInput[]
    OR?: UserProfileWhereInput[]
    NOT?: UserProfileWhereInput | UserProfileWhereInput[]
    email?: StringFilter<"UserProfile"> | string
    displayName?: StringNullableFilter<"UserProfile"> | string | null
    avatarPath?: StringNullableFilter<"UserProfile"> | string | null
    timezone?: StringFilter<"UserProfile"> | string
    language?: StringFilter<"UserProfile"> | string
    notificationPrefs?: JsonFilter<"UserProfile">
    status?: StringFilter<"UserProfile"> | string
    deletedAt?: DateTimeNullableFilter<"UserProfile"> | Date | string | null
    createdAt?: DateTimeFilter<"UserProfile"> | Date | string
    updatedAt?: DateTimeFilter<"UserProfile"> | Date | string
    workspacesCreated?: WorkspaceListRelationFilter
    workspaceMembers?: WorkspaceMemberListRelationFilter
    invitationsSent?: InvitationListRelationFilter
  }, "userId" | "keycloakUserId">

  export type UserProfileOrderByWithAggregationInput = {
    userId?: SortOrder
    keycloakUserId?: SortOrder
    email?: SortOrder
    displayName?: SortOrderInput | SortOrder
    avatarPath?: SortOrderInput | SortOrder
    timezone?: SortOrder
    language?: SortOrder
    notificationPrefs?: SortOrder
    status?: SortOrder
    deletedAt?: SortOrderInput | SortOrder
    createdAt?: SortOrder
    updatedAt?: SortOrder
    _count?: UserProfileCountOrderByAggregateInput
    _max?: UserProfileMaxOrderByAggregateInput
    _min?: UserProfileMinOrderByAggregateInput
  }

  export type UserProfileScalarWhereWithAggregatesInput = {
    AND?: UserProfileScalarWhereWithAggregatesInput | UserProfileScalarWhereWithAggregatesInput[]
    OR?: UserProfileScalarWhereWithAggregatesInput[]
    NOT?: UserProfileScalarWhereWithAggregatesInput | UserProfileScalarWhereWithAggregatesInput[]
    userId?: UuidWithAggregatesFilter<"UserProfile"> | string
    keycloakUserId?: StringWithAggregatesFilter<"UserProfile"> | string
    email?: StringWithAggregatesFilter<"UserProfile"> | string
    displayName?: StringNullableWithAggregatesFilter<"UserProfile"> | string | null
    avatarPath?: StringNullableWithAggregatesFilter<"UserProfile"> | string | null
    timezone?: StringWithAggregatesFilter<"UserProfile"> | string
    language?: StringWithAggregatesFilter<"UserProfile"> | string
    notificationPrefs?: JsonWithAggregatesFilter<"UserProfile">
    status?: StringWithAggregatesFilter<"UserProfile"> | string
    deletedAt?: DateTimeNullableWithAggregatesFilter<"UserProfile"> | Date | string | null
    createdAt?: DateTimeWithAggregatesFilter<"UserProfile"> | Date | string
    updatedAt?: DateTimeWithAggregatesFilter<"UserProfile"> | Date | string
  }

  export type WorkspaceTemplateWhereInput = {
    AND?: WorkspaceTemplateWhereInput | WorkspaceTemplateWhereInput[]
    OR?: WorkspaceTemplateWhereInput[]
    NOT?: WorkspaceTemplateWhereInput | WorkspaceTemplateWhereInput[]
    id?: UuidFilter<"WorkspaceTemplate"> | string
    name?: StringFilter<"WorkspaceTemplate"> | string
    description?: StringNullableFilter<"WorkspaceTemplate"> | string | null
    structure?: JsonFilter<"WorkspaceTemplate">
    isBuiltin?: BoolFilter<"WorkspaceTemplate"> | boolean
    createdBy?: UuidNullableFilter<"WorkspaceTemplate"> | string | null
    version?: IntFilter<"WorkspaceTemplate"> | number
    createdAt?: DateTimeFilter<"WorkspaceTemplate"> | Date | string
    updatedAt?: DateTimeFilter<"WorkspaceTemplate"> | Date | string
    workspaces?: WorkspaceListRelationFilter
  }

  export type WorkspaceTemplateOrderByWithRelationInput = {
    id?: SortOrder
    name?: SortOrder
    description?: SortOrderInput | SortOrder
    structure?: SortOrder
    isBuiltin?: SortOrder
    createdBy?: SortOrderInput | SortOrder
    version?: SortOrder
    createdAt?: SortOrder
    updatedAt?: SortOrder
    workspaces?: WorkspaceOrderByRelationAggregateInput
  }

  export type WorkspaceTemplateWhereUniqueInput = Prisma.AtLeast<{
    id?: string
    AND?: WorkspaceTemplateWhereInput | WorkspaceTemplateWhereInput[]
    OR?: WorkspaceTemplateWhereInput[]
    NOT?: WorkspaceTemplateWhereInput | WorkspaceTemplateWhereInput[]
    name?: StringFilter<"WorkspaceTemplate"> | string
    description?: StringNullableFilter<"WorkspaceTemplate"> | string | null
    structure?: JsonFilter<"WorkspaceTemplate">
    isBuiltin?: BoolFilter<"WorkspaceTemplate"> | boolean
    createdBy?: UuidNullableFilter<"WorkspaceTemplate"> | string | null
    version?: IntFilter<"WorkspaceTemplate"> | number
    createdAt?: DateTimeFilter<"WorkspaceTemplate"> | Date | string
    updatedAt?: DateTimeFilter<"WorkspaceTemplate"> | Date | string
    workspaces?: WorkspaceListRelationFilter
  }, "id">

  export type WorkspaceTemplateOrderByWithAggregationInput = {
    id?: SortOrder
    name?: SortOrder
    description?: SortOrderInput | SortOrder
    structure?: SortOrder
    isBuiltin?: SortOrder
    createdBy?: SortOrderInput | SortOrder
    version?: SortOrder
    createdAt?: SortOrder
    updatedAt?: SortOrder
    _count?: WorkspaceTemplateCountOrderByAggregateInput
    _avg?: WorkspaceTemplateAvgOrderByAggregateInput
    _max?: WorkspaceTemplateMaxOrderByAggregateInput
    _min?: WorkspaceTemplateMinOrderByAggregateInput
    _sum?: WorkspaceTemplateSumOrderByAggregateInput
  }

  export type WorkspaceTemplateScalarWhereWithAggregatesInput = {
    AND?: WorkspaceTemplateScalarWhereWithAggregatesInput | WorkspaceTemplateScalarWhereWithAggregatesInput[]
    OR?: WorkspaceTemplateScalarWhereWithAggregatesInput[]
    NOT?: WorkspaceTemplateScalarWhereWithAggregatesInput | WorkspaceTemplateScalarWhereWithAggregatesInput[]
    id?: UuidWithAggregatesFilter<"WorkspaceTemplate"> | string
    name?: StringWithAggregatesFilter<"WorkspaceTemplate"> | string
    description?: StringNullableWithAggregatesFilter<"WorkspaceTemplate"> | string | null
    structure?: JsonWithAggregatesFilter<"WorkspaceTemplate">
    isBuiltin?: BoolWithAggregatesFilter<"WorkspaceTemplate"> | boolean
    createdBy?: UuidNullableWithAggregatesFilter<"WorkspaceTemplate"> | string | null
    version?: IntWithAggregatesFilter<"WorkspaceTemplate"> | number
    createdAt?: DateTimeWithAggregatesFilter<"WorkspaceTemplate"> | Date | string
    updatedAt?: DateTimeWithAggregatesFilter<"WorkspaceTemplate"> | Date | string
  }

  export type TenantBrandingWhereInput = {
    AND?: TenantBrandingWhereInput | TenantBrandingWhereInput[]
    OR?: TenantBrandingWhereInput[]
    NOT?: TenantBrandingWhereInput | TenantBrandingWhereInput[]
    id?: UuidFilter<"TenantBranding"> | string
    logoPath?: StringNullableFilter<"TenantBranding"> | string | null
    primaryColor?: StringFilter<"TenantBranding"> | string
    darkMode?: BoolFilter<"TenantBranding"> | boolean
    updatedAt?: DateTimeFilter<"TenantBranding"> | Date | string
  }

  export type TenantBrandingOrderByWithRelationInput = {
    id?: SortOrder
    logoPath?: SortOrderInput | SortOrder
    primaryColor?: SortOrder
    darkMode?: SortOrder
    updatedAt?: SortOrder
  }

  export type TenantBrandingWhereUniqueInput = Prisma.AtLeast<{
    id?: string
    AND?: TenantBrandingWhereInput | TenantBrandingWhereInput[]
    OR?: TenantBrandingWhereInput[]
    NOT?: TenantBrandingWhereInput | TenantBrandingWhereInput[]
    logoPath?: StringNullableFilter<"TenantBranding"> | string | null
    primaryColor?: StringFilter<"TenantBranding"> | string
    darkMode?: BoolFilter<"TenantBranding"> | boolean
    updatedAt?: DateTimeFilter<"TenantBranding"> | Date | string
  }, "id">

  export type TenantBrandingOrderByWithAggregationInput = {
    id?: SortOrder
    logoPath?: SortOrderInput | SortOrder
    primaryColor?: SortOrder
    darkMode?: SortOrder
    updatedAt?: SortOrder
    _count?: TenantBrandingCountOrderByAggregateInput
    _max?: TenantBrandingMaxOrderByAggregateInput
    _min?: TenantBrandingMinOrderByAggregateInput
  }

  export type TenantBrandingScalarWhereWithAggregatesInput = {
    AND?: TenantBrandingScalarWhereWithAggregatesInput | TenantBrandingScalarWhereWithAggregatesInput[]
    OR?: TenantBrandingScalarWhereWithAggregatesInput[]
    NOT?: TenantBrandingScalarWhereWithAggregatesInput | TenantBrandingScalarWhereWithAggregatesInput[]
    id?: UuidWithAggregatesFilter<"TenantBranding"> | string
    logoPath?: StringNullableWithAggregatesFilter<"TenantBranding"> | string | null
    primaryColor?: StringWithAggregatesFilter<"TenantBranding"> | string
    darkMode?: BoolWithAggregatesFilter<"TenantBranding"> | boolean
    updatedAt?: DateTimeWithAggregatesFilter<"TenantBranding"> | Date | string
  }

  export type WorkspaceWhereInput = {
    AND?: WorkspaceWhereInput | WorkspaceWhereInput[]
    OR?: WorkspaceWhereInput[]
    NOT?: WorkspaceWhereInput | WorkspaceWhereInput[]
    id?: UuidFilter<"Workspace"> | string
    name?: StringFilter<"Workspace"> | string
    slug?: StringFilter<"Workspace"> | string
    description?: StringNullableFilter<"Workspace"> | string | null
    parentId?: UuidNullableFilter<"Workspace"> | string | null
    materializedPath?: StringFilter<"Workspace"> | string
    status?: StringFilter<"Workspace"> | string
    archivedAt?: DateTimeNullableFilter<"Workspace"> | Date | string | null
    templateId?: UuidNullableFilter<"Workspace"> | string | null
    createdBy?: UuidFilter<"Workspace"> | string
    version?: IntFilter<"Workspace"> | number
    createdAt?: DateTimeFilter<"Workspace"> | Date | string
    updatedAt?: DateTimeFilter<"Workspace"> | Date | string
    parent?: XOR<WorkspaceNullableScalarRelationFilter, WorkspaceWhereInput> | null
    children?: WorkspaceListRelationFilter
    template?: XOR<WorkspaceTemplateNullableScalarRelationFilter, WorkspaceTemplateWhereInput> | null
    creator?: XOR<UserProfileScalarRelationFilter, UserProfileWhereInput>
    members?: WorkspaceMemberListRelationFilter
    invitations?: InvitationListRelationFilter
    roleActions?: WorkspaceRoleActionListRelationFilter
  }

  export type WorkspaceOrderByWithRelationInput = {
    id?: SortOrder
    name?: SortOrder
    slug?: SortOrder
    description?: SortOrderInput | SortOrder
    parentId?: SortOrderInput | SortOrder
    materializedPath?: SortOrder
    status?: SortOrder
    archivedAt?: SortOrderInput | SortOrder
    templateId?: SortOrderInput | SortOrder
    createdBy?: SortOrder
    version?: SortOrder
    createdAt?: SortOrder
    updatedAt?: SortOrder
    parent?: WorkspaceOrderByWithRelationInput
    children?: WorkspaceOrderByRelationAggregateInput
    template?: WorkspaceTemplateOrderByWithRelationInput
    creator?: UserProfileOrderByWithRelationInput
    members?: WorkspaceMemberOrderByRelationAggregateInput
    invitations?: InvitationOrderByRelationAggregateInput
    roleActions?: WorkspaceRoleActionOrderByRelationAggregateInput
  }

  export type WorkspaceWhereUniqueInput = Prisma.AtLeast<{
    id?: string
    slug?: string
    AND?: WorkspaceWhereInput | WorkspaceWhereInput[]
    OR?: WorkspaceWhereInput[]
    NOT?: WorkspaceWhereInput | WorkspaceWhereInput[]
    name?: StringFilter<"Workspace"> | string
    description?: StringNullableFilter<"Workspace"> | string | null
    parentId?: UuidNullableFilter<"Workspace"> | string | null
    materializedPath?: StringFilter<"Workspace"> | string
    status?: StringFilter<"Workspace"> | string
    archivedAt?: DateTimeNullableFilter<"Workspace"> | Date | string | null
    templateId?: UuidNullableFilter<"Workspace"> | string | null
    createdBy?: UuidFilter<"Workspace"> | string
    version?: IntFilter<"Workspace"> | number
    createdAt?: DateTimeFilter<"Workspace"> | Date | string
    updatedAt?: DateTimeFilter<"Workspace"> | Date | string
    parent?: XOR<WorkspaceNullableScalarRelationFilter, WorkspaceWhereInput> | null
    children?: WorkspaceListRelationFilter
    template?: XOR<WorkspaceTemplateNullableScalarRelationFilter, WorkspaceTemplateWhereInput> | null
    creator?: XOR<UserProfileScalarRelationFilter, UserProfileWhereInput>
    members?: WorkspaceMemberListRelationFilter
    invitations?: InvitationListRelationFilter
    roleActions?: WorkspaceRoleActionListRelationFilter
  }, "id" | "slug">

  export type WorkspaceOrderByWithAggregationInput = {
    id?: SortOrder
    name?: SortOrder
    slug?: SortOrder
    description?: SortOrderInput | SortOrder
    parentId?: SortOrderInput | SortOrder
    materializedPath?: SortOrder
    status?: SortOrder
    archivedAt?: SortOrderInput | SortOrder
    templateId?: SortOrderInput | SortOrder
    createdBy?: SortOrder
    version?: SortOrder
    createdAt?: SortOrder
    updatedAt?: SortOrder
    _count?: WorkspaceCountOrderByAggregateInput
    _avg?: WorkspaceAvgOrderByAggregateInput
    _max?: WorkspaceMaxOrderByAggregateInput
    _min?: WorkspaceMinOrderByAggregateInput
    _sum?: WorkspaceSumOrderByAggregateInput
  }

  export type WorkspaceScalarWhereWithAggregatesInput = {
    AND?: WorkspaceScalarWhereWithAggregatesInput | WorkspaceScalarWhereWithAggregatesInput[]
    OR?: WorkspaceScalarWhereWithAggregatesInput[]
    NOT?: WorkspaceScalarWhereWithAggregatesInput | WorkspaceScalarWhereWithAggregatesInput[]
    id?: UuidWithAggregatesFilter<"Workspace"> | string
    name?: StringWithAggregatesFilter<"Workspace"> | string
    slug?: StringWithAggregatesFilter<"Workspace"> | string
    description?: StringNullableWithAggregatesFilter<"Workspace"> | string | null
    parentId?: UuidNullableWithAggregatesFilter<"Workspace"> | string | null
    materializedPath?: StringWithAggregatesFilter<"Workspace"> | string
    status?: StringWithAggregatesFilter<"Workspace"> | string
    archivedAt?: DateTimeNullableWithAggregatesFilter<"Workspace"> | Date | string | null
    templateId?: UuidNullableWithAggregatesFilter<"Workspace"> | string | null
    createdBy?: UuidWithAggregatesFilter<"Workspace"> | string
    version?: IntWithAggregatesFilter<"Workspace"> | number
    createdAt?: DateTimeWithAggregatesFilter<"Workspace"> | Date | string
    updatedAt?: DateTimeWithAggregatesFilter<"Workspace"> | Date | string
  }

  export type WorkspaceMemberWhereInput = {
    AND?: WorkspaceMemberWhereInput | WorkspaceMemberWhereInput[]
    OR?: WorkspaceMemberWhereInput[]
    NOT?: WorkspaceMemberWhereInput | WorkspaceMemberWhereInput[]
    id?: UuidFilter<"WorkspaceMember"> | string
    workspaceId?: UuidFilter<"WorkspaceMember"> | string
    userId?: UuidFilter<"WorkspaceMember"> | string
    role?: StringFilter<"WorkspaceMember"> | string
    createdAt?: DateTimeFilter<"WorkspaceMember"> | Date | string
    workspace?: XOR<WorkspaceScalarRelationFilter, WorkspaceWhereInput>
    user?: XOR<UserProfileScalarRelationFilter, UserProfileWhereInput>
  }

  export type WorkspaceMemberOrderByWithRelationInput = {
    id?: SortOrder
    workspaceId?: SortOrder
    userId?: SortOrder
    role?: SortOrder
    createdAt?: SortOrder
    workspace?: WorkspaceOrderByWithRelationInput
    user?: UserProfileOrderByWithRelationInput
  }

  export type WorkspaceMemberWhereUniqueInput = Prisma.AtLeast<{
    id?: string
    workspaceId_userId?: WorkspaceMemberWorkspaceIdUserIdCompoundUniqueInput
    AND?: WorkspaceMemberWhereInput | WorkspaceMemberWhereInput[]
    OR?: WorkspaceMemberWhereInput[]
    NOT?: WorkspaceMemberWhereInput | WorkspaceMemberWhereInput[]
    workspaceId?: UuidFilter<"WorkspaceMember"> | string
    userId?: UuidFilter<"WorkspaceMember"> | string
    role?: StringFilter<"WorkspaceMember"> | string
    createdAt?: DateTimeFilter<"WorkspaceMember"> | Date | string
    workspace?: XOR<WorkspaceScalarRelationFilter, WorkspaceWhereInput>
    user?: XOR<UserProfileScalarRelationFilter, UserProfileWhereInput>
  }, "id" | "workspaceId_userId">

  export type WorkspaceMemberOrderByWithAggregationInput = {
    id?: SortOrder
    workspaceId?: SortOrder
    userId?: SortOrder
    role?: SortOrder
    createdAt?: SortOrder
    _count?: WorkspaceMemberCountOrderByAggregateInput
    _max?: WorkspaceMemberMaxOrderByAggregateInput
    _min?: WorkspaceMemberMinOrderByAggregateInput
  }

  export type WorkspaceMemberScalarWhereWithAggregatesInput = {
    AND?: WorkspaceMemberScalarWhereWithAggregatesInput | WorkspaceMemberScalarWhereWithAggregatesInput[]
    OR?: WorkspaceMemberScalarWhereWithAggregatesInput[]
    NOT?: WorkspaceMemberScalarWhereWithAggregatesInput | WorkspaceMemberScalarWhereWithAggregatesInput[]
    id?: UuidWithAggregatesFilter<"WorkspaceMember"> | string
    workspaceId?: UuidWithAggregatesFilter<"WorkspaceMember"> | string
    userId?: UuidWithAggregatesFilter<"WorkspaceMember"> | string
    role?: StringWithAggregatesFilter<"WorkspaceMember"> | string
    createdAt?: DateTimeWithAggregatesFilter<"WorkspaceMember"> | Date | string
  }

  export type InvitationWhereInput = {
    AND?: InvitationWhereInput | InvitationWhereInput[]
    OR?: InvitationWhereInput[]
    NOT?: InvitationWhereInput | InvitationWhereInput[]
    id?: UuidFilter<"Invitation"> | string
    email?: StringFilter<"Invitation"> | string
    workspaceId?: UuidFilter<"Invitation"> | string
    role?: StringFilter<"Invitation"> | string
    status?: StringFilter<"Invitation"> | string
    invitedBy?: UuidFilter<"Invitation"> | string
    token?: StringFilter<"Invitation"> | string
    expiresAt?: DateTimeFilter<"Invitation"> | Date | string
    acceptedAt?: DateTimeNullableFilter<"Invitation"> | Date | string | null
    createdAt?: DateTimeFilter<"Invitation"> | Date | string
    workspace?: XOR<WorkspaceScalarRelationFilter, WorkspaceWhereInput>
    inviter?: XOR<UserProfileScalarRelationFilter, UserProfileWhereInput>
  }

  export type InvitationOrderByWithRelationInput = {
    id?: SortOrder
    email?: SortOrder
    workspaceId?: SortOrder
    role?: SortOrder
    status?: SortOrder
    invitedBy?: SortOrder
    token?: SortOrder
    expiresAt?: SortOrder
    acceptedAt?: SortOrderInput | SortOrder
    createdAt?: SortOrder
    workspace?: WorkspaceOrderByWithRelationInput
    inviter?: UserProfileOrderByWithRelationInput
  }

  export type InvitationWhereUniqueInput = Prisma.AtLeast<{
    id?: string
    token?: string
    AND?: InvitationWhereInput | InvitationWhereInput[]
    OR?: InvitationWhereInput[]
    NOT?: InvitationWhereInput | InvitationWhereInput[]
    email?: StringFilter<"Invitation"> | string
    workspaceId?: UuidFilter<"Invitation"> | string
    role?: StringFilter<"Invitation"> | string
    status?: StringFilter<"Invitation"> | string
    invitedBy?: UuidFilter<"Invitation"> | string
    expiresAt?: DateTimeFilter<"Invitation"> | Date | string
    acceptedAt?: DateTimeNullableFilter<"Invitation"> | Date | string | null
    createdAt?: DateTimeFilter<"Invitation"> | Date | string
    workspace?: XOR<WorkspaceScalarRelationFilter, WorkspaceWhereInput>
    inviter?: XOR<UserProfileScalarRelationFilter, UserProfileWhereInput>
  }, "id" | "token">

  export type InvitationOrderByWithAggregationInput = {
    id?: SortOrder
    email?: SortOrder
    workspaceId?: SortOrder
    role?: SortOrder
    status?: SortOrder
    invitedBy?: SortOrder
    token?: SortOrder
    expiresAt?: SortOrder
    acceptedAt?: SortOrderInput | SortOrder
    createdAt?: SortOrder
    _count?: InvitationCountOrderByAggregateInput
    _max?: InvitationMaxOrderByAggregateInput
    _min?: InvitationMinOrderByAggregateInput
  }

  export type InvitationScalarWhereWithAggregatesInput = {
    AND?: InvitationScalarWhereWithAggregatesInput | InvitationScalarWhereWithAggregatesInput[]
    OR?: InvitationScalarWhereWithAggregatesInput[]
    NOT?: InvitationScalarWhereWithAggregatesInput | InvitationScalarWhereWithAggregatesInput[]
    id?: UuidWithAggregatesFilter<"Invitation"> | string
    email?: StringWithAggregatesFilter<"Invitation"> | string
    workspaceId?: UuidWithAggregatesFilter<"Invitation"> | string
    role?: StringWithAggregatesFilter<"Invitation"> | string
    status?: StringWithAggregatesFilter<"Invitation"> | string
    invitedBy?: UuidWithAggregatesFilter<"Invitation"> | string
    token?: StringWithAggregatesFilter<"Invitation"> | string
    expiresAt?: DateTimeWithAggregatesFilter<"Invitation"> | Date | string
    acceptedAt?: DateTimeNullableWithAggregatesFilter<"Invitation"> | Date | string | null
    createdAt?: DateTimeWithAggregatesFilter<"Invitation"> | Date | string
  }

  export type AuditLogWhereInput = {
    AND?: AuditLogWhereInput | AuditLogWhereInput[]
    OR?: AuditLogWhereInput[]
    NOT?: AuditLogWhereInput | AuditLogWhereInput[]
    id?: UuidFilter<"AuditLog"> | string
    actorId?: UuidFilter<"AuditLog"> | string
    actionType?: StringFilter<"AuditLog"> | string
    targetType?: StringFilter<"AuditLog"> | string
    targetId?: UuidNullableFilter<"AuditLog"> | string | null
    beforeValue?: JsonNullableFilter<"AuditLog">
    afterValue?: JsonNullableFilter<"AuditLog">
    ipAddress?: StringNullableFilter<"AuditLog"> | string | null
    createdAt?: DateTimeFilter<"AuditLog"> | Date | string
  }

  export type AuditLogOrderByWithRelationInput = {
    id?: SortOrder
    actorId?: SortOrder
    actionType?: SortOrder
    targetType?: SortOrder
    targetId?: SortOrderInput | SortOrder
    beforeValue?: SortOrderInput | SortOrder
    afterValue?: SortOrderInput | SortOrder
    ipAddress?: SortOrderInput | SortOrder
    createdAt?: SortOrder
  }

  export type AuditLogWhereUniqueInput = Prisma.AtLeast<{
    id?: string
    AND?: AuditLogWhereInput | AuditLogWhereInput[]
    OR?: AuditLogWhereInput[]
    NOT?: AuditLogWhereInput | AuditLogWhereInput[]
    actorId?: UuidFilter<"AuditLog"> | string
    actionType?: StringFilter<"AuditLog"> | string
    targetType?: StringFilter<"AuditLog"> | string
    targetId?: UuidNullableFilter<"AuditLog"> | string | null
    beforeValue?: JsonNullableFilter<"AuditLog">
    afterValue?: JsonNullableFilter<"AuditLog">
    ipAddress?: StringNullableFilter<"AuditLog"> | string | null
    createdAt?: DateTimeFilter<"AuditLog"> | Date | string
  }, "id">

  export type AuditLogOrderByWithAggregationInput = {
    id?: SortOrder
    actorId?: SortOrder
    actionType?: SortOrder
    targetType?: SortOrder
    targetId?: SortOrderInput | SortOrder
    beforeValue?: SortOrderInput | SortOrder
    afterValue?: SortOrderInput | SortOrder
    ipAddress?: SortOrderInput | SortOrder
    createdAt?: SortOrder
    _count?: AuditLogCountOrderByAggregateInput
    _max?: AuditLogMaxOrderByAggregateInput
    _min?: AuditLogMinOrderByAggregateInput
  }

  export type AuditLogScalarWhereWithAggregatesInput = {
    AND?: AuditLogScalarWhereWithAggregatesInput | AuditLogScalarWhereWithAggregatesInput[]
    OR?: AuditLogScalarWhereWithAggregatesInput[]
    NOT?: AuditLogScalarWhereWithAggregatesInput | AuditLogScalarWhereWithAggregatesInput[]
    id?: UuidWithAggregatesFilter<"AuditLog"> | string
    actorId?: UuidWithAggregatesFilter<"AuditLog"> | string
    actionType?: StringWithAggregatesFilter<"AuditLog"> | string
    targetType?: StringWithAggregatesFilter<"AuditLog"> | string
    targetId?: UuidNullableWithAggregatesFilter<"AuditLog"> | string | null
    beforeValue?: JsonNullableWithAggregatesFilter<"AuditLog">
    afterValue?: JsonNullableWithAggregatesFilter<"AuditLog">
    ipAddress?: StringNullableWithAggregatesFilter<"AuditLog"> | string | null
    createdAt?: DateTimeWithAggregatesFilter<"AuditLog"> | Date | string
  }

  export type AbacDecisionLogWhereInput = {
    AND?: AbacDecisionLogWhereInput | AbacDecisionLogWhereInput[]
    OR?: AbacDecisionLogWhereInput[]
    NOT?: AbacDecisionLogWhereInput | AbacDecisionLogWhereInput[]
    id?: UuidFilter<"AbacDecisionLog"> | string
    userId?: UuidFilter<"AbacDecisionLog"> | string
    resourceType?: StringFilter<"AbacDecisionLog"> | string
    resourceId?: UuidNullableFilter<"AbacDecisionLog"> | string | null
    action?: StringFilter<"AbacDecisionLog"> | string
    decision?: StringFilter<"AbacDecisionLog"> | string
    rulesEvaluated?: JsonFilter<"AbacDecisionLog">
    logLevel?: StringFilter<"AbacDecisionLog"> | string
    createdAt?: DateTimeFilter<"AbacDecisionLog"> | Date | string
  }

  export type AbacDecisionLogOrderByWithRelationInput = {
    id?: SortOrder
    userId?: SortOrder
    resourceType?: SortOrder
    resourceId?: SortOrderInput | SortOrder
    action?: SortOrder
    decision?: SortOrder
    rulesEvaluated?: SortOrder
    logLevel?: SortOrder
    createdAt?: SortOrder
  }

  export type AbacDecisionLogWhereUniqueInput = Prisma.AtLeast<{
    id?: string
    AND?: AbacDecisionLogWhereInput | AbacDecisionLogWhereInput[]
    OR?: AbacDecisionLogWhereInput[]
    NOT?: AbacDecisionLogWhereInput | AbacDecisionLogWhereInput[]
    userId?: UuidFilter<"AbacDecisionLog"> | string
    resourceType?: StringFilter<"AbacDecisionLog"> | string
    resourceId?: UuidNullableFilter<"AbacDecisionLog"> | string | null
    action?: StringFilter<"AbacDecisionLog"> | string
    decision?: StringFilter<"AbacDecisionLog"> | string
    rulesEvaluated?: JsonFilter<"AbacDecisionLog">
    logLevel?: StringFilter<"AbacDecisionLog"> | string
    createdAt?: DateTimeFilter<"AbacDecisionLog"> | Date | string
  }, "id">

  export type AbacDecisionLogOrderByWithAggregationInput = {
    id?: SortOrder
    userId?: SortOrder
    resourceType?: SortOrder
    resourceId?: SortOrderInput | SortOrder
    action?: SortOrder
    decision?: SortOrder
    rulesEvaluated?: SortOrder
    logLevel?: SortOrder
    createdAt?: SortOrder
    _count?: AbacDecisionLogCountOrderByAggregateInput
    _max?: AbacDecisionLogMaxOrderByAggregateInput
    _min?: AbacDecisionLogMinOrderByAggregateInput
  }

  export type AbacDecisionLogScalarWhereWithAggregatesInput = {
    AND?: AbacDecisionLogScalarWhereWithAggregatesInput | AbacDecisionLogScalarWhereWithAggregatesInput[]
    OR?: AbacDecisionLogScalarWhereWithAggregatesInput[]
    NOT?: AbacDecisionLogScalarWhereWithAggregatesInput | AbacDecisionLogScalarWhereWithAggregatesInput[]
    id?: UuidWithAggregatesFilter<"AbacDecisionLog"> | string
    userId?: UuidWithAggregatesFilter<"AbacDecisionLog"> | string
    resourceType?: StringWithAggregatesFilter<"AbacDecisionLog"> | string
    resourceId?: UuidNullableWithAggregatesFilter<"AbacDecisionLog"> | string | null
    action?: StringWithAggregatesFilter<"AbacDecisionLog"> | string
    decision?: StringWithAggregatesFilter<"AbacDecisionLog"> | string
    rulesEvaluated?: JsonWithAggregatesFilter<"AbacDecisionLog">
    logLevel?: StringWithAggregatesFilter<"AbacDecisionLog"> | string
    createdAt?: DateTimeWithAggregatesFilter<"AbacDecisionLog"> | Date | string
  }

  export type ActionRegistryWhereInput = {
    AND?: ActionRegistryWhereInput | ActionRegistryWhereInput[]
    OR?: ActionRegistryWhereInput[]
    NOT?: ActionRegistryWhereInput | ActionRegistryWhereInput[]
    id?: UuidFilter<"ActionRegistry"> | string
    pluginId?: UuidFilter<"ActionRegistry"> | string
    actionKey?: StringFilter<"ActionRegistry"> | string
    labelI18nKey?: StringFilter<"ActionRegistry"> | string
    description?: StringNullableFilter<"ActionRegistry"> | string | null
    defaultRole?: StringFilter<"ActionRegistry"> | string
    createdAt?: DateTimeFilter<"ActionRegistry"> | Date | string
  }

  export type ActionRegistryOrderByWithRelationInput = {
    id?: SortOrder
    pluginId?: SortOrder
    actionKey?: SortOrder
    labelI18nKey?: SortOrder
    description?: SortOrderInput | SortOrder
    defaultRole?: SortOrder
    createdAt?: SortOrder
  }

  export type ActionRegistryWhereUniqueInput = Prisma.AtLeast<{
    id?: string
    pluginId_actionKey?: ActionRegistryPluginIdActionKeyCompoundUniqueInput
    AND?: ActionRegistryWhereInput | ActionRegistryWhereInput[]
    OR?: ActionRegistryWhereInput[]
    NOT?: ActionRegistryWhereInput | ActionRegistryWhereInput[]
    pluginId?: UuidFilter<"ActionRegistry"> | string
    actionKey?: StringFilter<"ActionRegistry"> | string
    labelI18nKey?: StringFilter<"ActionRegistry"> | string
    description?: StringNullableFilter<"ActionRegistry"> | string | null
    defaultRole?: StringFilter<"ActionRegistry"> | string
    createdAt?: DateTimeFilter<"ActionRegistry"> | Date | string
  }, "id" | "pluginId_actionKey">

  export type ActionRegistryOrderByWithAggregationInput = {
    id?: SortOrder
    pluginId?: SortOrder
    actionKey?: SortOrder
    labelI18nKey?: SortOrder
    description?: SortOrderInput | SortOrder
    defaultRole?: SortOrder
    createdAt?: SortOrder
    _count?: ActionRegistryCountOrderByAggregateInput
    _max?: ActionRegistryMaxOrderByAggregateInput
    _min?: ActionRegistryMinOrderByAggregateInput
  }

  export type ActionRegistryScalarWhereWithAggregatesInput = {
    AND?: ActionRegistryScalarWhereWithAggregatesInput | ActionRegistryScalarWhereWithAggregatesInput[]
    OR?: ActionRegistryScalarWhereWithAggregatesInput[]
    NOT?: ActionRegistryScalarWhereWithAggregatesInput | ActionRegistryScalarWhereWithAggregatesInput[]
    id?: UuidWithAggregatesFilter<"ActionRegistry"> | string
    pluginId?: UuidWithAggregatesFilter<"ActionRegistry"> | string
    actionKey?: StringWithAggregatesFilter<"ActionRegistry"> | string
    labelI18nKey?: StringWithAggregatesFilter<"ActionRegistry"> | string
    description?: StringNullableWithAggregatesFilter<"ActionRegistry"> | string | null
    defaultRole?: StringWithAggregatesFilter<"ActionRegistry"> | string
    createdAt?: DateTimeWithAggregatesFilter<"ActionRegistry"> | Date | string
  }

  export type WorkspaceRoleActionWhereInput = {
    AND?: WorkspaceRoleActionWhereInput | WorkspaceRoleActionWhereInput[]
    OR?: WorkspaceRoleActionWhereInput[]
    NOT?: WorkspaceRoleActionWhereInput | WorkspaceRoleActionWhereInput[]
    id?: UuidFilter<"WorkspaceRoleAction"> | string
    workspaceId?: UuidFilter<"WorkspaceRoleAction"> | string
    pluginId?: UuidFilter<"WorkspaceRoleAction"> | string
    actionKey?: StringFilter<"WorkspaceRoleAction"> | string
    requiredRole?: StringFilter<"WorkspaceRoleAction"> | string
    isOverridden?: BoolFilter<"WorkspaceRoleAction"> | boolean
    createdAt?: DateTimeFilter<"WorkspaceRoleAction"> | Date | string
    updatedAt?: DateTimeFilter<"WorkspaceRoleAction"> | Date | string
    workspace?: XOR<WorkspaceScalarRelationFilter, WorkspaceWhereInput>
  }

  export type WorkspaceRoleActionOrderByWithRelationInput = {
    id?: SortOrder
    workspaceId?: SortOrder
    pluginId?: SortOrder
    actionKey?: SortOrder
    requiredRole?: SortOrder
    isOverridden?: SortOrder
    createdAt?: SortOrder
    updatedAt?: SortOrder
    workspace?: WorkspaceOrderByWithRelationInput
  }

  export type WorkspaceRoleActionWhereUniqueInput = Prisma.AtLeast<{
    id?: string
    workspaceId_pluginId_actionKey?: WorkspaceRoleActionWorkspaceIdPluginIdActionKeyCompoundUniqueInput
    AND?: WorkspaceRoleActionWhereInput | WorkspaceRoleActionWhereInput[]
    OR?: WorkspaceRoleActionWhereInput[]
    NOT?: WorkspaceRoleActionWhereInput | WorkspaceRoleActionWhereInput[]
    workspaceId?: UuidFilter<"WorkspaceRoleAction"> | string
    pluginId?: UuidFilter<"WorkspaceRoleAction"> | string
    actionKey?: StringFilter<"WorkspaceRoleAction"> | string
    requiredRole?: StringFilter<"WorkspaceRoleAction"> | string
    isOverridden?: BoolFilter<"WorkspaceRoleAction"> | boolean
    createdAt?: DateTimeFilter<"WorkspaceRoleAction"> | Date | string
    updatedAt?: DateTimeFilter<"WorkspaceRoleAction"> | Date | string
    workspace?: XOR<WorkspaceScalarRelationFilter, WorkspaceWhereInput>
  }, "id" | "workspaceId_pluginId_actionKey">

  export type WorkspaceRoleActionOrderByWithAggregationInput = {
    id?: SortOrder
    workspaceId?: SortOrder
    pluginId?: SortOrder
    actionKey?: SortOrder
    requiredRole?: SortOrder
    isOverridden?: SortOrder
    createdAt?: SortOrder
    updatedAt?: SortOrder
    _count?: WorkspaceRoleActionCountOrderByAggregateInput
    _max?: WorkspaceRoleActionMaxOrderByAggregateInput
    _min?: WorkspaceRoleActionMinOrderByAggregateInput
  }

  export type WorkspaceRoleActionScalarWhereWithAggregatesInput = {
    AND?: WorkspaceRoleActionScalarWhereWithAggregatesInput | WorkspaceRoleActionScalarWhereWithAggregatesInput[]
    OR?: WorkspaceRoleActionScalarWhereWithAggregatesInput[]
    NOT?: WorkspaceRoleActionScalarWhereWithAggregatesInput | WorkspaceRoleActionScalarWhereWithAggregatesInput[]
    id?: UuidWithAggregatesFilter<"WorkspaceRoleAction"> | string
    workspaceId?: UuidWithAggregatesFilter<"WorkspaceRoleAction"> | string
    pluginId?: UuidWithAggregatesFilter<"WorkspaceRoleAction"> | string
    actionKey?: StringWithAggregatesFilter<"WorkspaceRoleAction"> | string
    requiredRole?: StringWithAggregatesFilter<"WorkspaceRoleAction"> | string
    isOverridden?: BoolWithAggregatesFilter<"WorkspaceRoleAction"> | boolean
    createdAt?: DateTimeWithAggregatesFilter<"WorkspaceRoleAction"> | Date | string
    updatedAt?: DateTimeWithAggregatesFilter<"WorkspaceRoleAction"> | Date | string
  }

  export type UserProfileCreateInput = {
    userId: string
    keycloakUserId: string
    email: string
    displayName?: string | null
    avatarPath?: string | null
    timezone?: string
    language?: string
    notificationPrefs?: JsonNullValueInput | InputJsonValue
    status?: string
    deletedAt?: Date | string | null
    createdAt?: Date | string
    updatedAt?: Date | string
    workspacesCreated?: WorkspaceCreateNestedManyWithoutCreatorInput
    workspaceMembers?: WorkspaceMemberCreateNestedManyWithoutUserInput
    invitationsSent?: InvitationCreateNestedManyWithoutInviterInput
  }

  export type UserProfileUncheckedCreateInput = {
    userId: string
    keycloakUserId: string
    email: string
    displayName?: string | null
    avatarPath?: string | null
    timezone?: string
    language?: string
    notificationPrefs?: JsonNullValueInput | InputJsonValue
    status?: string
    deletedAt?: Date | string | null
    createdAt?: Date | string
    updatedAt?: Date | string
    workspacesCreated?: WorkspaceUncheckedCreateNestedManyWithoutCreatorInput
    workspaceMembers?: WorkspaceMemberUncheckedCreateNestedManyWithoutUserInput
    invitationsSent?: InvitationUncheckedCreateNestedManyWithoutInviterInput
  }

  export type UserProfileUpdateInput = {
    userId?: StringFieldUpdateOperationsInput | string
    keycloakUserId?: StringFieldUpdateOperationsInput | string
    email?: StringFieldUpdateOperationsInput | string
    displayName?: NullableStringFieldUpdateOperationsInput | string | null
    avatarPath?: NullableStringFieldUpdateOperationsInput | string | null
    timezone?: StringFieldUpdateOperationsInput | string
    language?: StringFieldUpdateOperationsInput | string
    notificationPrefs?: JsonNullValueInput | InputJsonValue
    status?: StringFieldUpdateOperationsInput | string
    deletedAt?: NullableDateTimeFieldUpdateOperationsInput | Date | string | null
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
    workspacesCreated?: WorkspaceUpdateManyWithoutCreatorNestedInput
    workspaceMembers?: WorkspaceMemberUpdateManyWithoutUserNestedInput
    invitationsSent?: InvitationUpdateManyWithoutInviterNestedInput
  }

  export type UserProfileUncheckedUpdateInput = {
    userId?: StringFieldUpdateOperationsInput | string
    keycloakUserId?: StringFieldUpdateOperationsInput | string
    email?: StringFieldUpdateOperationsInput | string
    displayName?: NullableStringFieldUpdateOperationsInput | string | null
    avatarPath?: NullableStringFieldUpdateOperationsInput | string | null
    timezone?: StringFieldUpdateOperationsInput | string
    language?: StringFieldUpdateOperationsInput | string
    notificationPrefs?: JsonNullValueInput | InputJsonValue
    status?: StringFieldUpdateOperationsInput | string
    deletedAt?: NullableDateTimeFieldUpdateOperationsInput | Date | string | null
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
    workspacesCreated?: WorkspaceUncheckedUpdateManyWithoutCreatorNestedInput
    workspaceMembers?: WorkspaceMemberUncheckedUpdateManyWithoutUserNestedInput
    invitationsSent?: InvitationUncheckedUpdateManyWithoutInviterNestedInput
  }

  export type UserProfileCreateManyInput = {
    userId: string
    keycloakUserId: string
    email: string
    displayName?: string | null
    avatarPath?: string | null
    timezone?: string
    language?: string
    notificationPrefs?: JsonNullValueInput | InputJsonValue
    status?: string
    deletedAt?: Date | string | null
    createdAt?: Date | string
    updatedAt?: Date | string
  }

  export type UserProfileUpdateManyMutationInput = {
    userId?: StringFieldUpdateOperationsInput | string
    keycloakUserId?: StringFieldUpdateOperationsInput | string
    email?: StringFieldUpdateOperationsInput | string
    displayName?: NullableStringFieldUpdateOperationsInput | string | null
    avatarPath?: NullableStringFieldUpdateOperationsInput | string | null
    timezone?: StringFieldUpdateOperationsInput | string
    language?: StringFieldUpdateOperationsInput | string
    notificationPrefs?: JsonNullValueInput | InputJsonValue
    status?: StringFieldUpdateOperationsInput | string
    deletedAt?: NullableDateTimeFieldUpdateOperationsInput | Date | string | null
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
  }

  export type UserProfileUncheckedUpdateManyInput = {
    userId?: StringFieldUpdateOperationsInput | string
    keycloakUserId?: StringFieldUpdateOperationsInput | string
    email?: StringFieldUpdateOperationsInput | string
    displayName?: NullableStringFieldUpdateOperationsInput | string | null
    avatarPath?: NullableStringFieldUpdateOperationsInput | string | null
    timezone?: StringFieldUpdateOperationsInput | string
    language?: StringFieldUpdateOperationsInput | string
    notificationPrefs?: JsonNullValueInput | InputJsonValue
    status?: StringFieldUpdateOperationsInput | string
    deletedAt?: NullableDateTimeFieldUpdateOperationsInput | Date | string | null
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
  }

  export type WorkspaceTemplateCreateInput = {
    id?: string
    name: string
    description?: string | null
    structure?: JsonNullValueInput | InputJsonValue
    isBuiltin?: boolean
    createdBy?: string | null
    version?: number
    createdAt?: Date | string
    updatedAt?: Date | string
    workspaces?: WorkspaceCreateNestedManyWithoutTemplateInput
  }

  export type WorkspaceTemplateUncheckedCreateInput = {
    id?: string
    name: string
    description?: string | null
    structure?: JsonNullValueInput | InputJsonValue
    isBuiltin?: boolean
    createdBy?: string | null
    version?: number
    createdAt?: Date | string
    updatedAt?: Date | string
    workspaces?: WorkspaceUncheckedCreateNestedManyWithoutTemplateInput
  }

  export type WorkspaceTemplateUpdateInput = {
    id?: StringFieldUpdateOperationsInput | string
    name?: StringFieldUpdateOperationsInput | string
    description?: NullableStringFieldUpdateOperationsInput | string | null
    structure?: JsonNullValueInput | InputJsonValue
    isBuiltin?: BoolFieldUpdateOperationsInput | boolean
    createdBy?: NullableStringFieldUpdateOperationsInput | string | null
    version?: IntFieldUpdateOperationsInput | number
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
    workspaces?: WorkspaceUpdateManyWithoutTemplateNestedInput
  }

  export type WorkspaceTemplateUncheckedUpdateInput = {
    id?: StringFieldUpdateOperationsInput | string
    name?: StringFieldUpdateOperationsInput | string
    description?: NullableStringFieldUpdateOperationsInput | string | null
    structure?: JsonNullValueInput | InputJsonValue
    isBuiltin?: BoolFieldUpdateOperationsInput | boolean
    createdBy?: NullableStringFieldUpdateOperationsInput | string | null
    version?: IntFieldUpdateOperationsInput | number
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
    workspaces?: WorkspaceUncheckedUpdateManyWithoutTemplateNestedInput
  }

  export type WorkspaceTemplateCreateManyInput = {
    id?: string
    name: string
    description?: string | null
    structure?: JsonNullValueInput | InputJsonValue
    isBuiltin?: boolean
    createdBy?: string | null
    version?: number
    createdAt?: Date | string
    updatedAt?: Date | string
  }

  export type WorkspaceTemplateUpdateManyMutationInput = {
    id?: StringFieldUpdateOperationsInput | string
    name?: StringFieldUpdateOperationsInput | string
    description?: NullableStringFieldUpdateOperationsInput | string | null
    structure?: JsonNullValueInput | InputJsonValue
    isBuiltin?: BoolFieldUpdateOperationsInput | boolean
    createdBy?: NullableStringFieldUpdateOperationsInput | string | null
    version?: IntFieldUpdateOperationsInput | number
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
  }

  export type WorkspaceTemplateUncheckedUpdateManyInput = {
    id?: StringFieldUpdateOperationsInput | string
    name?: StringFieldUpdateOperationsInput | string
    description?: NullableStringFieldUpdateOperationsInput | string | null
    structure?: JsonNullValueInput | InputJsonValue
    isBuiltin?: BoolFieldUpdateOperationsInput | boolean
    createdBy?: NullableStringFieldUpdateOperationsInput | string | null
    version?: IntFieldUpdateOperationsInput | number
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
  }

  export type TenantBrandingCreateInput = {
    id?: string
    logoPath?: string | null
    primaryColor?: string
    darkMode?: boolean
    updatedAt?: Date | string
  }

  export type TenantBrandingUncheckedCreateInput = {
    id?: string
    logoPath?: string | null
    primaryColor?: string
    darkMode?: boolean
    updatedAt?: Date | string
  }

  export type TenantBrandingUpdateInput = {
    id?: StringFieldUpdateOperationsInput | string
    logoPath?: NullableStringFieldUpdateOperationsInput | string | null
    primaryColor?: StringFieldUpdateOperationsInput | string
    darkMode?: BoolFieldUpdateOperationsInput | boolean
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
  }

  export type TenantBrandingUncheckedUpdateInput = {
    id?: StringFieldUpdateOperationsInput | string
    logoPath?: NullableStringFieldUpdateOperationsInput | string | null
    primaryColor?: StringFieldUpdateOperationsInput | string
    darkMode?: BoolFieldUpdateOperationsInput | boolean
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
  }

  export type TenantBrandingCreateManyInput = {
    id?: string
    logoPath?: string | null
    primaryColor?: string
    darkMode?: boolean
    updatedAt?: Date | string
  }

  export type TenantBrandingUpdateManyMutationInput = {
    id?: StringFieldUpdateOperationsInput | string
    logoPath?: NullableStringFieldUpdateOperationsInput | string | null
    primaryColor?: StringFieldUpdateOperationsInput | string
    darkMode?: BoolFieldUpdateOperationsInput | boolean
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
  }

  export type TenantBrandingUncheckedUpdateManyInput = {
    id?: StringFieldUpdateOperationsInput | string
    logoPath?: NullableStringFieldUpdateOperationsInput | string | null
    primaryColor?: StringFieldUpdateOperationsInput | string
    darkMode?: BoolFieldUpdateOperationsInput | boolean
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
  }

  export type WorkspaceCreateInput = {
    id?: string
    name: string
    slug: string
    description?: string | null
    materializedPath?: string
    status?: string
    archivedAt?: Date | string | null
    version?: number
    createdAt?: Date | string
    updatedAt?: Date | string
    parent?: WorkspaceCreateNestedOneWithoutChildrenInput
    children?: WorkspaceCreateNestedManyWithoutParentInput
    template?: WorkspaceTemplateCreateNestedOneWithoutWorkspacesInput
    creator: UserProfileCreateNestedOneWithoutWorkspacesCreatedInput
    members?: WorkspaceMemberCreateNestedManyWithoutWorkspaceInput
    invitations?: InvitationCreateNestedManyWithoutWorkspaceInput
    roleActions?: WorkspaceRoleActionCreateNestedManyWithoutWorkspaceInput
  }

  export type WorkspaceUncheckedCreateInput = {
    id?: string
    name: string
    slug: string
    description?: string | null
    parentId?: string | null
    materializedPath?: string
    status?: string
    archivedAt?: Date | string | null
    templateId?: string | null
    createdBy: string
    version?: number
    createdAt?: Date | string
    updatedAt?: Date | string
    children?: WorkspaceUncheckedCreateNestedManyWithoutParentInput
    members?: WorkspaceMemberUncheckedCreateNestedManyWithoutWorkspaceInput
    invitations?: InvitationUncheckedCreateNestedManyWithoutWorkspaceInput
    roleActions?: WorkspaceRoleActionUncheckedCreateNestedManyWithoutWorkspaceInput
  }

  export type WorkspaceUpdateInput = {
    id?: StringFieldUpdateOperationsInput | string
    name?: StringFieldUpdateOperationsInput | string
    slug?: StringFieldUpdateOperationsInput | string
    description?: NullableStringFieldUpdateOperationsInput | string | null
    materializedPath?: StringFieldUpdateOperationsInput | string
    status?: StringFieldUpdateOperationsInput | string
    archivedAt?: NullableDateTimeFieldUpdateOperationsInput | Date | string | null
    version?: IntFieldUpdateOperationsInput | number
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
    parent?: WorkspaceUpdateOneWithoutChildrenNestedInput
    children?: WorkspaceUpdateManyWithoutParentNestedInput
    template?: WorkspaceTemplateUpdateOneWithoutWorkspacesNestedInput
    creator?: UserProfileUpdateOneRequiredWithoutWorkspacesCreatedNestedInput
    members?: WorkspaceMemberUpdateManyWithoutWorkspaceNestedInput
    invitations?: InvitationUpdateManyWithoutWorkspaceNestedInput
    roleActions?: WorkspaceRoleActionUpdateManyWithoutWorkspaceNestedInput
  }

  export type WorkspaceUncheckedUpdateInput = {
    id?: StringFieldUpdateOperationsInput | string
    name?: StringFieldUpdateOperationsInput | string
    slug?: StringFieldUpdateOperationsInput | string
    description?: NullableStringFieldUpdateOperationsInput | string | null
    parentId?: NullableStringFieldUpdateOperationsInput | string | null
    materializedPath?: StringFieldUpdateOperationsInput | string
    status?: StringFieldUpdateOperationsInput | string
    archivedAt?: NullableDateTimeFieldUpdateOperationsInput | Date | string | null
    templateId?: NullableStringFieldUpdateOperationsInput | string | null
    createdBy?: StringFieldUpdateOperationsInput | string
    version?: IntFieldUpdateOperationsInput | number
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
    children?: WorkspaceUncheckedUpdateManyWithoutParentNestedInput
    members?: WorkspaceMemberUncheckedUpdateManyWithoutWorkspaceNestedInput
    invitations?: InvitationUncheckedUpdateManyWithoutWorkspaceNestedInput
    roleActions?: WorkspaceRoleActionUncheckedUpdateManyWithoutWorkspaceNestedInput
  }

  export type WorkspaceCreateManyInput = {
    id?: string
    name: string
    slug: string
    description?: string | null
    parentId?: string | null
    materializedPath?: string
    status?: string
    archivedAt?: Date | string | null
    templateId?: string | null
    createdBy: string
    version?: number
    createdAt?: Date | string
    updatedAt?: Date | string
  }

  export type WorkspaceUpdateManyMutationInput = {
    id?: StringFieldUpdateOperationsInput | string
    name?: StringFieldUpdateOperationsInput | string
    slug?: StringFieldUpdateOperationsInput | string
    description?: NullableStringFieldUpdateOperationsInput | string | null
    materializedPath?: StringFieldUpdateOperationsInput | string
    status?: StringFieldUpdateOperationsInput | string
    archivedAt?: NullableDateTimeFieldUpdateOperationsInput | Date | string | null
    version?: IntFieldUpdateOperationsInput | number
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
  }

  export type WorkspaceUncheckedUpdateManyInput = {
    id?: StringFieldUpdateOperationsInput | string
    name?: StringFieldUpdateOperationsInput | string
    slug?: StringFieldUpdateOperationsInput | string
    description?: NullableStringFieldUpdateOperationsInput | string | null
    parentId?: NullableStringFieldUpdateOperationsInput | string | null
    materializedPath?: StringFieldUpdateOperationsInput | string
    status?: StringFieldUpdateOperationsInput | string
    archivedAt?: NullableDateTimeFieldUpdateOperationsInput | Date | string | null
    templateId?: NullableStringFieldUpdateOperationsInput | string | null
    createdBy?: StringFieldUpdateOperationsInput | string
    version?: IntFieldUpdateOperationsInput | number
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
  }

  export type WorkspaceMemberCreateInput = {
    id?: string
    role: string
    createdAt?: Date | string
    workspace: WorkspaceCreateNestedOneWithoutMembersInput
    user: UserProfileCreateNestedOneWithoutWorkspaceMembersInput
  }

  export type WorkspaceMemberUncheckedCreateInput = {
    id?: string
    workspaceId: string
    userId: string
    role: string
    createdAt?: Date | string
  }

  export type WorkspaceMemberUpdateInput = {
    id?: StringFieldUpdateOperationsInput | string
    role?: StringFieldUpdateOperationsInput | string
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    workspace?: WorkspaceUpdateOneRequiredWithoutMembersNestedInput
    user?: UserProfileUpdateOneRequiredWithoutWorkspaceMembersNestedInput
  }

  export type WorkspaceMemberUncheckedUpdateInput = {
    id?: StringFieldUpdateOperationsInput | string
    workspaceId?: StringFieldUpdateOperationsInput | string
    userId?: StringFieldUpdateOperationsInput | string
    role?: StringFieldUpdateOperationsInput | string
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
  }

  export type WorkspaceMemberCreateManyInput = {
    id?: string
    workspaceId: string
    userId: string
    role: string
    createdAt?: Date | string
  }

  export type WorkspaceMemberUpdateManyMutationInput = {
    id?: StringFieldUpdateOperationsInput | string
    role?: StringFieldUpdateOperationsInput | string
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
  }

  export type WorkspaceMemberUncheckedUpdateManyInput = {
    id?: StringFieldUpdateOperationsInput | string
    workspaceId?: StringFieldUpdateOperationsInput | string
    userId?: StringFieldUpdateOperationsInput | string
    role?: StringFieldUpdateOperationsInput | string
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
  }

  export type InvitationCreateInput = {
    id?: string
    email: string
    role: string
    status?: string
    token: string
    expiresAt: Date | string
    acceptedAt?: Date | string | null
    createdAt?: Date | string
    workspace: WorkspaceCreateNestedOneWithoutInvitationsInput
    inviter: UserProfileCreateNestedOneWithoutInvitationsSentInput
  }

  export type InvitationUncheckedCreateInput = {
    id?: string
    email: string
    workspaceId: string
    role: string
    status?: string
    invitedBy: string
    token: string
    expiresAt: Date | string
    acceptedAt?: Date | string | null
    createdAt?: Date | string
  }

  export type InvitationUpdateInput = {
    id?: StringFieldUpdateOperationsInput | string
    email?: StringFieldUpdateOperationsInput | string
    role?: StringFieldUpdateOperationsInput | string
    status?: StringFieldUpdateOperationsInput | string
    token?: StringFieldUpdateOperationsInput | string
    expiresAt?: DateTimeFieldUpdateOperationsInput | Date | string
    acceptedAt?: NullableDateTimeFieldUpdateOperationsInput | Date | string | null
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    workspace?: WorkspaceUpdateOneRequiredWithoutInvitationsNestedInput
    inviter?: UserProfileUpdateOneRequiredWithoutInvitationsSentNestedInput
  }

  export type InvitationUncheckedUpdateInput = {
    id?: StringFieldUpdateOperationsInput | string
    email?: StringFieldUpdateOperationsInput | string
    workspaceId?: StringFieldUpdateOperationsInput | string
    role?: StringFieldUpdateOperationsInput | string
    status?: StringFieldUpdateOperationsInput | string
    invitedBy?: StringFieldUpdateOperationsInput | string
    token?: StringFieldUpdateOperationsInput | string
    expiresAt?: DateTimeFieldUpdateOperationsInput | Date | string
    acceptedAt?: NullableDateTimeFieldUpdateOperationsInput | Date | string | null
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
  }

  export type InvitationCreateManyInput = {
    id?: string
    email: string
    workspaceId: string
    role: string
    status?: string
    invitedBy: string
    token: string
    expiresAt: Date | string
    acceptedAt?: Date | string | null
    createdAt?: Date | string
  }

  export type InvitationUpdateManyMutationInput = {
    id?: StringFieldUpdateOperationsInput | string
    email?: StringFieldUpdateOperationsInput | string
    role?: StringFieldUpdateOperationsInput | string
    status?: StringFieldUpdateOperationsInput | string
    token?: StringFieldUpdateOperationsInput | string
    expiresAt?: DateTimeFieldUpdateOperationsInput | Date | string
    acceptedAt?: NullableDateTimeFieldUpdateOperationsInput | Date | string | null
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
  }

  export type InvitationUncheckedUpdateManyInput = {
    id?: StringFieldUpdateOperationsInput | string
    email?: StringFieldUpdateOperationsInput | string
    workspaceId?: StringFieldUpdateOperationsInput | string
    role?: StringFieldUpdateOperationsInput | string
    status?: StringFieldUpdateOperationsInput | string
    invitedBy?: StringFieldUpdateOperationsInput | string
    token?: StringFieldUpdateOperationsInput | string
    expiresAt?: DateTimeFieldUpdateOperationsInput | Date | string
    acceptedAt?: NullableDateTimeFieldUpdateOperationsInput | Date | string | null
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
  }

  export type AuditLogCreateInput = {
    id?: string
    actorId: string
    actionType: string
    targetType: string
    targetId?: string | null
    beforeValue?: NullableJsonNullValueInput | InputJsonValue
    afterValue?: NullableJsonNullValueInput | InputJsonValue
    ipAddress?: string | null
    createdAt?: Date | string
  }

  export type AuditLogUncheckedCreateInput = {
    id?: string
    actorId: string
    actionType: string
    targetType: string
    targetId?: string | null
    beforeValue?: NullableJsonNullValueInput | InputJsonValue
    afterValue?: NullableJsonNullValueInput | InputJsonValue
    ipAddress?: string | null
    createdAt?: Date | string
  }

  export type AuditLogUpdateInput = {
    id?: StringFieldUpdateOperationsInput | string
    actorId?: StringFieldUpdateOperationsInput | string
    actionType?: StringFieldUpdateOperationsInput | string
    targetType?: StringFieldUpdateOperationsInput | string
    targetId?: NullableStringFieldUpdateOperationsInput | string | null
    beforeValue?: NullableJsonNullValueInput | InputJsonValue
    afterValue?: NullableJsonNullValueInput | InputJsonValue
    ipAddress?: NullableStringFieldUpdateOperationsInput | string | null
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
  }

  export type AuditLogUncheckedUpdateInput = {
    id?: StringFieldUpdateOperationsInput | string
    actorId?: StringFieldUpdateOperationsInput | string
    actionType?: StringFieldUpdateOperationsInput | string
    targetType?: StringFieldUpdateOperationsInput | string
    targetId?: NullableStringFieldUpdateOperationsInput | string | null
    beforeValue?: NullableJsonNullValueInput | InputJsonValue
    afterValue?: NullableJsonNullValueInput | InputJsonValue
    ipAddress?: NullableStringFieldUpdateOperationsInput | string | null
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
  }

  export type AuditLogCreateManyInput = {
    id?: string
    actorId: string
    actionType: string
    targetType: string
    targetId?: string | null
    beforeValue?: NullableJsonNullValueInput | InputJsonValue
    afterValue?: NullableJsonNullValueInput | InputJsonValue
    ipAddress?: string | null
    createdAt?: Date | string
  }

  export type AuditLogUpdateManyMutationInput = {
    id?: StringFieldUpdateOperationsInput | string
    actorId?: StringFieldUpdateOperationsInput | string
    actionType?: StringFieldUpdateOperationsInput | string
    targetType?: StringFieldUpdateOperationsInput | string
    targetId?: NullableStringFieldUpdateOperationsInput | string | null
    beforeValue?: NullableJsonNullValueInput | InputJsonValue
    afterValue?: NullableJsonNullValueInput | InputJsonValue
    ipAddress?: NullableStringFieldUpdateOperationsInput | string | null
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
  }

  export type AuditLogUncheckedUpdateManyInput = {
    id?: StringFieldUpdateOperationsInput | string
    actorId?: StringFieldUpdateOperationsInput | string
    actionType?: StringFieldUpdateOperationsInput | string
    targetType?: StringFieldUpdateOperationsInput | string
    targetId?: NullableStringFieldUpdateOperationsInput | string | null
    beforeValue?: NullableJsonNullValueInput | InputJsonValue
    afterValue?: NullableJsonNullValueInput | InputJsonValue
    ipAddress?: NullableStringFieldUpdateOperationsInput | string | null
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
  }

  export type AbacDecisionLogCreateInput = {
    id?: string
    userId: string
    resourceType: string
    resourceId?: string | null
    action: string
    decision: string
    rulesEvaluated?: JsonNullValueInput | InputJsonValue
    logLevel?: string
    createdAt?: Date | string
  }

  export type AbacDecisionLogUncheckedCreateInput = {
    id?: string
    userId: string
    resourceType: string
    resourceId?: string | null
    action: string
    decision: string
    rulesEvaluated?: JsonNullValueInput | InputJsonValue
    logLevel?: string
    createdAt?: Date | string
  }

  export type AbacDecisionLogUpdateInput = {
    id?: StringFieldUpdateOperationsInput | string
    userId?: StringFieldUpdateOperationsInput | string
    resourceType?: StringFieldUpdateOperationsInput | string
    resourceId?: NullableStringFieldUpdateOperationsInput | string | null
    action?: StringFieldUpdateOperationsInput | string
    decision?: StringFieldUpdateOperationsInput | string
    rulesEvaluated?: JsonNullValueInput | InputJsonValue
    logLevel?: StringFieldUpdateOperationsInput | string
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
  }

  export type AbacDecisionLogUncheckedUpdateInput = {
    id?: StringFieldUpdateOperationsInput | string
    userId?: StringFieldUpdateOperationsInput | string
    resourceType?: StringFieldUpdateOperationsInput | string
    resourceId?: NullableStringFieldUpdateOperationsInput | string | null
    action?: StringFieldUpdateOperationsInput | string
    decision?: StringFieldUpdateOperationsInput | string
    rulesEvaluated?: JsonNullValueInput | InputJsonValue
    logLevel?: StringFieldUpdateOperationsInput | string
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
  }

  export type AbacDecisionLogCreateManyInput = {
    id?: string
    userId: string
    resourceType: string
    resourceId?: string | null
    action: string
    decision: string
    rulesEvaluated?: JsonNullValueInput | InputJsonValue
    logLevel?: string
    createdAt?: Date | string
  }

  export type AbacDecisionLogUpdateManyMutationInput = {
    id?: StringFieldUpdateOperationsInput | string
    userId?: StringFieldUpdateOperationsInput | string
    resourceType?: StringFieldUpdateOperationsInput | string
    resourceId?: NullableStringFieldUpdateOperationsInput | string | null
    action?: StringFieldUpdateOperationsInput | string
    decision?: StringFieldUpdateOperationsInput | string
    rulesEvaluated?: JsonNullValueInput | InputJsonValue
    logLevel?: StringFieldUpdateOperationsInput | string
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
  }

  export type AbacDecisionLogUncheckedUpdateManyInput = {
    id?: StringFieldUpdateOperationsInput | string
    userId?: StringFieldUpdateOperationsInput | string
    resourceType?: StringFieldUpdateOperationsInput | string
    resourceId?: NullableStringFieldUpdateOperationsInput | string | null
    action?: StringFieldUpdateOperationsInput | string
    decision?: StringFieldUpdateOperationsInput | string
    rulesEvaluated?: JsonNullValueInput | InputJsonValue
    logLevel?: StringFieldUpdateOperationsInput | string
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
  }

  export type ActionRegistryCreateInput = {
    id?: string
    pluginId: string
    actionKey: string
    labelI18nKey: string
    description?: string | null
    defaultRole?: string
    createdAt?: Date | string
  }

  export type ActionRegistryUncheckedCreateInput = {
    id?: string
    pluginId: string
    actionKey: string
    labelI18nKey: string
    description?: string | null
    defaultRole?: string
    createdAt?: Date | string
  }

  export type ActionRegistryUpdateInput = {
    id?: StringFieldUpdateOperationsInput | string
    pluginId?: StringFieldUpdateOperationsInput | string
    actionKey?: StringFieldUpdateOperationsInput | string
    labelI18nKey?: StringFieldUpdateOperationsInput | string
    description?: NullableStringFieldUpdateOperationsInput | string | null
    defaultRole?: StringFieldUpdateOperationsInput | string
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
  }

  export type ActionRegistryUncheckedUpdateInput = {
    id?: StringFieldUpdateOperationsInput | string
    pluginId?: StringFieldUpdateOperationsInput | string
    actionKey?: StringFieldUpdateOperationsInput | string
    labelI18nKey?: StringFieldUpdateOperationsInput | string
    description?: NullableStringFieldUpdateOperationsInput | string | null
    defaultRole?: StringFieldUpdateOperationsInput | string
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
  }

  export type ActionRegistryCreateManyInput = {
    id?: string
    pluginId: string
    actionKey: string
    labelI18nKey: string
    description?: string | null
    defaultRole?: string
    createdAt?: Date | string
  }

  export type ActionRegistryUpdateManyMutationInput = {
    id?: StringFieldUpdateOperationsInput | string
    pluginId?: StringFieldUpdateOperationsInput | string
    actionKey?: StringFieldUpdateOperationsInput | string
    labelI18nKey?: StringFieldUpdateOperationsInput | string
    description?: NullableStringFieldUpdateOperationsInput | string | null
    defaultRole?: StringFieldUpdateOperationsInput | string
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
  }

  export type ActionRegistryUncheckedUpdateManyInput = {
    id?: StringFieldUpdateOperationsInput | string
    pluginId?: StringFieldUpdateOperationsInput | string
    actionKey?: StringFieldUpdateOperationsInput | string
    labelI18nKey?: StringFieldUpdateOperationsInput | string
    description?: NullableStringFieldUpdateOperationsInput | string | null
    defaultRole?: StringFieldUpdateOperationsInput | string
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
  }

  export type WorkspaceRoleActionCreateInput = {
    id?: string
    pluginId: string
    actionKey: string
    requiredRole: string
    isOverridden?: boolean
    createdAt?: Date | string
    updatedAt?: Date | string
    workspace: WorkspaceCreateNestedOneWithoutRoleActionsInput
  }

  export type WorkspaceRoleActionUncheckedCreateInput = {
    id?: string
    workspaceId: string
    pluginId: string
    actionKey: string
    requiredRole: string
    isOverridden?: boolean
    createdAt?: Date | string
    updatedAt?: Date | string
  }

  export type WorkspaceRoleActionUpdateInput = {
    id?: StringFieldUpdateOperationsInput | string
    pluginId?: StringFieldUpdateOperationsInput | string
    actionKey?: StringFieldUpdateOperationsInput | string
    requiredRole?: StringFieldUpdateOperationsInput | string
    isOverridden?: BoolFieldUpdateOperationsInput | boolean
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
    workspace?: WorkspaceUpdateOneRequiredWithoutRoleActionsNestedInput
  }

  export type WorkspaceRoleActionUncheckedUpdateInput = {
    id?: StringFieldUpdateOperationsInput | string
    workspaceId?: StringFieldUpdateOperationsInput | string
    pluginId?: StringFieldUpdateOperationsInput | string
    actionKey?: StringFieldUpdateOperationsInput | string
    requiredRole?: StringFieldUpdateOperationsInput | string
    isOverridden?: BoolFieldUpdateOperationsInput | boolean
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
  }

  export type WorkspaceRoleActionCreateManyInput = {
    id?: string
    workspaceId: string
    pluginId: string
    actionKey: string
    requiredRole: string
    isOverridden?: boolean
    createdAt?: Date | string
    updatedAt?: Date | string
  }

  export type WorkspaceRoleActionUpdateManyMutationInput = {
    id?: StringFieldUpdateOperationsInput | string
    pluginId?: StringFieldUpdateOperationsInput | string
    actionKey?: StringFieldUpdateOperationsInput | string
    requiredRole?: StringFieldUpdateOperationsInput | string
    isOverridden?: BoolFieldUpdateOperationsInput | boolean
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
  }

  export type WorkspaceRoleActionUncheckedUpdateManyInput = {
    id?: StringFieldUpdateOperationsInput | string
    workspaceId?: StringFieldUpdateOperationsInput | string
    pluginId?: StringFieldUpdateOperationsInput | string
    actionKey?: StringFieldUpdateOperationsInput | string
    requiredRole?: StringFieldUpdateOperationsInput | string
    isOverridden?: BoolFieldUpdateOperationsInput | boolean
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
  }

  export type UuidFilter<$PrismaModel = never> = {
    equals?: string | StringFieldRefInput<$PrismaModel>
    in?: string[] | ListStringFieldRefInput<$PrismaModel>
    notIn?: string[] | ListStringFieldRefInput<$PrismaModel>
    lt?: string | StringFieldRefInput<$PrismaModel>
    lte?: string | StringFieldRefInput<$PrismaModel>
    gt?: string | StringFieldRefInput<$PrismaModel>
    gte?: string | StringFieldRefInput<$PrismaModel>
    mode?: QueryMode
    not?: NestedUuidFilter<$PrismaModel> | string
  }

  export type StringFilter<$PrismaModel = never> = {
    equals?: string | StringFieldRefInput<$PrismaModel>
    in?: string[] | ListStringFieldRefInput<$PrismaModel>
    notIn?: string[] | ListStringFieldRefInput<$PrismaModel>
    lt?: string | StringFieldRefInput<$PrismaModel>
    lte?: string | StringFieldRefInput<$PrismaModel>
    gt?: string | StringFieldRefInput<$PrismaModel>
    gte?: string | StringFieldRefInput<$PrismaModel>
    contains?: string | StringFieldRefInput<$PrismaModel>
    startsWith?: string | StringFieldRefInput<$PrismaModel>
    endsWith?: string | StringFieldRefInput<$PrismaModel>
    mode?: QueryMode
    not?: NestedStringFilter<$PrismaModel> | string
  }

  export type StringNullableFilter<$PrismaModel = never> = {
    equals?: string | StringFieldRefInput<$PrismaModel> | null
    in?: string[] | ListStringFieldRefInput<$PrismaModel> | null
    notIn?: string[] | ListStringFieldRefInput<$PrismaModel> | null
    lt?: string | StringFieldRefInput<$PrismaModel>
    lte?: string | StringFieldRefInput<$PrismaModel>
    gt?: string | StringFieldRefInput<$PrismaModel>
    gte?: string | StringFieldRefInput<$PrismaModel>
    contains?: string | StringFieldRefInput<$PrismaModel>
    startsWith?: string | StringFieldRefInput<$PrismaModel>
    endsWith?: string | StringFieldRefInput<$PrismaModel>
    mode?: QueryMode
    not?: NestedStringNullableFilter<$PrismaModel> | string | null
  }
  export type JsonFilter<$PrismaModel = never> =
    | PatchUndefined<
        Either<Required<JsonFilterBase<$PrismaModel>>, Exclude<keyof Required<JsonFilterBase<$PrismaModel>>, 'path'>>,
        Required<JsonFilterBase<$PrismaModel>>
      >
    | OptionalFlat<Omit<Required<JsonFilterBase<$PrismaModel>>, 'path'>>

  export type JsonFilterBase<$PrismaModel = never> = {
    equals?: InputJsonValue | JsonFieldRefInput<$PrismaModel> | JsonNullValueFilter
    path?: string[]
    mode?: QueryMode | EnumQueryModeFieldRefInput<$PrismaModel>
    string_contains?: string | StringFieldRefInput<$PrismaModel>
    string_starts_with?: string | StringFieldRefInput<$PrismaModel>
    string_ends_with?: string | StringFieldRefInput<$PrismaModel>
    array_starts_with?: InputJsonValue | JsonFieldRefInput<$PrismaModel> | null
    array_ends_with?: InputJsonValue | JsonFieldRefInput<$PrismaModel> | null
    array_contains?: InputJsonValue | JsonFieldRefInput<$PrismaModel> | null
    lt?: InputJsonValue | JsonFieldRefInput<$PrismaModel>
    lte?: InputJsonValue | JsonFieldRefInput<$PrismaModel>
    gt?: InputJsonValue | JsonFieldRefInput<$PrismaModel>
    gte?: InputJsonValue | JsonFieldRefInput<$PrismaModel>
    not?: InputJsonValue | JsonFieldRefInput<$PrismaModel> | JsonNullValueFilter
  }

  export type DateTimeNullableFilter<$PrismaModel = never> = {
    equals?: Date | string | DateTimeFieldRefInput<$PrismaModel> | null
    in?: Date[] | string[] | ListDateTimeFieldRefInput<$PrismaModel> | null
    notIn?: Date[] | string[] | ListDateTimeFieldRefInput<$PrismaModel> | null
    lt?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    lte?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    gt?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    gte?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    not?: NestedDateTimeNullableFilter<$PrismaModel> | Date | string | null
  }

  export type DateTimeFilter<$PrismaModel = never> = {
    equals?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    in?: Date[] | string[] | ListDateTimeFieldRefInput<$PrismaModel>
    notIn?: Date[] | string[] | ListDateTimeFieldRefInput<$PrismaModel>
    lt?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    lte?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    gt?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    gte?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    not?: NestedDateTimeFilter<$PrismaModel> | Date | string
  }

  export type WorkspaceListRelationFilter = {
    every?: WorkspaceWhereInput
    some?: WorkspaceWhereInput
    none?: WorkspaceWhereInput
  }

  export type WorkspaceMemberListRelationFilter = {
    every?: WorkspaceMemberWhereInput
    some?: WorkspaceMemberWhereInput
    none?: WorkspaceMemberWhereInput
  }

  export type InvitationListRelationFilter = {
    every?: InvitationWhereInput
    some?: InvitationWhereInput
    none?: InvitationWhereInput
  }

  export type SortOrderInput = {
    sort: SortOrder
    nulls?: NullsOrder
  }

  export type WorkspaceOrderByRelationAggregateInput = {
    _count?: SortOrder
  }

  export type WorkspaceMemberOrderByRelationAggregateInput = {
    _count?: SortOrder
  }

  export type InvitationOrderByRelationAggregateInput = {
    _count?: SortOrder
  }

  export type UserProfileCountOrderByAggregateInput = {
    userId?: SortOrder
    keycloakUserId?: SortOrder
    email?: SortOrder
    displayName?: SortOrder
    avatarPath?: SortOrder
    timezone?: SortOrder
    language?: SortOrder
    notificationPrefs?: SortOrder
    status?: SortOrder
    deletedAt?: SortOrder
    createdAt?: SortOrder
    updatedAt?: SortOrder
  }

  export type UserProfileMaxOrderByAggregateInput = {
    userId?: SortOrder
    keycloakUserId?: SortOrder
    email?: SortOrder
    displayName?: SortOrder
    avatarPath?: SortOrder
    timezone?: SortOrder
    language?: SortOrder
    status?: SortOrder
    deletedAt?: SortOrder
    createdAt?: SortOrder
    updatedAt?: SortOrder
  }

  export type UserProfileMinOrderByAggregateInput = {
    userId?: SortOrder
    keycloakUserId?: SortOrder
    email?: SortOrder
    displayName?: SortOrder
    avatarPath?: SortOrder
    timezone?: SortOrder
    language?: SortOrder
    status?: SortOrder
    deletedAt?: SortOrder
    createdAt?: SortOrder
    updatedAt?: SortOrder
  }

  export type UuidWithAggregatesFilter<$PrismaModel = never> = {
    equals?: string | StringFieldRefInput<$PrismaModel>
    in?: string[] | ListStringFieldRefInput<$PrismaModel>
    notIn?: string[] | ListStringFieldRefInput<$PrismaModel>
    lt?: string | StringFieldRefInput<$PrismaModel>
    lte?: string | StringFieldRefInput<$PrismaModel>
    gt?: string | StringFieldRefInput<$PrismaModel>
    gte?: string | StringFieldRefInput<$PrismaModel>
    mode?: QueryMode
    not?: NestedUuidWithAggregatesFilter<$PrismaModel> | string
    _count?: NestedIntFilter<$PrismaModel>
    _min?: NestedStringFilter<$PrismaModel>
    _max?: NestedStringFilter<$PrismaModel>
  }

  export type StringWithAggregatesFilter<$PrismaModel = never> = {
    equals?: string | StringFieldRefInput<$PrismaModel>
    in?: string[] | ListStringFieldRefInput<$PrismaModel>
    notIn?: string[] | ListStringFieldRefInput<$PrismaModel>
    lt?: string | StringFieldRefInput<$PrismaModel>
    lte?: string | StringFieldRefInput<$PrismaModel>
    gt?: string | StringFieldRefInput<$PrismaModel>
    gte?: string | StringFieldRefInput<$PrismaModel>
    contains?: string | StringFieldRefInput<$PrismaModel>
    startsWith?: string | StringFieldRefInput<$PrismaModel>
    endsWith?: string | StringFieldRefInput<$PrismaModel>
    mode?: QueryMode
    not?: NestedStringWithAggregatesFilter<$PrismaModel> | string
    _count?: NestedIntFilter<$PrismaModel>
    _min?: NestedStringFilter<$PrismaModel>
    _max?: NestedStringFilter<$PrismaModel>
  }

  export type StringNullableWithAggregatesFilter<$PrismaModel = never> = {
    equals?: string | StringFieldRefInput<$PrismaModel> | null
    in?: string[] | ListStringFieldRefInput<$PrismaModel> | null
    notIn?: string[] | ListStringFieldRefInput<$PrismaModel> | null
    lt?: string | StringFieldRefInput<$PrismaModel>
    lte?: string | StringFieldRefInput<$PrismaModel>
    gt?: string | StringFieldRefInput<$PrismaModel>
    gte?: string | StringFieldRefInput<$PrismaModel>
    contains?: string | StringFieldRefInput<$PrismaModel>
    startsWith?: string | StringFieldRefInput<$PrismaModel>
    endsWith?: string | StringFieldRefInput<$PrismaModel>
    mode?: QueryMode
    not?: NestedStringNullableWithAggregatesFilter<$PrismaModel> | string | null
    _count?: NestedIntNullableFilter<$PrismaModel>
    _min?: NestedStringNullableFilter<$PrismaModel>
    _max?: NestedStringNullableFilter<$PrismaModel>
  }
  export type JsonWithAggregatesFilter<$PrismaModel = never> =
    | PatchUndefined<
        Either<Required<JsonWithAggregatesFilterBase<$PrismaModel>>, Exclude<keyof Required<JsonWithAggregatesFilterBase<$PrismaModel>>, 'path'>>,
        Required<JsonWithAggregatesFilterBase<$PrismaModel>>
      >
    | OptionalFlat<Omit<Required<JsonWithAggregatesFilterBase<$PrismaModel>>, 'path'>>

  export type JsonWithAggregatesFilterBase<$PrismaModel = never> = {
    equals?: InputJsonValue | JsonFieldRefInput<$PrismaModel> | JsonNullValueFilter
    path?: string[]
    mode?: QueryMode | EnumQueryModeFieldRefInput<$PrismaModel>
    string_contains?: string | StringFieldRefInput<$PrismaModel>
    string_starts_with?: string | StringFieldRefInput<$PrismaModel>
    string_ends_with?: string | StringFieldRefInput<$PrismaModel>
    array_starts_with?: InputJsonValue | JsonFieldRefInput<$PrismaModel> | null
    array_ends_with?: InputJsonValue | JsonFieldRefInput<$PrismaModel> | null
    array_contains?: InputJsonValue | JsonFieldRefInput<$PrismaModel> | null
    lt?: InputJsonValue | JsonFieldRefInput<$PrismaModel>
    lte?: InputJsonValue | JsonFieldRefInput<$PrismaModel>
    gt?: InputJsonValue | JsonFieldRefInput<$PrismaModel>
    gte?: InputJsonValue | JsonFieldRefInput<$PrismaModel>
    not?: InputJsonValue | JsonFieldRefInput<$PrismaModel> | JsonNullValueFilter
    _count?: NestedIntFilter<$PrismaModel>
    _min?: NestedJsonFilter<$PrismaModel>
    _max?: NestedJsonFilter<$PrismaModel>
  }

  export type DateTimeNullableWithAggregatesFilter<$PrismaModel = never> = {
    equals?: Date | string | DateTimeFieldRefInput<$PrismaModel> | null
    in?: Date[] | string[] | ListDateTimeFieldRefInput<$PrismaModel> | null
    notIn?: Date[] | string[] | ListDateTimeFieldRefInput<$PrismaModel> | null
    lt?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    lte?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    gt?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    gte?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    not?: NestedDateTimeNullableWithAggregatesFilter<$PrismaModel> | Date | string | null
    _count?: NestedIntNullableFilter<$PrismaModel>
    _min?: NestedDateTimeNullableFilter<$PrismaModel>
    _max?: NestedDateTimeNullableFilter<$PrismaModel>
  }

  export type DateTimeWithAggregatesFilter<$PrismaModel = never> = {
    equals?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    in?: Date[] | string[] | ListDateTimeFieldRefInput<$PrismaModel>
    notIn?: Date[] | string[] | ListDateTimeFieldRefInput<$PrismaModel>
    lt?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    lte?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    gt?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    gte?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    not?: NestedDateTimeWithAggregatesFilter<$PrismaModel> | Date | string
    _count?: NestedIntFilter<$PrismaModel>
    _min?: NestedDateTimeFilter<$PrismaModel>
    _max?: NestedDateTimeFilter<$PrismaModel>
  }

  export type BoolFilter<$PrismaModel = never> = {
    equals?: boolean | BooleanFieldRefInput<$PrismaModel>
    not?: NestedBoolFilter<$PrismaModel> | boolean
  }

  export type UuidNullableFilter<$PrismaModel = never> = {
    equals?: string | StringFieldRefInput<$PrismaModel> | null
    in?: string[] | ListStringFieldRefInput<$PrismaModel> | null
    notIn?: string[] | ListStringFieldRefInput<$PrismaModel> | null
    lt?: string | StringFieldRefInput<$PrismaModel>
    lte?: string | StringFieldRefInput<$PrismaModel>
    gt?: string | StringFieldRefInput<$PrismaModel>
    gte?: string | StringFieldRefInput<$PrismaModel>
    mode?: QueryMode
    not?: NestedUuidNullableFilter<$PrismaModel> | string | null
  }

  export type IntFilter<$PrismaModel = never> = {
    equals?: number | IntFieldRefInput<$PrismaModel>
    in?: number[] | ListIntFieldRefInput<$PrismaModel>
    notIn?: number[] | ListIntFieldRefInput<$PrismaModel>
    lt?: number | IntFieldRefInput<$PrismaModel>
    lte?: number | IntFieldRefInput<$PrismaModel>
    gt?: number | IntFieldRefInput<$PrismaModel>
    gte?: number | IntFieldRefInput<$PrismaModel>
    not?: NestedIntFilter<$PrismaModel> | number
  }

  export type WorkspaceTemplateCountOrderByAggregateInput = {
    id?: SortOrder
    name?: SortOrder
    description?: SortOrder
    structure?: SortOrder
    isBuiltin?: SortOrder
    createdBy?: SortOrder
    version?: SortOrder
    createdAt?: SortOrder
    updatedAt?: SortOrder
  }

  export type WorkspaceTemplateAvgOrderByAggregateInput = {
    version?: SortOrder
  }

  export type WorkspaceTemplateMaxOrderByAggregateInput = {
    id?: SortOrder
    name?: SortOrder
    description?: SortOrder
    isBuiltin?: SortOrder
    createdBy?: SortOrder
    version?: SortOrder
    createdAt?: SortOrder
    updatedAt?: SortOrder
  }

  export type WorkspaceTemplateMinOrderByAggregateInput = {
    id?: SortOrder
    name?: SortOrder
    description?: SortOrder
    isBuiltin?: SortOrder
    createdBy?: SortOrder
    version?: SortOrder
    createdAt?: SortOrder
    updatedAt?: SortOrder
  }

  export type WorkspaceTemplateSumOrderByAggregateInput = {
    version?: SortOrder
  }

  export type BoolWithAggregatesFilter<$PrismaModel = never> = {
    equals?: boolean | BooleanFieldRefInput<$PrismaModel>
    not?: NestedBoolWithAggregatesFilter<$PrismaModel> | boolean
    _count?: NestedIntFilter<$PrismaModel>
    _min?: NestedBoolFilter<$PrismaModel>
    _max?: NestedBoolFilter<$PrismaModel>
  }

  export type UuidNullableWithAggregatesFilter<$PrismaModel = never> = {
    equals?: string | StringFieldRefInput<$PrismaModel> | null
    in?: string[] | ListStringFieldRefInput<$PrismaModel> | null
    notIn?: string[] | ListStringFieldRefInput<$PrismaModel> | null
    lt?: string | StringFieldRefInput<$PrismaModel>
    lte?: string | StringFieldRefInput<$PrismaModel>
    gt?: string | StringFieldRefInput<$PrismaModel>
    gte?: string | StringFieldRefInput<$PrismaModel>
    mode?: QueryMode
    not?: NestedUuidNullableWithAggregatesFilter<$PrismaModel> | string | null
    _count?: NestedIntNullableFilter<$PrismaModel>
    _min?: NestedStringNullableFilter<$PrismaModel>
    _max?: NestedStringNullableFilter<$PrismaModel>
  }

  export type IntWithAggregatesFilter<$PrismaModel = never> = {
    equals?: number | IntFieldRefInput<$PrismaModel>
    in?: number[] | ListIntFieldRefInput<$PrismaModel>
    notIn?: number[] | ListIntFieldRefInput<$PrismaModel>
    lt?: number | IntFieldRefInput<$PrismaModel>
    lte?: number | IntFieldRefInput<$PrismaModel>
    gt?: number | IntFieldRefInput<$PrismaModel>
    gte?: number | IntFieldRefInput<$PrismaModel>
    not?: NestedIntWithAggregatesFilter<$PrismaModel> | number
    _count?: NestedIntFilter<$PrismaModel>
    _avg?: NestedFloatFilter<$PrismaModel>
    _sum?: NestedIntFilter<$PrismaModel>
    _min?: NestedIntFilter<$PrismaModel>
    _max?: NestedIntFilter<$PrismaModel>
  }

  export type TenantBrandingCountOrderByAggregateInput = {
    id?: SortOrder
    logoPath?: SortOrder
    primaryColor?: SortOrder
    darkMode?: SortOrder
    updatedAt?: SortOrder
  }

  export type TenantBrandingMaxOrderByAggregateInput = {
    id?: SortOrder
    logoPath?: SortOrder
    primaryColor?: SortOrder
    darkMode?: SortOrder
    updatedAt?: SortOrder
  }

  export type TenantBrandingMinOrderByAggregateInput = {
    id?: SortOrder
    logoPath?: SortOrder
    primaryColor?: SortOrder
    darkMode?: SortOrder
    updatedAt?: SortOrder
  }

  export type WorkspaceNullableScalarRelationFilter = {
    is?: WorkspaceWhereInput | null
    isNot?: WorkspaceWhereInput | null
  }

  export type WorkspaceTemplateNullableScalarRelationFilter = {
    is?: WorkspaceTemplateWhereInput | null
    isNot?: WorkspaceTemplateWhereInput | null
  }

  export type UserProfileScalarRelationFilter = {
    is?: UserProfileWhereInput
    isNot?: UserProfileWhereInput
  }

  export type WorkspaceRoleActionListRelationFilter = {
    every?: WorkspaceRoleActionWhereInput
    some?: WorkspaceRoleActionWhereInput
    none?: WorkspaceRoleActionWhereInput
  }

  export type WorkspaceRoleActionOrderByRelationAggregateInput = {
    _count?: SortOrder
  }

  export type WorkspaceCountOrderByAggregateInput = {
    id?: SortOrder
    name?: SortOrder
    slug?: SortOrder
    description?: SortOrder
    parentId?: SortOrder
    materializedPath?: SortOrder
    status?: SortOrder
    archivedAt?: SortOrder
    templateId?: SortOrder
    createdBy?: SortOrder
    version?: SortOrder
    createdAt?: SortOrder
    updatedAt?: SortOrder
  }

  export type WorkspaceAvgOrderByAggregateInput = {
    version?: SortOrder
  }

  export type WorkspaceMaxOrderByAggregateInput = {
    id?: SortOrder
    name?: SortOrder
    slug?: SortOrder
    description?: SortOrder
    parentId?: SortOrder
    materializedPath?: SortOrder
    status?: SortOrder
    archivedAt?: SortOrder
    templateId?: SortOrder
    createdBy?: SortOrder
    version?: SortOrder
    createdAt?: SortOrder
    updatedAt?: SortOrder
  }

  export type WorkspaceMinOrderByAggregateInput = {
    id?: SortOrder
    name?: SortOrder
    slug?: SortOrder
    description?: SortOrder
    parentId?: SortOrder
    materializedPath?: SortOrder
    status?: SortOrder
    archivedAt?: SortOrder
    templateId?: SortOrder
    createdBy?: SortOrder
    version?: SortOrder
    createdAt?: SortOrder
    updatedAt?: SortOrder
  }

  export type WorkspaceSumOrderByAggregateInput = {
    version?: SortOrder
  }

  export type WorkspaceScalarRelationFilter = {
    is?: WorkspaceWhereInput
    isNot?: WorkspaceWhereInput
  }

  export type WorkspaceMemberWorkspaceIdUserIdCompoundUniqueInput = {
    workspaceId: string
    userId: string
  }

  export type WorkspaceMemberCountOrderByAggregateInput = {
    id?: SortOrder
    workspaceId?: SortOrder
    userId?: SortOrder
    role?: SortOrder
    createdAt?: SortOrder
  }

  export type WorkspaceMemberMaxOrderByAggregateInput = {
    id?: SortOrder
    workspaceId?: SortOrder
    userId?: SortOrder
    role?: SortOrder
    createdAt?: SortOrder
  }

  export type WorkspaceMemberMinOrderByAggregateInput = {
    id?: SortOrder
    workspaceId?: SortOrder
    userId?: SortOrder
    role?: SortOrder
    createdAt?: SortOrder
  }

  export type InvitationCountOrderByAggregateInput = {
    id?: SortOrder
    email?: SortOrder
    workspaceId?: SortOrder
    role?: SortOrder
    status?: SortOrder
    invitedBy?: SortOrder
    token?: SortOrder
    expiresAt?: SortOrder
    acceptedAt?: SortOrder
    createdAt?: SortOrder
  }

  export type InvitationMaxOrderByAggregateInput = {
    id?: SortOrder
    email?: SortOrder
    workspaceId?: SortOrder
    role?: SortOrder
    status?: SortOrder
    invitedBy?: SortOrder
    token?: SortOrder
    expiresAt?: SortOrder
    acceptedAt?: SortOrder
    createdAt?: SortOrder
  }

  export type InvitationMinOrderByAggregateInput = {
    id?: SortOrder
    email?: SortOrder
    workspaceId?: SortOrder
    role?: SortOrder
    status?: SortOrder
    invitedBy?: SortOrder
    token?: SortOrder
    expiresAt?: SortOrder
    acceptedAt?: SortOrder
    createdAt?: SortOrder
  }
  export type JsonNullableFilter<$PrismaModel = never> =
    | PatchUndefined<
        Either<Required<JsonNullableFilterBase<$PrismaModel>>, Exclude<keyof Required<JsonNullableFilterBase<$PrismaModel>>, 'path'>>,
        Required<JsonNullableFilterBase<$PrismaModel>>
      >
    | OptionalFlat<Omit<Required<JsonNullableFilterBase<$PrismaModel>>, 'path'>>

  export type JsonNullableFilterBase<$PrismaModel = never> = {
    equals?: InputJsonValue | JsonFieldRefInput<$PrismaModel> | JsonNullValueFilter
    path?: string[]
    mode?: QueryMode | EnumQueryModeFieldRefInput<$PrismaModel>
    string_contains?: string | StringFieldRefInput<$PrismaModel>
    string_starts_with?: string | StringFieldRefInput<$PrismaModel>
    string_ends_with?: string | StringFieldRefInput<$PrismaModel>
    array_starts_with?: InputJsonValue | JsonFieldRefInput<$PrismaModel> | null
    array_ends_with?: InputJsonValue | JsonFieldRefInput<$PrismaModel> | null
    array_contains?: InputJsonValue | JsonFieldRefInput<$PrismaModel> | null
    lt?: InputJsonValue | JsonFieldRefInput<$PrismaModel>
    lte?: InputJsonValue | JsonFieldRefInput<$PrismaModel>
    gt?: InputJsonValue | JsonFieldRefInput<$PrismaModel>
    gte?: InputJsonValue | JsonFieldRefInput<$PrismaModel>
    not?: InputJsonValue | JsonFieldRefInput<$PrismaModel> | JsonNullValueFilter
  }

  export type AuditLogCountOrderByAggregateInput = {
    id?: SortOrder
    actorId?: SortOrder
    actionType?: SortOrder
    targetType?: SortOrder
    targetId?: SortOrder
    beforeValue?: SortOrder
    afterValue?: SortOrder
    ipAddress?: SortOrder
    createdAt?: SortOrder
  }

  export type AuditLogMaxOrderByAggregateInput = {
    id?: SortOrder
    actorId?: SortOrder
    actionType?: SortOrder
    targetType?: SortOrder
    targetId?: SortOrder
    ipAddress?: SortOrder
    createdAt?: SortOrder
  }

  export type AuditLogMinOrderByAggregateInput = {
    id?: SortOrder
    actorId?: SortOrder
    actionType?: SortOrder
    targetType?: SortOrder
    targetId?: SortOrder
    ipAddress?: SortOrder
    createdAt?: SortOrder
  }
  export type JsonNullableWithAggregatesFilter<$PrismaModel = never> =
    | PatchUndefined<
        Either<Required<JsonNullableWithAggregatesFilterBase<$PrismaModel>>, Exclude<keyof Required<JsonNullableWithAggregatesFilterBase<$PrismaModel>>, 'path'>>,
        Required<JsonNullableWithAggregatesFilterBase<$PrismaModel>>
      >
    | OptionalFlat<Omit<Required<JsonNullableWithAggregatesFilterBase<$PrismaModel>>, 'path'>>

  export type JsonNullableWithAggregatesFilterBase<$PrismaModel = never> = {
    equals?: InputJsonValue | JsonFieldRefInput<$PrismaModel> | JsonNullValueFilter
    path?: string[]
    mode?: QueryMode | EnumQueryModeFieldRefInput<$PrismaModel>
    string_contains?: string | StringFieldRefInput<$PrismaModel>
    string_starts_with?: string | StringFieldRefInput<$PrismaModel>
    string_ends_with?: string | StringFieldRefInput<$PrismaModel>
    array_starts_with?: InputJsonValue | JsonFieldRefInput<$PrismaModel> | null
    array_ends_with?: InputJsonValue | JsonFieldRefInput<$PrismaModel> | null
    array_contains?: InputJsonValue | JsonFieldRefInput<$PrismaModel> | null
    lt?: InputJsonValue | JsonFieldRefInput<$PrismaModel>
    lte?: InputJsonValue | JsonFieldRefInput<$PrismaModel>
    gt?: InputJsonValue | JsonFieldRefInput<$PrismaModel>
    gte?: InputJsonValue | JsonFieldRefInput<$PrismaModel>
    not?: InputJsonValue | JsonFieldRefInput<$PrismaModel> | JsonNullValueFilter
    _count?: NestedIntNullableFilter<$PrismaModel>
    _min?: NestedJsonNullableFilter<$PrismaModel>
    _max?: NestedJsonNullableFilter<$PrismaModel>
  }

  export type AbacDecisionLogCountOrderByAggregateInput = {
    id?: SortOrder
    userId?: SortOrder
    resourceType?: SortOrder
    resourceId?: SortOrder
    action?: SortOrder
    decision?: SortOrder
    rulesEvaluated?: SortOrder
    logLevel?: SortOrder
    createdAt?: SortOrder
  }

  export type AbacDecisionLogMaxOrderByAggregateInput = {
    id?: SortOrder
    userId?: SortOrder
    resourceType?: SortOrder
    resourceId?: SortOrder
    action?: SortOrder
    decision?: SortOrder
    logLevel?: SortOrder
    createdAt?: SortOrder
  }

  export type AbacDecisionLogMinOrderByAggregateInput = {
    id?: SortOrder
    userId?: SortOrder
    resourceType?: SortOrder
    resourceId?: SortOrder
    action?: SortOrder
    decision?: SortOrder
    logLevel?: SortOrder
    createdAt?: SortOrder
  }

  export type ActionRegistryPluginIdActionKeyCompoundUniqueInput = {
    pluginId: string
    actionKey: string
  }

  export type ActionRegistryCountOrderByAggregateInput = {
    id?: SortOrder
    pluginId?: SortOrder
    actionKey?: SortOrder
    labelI18nKey?: SortOrder
    description?: SortOrder
    defaultRole?: SortOrder
    createdAt?: SortOrder
  }

  export type ActionRegistryMaxOrderByAggregateInput = {
    id?: SortOrder
    pluginId?: SortOrder
    actionKey?: SortOrder
    labelI18nKey?: SortOrder
    description?: SortOrder
    defaultRole?: SortOrder
    createdAt?: SortOrder
  }

  export type ActionRegistryMinOrderByAggregateInput = {
    id?: SortOrder
    pluginId?: SortOrder
    actionKey?: SortOrder
    labelI18nKey?: SortOrder
    description?: SortOrder
    defaultRole?: SortOrder
    createdAt?: SortOrder
  }

  export type WorkspaceRoleActionWorkspaceIdPluginIdActionKeyCompoundUniqueInput = {
    workspaceId: string
    pluginId: string
    actionKey: string
  }

  export type WorkspaceRoleActionCountOrderByAggregateInput = {
    id?: SortOrder
    workspaceId?: SortOrder
    pluginId?: SortOrder
    actionKey?: SortOrder
    requiredRole?: SortOrder
    isOverridden?: SortOrder
    createdAt?: SortOrder
    updatedAt?: SortOrder
  }

  export type WorkspaceRoleActionMaxOrderByAggregateInput = {
    id?: SortOrder
    workspaceId?: SortOrder
    pluginId?: SortOrder
    actionKey?: SortOrder
    requiredRole?: SortOrder
    isOverridden?: SortOrder
    createdAt?: SortOrder
    updatedAt?: SortOrder
  }

  export type WorkspaceRoleActionMinOrderByAggregateInput = {
    id?: SortOrder
    workspaceId?: SortOrder
    pluginId?: SortOrder
    actionKey?: SortOrder
    requiredRole?: SortOrder
    isOverridden?: SortOrder
    createdAt?: SortOrder
    updatedAt?: SortOrder
  }

  export type WorkspaceCreateNestedManyWithoutCreatorInput = {
    create?: XOR<WorkspaceCreateWithoutCreatorInput, WorkspaceUncheckedCreateWithoutCreatorInput> | WorkspaceCreateWithoutCreatorInput[] | WorkspaceUncheckedCreateWithoutCreatorInput[]
    connectOrCreate?: WorkspaceCreateOrConnectWithoutCreatorInput | WorkspaceCreateOrConnectWithoutCreatorInput[]
    createMany?: WorkspaceCreateManyCreatorInputEnvelope
    connect?: WorkspaceWhereUniqueInput | WorkspaceWhereUniqueInput[]
  }

  export type WorkspaceMemberCreateNestedManyWithoutUserInput = {
    create?: XOR<WorkspaceMemberCreateWithoutUserInput, WorkspaceMemberUncheckedCreateWithoutUserInput> | WorkspaceMemberCreateWithoutUserInput[] | WorkspaceMemberUncheckedCreateWithoutUserInput[]
    connectOrCreate?: WorkspaceMemberCreateOrConnectWithoutUserInput | WorkspaceMemberCreateOrConnectWithoutUserInput[]
    createMany?: WorkspaceMemberCreateManyUserInputEnvelope
    connect?: WorkspaceMemberWhereUniqueInput | WorkspaceMemberWhereUniqueInput[]
  }

  export type InvitationCreateNestedManyWithoutInviterInput = {
    create?: XOR<InvitationCreateWithoutInviterInput, InvitationUncheckedCreateWithoutInviterInput> | InvitationCreateWithoutInviterInput[] | InvitationUncheckedCreateWithoutInviterInput[]
    connectOrCreate?: InvitationCreateOrConnectWithoutInviterInput | InvitationCreateOrConnectWithoutInviterInput[]
    createMany?: InvitationCreateManyInviterInputEnvelope
    connect?: InvitationWhereUniqueInput | InvitationWhereUniqueInput[]
  }

  export type WorkspaceUncheckedCreateNestedManyWithoutCreatorInput = {
    create?: XOR<WorkspaceCreateWithoutCreatorInput, WorkspaceUncheckedCreateWithoutCreatorInput> | WorkspaceCreateWithoutCreatorInput[] | WorkspaceUncheckedCreateWithoutCreatorInput[]
    connectOrCreate?: WorkspaceCreateOrConnectWithoutCreatorInput | WorkspaceCreateOrConnectWithoutCreatorInput[]
    createMany?: WorkspaceCreateManyCreatorInputEnvelope
    connect?: WorkspaceWhereUniqueInput | WorkspaceWhereUniqueInput[]
  }

  export type WorkspaceMemberUncheckedCreateNestedManyWithoutUserInput = {
    create?: XOR<WorkspaceMemberCreateWithoutUserInput, WorkspaceMemberUncheckedCreateWithoutUserInput> | WorkspaceMemberCreateWithoutUserInput[] | WorkspaceMemberUncheckedCreateWithoutUserInput[]
    connectOrCreate?: WorkspaceMemberCreateOrConnectWithoutUserInput | WorkspaceMemberCreateOrConnectWithoutUserInput[]
    createMany?: WorkspaceMemberCreateManyUserInputEnvelope
    connect?: WorkspaceMemberWhereUniqueInput | WorkspaceMemberWhereUniqueInput[]
  }

  export type InvitationUncheckedCreateNestedManyWithoutInviterInput = {
    create?: XOR<InvitationCreateWithoutInviterInput, InvitationUncheckedCreateWithoutInviterInput> | InvitationCreateWithoutInviterInput[] | InvitationUncheckedCreateWithoutInviterInput[]
    connectOrCreate?: InvitationCreateOrConnectWithoutInviterInput | InvitationCreateOrConnectWithoutInviterInput[]
    createMany?: InvitationCreateManyInviterInputEnvelope
    connect?: InvitationWhereUniqueInput | InvitationWhereUniqueInput[]
  }

  export type StringFieldUpdateOperationsInput = {
    set?: string
  }

  export type NullableStringFieldUpdateOperationsInput = {
    set?: string | null
  }

  export type NullableDateTimeFieldUpdateOperationsInput = {
    set?: Date | string | null
  }

  export type DateTimeFieldUpdateOperationsInput = {
    set?: Date | string
  }

  export type WorkspaceUpdateManyWithoutCreatorNestedInput = {
    create?: XOR<WorkspaceCreateWithoutCreatorInput, WorkspaceUncheckedCreateWithoutCreatorInput> | WorkspaceCreateWithoutCreatorInput[] | WorkspaceUncheckedCreateWithoutCreatorInput[]
    connectOrCreate?: WorkspaceCreateOrConnectWithoutCreatorInput | WorkspaceCreateOrConnectWithoutCreatorInput[]
    upsert?: WorkspaceUpsertWithWhereUniqueWithoutCreatorInput | WorkspaceUpsertWithWhereUniqueWithoutCreatorInput[]
    createMany?: WorkspaceCreateManyCreatorInputEnvelope
    set?: WorkspaceWhereUniqueInput | WorkspaceWhereUniqueInput[]
    disconnect?: WorkspaceWhereUniqueInput | WorkspaceWhereUniqueInput[]
    delete?: WorkspaceWhereUniqueInput | WorkspaceWhereUniqueInput[]
    connect?: WorkspaceWhereUniqueInput | WorkspaceWhereUniqueInput[]
    update?: WorkspaceUpdateWithWhereUniqueWithoutCreatorInput | WorkspaceUpdateWithWhereUniqueWithoutCreatorInput[]
    updateMany?: WorkspaceUpdateManyWithWhereWithoutCreatorInput | WorkspaceUpdateManyWithWhereWithoutCreatorInput[]
    deleteMany?: WorkspaceScalarWhereInput | WorkspaceScalarWhereInput[]
  }

  export type WorkspaceMemberUpdateManyWithoutUserNestedInput = {
    create?: XOR<WorkspaceMemberCreateWithoutUserInput, WorkspaceMemberUncheckedCreateWithoutUserInput> | WorkspaceMemberCreateWithoutUserInput[] | WorkspaceMemberUncheckedCreateWithoutUserInput[]
    connectOrCreate?: WorkspaceMemberCreateOrConnectWithoutUserInput | WorkspaceMemberCreateOrConnectWithoutUserInput[]
    upsert?: WorkspaceMemberUpsertWithWhereUniqueWithoutUserInput | WorkspaceMemberUpsertWithWhereUniqueWithoutUserInput[]
    createMany?: WorkspaceMemberCreateManyUserInputEnvelope
    set?: WorkspaceMemberWhereUniqueInput | WorkspaceMemberWhereUniqueInput[]
    disconnect?: WorkspaceMemberWhereUniqueInput | WorkspaceMemberWhereUniqueInput[]
    delete?: WorkspaceMemberWhereUniqueInput | WorkspaceMemberWhereUniqueInput[]
    connect?: WorkspaceMemberWhereUniqueInput | WorkspaceMemberWhereUniqueInput[]
    update?: WorkspaceMemberUpdateWithWhereUniqueWithoutUserInput | WorkspaceMemberUpdateWithWhereUniqueWithoutUserInput[]
    updateMany?: WorkspaceMemberUpdateManyWithWhereWithoutUserInput | WorkspaceMemberUpdateManyWithWhereWithoutUserInput[]
    deleteMany?: WorkspaceMemberScalarWhereInput | WorkspaceMemberScalarWhereInput[]
  }

  export type InvitationUpdateManyWithoutInviterNestedInput = {
    create?: XOR<InvitationCreateWithoutInviterInput, InvitationUncheckedCreateWithoutInviterInput> | InvitationCreateWithoutInviterInput[] | InvitationUncheckedCreateWithoutInviterInput[]
    connectOrCreate?: InvitationCreateOrConnectWithoutInviterInput | InvitationCreateOrConnectWithoutInviterInput[]
    upsert?: InvitationUpsertWithWhereUniqueWithoutInviterInput | InvitationUpsertWithWhereUniqueWithoutInviterInput[]
    createMany?: InvitationCreateManyInviterInputEnvelope
    set?: InvitationWhereUniqueInput | InvitationWhereUniqueInput[]
    disconnect?: InvitationWhereUniqueInput | InvitationWhereUniqueInput[]
    delete?: InvitationWhereUniqueInput | InvitationWhereUniqueInput[]
    connect?: InvitationWhereUniqueInput | InvitationWhereUniqueInput[]
    update?: InvitationUpdateWithWhereUniqueWithoutInviterInput | InvitationUpdateWithWhereUniqueWithoutInviterInput[]
    updateMany?: InvitationUpdateManyWithWhereWithoutInviterInput | InvitationUpdateManyWithWhereWithoutInviterInput[]
    deleteMany?: InvitationScalarWhereInput | InvitationScalarWhereInput[]
  }

  export type WorkspaceUncheckedUpdateManyWithoutCreatorNestedInput = {
    create?: XOR<WorkspaceCreateWithoutCreatorInput, WorkspaceUncheckedCreateWithoutCreatorInput> | WorkspaceCreateWithoutCreatorInput[] | WorkspaceUncheckedCreateWithoutCreatorInput[]
    connectOrCreate?: WorkspaceCreateOrConnectWithoutCreatorInput | WorkspaceCreateOrConnectWithoutCreatorInput[]
    upsert?: WorkspaceUpsertWithWhereUniqueWithoutCreatorInput | WorkspaceUpsertWithWhereUniqueWithoutCreatorInput[]
    createMany?: WorkspaceCreateManyCreatorInputEnvelope
    set?: WorkspaceWhereUniqueInput | WorkspaceWhereUniqueInput[]
    disconnect?: WorkspaceWhereUniqueInput | WorkspaceWhereUniqueInput[]
    delete?: WorkspaceWhereUniqueInput | WorkspaceWhereUniqueInput[]
    connect?: WorkspaceWhereUniqueInput | WorkspaceWhereUniqueInput[]
    update?: WorkspaceUpdateWithWhereUniqueWithoutCreatorInput | WorkspaceUpdateWithWhereUniqueWithoutCreatorInput[]
    updateMany?: WorkspaceUpdateManyWithWhereWithoutCreatorInput | WorkspaceUpdateManyWithWhereWithoutCreatorInput[]
    deleteMany?: WorkspaceScalarWhereInput | WorkspaceScalarWhereInput[]
  }

  export type WorkspaceMemberUncheckedUpdateManyWithoutUserNestedInput = {
    create?: XOR<WorkspaceMemberCreateWithoutUserInput, WorkspaceMemberUncheckedCreateWithoutUserInput> | WorkspaceMemberCreateWithoutUserInput[] | WorkspaceMemberUncheckedCreateWithoutUserInput[]
    connectOrCreate?: WorkspaceMemberCreateOrConnectWithoutUserInput | WorkspaceMemberCreateOrConnectWithoutUserInput[]
    upsert?: WorkspaceMemberUpsertWithWhereUniqueWithoutUserInput | WorkspaceMemberUpsertWithWhereUniqueWithoutUserInput[]
    createMany?: WorkspaceMemberCreateManyUserInputEnvelope
    set?: WorkspaceMemberWhereUniqueInput | WorkspaceMemberWhereUniqueInput[]
    disconnect?: WorkspaceMemberWhereUniqueInput | WorkspaceMemberWhereUniqueInput[]
    delete?: WorkspaceMemberWhereUniqueInput | WorkspaceMemberWhereUniqueInput[]
    connect?: WorkspaceMemberWhereUniqueInput | WorkspaceMemberWhereUniqueInput[]
    update?: WorkspaceMemberUpdateWithWhereUniqueWithoutUserInput | WorkspaceMemberUpdateWithWhereUniqueWithoutUserInput[]
    updateMany?: WorkspaceMemberUpdateManyWithWhereWithoutUserInput | WorkspaceMemberUpdateManyWithWhereWithoutUserInput[]
    deleteMany?: WorkspaceMemberScalarWhereInput | WorkspaceMemberScalarWhereInput[]
  }

  export type InvitationUncheckedUpdateManyWithoutInviterNestedInput = {
    create?: XOR<InvitationCreateWithoutInviterInput, InvitationUncheckedCreateWithoutInviterInput> | InvitationCreateWithoutInviterInput[] | InvitationUncheckedCreateWithoutInviterInput[]
    connectOrCreate?: InvitationCreateOrConnectWithoutInviterInput | InvitationCreateOrConnectWithoutInviterInput[]
    upsert?: InvitationUpsertWithWhereUniqueWithoutInviterInput | InvitationUpsertWithWhereUniqueWithoutInviterInput[]
    createMany?: InvitationCreateManyInviterInputEnvelope
    set?: InvitationWhereUniqueInput | InvitationWhereUniqueInput[]
    disconnect?: InvitationWhereUniqueInput | InvitationWhereUniqueInput[]
    delete?: InvitationWhereUniqueInput | InvitationWhereUniqueInput[]
    connect?: InvitationWhereUniqueInput | InvitationWhereUniqueInput[]
    update?: InvitationUpdateWithWhereUniqueWithoutInviterInput | InvitationUpdateWithWhereUniqueWithoutInviterInput[]
    updateMany?: InvitationUpdateManyWithWhereWithoutInviterInput | InvitationUpdateManyWithWhereWithoutInviterInput[]
    deleteMany?: InvitationScalarWhereInput | InvitationScalarWhereInput[]
  }

  export type WorkspaceCreateNestedManyWithoutTemplateInput = {
    create?: XOR<WorkspaceCreateWithoutTemplateInput, WorkspaceUncheckedCreateWithoutTemplateInput> | WorkspaceCreateWithoutTemplateInput[] | WorkspaceUncheckedCreateWithoutTemplateInput[]
    connectOrCreate?: WorkspaceCreateOrConnectWithoutTemplateInput | WorkspaceCreateOrConnectWithoutTemplateInput[]
    createMany?: WorkspaceCreateManyTemplateInputEnvelope
    connect?: WorkspaceWhereUniqueInput | WorkspaceWhereUniqueInput[]
  }

  export type WorkspaceUncheckedCreateNestedManyWithoutTemplateInput = {
    create?: XOR<WorkspaceCreateWithoutTemplateInput, WorkspaceUncheckedCreateWithoutTemplateInput> | WorkspaceCreateWithoutTemplateInput[] | WorkspaceUncheckedCreateWithoutTemplateInput[]
    connectOrCreate?: WorkspaceCreateOrConnectWithoutTemplateInput | WorkspaceCreateOrConnectWithoutTemplateInput[]
    createMany?: WorkspaceCreateManyTemplateInputEnvelope
    connect?: WorkspaceWhereUniqueInput | WorkspaceWhereUniqueInput[]
  }

  export type BoolFieldUpdateOperationsInput = {
    set?: boolean
  }

  export type IntFieldUpdateOperationsInput = {
    set?: number
    increment?: number
    decrement?: number
    multiply?: number
    divide?: number
  }

  export type WorkspaceUpdateManyWithoutTemplateNestedInput = {
    create?: XOR<WorkspaceCreateWithoutTemplateInput, WorkspaceUncheckedCreateWithoutTemplateInput> | WorkspaceCreateWithoutTemplateInput[] | WorkspaceUncheckedCreateWithoutTemplateInput[]
    connectOrCreate?: WorkspaceCreateOrConnectWithoutTemplateInput | WorkspaceCreateOrConnectWithoutTemplateInput[]
    upsert?: WorkspaceUpsertWithWhereUniqueWithoutTemplateInput | WorkspaceUpsertWithWhereUniqueWithoutTemplateInput[]
    createMany?: WorkspaceCreateManyTemplateInputEnvelope
    set?: WorkspaceWhereUniqueInput | WorkspaceWhereUniqueInput[]
    disconnect?: WorkspaceWhereUniqueInput | WorkspaceWhereUniqueInput[]
    delete?: WorkspaceWhereUniqueInput | WorkspaceWhereUniqueInput[]
    connect?: WorkspaceWhereUniqueInput | WorkspaceWhereUniqueInput[]
    update?: WorkspaceUpdateWithWhereUniqueWithoutTemplateInput | WorkspaceUpdateWithWhereUniqueWithoutTemplateInput[]
    updateMany?: WorkspaceUpdateManyWithWhereWithoutTemplateInput | WorkspaceUpdateManyWithWhereWithoutTemplateInput[]
    deleteMany?: WorkspaceScalarWhereInput | WorkspaceScalarWhereInput[]
  }

  export type WorkspaceUncheckedUpdateManyWithoutTemplateNestedInput = {
    create?: XOR<WorkspaceCreateWithoutTemplateInput, WorkspaceUncheckedCreateWithoutTemplateInput> | WorkspaceCreateWithoutTemplateInput[] | WorkspaceUncheckedCreateWithoutTemplateInput[]
    connectOrCreate?: WorkspaceCreateOrConnectWithoutTemplateInput | WorkspaceCreateOrConnectWithoutTemplateInput[]
    upsert?: WorkspaceUpsertWithWhereUniqueWithoutTemplateInput | WorkspaceUpsertWithWhereUniqueWithoutTemplateInput[]
    createMany?: WorkspaceCreateManyTemplateInputEnvelope
    set?: WorkspaceWhereUniqueInput | WorkspaceWhereUniqueInput[]
    disconnect?: WorkspaceWhereUniqueInput | WorkspaceWhereUniqueInput[]
    delete?: WorkspaceWhereUniqueInput | WorkspaceWhereUniqueInput[]
    connect?: WorkspaceWhereUniqueInput | WorkspaceWhereUniqueInput[]
    update?: WorkspaceUpdateWithWhereUniqueWithoutTemplateInput | WorkspaceUpdateWithWhereUniqueWithoutTemplateInput[]
    updateMany?: WorkspaceUpdateManyWithWhereWithoutTemplateInput | WorkspaceUpdateManyWithWhereWithoutTemplateInput[]
    deleteMany?: WorkspaceScalarWhereInput | WorkspaceScalarWhereInput[]
  }

  export type WorkspaceCreateNestedOneWithoutChildrenInput = {
    create?: XOR<WorkspaceCreateWithoutChildrenInput, WorkspaceUncheckedCreateWithoutChildrenInput>
    connectOrCreate?: WorkspaceCreateOrConnectWithoutChildrenInput
    connect?: WorkspaceWhereUniqueInput
  }

  export type WorkspaceCreateNestedManyWithoutParentInput = {
    create?: XOR<WorkspaceCreateWithoutParentInput, WorkspaceUncheckedCreateWithoutParentInput> | WorkspaceCreateWithoutParentInput[] | WorkspaceUncheckedCreateWithoutParentInput[]
    connectOrCreate?: WorkspaceCreateOrConnectWithoutParentInput | WorkspaceCreateOrConnectWithoutParentInput[]
    createMany?: WorkspaceCreateManyParentInputEnvelope
    connect?: WorkspaceWhereUniqueInput | WorkspaceWhereUniqueInput[]
  }

  export type WorkspaceTemplateCreateNestedOneWithoutWorkspacesInput = {
    create?: XOR<WorkspaceTemplateCreateWithoutWorkspacesInput, WorkspaceTemplateUncheckedCreateWithoutWorkspacesInput>
    connectOrCreate?: WorkspaceTemplateCreateOrConnectWithoutWorkspacesInput
    connect?: WorkspaceTemplateWhereUniqueInput
  }

  export type UserProfileCreateNestedOneWithoutWorkspacesCreatedInput = {
    create?: XOR<UserProfileCreateWithoutWorkspacesCreatedInput, UserProfileUncheckedCreateWithoutWorkspacesCreatedInput>
    connectOrCreate?: UserProfileCreateOrConnectWithoutWorkspacesCreatedInput
    connect?: UserProfileWhereUniqueInput
  }

  export type WorkspaceMemberCreateNestedManyWithoutWorkspaceInput = {
    create?: XOR<WorkspaceMemberCreateWithoutWorkspaceInput, WorkspaceMemberUncheckedCreateWithoutWorkspaceInput> | WorkspaceMemberCreateWithoutWorkspaceInput[] | WorkspaceMemberUncheckedCreateWithoutWorkspaceInput[]
    connectOrCreate?: WorkspaceMemberCreateOrConnectWithoutWorkspaceInput | WorkspaceMemberCreateOrConnectWithoutWorkspaceInput[]
    createMany?: WorkspaceMemberCreateManyWorkspaceInputEnvelope
    connect?: WorkspaceMemberWhereUniqueInput | WorkspaceMemberWhereUniqueInput[]
  }

  export type InvitationCreateNestedManyWithoutWorkspaceInput = {
    create?: XOR<InvitationCreateWithoutWorkspaceInput, InvitationUncheckedCreateWithoutWorkspaceInput> | InvitationCreateWithoutWorkspaceInput[] | InvitationUncheckedCreateWithoutWorkspaceInput[]
    connectOrCreate?: InvitationCreateOrConnectWithoutWorkspaceInput | InvitationCreateOrConnectWithoutWorkspaceInput[]
    createMany?: InvitationCreateManyWorkspaceInputEnvelope
    connect?: InvitationWhereUniqueInput | InvitationWhereUniqueInput[]
  }

  export type WorkspaceRoleActionCreateNestedManyWithoutWorkspaceInput = {
    create?: XOR<WorkspaceRoleActionCreateWithoutWorkspaceInput, WorkspaceRoleActionUncheckedCreateWithoutWorkspaceInput> | WorkspaceRoleActionCreateWithoutWorkspaceInput[] | WorkspaceRoleActionUncheckedCreateWithoutWorkspaceInput[]
    connectOrCreate?: WorkspaceRoleActionCreateOrConnectWithoutWorkspaceInput | WorkspaceRoleActionCreateOrConnectWithoutWorkspaceInput[]
    createMany?: WorkspaceRoleActionCreateManyWorkspaceInputEnvelope
    connect?: WorkspaceRoleActionWhereUniqueInput | WorkspaceRoleActionWhereUniqueInput[]
  }

  export type WorkspaceUncheckedCreateNestedManyWithoutParentInput = {
    create?: XOR<WorkspaceCreateWithoutParentInput, WorkspaceUncheckedCreateWithoutParentInput> | WorkspaceCreateWithoutParentInput[] | WorkspaceUncheckedCreateWithoutParentInput[]
    connectOrCreate?: WorkspaceCreateOrConnectWithoutParentInput | WorkspaceCreateOrConnectWithoutParentInput[]
    createMany?: WorkspaceCreateManyParentInputEnvelope
    connect?: WorkspaceWhereUniqueInput | WorkspaceWhereUniqueInput[]
  }

  export type WorkspaceMemberUncheckedCreateNestedManyWithoutWorkspaceInput = {
    create?: XOR<WorkspaceMemberCreateWithoutWorkspaceInput, WorkspaceMemberUncheckedCreateWithoutWorkspaceInput> | WorkspaceMemberCreateWithoutWorkspaceInput[] | WorkspaceMemberUncheckedCreateWithoutWorkspaceInput[]
    connectOrCreate?: WorkspaceMemberCreateOrConnectWithoutWorkspaceInput | WorkspaceMemberCreateOrConnectWithoutWorkspaceInput[]
    createMany?: WorkspaceMemberCreateManyWorkspaceInputEnvelope
    connect?: WorkspaceMemberWhereUniqueInput | WorkspaceMemberWhereUniqueInput[]
  }

  export type InvitationUncheckedCreateNestedManyWithoutWorkspaceInput = {
    create?: XOR<InvitationCreateWithoutWorkspaceInput, InvitationUncheckedCreateWithoutWorkspaceInput> | InvitationCreateWithoutWorkspaceInput[] | InvitationUncheckedCreateWithoutWorkspaceInput[]
    connectOrCreate?: InvitationCreateOrConnectWithoutWorkspaceInput | InvitationCreateOrConnectWithoutWorkspaceInput[]
    createMany?: InvitationCreateManyWorkspaceInputEnvelope
    connect?: InvitationWhereUniqueInput | InvitationWhereUniqueInput[]
  }

  export type WorkspaceRoleActionUncheckedCreateNestedManyWithoutWorkspaceInput = {
    create?: XOR<WorkspaceRoleActionCreateWithoutWorkspaceInput, WorkspaceRoleActionUncheckedCreateWithoutWorkspaceInput> | WorkspaceRoleActionCreateWithoutWorkspaceInput[] | WorkspaceRoleActionUncheckedCreateWithoutWorkspaceInput[]
    connectOrCreate?: WorkspaceRoleActionCreateOrConnectWithoutWorkspaceInput | WorkspaceRoleActionCreateOrConnectWithoutWorkspaceInput[]
    createMany?: WorkspaceRoleActionCreateManyWorkspaceInputEnvelope
    connect?: WorkspaceRoleActionWhereUniqueInput | WorkspaceRoleActionWhereUniqueInput[]
  }

  export type WorkspaceUpdateOneWithoutChildrenNestedInput = {
    create?: XOR<WorkspaceCreateWithoutChildrenInput, WorkspaceUncheckedCreateWithoutChildrenInput>
    connectOrCreate?: WorkspaceCreateOrConnectWithoutChildrenInput
    upsert?: WorkspaceUpsertWithoutChildrenInput
    disconnect?: WorkspaceWhereInput | boolean
    delete?: WorkspaceWhereInput | boolean
    connect?: WorkspaceWhereUniqueInput
    update?: XOR<XOR<WorkspaceUpdateToOneWithWhereWithoutChildrenInput, WorkspaceUpdateWithoutChildrenInput>, WorkspaceUncheckedUpdateWithoutChildrenInput>
  }

  export type WorkspaceUpdateManyWithoutParentNestedInput = {
    create?: XOR<WorkspaceCreateWithoutParentInput, WorkspaceUncheckedCreateWithoutParentInput> | WorkspaceCreateWithoutParentInput[] | WorkspaceUncheckedCreateWithoutParentInput[]
    connectOrCreate?: WorkspaceCreateOrConnectWithoutParentInput | WorkspaceCreateOrConnectWithoutParentInput[]
    upsert?: WorkspaceUpsertWithWhereUniqueWithoutParentInput | WorkspaceUpsertWithWhereUniqueWithoutParentInput[]
    createMany?: WorkspaceCreateManyParentInputEnvelope
    set?: WorkspaceWhereUniqueInput | WorkspaceWhereUniqueInput[]
    disconnect?: WorkspaceWhereUniqueInput | WorkspaceWhereUniqueInput[]
    delete?: WorkspaceWhereUniqueInput | WorkspaceWhereUniqueInput[]
    connect?: WorkspaceWhereUniqueInput | WorkspaceWhereUniqueInput[]
    update?: WorkspaceUpdateWithWhereUniqueWithoutParentInput | WorkspaceUpdateWithWhereUniqueWithoutParentInput[]
    updateMany?: WorkspaceUpdateManyWithWhereWithoutParentInput | WorkspaceUpdateManyWithWhereWithoutParentInput[]
    deleteMany?: WorkspaceScalarWhereInput | WorkspaceScalarWhereInput[]
  }

  export type WorkspaceTemplateUpdateOneWithoutWorkspacesNestedInput = {
    create?: XOR<WorkspaceTemplateCreateWithoutWorkspacesInput, WorkspaceTemplateUncheckedCreateWithoutWorkspacesInput>
    connectOrCreate?: WorkspaceTemplateCreateOrConnectWithoutWorkspacesInput
    upsert?: WorkspaceTemplateUpsertWithoutWorkspacesInput
    disconnect?: WorkspaceTemplateWhereInput | boolean
    delete?: WorkspaceTemplateWhereInput | boolean
    connect?: WorkspaceTemplateWhereUniqueInput
    update?: XOR<XOR<WorkspaceTemplateUpdateToOneWithWhereWithoutWorkspacesInput, WorkspaceTemplateUpdateWithoutWorkspacesInput>, WorkspaceTemplateUncheckedUpdateWithoutWorkspacesInput>
  }

  export type UserProfileUpdateOneRequiredWithoutWorkspacesCreatedNestedInput = {
    create?: XOR<UserProfileCreateWithoutWorkspacesCreatedInput, UserProfileUncheckedCreateWithoutWorkspacesCreatedInput>
    connectOrCreate?: UserProfileCreateOrConnectWithoutWorkspacesCreatedInput
    upsert?: UserProfileUpsertWithoutWorkspacesCreatedInput
    connect?: UserProfileWhereUniqueInput
    update?: XOR<XOR<UserProfileUpdateToOneWithWhereWithoutWorkspacesCreatedInput, UserProfileUpdateWithoutWorkspacesCreatedInput>, UserProfileUncheckedUpdateWithoutWorkspacesCreatedInput>
  }

  export type WorkspaceMemberUpdateManyWithoutWorkspaceNestedInput = {
    create?: XOR<WorkspaceMemberCreateWithoutWorkspaceInput, WorkspaceMemberUncheckedCreateWithoutWorkspaceInput> | WorkspaceMemberCreateWithoutWorkspaceInput[] | WorkspaceMemberUncheckedCreateWithoutWorkspaceInput[]
    connectOrCreate?: WorkspaceMemberCreateOrConnectWithoutWorkspaceInput | WorkspaceMemberCreateOrConnectWithoutWorkspaceInput[]
    upsert?: WorkspaceMemberUpsertWithWhereUniqueWithoutWorkspaceInput | WorkspaceMemberUpsertWithWhereUniqueWithoutWorkspaceInput[]
    createMany?: WorkspaceMemberCreateManyWorkspaceInputEnvelope
    set?: WorkspaceMemberWhereUniqueInput | WorkspaceMemberWhereUniqueInput[]
    disconnect?: WorkspaceMemberWhereUniqueInput | WorkspaceMemberWhereUniqueInput[]
    delete?: WorkspaceMemberWhereUniqueInput | WorkspaceMemberWhereUniqueInput[]
    connect?: WorkspaceMemberWhereUniqueInput | WorkspaceMemberWhereUniqueInput[]
    update?: WorkspaceMemberUpdateWithWhereUniqueWithoutWorkspaceInput | WorkspaceMemberUpdateWithWhereUniqueWithoutWorkspaceInput[]
    updateMany?: WorkspaceMemberUpdateManyWithWhereWithoutWorkspaceInput | WorkspaceMemberUpdateManyWithWhereWithoutWorkspaceInput[]
    deleteMany?: WorkspaceMemberScalarWhereInput | WorkspaceMemberScalarWhereInput[]
  }

  export type InvitationUpdateManyWithoutWorkspaceNestedInput = {
    create?: XOR<InvitationCreateWithoutWorkspaceInput, InvitationUncheckedCreateWithoutWorkspaceInput> | InvitationCreateWithoutWorkspaceInput[] | InvitationUncheckedCreateWithoutWorkspaceInput[]
    connectOrCreate?: InvitationCreateOrConnectWithoutWorkspaceInput | InvitationCreateOrConnectWithoutWorkspaceInput[]
    upsert?: InvitationUpsertWithWhereUniqueWithoutWorkspaceInput | InvitationUpsertWithWhereUniqueWithoutWorkspaceInput[]
    createMany?: InvitationCreateManyWorkspaceInputEnvelope
    set?: InvitationWhereUniqueInput | InvitationWhereUniqueInput[]
    disconnect?: InvitationWhereUniqueInput | InvitationWhereUniqueInput[]
    delete?: InvitationWhereUniqueInput | InvitationWhereUniqueInput[]
    connect?: InvitationWhereUniqueInput | InvitationWhereUniqueInput[]
    update?: InvitationUpdateWithWhereUniqueWithoutWorkspaceInput | InvitationUpdateWithWhereUniqueWithoutWorkspaceInput[]
    updateMany?: InvitationUpdateManyWithWhereWithoutWorkspaceInput | InvitationUpdateManyWithWhereWithoutWorkspaceInput[]
    deleteMany?: InvitationScalarWhereInput | InvitationScalarWhereInput[]
  }

  export type WorkspaceRoleActionUpdateManyWithoutWorkspaceNestedInput = {
    create?: XOR<WorkspaceRoleActionCreateWithoutWorkspaceInput, WorkspaceRoleActionUncheckedCreateWithoutWorkspaceInput> | WorkspaceRoleActionCreateWithoutWorkspaceInput[] | WorkspaceRoleActionUncheckedCreateWithoutWorkspaceInput[]
    connectOrCreate?: WorkspaceRoleActionCreateOrConnectWithoutWorkspaceInput | WorkspaceRoleActionCreateOrConnectWithoutWorkspaceInput[]
    upsert?: WorkspaceRoleActionUpsertWithWhereUniqueWithoutWorkspaceInput | WorkspaceRoleActionUpsertWithWhereUniqueWithoutWorkspaceInput[]
    createMany?: WorkspaceRoleActionCreateManyWorkspaceInputEnvelope
    set?: WorkspaceRoleActionWhereUniqueInput | WorkspaceRoleActionWhereUniqueInput[]
    disconnect?: WorkspaceRoleActionWhereUniqueInput | WorkspaceRoleActionWhereUniqueInput[]
    delete?: WorkspaceRoleActionWhereUniqueInput | WorkspaceRoleActionWhereUniqueInput[]
    connect?: WorkspaceRoleActionWhereUniqueInput | WorkspaceRoleActionWhereUniqueInput[]
    update?: WorkspaceRoleActionUpdateWithWhereUniqueWithoutWorkspaceInput | WorkspaceRoleActionUpdateWithWhereUniqueWithoutWorkspaceInput[]
    updateMany?: WorkspaceRoleActionUpdateManyWithWhereWithoutWorkspaceInput | WorkspaceRoleActionUpdateManyWithWhereWithoutWorkspaceInput[]
    deleteMany?: WorkspaceRoleActionScalarWhereInput | WorkspaceRoleActionScalarWhereInput[]
  }

  export type WorkspaceUncheckedUpdateManyWithoutParentNestedInput = {
    create?: XOR<WorkspaceCreateWithoutParentInput, WorkspaceUncheckedCreateWithoutParentInput> | WorkspaceCreateWithoutParentInput[] | WorkspaceUncheckedCreateWithoutParentInput[]
    connectOrCreate?: WorkspaceCreateOrConnectWithoutParentInput | WorkspaceCreateOrConnectWithoutParentInput[]
    upsert?: WorkspaceUpsertWithWhereUniqueWithoutParentInput | WorkspaceUpsertWithWhereUniqueWithoutParentInput[]
    createMany?: WorkspaceCreateManyParentInputEnvelope
    set?: WorkspaceWhereUniqueInput | WorkspaceWhereUniqueInput[]
    disconnect?: WorkspaceWhereUniqueInput | WorkspaceWhereUniqueInput[]
    delete?: WorkspaceWhereUniqueInput | WorkspaceWhereUniqueInput[]
    connect?: WorkspaceWhereUniqueInput | WorkspaceWhereUniqueInput[]
    update?: WorkspaceUpdateWithWhereUniqueWithoutParentInput | WorkspaceUpdateWithWhereUniqueWithoutParentInput[]
    updateMany?: WorkspaceUpdateManyWithWhereWithoutParentInput | WorkspaceUpdateManyWithWhereWithoutParentInput[]
    deleteMany?: WorkspaceScalarWhereInput | WorkspaceScalarWhereInput[]
  }

  export type WorkspaceMemberUncheckedUpdateManyWithoutWorkspaceNestedInput = {
    create?: XOR<WorkspaceMemberCreateWithoutWorkspaceInput, WorkspaceMemberUncheckedCreateWithoutWorkspaceInput> | WorkspaceMemberCreateWithoutWorkspaceInput[] | WorkspaceMemberUncheckedCreateWithoutWorkspaceInput[]
    connectOrCreate?: WorkspaceMemberCreateOrConnectWithoutWorkspaceInput | WorkspaceMemberCreateOrConnectWithoutWorkspaceInput[]
    upsert?: WorkspaceMemberUpsertWithWhereUniqueWithoutWorkspaceInput | WorkspaceMemberUpsertWithWhereUniqueWithoutWorkspaceInput[]
    createMany?: WorkspaceMemberCreateManyWorkspaceInputEnvelope
    set?: WorkspaceMemberWhereUniqueInput | WorkspaceMemberWhereUniqueInput[]
    disconnect?: WorkspaceMemberWhereUniqueInput | WorkspaceMemberWhereUniqueInput[]
    delete?: WorkspaceMemberWhereUniqueInput | WorkspaceMemberWhereUniqueInput[]
    connect?: WorkspaceMemberWhereUniqueInput | WorkspaceMemberWhereUniqueInput[]
    update?: WorkspaceMemberUpdateWithWhereUniqueWithoutWorkspaceInput | WorkspaceMemberUpdateWithWhereUniqueWithoutWorkspaceInput[]
    updateMany?: WorkspaceMemberUpdateManyWithWhereWithoutWorkspaceInput | WorkspaceMemberUpdateManyWithWhereWithoutWorkspaceInput[]
    deleteMany?: WorkspaceMemberScalarWhereInput | WorkspaceMemberScalarWhereInput[]
  }

  export type InvitationUncheckedUpdateManyWithoutWorkspaceNestedInput = {
    create?: XOR<InvitationCreateWithoutWorkspaceInput, InvitationUncheckedCreateWithoutWorkspaceInput> | InvitationCreateWithoutWorkspaceInput[] | InvitationUncheckedCreateWithoutWorkspaceInput[]
    connectOrCreate?: InvitationCreateOrConnectWithoutWorkspaceInput | InvitationCreateOrConnectWithoutWorkspaceInput[]
    upsert?: InvitationUpsertWithWhereUniqueWithoutWorkspaceInput | InvitationUpsertWithWhereUniqueWithoutWorkspaceInput[]
    createMany?: InvitationCreateManyWorkspaceInputEnvelope
    set?: InvitationWhereUniqueInput | InvitationWhereUniqueInput[]
    disconnect?: InvitationWhereUniqueInput | InvitationWhereUniqueInput[]
    delete?: InvitationWhereUniqueInput | InvitationWhereUniqueInput[]
    connect?: InvitationWhereUniqueInput | InvitationWhereUniqueInput[]
    update?: InvitationUpdateWithWhereUniqueWithoutWorkspaceInput | InvitationUpdateWithWhereUniqueWithoutWorkspaceInput[]
    updateMany?: InvitationUpdateManyWithWhereWithoutWorkspaceInput | InvitationUpdateManyWithWhereWithoutWorkspaceInput[]
    deleteMany?: InvitationScalarWhereInput | InvitationScalarWhereInput[]
  }

  export type WorkspaceRoleActionUncheckedUpdateManyWithoutWorkspaceNestedInput = {
    create?: XOR<WorkspaceRoleActionCreateWithoutWorkspaceInput, WorkspaceRoleActionUncheckedCreateWithoutWorkspaceInput> | WorkspaceRoleActionCreateWithoutWorkspaceInput[] | WorkspaceRoleActionUncheckedCreateWithoutWorkspaceInput[]
    connectOrCreate?: WorkspaceRoleActionCreateOrConnectWithoutWorkspaceInput | WorkspaceRoleActionCreateOrConnectWithoutWorkspaceInput[]
    upsert?: WorkspaceRoleActionUpsertWithWhereUniqueWithoutWorkspaceInput | WorkspaceRoleActionUpsertWithWhereUniqueWithoutWorkspaceInput[]
    createMany?: WorkspaceRoleActionCreateManyWorkspaceInputEnvelope
    set?: WorkspaceRoleActionWhereUniqueInput | WorkspaceRoleActionWhereUniqueInput[]
    disconnect?: WorkspaceRoleActionWhereUniqueInput | WorkspaceRoleActionWhereUniqueInput[]
    delete?: WorkspaceRoleActionWhereUniqueInput | WorkspaceRoleActionWhereUniqueInput[]
    connect?: WorkspaceRoleActionWhereUniqueInput | WorkspaceRoleActionWhereUniqueInput[]
    update?: WorkspaceRoleActionUpdateWithWhereUniqueWithoutWorkspaceInput | WorkspaceRoleActionUpdateWithWhereUniqueWithoutWorkspaceInput[]
    updateMany?: WorkspaceRoleActionUpdateManyWithWhereWithoutWorkspaceInput | WorkspaceRoleActionUpdateManyWithWhereWithoutWorkspaceInput[]
    deleteMany?: WorkspaceRoleActionScalarWhereInput | WorkspaceRoleActionScalarWhereInput[]
  }

  export type WorkspaceCreateNestedOneWithoutMembersInput = {
    create?: XOR<WorkspaceCreateWithoutMembersInput, WorkspaceUncheckedCreateWithoutMembersInput>
    connectOrCreate?: WorkspaceCreateOrConnectWithoutMembersInput
    connect?: WorkspaceWhereUniqueInput
  }

  export type UserProfileCreateNestedOneWithoutWorkspaceMembersInput = {
    create?: XOR<UserProfileCreateWithoutWorkspaceMembersInput, UserProfileUncheckedCreateWithoutWorkspaceMembersInput>
    connectOrCreate?: UserProfileCreateOrConnectWithoutWorkspaceMembersInput
    connect?: UserProfileWhereUniqueInput
  }

  export type WorkspaceUpdateOneRequiredWithoutMembersNestedInput = {
    create?: XOR<WorkspaceCreateWithoutMembersInput, WorkspaceUncheckedCreateWithoutMembersInput>
    connectOrCreate?: WorkspaceCreateOrConnectWithoutMembersInput
    upsert?: WorkspaceUpsertWithoutMembersInput
    connect?: WorkspaceWhereUniqueInput
    update?: XOR<XOR<WorkspaceUpdateToOneWithWhereWithoutMembersInput, WorkspaceUpdateWithoutMembersInput>, WorkspaceUncheckedUpdateWithoutMembersInput>
  }

  export type UserProfileUpdateOneRequiredWithoutWorkspaceMembersNestedInput = {
    create?: XOR<UserProfileCreateWithoutWorkspaceMembersInput, UserProfileUncheckedCreateWithoutWorkspaceMembersInput>
    connectOrCreate?: UserProfileCreateOrConnectWithoutWorkspaceMembersInput
    upsert?: UserProfileUpsertWithoutWorkspaceMembersInput
    connect?: UserProfileWhereUniqueInput
    update?: XOR<XOR<UserProfileUpdateToOneWithWhereWithoutWorkspaceMembersInput, UserProfileUpdateWithoutWorkspaceMembersInput>, UserProfileUncheckedUpdateWithoutWorkspaceMembersInput>
  }

  export type WorkspaceCreateNestedOneWithoutInvitationsInput = {
    create?: XOR<WorkspaceCreateWithoutInvitationsInput, WorkspaceUncheckedCreateWithoutInvitationsInput>
    connectOrCreate?: WorkspaceCreateOrConnectWithoutInvitationsInput
    connect?: WorkspaceWhereUniqueInput
  }

  export type UserProfileCreateNestedOneWithoutInvitationsSentInput = {
    create?: XOR<UserProfileCreateWithoutInvitationsSentInput, UserProfileUncheckedCreateWithoutInvitationsSentInput>
    connectOrCreate?: UserProfileCreateOrConnectWithoutInvitationsSentInput
    connect?: UserProfileWhereUniqueInput
  }

  export type WorkspaceUpdateOneRequiredWithoutInvitationsNestedInput = {
    create?: XOR<WorkspaceCreateWithoutInvitationsInput, WorkspaceUncheckedCreateWithoutInvitationsInput>
    connectOrCreate?: WorkspaceCreateOrConnectWithoutInvitationsInput
    upsert?: WorkspaceUpsertWithoutInvitationsInput
    connect?: WorkspaceWhereUniqueInput
    update?: XOR<XOR<WorkspaceUpdateToOneWithWhereWithoutInvitationsInput, WorkspaceUpdateWithoutInvitationsInput>, WorkspaceUncheckedUpdateWithoutInvitationsInput>
  }

  export type UserProfileUpdateOneRequiredWithoutInvitationsSentNestedInput = {
    create?: XOR<UserProfileCreateWithoutInvitationsSentInput, UserProfileUncheckedCreateWithoutInvitationsSentInput>
    connectOrCreate?: UserProfileCreateOrConnectWithoutInvitationsSentInput
    upsert?: UserProfileUpsertWithoutInvitationsSentInput
    connect?: UserProfileWhereUniqueInput
    update?: XOR<XOR<UserProfileUpdateToOneWithWhereWithoutInvitationsSentInput, UserProfileUpdateWithoutInvitationsSentInput>, UserProfileUncheckedUpdateWithoutInvitationsSentInput>
  }

  export type WorkspaceCreateNestedOneWithoutRoleActionsInput = {
    create?: XOR<WorkspaceCreateWithoutRoleActionsInput, WorkspaceUncheckedCreateWithoutRoleActionsInput>
    connectOrCreate?: WorkspaceCreateOrConnectWithoutRoleActionsInput
    connect?: WorkspaceWhereUniqueInput
  }

  export type WorkspaceUpdateOneRequiredWithoutRoleActionsNestedInput = {
    create?: XOR<WorkspaceCreateWithoutRoleActionsInput, WorkspaceUncheckedCreateWithoutRoleActionsInput>
    connectOrCreate?: WorkspaceCreateOrConnectWithoutRoleActionsInput
    upsert?: WorkspaceUpsertWithoutRoleActionsInput
    connect?: WorkspaceWhereUniqueInput
    update?: XOR<XOR<WorkspaceUpdateToOneWithWhereWithoutRoleActionsInput, WorkspaceUpdateWithoutRoleActionsInput>, WorkspaceUncheckedUpdateWithoutRoleActionsInput>
  }

  export type NestedUuidFilter<$PrismaModel = never> = {
    equals?: string | StringFieldRefInput<$PrismaModel>
    in?: string[] | ListStringFieldRefInput<$PrismaModel>
    notIn?: string[] | ListStringFieldRefInput<$PrismaModel>
    lt?: string | StringFieldRefInput<$PrismaModel>
    lte?: string | StringFieldRefInput<$PrismaModel>
    gt?: string | StringFieldRefInput<$PrismaModel>
    gte?: string | StringFieldRefInput<$PrismaModel>
    not?: NestedUuidFilter<$PrismaModel> | string
  }

  export type NestedStringFilter<$PrismaModel = never> = {
    equals?: string | StringFieldRefInput<$PrismaModel>
    in?: string[] | ListStringFieldRefInput<$PrismaModel>
    notIn?: string[] | ListStringFieldRefInput<$PrismaModel>
    lt?: string | StringFieldRefInput<$PrismaModel>
    lte?: string | StringFieldRefInput<$PrismaModel>
    gt?: string | StringFieldRefInput<$PrismaModel>
    gte?: string | StringFieldRefInput<$PrismaModel>
    contains?: string | StringFieldRefInput<$PrismaModel>
    startsWith?: string | StringFieldRefInput<$PrismaModel>
    endsWith?: string | StringFieldRefInput<$PrismaModel>
    not?: NestedStringFilter<$PrismaModel> | string
  }

  export type NestedStringNullableFilter<$PrismaModel = never> = {
    equals?: string | StringFieldRefInput<$PrismaModel> | null
    in?: string[] | ListStringFieldRefInput<$PrismaModel> | null
    notIn?: string[] | ListStringFieldRefInput<$PrismaModel> | null
    lt?: string | StringFieldRefInput<$PrismaModel>
    lte?: string | StringFieldRefInput<$PrismaModel>
    gt?: string | StringFieldRefInput<$PrismaModel>
    gte?: string | StringFieldRefInput<$PrismaModel>
    contains?: string | StringFieldRefInput<$PrismaModel>
    startsWith?: string | StringFieldRefInput<$PrismaModel>
    endsWith?: string | StringFieldRefInput<$PrismaModel>
    not?: NestedStringNullableFilter<$PrismaModel> | string | null
  }

  export type NestedDateTimeNullableFilter<$PrismaModel = never> = {
    equals?: Date | string | DateTimeFieldRefInput<$PrismaModel> | null
    in?: Date[] | string[] | ListDateTimeFieldRefInput<$PrismaModel> | null
    notIn?: Date[] | string[] | ListDateTimeFieldRefInput<$PrismaModel> | null
    lt?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    lte?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    gt?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    gte?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    not?: NestedDateTimeNullableFilter<$PrismaModel> | Date | string | null
  }

  export type NestedDateTimeFilter<$PrismaModel = never> = {
    equals?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    in?: Date[] | string[] | ListDateTimeFieldRefInput<$PrismaModel>
    notIn?: Date[] | string[] | ListDateTimeFieldRefInput<$PrismaModel>
    lt?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    lte?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    gt?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    gte?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    not?: NestedDateTimeFilter<$PrismaModel> | Date | string
  }

  export type NestedUuidWithAggregatesFilter<$PrismaModel = never> = {
    equals?: string | StringFieldRefInput<$PrismaModel>
    in?: string[] | ListStringFieldRefInput<$PrismaModel>
    notIn?: string[] | ListStringFieldRefInput<$PrismaModel>
    lt?: string | StringFieldRefInput<$PrismaModel>
    lte?: string | StringFieldRefInput<$PrismaModel>
    gt?: string | StringFieldRefInput<$PrismaModel>
    gte?: string | StringFieldRefInput<$PrismaModel>
    not?: NestedUuidWithAggregatesFilter<$PrismaModel> | string
    _count?: NestedIntFilter<$PrismaModel>
    _min?: NestedStringFilter<$PrismaModel>
    _max?: NestedStringFilter<$PrismaModel>
  }

  export type NestedIntFilter<$PrismaModel = never> = {
    equals?: number | IntFieldRefInput<$PrismaModel>
    in?: number[] | ListIntFieldRefInput<$PrismaModel>
    notIn?: number[] | ListIntFieldRefInput<$PrismaModel>
    lt?: number | IntFieldRefInput<$PrismaModel>
    lte?: number | IntFieldRefInput<$PrismaModel>
    gt?: number | IntFieldRefInput<$PrismaModel>
    gte?: number | IntFieldRefInput<$PrismaModel>
    not?: NestedIntFilter<$PrismaModel> | number
  }

  export type NestedStringWithAggregatesFilter<$PrismaModel = never> = {
    equals?: string | StringFieldRefInput<$PrismaModel>
    in?: string[] | ListStringFieldRefInput<$PrismaModel>
    notIn?: string[] | ListStringFieldRefInput<$PrismaModel>
    lt?: string | StringFieldRefInput<$PrismaModel>
    lte?: string | StringFieldRefInput<$PrismaModel>
    gt?: string | StringFieldRefInput<$PrismaModel>
    gte?: string | StringFieldRefInput<$PrismaModel>
    contains?: string | StringFieldRefInput<$PrismaModel>
    startsWith?: string | StringFieldRefInput<$PrismaModel>
    endsWith?: string | StringFieldRefInput<$PrismaModel>
    not?: NestedStringWithAggregatesFilter<$PrismaModel> | string
    _count?: NestedIntFilter<$PrismaModel>
    _min?: NestedStringFilter<$PrismaModel>
    _max?: NestedStringFilter<$PrismaModel>
  }

  export type NestedStringNullableWithAggregatesFilter<$PrismaModel = never> = {
    equals?: string | StringFieldRefInput<$PrismaModel> | null
    in?: string[] | ListStringFieldRefInput<$PrismaModel> | null
    notIn?: string[] | ListStringFieldRefInput<$PrismaModel> | null
    lt?: string | StringFieldRefInput<$PrismaModel>
    lte?: string | StringFieldRefInput<$PrismaModel>
    gt?: string | StringFieldRefInput<$PrismaModel>
    gte?: string | StringFieldRefInput<$PrismaModel>
    contains?: string | StringFieldRefInput<$PrismaModel>
    startsWith?: string | StringFieldRefInput<$PrismaModel>
    endsWith?: string | StringFieldRefInput<$PrismaModel>
    not?: NestedStringNullableWithAggregatesFilter<$PrismaModel> | string | null
    _count?: NestedIntNullableFilter<$PrismaModel>
    _min?: NestedStringNullableFilter<$PrismaModel>
    _max?: NestedStringNullableFilter<$PrismaModel>
  }

  export type NestedIntNullableFilter<$PrismaModel = never> = {
    equals?: number | IntFieldRefInput<$PrismaModel> | null
    in?: number[] | ListIntFieldRefInput<$PrismaModel> | null
    notIn?: number[] | ListIntFieldRefInput<$PrismaModel> | null
    lt?: number | IntFieldRefInput<$PrismaModel>
    lte?: number | IntFieldRefInput<$PrismaModel>
    gt?: number | IntFieldRefInput<$PrismaModel>
    gte?: number | IntFieldRefInput<$PrismaModel>
    not?: NestedIntNullableFilter<$PrismaModel> | number | null
  }
  export type NestedJsonFilter<$PrismaModel = never> =
    | PatchUndefined<
        Either<Required<NestedJsonFilterBase<$PrismaModel>>, Exclude<keyof Required<NestedJsonFilterBase<$PrismaModel>>, 'path'>>,
        Required<NestedJsonFilterBase<$PrismaModel>>
      >
    | OptionalFlat<Omit<Required<NestedJsonFilterBase<$PrismaModel>>, 'path'>>

  export type NestedJsonFilterBase<$PrismaModel = never> = {
    equals?: InputJsonValue | JsonFieldRefInput<$PrismaModel> | JsonNullValueFilter
    path?: string[]
    mode?: QueryMode | EnumQueryModeFieldRefInput<$PrismaModel>
    string_contains?: string | StringFieldRefInput<$PrismaModel>
    string_starts_with?: string | StringFieldRefInput<$PrismaModel>
    string_ends_with?: string | StringFieldRefInput<$PrismaModel>
    array_starts_with?: InputJsonValue | JsonFieldRefInput<$PrismaModel> | null
    array_ends_with?: InputJsonValue | JsonFieldRefInput<$PrismaModel> | null
    array_contains?: InputJsonValue | JsonFieldRefInput<$PrismaModel> | null
    lt?: InputJsonValue | JsonFieldRefInput<$PrismaModel>
    lte?: InputJsonValue | JsonFieldRefInput<$PrismaModel>
    gt?: InputJsonValue | JsonFieldRefInput<$PrismaModel>
    gte?: InputJsonValue | JsonFieldRefInput<$PrismaModel>
    not?: InputJsonValue | JsonFieldRefInput<$PrismaModel> | JsonNullValueFilter
  }

  export type NestedDateTimeNullableWithAggregatesFilter<$PrismaModel = never> = {
    equals?: Date | string | DateTimeFieldRefInput<$PrismaModel> | null
    in?: Date[] | string[] | ListDateTimeFieldRefInput<$PrismaModel> | null
    notIn?: Date[] | string[] | ListDateTimeFieldRefInput<$PrismaModel> | null
    lt?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    lte?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    gt?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    gte?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    not?: NestedDateTimeNullableWithAggregatesFilter<$PrismaModel> | Date | string | null
    _count?: NestedIntNullableFilter<$PrismaModel>
    _min?: NestedDateTimeNullableFilter<$PrismaModel>
    _max?: NestedDateTimeNullableFilter<$PrismaModel>
  }

  export type NestedDateTimeWithAggregatesFilter<$PrismaModel = never> = {
    equals?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    in?: Date[] | string[] | ListDateTimeFieldRefInput<$PrismaModel>
    notIn?: Date[] | string[] | ListDateTimeFieldRefInput<$PrismaModel>
    lt?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    lte?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    gt?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    gte?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    not?: NestedDateTimeWithAggregatesFilter<$PrismaModel> | Date | string
    _count?: NestedIntFilter<$PrismaModel>
    _min?: NestedDateTimeFilter<$PrismaModel>
    _max?: NestedDateTimeFilter<$PrismaModel>
  }

  export type NestedBoolFilter<$PrismaModel = never> = {
    equals?: boolean | BooleanFieldRefInput<$PrismaModel>
    not?: NestedBoolFilter<$PrismaModel> | boolean
  }

  export type NestedUuidNullableFilter<$PrismaModel = never> = {
    equals?: string | StringFieldRefInput<$PrismaModel> | null
    in?: string[] | ListStringFieldRefInput<$PrismaModel> | null
    notIn?: string[] | ListStringFieldRefInput<$PrismaModel> | null
    lt?: string | StringFieldRefInput<$PrismaModel>
    lte?: string | StringFieldRefInput<$PrismaModel>
    gt?: string | StringFieldRefInput<$PrismaModel>
    gte?: string | StringFieldRefInput<$PrismaModel>
    not?: NestedUuidNullableFilter<$PrismaModel> | string | null
  }

  export type NestedBoolWithAggregatesFilter<$PrismaModel = never> = {
    equals?: boolean | BooleanFieldRefInput<$PrismaModel>
    not?: NestedBoolWithAggregatesFilter<$PrismaModel> | boolean
    _count?: NestedIntFilter<$PrismaModel>
    _min?: NestedBoolFilter<$PrismaModel>
    _max?: NestedBoolFilter<$PrismaModel>
  }

  export type NestedUuidNullableWithAggregatesFilter<$PrismaModel = never> = {
    equals?: string | StringFieldRefInput<$PrismaModel> | null
    in?: string[] | ListStringFieldRefInput<$PrismaModel> | null
    notIn?: string[] | ListStringFieldRefInput<$PrismaModel> | null
    lt?: string | StringFieldRefInput<$PrismaModel>
    lte?: string | StringFieldRefInput<$PrismaModel>
    gt?: string | StringFieldRefInput<$PrismaModel>
    gte?: string | StringFieldRefInput<$PrismaModel>
    not?: NestedUuidNullableWithAggregatesFilter<$PrismaModel> | string | null
    _count?: NestedIntNullableFilter<$PrismaModel>
    _min?: NestedStringNullableFilter<$PrismaModel>
    _max?: NestedStringNullableFilter<$PrismaModel>
  }

  export type NestedIntWithAggregatesFilter<$PrismaModel = never> = {
    equals?: number | IntFieldRefInput<$PrismaModel>
    in?: number[] | ListIntFieldRefInput<$PrismaModel>
    notIn?: number[] | ListIntFieldRefInput<$PrismaModel>
    lt?: number | IntFieldRefInput<$PrismaModel>
    lte?: number | IntFieldRefInput<$PrismaModel>
    gt?: number | IntFieldRefInput<$PrismaModel>
    gte?: number | IntFieldRefInput<$PrismaModel>
    not?: NestedIntWithAggregatesFilter<$PrismaModel> | number
    _count?: NestedIntFilter<$PrismaModel>
    _avg?: NestedFloatFilter<$PrismaModel>
    _sum?: NestedIntFilter<$PrismaModel>
    _min?: NestedIntFilter<$PrismaModel>
    _max?: NestedIntFilter<$PrismaModel>
  }

  export type NestedFloatFilter<$PrismaModel = never> = {
    equals?: number | FloatFieldRefInput<$PrismaModel>
    in?: number[] | ListFloatFieldRefInput<$PrismaModel>
    notIn?: number[] | ListFloatFieldRefInput<$PrismaModel>
    lt?: number | FloatFieldRefInput<$PrismaModel>
    lte?: number | FloatFieldRefInput<$PrismaModel>
    gt?: number | FloatFieldRefInput<$PrismaModel>
    gte?: number | FloatFieldRefInput<$PrismaModel>
    not?: NestedFloatFilter<$PrismaModel> | number
  }
  export type NestedJsonNullableFilter<$PrismaModel = never> =
    | PatchUndefined<
        Either<Required<NestedJsonNullableFilterBase<$PrismaModel>>, Exclude<keyof Required<NestedJsonNullableFilterBase<$PrismaModel>>, 'path'>>,
        Required<NestedJsonNullableFilterBase<$PrismaModel>>
      >
    | OptionalFlat<Omit<Required<NestedJsonNullableFilterBase<$PrismaModel>>, 'path'>>

  export type NestedJsonNullableFilterBase<$PrismaModel = never> = {
    equals?: InputJsonValue | JsonFieldRefInput<$PrismaModel> | JsonNullValueFilter
    path?: string[]
    mode?: QueryMode | EnumQueryModeFieldRefInput<$PrismaModel>
    string_contains?: string | StringFieldRefInput<$PrismaModel>
    string_starts_with?: string | StringFieldRefInput<$PrismaModel>
    string_ends_with?: string | StringFieldRefInput<$PrismaModel>
    array_starts_with?: InputJsonValue | JsonFieldRefInput<$PrismaModel> | null
    array_ends_with?: InputJsonValue | JsonFieldRefInput<$PrismaModel> | null
    array_contains?: InputJsonValue | JsonFieldRefInput<$PrismaModel> | null
    lt?: InputJsonValue | JsonFieldRefInput<$PrismaModel>
    lte?: InputJsonValue | JsonFieldRefInput<$PrismaModel>
    gt?: InputJsonValue | JsonFieldRefInput<$PrismaModel>
    gte?: InputJsonValue | JsonFieldRefInput<$PrismaModel>
    not?: InputJsonValue | JsonFieldRefInput<$PrismaModel> | JsonNullValueFilter
  }

  export type WorkspaceCreateWithoutCreatorInput = {
    id?: string
    name: string
    slug: string
    description?: string | null
    materializedPath?: string
    status?: string
    archivedAt?: Date | string | null
    version?: number
    createdAt?: Date | string
    updatedAt?: Date | string
    parent?: WorkspaceCreateNestedOneWithoutChildrenInput
    children?: WorkspaceCreateNestedManyWithoutParentInput
    template?: WorkspaceTemplateCreateNestedOneWithoutWorkspacesInput
    members?: WorkspaceMemberCreateNestedManyWithoutWorkspaceInput
    invitations?: InvitationCreateNestedManyWithoutWorkspaceInput
    roleActions?: WorkspaceRoleActionCreateNestedManyWithoutWorkspaceInput
  }

  export type WorkspaceUncheckedCreateWithoutCreatorInput = {
    id?: string
    name: string
    slug: string
    description?: string | null
    parentId?: string | null
    materializedPath?: string
    status?: string
    archivedAt?: Date | string | null
    templateId?: string | null
    version?: number
    createdAt?: Date | string
    updatedAt?: Date | string
    children?: WorkspaceUncheckedCreateNestedManyWithoutParentInput
    members?: WorkspaceMemberUncheckedCreateNestedManyWithoutWorkspaceInput
    invitations?: InvitationUncheckedCreateNestedManyWithoutWorkspaceInput
    roleActions?: WorkspaceRoleActionUncheckedCreateNestedManyWithoutWorkspaceInput
  }

  export type WorkspaceCreateOrConnectWithoutCreatorInput = {
    where: WorkspaceWhereUniqueInput
    create: XOR<WorkspaceCreateWithoutCreatorInput, WorkspaceUncheckedCreateWithoutCreatorInput>
  }

  export type WorkspaceCreateManyCreatorInputEnvelope = {
    data: WorkspaceCreateManyCreatorInput | WorkspaceCreateManyCreatorInput[]
    skipDuplicates?: boolean
  }

  export type WorkspaceMemberCreateWithoutUserInput = {
    id?: string
    role: string
    createdAt?: Date | string
    workspace: WorkspaceCreateNestedOneWithoutMembersInput
  }

  export type WorkspaceMemberUncheckedCreateWithoutUserInput = {
    id?: string
    workspaceId: string
    role: string
    createdAt?: Date | string
  }

  export type WorkspaceMemberCreateOrConnectWithoutUserInput = {
    where: WorkspaceMemberWhereUniqueInput
    create: XOR<WorkspaceMemberCreateWithoutUserInput, WorkspaceMemberUncheckedCreateWithoutUserInput>
  }

  export type WorkspaceMemberCreateManyUserInputEnvelope = {
    data: WorkspaceMemberCreateManyUserInput | WorkspaceMemberCreateManyUserInput[]
    skipDuplicates?: boolean
  }

  export type InvitationCreateWithoutInviterInput = {
    id?: string
    email: string
    role: string
    status?: string
    token: string
    expiresAt: Date | string
    acceptedAt?: Date | string | null
    createdAt?: Date | string
    workspace: WorkspaceCreateNestedOneWithoutInvitationsInput
  }

  export type InvitationUncheckedCreateWithoutInviterInput = {
    id?: string
    email: string
    workspaceId: string
    role: string
    status?: string
    token: string
    expiresAt: Date | string
    acceptedAt?: Date | string | null
    createdAt?: Date | string
  }

  export type InvitationCreateOrConnectWithoutInviterInput = {
    where: InvitationWhereUniqueInput
    create: XOR<InvitationCreateWithoutInviterInput, InvitationUncheckedCreateWithoutInviterInput>
  }

  export type InvitationCreateManyInviterInputEnvelope = {
    data: InvitationCreateManyInviterInput | InvitationCreateManyInviterInput[]
    skipDuplicates?: boolean
  }

  export type WorkspaceUpsertWithWhereUniqueWithoutCreatorInput = {
    where: WorkspaceWhereUniqueInput
    update: XOR<WorkspaceUpdateWithoutCreatorInput, WorkspaceUncheckedUpdateWithoutCreatorInput>
    create: XOR<WorkspaceCreateWithoutCreatorInput, WorkspaceUncheckedCreateWithoutCreatorInput>
  }

  export type WorkspaceUpdateWithWhereUniqueWithoutCreatorInput = {
    where: WorkspaceWhereUniqueInput
    data: XOR<WorkspaceUpdateWithoutCreatorInput, WorkspaceUncheckedUpdateWithoutCreatorInput>
  }

  export type WorkspaceUpdateManyWithWhereWithoutCreatorInput = {
    where: WorkspaceScalarWhereInput
    data: XOR<WorkspaceUpdateManyMutationInput, WorkspaceUncheckedUpdateManyWithoutCreatorInput>
  }

  export type WorkspaceScalarWhereInput = {
    AND?: WorkspaceScalarWhereInput | WorkspaceScalarWhereInput[]
    OR?: WorkspaceScalarWhereInput[]
    NOT?: WorkspaceScalarWhereInput | WorkspaceScalarWhereInput[]
    id?: UuidFilter<"Workspace"> | string
    name?: StringFilter<"Workspace"> | string
    slug?: StringFilter<"Workspace"> | string
    description?: StringNullableFilter<"Workspace"> | string | null
    parentId?: UuidNullableFilter<"Workspace"> | string | null
    materializedPath?: StringFilter<"Workspace"> | string
    status?: StringFilter<"Workspace"> | string
    archivedAt?: DateTimeNullableFilter<"Workspace"> | Date | string | null
    templateId?: UuidNullableFilter<"Workspace"> | string | null
    createdBy?: UuidFilter<"Workspace"> | string
    version?: IntFilter<"Workspace"> | number
    createdAt?: DateTimeFilter<"Workspace"> | Date | string
    updatedAt?: DateTimeFilter<"Workspace"> | Date | string
  }

  export type WorkspaceMemberUpsertWithWhereUniqueWithoutUserInput = {
    where: WorkspaceMemberWhereUniqueInput
    update: XOR<WorkspaceMemberUpdateWithoutUserInput, WorkspaceMemberUncheckedUpdateWithoutUserInput>
    create: XOR<WorkspaceMemberCreateWithoutUserInput, WorkspaceMemberUncheckedCreateWithoutUserInput>
  }

  export type WorkspaceMemberUpdateWithWhereUniqueWithoutUserInput = {
    where: WorkspaceMemberWhereUniqueInput
    data: XOR<WorkspaceMemberUpdateWithoutUserInput, WorkspaceMemberUncheckedUpdateWithoutUserInput>
  }

  export type WorkspaceMemberUpdateManyWithWhereWithoutUserInput = {
    where: WorkspaceMemberScalarWhereInput
    data: XOR<WorkspaceMemberUpdateManyMutationInput, WorkspaceMemberUncheckedUpdateManyWithoutUserInput>
  }

  export type WorkspaceMemberScalarWhereInput = {
    AND?: WorkspaceMemberScalarWhereInput | WorkspaceMemberScalarWhereInput[]
    OR?: WorkspaceMemberScalarWhereInput[]
    NOT?: WorkspaceMemberScalarWhereInput | WorkspaceMemberScalarWhereInput[]
    id?: UuidFilter<"WorkspaceMember"> | string
    workspaceId?: UuidFilter<"WorkspaceMember"> | string
    userId?: UuidFilter<"WorkspaceMember"> | string
    role?: StringFilter<"WorkspaceMember"> | string
    createdAt?: DateTimeFilter<"WorkspaceMember"> | Date | string
  }

  export type InvitationUpsertWithWhereUniqueWithoutInviterInput = {
    where: InvitationWhereUniqueInput
    update: XOR<InvitationUpdateWithoutInviterInput, InvitationUncheckedUpdateWithoutInviterInput>
    create: XOR<InvitationCreateWithoutInviterInput, InvitationUncheckedCreateWithoutInviterInput>
  }

  export type InvitationUpdateWithWhereUniqueWithoutInviterInput = {
    where: InvitationWhereUniqueInput
    data: XOR<InvitationUpdateWithoutInviterInput, InvitationUncheckedUpdateWithoutInviterInput>
  }

  export type InvitationUpdateManyWithWhereWithoutInviterInput = {
    where: InvitationScalarWhereInput
    data: XOR<InvitationUpdateManyMutationInput, InvitationUncheckedUpdateManyWithoutInviterInput>
  }

  export type InvitationScalarWhereInput = {
    AND?: InvitationScalarWhereInput | InvitationScalarWhereInput[]
    OR?: InvitationScalarWhereInput[]
    NOT?: InvitationScalarWhereInput | InvitationScalarWhereInput[]
    id?: UuidFilter<"Invitation"> | string
    email?: StringFilter<"Invitation"> | string
    workspaceId?: UuidFilter<"Invitation"> | string
    role?: StringFilter<"Invitation"> | string
    status?: StringFilter<"Invitation"> | string
    invitedBy?: UuidFilter<"Invitation"> | string
    token?: StringFilter<"Invitation"> | string
    expiresAt?: DateTimeFilter<"Invitation"> | Date | string
    acceptedAt?: DateTimeNullableFilter<"Invitation"> | Date | string | null
    createdAt?: DateTimeFilter<"Invitation"> | Date | string
  }

  export type WorkspaceCreateWithoutTemplateInput = {
    id?: string
    name: string
    slug: string
    description?: string | null
    materializedPath?: string
    status?: string
    archivedAt?: Date | string | null
    version?: number
    createdAt?: Date | string
    updatedAt?: Date | string
    parent?: WorkspaceCreateNestedOneWithoutChildrenInput
    children?: WorkspaceCreateNestedManyWithoutParentInput
    creator: UserProfileCreateNestedOneWithoutWorkspacesCreatedInput
    members?: WorkspaceMemberCreateNestedManyWithoutWorkspaceInput
    invitations?: InvitationCreateNestedManyWithoutWorkspaceInput
    roleActions?: WorkspaceRoleActionCreateNestedManyWithoutWorkspaceInput
  }

  export type WorkspaceUncheckedCreateWithoutTemplateInput = {
    id?: string
    name: string
    slug: string
    description?: string | null
    parentId?: string | null
    materializedPath?: string
    status?: string
    archivedAt?: Date | string | null
    createdBy: string
    version?: number
    createdAt?: Date | string
    updatedAt?: Date | string
    children?: WorkspaceUncheckedCreateNestedManyWithoutParentInput
    members?: WorkspaceMemberUncheckedCreateNestedManyWithoutWorkspaceInput
    invitations?: InvitationUncheckedCreateNestedManyWithoutWorkspaceInput
    roleActions?: WorkspaceRoleActionUncheckedCreateNestedManyWithoutWorkspaceInput
  }

  export type WorkspaceCreateOrConnectWithoutTemplateInput = {
    where: WorkspaceWhereUniqueInput
    create: XOR<WorkspaceCreateWithoutTemplateInput, WorkspaceUncheckedCreateWithoutTemplateInput>
  }

  export type WorkspaceCreateManyTemplateInputEnvelope = {
    data: WorkspaceCreateManyTemplateInput | WorkspaceCreateManyTemplateInput[]
    skipDuplicates?: boolean
  }

  export type WorkspaceUpsertWithWhereUniqueWithoutTemplateInput = {
    where: WorkspaceWhereUniqueInput
    update: XOR<WorkspaceUpdateWithoutTemplateInput, WorkspaceUncheckedUpdateWithoutTemplateInput>
    create: XOR<WorkspaceCreateWithoutTemplateInput, WorkspaceUncheckedCreateWithoutTemplateInput>
  }

  export type WorkspaceUpdateWithWhereUniqueWithoutTemplateInput = {
    where: WorkspaceWhereUniqueInput
    data: XOR<WorkspaceUpdateWithoutTemplateInput, WorkspaceUncheckedUpdateWithoutTemplateInput>
  }

  export type WorkspaceUpdateManyWithWhereWithoutTemplateInput = {
    where: WorkspaceScalarWhereInput
    data: XOR<WorkspaceUpdateManyMutationInput, WorkspaceUncheckedUpdateManyWithoutTemplateInput>
  }

  export type WorkspaceCreateWithoutChildrenInput = {
    id?: string
    name: string
    slug: string
    description?: string | null
    materializedPath?: string
    status?: string
    archivedAt?: Date | string | null
    version?: number
    createdAt?: Date | string
    updatedAt?: Date | string
    parent?: WorkspaceCreateNestedOneWithoutChildrenInput
    template?: WorkspaceTemplateCreateNestedOneWithoutWorkspacesInput
    creator: UserProfileCreateNestedOneWithoutWorkspacesCreatedInput
    members?: WorkspaceMemberCreateNestedManyWithoutWorkspaceInput
    invitations?: InvitationCreateNestedManyWithoutWorkspaceInput
    roleActions?: WorkspaceRoleActionCreateNestedManyWithoutWorkspaceInput
  }

  export type WorkspaceUncheckedCreateWithoutChildrenInput = {
    id?: string
    name: string
    slug: string
    description?: string | null
    parentId?: string | null
    materializedPath?: string
    status?: string
    archivedAt?: Date | string | null
    templateId?: string | null
    createdBy: string
    version?: number
    createdAt?: Date | string
    updatedAt?: Date | string
    members?: WorkspaceMemberUncheckedCreateNestedManyWithoutWorkspaceInput
    invitations?: InvitationUncheckedCreateNestedManyWithoutWorkspaceInput
    roleActions?: WorkspaceRoleActionUncheckedCreateNestedManyWithoutWorkspaceInput
  }

  export type WorkspaceCreateOrConnectWithoutChildrenInput = {
    where: WorkspaceWhereUniqueInput
    create: XOR<WorkspaceCreateWithoutChildrenInput, WorkspaceUncheckedCreateWithoutChildrenInput>
  }

  export type WorkspaceCreateWithoutParentInput = {
    id?: string
    name: string
    slug: string
    description?: string | null
    materializedPath?: string
    status?: string
    archivedAt?: Date | string | null
    version?: number
    createdAt?: Date | string
    updatedAt?: Date | string
    children?: WorkspaceCreateNestedManyWithoutParentInput
    template?: WorkspaceTemplateCreateNestedOneWithoutWorkspacesInput
    creator: UserProfileCreateNestedOneWithoutWorkspacesCreatedInput
    members?: WorkspaceMemberCreateNestedManyWithoutWorkspaceInput
    invitations?: InvitationCreateNestedManyWithoutWorkspaceInput
    roleActions?: WorkspaceRoleActionCreateNestedManyWithoutWorkspaceInput
  }

  export type WorkspaceUncheckedCreateWithoutParentInput = {
    id?: string
    name: string
    slug: string
    description?: string | null
    materializedPath?: string
    status?: string
    archivedAt?: Date | string | null
    templateId?: string | null
    createdBy: string
    version?: number
    createdAt?: Date | string
    updatedAt?: Date | string
    children?: WorkspaceUncheckedCreateNestedManyWithoutParentInput
    members?: WorkspaceMemberUncheckedCreateNestedManyWithoutWorkspaceInput
    invitations?: InvitationUncheckedCreateNestedManyWithoutWorkspaceInput
    roleActions?: WorkspaceRoleActionUncheckedCreateNestedManyWithoutWorkspaceInput
  }

  export type WorkspaceCreateOrConnectWithoutParentInput = {
    where: WorkspaceWhereUniqueInput
    create: XOR<WorkspaceCreateWithoutParentInput, WorkspaceUncheckedCreateWithoutParentInput>
  }

  export type WorkspaceCreateManyParentInputEnvelope = {
    data: WorkspaceCreateManyParentInput | WorkspaceCreateManyParentInput[]
    skipDuplicates?: boolean
  }

  export type WorkspaceTemplateCreateWithoutWorkspacesInput = {
    id?: string
    name: string
    description?: string | null
    structure?: JsonNullValueInput | InputJsonValue
    isBuiltin?: boolean
    createdBy?: string | null
    version?: number
    createdAt?: Date | string
    updatedAt?: Date | string
  }

  export type WorkspaceTemplateUncheckedCreateWithoutWorkspacesInput = {
    id?: string
    name: string
    description?: string | null
    structure?: JsonNullValueInput | InputJsonValue
    isBuiltin?: boolean
    createdBy?: string | null
    version?: number
    createdAt?: Date | string
    updatedAt?: Date | string
  }

  export type WorkspaceTemplateCreateOrConnectWithoutWorkspacesInput = {
    where: WorkspaceTemplateWhereUniqueInput
    create: XOR<WorkspaceTemplateCreateWithoutWorkspacesInput, WorkspaceTemplateUncheckedCreateWithoutWorkspacesInput>
  }

  export type UserProfileCreateWithoutWorkspacesCreatedInput = {
    userId: string
    keycloakUserId: string
    email: string
    displayName?: string | null
    avatarPath?: string | null
    timezone?: string
    language?: string
    notificationPrefs?: JsonNullValueInput | InputJsonValue
    status?: string
    deletedAt?: Date | string | null
    createdAt?: Date | string
    updatedAt?: Date | string
    workspaceMembers?: WorkspaceMemberCreateNestedManyWithoutUserInput
    invitationsSent?: InvitationCreateNestedManyWithoutInviterInput
  }

  export type UserProfileUncheckedCreateWithoutWorkspacesCreatedInput = {
    userId: string
    keycloakUserId: string
    email: string
    displayName?: string | null
    avatarPath?: string | null
    timezone?: string
    language?: string
    notificationPrefs?: JsonNullValueInput | InputJsonValue
    status?: string
    deletedAt?: Date | string | null
    createdAt?: Date | string
    updatedAt?: Date | string
    workspaceMembers?: WorkspaceMemberUncheckedCreateNestedManyWithoutUserInput
    invitationsSent?: InvitationUncheckedCreateNestedManyWithoutInviterInput
  }

  export type UserProfileCreateOrConnectWithoutWorkspacesCreatedInput = {
    where: UserProfileWhereUniqueInput
    create: XOR<UserProfileCreateWithoutWorkspacesCreatedInput, UserProfileUncheckedCreateWithoutWorkspacesCreatedInput>
  }

  export type WorkspaceMemberCreateWithoutWorkspaceInput = {
    id?: string
    role: string
    createdAt?: Date | string
    user: UserProfileCreateNestedOneWithoutWorkspaceMembersInput
  }

  export type WorkspaceMemberUncheckedCreateWithoutWorkspaceInput = {
    id?: string
    userId: string
    role: string
    createdAt?: Date | string
  }

  export type WorkspaceMemberCreateOrConnectWithoutWorkspaceInput = {
    where: WorkspaceMemberWhereUniqueInput
    create: XOR<WorkspaceMemberCreateWithoutWorkspaceInput, WorkspaceMemberUncheckedCreateWithoutWorkspaceInput>
  }

  export type WorkspaceMemberCreateManyWorkspaceInputEnvelope = {
    data: WorkspaceMemberCreateManyWorkspaceInput | WorkspaceMemberCreateManyWorkspaceInput[]
    skipDuplicates?: boolean
  }

  export type InvitationCreateWithoutWorkspaceInput = {
    id?: string
    email: string
    role: string
    status?: string
    token: string
    expiresAt: Date | string
    acceptedAt?: Date | string | null
    createdAt?: Date | string
    inviter: UserProfileCreateNestedOneWithoutInvitationsSentInput
  }

  export type InvitationUncheckedCreateWithoutWorkspaceInput = {
    id?: string
    email: string
    role: string
    status?: string
    invitedBy: string
    token: string
    expiresAt: Date | string
    acceptedAt?: Date | string | null
    createdAt?: Date | string
  }

  export type InvitationCreateOrConnectWithoutWorkspaceInput = {
    where: InvitationWhereUniqueInput
    create: XOR<InvitationCreateWithoutWorkspaceInput, InvitationUncheckedCreateWithoutWorkspaceInput>
  }

  export type InvitationCreateManyWorkspaceInputEnvelope = {
    data: InvitationCreateManyWorkspaceInput | InvitationCreateManyWorkspaceInput[]
    skipDuplicates?: boolean
  }

  export type WorkspaceRoleActionCreateWithoutWorkspaceInput = {
    id?: string
    pluginId: string
    actionKey: string
    requiredRole: string
    isOverridden?: boolean
    createdAt?: Date | string
    updatedAt?: Date | string
  }

  export type WorkspaceRoleActionUncheckedCreateWithoutWorkspaceInput = {
    id?: string
    pluginId: string
    actionKey: string
    requiredRole: string
    isOverridden?: boolean
    createdAt?: Date | string
    updatedAt?: Date | string
  }

  export type WorkspaceRoleActionCreateOrConnectWithoutWorkspaceInput = {
    where: WorkspaceRoleActionWhereUniqueInput
    create: XOR<WorkspaceRoleActionCreateWithoutWorkspaceInput, WorkspaceRoleActionUncheckedCreateWithoutWorkspaceInput>
  }

  export type WorkspaceRoleActionCreateManyWorkspaceInputEnvelope = {
    data: WorkspaceRoleActionCreateManyWorkspaceInput | WorkspaceRoleActionCreateManyWorkspaceInput[]
    skipDuplicates?: boolean
  }

  export type WorkspaceUpsertWithoutChildrenInput = {
    update: XOR<WorkspaceUpdateWithoutChildrenInput, WorkspaceUncheckedUpdateWithoutChildrenInput>
    create: XOR<WorkspaceCreateWithoutChildrenInput, WorkspaceUncheckedCreateWithoutChildrenInput>
    where?: WorkspaceWhereInput
  }

  export type WorkspaceUpdateToOneWithWhereWithoutChildrenInput = {
    where?: WorkspaceWhereInput
    data: XOR<WorkspaceUpdateWithoutChildrenInput, WorkspaceUncheckedUpdateWithoutChildrenInput>
  }

  export type WorkspaceUpdateWithoutChildrenInput = {
    id?: StringFieldUpdateOperationsInput | string
    name?: StringFieldUpdateOperationsInput | string
    slug?: StringFieldUpdateOperationsInput | string
    description?: NullableStringFieldUpdateOperationsInput | string | null
    materializedPath?: StringFieldUpdateOperationsInput | string
    status?: StringFieldUpdateOperationsInput | string
    archivedAt?: NullableDateTimeFieldUpdateOperationsInput | Date | string | null
    version?: IntFieldUpdateOperationsInput | number
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
    parent?: WorkspaceUpdateOneWithoutChildrenNestedInput
    template?: WorkspaceTemplateUpdateOneWithoutWorkspacesNestedInput
    creator?: UserProfileUpdateOneRequiredWithoutWorkspacesCreatedNestedInput
    members?: WorkspaceMemberUpdateManyWithoutWorkspaceNestedInput
    invitations?: InvitationUpdateManyWithoutWorkspaceNestedInput
    roleActions?: WorkspaceRoleActionUpdateManyWithoutWorkspaceNestedInput
  }

  export type WorkspaceUncheckedUpdateWithoutChildrenInput = {
    id?: StringFieldUpdateOperationsInput | string
    name?: StringFieldUpdateOperationsInput | string
    slug?: StringFieldUpdateOperationsInput | string
    description?: NullableStringFieldUpdateOperationsInput | string | null
    parentId?: NullableStringFieldUpdateOperationsInput | string | null
    materializedPath?: StringFieldUpdateOperationsInput | string
    status?: StringFieldUpdateOperationsInput | string
    archivedAt?: NullableDateTimeFieldUpdateOperationsInput | Date | string | null
    templateId?: NullableStringFieldUpdateOperationsInput | string | null
    createdBy?: StringFieldUpdateOperationsInput | string
    version?: IntFieldUpdateOperationsInput | number
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
    members?: WorkspaceMemberUncheckedUpdateManyWithoutWorkspaceNestedInput
    invitations?: InvitationUncheckedUpdateManyWithoutWorkspaceNestedInput
    roleActions?: WorkspaceRoleActionUncheckedUpdateManyWithoutWorkspaceNestedInput
  }

  export type WorkspaceUpsertWithWhereUniqueWithoutParentInput = {
    where: WorkspaceWhereUniqueInput
    update: XOR<WorkspaceUpdateWithoutParentInput, WorkspaceUncheckedUpdateWithoutParentInput>
    create: XOR<WorkspaceCreateWithoutParentInput, WorkspaceUncheckedCreateWithoutParentInput>
  }

  export type WorkspaceUpdateWithWhereUniqueWithoutParentInput = {
    where: WorkspaceWhereUniqueInput
    data: XOR<WorkspaceUpdateWithoutParentInput, WorkspaceUncheckedUpdateWithoutParentInput>
  }

  export type WorkspaceUpdateManyWithWhereWithoutParentInput = {
    where: WorkspaceScalarWhereInput
    data: XOR<WorkspaceUpdateManyMutationInput, WorkspaceUncheckedUpdateManyWithoutParentInput>
  }

  export type WorkspaceTemplateUpsertWithoutWorkspacesInput = {
    update: XOR<WorkspaceTemplateUpdateWithoutWorkspacesInput, WorkspaceTemplateUncheckedUpdateWithoutWorkspacesInput>
    create: XOR<WorkspaceTemplateCreateWithoutWorkspacesInput, WorkspaceTemplateUncheckedCreateWithoutWorkspacesInput>
    where?: WorkspaceTemplateWhereInput
  }

  export type WorkspaceTemplateUpdateToOneWithWhereWithoutWorkspacesInput = {
    where?: WorkspaceTemplateWhereInput
    data: XOR<WorkspaceTemplateUpdateWithoutWorkspacesInput, WorkspaceTemplateUncheckedUpdateWithoutWorkspacesInput>
  }

  export type WorkspaceTemplateUpdateWithoutWorkspacesInput = {
    id?: StringFieldUpdateOperationsInput | string
    name?: StringFieldUpdateOperationsInput | string
    description?: NullableStringFieldUpdateOperationsInput | string | null
    structure?: JsonNullValueInput | InputJsonValue
    isBuiltin?: BoolFieldUpdateOperationsInput | boolean
    createdBy?: NullableStringFieldUpdateOperationsInput | string | null
    version?: IntFieldUpdateOperationsInput | number
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
  }

  export type WorkspaceTemplateUncheckedUpdateWithoutWorkspacesInput = {
    id?: StringFieldUpdateOperationsInput | string
    name?: StringFieldUpdateOperationsInput | string
    description?: NullableStringFieldUpdateOperationsInput | string | null
    structure?: JsonNullValueInput | InputJsonValue
    isBuiltin?: BoolFieldUpdateOperationsInput | boolean
    createdBy?: NullableStringFieldUpdateOperationsInput | string | null
    version?: IntFieldUpdateOperationsInput | number
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
  }

  export type UserProfileUpsertWithoutWorkspacesCreatedInput = {
    update: XOR<UserProfileUpdateWithoutWorkspacesCreatedInput, UserProfileUncheckedUpdateWithoutWorkspacesCreatedInput>
    create: XOR<UserProfileCreateWithoutWorkspacesCreatedInput, UserProfileUncheckedCreateWithoutWorkspacesCreatedInput>
    where?: UserProfileWhereInput
  }

  export type UserProfileUpdateToOneWithWhereWithoutWorkspacesCreatedInput = {
    where?: UserProfileWhereInput
    data: XOR<UserProfileUpdateWithoutWorkspacesCreatedInput, UserProfileUncheckedUpdateWithoutWorkspacesCreatedInput>
  }

  export type UserProfileUpdateWithoutWorkspacesCreatedInput = {
    userId?: StringFieldUpdateOperationsInput | string
    keycloakUserId?: StringFieldUpdateOperationsInput | string
    email?: StringFieldUpdateOperationsInput | string
    displayName?: NullableStringFieldUpdateOperationsInput | string | null
    avatarPath?: NullableStringFieldUpdateOperationsInput | string | null
    timezone?: StringFieldUpdateOperationsInput | string
    language?: StringFieldUpdateOperationsInput | string
    notificationPrefs?: JsonNullValueInput | InputJsonValue
    status?: StringFieldUpdateOperationsInput | string
    deletedAt?: NullableDateTimeFieldUpdateOperationsInput | Date | string | null
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
    workspaceMembers?: WorkspaceMemberUpdateManyWithoutUserNestedInput
    invitationsSent?: InvitationUpdateManyWithoutInviterNestedInput
  }

  export type UserProfileUncheckedUpdateWithoutWorkspacesCreatedInput = {
    userId?: StringFieldUpdateOperationsInput | string
    keycloakUserId?: StringFieldUpdateOperationsInput | string
    email?: StringFieldUpdateOperationsInput | string
    displayName?: NullableStringFieldUpdateOperationsInput | string | null
    avatarPath?: NullableStringFieldUpdateOperationsInput | string | null
    timezone?: StringFieldUpdateOperationsInput | string
    language?: StringFieldUpdateOperationsInput | string
    notificationPrefs?: JsonNullValueInput | InputJsonValue
    status?: StringFieldUpdateOperationsInput | string
    deletedAt?: NullableDateTimeFieldUpdateOperationsInput | Date | string | null
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
    workspaceMembers?: WorkspaceMemberUncheckedUpdateManyWithoutUserNestedInput
    invitationsSent?: InvitationUncheckedUpdateManyWithoutInviterNestedInput
  }

  export type WorkspaceMemberUpsertWithWhereUniqueWithoutWorkspaceInput = {
    where: WorkspaceMemberWhereUniqueInput
    update: XOR<WorkspaceMemberUpdateWithoutWorkspaceInput, WorkspaceMemberUncheckedUpdateWithoutWorkspaceInput>
    create: XOR<WorkspaceMemberCreateWithoutWorkspaceInput, WorkspaceMemberUncheckedCreateWithoutWorkspaceInput>
  }

  export type WorkspaceMemberUpdateWithWhereUniqueWithoutWorkspaceInput = {
    where: WorkspaceMemberWhereUniqueInput
    data: XOR<WorkspaceMemberUpdateWithoutWorkspaceInput, WorkspaceMemberUncheckedUpdateWithoutWorkspaceInput>
  }

  export type WorkspaceMemberUpdateManyWithWhereWithoutWorkspaceInput = {
    where: WorkspaceMemberScalarWhereInput
    data: XOR<WorkspaceMemberUpdateManyMutationInput, WorkspaceMemberUncheckedUpdateManyWithoutWorkspaceInput>
  }

  export type InvitationUpsertWithWhereUniqueWithoutWorkspaceInput = {
    where: InvitationWhereUniqueInput
    update: XOR<InvitationUpdateWithoutWorkspaceInput, InvitationUncheckedUpdateWithoutWorkspaceInput>
    create: XOR<InvitationCreateWithoutWorkspaceInput, InvitationUncheckedCreateWithoutWorkspaceInput>
  }

  export type InvitationUpdateWithWhereUniqueWithoutWorkspaceInput = {
    where: InvitationWhereUniqueInput
    data: XOR<InvitationUpdateWithoutWorkspaceInput, InvitationUncheckedUpdateWithoutWorkspaceInput>
  }

  export type InvitationUpdateManyWithWhereWithoutWorkspaceInput = {
    where: InvitationScalarWhereInput
    data: XOR<InvitationUpdateManyMutationInput, InvitationUncheckedUpdateManyWithoutWorkspaceInput>
  }

  export type WorkspaceRoleActionUpsertWithWhereUniqueWithoutWorkspaceInput = {
    where: WorkspaceRoleActionWhereUniqueInput
    update: XOR<WorkspaceRoleActionUpdateWithoutWorkspaceInput, WorkspaceRoleActionUncheckedUpdateWithoutWorkspaceInput>
    create: XOR<WorkspaceRoleActionCreateWithoutWorkspaceInput, WorkspaceRoleActionUncheckedCreateWithoutWorkspaceInput>
  }

  export type WorkspaceRoleActionUpdateWithWhereUniqueWithoutWorkspaceInput = {
    where: WorkspaceRoleActionWhereUniqueInput
    data: XOR<WorkspaceRoleActionUpdateWithoutWorkspaceInput, WorkspaceRoleActionUncheckedUpdateWithoutWorkspaceInput>
  }

  export type WorkspaceRoleActionUpdateManyWithWhereWithoutWorkspaceInput = {
    where: WorkspaceRoleActionScalarWhereInput
    data: XOR<WorkspaceRoleActionUpdateManyMutationInput, WorkspaceRoleActionUncheckedUpdateManyWithoutWorkspaceInput>
  }

  export type WorkspaceRoleActionScalarWhereInput = {
    AND?: WorkspaceRoleActionScalarWhereInput | WorkspaceRoleActionScalarWhereInput[]
    OR?: WorkspaceRoleActionScalarWhereInput[]
    NOT?: WorkspaceRoleActionScalarWhereInput | WorkspaceRoleActionScalarWhereInput[]
    id?: UuidFilter<"WorkspaceRoleAction"> | string
    workspaceId?: UuidFilter<"WorkspaceRoleAction"> | string
    pluginId?: UuidFilter<"WorkspaceRoleAction"> | string
    actionKey?: StringFilter<"WorkspaceRoleAction"> | string
    requiredRole?: StringFilter<"WorkspaceRoleAction"> | string
    isOverridden?: BoolFilter<"WorkspaceRoleAction"> | boolean
    createdAt?: DateTimeFilter<"WorkspaceRoleAction"> | Date | string
    updatedAt?: DateTimeFilter<"WorkspaceRoleAction"> | Date | string
  }

  export type WorkspaceCreateWithoutMembersInput = {
    id?: string
    name: string
    slug: string
    description?: string | null
    materializedPath?: string
    status?: string
    archivedAt?: Date | string | null
    version?: number
    createdAt?: Date | string
    updatedAt?: Date | string
    parent?: WorkspaceCreateNestedOneWithoutChildrenInput
    children?: WorkspaceCreateNestedManyWithoutParentInput
    template?: WorkspaceTemplateCreateNestedOneWithoutWorkspacesInput
    creator: UserProfileCreateNestedOneWithoutWorkspacesCreatedInput
    invitations?: InvitationCreateNestedManyWithoutWorkspaceInput
    roleActions?: WorkspaceRoleActionCreateNestedManyWithoutWorkspaceInput
  }

  export type WorkspaceUncheckedCreateWithoutMembersInput = {
    id?: string
    name: string
    slug: string
    description?: string | null
    parentId?: string | null
    materializedPath?: string
    status?: string
    archivedAt?: Date | string | null
    templateId?: string | null
    createdBy: string
    version?: number
    createdAt?: Date | string
    updatedAt?: Date | string
    children?: WorkspaceUncheckedCreateNestedManyWithoutParentInput
    invitations?: InvitationUncheckedCreateNestedManyWithoutWorkspaceInput
    roleActions?: WorkspaceRoleActionUncheckedCreateNestedManyWithoutWorkspaceInput
  }

  export type WorkspaceCreateOrConnectWithoutMembersInput = {
    where: WorkspaceWhereUniqueInput
    create: XOR<WorkspaceCreateWithoutMembersInput, WorkspaceUncheckedCreateWithoutMembersInput>
  }

  export type UserProfileCreateWithoutWorkspaceMembersInput = {
    userId: string
    keycloakUserId: string
    email: string
    displayName?: string | null
    avatarPath?: string | null
    timezone?: string
    language?: string
    notificationPrefs?: JsonNullValueInput | InputJsonValue
    status?: string
    deletedAt?: Date | string | null
    createdAt?: Date | string
    updatedAt?: Date | string
    workspacesCreated?: WorkspaceCreateNestedManyWithoutCreatorInput
    invitationsSent?: InvitationCreateNestedManyWithoutInviterInput
  }

  export type UserProfileUncheckedCreateWithoutWorkspaceMembersInput = {
    userId: string
    keycloakUserId: string
    email: string
    displayName?: string | null
    avatarPath?: string | null
    timezone?: string
    language?: string
    notificationPrefs?: JsonNullValueInput | InputJsonValue
    status?: string
    deletedAt?: Date | string | null
    createdAt?: Date | string
    updatedAt?: Date | string
    workspacesCreated?: WorkspaceUncheckedCreateNestedManyWithoutCreatorInput
    invitationsSent?: InvitationUncheckedCreateNestedManyWithoutInviterInput
  }

  export type UserProfileCreateOrConnectWithoutWorkspaceMembersInput = {
    where: UserProfileWhereUniqueInput
    create: XOR<UserProfileCreateWithoutWorkspaceMembersInput, UserProfileUncheckedCreateWithoutWorkspaceMembersInput>
  }

  export type WorkspaceUpsertWithoutMembersInput = {
    update: XOR<WorkspaceUpdateWithoutMembersInput, WorkspaceUncheckedUpdateWithoutMembersInput>
    create: XOR<WorkspaceCreateWithoutMembersInput, WorkspaceUncheckedCreateWithoutMembersInput>
    where?: WorkspaceWhereInput
  }

  export type WorkspaceUpdateToOneWithWhereWithoutMembersInput = {
    where?: WorkspaceWhereInput
    data: XOR<WorkspaceUpdateWithoutMembersInput, WorkspaceUncheckedUpdateWithoutMembersInput>
  }

  export type WorkspaceUpdateWithoutMembersInput = {
    id?: StringFieldUpdateOperationsInput | string
    name?: StringFieldUpdateOperationsInput | string
    slug?: StringFieldUpdateOperationsInput | string
    description?: NullableStringFieldUpdateOperationsInput | string | null
    materializedPath?: StringFieldUpdateOperationsInput | string
    status?: StringFieldUpdateOperationsInput | string
    archivedAt?: NullableDateTimeFieldUpdateOperationsInput | Date | string | null
    version?: IntFieldUpdateOperationsInput | number
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
    parent?: WorkspaceUpdateOneWithoutChildrenNestedInput
    children?: WorkspaceUpdateManyWithoutParentNestedInput
    template?: WorkspaceTemplateUpdateOneWithoutWorkspacesNestedInput
    creator?: UserProfileUpdateOneRequiredWithoutWorkspacesCreatedNestedInput
    invitations?: InvitationUpdateManyWithoutWorkspaceNestedInput
    roleActions?: WorkspaceRoleActionUpdateManyWithoutWorkspaceNestedInput
  }

  export type WorkspaceUncheckedUpdateWithoutMembersInput = {
    id?: StringFieldUpdateOperationsInput | string
    name?: StringFieldUpdateOperationsInput | string
    slug?: StringFieldUpdateOperationsInput | string
    description?: NullableStringFieldUpdateOperationsInput | string | null
    parentId?: NullableStringFieldUpdateOperationsInput | string | null
    materializedPath?: StringFieldUpdateOperationsInput | string
    status?: StringFieldUpdateOperationsInput | string
    archivedAt?: NullableDateTimeFieldUpdateOperationsInput | Date | string | null
    templateId?: NullableStringFieldUpdateOperationsInput | string | null
    createdBy?: StringFieldUpdateOperationsInput | string
    version?: IntFieldUpdateOperationsInput | number
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
    children?: WorkspaceUncheckedUpdateManyWithoutParentNestedInput
    invitations?: InvitationUncheckedUpdateManyWithoutWorkspaceNestedInput
    roleActions?: WorkspaceRoleActionUncheckedUpdateManyWithoutWorkspaceNestedInput
  }

  export type UserProfileUpsertWithoutWorkspaceMembersInput = {
    update: XOR<UserProfileUpdateWithoutWorkspaceMembersInput, UserProfileUncheckedUpdateWithoutWorkspaceMembersInput>
    create: XOR<UserProfileCreateWithoutWorkspaceMembersInput, UserProfileUncheckedCreateWithoutWorkspaceMembersInput>
    where?: UserProfileWhereInput
  }

  export type UserProfileUpdateToOneWithWhereWithoutWorkspaceMembersInput = {
    where?: UserProfileWhereInput
    data: XOR<UserProfileUpdateWithoutWorkspaceMembersInput, UserProfileUncheckedUpdateWithoutWorkspaceMembersInput>
  }

  export type UserProfileUpdateWithoutWorkspaceMembersInput = {
    userId?: StringFieldUpdateOperationsInput | string
    keycloakUserId?: StringFieldUpdateOperationsInput | string
    email?: StringFieldUpdateOperationsInput | string
    displayName?: NullableStringFieldUpdateOperationsInput | string | null
    avatarPath?: NullableStringFieldUpdateOperationsInput | string | null
    timezone?: StringFieldUpdateOperationsInput | string
    language?: StringFieldUpdateOperationsInput | string
    notificationPrefs?: JsonNullValueInput | InputJsonValue
    status?: StringFieldUpdateOperationsInput | string
    deletedAt?: NullableDateTimeFieldUpdateOperationsInput | Date | string | null
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
    workspacesCreated?: WorkspaceUpdateManyWithoutCreatorNestedInput
    invitationsSent?: InvitationUpdateManyWithoutInviterNestedInput
  }

  export type UserProfileUncheckedUpdateWithoutWorkspaceMembersInput = {
    userId?: StringFieldUpdateOperationsInput | string
    keycloakUserId?: StringFieldUpdateOperationsInput | string
    email?: StringFieldUpdateOperationsInput | string
    displayName?: NullableStringFieldUpdateOperationsInput | string | null
    avatarPath?: NullableStringFieldUpdateOperationsInput | string | null
    timezone?: StringFieldUpdateOperationsInput | string
    language?: StringFieldUpdateOperationsInput | string
    notificationPrefs?: JsonNullValueInput | InputJsonValue
    status?: StringFieldUpdateOperationsInput | string
    deletedAt?: NullableDateTimeFieldUpdateOperationsInput | Date | string | null
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
    workspacesCreated?: WorkspaceUncheckedUpdateManyWithoutCreatorNestedInput
    invitationsSent?: InvitationUncheckedUpdateManyWithoutInviterNestedInput
  }

  export type WorkspaceCreateWithoutInvitationsInput = {
    id?: string
    name: string
    slug: string
    description?: string | null
    materializedPath?: string
    status?: string
    archivedAt?: Date | string | null
    version?: number
    createdAt?: Date | string
    updatedAt?: Date | string
    parent?: WorkspaceCreateNestedOneWithoutChildrenInput
    children?: WorkspaceCreateNestedManyWithoutParentInput
    template?: WorkspaceTemplateCreateNestedOneWithoutWorkspacesInput
    creator: UserProfileCreateNestedOneWithoutWorkspacesCreatedInput
    members?: WorkspaceMemberCreateNestedManyWithoutWorkspaceInput
    roleActions?: WorkspaceRoleActionCreateNestedManyWithoutWorkspaceInput
  }

  export type WorkspaceUncheckedCreateWithoutInvitationsInput = {
    id?: string
    name: string
    slug: string
    description?: string | null
    parentId?: string | null
    materializedPath?: string
    status?: string
    archivedAt?: Date | string | null
    templateId?: string | null
    createdBy: string
    version?: number
    createdAt?: Date | string
    updatedAt?: Date | string
    children?: WorkspaceUncheckedCreateNestedManyWithoutParentInput
    members?: WorkspaceMemberUncheckedCreateNestedManyWithoutWorkspaceInput
    roleActions?: WorkspaceRoleActionUncheckedCreateNestedManyWithoutWorkspaceInput
  }

  export type WorkspaceCreateOrConnectWithoutInvitationsInput = {
    where: WorkspaceWhereUniqueInput
    create: XOR<WorkspaceCreateWithoutInvitationsInput, WorkspaceUncheckedCreateWithoutInvitationsInput>
  }

  export type UserProfileCreateWithoutInvitationsSentInput = {
    userId: string
    keycloakUserId: string
    email: string
    displayName?: string | null
    avatarPath?: string | null
    timezone?: string
    language?: string
    notificationPrefs?: JsonNullValueInput | InputJsonValue
    status?: string
    deletedAt?: Date | string | null
    createdAt?: Date | string
    updatedAt?: Date | string
    workspacesCreated?: WorkspaceCreateNestedManyWithoutCreatorInput
    workspaceMembers?: WorkspaceMemberCreateNestedManyWithoutUserInput
  }

  export type UserProfileUncheckedCreateWithoutInvitationsSentInput = {
    userId: string
    keycloakUserId: string
    email: string
    displayName?: string | null
    avatarPath?: string | null
    timezone?: string
    language?: string
    notificationPrefs?: JsonNullValueInput | InputJsonValue
    status?: string
    deletedAt?: Date | string | null
    createdAt?: Date | string
    updatedAt?: Date | string
    workspacesCreated?: WorkspaceUncheckedCreateNestedManyWithoutCreatorInput
    workspaceMembers?: WorkspaceMemberUncheckedCreateNestedManyWithoutUserInput
  }

  export type UserProfileCreateOrConnectWithoutInvitationsSentInput = {
    where: UserProfileWhereUniqueInput
    create: XOR<UserProfileCreateWithoutInvitationsSentInput, UserProfileUncheckedCreateWithoutInvitationsSentInput>
  }

  export type WorkspaceUpsertWithoutInvitationsInput = {
    update: XOR<WorkspaceUpdateWithoutInvitationsInput, WorkspaceUncheckedUpdateWithoutInvitationsInput>
    create: XOR<WorkspaceCreateWithoutInvitationsInput, WorkspaceUncheckedCreateWithoutInvitationsInput>
    where?: WorkspaceWhereInput
  }

  export type WorkspaceUpdateToOneWithWhereWithoutInvitationsInput = {
    where?: WorkspaceWhereInput
    data: XOR<WorkspaceUpdateWithoutInvitationsInput, WorkspaceUncheckedUpdateWithoutInvitationsInput>
  }

  export type WorkspaceUpdateWithoutInvitationsInput = {
    id?: StringFieldUpdateOperationsInput | string
    name?: StringFieldUpdateOperationsInput | string
    slug?: StringFieldUpdateOperationsInput | string
    description?: NullableStringFieldUpdateOperationsInput | string | null
    materializedPath?: StringFieldUpdateOperationsInput | string
    status?: StringFieldUpdateOperationsInput | string
    archivedAt?: NullableDateTimeFieldUpdateOperationsInput | Date | string | null
    version?: IntFieldUpdateOperationsInput | number
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
    parent?: WorkspaceUpdateOneWithoutChildrenNestedInput
    children?: WorkspaceUpdateManyWithoutParentNestedInput
    template?: WorkspaceTemplateUpdateOneWithoutWorkspacesNestedInput
    creator?: UserProfileUpdateOneRequiredWithoutWorkspacesCreatedNestedInput
    members?: WorkspaceMemberUpdateManyWithoutWorkspaceNestedInput
    roleActions?: WorkspaceRoleActionUpdateManyWithoutWorkspaceNestedInput
  }

  export type WorkspaceUncheckedUpdateWithoutInvitationsInput = {
    id?: StringFieldUpdateOperationsInput | string
    name?: StringFieldUpdateOperationsInput | string
    slug?: StringFieldUpdateOperationsInput | string
    description?: NullableStringFieldUpdateOperationsInput | string | null
    parentId?: NullableStringFieldUpdateOperationsInput | string | null
    materializedPath?: StringFieldUpdateOperationsInput | string
    status?: StringFieldUpdateOperationsInput | string
    archivedAt?: NullableDateTimeFieldUpdateOperationsInput | Date | string | null
    templateId?: NullableStringFieldUpdateOperationsInput | string | null
    createdBy?: StringFieldUpdateOperationsInput | string
    version?: IntFieldUpdateOperationsInput | number
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
    children?: WorkspaceUncheckedUpdateManyWithoutParentNestedInput
    members?: WorkspaceMemberUncheckedUpdateManyWithoutWorkspaceNestedInput
    roleActions?: WorkspaceRoleActionUncheckedUpdateManyWithoutWorkspaceNestedInput
  }

  export type UserProfileUpsertWithoutInvitationsSentInput = {
    update: XOR<UserProfileUpdateWithoutInvitationsSentInput, UserProfileUncheckedUpdateWithoutInvitationsSentInput>
    create: XOR<UserProfileCreateWithoutInvitationsSentInput, UserProfileUncheckedCreateWithoutInvitationsSentInput>
    where?: UserProfileWhereInput
  }

  export type UserProfileUpdateToOneWithWhereWithoutInvitationsSentInput = {
    where?: UserProfileWhereInput
    data: XOR<UserProfileUpdateWithoutInvitationsSentInput, UserProfileUncheckedUpdateWithoutInvitationsSentInput>
  }

  export type UserProfileUpdateWithoutInvitationsSentInput = {
    userId?: StringFieldUpdateOperationsInput | string
    keycloakUserId?: StringFieldUpdateOperationsInput | string
    email?: StringFieldUpdateOperationsInput | string
    displayName?: NullableStringFieldUpdateOperationsInput | string | null
    avatarPath?: NullableStringFieldUpdateOperationsInput | string | null
    timezone?: StringFieldUpdateOperationsInput | string
    language?: StringFieldUpdateOperationsInput | string
    notificationPrefs?: JsonNullValueInput | InputJsonValue
    status?: StringFieldUpdateOperationsInput | string
    deletedAt?: NullableDateTimeFieldUpdateOperationsInput | Date | string | null
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
    workspacesCreated?: WorkspaceUpdateManyWithoutCreatorNestedInput
    workspaceMembers?: WorkspaceMemberUpdateManyWithoutUserNestedInput
  }

  export type UserProfileUncheckedUpdateWithoutInvitationsSentInput = {
    userId?: StringFieldUpdateOperationsInput | string
    keycloakUserId?: StringFieldUpdateOperationsInput | string
    email?: StringFieldUpdateOperationsInput | string
    displayName?: NullableStringFieldUpdateOperationsInput | string | null
    avatarPath?: NullableStringFieldUpdateOperationsInput | string | null
    timezone?: StringFieldUpdateOperationsInput | string
    language?: StringFieldUpdateOperationsInput | string
    notificationPrefs?: JsonNullValueInput | InputJsonValue
    status?: StringFieldUpdateOperationsInput | string
    deletedAt?: NullableDateTimeFieldUpdateOperationsInput | Date | string | null
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
    workspacesCreated?: WorkspaceUncheckedUpdateManyWithoutCreatorNestedInput
    workspaceMembers?: WorkspaceMemberUncheckedUpdateManyWithoutUserNestedInput
  }

  export type WorkspaceCreateWithoutRoleActionsInput = {
    id?: string
    name: string
    slug: string
    description?: string | null
    materializedPath?: string
    status?: string
    archivedAt?: Date | string | null
    version?: number
    createdAt?: Date | string
    updatedAt?: Date | string
    parent?: WorkspaceCreateNestedOneWithoutChildrenInput
    children?: WorkspaceCreateNestedManyWithoutParentInput
    template?: WorkspaceTemplateCreateNestedOneWithoutWorkspacesInput
    creator: UserProfileCreateNestedOneWithoutWorkspacesCreatedInput
    members?: WorkspaceMemberCreateNestedManyWithoutWorkspaceInput
    invitations?: InvitationCreateNestedManyWithoutWorkspaceInput
  }

  export type WorkspaceUncheckedCreateWithoutRoleActionsInput = {
    id?: string
    name: string
    slug: string
    description?: string | null
    parentId?: string | null
    materializedPath?: string
    status?: string
    archivedAt?: Date | string | null
    templateId?: string | null
    createdBy: string
    version?: number
    createdAt?: Date | string
    updatedAt?: Date | string
    children?: WorkspaceUncheckedCreateNestedManyWithoutParentInput
    members?: WorkspaceMemberUncheckedCreateNestedManyWithoutWorkspaceInput
    invitations?: InvitationUncheckedCreateNestedManyWithoutWorkspaceInput
  }

  export type WorkspaceCreateOrConnectWithoutRoleActionsInput = {
    where: WorkspaceWhereUniqueInput
    create: XOR<WorkspaceCreateWithoutRoleActionsInput, WorkspaceUncheckedCreateWithoutRoleActionsInput>
  }

  export type WorkspaceUpsertWithoutRoleActionsInput = {
    update: XOR<WorkspaceUpdateWithoutRoleActionsInput, WorkspaceUncheckedUpdateWithoutRoleActionsInput>
    create: XOR<WorkspaceCreateWithoutRoleActionsInput, WorkspaceUncheckedCreateWithoutRoleActionsInput>
    where?: WorkspaceWhereInput
  }

  export type WorkspaceUpdateToOneWithWhereWithoutRoleActionsInput = {
    where?: WorkspaceWhereInput
    data: XOR<WorkspaceUpdateWithoutRoleActionsInput, WorkspaceUncheckedUpdateWithoutRoleActionsInput>
  }

  export type WorkspaceUpdateWithoutRoleActionsInput = {
    id?: StringFieldUpdateOperationsInput | string
    name?: StringFieldUpdateOperationsInput | string
    slug?: StringFieldUpdateOperationsInput | string
    description?: NullableStringFieldUpdateOperationsInput | string | null
    materializedPath?: StringFieldUpdateOperationsInput | string
    status?: StringFieldUpdateOperationsInput | string
    archivedAt?: NullableDateTimeFieldUpdateOperationsInput | Date | string | null
    version?: IntFieldUpdateOperationsInput | number
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
    parent?: WorkspaceUpdateOneWithoutChildrenNestedInput
    children?: WorkspaceUpdateManyWithoutParentNestedInput
    template?: WorkspaceTemplateUpdateOneWithoutWorkspacesNestedInput
    creator?: UserProfileUpdateOneRequiredWithoutWorkspacesCreatedNestedInput
    members?: WorkspaceMemberUpdateManyWithoutWorkspaceNestedInput
    invitations?: InvitationUpdateManyWithoutWorkspaceNestedInput
  }

  export type WorkspaceUncheckedUpdateWithoutRoleActionsInput = {
    id?: StringFieldUpdateOperationsInput | string
    name?: StringFieldUpdateOperationsInput | string
    slug?: StringFieldUpdateOperationsInput | string
    description?: NullableStringFieldUpdateOperationsInput | string | null
    parentId?: NullableStringFieldUpdateOperationsInput | string | null
    materializedPath?: StringFieldUpdateOperationsInput | string
    status?: StringFieldUpdateOperationsInput | string
    archivedAt?: NullableDateTimeFieldUpdateOperationsInput | Date | string | null
    templateId?: NullableStringFieldUpdateOperationsInput | string | null
    createdBy?: StringFieldUpdateOperationsInput | string
    version?: IntFieldUpdateOperationsInput | number
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
    children?: WorkspaceUncheckedUpdateManyWithoutParentNestedInput
    members?: WorkspaceMemberUncheckedUpdateManyWithoutWorkspaceNestedInput
    invitations?: InvitationUncheckedUpdateManyWithoutWorkspaceNestedInput
  }

  export type WorkspaceCreateManyCreatorInput = {
    id?: string
    name: string
    slug: string
    description?: string | null
    parentId?: string | null
    materializedPath?: string
    status?: string
    archivedAt?: Date | string | null
    templateId?: string | null
    version?: number
    createdAt?: Date | string
    updatedAt?: Date | string
  }

  export type WorkspaceMemberCreateManyUserInput = {
    id?: string
    workspaceId: string
    role: string
    createdAt?: Date | string
  }

  export type InvitationCreateManyInviterInput = {
    id?: string
    email: string
    workspaceId: string
    role: string
    status?: string
    token: string
    expiresAt: Date | string
    acceptedAt?: Date | string | null
    createdAt?: Date | string
  }

  export type WorkspaceUpdateWithoutCreatorInput = {
    id?: StringFieldUpdateOperationsInput | string
    name?: StringFieldUpdateOperationsInput | string
    slug?: StringFieldUpdateOperationsInput | string
    description?: NullableStringFieldUpdateOperationsInput | string | null
    materializedPath?: StringFieldUpdateOperationsInput | string
    status?: StringFieldUpdateOperationsInput | string
    archivedAt?: NullableDateTimeFieldUpdateOperationsInput | Date | string | null
    version?: IntFieldUpdateOperationsInput | number
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
    parent?: WorkspaceUpdateOneWithoutChildrenNestedInput
    children?: WorkspaceUpdateManyWithoutParentNestedInput
    template?: WorkspaceTemplateUpdateOneWithoutWorkspacesNestedInput
    members?: WorkspaceMemberUpdateManyWithoutWorkspaceNestedInput
    invitations?: InvitationUpdateManyWithoutWorkspaceNestedInput
    roleActions?: WorkspaceRoleActionUpdateManyWithoutWorkspaceNestedInput
  }

  export type WorkspaceUncheckedUpdateWithoutCreatorInput = {
    id?: StringFieldUpdateOperationsInput | string
    name?: StringFieldUpdateOperationsInput | string
    slug?: StringFieldUpdateOperationsInput | string
    description?: NullableStringFieldUpdateOperationsInput | string | null
    parentId?: NullableStringFieldUpdateOperationsInput | string | null
    materializedPath?: StringFieldUpdateOperationsInput | string
    status?: StringFieldUpdateOperationsInput | string
    archivedAt?: NullableDateTimeFieldUpdateOperationsInput | Date | string | null
    templateId?: NullableStringFieldUpdateOperationsInput | string | null
    version?: IntFieldUpdateOperationsInput | number
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
    children?: WorkspaceUncheckedUpdateManyWithoutParentNestedInput
    members?: WorkspaceMemberUncheckedUpdateManyWithoutWorkspaceNestedInput
    invitations?: InvitationUncheckedUpdateManyWithoutWorkspaceNestedInput
    roleActions?: WorkspaceRoleActionUncheckedUpdateManyWithoutWorkspaceNestedInput
  }

  export type WorkspaceUncheckedUpdateManyWithoutCreatorInput = {
    id?: StringFieldUpdateOperationsInput | string
    name?: StringFieldUpdateOperationsInput | string
    slug?: StringFieldUpdateOperationsInput | string
    description?: NullableStringFieldUpdateOperationsInput | string | null
    parentId?: NullableStringFieldUpdateOperationsInput | string | null
    materializedPath?: StringFieldUpdateOperationsInput | string
    status?: StringFieldUpdateOperationsInput | string
    archivedAt?: NullableDateTimeFieldUpdateOperationsInput | Date | string | null
    templateId?: NullableStringFieldUpdateOperationsInput | string | null
    version?: IntFieldUpdateOperationsInput | number
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
  }

  export type WorkspaceMemberUpdateWithoutUserInput = {
    id?: StringFieldUpdateOperationsInput | string
    role?: StringFieldUpdateOperationsInput | string
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    workspace?: WorkspaceUpdateOneRequiredWithoutMembersNestedInput
  }

  export type WorkspaceMemberUncheckedUpdateWithoutUserInput = {
    id?: StringFieldUpdateOperationsInput | string
    workspaceId?: StringFieldUpdateOperationsInput | string
    role?: StringFieldUpdateOperationsInput | string
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
  }

  export type WorkspaceMemberUncheckedUpdateManyWithoutUserInput = {
    id?: StringFieldUpdateOperationsInput | string
    workspaceId?: StringFieldUpdateOperationsInput | string
    role?: StringFieldUpdateOperationsInput | string
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
  }

  export type InvitationUpdateWithoutInviterInput = {
    id?: StringFieldUpdateOperationsInput | string
    email?: StringFieldUpdateOperationsInput | string
    role?: StringFieldUpdateOperationsInput | string
    status?: StringFieldUpdateOperationsInput | string
    token?: StringFieldUpdateOperationsInput | string
    expiresAt?: DateTimeFieldUpdateOperationsInput | Date | string
    acceptedAt?: NullableDateTimeFieldUpdateOperationsInput | Date | string | null
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    workspace?: WorkspaceUpdateOneRequiredWithoutInvitationsNestedInput
  }

  export type InvitationUncheckedUpdateWithoutInviterInput = {
    id?: StringFieldUpdateOperationsInput | string
    email?: StringFieldUpdateOperationsInput | string
    workspaceId?: StringFieldUpdateOperationsInput | string
    role?: StringFieldUpdateOperationsInput | string
    status?: StringFieldUpdateOperationsInput | string
    token?: StringFieldUpdateOperationsInput | string
    expiresAt?: DateTimeFieldUpdateOperationsInput | Date | string
    acceptedAt?: NullableDateTimeFieldUpdateOperationsInput | Date | string | null
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
  }

  export type InvitationUncheckedUpdateManyWithoutInviterInput = {
    id?: StringFieldUpdateOperationsInput | string
    email?: StringFieldUpdateOperationsInput | string
    workspaceId?: StringFieldUpdateOperationsInput | string
    role?: StringFieldUpdateOperationsInput | string
    status?: StringFieldUpdateOperationsInput | string
    token?: StringFieldUpdateOperationsInput | string
    expiresAt?: DateTimeFieldUpdateOperationsInput | Date | string
    acceptedAt?: NullableDateTimeFieldUpdateOperationsInput | Date | string | null
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
  }

  export type WorkspaceCreateManyTemplateInput = {
    id?: string
    name: string
    slug: string
    description?: string | null
    parentId?: string | null
    materializedPath?: string
    status?: string
    archivedAt?: Date | string | null
    createdBy: string
    version?: number
    createdAt?: Date | string
    updatedAt?: Date | string
  }

  export type WorkspaceUpdateWithoutTemplateInput = {
    id?: StringFieldUpdateOperationsInput | string
    name?: StringFieldUpdateOperationsInput | string
    slug?: StringFieldUpdateOperationsInput | string
    description?: NullableStringFieldUpdateOperationsInput | string | null
    materializedPath?: StringFieldUpdateOperationsInput | string
    status?: StringFieldUpdateOperationsInput | string
    archivedAt?: NullableDateTimeFieldUpdateOperationsInput | Date | string | null
    version?: IntFieldUpdateOperationsInput | number
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
    parent?: WorkspaceUpdateOneWithoutChildrenNestedInput
    children?: WorkspaceUpdateManyWithoutParentNestedInput
    creator?: UserProfileUpdateOneRequiredWithoutWorkspacesCreatedNestedInput
    members?: WorkspaceMemberUpdateManyWithoutWorkspaceNestedInput
    invitations?: InvitationUpdateManyWithoutWorkspaceNestedInput
    roleActions?: WorkspaceRoleActionUpdateManyWithoutWorkspaceNestedInput
  }

  export type WorkspaceUncheckedUpdateWithoutTemplateInput = {
    id?: StringFieldUpdateOperationsInput | string
    name?: StringFieldUpdateOperationsInput | string
    slug?: StringFieldUpdateOperationsInput | string
    description?: NullableStringFieldUpdateOperationsInput | string | null
    parentId?: NullableStringFieldUpdateOperationsInput | string | null
    materializedPath?: StringFieldUpdateOperationsInput | string
    status?: StringFieldUpdateOperationsInput | string
    archivedAt?: NullableDateTimeFieldUpdateOperationsInput | Date | string | null
    createdBy?: StringFieldUpdateOperationsInput | string
    version?: IntFieldUpdateOperationsInput | number
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
    children?: WorkspaceUncheckedUpdateManyWithoutParentNestedInput
    members?: WorkspaceMemberUncheckedUpdateManyWithoutWorkspaceNestedInput
    invitations?: InvitationUncheckedUpdateManyWithoutWorkspaceNestedInput
    roleActions?: WorkspaceRoleActionUncheckedUpdateManyWithoutWorkspaceNestedInput
  }

  export type WorkspaceUncheckedUpdateManyWithoutTemplateInput = {
    id?: StringFieldUpdateOperationsInput | string
    name?: StringFieldUpdateOperationsInput | string
    slug?: StringFieldUpdateOperationsInput | string
    description?: NullableStringFieldUpdateOperationsInput | string | null
    parentId?: NullableStringFieldUpdateOperationsInput | string | null
    materializedPath?: StringFieldUpdateOperationsInput | string
    status?: StringFieldUpdateOperationsInput | string
    archivedAt?: NullableDateTimeFieldUpdateOperationsInput | Date | string | null
    createdBy?: StringFieldUpdateOperationsInput | string
    version?: IntFieldUpdateOperationsInput | number
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
  }

  export type WorkspaceCreateManyParentInput = {
    id?: string
    name: string
    slug: string
    description?: string | null
    materializedPath?: string
    status?: string
    archivedAt?: Date | string | null
    templateId?: string | null
    createdBy: string
    version?: number
    createdAt?: Date | string
    updatedAt?: Date | string
  }

  export type WorkspaceMemberCreateManyWorkspaceInput = {
    id?: string
    userId: string
    role: string
    createdAt?: Date | string
  }

  export type InvitationCreateManyWorkspaceInput = {
    id?: string
    email: string
    role: string
    status?: string
    invitedBy: string
    token: string
    expiresAt: Date | string
    acceptedAt?: Date | string | null
    createdAt?: Date | string
  }

  export type WorkspaceRoleActionCreateManyWorkspaceInput = {
    id?: string
    pluginId: string
    actionKey: string
    requiredRole: string
    isOverridden?: boolean
    createdAt?: Date | string
    updatedAt?: Date | string
  }

  export type WorkspaceUpdateWithoutParentInput = {
    id?: StringFieldUpdateOperationsInput | string
    name?: StringFieldUpdateOperationsInput | string
    slug?: StringFieldUpdateOperationsInput | string
    description?: NullableStringFieldUpdateOperationsInput | string | null
    materializedPath?: StringFieldUpdateOperationsInput | string
    status?: StringFieldUpdateOperationsInput | string
    archivedAt?: NullableDateTimeFieldUpdateOperationsInput | Date | string | null
    version?: IntFieldUpdateOperationsInput | number
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
    children?: WorkspaceUpdateManyWithoutParentNestedInput
    template?: WorkspaceTemplateUpdateOneWithoutWorkspacesNestedInput
    creator?: UserProfileUpdateOneRequiredWithoutWorkspacesCreatedNestedInput
    members?: WorkspaceMemberUpdateManyWithoutWorkspaceNestedInput
    invitations?: InvitationUpdateManyWithoutWorkspaceNestedInput
    roleActions?: WorkspaceRoleActionUpdateManyWithoutWorkspaceNestedInput
  }

  export type WorkspaceUncheckedUpdateWithoutParentInput = {
    id?: StringFieldUpdateOperationsInput | string
    name?: StringFieldUpdateOperationsInput | string
    slug?: StringFieldUpdateOperationsInput | string
    description?: NullableStringFieldUpdateOperationsInput | string | null
    materializedPath?: StringFieldUpdateOperationsInput | string
    status?: StringFieldUpdateOperationsInput | string
    archivedAt?: NullableDateTimeFieldUpdateOperationsInput | Date | string | null
    templateId?: NullableStringFieldUpdateOperationsInput | string | null
    createdBy?: StringFieldUpdateOperationsInput | string
    version?: IntFieldUpdateOperationsInput | number
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
    children?: WorkspaceUncheckedUpdateManyWithoutParentNestedInput
    members?: WorkspaceMemberUncheckedUpdateManyWithoutWorkspaceNestedInput
    invitations?: InvitationUncheckedUpdateManyWithoutWorkspaceNestedInput
    roleActions?: WorkspaceRoleActionUncheckedUpdateManyWithoutWorkspaceNestedInput
  }

  export type WorkspaceUncheckedUpdateManyWithoutParentInput = {
    id?: StringFieldUpdateOperationsInput | string
    name?: StringFieldUpdateOperationsInput | string
    slug?: StringFieldUpdateOperationsInput | string
    description?: NullableStringFieldUpdateOperationsInput | string | null
    materializedPath?: StringFieldUpdateOperationsInput | string
    status?: StringFieldUpdateOperationsInput | string
    archivedAt?: NullableDateTimeFieldUpdateOperationsInput | Date | string | null
    templateId?: NullableStringFieldUpdateOperationsInput | string | null
    createdBy?: StringFieldUpdateOperationsInput | string
    version?: IntFieldUpdateOperationsInput | number
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
  }

  export type WorkspaceMemberUpdateWithoutWorkspaceInput = {
    id?: StringFieldUpdateOperationsInput | string
    role?: StringFieldUpdateOperationsInput | string
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    user?: UserProfileUpdateOneRequiredWithoutWorkspaceMembersNestedInput
  }

  export type WorkspaceMemberUncheckedUpdateWithoutWorkspaceInput = {
    id?: StringFieldUpdateOperationsInput | string
    userId?: StringFieldUpdateOperationsInput | string
    role?: StringFieldUpdateOperationsInput | string
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
  }

  export type WorkspaceMemberUncheckedUpdateManyWithoutWorkspaceInput = {
    id?: StringFieldUpdateOperationsInput | string
    userId?: StringFieldUpdateOperationsInput | string
    role?: StringFieldUpdateOperationsInput | string
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
  }

  export type InvitationUpdateWithoutWorkspaceInput = {
    id?: StringFieldUpdateOperationsInput | string
    email?: StringFieldUpdateOperationsInput | string
    role?: StringFieldUpdateOperationsInput | string
    status?: StringFieldUpdateOperationsInput | string
    token?: StringFieldUpdateOperationsInput | string
    expiresAt?: DateTimeFieldUpdateOperationsInput | Date | string
    acceptedAt?: NullableDateTimeFieldUpdateOperationsInput | Date | string | null
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    inviter?: UserProfileUpdateOneRequiredWithoutInvitationsSentNestedInput
  }

  export type InvitationUncheckedUpdateWithoutWorkspaceInput = {
    id?: StringFieldUpdateOperationsInput | string
    email?: StringFieldUpdateOperationsInput | string
    role?: StringFieldUpdateOperationsInput | string
    status?: StringFieldUpdateOperationsInput | string
    invitedBy?: StringFieldUpdateOperationsInput | string
    token?: StringFieldUpdateOperationsInput | string
    expiresAt?: DateTimeFieldUpdateOperationsInput | Date | string
    acceptedAt?: NullableDateTimeFieldUpdateOperationsInput | Date | string | null
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
  }

  export type InvitationUncheckedUpdateManyWithoutWorkspaceInput = {
    id?: StringFieldUpdateOperationsInput | string
    email?: StringFieldUpdateOperationsInput | string
    role?: StringFieldUpdateOperationsInput | string
    status?: StringFieldUpdateOperationsInput | string
    invitedBy?: StringFieldUpdateOperationsInput | string
    token?: StringFieldUpdateOperationsInput | string
    expiresAt?: DateTimeFieldUpdateOperationsInput | Date | string
    acceptedAt?: NullableDateTimeFieldUpdateOperationsInput | Date | string | null
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
  }

  export type WorkspaceRoleActionUpdateWithoutWorkspaceInput = {
    id?: StringFieldUpdateOperationsInput | string
    pluginId?: StringFieldUpdateOperationsInput | string
    actionKey?: StringFieldUpdateOperationsInput | string
    requiredRole?: StringFieldUpdateOperationsInput | string
    isOverridden?: BoolFieldUpdateOperationsInput | boolean
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
  }

  export type WorkspaceRoleActionUncheckedUpdateWithoutWorkspaceInput = {
    id?: StringFieldUpdateOperationsInput | string
    pluginId?: StringFieldUpdateOperationsInput | string
    actionKey?: StringFieldUpdateOperationsInput | string
    requiredRole?: StringFieldUpdateOperationsInput | string
    isOverridden?: BoolFieldUpdateOperationsInput | boolean
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
  }

  export type WorkspaceRoleActionUncheckedUpdateManyWithoutWorkspaceInput = {
    id?: StringFieldUpdateOperationsInput | string
    pluginId?: StringFieldUpdateOperationsInput | string
    actionKey?: StringFieldUpdateOperationsInput | string
    requiredRole?: StringFieldUpdateOperationsInput | string
    isOverridden?: BoolFieldUpdateOperationsInput | boolean
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
  }



  /**
   * Batch Payload for updateMany & deleteMany & createMany
   */

  export type BatchPayload = {
    count: number
  }

  /**
   * DMMF
   */
  export const dmmf: runtime.BaseDMMF
}