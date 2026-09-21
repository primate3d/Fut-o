import fs from "node:fs/promises";
import path from "node:path";
import { env } from "@/lib/env";
import { RequestError } from "../request-error";

export interface StorageProvider {
  put(fileName: string, buffer: Buffer): Promise<void>;
  get(fileName: string): Promise<Buffer | null>;
  delete(fileName: string): Promise<void>;
}

export function validatePhysicalFileName(fileName: string) {
  if (!fileName || fileName.length > 255 || /[\\/:\x00-\x1f]/.test(fileName) ||
      fileName === "." || fileName === ".." || /[. ]$/.test(fileName)) {
    throw new RequestError("Nom de fichier non autorise", 403);
  }
  return fileName;
}

export class LocalStorageProvider implements StorageProvider {
  private readonly baseDir: string;

  constructor(baseDir = env.UPLOADS_DIR) {
    this.baseDir = path.resolve(baseDir);
  }

  private resolve(fileName: string) {
    return path.join(this.baseDir, validatePhysicalFileName(fileName));
  }

  private async exists(filePath: string) {
    try {
      const stat = await fs.lstat(filePath);
      if (!stat.isFile() || stat.isSymbolicLink()) throw new RequestError("Fichier non autorise", 403);
      return true;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
      throw error;
    }
  }

  async put(fileName: string, buffer: Buffer) {
    const filePath = this.resolve(fileName);
    await fs.mkdir(this.baseDir, { recursive: true });
    await fs.writeFile(filePath, buffer, { flag: "wx" });
  }

  async get(fileName: string): Promise<Buffer | null> {
    const filePath = this.resolve(fileName);
    return await this.exists(filePath) ? fs.readFile(filePath) : null;
  }

  async delete(fileName: string) {
    const filePath = this.resolve(fileName);
    if (await this.exists(filePath)) await fs.unlink(filePath);
  }
}

// Futurs providers (ex: S3) pourront être ajoutés ici et instanciés selon une variable d'environnement
// export class S3StorageProvider implements StorageProvider { ... }

export const storage: StorageProvider = new LocalStorageProvider();
