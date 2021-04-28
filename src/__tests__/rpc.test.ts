import EventEmitter from "events";

import * as t from "io-ts";

import { RpcServer } from "../rpcServer";
import { AnyJson, AsyncFN, Disposable, RpcTransport } from "../rpcTypes";
import { RpcClient } from "../rpcClient";

class TestTransport implements RpcTransport {
  constructor(public sender: EventEmitter, public receiver: EventEmitter) {}
  async send(msg: AnyJson) {
    this.sender.emit("msg", msg);
  }
  onMessage(cb: (msg: AnyJson) => void) {
    this.receiver.on("msg", cb);
    return { dispose: () => this.receiver.off("msg", cb) };
  }
}

const TestIn = t.type({ a: t.number, b: t.number });
const TestOut = t.type({ x: t.string, y: t.number });

function TestRpcMethod() {
  return { i: TestIn, o: TestOut };
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

  it("checks return type", async () => {
    rpcHandler.dispose();
    // @ts-ignore ignore for testing
    server.register(TestRpcMethod, async () => ({
      x: 100,
      y: "not a number!",
    }));
    await expect(rpcMethod({ a: 10, b: 5 })).rejects.toMatchSnapshot();
  });
});
