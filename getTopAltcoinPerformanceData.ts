import { KMAQUANT_PAGES } from "./scrape-kmquant";
import { PageWithCursor } from "puppeteer-real-browser";
import { sleep } from "moderndash";

export type TopAltcoinPerformance = {
  period: string; // day
  data: {
    symbol: string;
    performance: string;
  }[];
};

const MAX_DATA_SIZE = 10;

// KMQUANT DEFAULT TOP ALTCOIN PERFORMANCE PERIOD IS 60 DAYS
export const getTopAltcoinPerformanceData = async ({
  page,
}: {
  page: PageWithCursor;
}): Promise<TopAltcoinPerformance> => {
  console.log("Navigating to top altcoin performance page...");

  await page.goto(KMAQUANT_PAGES.TOP_ALTCOIN_PERFORMANCE_PAGE, {
    waitUntil: "domcontentloaded",
  });

  await sleep(5000);

  // Wait for chart container
  await page.waitForSelector("#chartContainer svg", { timeout: 10000 });

  const performanceData = await page.evaluate(() => {
    const data: { symbol: string; performance: string }[] = [];

    // Get coin symbols from x-axis labels
    const symbols = document.querySelectorAll(".highcharts-xaxis-labels text");

    // Get performance percentages from data labels
    const performances = document.querySelectorAll(
      ".highcharts-data-labels .highcharts-data-label text",
    );

    // Combine symbols with their performance values
    symbols.forEach((symbolEl, i) => {
      const symbol = symbolEl.textContent?.trim();
      const performance = performances[i]?.textContent?.trim();

      if (symbol && performance) {
        data.push({ symbol, performance });
      }
    });

    return data;
  });

  const period =
    (await page.evaluate(() => {
      const select = document.querySelector<HTMLSelectElement>("#daysSelect");
      if (!select) return null;

      return select.value;
    })) ?? "60";

  console.log(
    `Extracted TopAltcoinPerformanceData ${performanceData?.slice(0, MAX_DATA_SIZE)}`,
  );

  return {
    period,
    data: performanceData?.slice(0, MAX_DATA_SIZE),
  };
};
