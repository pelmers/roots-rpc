import * as t from "io-ts";

// Borrowed from comments of https://github.com/microsoft/TypeScript/issues/1897
export type AnyJson = boolean | number | string | null | JsonArray | JsonMap;
interface JsonMap {
  [key: string]: AnyJson;
}
interface JsonArray extends Array<AnyJson> {}

// Credit https://github.com/sb-js/typescript-remote-functions for inspiration
export interface FN<I extends AnyJson, O extends AnyJson> {
  i: t.Type<I>;
  o: t.Type<O>;
}
export type AsyncFN<I, O> = (i?: I) => Promise<O>;

export type CallPayload = { id: number; method: string; arg: AnyJson };
export type ResultPayload = { id: number; result: AnyJson };
export type ErrorPayload = { id: number; error: string };

export interface Disposable {
  dispose: () => void;
}

export interface RpcTransport {
  send: (msg: AnyJson) => Promise<void>;
  onMessage: (cb: (msg: AnyJson) => void) => Disposable;
}
