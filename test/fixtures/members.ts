import type { Member } from "../../src/types/index.js";
import { USER_ID } from "./ids.js";

export const membersPageFixture: { list: Member[]; next?: string } = {
  list: [{ userId: USER_ID, name: "Fake User", iconHash: "fakeiconhash" }],
  next: "fake-next-cursor",
};
