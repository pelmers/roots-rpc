import * as t from "io-ts";

// Borrowed from comments of https://github.com/microsoft/TypeScript/issues/1897
export type AnyJson = boolean | number | string | null | JsonArray | JsonMap;
interface JsonMap {
  [key: string]: AnyJson;
}
interface JsonArray extends Array<AnyJson> {}
export interface Disposable {
  dispose: () => void;
}

// Credit https://github.com/sb-js/typescript-remote-functions for inspiration
export interface FNDecl<I extends AnyJson, O extends AnyJson> {
  i: t.Type<I>;
  o: t.Type<O>;
}
export type AsyncFN<I, O> = (i?: I) => Promise<O>;

// Sent from client to call method or observable
export type CallPayload = {
  id: number;
  method: string;
  arg: AnyJson;
  subscribe: boolean;
};
// Sent from server to client to send result or subscription value
export type ResultPayload = { id: number; result: AnyJson };
// Sent from server to client to send error or subscription error
export type ErrorPayload = { id: number; error: string };
// Sent from server to client when observable completes, or client to server to stop subscription
export type DisposePayload = { id: number; dispose: true };
export type Message =
  | CallPayload
  | ResultPayload
  | ErrorPayload
  | DisposePayload;

export function disposify(fn: () => void): Disposable {
  return { dispose: () => fn() };
}

export interface Observable<T> {
  subscribe(
    onValue: (value: T) => void,
    onError?: (err: Error) => void,
    onComplete?: () => void
  ): Disposable;
}

export interface RpcTransport {
  send: (msg: Message) => void;
  onMessage: (cb: (msg: Message) => void) => Disposable;
}
