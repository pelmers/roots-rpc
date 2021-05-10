import * as t from "io-ts";
import { isRight } from "fp-ts/lib/Either";

import {
  RpcTransport,
  AnyJson,
  AsyncFN,
  Disposable,
  ErrorPayload,
  FNDecl,
  ResultPayload,
  Observable,
  disposify,
  Message,
} from "./rpcTypes";

class Resolver<T> {
  public resolve: (t: T) => void;
  public reject: (err: unknown) => void;
  public promise: Promise<T>;
  constructor() {
    this.promise = new Promise<T>((resolve, reject) => {
      this.resolve = resolve;
      this.reject = reject;
    });
  }
}

type Subscription<T> = {
  type: t.Type<T>;
  name: string;
  onValue: (value: T) => void;
  onError?: (err: Error) => void;
  onComplete?: () => void;
};

export class RpcClient {
  private id: number = 0;
  private disposable: Disposable;
  private pendingCalls: Map<number, Resolver<AnyJson>> = new Map();
  private subscriptions: Map<number, Subscription<AnyJson>> = new Map();

  constructor(private transport: RpcTransport) {
    this.disposable = transport.onMessage((msg) => {
      const { id } = msg;
      if (this.pendingCalls.has(id)) {
        this.handleCall(msg);
      } else if (this.subscriptions.has(id)) {
        this.handleSub(msg);
      }
    });
  }

  private handleCall(msg: Message) {
    const { id } = msg;
    const { resolve, reject } = this.pendingCalls.get(id)!;
    if ("error" in msg) {
      reject(msg.error);
    } else if ("result" in msg) {
      resolve(msg.result);
    }
  }

  private handleSub(msg: Message) {
    const { id } = msg;
    const sub = this.subscriptions.get(id)!;
    if ("error" in msg) {
      sub.onError && sub.onError(new Error(msg.error));
    } else if ("result" in msg) {
      try {
        this.checkReturn(id, sub.name, sub.type, msg.result);
      } catch (e) {
        sub.onError && sub.onError(e);
        return;
      }
      sub.onValue(msg.result);
    } else if ("dispose" in msg) {
      sub.onComplete && sub.onComplete();
      this.subscriptions.delete(id);
    }
  }

  private checkInput<I>(name: string, i: t.Type<I>, value?: AnyJson) {
    if (value === undefined && !i.is(null)) {
      throw new Error(
        `No argument passed for non-null input of RPC function ${name}`
      );
    }
  }

  private checkReturn<O>(
    id: number,
    name: string,
    o: t.Type<O>,
    value: AnyJson
  ) {
    const validation = o.decode(value);
    if (!isRight(validation)) {
      throw new Error(
        `Failed to validate return type of call id ${id}, method ${name}`
      );
    }
  }

  connect<I extends AnyJson, O extends AnyJson>(
    typeLoader: () => FNDecl<I, O>
  ): AsyncFN<I, O> {
    return async (argValue?: I) => {
      const { name } = typeLoader;
      const { i, o } = typeLoader();
      const id = this.id++;
      this.checkInput(name, i, argValue);
      const arg = argValue === undefined ? null : argValue;
      const pendingCall = new Resolver<O>();
      this.pendingCalls.set(id, pendingCall);
      this.transport.send({ id, method: name, arg, subscribe: false });
      let result;
      try {
        result = await pendingCall.promise;
      } finally {
        this.pendingCalls.delete(id);
      }
      this.checkReturn(id, name, o, result);
      return result;
    };
  }

  connectObservable<I extends AnyJson, O extends AnyJson>(
    typeLoader: () => FNDecl<I, O>
  ): (arg?: I) => Observable<O> {
    return (argValue?: I) => {
      const { name } = typeLoader;
      const { i, o } = typeLoader();
      const id = this.id++;
      this.checkInput(name, i, argValue);
      return {
        subscribe: (onValue, onError?, onComplete?) => {
          const arg = argValue === undefined ? null : argValue;
          this.subscriptions.set(id, {
            name,
            type: o,
            onValue,
            onError,
            onComplete,
          });
          this.transport.send({ id, subscribe: true, method: name, arg });
          return disposify(() => {
            this.transport.send({ id, dispose: true });
            onComplete && onComplete();
            this.subscriptions.delete(id);
          });
        },
      };
    };
  }

  dispose() {
    this.disposable.dispose();
    this.pendingCalls.clear();
    this.subscriptions.clear();
  }
}
