import type { Tag } from "../../src/types/index.js";
import { TAG_ID } from "./ids.js";

export const tagsFixture: { list: Tag[] } = {
  list: [
    {
      tagId: TAG_ID,
      name: "vip",
      count: 1,
      createdAt: 1700000000000,
      updatedAt: 1700000000000,
    },
  ],
};
