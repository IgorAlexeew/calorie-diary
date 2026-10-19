/* Web preview, outer page: makes the AI calls for the app in the phone frame (see native-stub.js), so the options the
   claude.ai runtime gets are plain objects of this page. Returns {done: Promise<{text}>, abort()}. */
window.__pvSample = (msgsJson, images, onDelta) => {
  const ac = new AbortController();
  const done = (async () => {
    const sample = await window.claude.use("sample");
    const opts = {signal: ac.signal, cache: false};
    if (images && images.length) opts.images = Array.from(images, b => new Blob([b], {type: b.type || "image/jpeg"}));
    if (onDelta) opts.onText = ({delta}) => { if (delta) onDelta(String(delta)); };
    const r = await sample(JSON.parse(msgsJson), opts);
    return {text: String(r && r.text || "")};
  })();
  return {done, abort: () => ac.abort()};
};
