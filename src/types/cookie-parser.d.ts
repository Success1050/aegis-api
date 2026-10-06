import { RequestHandler } from 'express';

declare module 'cookie-parser' {
  function cookieParser(secret?: string | string[], options?: any): RequestHandler;
  export = cookieParser;
}
