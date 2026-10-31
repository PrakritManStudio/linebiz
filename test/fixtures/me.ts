import type { Me } from "../../src/types/index.js";
import { BIZ_ID } from "./ids.js";

export const meFixture: Me = {
  bizId: BIZ_ID,
  language: "en",
  name: "Test Admin",
  linePictureUri: "https://example.invalid/picture.png",
  localStorageEncryptionKey: "fake-encryption-key",
};
