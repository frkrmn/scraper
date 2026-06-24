import * as fs from "fs";
import * as path from "path";
import { connect } from "puppeteer-real-browser";
import isCI from "is-ci";
import dotenv from "dotenv";

if (!isCI) {
  dotenv.config({ path: ".env.local" });
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

  try {
    console.log("Navigating to amsflow gold page...");
    await page.goto("https://amsflow.com/data-reports/sentiment/gold", {
      waitUntil: "domcontentloaded",
    });

    // Sayfanin yuklenmesi icin bekle
    await new Promise((r) => setTimeout(r, 8000));

    // Ham HTML'i kaydet
    const html = await page.content();
    fs.writeFileSync("debug-amsflow.html", html, "utf-8");
    console.log("✓ Saved full HTML to debug-amsflow.html");

    // Ayrica body text'ini de kaydet - daha okunakli
    const bodyText = await page.evaluate(() => document.body.innerText);
    fs.writeFileSync("debug-amsflow-text.txt", bodyText, "utf-8");
    console.log("✓ Saved body text to debug-amsflow-text.txt");

    // Sayfa icindeki tum element/class isimlerini listele
    const elements = await page.evaluate(() => {
      const result: string[] = [];
      document.querySelectorAll("[class]").forEach((el) => {
        const tag = el.tagName.toLowerCase();
        const cls = el.className;
        const text = el.textContent?.trim().slice(0, 60) ?? "";
        if (text) result.push(`${tag}.${cls} => "${text}"`);
      });
      return result.slice(0, 100); // ilk 100 element
    });

    fs.writeFileSync("debug-amsflow-elements.txt", elements.join("\n"), "utf-8");
    console.log("✓ Saved element list to debug-amsflow-elements.txt");

  } finally {
    await browser.close();
  }
}

run().catch(console.error);
