const crypto = require('crypto');

/**
 * Express middleware that generates weak ETags and handles conditional If-None-Match headers.
 * If the computed hash matches the client's If-None-Match header, returns 304 Not Modified.
 *
 * @param {Object} [options]
 * @param {string} [options.cacheControl='public, max-age=60, stale-while-revalidate=120']
 */
function etagMiddleware(options = {}) {
  const cacheControlHeader =
    options.cacheControl || 'public, max-age=60, stale-while-revalidate=120';

  return (req, res, next) => {
    // Only apply to safe GET and HEAD requests
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      return next();
    }

    const originalSend = res.send.bind(res);

    res.send = (body) => {
      // Restore original send to prevent recursion
      res.send = originalSend;

      if (!body) {
        return originalSend(body);
      }

      // Calculate hash
      let contentBuffer;
      if (Buffer.isBuffer(body)) {
        contentBuffer = body;
      } else if (typeof body === 'string') {
        contentBuffer = Buffer.from(body);
      } else {
        contentBuffer = Buffer.from(JSON.stringify(body));
      }

      const hash = crypto.createHash('md5').update(contentBuffer).digest('hex');
      const etag = `W/"${hash}"`;

      res.setHeader('ETag', etag);
      res.setHeader('Cache-Control', cacheControlHeader);

      const clientEtag = req.headers['if-none-match'];
      if (clientEtag && (clientEtag === etag || clientEtag === hash || clientEtag === `"${hash}"`)) {
        return res.status(304).end();
      }

      return originalSend(body);
    };

    next();
  };
}

module.exports = etagMiddleware;

