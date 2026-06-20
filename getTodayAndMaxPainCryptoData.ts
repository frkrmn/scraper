import { KmquantData } from "./scrape-kmquant";
import { PageWithCursor } from "puppeteer-real-browser";

type TodayAndMaxPainCryptoData = {
  btc: Pick<KmquantData["btc"], "today" | "maxPain">;
  eth: Pick<KmquantData["eth"], "today" | "maxPain">;
};

export const getTodayAndMaxPainCryptoData = async ({
  page,
}: {
  page: PageWithCursor;
}): Promise<TodayAndMaxPainCryptoData> => {
  console.log("Extracting Bitcoin vs Max Pain data...");
  const btcTodayText = await page
    .$eval("#btcLatestPrice", (el) => el.textContent?.trim() || "0")
    .catch(() => "0");
  const btcMaxPainText = await page
    .$eval("#btcPainPrice", (el) => el.textContent?.trim() || "0")
    .catch(() => "0");

  console.log("Extracting Ethereum vs Max Pain data...");
  const ethTodayText = await page
    .$eval("#ethLatestPrice", (el) => el.textContent?.trim() || "0")
    .catch(() => "0");
  const ethMaxPainText = await page
    .$eval("#ethPainPrice", (el) => el.textContent?.trim() || "0")
    .catch(() => "0");

  const btc: Pick<KmquantData["btc"], "today" | "maxPain"> = {
    today: btcTodayText,
    maxPain: btcMaxPainText,
  };
  console.log("Extracted BTC data:", btc);

  const eth: Pick<KmquantData["eth"], "today" | "maxPain"> = {
    today: ethTodayText,
    maxPain: ethMaxPainText,
  };
  console.log("Extracted ETH data:", eth);

  return {
    btc,
    eth,
  };
};
