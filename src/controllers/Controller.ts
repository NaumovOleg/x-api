/* eslint-disable @typescript-eslint/no-explicit-any */
import 'reflect-metadata';

import {
  executeControllerMethod,
  getControllerMethods,
  matchRoute,
  ParseBody,
  Query,
} from '@utils';

type ControllerClass = { new (...args: any[]): any };
type ControllerInstance = InstanceType<ControllerClass>;

interface ControllerConfig {
  prefix: string;
  middlewares: Array<(Request: Request) => any>;
  controllers?: ControllerClass[];
}

export function Controller(
  config: string | ControllerConfig,
  middlewares: Array<(Request: Request) => any> = [],
) {
  // Handle both string and config object
  const routePrefix = typeof config === 'string' ? config : config.prefix;
  const controllers = typeof config === 'object' ? config.controllers : undefined;
  const controllerMiddlewares =
    typeof config === 'object' ? [...(config.middlewares || []), ...middlewares] : middlewares;

  return function <T extends ControllerClass>(constructor: T) {
    const proto = constructor.prototype;

    // Store metadata
    Reflect.defineMetadata('routePrefix', routePrefix, proto);
    Reflect.defineMetadata('middlewares', controllerMiddlewares, proto);
    Reflect.defineMetadata('controllers', controllers || [], proto);

    // Wrap existing methods with try/catch
    for (const key of Object.getOwnPropertyNames(proto)) {
      if (key === 'constructor') continue;

      const descriptor = Object.getOwnPropertyDescriptor(proto, key);
      if (!descriptor || typeof descriptor.value !== 'function') continue;

      const original = descriptor.value;

      Object.defineProperty(proto, key, {
        ...descriptor,
        value: async function (...args: any[]) {
          try {
            return await original.apply(this, args);
          } catch (err: any) {
            return {
              status: err.status ?? 400,
              message: err.message,
              data: err,
            };
          }
        },
      });
    }

    return class extends constructor {
      executeControllerMethod = executeControllerMethod;
      getControllerMethods = getControllerMethods;
      constructor(...args: any[]) {
        super(...args);
      }

      handleRequest = async (request: any) => {
        const method = request.method;
        const path = (request.url.path ?? request.url.pathname ?? '').replace(/^\/+/, '');

        request.headers = request.headers ?? {};
        request.cookies = request.cookies ?? {};

        try {
          request.body = ParseBody(request);
          request.query = Query(request.url);
        } catch (err) {
          throw { status: 500, message: 'Validation failed', data: err };
        }

        const routePrefix: string = Reflect.getMetadata('routePrefix', proto) || '';
        const middlewares: Array<(Request: any) => any> =
          Reflect.getMetadata('middlewares', proto) || [];
        const subControllers: ControllerClass[] = Reflect.getMetadata('controllers', proto) || [];

        // Try sub-controllers
        for (const SubController of subControllers) {
          const controllerInstance = new SubController(SubController);
          if (!controllerInstance) continue;

          const controllerPrefix: string =
            Reflect.getMetadata('routePrefix', SubController.prototype) || '';
          const controllerMiddlewares: Array<(Request: any) => any> =
            Reflect.getMetadata('middlewares', SubController.prototype) || [];

          const methods = this.getControllerMethods(controllerInstance);

          for (const methodInfo of methods) {
            if (methodInfo.httpMethod === method) {
              // Build full pattern: main prefix + controller prefix + method pattern
              const fullPattern = [routePrefix, controllerPrefix, methodInfo.pattern]
                .filter(Boolean)
                .join('/')
                .replace(/\/+/g, '/');

              const pathParams = matchRoute(fullPattern, path);
              if (pathParams) {
                let payload = { ...request, params: pathParams };

                // Apply all middlewares in order: main controller -> sub-controller -> method
                for (const middleware of [
                  ...middlewares,
                  ...controllerMiddlewares,
                  ...(methodInfo.middlewares || []),
                ]) {
                  const middlawareResponde = await middleware(payload);
                  payload = { ...payload, ...middlawareResponde };
                }

                return this.executeControllerMethod(controllerInstance, methodInfo.name, payload);
              }
            }
          }
        }
        // Try main controller methods first
        const propertyNames = Object.getOwnPropertyNames(proto);

        for (const propertyName of propertyNames) {
          const fn = (this as any)[propertyName];
          if (typeof fn !== 'function') continue;

          const endpointMeta = Reflect.getMetadata('endpoint', proto, propertyName);
          if (endpointMeta) {
            const [httpMethod, routePattern] = endpointMeta;

            if (httpMethod === method) {
              const fullPattern = [routePrefix, routePattern]
                .filter(Boolean)
                .join('/')
                .replace(/\/+/g, '/');

              const pathParams = matchRoute(fullPattern, path);
              if (pathParams) {
                let payload = { ...request, params: pathParams };

                // Apply controller-level middlewares
                for (const middleware of middlewares) {
                  const middlewareResponse = await middleware(payload);
                  payload = { ...payload, middlewareResponse };
                }

                return this.executeControllerMethod(this, propertyName, payload);
              }
            }
          }
        }

        return { status: 404, message: 'Method Not Found' };
      };
    };
  };
}
