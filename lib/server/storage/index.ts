import fs from "fs";
import path from "path";
import { env } from "@/lib/env";

export interface StorageProvider {
  put(fileName: string, buffer: Buffer): Promise<void>;
  get(fileName: string): Promise<Buffer | null>;
  delete(fileName: string): Promise<void>;
}

export class LocalStorageProvider implements StorageProvider {
  private baseDir: string;

  constructor() {
    this.baseDir = env.UPLOADS_DIR;
    if (!fs.existsSync(this.baseDir)) {
      fs.mkdirSync(this.baseDir, { recursive: true });
    }
  }

  async put(fileName: string, buffer: Buffer): Promise<void> {
    const filePath = path.join(this.baseDir, fileName);
    fs.writeFileSync(filePath, buffer);
  }

  async get(fileName: string): Promise<Buffer | null> {
    const filePath = path.join(this.baseDir, fileName);
    if (!fs.existsSync(filePath)) {
      return null;
    }
    return fs.readFileSync(filePath);
  }

  async delete(fileName: string): Promise<void> {
    const filePath = path.join(this.baseDir, fileName);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  }
}

// Futurs providers (ex: S3) pourront être ajoutés ici et instanciés selon une variable d'environnement
// export class S3StorageProvider implements StorageProvider { ... }

export const storage: StorageProvider = new LocalStorageProvider();
