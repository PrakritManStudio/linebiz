import type { FlexContainer } from "../../src/types/index.js";

export const flexFixture: FlexContainer = {
  type: "bubble",
  body: {
    type: "box",
    layout: "vertical",
    contents: [{ type: "text", text: "hello" }],
  },
};
