import type { RestoreAction, RestorePlan, RestoreStage, SnapshotManifest } from "@fool/core";

export function createRestorePlan(snapshot: SnapshotManifest, targetSnapshotPath = "latest"): RestorePlan {
  return {
    id: `restore-${Date.now()}`,
    createdAt: new Date().toISOString(),
    targetSnapshot: targetSnapshotPath,
    stages: [
      createPreflightStage(snapshot),
      createRuntimeStage(snapshot),
      createPackageStage(snapshot),
      createConfigStage(snapshot),
      createVerifyStage()
    ]
  };
}

function createPreflightStage(snapshot: SnapshotManifest): RestoreStage {
  return {
    id: "preflight",
    label: "Preflight checks",
    actions: [
      action("check-os", `Check target OS compatibility with ${snapshot.machine.os}`, "low"),
      action("check-permissions", "Detect actions that require administrator or sudo privileges", "low"),
      action("backup-conflicts", "Prepare backups for files that may be overwritten", "medium")
    ]
  };
}

function createRuntimeStage(snapshot: SnapshotManifest): RestoreStage {
  const nodeEnv = snapshot.collectors["node-env"]?.data as { node?: string | null } | undefined;

  return {
    id: "runtime",
    label: "Runtime tools",
    actions: [
      action("ensure-git", "Ensure git is installed", "low", "git --version"),
      action("ensure-node", `Ensure Node.js ${nodeEnv?.node ?? "20+"} is installed`, "medium", "node --version")
    ]
  };
}

function createPackageStage(snapshot: SnapshotManifest): RestoreStage {
  const nodeEnv = snapshot.collectors["node-env"]?.data as { globalPackages?: string[] } | undefined;
  const packages = nodeEnv?.globalPackages ?? [];

  return {
    id: "packages",
    label: "Packages",
    actions: packages.length
      ? packages.map((packageName) =>
          action(`npm-global-${packageName}`, `Install npm global package ${packageName}`, "medium", `npm install -g ${packageName}`)
        )
      : [action("no-global-packages", "No npm global packages recorded", "low")]
  };
}

function createConfigStage(snapshot: SnapshotManifest): RestoreStage {
  return {
    id: "config-files",
    label: "Config files",
    actions: snapshot.files.length
      ? snapshot.files.map((file) =>
          action(`restore-${file.storedPath}`, `Restore ${file.sourcePath}`, "medium")
        )
      : [action("no-config-files", "No config files selected for restore", "low")]
  };
}

function createVerifyStage(): RestoreStage {
  return {
    id: "verify",
    label: "Verification",
    actions: [
      action("rescan", "Run collectors again and compare with target snapshot", "low"),
      action("write-report", "Write restore report", "low")
    ]
  };
}

function action(
  id: string,
  label: string,
  risk: RestoreAction["risk"],
  command?: string
): RestoreAction {
  return {
    id: id.replace(/[^a-zA-Z0-9._-]+/g, "-"),
    label,
    command,
    risk,
    requiresPrivilege: false
  };
}
