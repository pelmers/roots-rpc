# roots-rpc

This package implements a fully-typed yet dead-simple RPC library for
Typescript without any codegen required. Supports calling functions with any
JSON-encodeable parameters and return values.

Also supports streaming results with observable-subscription pattern. See the
[test file](https://github.com/pelmers/roots-rpc/blob/master/src/__tests__/rpc.test.ts)
for usage examples.

```
npm install roots-rpc
```

### Example

This example shows calling a function from a client on a server. The function
SumDiff takes in parameters `a` and `b` and it returns their sum as `sum` and
difference as `diff`.

N.b: This is _100% typechecked_, so any mismatch between the
server implementation and client call site would cause a build-time error.

**types.ts**

```typescript
import * as t from 'io-ts';

const Input = t.type({a: t.number, b: t.number});
const Output = t.type({sum: t.number, diff: t.number});
export const TInput = t.TypeOf<typeof Input>;
export const TOutput = t.TypeOf<typeof TOutput>;

export function SumDiff() {
    return {i: Input, o: Output};
}
```

**server.ts**

```typescript
import { RpcServer } from "roots-rpc";
import { SumDiff } from "./types";

const rpcServer = new RpcServer(new Transport());
rpcServer.register(SumDiff, async ({ a, b }) => ({ sum: a + b, diff: a - b }));
```

**client.ts**

```typescript
import { RpcClient } from "roots-rpc";
import { SumDiff } from "./types";

async function main() {
  const rpcClient = new RpcClient(new Transport());
  const getSumDiff = rpcClient.connect(SumDiff);
  const result = await getSumDiff({ a: 3, b: 1 });
  // result = {sum: 4, diff: 2}
}
```

### Build

```
yarn
yarn build
```

### Naming

Roots because it's:

- used in my [Seattle Trees website](https://seattletrees.pelmers.com)
- ending in -ts, evoking Typescript
- a simple base layer for programs to build upon

https://pelmers.com/typesafe-rpc-without-codegen/
