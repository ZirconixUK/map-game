// Web Worker: fetches and parses the UK POI JSON off the main thread.
// Receives: { url: string }
// Sends:    { ok: true, pois: Array, lastModified: string }
//        or { ok: false, error: string }
self.onmessage = function(e) {
  fetch(e.data.url)
    .then(r => {
      const lastModified = r.headers.get('Last-Modified') || '';
      return r.json().then(data => ({ data, lastModified }));
    })
    .then(({ data, lastModified }) => {
      const pois = Array.isArray(data) ? data : (Array.isArray(data.pois) ? data.pois : []);
      self.postMessage({ ok: true, pois, lastModified });
    })
    .catch(err => self.postMessage({ ok: false, error: err.message }));
};
