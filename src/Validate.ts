/* eslint-disable @typescript-eslint/no-explicit-any */
import { validate } from 'class-validator';

type ToValidate = 'query' | 'body' | 'params' | 'headers';

export function Validate(param: ToValidate, dtoClass: any) {
  return function (target: any, propertyKey: string, descriptor: PropertyDescriptor) {
    const originalMethod = descriptor.value;

    descriptor.value = async function (...args: any[]) {
      const value = args[0][param];

      if (Array.isArray(value)) {
        const errors = [];
        for (const item of value) {
          const itemErrors = await validate(new dtoClass(item), {
            whitelist: true,
          });
          if (itemErrors.length > 0) errors.push(itemErrors);
        }
        if (errors.length > 0) throw { status: 422, message: 'Validation failed', data: errors };
      } else {
        const errors = await validate(new dtoClass(value), { whitelist: true });
        if (errors.length > 0) throw { status: 422, message: 'Validation failed', data: errors };
      }

      return originalMethod.apply(this, args);
    };

    return descriptor;
  };
}
