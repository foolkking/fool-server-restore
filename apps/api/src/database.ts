import fs from "node:fs/promises";
import path from "node:path";
import type { CatalogItem } from "./catalog.js";
import { listCatalogItems } from "./catalog.js";
import { resolveFromRoot } from "./repo.js";

export interface AppDatabase {
  schemaVersion: string;
  catalog: CatalogItem[];
  migrationStrategies: MigrationStrategy[];
}

export interface MigrationStrategy {
  id: string;
  name: string;
  source: string;
  useCase: string;
  conflictModes: Array<"skip-existing" | "replace-existing">;
}

const seedPath = "configs/database/seed.json";

export async function readDatabase(): Promise<AppDatabase> {
  const absolutePath = resolveFromRoot(seedPath);

  try {
    const raw = await fs.readFile(absolutePath, "utf8");
    return normalizeDatabase(JSON.parse(raw) as AppDatabase);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    const seeded = createSeedDatabase();
    await fs.mkdir(path.dirname(absolutePath), { recursive: true });
    await fs.writeFile(absolutePath, `${JSON.stringify(seeded, null, 2)}\n`, "utf8");
    return seeded;
  }
}

function normalizeDatabase(database: AppDatabase): AppDatabase {
  return {
    ...database,
    catalog: database.catalog.length ? database.catalog : listCatalogItems()
  };
}

export async function listCatalogFromDatabase(): Promise<CatalogItem[]> {
  return (await readDatabase()).catalog;
}

export async function getCatalogItemFromDatabase(id: string): Promise<CatalogItem | undefined> {
  return (await listCatalogFromDatabase()).find((item) => item.id === id);
}

export async function readCatalogGuide(id: string): Promise<{
  item: CatalogItem;
  markdown: string;
}> {
  const item = await getCatalogItemFromDatabase(id);
  if (!item) {
    throw new Error(`Catalog item not found: ${id}`);
  }

  const markdown = await fs.readFile(resolveFromRoot(item.guidePath), "utf8");
  return { item, markdown };
}

export async function listMigrationStrategies(): Promise<MigrationStrategy[]> {
  return (await readDatabase()).migrationStrategies;
}

function createSeedDatabase(): AppDatabase {
  return {
    schemaVersion: "0.2.0",
    catalog: listCatalogItems(),
    migrationStrategies: [
      {
        id: "windows-usmt",
        name: "Windows User State Migration Tool style",
        source: "Microsoft USMT",
        useCase: "迁移用户文件、桌面偏好、应用设置和系统偏好，适合 Windows 到 Windows。",
        conflictModes: ["skip-existing", "replace-existing"]
      },
      {
        id: "rsync-home",
        name: "rsync home directory style",
        source: "rsync",
        useCase: "复制用户主目录、dotfiles 和应用数据目录，适合 Linux/macOS/SSH。",
        conflictModes: ["skip-existing", "replace-existing"]
      },
      {
        id: "declarative-profile",
        name: "Declarative profile style",
        source: "chezmoi / Home Manager",
        useCase: "用声明式清单恢复软件、alias、shell profile 和开发偏好，适合公开或半公开配置。",
        conflictModes: ["skip-existing", "replace-existing"]
      }
    ]
  };
}
