/**
 * After `next build` (output: "standalone"), copies the assets the standalone server
 * needs (public/ and .next/static/) into .next/standalone/, ready to zip and upload
 * to the cPanel "Setup Node.js App" application root.
 *
 * Usage: npm run build:cpanel
 */
const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const standalone = path.join(root, ".next", "standalone");

if (!fs.existsSync(path.join(standalone, "server.js"))) {
  console.error('✗ .next/standalone/server.js not found. Is output: "standalone" set in next.config.ts?');
  process.exit(1);
}

function copy(from, to) {
  if (!fs.existsSync(from)) return;
  fs.rmSync(to, { recursive: true, force: true });
  fs.cpSync(from, to, { recursive: true });
  console.log(`✓ copied ${path.relative(root, from)} -> ${path.relative(root, to)}`);
}

copy(path.join(root, "public"), path.join(standalone, "public"));
copy(path.join(root, ".next", "static"), path.join(standalone, ".next", "static"));

// Never ship local env files with secrets inside the upload bundle
for (const f of [".env", ".env.local", ".env.production.local"]) {
  fs.rmSync(path.join(standalone, f), { force: true });
}

console.log("\nDone. Zip the CONTENTS of frontend/.next/standalone/ (server.js must be at the top level)");
console.log("and upload/extract it into the cPanel Node.js application root (e.g. ~/acwale_frontend).");
