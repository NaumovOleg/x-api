/* eslint-disable @typescript-eslint/no-explicit-any */
import 'reflect-metadata';

import { Middleware } from '@types';

export function Endpoint(method: string, pathPattern?: string, middlewares?: Middleware[]) {
  return function (target: any, propertyKey: string, descriptor: PropertyDescriptor) {
    const originalMethod = descriptor.value;

    if (!originalMethod) {
      console.warn('❌ originalMethod is undefined!');
      return descriptor;
    }

    if (method && pathPattern) {
      Reflect.defineMetadata('endpoint', [method, pathPattern], target, propertyKey);
      Reflect.defineMetadata('middlewares', middlewares || [], target, propertyKey);
    }

    return descriptor;
  };
}

export const GET = (pathPattern?: string, middelwares?: Middleware[]) => {
  return Endpoint('GET', pathPattern, middelwares);
};
export const POST = (pathPattern?: string, middelwares?: Middleware[]) => {
  return Endpoint('POST', pathPattern, middelwares);
};
export const PUT = (pathPattern?: string, middelwares?: Middleware[]) => {
  return Endpoint('PUT', pathPattern, middelwares);
};
export const PATCH = (pathPattern?: string, middelwares?: Middleware[]) => {
  return Endpoint('PATCH', pathPattern, middelwares);
};
export const DELETE = (pathPattern?: string, middelwares?: Middleware[]) => {
  return Endpoint('DELETE', pathPattern, middelwares);
};
