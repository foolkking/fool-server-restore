#!/usr/bin/env node
import { bootstrapCommand, restoreCommand, scanCommand } from "./commands.js";

const [command, ...args] = process.argv.slice(2);

try {
  if (command === "scan") {
    const userArg = readOption(args, "--user") ?? "default";
    await scanCommand(userArg);
  } else if (command === "restore") {
    const snapshot = readOption(args, "--from");
    if (!snapshot) {
      throw new Error("Missing --from. Pass a snapshot path such as configs/snapshots/users/default/machines/<machine>/latest.json");
    }
    const apply = args.includes("--apply");
    await restoreCommand(snapshot, apply);
  } else if (command === "bootstrap" || !command) {
    await bootstrapCommand();
  } else {
    printHelp();
    process.exitCode = 1;
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}

function readOption(args: string[], name: string): string | undefined {
  const index = args.indexOf(name);
  if (index === -1) return undefined;
  return args[index + 1];
}

function printHelp(): void {
  console.log(`Usage:
  fool scan [--user name]
  fool restore --from configs/snapshots/users/default/machines/<machine>/latest.json [--apply]
  fool bootstrap`);
}
