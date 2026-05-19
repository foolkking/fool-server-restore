import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export async function runCommand(command: string, args: string[] = []): Promise<{
  ok: boolean;
  stdout: string;
  stderr: string;
}> {
  try {
    const result = await execFileAsync(command, args, {
      windowsHide: true,
      timeout: 15_000
    });

    return {
      ok: true,
      stdout: result.stdout.trim(),
      stderr: result.stderr.trim()
    };
  } catch (error) {
    const commandError = error as {
      stdout?: string;
      stderr?: string;
      message?: string;
    };

    return {
      ok: false,
      stdout: commandError.stdout?.trim() ?? "",
      stderr: commandError.stderr?.trim() || commandError.message || "Command failed"
    };
  }
}
