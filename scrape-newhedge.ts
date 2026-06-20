// newhedge-scraper.ts
import dotenv from "dotenv";
import * as fs from "fs";
import * as path from "path";
import { connect, PageWithCursor } from "puppeteer-real-browser";
import isCI from "is-ci";

if (!isCI) {
  dotenv.config({ path: ".env.local" });
  console.log("Environment variables loaded from .env.local");
}

const NEWHEDGE_PAGES = {
  BTC_STH_REALIZED_PRICE_PAGE:
    "https://newhedge.io/bitcoin/short-term-holder-realized-price",
  BTC_SPENT_OUTPUT_PROFIT_RATIO_PAGE:
    "https://newhedge.io/bitcoin/spent-output-profit-ratio",
  BTC_LONG_TERM_HOLDER_REALIZED_PRICE:
    "https://newhedge.io/bitcoin/long-term-holder-realized-price",
  BTC_200_WEEK_MOVING_AVERAGE_HEATMAP_PAGE:
    "https://newhedge.io/bitcoin/200-week-moving-average-heatmap",
  BTC_REALIZED_PRICE_PAGE: "https://newhedge.io/bitcoin/realized-price",
};

type PageConfig = {
  url: string;
  needle: string;
  cssSelector: string;
};

const PAGE_CONFIGS: Record<keyof typeof NEWHEDGE_PAGES, PageConfig> = {
  BTC_STH_REALIZED_PRICE_PAGE: {
    url: NEWHEDGE_PAGES.BTC_STH_REALIZED_PRICE_PAGE,
    needle: "Realized Price STH",
    cssSelector: "p.realized-price-sth-selector",
  },
  BTC_SPENT_OUTPUT_PROFIT_RATIO_PAGE: {
    url: NEWHEDGE_PAGES.BTC_SPENT_OUTPUT_PROFIT_RATIO_PAGE,
    needle: "SOPR",
    cssSelector: "p.sopr-selector",
  },
  BTC_LONG_TERM_HOLDER_REALIZED_PRICE: {
    url: NEWHEDGE_PAGES.BTC_LONG_TERM_HOLDER_REALIZED_PRICE,
    needle: "Realized Price LTH",
    cssSelector: "p.realized-price-lth-selector",
  },
  BTC_200_WEEK_MOVING_AVERAGE_HEATMAP_PAGE: {
    url: NEWHEDGE_PAGES.BTC_200_WEEK_MOVING_AVERAGE_HEATMAP_PAGE,
    needle: "200WMA",
    cssSelector: "p[class*='200wma-selector']",
  },
  BTC_REALIZED_PRICE_PAGE: {
    url: NEWHEDGE_PAGES.BTC_REALIZED_PRICE_PAGE,
    needle: "Realized Price",
    cssSelector: "p.realized-price-selector",
  },
};

const delay = (ms: number) => new Promise((res) => setTimeout(res, ms));

type NewHedgeData = {
  btc: {
    name: "BTC";
    sthRealizedPrice: string;
    sopr: string;
    lthRealizedPrice: string;
    wma200: string;
    realizedPrice: string;
  };
  lastUpdated: string;
};

async function scrapeNewHedgePage(
  page: PageWithCursor,
  config: PageConfig,
): Promise<string> {
  console.log(`Navigating to ${config.url}...`);
  await page.goto(config.url, { waitUntil: "domcontentloaded" });

  await delay(6000);

  const result = await page.evaluate(
    (needle: string, cssSelector: string) => {
      // Strategy 1: direct selector query — works when the class is unique on the page
      const direct = document.querySelector(cssSelector);
      if (direct) return direct.textContent?.trim() ?? "unknown";

      // Strategy 2 (fallback): pick the innermost div that contains the needle
      const divs = Array.from(document.querySelectorAll("div"));
      const matching = divs.filter((div) => div.textContent?.includes(needle));
      const container = matching[matching.length - 1] as
        | HTMLElement
        | undefined;

      if (container) {
        const p = container.querySelector(cssSelector);
        if (p) return p.textContent?.trim() ?? "unknown";
      }

      // Strategy 3 (fallback): find div.has-text-left.infos-key-values whose h4 matches the needle
      const kvDivs = Array.from(
        document.querySelectorAll("div.has-text-left.infos-key-values"),
      );
      for (const kv of kvDivs) {
        const h4 = kv.querySelector("h4");
        if (h4?.textContent?.trim() === needle) {
          const p = kv.querySelector("p");
          if (p) return p.textContent?.trim() ?? "unknown";
        }
      }

      return "unknown";
    },
    config.needle,
    config.cssSelector,
  );

  console.log(`Extracted [${config.needle}]:`, result);
  return result;
}

async function main(): Promise<NewHedgeData> {
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
    console.log("Starting NewHedge BTC scraper...");

    const btcWMA200 = await scrapeNewHedgePage(
      page,
      PAGE_CONFIGS.BTC_200_WEEK_MOVING_AVERAGE_HEATMAP_PAGE,
    );
    await delay(4000);
    const btcSTHRealizedPrice = await scrapeNewHedgePage(
      page,
      PAGE_CONFIGS.BTC_STH_REALIZED_PRICE_PAGE,
    );
    await delay(4000);
    const btcSOPR = await scrapeNewHedgePage(
      page,
      PAGE_CONFIGS.BTC_SPENT_OUTPUT_PROFIT_RATIO_PAGE,
    );
    await delay(4000);
    const btcLTHRealizedPrice = await scrapeNewHedgePage(
      page,
      PAGE_CONFIGS.BTC_LONG_TERM_HOLDER_REALIZED_PRICE,
    );
    await delay(4000);
    const btcRealizedPrice = await scrapeNewHedgePage(
      page,
      PAGE_CONFIGS.BTC_REALIZED_PRICE_PAGE,
    );

    const response: NewHedgeData = {
      btc: {
        name: "BTC",
        sthRealizedPrice: btcSTHRealizedPrice,
        lthRealizedPrice: btcLTHRealizedPrice,
        sopr: btcSOPR,
        wma200: btcWMA200,
        realizedPrice: btcRealizedPrice,
      },
      lastUpdated: new Date().toISOString(),
    };

    console.log("Final scraped data:", response);

    return response;
  } finally {
    await browser.close();
  }
}

async function run() {
  const res: NewHedgeData = await main();

  const apiDir = path.join(process.cwd(), "public", "api");
  if (!fs.existsSync(apiDir)) {
    fs.mkdirSync(apiDir, { recursive: true });
  }

  const filePath = path.join(apiDir, "newhedge.json");
  fs.writeFileSync(filePath, JSON.stringify(res, null, 2), "utf-8");
  console.log("✓ Data saved to", filePath);
  console.log("Final Output:", res);
}

run().catch(console.error);
