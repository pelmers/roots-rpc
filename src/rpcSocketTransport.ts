import io from "socket.io";
import { Message, RpcTransport } from "./rpcTypes";

export class SocketTransport implements RpcTransport {
  constructor(private socket: io.Socket | SocketIOClient.Socket) {}
  send(msg: Message) {
    this.socket.emit("roots-rpc", msg);
  }
  onMessage(cb: (msg: Message) => void) {
    this.socket.on("roots-rpc", cb);
    return {
      dispose: () => this.socket.off("roots-rpc", cb),
    };
  }
}
