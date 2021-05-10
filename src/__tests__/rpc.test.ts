import EventEmitter from "events";

import * as t from "io-ts";

import { RpcServer } from "../rpcServer";
import {
  Message,
  AsyncFN,
  Disposable,
  RpcTransport,
  Observable,
  disposify,
} from "../rpcTypes";
import { RpcClient } from "../rpcClient";

class TestTransport implements RpcTransport {
  constructor(public sender: EventEmitter, public receiver: EventEmitter) {}
  send(msg: Message) {
    this.sender.emit("msg", msg);
  }
  onMessage(cb: (msg: Message) => void) {
    this.receiver.on("msg", cb);
    return { dispose: () => this.receiver.off("msg", cb) };
  }
}

class TestObservable implements Observable<string> {
  constructor(private value: string, private time: number) {}
  subscribe(
    onValue: (value: string) => void,
    _onError?: (err: Error) => void,
    onComplete?: () => void
  ): Disposable {
    let disposed = false;
    const emitValues = async () => {
      for (const char of this.value) {
        if (disposed) {
          return;
        }
        onValue(char);
        await new Promise((resolve) => setTimeout(resolve, this.time));
      }
      onComplete && onComplete();
    };
    emitValues();
    return disposify(() => (disposed = true));
  }
}

const TestIn = t.type({ a: t.number, b: t.number });
const TestOut = t.type({ x: t.string, y: t.number });

function TestRpcMethod() {
  return { i: TestIn, o: TestOut };
}

function TestNullMethod() {
  return { i: t.null, o: t.null };
}

const TestObservableIn = t.type({ val: t.string, time: t.number });
function TestObservableMethod() {
  return { i: TestObservableIn, o: t.string };
}

describe("rpc", () => {
  let serverEmitter: EventEmitter;
  let clientEmitter: EventEmitter;
  let serverTransport: TestTransport;
  let clientTransport: TestTransport;
  let server: RpcServer;
  let client: RpcClient;
  let rpcHandler: Disposable;
  let rpcMethod: AsyncFN<t.TypeOf<typeof TestIn>, t.TypeOf<typeof TestOut>>;
  let rpcObservableSource: Disposable;
  let rpcObservable: (
    arg?: t.TypeOf<typeof TestObservableIn>
  ) => Observable<string>;

  beforeEach(() => {
    serverEmitter = new EventEmitter();
    clientEmitter = new EventEmitter();
    serverTransport = new TestTransport(clientEmitter, serverEmitter);
    clientTransport = new TestTransport(serverEmitter, clientEmitter);
    server = new RpcServer(serverTransport);
    client = new RpcClient(clientTransport);
    rpcHandler = server.register(TestRpcMethod, async ({ a, b }) => ({
      x: "abcd".slice(a),
      y: a * b,
    }));
    rpcMethod = client.connect(TestRpcMethod);

    rpcObservableSource = server.registerObservable(
      TestObservableMethod,
      (i) => new TestObservable(i.val, i.time)
    );
    rpcObservable = client.connectObservable(TestObservableMethod);
  });

  it("disposes the listeners in transport", () => {
    expect(serverEmitter.listenerCount("msg")).toEqual(1);
    expect(clientEmitter.listenerCount("msg")).toEqual(1);

    server.dispose();
    client.dispose();
    expect(serverEmitter.listenerCount("msg")).toEqual(0);
    expect(clientEmitter.listenerCount("msg")).toEqual(0);
  });

  it("gets correct result", async () => {
    const { x, y } = await rpcMethod({ a: 10, b: 5 });
    expect(x).toEqual("");
    expect(y).toEqual(50);
  });

  it("checks input type", async () => {
    await expect(
      // @ts-ignore ignore for testing
      rpcMethod({ a: "not a number", b: null })
    ).rejects.toMatchSnapshot();
  });

  it("requires input value", async () => {
    await expect(rpcMethod()).rejects.toMatchSnapshot();
  });

  it("checks return type", async () => {
    rpcHandler.dispose();
    // @ts-ignore ignore for testing
    server.register(TestRpcMethod, async () => ({
      x: 100,
      y: "not a number!",
    }));
    await expect(rpcMethod({ a: 10, b: 5 })).rejects.toMatchSnapshot();
  });

  it("allows empty arg for null", async () => {
    // @ts-ignore ignore for testing
    server.register(TestNullMethod, async () => null);
    const method = client.connect(TestNullMethod);
    const res = await method();
    expect(res).toBeNull();
  });

  it("runs an observable correctly", async () => {
    let errored = false;
    const str = "xyz123";
    const values: string[] = [];
    await new Promise<void>((resolve) => {
      rpcObservable({ val: str, time: 5 }).subscribe(
        (v) => values.push(v),
        () => (errored = true),
        resolve
      );
    });
    expect(values.join("")).toEqual(str);
    expect(errored).toBeFalsy();
  });

  it("lets client dispose observable", async () => {
    let errored = false;
    let completed = false;
    const str = "xyz123";
    const values: string[] = [];
    await new Promise<void>((resolve) => {
      const disposable = rpcObservable({ val: str, time: 30 }).subscribe(
        (v) => {
          values.push(v);
          if (values.length === str.length / 2) {
            disposable.dispose();
            resolve();
          }
        },
        () => (errored = true),
        () => (completed = true)
      );
    });
    expect(values.join("")).toEqual(str.slice(0, str.length / 2));
    expect(errored).toBeFalsy();
    expect(completed).toBeTruthy();
  });

  it("sends error of observable", async () => {
    let errored: Error | undefined;
    rpcObservableSource.dispose();
    rpcObservableSource = server.registerObservable(
      TestObservableMethod,
      (_) => ({
        subscribe(_, onError, onComplete) {
          onError!(new Error("Test error message!!"));
          onComplete!();
          return disposify(() => {});
        },
      })
    );
    await new Promise<void>((resolve) => {
      rpcObservable({ val: "", time: 0 }).subscribe(
        (_) => {},
        (e) => (errored = e),
        resolve
      );
    });
    expect(errored).toMatchSnapshot();
  });
});
