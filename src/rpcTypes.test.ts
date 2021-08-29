import * as rpcTypes from "./rpcTypes"
// @ponicode
describe("rpcTypes.disposify", () => {
    test("0", () => {
        let callFunction: any = () => {
            rpcTypes.disposify(() => undefined)
        }
    
        expect(callFunction).not.toThrow()
    })
})
