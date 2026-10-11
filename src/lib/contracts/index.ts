// Shared contracts (technical design section 5). Import from "@/lib/contracts".
// Fixtures are not re-exported here so they never end up in production bundles by accident.
export * from "./api";
export * from "./extraction";
export * from "./matching";
export * from "./quote";
