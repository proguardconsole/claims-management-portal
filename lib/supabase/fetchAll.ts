type Result<T> = { data: T[] | null; error: { message: string } | null }

const PAGE = 1000

/**
 * Drains a PostgREST query past the server's 1,000-row response cap.
 * .limit() alone cannot exceed the cap — Supabase max-rows truncates the
 * response server-side — so reads that can grow past 1,000 rows must page.
 *
 * Pass a factory that builds a FRESH query per call and applies the given
 * .range() bounds. Include an .order() in the query for stable paging.
 */
export async function fetchAllRows<T>(
  build: (from: number, to: number) => PromiseLike<Result<T>>,
): Promise<{ data: T[]; error: { message: string } | null }> {
  const all: T[] = []
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await build(from, from + PAGE - 1)
    if (error) return { data: all, error }
    all.push(...(data ?? []))
    if ((data ?? []).length < PAGE) break
  }
  return { data: all, error: null }
}
