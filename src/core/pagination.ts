import { UnexpectedResponseError } from "./errors.js";

/** One page as returned by a {@link PageFetcher}. */
export interface FetchedPage<T> {
  /** Items on this page. */
  items: T[];
  /** Cursor for the following page, or `undefined` when this is the last page. */
  nextCursor: string | undefined;
  /** The unmodified response body. */
  raw: unknown;
}

/** Fetches the page identified by `cursor` (`undefined` = first page). */
export type PageFetcher<T> = (cursor: string | undefined) => Promise<FetchedPage<T>>;

/**
 * Validates a list response (`{ list: [...], <cursorField>?: string }`) and extracts the page.
 * @param raw Parsed response body.
 * @param cursorField Response field holding the cursor for the next page.
 * @returns The items, next cursor (`null` and empty string become `undefined`) and raw body.
 * @throws {UnexpectedResponseError} If `list` is not an array or the cursor is not a string.
 */
export function readListResponse<T>(
  raw: unknown,
  cursorField: "next" | "backward",
): FetchedPage<T> {
  if (typeof raw !== "object" || raw === null) {
    throw new UnexpectedResponseError("Expected an object list response", { body: raw });
  }
  const record = raw as { list?: unknown; next?: unknown; backward?: unknown };
  const list = record.list;
  if (!Array.isArray(list)) {
    throw new UnexpectedResponseError('Expected "list" to be an array', { body: raw });
  }
  const cursor = cursorField === "next" ? record.next : record.backward;
  if (cursor !== undefined && cursor !== null && typeof cursor !== "string") {
    throw new UnexpectedResponseError(`Expected "${cursorField}" to be a string`, { body: raw });
  }
  return {
    items: list as T[],
    nextCursor: cursor === undefined || cursor === null || cursor === "" ? undefined : cursor,
    raw,
  };
}

async function fetchPage<T>(fetcher: PageFetcher<T>, cursor: string | undefined): Promise<Page<T>> {
  const fetched = await fetcher(cursor);
  if (cursor !== undefined && fetched.nextCursor === cursor) {
    throw new UnexpectedResponseError("Pagination cursor did not advance");
  }
  return new Page(fetched, fetcher);
}

/** A single page of results, with access to the following page. */
export class Page<T> {
  /** Items on this page. */
  readonly data: T[];
  /** Cursor for the next page, or `undefined` on the last page. */
  readonly nextCursor: string | undefined;
  /** The unmodified response body. */
  readonly raw: unknown;
  readonly #fetcher: PageFetcher<T>;

  /**
   * @internal Pages are created by {@link paginate}; do not construct directly.
   * @param fetched The fetched page contents.
   * @param fetcher Fetcher used to load the following page.
   */
  constructor(fetched: FetchedPage<T>, fetcher: PageFetcher<T>) {
    this.data = fetched.items;
    this.nextCursor = fetched.nextCursor;
    this.raw = fetched.raw;
    this.#fetcher = fetcher;
  }

  /** Whether another page is available. */
  hasNextPage(): boolean {
    return this.nextCursor !== undefined;
  }

  /**
   * Fetches the following page.
   * @returns The next page.
   * @throws {UnexpectedResponseError} If there is no next page or the cursor did not advance.
   */
  getNextPage(): Promise<Page<T>> {
    if (this.nextCursor === undefined) {
      return Promise.reject(new UnexpectedResponseError("No next page"));
    }
    return fetchPage(this.#fetcher, this.nextCursor);
  }
}

/**
 * A promise of the first {@link Page} that can also be iterated item by item across pages.
 * `await` it for the first page, `for await` it for every item, or call {@link PagePromise.toArray}.
 */
export class PagePromise<T> extends Promise<Page<T>> implements AsyncIterable<T> {
  /** `then`/`catch`/`finally` return plain promises. */
  static override get [Symbol.species](): PromiseConstructor {
    return Promise;
  }

  #first(): Promise<Page<T>> {
    return this;
  }

  /** Iterates over every item, fetching further pages lazily and stopping when the consumer stops. */
  async *[Symbol.asyncIterator](): AsyncGenerator<T, void, undefined> {
    let page = await this.#first();
    for (;;) {
      yield* page.data;
      if (!page.hasNextPage()) return;
      page = await page.getNextPage();
    }
  }

  /**
   * Collects items into an array, fetching no more pages once a limit is reached.
   * @param options.maxPages Maximum number of pages to fetch.
   * @param options.maxItems Maximum number of items to return (result is truncated to it).
   * @returns The collected items.
   */
  async toArray(options?: { maxPages?: number; maxItems?: number }): Promise<T[]> {
    const maxPages = options?.maxPages ?? Infinity;
    const maxItems = options?.maxItems ?? Infinity;
    let page = await this.#first();
    const out: T[] = [...page.data];
    let fetchedPages = 1;
    while (page.hasNextPage() && fetchedPages < maxPages && out.length < maxItems) {
      page = await page.getNextPage();
      fetchedPages++;
      out.push(...page.data);
    }
    return out.length > maxItems ? out.slice(0, maxItems) : out;
  }
}

/**
 * Starts fetching the first page immediately and returns a {@link PagePromise}.
 * Errors (including synchronous throws from `fetcher`) reject the promise.
 * @param fetcher Loads a page for a cursor.
 * @param initialCursor Cursor to resume from; omit to start at the first page.
 * @returns A promise of the first page that is also async-iterable.
 */
export function paginate<T>(fetcher: PageFetcher<T>, initialCursor?: string): PagePromise<T> {
  const first = fetchPage(fetcher, initialCursor);
  return new PagePromise<T>((resolve, reject) => {
    first.then(resolve, reject);
  });
}
