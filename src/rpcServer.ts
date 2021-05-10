import { isRight } from "fp-ts/lib/Either";
import {
  RpcTransport,
  AnyJson,
  FNDecl,
  Disposable,
  CallPayload,
  disposify,
  Observable,
} from "./rpcTypes";

type Record =
  | {
      fn: (payload: AnyJson) => Promise<AnyJson>;
      type: FNDecl<AnyJson, AnyJson>;
    }
  | {
      start: (payload: AnyJson) => Observable<AnyJson>;
      type: FNDecl<AnyJson, AnyJson>;
    };

export class RpcServer {
  private registry: {
    [key: string]: Record;
  } = {};
  private subscriptions: Map<number, Disposable> = new Map();
  private disposables: Disposable[] = [];

  constructor(private transport: RpcTransport) {
    this.disposables.push(
      transport.onMessage((msg) => {
        if ("method" in msg) {
          this.handleCallMessage(msg);
        } else if ("dispose" in msg) {
          const subscription = this.subscriptions.get(msg.id);
          subscription?.dispose();
          this.subscriptions.delete(msg.id);
        }
      })
    );
  }

  private handleCallMessage(msg: CallPayload): void {
    const { id, method, arg, subscribe } = msg;
    const record = this.registry[method];
    if (record == null) {
      this.transport.send({
        id,
        error: `Handler implementation not registered for method ${method} (id: ${id})`,
      });
      return;
    }
    const validation = record.type.i.decode(arg);
    if (!isRight(validation)) {
      this.transport.send({
        id,
        error: `Input validation failed for call id ${id} on method ${method}`,
      });
      return;
    }

    if ("fn" in record) {
      if (subscribe) {
        this.transport.send({
          id,
          error: `Can not subscribe to regular function method ${method}`,
        });
        return;
      }
      record
        .fn(arg)
        .then((result) => this.transport.send({ id, result }))
        .catch((err) => this.transport.send({ id, error: err.toString() }));
    } else if ("start" in record) {
      if (!subscribe) {
        this.transport.send({
          id,
          error: `Must subscribe to observable method ${method}`,
        });
        return;
      }
      this.subscriptions.set(
        id,
        record.start(arg).subscribe(
          (v) => this.transport.send({ id, result: v }),
          (e) => this.transport.send({ id, error: e.toString() }),
          () => {
            this.transport.send({ id, dispose: true });
            this.subscriptions.delete(id);
          }
        )
      );
    }
  }

  private enforceNameAvailable(name: string) {
    if (this.registry.hasOwnProperty(name)) {
      throw new Error(`registry already has handler registered for ${name}`);
    }
  }

  register<I extends AnyJson, O extends AnyJson>(
    typeLoader: () => FNDecl<I, O>,
    impl: (i: I) => Promise<O>
  ): Disposable {
    this.enforceNameAvailable(typeLoader.name);
    this.registry[typeLoader.name] = { type: typeLoader(), fn: impl };
    return disposify(() => delete this.registry[typeLoader.name]);
  }

  registerObservable<I extends AnyJson, O extends AnyJson>(
    typeLoader: () => FNDecl<I, O>,
    impl: (i: I) => Observable<O>
  ): Disposable {
    this.enforceNameAvailable(typeLoader.name);
    this.registry[typeLoader.name] = { type: typeLoader(), start: impl };
    return disposify(() => delete this.registry[typeLoader.name]);
  }

  dispose() {
    this.disposables.forEach((d) => d.dispose());
    for (const [id, sub] of this.subscriptions) {
      this.transport.send({ id, dispose: true });
      sub.dispose();
    }
  }
}
