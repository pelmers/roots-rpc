import { isRight } from "fp-ts/lib/Either";
import { RpcTransport, AnyJson, FN, Disposable, CallPayload } from "./rpcTypes";

export class RpcServer {
  private registry: {
    [key: string]: {
      fn: (payload: AnyJson) => Promise<AnyJson>;
      type: FN<AnyJson, AnyJson>;
    };
  } = {};
  private disposable: Disposable;

  constructor(private transport: RpcTransport) {
    this.disposable = transport.onMessage((msg) => {
      const { id, method, arg } = msg as CallPayload;
      if (this.registry[method] == null) {
        this.transport.send({
          id,
          error: `Handler implementation not registered for method ${method} (id: ${id})`,
        });
        return;
      }
      const validation = this.registry[method].type.i.decode(arg);
      if (!isRight(validation)) {
        this.transport.send({
          id,
          error: `Input validation failed for call id ${id} on method ${method}`,
        });
        return;
      }

      this.registry[method]
        .fn(arg)
        .then(async (result) => {
          await this.transport.send({ id, result });
        })
        .catch(async (err) => {
          await this.transport.send({ id, error: err.toString() });
        });
    });
  }

  register<I extends AnyJson, O extends AnyJson>(
    typeLoader: () => FN<I, O>,
    impl: (i: I) => Promise<O>
  ): void {
    this.registry[typeLoader.name] = { type: typeLoader(), fn: impl };
  }

  dispose() {
    this.disposable.dispose();
  }
}
