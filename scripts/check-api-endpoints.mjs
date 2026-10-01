#!/usr/bin/env node
/**
 * Checks that every API path the console calls is actually served by the
 * backend, and that none of them is shadowed by an earlier `:param` route.
 *
 * Both sides are read statically: the console's `adminApi.<method>("…")` calls
 * and the Express `router.<method>("…")` declarations in the API repo. Express
 * matches in declaration order, so a literal path declared after a conflicting
 * parameter route silently resolves to the wrong handler — that is what the
 * second check catches.
 *
 * Usage: node scripts/check-api-endpoints.mjs [path-to-api-repo]
 * Default API repo: ../api
 */
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const adminSrc = path.join(here, "..", "src");
const apiRoot = path.resolve(process.argv[2] ?? path.join(here, "..", "..", "api"));
const routesDir = path.join(apiRoot, "src", "app", "routes");

if (!existsSync(routesDir)) {
  console.error(`API routes not found at ${routesDir}. Pass the API repo path as an argument.`);
  process.exit(2);
}

/** Mirror of src/lib/api/admin-paths.ts — the API routers' mount points. */
const adminPaths = {
  core: "/flurrypay-website-admin",
  financial: "/flurrypay-website-admin-financial",
  wallet: "/flurrypay-website-admin-wallet",
  notifications: "/flurrypay-website-admin-notifications",
  stranded: "/flurrypay-website-admin-stranded",
  compliance: "/flurrypay-website-admin-compliance",
  risk: "/flurrypay-website-admin-risk",
  support: "/flurrypay-website-admin-support",
  chat: "/flurrypay-website-admin-chat",
  ledger: "/flurrypay-website-admin-ledger",
  companyDetails: "/company-details",
  users: "/user",
  kyc: "/kyc/admin",
  transactions: "/transactions/admin",
};

/** Mount point → router file, including routers merged in with `router.use()`. */
const MOUNTS = [
  [adminPaths.core, "admin.ts"],
  [adminPaths.financial, "adminFinancial.ts"],
  [adminPaths.wallet, "adminWallet.ts"],
  [adminPaths.notifications, "adminNotifications.ts"],
  [adminPaths.stranded, "strandedTransfers.ts"],
  [adminPaths.compliance, "compliance.ts"],
  [adminPaths.risk, "riskMonitoring.ts"],
  // riskMonitoring.ts ends with `riskRouter.use(fraudOperationsRouter)`.
  [adminPaths.risk, "fraudOperations.ts"],
  [adminPaths.support, "adminSupport.ts"],
  // The chat router is mounted twice by the API: once for customers at /chat and
  // once behind the admin bot guard at this path. The console only ever calls the
  // second, which serves the same route table.
  [adminPaths.chat, "chat.ts"],
  [adminPaths.ledger, "walletLedger.ts"],
  ["/company-details", "companyDetails.ts"],
  ["/user", "users.ts"],
  ["/kyc", "kyc.ts"],
  ["/transactions", "transactionRoutes.ts"],
  ["/files", "files.ts"],
];

function walk(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.tsx?$/.test(full)) out.push(full);
  }
  return out;
}

/** Paths the console requests, with `${…}` segments reduced to a placeholder. */
function collectCalls() {
  const calls = [];
  for (const file of walk(adminSrc)) {
    const source = readFileSync(file, "utf8");
    if (!/\b(?:adminApi|api|client)\.(?:get|post|put|patch|delete)\b/.test(source)) continue;

    // Local `const base = adminPaths.x` / `const base = \`${adminPaths.x}/…\`` aliases.
    const aliases = {};
    const aliasPattern = /const\s+(\w+)\s*=\s*(`[^`]*`|adminPaths\.\w+)\s*;/g;
    for (const [, name, raw] of source.matchAll(aliasPattern)) {
      let value;
      if (raw.startsWith("adminPaths.")) value = adminPaths[raw.slice("adminPaths.".length)];
      else {
        value = raw
          .slice(1, -1)
          .replace(/\$\{adminPaths\.(\w+)\}/g, (all, key) => adminPaths[key] ?? all);
        if (value.includes("${")) continue;
      }
      if (value) aliases[name] = value;
    }

    const callPattern =
      /\b(?:adminApi|api|client)\.(get|post|put|patch|delete)(?:<[^>]*>)?\(\s*(`[^`]*`|"[^"]*"|'[^']*')/g;
    for (const match of source.matchAll(callPattern)) {
      let requestPath = match[2]
        .slice(1, -1)
        .replace(/\$\{adminPaths\.(\w+)\}/g, (all, key) => adminPaths[key] ?? all)
        .replace(/\$\{(\w+)\}/g, (all, name) => aliases[name] ?? all)
        .replace(/\$\{[^}]*\}/g, ":param")
        .split("?")[0];
      calls.push({
        method: match[1].toUpperCase(),
        path: requestPath,
        loc: `${path.relative(adminSrc, file)}:${source.slice(0, match.index).split("\n").length}`,
      });
    }
  }
  return calls;
}

