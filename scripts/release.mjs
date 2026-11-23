#!/usr/bin/env node
// Manual release helper (no CI).
//
//   node scripts/release.mjs collect  [--staging <dir>]   (default: <staging root>/v<version>) copy this machine's build output into the staging dir
//   node scripts/release.mjs manifest [--staging <dir>]   write latest.json from everything in the staging dir
//
// Run `collect` on every OS you build on (pointing --staging at the same shared
// folder), then run `manifest` once and upload the folder with `gh release create`.
//
// Options: --version <x.y.z> (default: package.json), --repo <owner/name>,
//          --notes <text>, --bundle <dir>

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const pkg = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));

const [cmd, ...rest] = process.argv.slice(2);
const opts = {};
for (let i = 0; i < rest.length; i += 2) opts[rest[i].replace(/^--/, "")] = rest[i + 1];

const version = opts.version ?? pkg.version;
const repo = opts.repo ?? "ByteFight-GT/app_releases";
const tag = `v${version}`;
// Shared staging root: lives outside the repo so Linux (WSL) and Windows builds can both write to it.
//   WSL:     ~/tsfd/bytefightapp/release_staging  (~/tsfd -> D:\wsltsfd)
//   Windows: set BYTEFIGHT_STAGING=D:\wsltsfd\bytefightapp\release_staging, or pass --staging
const stagingRoot = process.env.BYTEFIGHT_STAGING ?? path.join(os.homedir(), "tsfd", "bytefightapp", "release_staging");
const staging = path.resolve(opts.staging ?? path.join(stagingRoot, tag));
const bundleDir = path.resolve(opts.bundle ?? path.join(root, "src-tauri/target/release/bundle"));

// GitHub rewrites spaces in asset names to dots; do it ourselves so URLs match.
const assetName = (n) => n.replace(/\s+/g, ".");

// Files the updater can install, mapped to a latest.json platform key.
// (Tauri v2 uses the installers themselves, except macOS which uses .app.tar.gz.)
function platformFor(file) {
  const arch = /aarch64|arm64/i.test(file) ? "aarch64" : "x86_64";
  if (/\.AppImage$/i.test(file)) return `linux-${arch}`;
  if (/-setup\.exe$/i.test(file)) return `windows-${arch}`;
  if (/\.app\.tar\.gz$/i.test(file)) return `darwin-${arch}`;
  return null;
}

function collect() {
  if (!fs.existsSync(bundleDir)) throw new Error(`No bundle dir at ${bundleDir} - run a build first.`);
  fs.mkdirSync(staging, { recursive: true });
  let n = 0;
  for (const sub of fs.readdirSync(bundleDir, { withFileTypes: true })) {
    if (!sub.isDirectory()) continue;
    for (const f of fs.readdirSync(path.join(bundleDir, sub.name), { withFileTypes: true })) {
      if (!f.isFile()) continue; // skips unpacked AppDir / deb folders
      if (!f.name.includes(version)) continue; // skips stale builds of other versions
      fs.copyFileSync(path.join(bundleDir, sub.name, f.name), path.join(staging, assetName(f.name)));
      console.log("  +", assetName(f.name));
      n++;
    }
  }
  if (n === 0) throw new Error(`No files for version ${version} found in ${bundleDir}.`);
  console.log(`Copied ${n} file(s) to ${staging}`);
}

function manifest() {
  const files = fs.readdirSync(staging);
  const platforms = {};
  for (const f of files) {
    const platform = platformFor(f);
    if (!platform || !files.includes(`${f}.sig`)) continue;
    if (platforms[platform]) throw new Error(`Two updater files for ${platform}: ${platforms[platform].file} and ${f}`);
    platforms[platform] = {
      file: f,
      signature: fs.readFileSync(path.join(staging, `${f}.sig`), "utf8").trim(),
      url: `https://github.com/${repo}/releases/download/${tag}/${encodeURIComponent(f)}`,
    };
  }
  if (Object.keys(platforms).length === 0) throw new Error(`No updater files with .sig found in ${staging}.`);

  const out = {
    version,
    notes: opts.notes ?? "",
    pub_date: new Date().toISOString(),
    platforms: Object.fromEntries(Object.entries(platforms).map(([k, { file, ...v }]) => [k, v])),
  };
  fs.writeFileSync(path.join(staging, "latest.json"), JSON.stringify(out, null, 2) + "\n");
  console.log(`Wrote latest.json with platforms: ${Object.keys(platforms).join(", ")}`);

  const upload = files.filter((f) => !f.endsWith(".sig")).concat("latest.json");
  console.log(`\nNext:\n  gh release create ${tag} --repo ${repo} --title "${tag}" --notes "..." ${[...upload, ...files.filter((f) => f.endsWith(".sig"))].map((f) => path.join(stagingRoot, tag, f)).join(" ")}`);
}

if (cmd === "collect") collect();
else if (cmd === "manifest") manifest();
else {
  console.error("Usage: node scripts/release.mjs <collect|manifest> [--staging dir] [--version x.y.z] [--repo owner/name] [--notes text] [--bundle dir]");
  process.exit(1);
}
