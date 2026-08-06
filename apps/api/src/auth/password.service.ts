import { randomBytes, scrypt as nodeScrypt, timingSafeEqual } from "node:crypto";
import { Injectable } from "@nestjs/common";

const keyLength = 64;
const prefix = "scrypt-v1";

@Injectable()
export class PasswordService {
  async hash(password: string): Promise<string> {
    const salt = randomBytes(16);
    const derived = await this.scrypt(password, salt);
    return `${prefix}$${salt.toString("base64url")}$${derived.toString("base64url")}`;
  }

  async verify(password: string, encoded: string): Promise<boolean> {
    const [algorithm, saltText, hashText, extra] = encoded.split("$");
    if (algorithm !== prefix || !saltText || !hashText || extra) return false;
    try {
      const salt = Buffer.from(saltText, "base64url");
      const expected = Buffer.from(hashText, "base64url");
      if (salt.length !== 16 || expected.length !== keyLength) return false;
      const actual = await this.scrypt(password, salt);
      return timingSafeEqual(actual, expected);
    } catch {
      return false;
    }
  }

  private scrypt(password: string, salt: Buffer): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      nodeScrypt(password, salt, keyLength, (error, derivedKey) => {
        if (error) reject(error);
        else resolve(derivedKey);
      });
    });
  }
}
