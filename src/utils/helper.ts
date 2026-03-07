/* eslint-disable @typescript-eslint/no-explicit-any */
import { Request } from '@types';
import * as multipart from 'parse-multipart-data';

export const matchRoute = (routePattern: string, actualPath: string) => {
  const routeParts = routePattern.split('/').filter(Boolean);
  const pathParts = actualPath.split('/').filter(Boolean);

  if (routeParts.length !== pathParts.length) return null;

  const params: Record<string, string> = {};

  for (let i = 0; i < routeParts.length; i++) {
    const routePart = routeParts[i];
    const pathPart = pathParts[i];

    if (routePart.startsWith(':')) {
      const paramName = routePart.slice(1);
      params[paramName] = decodeURIComponent(pathPart);
    } else if (routePart !== pathPart) {
      return null;
    }
  }

  return params;
};

export const ParseBody = (request: Request<any, any, any>) => {
  const { body, headers, isBase64Encoded } = request;
  let parsedBody: any = null;

  let contentType = headers['content-type'] ?? headers['Content-Type'] ?? '';
  if (Array.isArray(contentType)) {
    contentType = contentType[0];
  }
  if (!contentType.startsWith('multipart/form-data')) {
    try {
      return JSON.parse(body);
    } catch (_) {
      return body;
    }
  }

  const boundaryMatch = multipart.getBoundary(contentType);

  if (!body || !boundaryMatch) {
    return {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: 'Invalid multipart request' }),
    };
  }

  const bodyBuffer = isBase64Encoded ? Buffer.from(body, 'base64') : Buffer.from(body, 'binary');

  const parts = multipart.parse(bodyBuffer, boundaryMatch);

  parsedBody = parts.reduce((acc: any, part: any) => {
    if (part.filename) {
      acc.file = {
        filename: part.filename,
        contentType: part.type,
        data: part.data,
      };
    } else if (part.name) {
      const text = part.data.toString('utf-8').trim();
      try {
        acc[part.name] = JSON.parse(text);
      } catch {
        acc[part.name] = text;
      }
    }
    return acc;
  }, {});

  return parsedBody;
};
