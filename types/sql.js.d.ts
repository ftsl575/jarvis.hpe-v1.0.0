declare module 'sql.js' {
  export interface SqlJsConfig {
    locateFile?: (file: string) => string;
  }

  export interface SqlJsStatic {
    Database: new () => SqlJsDatabase;
  }

  export interface SqlJsQueryResult {
    columns: string[];
    values: unknown[][];
  }

  export interface SqlJsDatabase {
    run(sql: string): void;
    exec(sql: string): SqlJsQueryResult[];
  }

  export default function initSqlJs(config?: SqlJsConfig): Promise<SqlJsStatic>;
}
