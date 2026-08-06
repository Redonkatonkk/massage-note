import { spawnSync } from "node:child_process";

function runDocker(args, options = {}) {
  const result = spawnSync("docker", args, {
    encoding: "utf8",
    stdio: options.capture ? "pipe" : "inherit",
  });
  if (result.status !== 0) {
    if (options.capture && result.stderr) process.stderr.write(result.stderr);
    process.exit(result.status ?? 1);
  }
  return result.stdout?.trim() ?? "";
}

const exists = runDocker(
  [
    "compose",
    "exec",
    "-T",
    "postgres",
    "psql",
    "-U",
    "massage",
    "-d",
    "postgres",
    "-tAc",
    "SELECT 1 FROM pg_database WHERE datname = 'massage_note_test'",
  ],
  { capture: true },
);

if (exists !== "1") {
  runDocker([
    "compose",
    "exec",
    "-T",
    "postgres",
    "createdb",
    "-U",
    "massage",
    "-O",
    "massage",
    "massage_note_test",
  ]);
  process.stdout.write("已创建独立集成测试数据库。\n");
} else {
  process.stdout.write("独立集成测试数据库已就绪。\n");
}
