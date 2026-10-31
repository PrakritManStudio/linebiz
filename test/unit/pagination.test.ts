import { beforeEach, describe, expect, it, vi } from "vitest";
import { UnexpectedResponseError, ValidationError } from "../../src/core/errors.js";
import {
  PagePromise,
  paginate,
  readListResponse,
  type FetchedPage,
  type PageFetcher,
} from "../../src/core/pagination.js";

const pages: Record<string, FetchedPage<number>> = {
  start: { items: [1, 2], nextCursor: "b", raw: {} },
  b: { items: [3], nextCursor: "c", raw: {} },
  c: { items: [4], nextCursor: undefined, raw: {} },
};
const fetcher = vi.fn((c: string | undefined) => Promise.resolve(pages[c ?? "start"]!));

describe("pagination", () => {
  beforeEach(() => {
    fetcher.mockClear();
  });

  it("first page", async () => {
    const p = await paginate(fetcher);
    expect(p.data).toEqual([1, 2]);
    expect(p.nextCursor).toBe("b");
    expect(p.hasNextPage()).toBe(true);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("getNextPage", async () => {
    expect((await (await paginate(fetcher)).getNextPage()).data).toEqual([3]);
  });

  it("getNextPage rejects on the last page", async () => {
    const last = await paginate(fetcher, "c");
    expect(last.hasNextPage()).toBe(false);
    await expect(last.getNextPage()).rejects.toThrow(/No next page/);
    await expect(last.getNextPage()).rejects.toBeInstanceOf(UnexpectedResponseError);
  });

  it("for await iterates all items", async () => {
    const out: number[] = [];
    for await (const n of paginate(fetcher)) out.push(n);
    expect(out).toEqual([1, 2, 3, 4]);
    expect(fetcher).toHaveBeenCalledTimes(3);
  });

  it("break stops fetching", async () => {
    for await (const n of paginate(fetcher)) {
      if (n === 2) break;
    }
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("toArray limits", async () => {
    expect(await paginate(fetcher).toArray({ maxPages: 2 })).toEqual([1, 2, 3]);
    expect(await paginate(fetcher).toArray({ maxItems: 3 })).toEqual([1, 2, 3]);
    expect(await paginate(fetcher).toArray({ maxItems: 1 })).toEqual([1]);
    expect(await paginate(fetcher).toArray()).toEqual([1, 2, 3, 4]);
  });

  it("toArray stops fetching once a limit is reached", async () => {
    await paginate(fetcher).toArray({ maxPages: 2 });
    expect(fetcher).toHaveBeenCalledTimes(2);
    fetcher.mockClear();
    await paginate(fetcher).toArray({ maxItems: 2 });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("resume from cursor", async () => {
    expect((await paginate(fetcher, "b")).data).toEqual([3]);
    expect(fetcher).toHaveBeenCalledWith("b");
  });

  it("cursor that does not advance", async () => {
    const stuck: PageFetcher<number> = () =>
      Promise.resolve({ items: [1], nextCursor: "same", raw: {} });
    await expect(paginate(stuck, "same").toArray()).rejects.toThrow(/did not advance/);
  });

  it("cursor that stops advancing on a later page", async () => {
    const stuck: PageFetcher<number> = (c) =>
      Promise.resolve({ items: [1], nextCursor: c ?? "x", raw: {} });
    const first = await paginate(stuck);
    await expect(first.getNextPage()).rejects.toBeInstanceOf(UnexpectedResponseError);
    await expect(paginate(stuck).toArray()).rejects.toThrow(/did not advance/);
  });

  it("readListResponse validates shape", () => {
    expect(readListResponse({ list: [1], backward: "x" }, "backward")).toEqual({
      items: [1],
      nextCursor: "x",
      raw: { list: [1], backward: "x" },
    });
    expect(readListResponse({ list: [], next: null }, "next").nextCursor).toBeUndefined();
    expect(readListResponse({ list: [], next: "" }, "next").nextCursor).toBeUndefined();
    expect(() => readListResponse({ list: "nope" }, "next")).toThrow(UnexpectedResponseError);
    expect(() => readListResponse({ list: [], next: 5 }, "next")).toThrow(UnexpectedResponseError);
    expect(() => readListResponse(undefined, "next")).toThrow(UnexpectedResponseError);
  });

  it("fetcher error rejects", async () => {
    await expect(
      paginate(() => Promise.reject(new ValidationError({ param: "p", value: 1, reason: "r" }))),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("synchronous fetcher throw rejects instead of throwing", async () => {
    const p = paginate(() => {
      throw new ValidationError({ param: "p", value: 1, reason: "r" });
    });
    await expect(p).rejects.toBeInstanceOf(ValidationError);
    await expect(
      paginate(() => {
        throw new Error("boom");
      }).toArray(),
    ).rejects.toThrow("boom");
  });

  it("then() returns a plain Promise", async () => {
    const chained = paginate(fetcher).then((x) => x);
    expect(chained).not.toBeInstanceOf(PagePromise);
    await chained;
  });
});
