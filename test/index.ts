import { expect } from "chai";
import Applife from "../src"

const returnAfter =
  (arr: string[]) =>
    (t: number, c: string = "") =>
      () =>
        new Promise<string>(r => setTimeout(() => { arr.push(c); r(c) }, t))

describe("Applife", () => {
  it("Boot sequence can be sequential", async () => {
    type boot = {
      a: string
      b: string
      c: string
    }
    const callOrder: string[] = []
    const r = returnAfter(callOrder)
    const app = new Applife<boot>({
      b: {
        needs: "a",
        up: r(10, "b")
      },
      a: { up: (): Promise<string> => { console.log("AA") ; return r(10, "a")() } },
      c: {
        needs: ["a", "b"],
        up: r(10, "c"),
      }
    })
    const now = Date.now()
    const { a, b, c } = await app.load()
    expect(Date.now() - now).to.be.gte(30).and.lte(35)
    expect(callOrder).to.deep.equal(["a", "b", "c"])
    expect(a).to.eql("a")
    expect(b).to.eql("b")
    expect(c).to.eql("c")
  })
  it("Boot sequence can be paralelized", async () => {
    const callOrder: string[] = []
    const r = returnAfter(callOrder)
    const app = new Applife({
      a: { up: r(10, "a") },
      b: { up: r(10, "b") },
      c: { up: r(10, "c") },
    })
    const now = Date.now()
    const { a, b, c } = await app.load()
    expect(Date.now() - now).to.be.gte(10).and.lte(15)
    expect(a).to.eql("a")
    expect(b).to.eql("b")
    expect(c).to.eql("c")
  })
  it("Boot sequence can be a graph", async () => {
    const callOrder: string[] = []
    const r = returnAfter(callOrder)

    /** -a
     *    -b
     *      ---e
     *    --c
     *       -d
     */
    const app = new Applife({
      e: { needs: "b", up: r(30, "e") },
      d: { needs: ["c", "b"], up: r(10, "d") },
      c: { needs: "a", up: r(20, "c") },
      b: { needs: "a", up: r(10, "b") },
      a: { up: r(10, "a") },
    })
    const now = Date.now()
    await app.load()
    expect(Date.now() - now).to.be.gte(50).lte(55)
    expect(callOrder).to.deep.equal(["a", "b", "c", "d", "e"])
  })
  it("Boot sequence pass their data to next node", async () => {
    type boot = {
      a: number,
      b: number,
      c: number,
    }
    const app = new Applife<boot>({
      a: { up: () => Promise.resolve(1) },
      b: { up: ({ a }) => Promise.resolve(a + 10), needs: "a" },
      c: { up: ({ a, b }) => Promise.resolve(a + b + 100), needs: "b" }
    })
    const { a, b, c } = await app.load()
    expect(a).to.eql(1)
    expect(b).to.eql(11)
    expect(c).to.eql(112)
  })
  it("If a boot event fails, the app shutdowns")
  it("The app can be started / ended")
  it("The app can be run")
  it("The app intercepts shutdowns and gracefully terminates")
})