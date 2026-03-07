/* eslint-disable @typescript-eslint/no-explicit-any */
import { validate } from 'class-validator';

type ToValidate = 'query' | 'body' | 'params' | 'headers';

export function Validate(param: ToValidate, dtoClass: any) {
  return function (target: any, propertyKey?: string, descriptor?: PropertyDescriptor): void {
    // METHOD DECORATOR
    if (descriptor) {
      wrapMethod(descriptor, param, dtoClass);
      return;
    }

    // CLASS DECORATOR
    const prototype = target.prototype;

    Object.getOwnPropertyNames(prototype).forEach((method) => {
      if (method === 'constructor') return;

      const desc = Object.getOwnPropertyDescriptor(prototype, method);
      if (!desc || typeof desc.value !== 'function') return;

      wrapMethod(desc, param, dtoClass);
      Object.defineProperty(prototype, method, desc);
    });
  };
}

function wrapMethod(descriptor: PropertyDescriptor, param: any, dtoClass: any) {
  const originalMethod = descriptor.value;

  descriptor.value = async function (...args: any[]) {
    const value = args[0][param];
    const instance = new dtoClass();

    Object.entries(value || {}).forEach(([key, val]) => {
      instance[key] = val;
    });

    const errors = await validate(instance, { whitelist: true });

    if (errors.length) {
      throw { status: 422, message: 'Validation failed', data: errors };
    }

    return originalMethod.apply(this, args);
  };
}
