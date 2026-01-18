import { createClient } from "@supabase/supabase-js";

type PageRow = {
  id: string;
  name: string;
  title?: string | null;
};

type PageScreenshotRow = {
  id: string;
  page_id: string;
  url: string;
  label?: string | null;
  width?: number | null;
  height?: number | null;
};

export type PageWithScreenshots = {
  id: string;
  name: string;
  title?: string | null;
  screenshots: Array<{
    id: string;
    url: string;
    label?: string | null;
    width?: number | null;
    height?: number | null;
  }>;
};

const getSupabaseClient = () => {
  const url = process.env.SUPABASE_URL?.trim();
  const serviceRoleKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() ||
    process.env.SUPABASE_ANON_KEY?.trim();

  if (!url || !serviceRoleKey) {
    throw new Error(
      "Missing Supabase credentials (SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY).",
    );
  }

  return createClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
};

export const fetchPagesWithScreenshots = async (
  pageNames: string[],
): Promise<PageWithScreenshots[]> => {
  const names = pageNames.map((name) => name.trim()).filter(Boolean);
  if (names.length === 0) {
    return [];
  }

  const client = getSupabaseClient();
  const { data: pages, error: pagesError } = await client
    .from("pages")
    .select("id,name,title")
    .in("name", names);

  if (pagesError) {
    throw new Error(pagesError.message);
  }

  const pageRows = (pages ?? []) as PageRow[];
  if (pageRows.length === 0) {
    return [];
  }

  const pageIds = pageRows.map((page) => page.id);
  const { data: screenshots, error: screenshotsError } = await client
    .from("page_screenshots")
    .select("id,page_id,url,label,width,height")
    .in("page_id", pageIds);

  if (screenshotsError) {
    throw new Error(screenshotsError.message);
  }

  const screenshotRows = (screenshots ?? []) as PageScreenshotRow[];
  const screenshotsByPage = new Map<string, PageWithScreenshots["screenshots"]>();

  for (const screenshot of screenshotRows) {
    const existing = screenshotsByPage.get(screenshot.page_id) ?? [];
    existing.push({
      id: screenshot.id,
      url: screenshot.url,
      label: screenshot.label ?? undefined,
      width: screenshot.width ?? undefined,
      height: screenshot.height ?? undefined,
    });
    screenshotsByPage.set(screenshot.page_id, existing);
  }

  return pageRows.map((page) => ({
    id: page.id,
    name: page.name,
    title: page.title ?? null,
    screenshots: screenshotsByPage.get(page.id) ?? [],
  }));
};
