import type { Owner } from "../../src/types/index.js";
import { BIZ_ID } from "./ids.js";

export const ownersFixture: { list: Owner[] } = {
  list: [
    {
      bizId: BIZ_ID,
      name: "Test Admin",
      linePictureUri: "https://example.invalid/picture.png",
    },
  ],
};
