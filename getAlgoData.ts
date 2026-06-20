import { PageWithCursor } from "puppeteer-real-browser";
import { sleep } from "moderndash";

type AlgoData = {
  decision: string;
};

export async function getAlgoData({
  page,
  url,
}: {
  page: PageWithCursor;
  url: string;
}): Promise<AlgoData> {
  console.log(`Navigating to ${url}...`);
  await page.goto(url, { waitUntil: "domcontentloaded" });
  await sleep(5000);

  const getValue = async (selector: string) =>
    page
      .$eval(selector, (el) => el.textContent?.trim() || "unknown")
      .catch(() => "unknown");

  return {
    decision: await getValue("#decision-section .kpi-value"),
  };
}
