// Checks the preview's AI path with a fake claude.ai runtime in the outer page, as strict as the real one about plain objects.
// Run: python3 preview/build.py /tmp/pv/index.html && NODE_PATH_PW=$(npm root -g)/playwright node preview/check-ai.js /tmp/pv
const { chromium } = require(process.env.NODE_PATH_PW);
(async () => {
  const dir = process.argv[2];
  const b = await chromium.launch({executablePath: '/opt/pw-browsers/chromium'});
  const p = await b.newPage({viewport: {width: 360, height: 740}});
  p.on('pageerror', e => console.log('ERR', e.message));
  await p.addInitScript(() => {
    if (window !== window.top) return;
    const plain = o => o && typeof o === 'object' && Object.getPrototypeOf(o) === Object.prototype;
    window.__calls = [];
    window.claude = {use: async name => {
      if (name !== 'sample') throw new Error('no ' + name);
      return async (msgs, opts) => {
        if (!Array.isArray(msgs) || !msgs.every(plain)) throw new Error('messages must be plain objects');
        if (opts !== undefined && !plain(opts)) throw new Error('options must be a plain object - for images pass {images}');
        if (opts && opts.signal && !(opts.signal instanceof AbortSignal)) throw new Error('signal must be an AbortSignal');
        if (opts && opts.images && !opts.images.every(x => x instanceof Blob)) throw new Error('images must be Blobs');
        window.__calls.push(msgs[msgs.length - 1].content.slice(0, 60));
        const text = '{"text":"Записал овсянку."}';
        if (opts && opts.onText) opts.onText({delta: text, text});
        return {text};
      };
    }};
  });
  await p.goto('file://' + dir + '/index.html'); await p.waitForTimeout(1500);
  const f = p.frames()[1];
  await f.evaluate(() => { openChat(true); sendChat('овсянка'); });
  await p.waitForTimeout(3000);
  console.log('calls:', await p.evaluate(() => window.__calls.length));
  console.log('status:', await f.evaluate(() => document.getElementById('status').textContent));
  console.log('feed:', await f.evaluate(() => document.getElementById('feed').innerText.slice(-200)));
  await b.close();
})();
