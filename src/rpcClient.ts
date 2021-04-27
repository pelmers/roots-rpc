import {
  RpcTransport,
  AnyJson,
  AsyncFN,
  Disposable,
  ErrorPayload,
  FN,
  ResultPayload,
} from "./rpcTypes";
import { isRight } from "fp-ts/lib/Either";

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

export class RpcClient {
  private id: number = 0;
  private disposable: Disposable;
  private pendingCalls: Map<number, Resolver<AnyJson>> = new Map();

  constructor(private transport: RpcTransport) {
    this.disposable = transport.onMessage((msg) => {
      const reply = msg as ResultPayload | ErrorPayload;
      const { id } = reply;
      if (id == null || !this.pendingCalls.has(id)) {
        return;
      }
      if ("error" in reply) {
        this.pendingCalls.get(id)!.reject(reply.error);
      } else {
        this.pendingCalls.get(id)!.resolve(reply.result);
      }
    });
  }

  connect<I extends AnyJson, O extends AnyJson>(
    typeLoader: () => FN<I, O>
  ): AsyncFN<I, O> {
    const { name } = typeLoader;
    const { i, o } = typeLoader();
    const id = this.id++;
    return async (argValue?: I) => {
      const arg = argValue === undefined ? null : argValue;
      if (argValue === undefined && !i.is(null)) {
        throw new Error(
          `No argument passed for non-null input of RPC function ${name}`
        );
      }
      const pendingCall = new Resolver<O>();
      this.pendingCalls.set(id, pendingCall);
      await this.transport.send({ id, method: name, arg });
      let result;
      try {
        result = await pendingCall.promise;
      } finally {
        this.pendingCalls.delete(id);
      }
      const validation = o.decode(result);
      if (!isRight(validation)) {
        throw new Error(
          `Failed to validate return type of call id ${id}, method ${name}`
        );
      }
      return result;
    };
  }

  dispose() {
    this.disposable.dispose();
  }
}
