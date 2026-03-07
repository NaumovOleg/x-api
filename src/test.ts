import { Request } from '@types';
import http from 'http';
import { URL } from 'url';
import { Body, Controller, POST } from './controllers';

import { IsString } from 'class-validator';

class DTO {
  @IsString()
  name: string;
}

const auth = (req: Request) => {
  return req;
};

@Controller('base')
// @Validate('body', DTO)
export class Controllera {
  // @Validate('body', DTO)
  @POST('/:nane', [auth])
  async test(@Body() body: any) {
    console.log('==============', body);
    return body;
  }
}

const ctr = new Controllera();

const PORT = 3000;

const server = http.createServer(async (req, res) => {
  if (!req.url || !req.method) {
    res.statusCode = 400;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ error: 'Bad Request' }));
    return;
  }

  const parsedUrl = new URL(req.url, `http://${req.headers.host}`);

  let body = '';
  if (['PUT', 'POST', 'PATCH', 'DELETE'].includes(req.method.toUpperCase())) {
    for await (const chunk of req) {
      body += chunk;
    }
  }

  try {
    const response = await (ctr as any).handleRequest({
      method: req.method,
      url: parsedUrl,
      body,
      headers: req.headers,
    });

    console.log(response);

    res.statusCode = response.status ?? 200;
    res.setHeader('Content-Type', 'application/json');

    const resp = JSON.stringify(response.data ? response.data : { ...response });
    res.end(resp);
  } catch (error: any) {
    res.statusCode = error.status ?? 500;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ error: error.message ?? 'Internal Server Error' }));
  }
});

const HOST = 'localhost';

server.listen(PORT, HOST, () => {
  console.log(`Server running at http://${HOST}:${PORT}/`);
});
