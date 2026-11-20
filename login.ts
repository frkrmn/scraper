import { KMAQUANT_PAGES } from "./scrape-kmquant";
import { PageWithCursor } from "puppeteer-real-browser";

export const login = async ({ page }: { page: PageWithCursor }) => {
  console.log("Navigating to login page...");
  await page.goto(KMAQUANT_PAGES.LOGIN_PAGE, {
    waitUntil: "domcontentloaded",
    timeout: 30000,
  });

  console.log("Waiting for login form...");
  await page.waitForSelector('input[name="email"]', {
    timeout: 15000,
  });
  await page.waitForFunction(() =>
    Boolean((document.querySelector('[name="cf-turnstile-response"]') as HTMLInputElement | null)?.value),
    { timeout: 60000 });

  if (!process.env.KMQUANT_EMAIL || !process.env.KMQUANT_PASSWORD) {
    throw new Error("KMQUANT_EMAIL and KMQUANT_PASSWORD are required");
  }
  console.log("Filling email...");
  await page.type('input[name="email"]', process.env.KMQUANT_EMAIL, {
    delay: 2,
  });
  console.log("Filling password...");
  await page.type('input[name="password"]', process.env.KMQUANT_PASSWORD, {
    delay: 2,
  });
  console.log("Clicking login button...");
  await Promise.all([
    page.waitForNavigation({ waitUntil: "domcontentloaded", timeout: 30000 }),
    page.click('button[name="login"]'),
  ]);
  const verificationFailed = await page.evaluate(() =>
    document.body.innerText.includes("Doğrulama başarısız"));
  if (verificationFailed) throw new Error("KMQuant login verification failed");
  if (await page.$('input[name="email"]'))
    throw new Error("KMQuant login did not authenticate; check account access");
};
