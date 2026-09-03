export interface ServerEnv {
  port: number;
  databasePath: string;
  migrationsFolder: string;
  baseURL?: string;
  secret?: string;
  webOrigin?: string;
  github: { clientId: string; clientSecret: string };
  adminEmail?: string;
  workspaceName?: string;
  webDist?: string;
}

export function readEnv(env: NodeJS.ProcessEnv = process.env): ServerEnv {
  return {
    port: Number(env.PORT ?? 3000),
    databasePath: env.DEEVY_DATABASE_PATH ?? "./data/deevy.sqlite",
    migrationsFolder: env.DEEVY_MIGRATIONS_DIR ?? new URL("./drizzle", import.meta.url).pathname,
    baseURL: env.BETTER_AUTH_URL,
    secret: env.BETTER_AUTH_SECRET,
    webOrigin: env.DEEVY_WEB_ORIGIN,
    github: {
      clientId: env.GITHUB_CLIENT_ID ?? "",
      clientSecret: env.GITHUB_CLIENT_SECRET ?? "",
    },
    adminEmail: env.DEEVY_ADMIN_EMAIL,
    workspaceName: env.DEEVY_WORKSPACE_NAME,
    webDist: env.DEEVY_WEB_DIST,
  };
}
