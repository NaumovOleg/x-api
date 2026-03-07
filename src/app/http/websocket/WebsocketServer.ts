import { WebSocketClient, WebSocketEvent, WebSocketMessage } from '@types';
import http from 'http';
import { v4 as uuidv4 } from 'uuid';
import WebSocket from 'ws';

export class WebSocketServer {
  private wss: WebSocket.Server | null = null;
  private clients: Map<string, WebSocketClient> = new Map();
  private topics: Map<string, Set<string>> = new Map();
  private controllers: any[] = [];
  private options: any;

  constructor(server: http.Server, options?: any) {
    this.options = options;

    server.on('upgrade', (request, socket, head) => {
      if (this.shouldHandleWebSocket(request.url)) {
        this.ensureServer(server);
        this.wss?.handleUpgrade(request, socket, head, (ws) => {
          this.wss?.emit('connection', ws, request);
        });
      } else {
        socket.destroy();
      }
    });
  }

  private shouldHandleWebSocket(url: string = ''): boolean {
    const path = this.options?.path || '/ws';
    return url.startsWith(path);
  }

  private ensureServer(server: http.Server) {
    if (!this.wss) {
      this.wss = new WebSocket.Server({
        server,
        path: this.options?.path || '/ws',
        noServer: true,
      });

      this.wss.on('connection', (socket, request) => {
        this.handleConnection(socket, request);
      });
    }
  }

  private async handleConnection(socket: WebSocket, request: http.IncomingMessage) {
    const clientId = uuidv4();
    const client: WebSocketClient = {
      id: clientId,
      socket,
      topics: new Set(),
      data: {},
      connectedAt: new Date(),
    };

    this.clients.set(clientId, client);

    socket.on('message', (data: WebSocket.Data) => {
      this.handleMessage(client, data);
    });

    socket.on('close', () => {
      this.handleClose(client);
    });

    socket.on('error', (error: any) => {
      this.handleError(client, error);
    });

    await this.triggerHandlers('connection', { type: 'connection', client });
  }

  private async handleMessage(client: WebSocketClient, data: WebSocket.Data) {
    try {
      const message = JSON.parse(data.toString()) as WebSocketMessage;

      if (message.type === 'subscribe' && message.topic) {
        this.subscribeToTopic(client, message.topic);
        return;
      }

      if (message.type === 'unsubscribe' && message.topic) {
        this.unsubscribeFromTopic(client, message.topic);
        return;
      }

      if (message.type === 'topic_message' && message.topic) {
        await this.triggerHandlers(
          'message',
          {
            type: 'message',
            client,
            message,
          },
          message.topic,
        );

        this.publishToTopic(message.topic, message.data, [client.id]);
        return;
      }

      await this.triggerHandlers('message', {
        type: 'message',
        client,
        message,
      });
    } catch (error) {
      client.socket.send(
        JSON.stringify({
          type: 'error',
          data: { message: 'Invalid message format' },
        }),
      );
    }
  }

  private async handleClose(client: WebSocketClient) {
    client.topics.forEach((topic) => {
      const topicClients = this.topics.get(topic);
      if (topicClients) {
        topicClients.delete(client.id);
        if (topicClients.size === 0) {
          this.topics.delete(topic);
        }
      }
    });

    this.clients.delete(client.id);

    await this.triggerHandlers('close', {
      type: 'close',
      client,
    });
  }

  private async handleError(client: WebSocketClient, error: Error) {
    await this.triggerHandlers('error', {
      type: 'error',
      client,
      data: error,
    });
  }

  private async triggerHandlers(eventType: string, event: WebSocketEvent, topic?: string) {
    for (const controller of this.controllers) {
      const handlers = Reflect.getMetadata('websocket:handler', controller.constructor) || [];

      const matchingHandlers = handlers.filter(
        (h: any) => h.type === eventType && (!h.topic || h.topic === topic),
      );

      for (const handler of matchingHandlers) {
        try {
          await controller[handler.method](event);
        } catch (error) {
          console.error(`Error in WebSocket handler ${handler.method}:`, error);
        }
      }

      const subscriptions = Reflect.getMetadata('websocket:topic', controller.constructor) || [];

      if (eventType === 'message' && topic) {
        const matchingSubs = subscriptions.filter((s: any) => s.topic === topic);

        for (const sub of matchingSubs) {
          try {
            await controller[sub.method](event);
          } catch (error) {
            console.error(`Error in subscription ${sub.method}:`, error);
          }
        }
      }
    }
  }

  public registerControllers(controllers: any[]) {
    this.controllers = controllers;
  }

  public subscribeToTopic(client: WebSocketClient, topic: string) {
    if (!this.topics.has(topic)) {
      this.topics.set(topic, new Set());
    }
    this.topics.get(topic)!.add(client.id);
    client.topics.add(topic);

    client.socket.send(
      JSON.stringify({
        type: 'subscribed',
        topic,
        data: { success: true },
      }),
    );
  }

  public unsubscribeFromTopic(client: WebSocketClient, topic: string) {
    const topicClients = this.topics.get(topic);
    if (topicClients) {
      topicClients.delete(client.id);
      if (topicClients.size === 0) {
        this.topics.delete(topic);
      }
    }
    client.topics.delete(topic);

    client.socket.send(
      JSON.stringify({
        type: 'unsubscribed',
        topic,
        data: { success: true },
      }),
    );
  }

  public publishToTopic(topic: string, data: any, exclude?: string[]) {
    const topicClients = this.topics.get(topic);
    if (!topicClients) return;

    const message = JSON.stringify({
      type: 'message',
      topic,
      data,
      timestamp: new Date().toISOString(),
    });

    topicClients.forEach((clientId) => {
      const client = this.clients.get(clientId);
      if (client && exclude?.includes(client.id)) {
        client.socket.send(message);
      }
    });
  }

  public sendToClient(clientId: string, message: any): boolean {
    const client = this.clients.get(clientId);
    if (client) {
      client.socket.send(JSON.stringify(message));
      return true;
    }
    return false;
  }

  public broadcast(message: any, excludeClientId?: string) {
    const messageStr = JSON.stringify(message);
    this.clients.forEach((client, clientId) => {
      if (clientId !== excludeClientId) {
        client.socket.send(messageStr);
      }
    });
  }

  public getStats() {
    return {
      clients: this.clients.size,
      topics: Array.from(this.topics.entries()).map(([topic, clients]) => ({
        topic,
        subscribers: clients.size,
      })),
    };
  }
}
