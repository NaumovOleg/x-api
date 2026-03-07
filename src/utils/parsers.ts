import http from 'http';
export const ParseQuery = (url: URL) => {
  const params = url.searchParams;
  const query: Record<string, string | string[]> = {};

  for (const key of params.keys()) {
    const values = params.getAll(key);

    query[key] = values.length > 1 ? values : values[0];
  }

  return query;
};

export const ParseBody = (request: any): any => {
  if (request.body && typeof request.body === 'object' && !Buffer.isBuffer(request.body)) {
    return request.body;
  }

  const { body, headers, isBase64Encoded } = request;

  if (!body) {
    return {};
  }

  let contentType = headers['content-type'] ?? headers['Content-Type'] ?? '';
  if (Array.isArray(contentType)) {
    contentType = contentType[0];
  }

  const cleanContentType = contentType.split(';')[0].trim().toLowerCase();

  if (cleanContentType === 'application/json') {
    try {
      if (typeof body === 'string') {
        return JSON.parse(body);
      }
      if (Buffer.isBuffer(body)) {
        return JSON.parse(body.toString('utf8'));
      }
    } catch (error) {
      console.log(error);
    }
  }

  if (cleanContentType.startsWith('text/')) {
    if (Buffer.isBuffer(body)) {
      return { text: body.toString('utf8') };
    }
    return { text: body };
  }

  if (cleanContentType === 'application/x-www-form-urlencoded') {
    if (Buffer.isBuffer(body)) {
      const text = body.toString('utf8');
      const params = new URLSearchParams(text);
      const result: Record<string, any> = {};
      params.forEach((value, key) => {
        result[key] = value;
      });
      return result;
    }
  }

  if (Buffer.isBuffer(body)) {
    return { raw: body.toString('utf8') };
  }

  return body;
};

export const ParseCookies = (req: http.IncomingMessage): Record<string, string> => {
  const cookieHeader = req.headers.cookie;
  if (!cookieHeader) return {};

  return cookieHeader.split(';').reduce(
    (cookies, cookie) => {
      const [name, value] = cookie.trim().split('=');
      if (name && value) {
        cookies[name] = decodeURIComponent(value);
      }
      return cookies;
    },
    {} as Record<string, string>,
  );
};
