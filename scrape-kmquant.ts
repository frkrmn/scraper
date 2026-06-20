import dotenv from "dotenv";
import * as fs from "fs";
import * as path from "path";
import { connect } from "puppeteer-real-browser";
import isCI from "is-ci";
import { getTodayAndMaxPainCryptoData } from "./getTodayAndMaxPainCryptoData";
import { getAlgoData } from "./getAlgoData";
import { sleep } from "moderndash";
import { getSpeedometerData } from "./getSpeedometerData";
import { login } from "./login";
import {
  getTopAltcoinPerformanceData,
  TopAltcoinPerformance,
} from "./getTopAltcoinPerformanceData";
import { getMarketPulseCryptoData } from "./getMarketPulseCryptoData";
import { NormalizedDecision } from "./getAlgoData";

if (!isCI) {
  dotenv.config({ path: ".env.local" });
}

type CryptoPosition = {
  decision: NormalizedDecision;
  rawDecision: string;
};

export type KmquantData = {
  btc: {
    name: string | "BTC";
    today: string;
    maxPain: string;
    short: CryptoPosition;
    mid: CryptoPosition;
    long: CryptoPosition;
    speedometer: string;
  };
  eth: {
    name: string | "ETH";
    today: string;
    maxPain: string;
    short: CryptoPosition;
    mid: CryptoPosition;
    long: CryptoPosition;
    speedometer: string;
  };
  topAltcoinPerformance: TopAltcoinPerformance;
  marketpulseCrypto: string;
  lastUpdated: string;
};

export const KMAQUANT_PAGES = {
  LOGIN_PAGE: "https://kmquant.com/panel/panel.php",
  APP_PAGE: "https://kmquant.com/app",
  SPEEDOMETER_PAGE: "https://kmquant.com/app/speedometer.php",
  BTC_SHORT_ALGO_PAGE: "https://kmquant.com/app/btckisa.php",
  BTC_MID_ALGO_PAGE: "https://kmquant.com/app/btcorta.php",
  BTC_LONG_ALGO_PAGE: "https://kmquant.com/app/btcuzun.php",
  ETH_SHORT_ALGO_PAGE: "https://kmquant.com/app/ethkisa.php",
  ETH_MID_ALGO_PAGE: "https://kmquant.com/app/ethorta.php",
  ETH_LONG_ALGO_PAGE: "https://kmquant.com/app/ethuzun.php",
  TOP_ALTCOIN_PERFORMANCE_PAGE: "https://kmquant.com/app/btcpair.php",
};

async function main(): Promise<KmquantData> {
  const { browser, page } = await connect({
    headless: false,
    args: [],
    customConfig: {},
    turnstile: true,
    connectOption: {},
    disableXvfb: false,
    ignoreAllFlags: false,
  });

  try {
    await login({ page });

    const currentUrl = page.url();
    console.log("Current URL after login:", currentUrl);

    if (!currentUrl.includes("/app/")) {
      console.log("Navigating to app page...");
      await page.goto(KMAQUANT_PAGES.APP_PAGE, {
        waitUntil: "domcontentloaded",
      });
    }

    await sleep(6000);

    // this have to come first since data is in /app page
    const { btc: btcTodayAndMaxPain, eth: ethTodayAndMaxPain } =
      await getTodayAndMaxPainCryptoData({ page });

    const marketpulseCrypto = await getMarketPulseCryptoData({ page });

    await sleep(4000);

    const { btc: btcSpeedometerData, eth: ethSpeedometerData } =
      await getSpeedometerData({ page });

    await sleep(4000);

    const topAltcoinPerformanceResult = await getTopAltcoinPerformanceData({
      page,
    });

    const btcData: KmquantData["btc"] = {
      name: "BTC",
      today: btcTodayAndMaxPain.today,
      maxPain: btcTodayAndMaxPain.maxPain,
      short: await getAlgoData({
        page,
        url: KMAQUANT_PAGES.BTC_SHORT_ALGO_PAGE,
      }),
      mid: await getAlgoData({ page, url: KMAQUANT_PAGES.BTC_MID_ALGO_PAGE }),
      long: await getAlgoData({ page, url: KMAQUANT_PAGES.BTC_LONG_ALGO_PAGE }),
      speedometer: btcSpeedometerData,
    };
    console.log("Extracted BTC data:", btcData);

    const ethData: KmquantData["eth"] = {
      name: "ETH",
      today: ethTodayAndMaxPain.today,
      maxPain: ethTodayAndMaxPain.maxPain,
      short: await getAlgoData({
        page,
        url: KMAQUANT_PAGES.ETH_SHORT_ALGO_PAGE,
      }),
      mid: await getAlgoData({ page, url: KMAQUANT_PAGES.ETH_MID_ALGO_PAGE }),
      long: await getAlgoData({ page, url: KMAQUANT_PAGES.ETH_LONG_ALGO_PAGE }),
      speedometer: ethSpeedometerData,
    };
    console.log("Extracted ETH data:", btcData);

    return {
      btc: btcData,
      eth: ethData,
      topAltcoinPerformance: topAltcoinPerformanceResult,
      marketpulseCrypto,
      lastUpdated: new Date().toISOString(),
    };
  } finally {
    await browser.close();
  }
}

async function run() {
  const res = await main();

  const apiDir = path.join(process.cwd(), "public", "api");
  if (!fs.existsSync(apiDir)) {
    fs.mkdirSync(apiDir, { recursive: true });
  }

  const filePath = path.join(apiDir, "latest.json");
  fs.writeFileSync(filePath, JSON.stringify(res, null, 2), "utf-8");
  console.log("✓ Data saved to", filePath);
  console.log("Final data:", res);
}

run().catch(console.error);
