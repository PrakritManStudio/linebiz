import { describe, expect, it } from "vitest";
import { LineBizClient } from "../../src/client.js";
import { ValidationError } from "../../src/core/errors.js";
import { botDetailFixture, botsPageFixture } from "../fixtures/bots.js";
import { meFixture } from "../fixtures/me.js";
import { ownersFixture } from "../fixtures/owners.js";
import { tagsFixture } from "../fixtures/tags.js";
import { BOT, client } from "../helpers/client.js";
import { json, mockFetch } from "../helpers/mock-fetch.js";

describe("me / bots / owners / tags", () => {
  it("me.retrieve", async () => {
    const m = mockFetch(json(meFixture));
    expect(await client(m).me.retrieve()).toEqual(meFixture);
  });

  it("bots.list URL + paging", async () => {
    const m = mockFetch(
      json({ ...botsPageFixture, next: "n1" }),
      json({ list: [], next: undefined }),
    );
    const all = await client(m).bots.list({ limit: 10 }).toArray();
    expect(new URL(m.calls[0]!.url).search).toBe("?noFilter=true&limit=10");
    expect(new URL(m.calls[1]!.url).searchParams.get("next")).toBe("n1");
    expect(all).toHaveLength(botsPageFixture.list.length);
  });

  it("bots.list default limit 1000 and range", async () => {
    const m = mockFetch(json(botsPageFixture));
    await client(m).bots.list();
    expect(new URL(m.calls[0]!.url).searchParams.get("limit")).toBe("1000");
    await expect(client(mockFetch()).bots.list({ limit: 1001 })).rejects.toBeInstanceOf(
      ValidationError,
    );
  });

  it("bots.list starts from the given cursor", async () => {
    const m = mockFetch(json(botsPageFixture));
    await client(m).bots.list({ cursor: "c0" });
    expect(new URL(m.calls[0]!.url).searchParams.get("next")).toBe("c0");
  });

  it("bots.retrieve", async () => {
    const m = mockFetch(json(botDetailFixture));
    await client(m).bots.retrieve(BOT);
    expect(m.calls[0]!.url).toBe(`https://chat.line.biz/api/v1/bots/${BOT}?noFilter=true`);
  });

  it("invalid botId rejects without request", async () => {
    const m = mockFetch();
    await expect(client(m).bots.retrieve("bad")).rejects.toBeInstanceOf(ValidationError);
    expect(m.calls).toHaveLength(0);
  });

  it("validate:false lets odd IDs through but encodes them", async () => {
    const m = mockFetch(json(botDetailFixture));
    await new LineBizClient({ cookies: "a=1", fetch: m.fetch, validate: false }).bots.retrieve(
      "a/b",
    );
    expect(m.calls[0]!.url).toContain("/bots/a%2Fb?");
  });

  it("owners.list bizIds", async () => {
    const m = mockFetch(json(ownersFixture));
    const ids = ["123e4567-e89b-12d3-a456-426614174000"];
    expect(await client(m).owners.list(BOT, { bizIds: ids })).toEqual(ownersFixture.list);
    expect(new URL(m.calls[0]!.url).searchParams.get("bizIds")).toBe(ids[0]);
  });

  it("owners.list omits bizIds when not given and validates them", async () => {
    const m = mockFetch(json(ownersFixture));
    await client(m).owners.list(BOT);
    expect(new URL(m.calls[0]!.url).search).toBe("");
    await expect(client(mockFetch()).owners.list(BOT, { bizIds: ["nope"] })).rejects.toBeInstanceOf(
      ValidationError,
    );
  });

  it("tags.list validates tagIds (regression: previously unvalidated)", async () => {
    await expect(client(mockFetch()).tags.list(BOT, { tagIds: ["bad id"] })).rejects.toBeInstanceOf(
      ValidationError,
    );
    const m = mockFetch(json(tagsFixture));
    expect(await client(m).tags.list(BOT, { tagIds: ["t1", "t2"] })).toEqual(tagsFixture.list);
    expect(new URL(m.calls[0]!.url).searchParams.get("tagIds")).toBe("t1,t2");
  });

  it("tags.list omits tagIds when not given", async () => {
    const m = mockFetch(json(tagsFixture));
    await client(m).tags.list(BOT);
    expect(new URL(m.calls[0]!.url).search).toBe("");
  });
});
