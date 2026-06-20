import { KMAQUANT_PAGES } from "./scrape-kmquant";
import { sleep } from "moderndash";
import { PageWithCursor } from "puppeteer-real-browser";

export const login = async ({ page }: { page: PageWithCursor }) => {
  console.log("Navigating to login page...");
  await page.goto(KMAQUANT_PAGES.LOGIN_PAGE, {
    waitUntil: "domcontentloaded",
  });

  console.log("Waiting 5 seconds before reload...");
  await sleep(5000);

  console.log("Reloading page...");
  await page.reload({ waitUntil: "domcontentloaded" });

  console.log("Waiting for page to settle...");
  await sleep(5000);

  console.log("Waiting for login form...");
  await page.waitForSelector('input[name="email"]', {
    timeout: 15000,
  });

  console.log("Filling email...");
  await page.type('input[name="email"]', process.env.KMQUANT_EMAIL!, {
    delay: 2,
  });
  await sleep(1000);

  console.log("Filling password...");
  await page.type('input[name="password"]', process.env.KMQUANT_PASSWORD!, {
    delay: 2,
  });
  await sleep(1500);

  console.log("Clicking login button...");
  await Promise.all([
    page.waitForNavigation({ waitUntil: "domcontentloaded" }),
    page.click('button[name="login"]'),
  ]);

  await sleep(3000);
};
