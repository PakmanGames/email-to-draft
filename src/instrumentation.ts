/** Runs once per server start. Importing env validates it, so bad config fails fast. */
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("./env");
  }
}
