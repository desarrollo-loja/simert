/**
 * PM2 deployment configuration for the `simert` service (parking domain).
 *
 * Usage:
 *   pm2 start ecosystem.config.js --env production
 *   pm2 reload  simert          # zero-downtime redeploy (cluster mode)
 *   pm2 delete  simert          # remove before switching from an ad-hoc start
 *
 * Runtime settings (PORT_SERVER, database, Redis, Keycloak…) keep coming from
 * the service `.env` file; this file only describes how the process is run.
 *
 * Instance count
 * --------------
 * `PM2_INSTANCES` (default 2) sets how many workers run in cluster mode. Raise
 * it only after checking the database connection budget: every worker opens its
 * own TypeORM pool, so the connections used by this service are
 * `PM2_INSTANCES * T_CONNECTIONLIMIT` (plus `H_CONNECTIONLIMIT` for the GPS
 * tracking pool). With several SIMERT services on one PostgreSQL host, the sum
 * across services must stay under the server `max_connections`.
 *
 * Background jobs
 * ---------------
 * The recurring jobs in `src/check`, `src/incident` and `src/data` are
 * scheduled only on the primary worker (`isPrimaryInstance()` in
 * `src/common/glob/utilities/cluster.ts`), so raising the instance count does
 * not duplicate GIM reconciliation or historical archiving.
 */
module.exports = {
  apps: [
    {
      name: 'simert',
      script: 'dist/main.js',
      exec_mode: 'cluster',
      instances: Number(process.env.PM2_INSTANCES) || 2,
      autorestart: true,
      max_memory_restart: '600M',
      // Give in-flight requests time to finish on reload before SIGKILL.
      kill_timeout: 5000,
      env: {
        NODE_ENV: 'development',
      },
      env_production: {
        NODE_ENV: 'production',
      },
    },
  ],
};
