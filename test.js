#!/usr/bin/env node
import { readdir } from "fs/promises";
import { join, extname } from "path";
import { execFileSync } from "child_process";

const examplesDir = "examples";
const invalidDir = join(examplesDir, "invalid");
const schemaFile = "schema.json";

async function jsonFiles(dir) {
  const files = await readdir(dir);
  return files
    .filter((file) => extname(file) === ".json")
    .map((f) => join(dir, f));
}

function validates(filePath) {
  try {
    execFileSync("node", ["validate.js", schemaFile, filePath], {
      stdio: "pipe",
      encoding: "utf8",
    });
    return { ok: true };
  } catch (error) {
    if (error.status !== 1) {
      // Exit 2 = schema compile error; anything else is a crash. Never count these as a rejection.
      console.error(
        `\n💥 validate.js exited ${error.status} on ${filePath}:\n${error.stderr || error.message}`,
      );
      process.exit(2);
    }
    return { ok: false, output: error.stdout || error.message };
  }
}

async function runTests() {
  console.log("🧪 Running validation tests...\n");

  const valid = await jsonFiles(examplesDir);
  const invalid = await jsonFiles(invalidDir);
  if (valid.length === 0) {
    console.log("⚠️  No JSON files found in examples directory");
    process.exit(1);
  }

  let passed = 0;
  let failed = 0;

  for (const file of valid) {
    process.stdout.write(`valid   ${file}... `);
    const r = validates(file);
    if (r.ok) {
      console.log("✅ PASSED");
      passed++;
    } else {
      console.log("❌ FAILED (expected to validate)");
      console.log(r.output);
      failed++;
    }
  }

  for (const file of invalid) {
    process.stdout.write(`invalid ${file}... `);
    if (validates(file).ok) {
      console.log("❌ FAILED (expected to be rejected)");
      failed++;
    } else {
      console.log("✅ PASSED (rejected)");
      passed++;
    }
  }

  const total = valid.length + invalid.length;
  console.log("\n" + "=".repeat(50));
  console.log(`Total: ${total} | Passed: ${passed} | Failed: ${failed}`);
  console.log("=".repeat(50));

  if (failed > 0) process.exit(1);
}

runTests().catch((error) => {
  console.error("Error running tests:", error.message);
  process.exit(1);
});
