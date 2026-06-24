import * as fs from "fs";
import * as path from "path";
import { connect, PageWithCursor } from "puppeteer-real-browser";
import isCI from "is-ci";
import dotenv from "dotenv";

if (!isCI) {
  dotenv.config({ path: ".env.local" });
}

const BASE_URL = "https://amsflow.com/data-reports/sentiment";

const MARKETS = [
  { key: "us",         label: "US Market",   slug: "us" },
  { key: "eu",         label: "EU Market",   slug: "eu" },
  { key: "uk",         label: "UK Market",   slug: "uk" },
  { key: "japan",      label: "Japan",       slug: "japan" },
  { key: "china",      label: "China",       slug: "china" },
  { key: "australia",  label: "Australia",   slug: "australia" },
  { key: "canada",     label: "Canada",      slug: "canada" },
  { key: "gold",       label: "Gold",        slug: "gold" },
  { key: "silver",     label: "Silver",      slug: "silver" },
  { key: "southkorea", label: "South Korea", slug: "southkorea" },
];

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function scrapeMarket(page: PageWithCursor, slug: string, label: string) {
  const url = `${BASE_URL}/${slug}`;
  console.log(`Navigating to ${url}...`);

  await page.goto(url, { waitUntil: "domcontentloaded" });
  await delay(5000);

  const data = await page.evaluate(() => {
    // --- Current score & classification ---
    // Score: büyük standalone sayı (0-100 arası)
    let score: number | null = null;
    let classification = "unknown";

    // Sayfadaki tüm metin node'larına bak, tek başına 1-3 haneli sayı ara
    document.querySelectorAll("h1,h2,h3,h4,p,span,div").forEach((el) => {
      const text = el.textContent?.trim() ?? "";
      if (/^\d{1,3}$/.test(text) && score === null) {
        const num = parseInt(text, 10);
        if (num >= 0 && num <= 100 && el.children.length === 0) {
          score = num;
        }
      }
    });

    const classWords = ["Extreme Fear", "Extreme Greed", "Fear", "Greed", "Neutral"];
    document.querySelectorAll("h1,h2,h3,h4,p,span,div").forEach((el) => {
      const text = el.textContent?.trim() ?? "";
      if (classWords.includes(text) && classification === "unknown" && el.children.length === 0) {
        classification = text;
      }
    });

    // --- Historical values ---
    const fullText = document.body.innerText;

    function extractHistorical(keyword: string) {
      const regex = new RegExp(keyword + "\\s*([\\w\\s]+?)\\s*[\\u2013\\-]\\s*(\\d+)");
      const m = fullText.match(regex);
      if (m) return { score: parseInt(m[2], 10), classification: m[1].trim() };
      return { score: null, classification: "unknown" };
    }

    const yesterday = extractHistorical("Yesterday");
    const lastWeek  = extractHistorical("Last\\s+Week");
    const lastMonth = extractHistorical("Last\\s+Month");

    // --- Yearly high & low ---
    function extractYearly(keyword: string) {
      const regex = new RegExp(keyword + "\\s+([\\w,\\s]+?\\d{4})\\s*([\\w\\s]+?)\\s*[\\u2013\\-]\\s*(\\d+)");
      const m = fullText.match(regex);
      if (m) return { date: m[1].trim(), classification: m[2].trim(), score: parseInt(m[3], 10) };
      return { date: "unknown", classification: "unknown", score: null };
    }

    const yearlyHigh = extractYearly("Yearly\\s+High");
    const yearlyLow  = extractYearly("Yearly\\s+Low");

    // --- History table ---
    const history: { date: string; score: number | null; classification: string; assetPrice: string }[] = [];

    document.querySelectorAll("table").forEach((table) => {
      const headers = Array.from(table.querySelectorAll("thead th")).map(
        (th) => th.textContent?.trim().toLowerCase() ?? ""
      );
      const hasDate = headers.some((h) => h.includes("date"));
      if (!hasDate) return;

      table.querySelectorAll("tbody tr").forEach((tr) => {
        const cells = Array.from(tr.querySelectorAll("td")).map(
          (td) => td.textContent?.trim() ?? ""
        );
        if (cells.length >= 3) {
          const scoreMatch = cells[1].match(/\d+/);
          const dashMatch = cells[2].match(/^(.*?)\s*[–\-]\s*(\d+)$/);
          history.push({
            date: cells[0],
            score: scoreMatch ? parseInt(scoreMatch[0], 10) : null,
            classification: dashMatch ? dashMatch[1].trim() : cells[2],
            assetPrice: cells[3] ?? "",
          });
        }
      });
    });

    return { score, classification, yesterday, lastWeek, lastMonth, yearlyHigh, yearlyLow, history };
  });

  console.log(`✓ ${label}: score=${data.score}, classification=${data.classification}, history=${data.history.length} rows`);
  return data;
}

async function run() {
  const { browser, page } = await connect({
    headless: false,
    args: [],
    customConfig: {},
    turnstile: true,
    connectOption: {},
    disableXvfb: false,
    ignoreAllFlags: false,
  });

  const results = [];

  try {
    for (const market of MARKETS) {
      try {
        const data = await scrapeMarket(page, market.slug, market.label);
        results.push({
          key: market.key,
          label: market.label,
          score: data.score,
          classification: data.classification,
          historical: {
            yesterday: data.yesterday,
            lastWeek: data.lastWeek,
            lastMonth: data.lastMonth,
          },
          yearlyHigh: data.yearlyHigh,
          yearlyLow: data.yearlyLow,
          history: data.history,
        });
      } catch (err) {
        console.error(`Failed to scrape ${market.label}:`, err);
        results.push({
          key: market.key,
          label: market.label,
          score: null,
          classification: "unknown",
          historical: {
            yesterday: { score: null, classification: "unknown" },
            lastWeek:  { score: null, classification: "unknown" },
            lastMonth: { score: null, classification: "unknown" },
          },
          yearlyHigh: { date: "unknown", score: null, classification: "unknown" },
          yearlyLow:  { date: "unknown", score: null, classification: "unknown" },
          history: [],
        });
      }

      await delay(3000);
    }
  } finally {
    await browser.close();
  }

  const output = { markets: results, lastUpdated: new Date().toISOString() };

  const apiDir = path.join(process.cwd(), "public", "api");
  if (!fs.existsSync(apiDir)) fs.mkdirSync(apiDir, { recursive: true });

  const filePath = path.join(apiDir, "amsflow.json");
  fs.writeFileSync(filePath, JSON.stringify(output, null, 2), "utf-8");
  console.log("✓ Amsflow data saved to", filePath);
}

run().catch(console.error);
