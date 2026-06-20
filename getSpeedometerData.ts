import { KMAQUANT_PAGES } from "./scrape-kmquant";
import { PageWithCursor } from "puppeteer-real-browser";
import { sleep } from "moderndash";

type SpeedometerData = {
  btc: string;
  eth: string;
};

export const getSpeedometerData = async ({
  page,
}: {
  page: PageWithCursor;
}): Promise<SpeedometerData> => {
  console.log("Navigating to speedometer page...");
  await page.goto(KMAQUANT_PAGES.SPEEDOMETER_PAGE, {
    waitUntil: "domcontentloaded",
  });
  await sleep(4000);

  const btcValue = await page
    .$eval(
      "#container-speed1 .highcharts-data-label text",
      (el) => el.textContent?.trim() || "unknown",
    )
    .catch(() => "unknown");

  const ethValue = await page
    .$eval(
      "#container-speed2 .highcharts-data-label text",
      (el) => el.textContent?.trim() || "unknown",
    )
    .catch(() => "unknown");

  console.log("Extracted BTC speedometer data:", {
    "btc": btcValue,
    "eth": ethValue,
  });

  return {
    btc: btcValue,
    eth: ethValue,
  };
};
