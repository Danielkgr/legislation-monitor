declare module "better-sqlite3" {
  interface RunResult {
    lastInsertRowid: number | bigint;
    changes: number;
  }

  interface Statement<T = Record<string, unknown>> {
    bind(...params: unknown[]): this;
    get(...params: unknown[]): T | undefined;
    all(...params: unknown[]): T[];
    run(...params: unknown[]): RunResult;
    each(callback: (row: T, ...columns: unknown[]) => void): this;
    iterate(): Iterator<T>;
    raw(): Statement<unknown[]>;
  }

  interface Database {
    prepare<T = Record<string, unknown>>(sql: string): Statement<T>;
    exec(sql: string): this;
    pragma(str: string, options?: object): unknown;
    close(): void;
    sync(): void;
    ready: boolean;
    readonly: boolean;
    filename: string;
  }

  class Database {
    constructor(database: string, options?: object);
    prepare<T = Record<string, unknown>>(sql: string): Statement<T>;
    exec(sql: string): this;
    pragma(str: string, options?: object): unknown;
    close(): void;
    sync(): void;
    ready: boolean;
    readonly: boolean;
    filename: string;
  }

  export = Database;
}
