import http from 'node:http';

let requestCount = 0;

http.createServer((request, response) => {
  if (request.url === '/_fixture/count') {
    response.setHeader('content-type', 'application/json');
    response.end(JSON.stringify({ requestCount }));
    return;
  }
  if (request.url === '/_fixture/reset' && request.method === 'POST') {
    requestCount = 0;
    response.statusCode = 204;
    response.end();
    return;
  }

  requestCount++;
  const upstream = http.request({
    hostname: 'host.docker.internal',
    port: 4000,
    method: request.method,
    path: request.url,
    headers: request.headers,
  }, (upstreamResponse) => {
    response.writeHead(upstreamResponse.statusCode ?? 502, upstreamResponse.headers);
    upstreamResponse.pipe(response);
  });
  upstream.on('error', () => {
    response.statusCode = 502;
    response.end('Plugin fixture backend unavailable');
  });
  request.pipe(upstream);
}).listen(3000, '0.0.0.0');
