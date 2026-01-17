export default {
  async fetch(request, env) {
    const TARGET_URL = env.TARGET_URL;
    if (!TARGET_URL) {
      return new Response('Error: TARGET_URL is not set', { status: 500 });
    }

    const url = new URL(request.url);
    const target = new URL(TARGET_URL);
    url.hostname = target.hostname;
    url.protocol = target.protocol;

    const TOKEN_KEY = env.TOKEN_KEY || 'supersecretkey1234';

    const newHeaders = new Headers();

    for (const [k, v] of request.headers) {
      const key = k.toLowerCase();

      const skipHeaders = [
        'host',
        'content-length',
        'cf-connecting-ip',
        'cf-ray',
        'cookie',
        'authorization'
      ];

      if (!skipHeaders.includes(key)) {
        newHeaders.set(k, v);
      }
    }

    newHeaders.set('token-key', TOKEN_KEY);

    let body = null;
    if (['POST', 'PUT', 'PATCH'].includes(request.method.toUpperCase())) {
      body = await request.arrayBuffer();
    }

    try {
      const response = await fetch(url.toString(), {
        method: request.method,
        headers: newHeaders,
        body,
        redirect: "manual"
      });

      return response;
    } catch (err) {
      return new Response('Worker fetch error: ' + err.message, { status: 502 });
    }
  }
};