/** Routes the API declares, in per-file declaration order. */
function collectRoutes() {
  const routes = [];
  for (const [mount, file] of MOUNTS) {
    const full = path.join(routesDir, file);
    if (!existsSync(full)) continue;
    const source = readFileSync(full, "utf8");
    const pattern =
      /\b\w*(?:[Rr]outer|Route)\s*\.\s*(get|post|put|patch|delete)\s*\(\s*(?:"([^"]*)"|'([^']*)')/g;
    for (const match of source.matchAll(pattern)) {
      const suffix = match[2] ?? match[3];
      routes.push({
        method: match[1].toUpperCase(),
        path: (mount + suffix).replace(/\/$/, "") || mount,
        file,
        line: source.slice(0, match.index).split("\n").length,
      });
    }
  }
  return routes;
}

const toPattern = (routePath) =>
  new RegExp(
    "^/" +
      routePath
        .split("/")
        .filter(Boolean)
        .map((segment) =>
          segment.startsWith(":")
            ? "[^/]+"
            : segment === "*"
              ? ".*"
              : segment.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
        )
        .join("/") +
      "$",
  );

const calls = collectCalls();
const routes = collectRoutes().map((route) => ({ ...route, pattern: toPattern(route.path) }));

const byFile = new Map();
for (const route of routes) {
  if (!byFile.has(route.file)) byFile.set(route.file, []);
  byFile.get(route.file).push(route);
}
for (const list of byFile.values()) list.sort((a, b) => a.line - b.line);

const missing = [];
const shadowed = [];

for (const call of calls) {
  const concrete = call.path.replaceAll(":param", "X");
  const matches = routes.filter(
    (route) => route.method === call.method && route.pattern.test(concrete),
  );

  if (matches.length === 0) {
    const otherMethods = [
      ...new Set(
        routes.filter((route) => route.pattern.test(concrete)).map((route) => route.method),
      ),
    ];
    missing.push({
      ...call,
      note: otherMethods.length
        ? `API serves ${otherMethods.join("/")} on this path`
        : "no matching route",
    });
    continue;
  }

  for (const list of byFile.values()) {
    const inFile = list.filter(
      (route) => route.method === call.method && route.pattern.test(concrete),
    );
    if (inFile.length < 2) continue;
    const literal = inFile.find((route) => !route.path.includes(":"));
    if (literal && inFile[0] !== literal) {
      shadowed.push({
        ...call,
        reached: `${inFile[0].path} (${inFile[0].file}:${inFile[0].line})`,
        expected: `${literal.path} (${literal.file}:${literal.line})`,
      });
    }
  }
}

console.log(`Console calls: ${calls.length}   API routes: ${routes.length}`);

if (missing.length) {
  console.log(`\n${missing.length} call(s) with no matching route:`);
  for (const item of missing) {
    console.log(`  ${item.method.padEnd(6)} ${item.path.padEnd(58)} ${item.loc}  — ${item.note}`);
  }
}

if (shadowed.length) {
  console.log(`\n${shadowed.length} call(s) shadowed by an earlier parameter route:`);
  for (const item of shadowed) {
    console.log(`  ${item.method} ${item.path} (${item.loc})`);
    console.log(`    reaches  ${item.reached}`);
    console.log(`    expected ${item.expected}`);
  }
}

if (!missing.length && !shadowed.length)
  console.log("\nEvery console call resolves to a live API route.");

process.exit(missing.length || shadowed.length ? 1 : 0);
