const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const token = process.argv[2];
  await page.goto('http://localhost:3000');
  await page.evaluate((t) => {
    localStorage.setItem('cvsu_token', t);
    localStorage.setItem('cvsu_user', JSON.stringify({email:'juan.delacruz@cvsu.edu.ph',role:'STUDENT',full_name:'Juan'}));
  }, token);
  const errors = [];
  page.on('console', m => { errors.push(m.type()+': '+m.text()); });
  page.on('pageerror', e => errors.push('PAGEERROR: '+e.message));
  page.on('requestfailed', r => errors.push('REQFAIL: '+r.url()+' '+r.failure().errorText));
  await page.goto('http://localhost:3000/grades');
  await page.waitForTimeout(8000);
  console.log('URL:', page.url());
  console.log('BODY:', (await page.textContent('body')).slice(0,400));
  console.log('ERRORS:', JSON.stringify(errors.filter(e=>e.includes('error')||e.includes('PAGEERROR')||e.includes('REQFAIL')), null, 2));
  await browser.close();
})();