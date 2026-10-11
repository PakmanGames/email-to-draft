/**
 * Railway infrastructure for email-to-draft (technical design section 12, docs/deploy.md).
 *
 * Railway's Infrastructure as Code: preview with `railway config plan`, apply with
 * `railway config apply`. Railway does not read this file during deploys, so a change
 * here only takes effect when it is applied. Deploys themselves run on every push to main.
 */
import { defineRailway, github, postgres, preserve, project, service } from "railway/iac";

export default defineRailway(() => {
  const db = postgres("postgres");

  const web = service("web", {
    source: github("PakmanGames/email-to-draft", { branch: "main" }),
    build: "pnpm build",
    start: "pnpm start",
    // Runs in the built image before traffic moves, so a failed migration stops the deploy
    // and the previous deployment keeps serving.
    preDeploy: "pnpm db:migrate",
    healthcheck: "/",
    env: {
      // The private-network URL: reachable from the service at runtime and pre-deploy,
      // not from a laptop. Loading inventory from a laptop uses DATABASE_PUBLIC_URL instead.
      DATABASE_URL: db.env.DATABASE_URL,
      // The secret lives only in Railway. Set it with `railway variable set`, never in git.
      LLM_API_KEY: preserve(),
    },
    // email-to-draft.apak.ca is attached with `railway domain`: IaC cannot register custom domains yet.
  });

  return project("email-to-draft", { resources: [web, db] });
});
