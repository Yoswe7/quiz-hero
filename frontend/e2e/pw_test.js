import { chromium } from "playwright";
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const token = process.argv[2];
  await page.goto('http://localhost:3000');
  await page.evaluate((t) => {
    localStorage.setItem('cvsu_token', t);
    localStorage.setItem('cvsu_user', JSON.stringify({email:'local.teacher@cvsu.edu.ph',role:'TEACHER',full_name:'Local Teacher'}));
  }, token);
  const errors = [];
  page.on('console', m => { errors.push(m.type()+': '+m.text()); });
  page.on('pageerror', e => errors.push('PAGEERROR: '+e.message));
  page.on('requestfailed', r => errors.push('REQFAIL: '+r.url()+' '+r.failure().errorText));
  await page.goto('http://localhost:3000/studio');
  await page.waitForTimeout(5000);
  console.log('URL:', page.url());
  console.log('ERRORS:', JSON.stringify(errors.filter(e=>e.includes('error')||e.includes('PAGEERROR')||e.includes('REQFAIL')), null, 2));
  await browser.close();
})();