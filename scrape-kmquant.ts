import dotenv from "dotenv";
import * as fs from "fs";
import * as path from "path";
import { connect } from "puppeteer-real-browser";
import { getTodayAndMaxPainCryptoData } from "./getTodayAndMaxPainCryptoData";
import { getAlgoData } from "./getAlgoData";
import { getSpeedometerData } from "./getSpeedometerData";
import { login } from "./login";
import {
  getTopAltcoinPerformanceData,
  TopAltcoinPerformance,
} from "./getTopAltcoinPerformanceData";
import { getMarketPulseCryptoData } from "./getMarketPulseCryptoData";
import { NormalizedDecision } from "./getAlgoData";
import { createClient } from "@supabase/supabase-js";

dotenv.config({ path: process.env.KMQUANT_ENV_FILE || ".env.local", quiet: true });

const log = (event: string, fields: Record<string, unknown> = {}) =>
  console.log(JSON.stringify({ time: new Date().toISOString(), event, ...fields }));

function validate(data: KmquantData) {
  const price = (value: string) => Number(value.replace(/[^\d.,-]/g, "").replace(/,/g, ""));
  for (const asset of [data.btc, data.eth]) {
    for (const field of ["today", "maxPain"] as const) {
      if (!Number.isFinite(price(asset[field])) || price(asset[field]) <= 0)
        throw new Error(`Invalid ${asset.name}.${field}`);
    }
    for (const field of ["short", "mid", "long"] as const) {
      if (!asset[field].rawDecision || asset[field].rawDecision === "unknown")
        throw new Error(`Missing ${asset.name}.${field} decision`);
    }
    if (!asset.speedometer || asset.speedometer === "unknown")
      throw new Error(`Missing ${asset.name}.speedometer`);
  }
  if (!data.marketpulseCrypto || data.marketpulseCrypto === "unknown")
    throw new Error("Missing marketpulseCrypto");
  if (!data.topAltcoinPerformance.period || data.topAltcoinPerformance.data.length === 0)
    throw new Error("Missing altcoin performance");
  if (data.topAltcoinPerformance.data.some(row => !row.symbol || !row.performance))
    throw new Error("Incomplete altcoin performance");
  if (Date.now() - Date.parse(data.lastUpdated) > 15 * 60_000)
    throw new Error("Stale KMQuant data");
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
    turnstile: false,
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
    if (await page.$('input[name="email"]'))
      throw new Error("KMQuant login verification failed: redirected to login");

    const { btc: btcTodayAndMaxPain, eth: ethTodayAndMaxPain } =
      await getTodayAndMaxPainCryptoData({ page });

    const marketpulseCrypto = await getMarketPulseCryptoData({ page });

    const { btc: btcSpeedometerData, eth: ethSpeedometerData } =
      await getSpeedometerData({ page });

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
    console.log("Extracted ETH data:", ethData);

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
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY)
    throw new Error("Supabase credentials are required");
  let res: KmquantData | undefined;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      log("scrape_start", { attempt });
      res = await main();
      validate(res);
      break;
    } catch (error) {
      log("scrape_failed", { attempt, error: String(error) });
      if (String(error).includes("login verification failed")) throw error;
      if (attempt === 3) throw error;
      await new Promise(resolve => setTimeout(resolve, attempt * 10_000));
    }
  }
  if (!res) throw new Error("No KMQuant data");

  // 1. JSON dosyasına kaydet (anlık veri için)
  const apiDir = path.join(process.cwd(), "public", "api");
  if (!fs.existsSync(apiDir)) {
    fs.mkdirSync(apiDir, { recursive: true });
  }
  const filePath = path.join(apiDir, "latest.json");
  {
    const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
    const today = new Date().toISOString().split("T")[0];

    const { error } = await supabase
      .from("max_pain_history")
      .upsert(
        {
          date: today,
          btc_price: res.btc.today,
          btc_max_pain: res.btc.maxPain,
          eth_price: res.eth.today,
          eth_max_pain: res.eth.maxPain,
        },
        { onConflict: "date" } // aynı güne iki kez yazılmasın
      );

    if (error) throw new Error(`Supabase max_pain_history: ${error.message}`);
    log("supabase_saved", { date: today });
  }
  const tempPath = `${filePath}.${process.pid}.tmp`;
  fs.writeFileSync(tempPath, JSON.stringify(res, null, 2), "utf-8");
  fs.renameSync(tempPath, filePath);
  log("data_saved", { filePath });
}

run().catch(error => { log("fatal", { error: String(error) }); process.exitCode = 1; });
