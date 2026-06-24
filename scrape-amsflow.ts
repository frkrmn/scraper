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
  await delay(6000);

  const data = await page.evaluate(() => {
    const bodyText = document.body.innerText;

    // --- Ana skor ve classification ---
    // "FEAR & GREED INDEX\n\n21\n\nEXTREME FEAR" formatında geliyor
    let score: number | null = null;
    let classification = "unknown";

    const fgiMatch = bodyText.match(/FEAR & GREED INDEX\s+(\d+)\s+([A-Z ]+)/);
    if (fgiMatch) {
      score = parseInt(fgiMatch[1], 10);
      // "EXTREME FEAR" -> "Extreme Fear" formatına çevir
      classification = fgiMatch[2].trim()
        .toLowerCase()
        .replace(/\b\w/g, (c) => c.toUpperCase());
    }

    // --- Historical values ---
    // "Yesterday\nExtreme Fear – 22" formatında
    function extractHistorical(keyword: string) {
      const regex = new RegExp(keyword + "\\s+([\\w ]+?)\\s*[–\\-]\\s*(\\d+)");
      const m = bodyText.match(regex);
      if (m) return { score: parseInt(m[2], 10), classification: m[1].trim() };
      return { score: null, classification: "unknown" };
    }

    const yesterday = extractHistorical("Yesterday");
    const lastWeek  = extractHistorical("Last Week");
    const lastMonth = extractHistorical("Last Month");

    // --- Yearly high & low ---
    // "Yearly High\nJan 27, 2026\nExtreme Greed – 91"
    function extractYearly(keyword: string) {
      const regex = new RegExp(
        keyword + "\\s+([A-Za-z]+ \\d+, \\d{4})\\s+([\\w ]+?)\\s*[–\\-]\\s*(\\d+)"
      );
      const m = bodyText.match(regex);
      if (m) return {
        date: m[1].trim(),
        classification: m[2].trim(),
        score: parseInt(m[3], 10),
      };
      return { date: "unknown", classification: "unknown", score: null };
    }

    const yearlyHigh = extractYearly("Yearly High");
    const yearlyLow  = extractYearly("Yearly Low");

    // --- Sidebar market listesi (tüm piyasalar buradan alınabilir) ---
    // "US Market\n43\nFear" formatında
    const sidebarMarkets: { label: string; score: number; classification: string }[] = [];
    const sidebarLinks = document.querySelectorAll("a.block.p-2.rounded-lg");
    sidebarLinks.forEach((link) => {
      const spans = link.querySelectorAll("span");
      if (spans.length >= 3) {
        const lbl = spans[0].textContent?.trim() ?? "";
        const sc  = parseInt(spans[1].textContent?.trim() ?? "0", 10);
        const cls = spans[2].textContent?.trim() ?? "";
        if (lbl && sc) sidebarMarkets.push({ label: lbl, score: sc, classification: cls });
      }
    });

    // --- History tablosu ---
    const history: { date: string; score: number | null; classification: string; assetPrice: string }[] = [];

    document.querySelectorAll("table").forEach((table) => {
      const headers = Array.from(table.querySelectorAll("thead th"))
        .map((th) => th.textContent?.trim().toLowerCase() ?? "");
      if (!headers.some((h) => h.includes("date"))) return;

      table.querySelectorAll("tbody tr").forEach((tr) => {
        const cells = Array.from(tr.querySelectorAll("td"))
          .map((td) => td.textContent?.trim() ?? "");
        if (cells.length >= 3) {
          const scoreMatch = cells[1].match(/\d+/);
          const dashMatch  = cells[2].match(/^(.*?)\s*[–\-]\s*(\d+)$/);
          history.push({
            date: cells[0],
            score: scoreMatch ? parseInt(scoreMatch[0], 10) : null,
            classification: dashMatch ? dashMatch[1].trim() : cells[2],
            assetPrice: cells[3] ?? "",
          });
        }
      });
    });

    return { score, classification, yesterday, lastWeek, lastMonth, yearlyHigh, yearlyLow, history, sidebarMarkets };
  });

  console.log(`✓ ${label}: score=${data.score}, class=${data.classification}, history=${data.history.length} rows`);
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
            lastWeek:  data.lastWeek,
            lastMonth: data.lastMonth,
          },
          yearlyHigh: data.yearlyHigh,
          yearlyLow:  data.yearlyLow,
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
