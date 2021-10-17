import { expect } from "chai";
import { isCryptoKey } from "util/types";
import Applife from "../src"

const returnAfter =
  (arr: string[]) =>
    (t: number, c: string = "") =>
      () =>
        new Promise<string>(r => setTimeout(() => { arr.push(c); r(c) }, t))

const failAfter =
  (arr: string[]) =>
    (t: number, c: string = "") =>
      () =>
        new Promise<string>((_, j) => setTimeout(() => { arr.push(c); j(new Error(c)) }, t))

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
      a: { up: r(10, "a") },
      c: {
        needs: ["a", "b"],
        up: r(10, "c"),
      }
    })
    const now = Date.now()
    const { a, b, c } = await app.start()
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
    const { a, b, c } = await app.start()
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
    await app.start()
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
    const { a, b, c } = await app.start()
    expect(a).to.eql(1)
    expect(b).to.eql(11)
    expect(c).to.eql(112)
  })
  it("If a boot event fails, the app shutdowns", async () => {
    const sequence: string[] = []
    const r = returnAfter(sequence)
    const j = failAfter(sequence)

    /** - boot, x failed, . not run, _ shutdown
     *  a -  _
     *  b  -      _
     *  c  -x
     *  d  -----__
     *  e  ---x
     *  f      .
     */

    const app = new Applife({
      a: { up: r(10, "A"), down: r(10, "a") },
      b: { needs: "a", up: r(10, "B"), down: r(10, "b"), after: ["c", "d"] },
      c: { needs: "a", up: j(20, "C") },
      d: { needs: "a", up: r(50, "D"), down: r(20, "d"), after: "f" },
      e: { needs: "a", up: j(40, "E"), down: r(10, "e") },
      f: { needs: "e", up: r(10, "F"), down: r(10, "f") },
    })
    try {
      await app.start()
      return Promise.reject(new Error("Should have thrown"))
    } catch (e) {
      expect(e).to.be.an("Error")
      expect((e as Error).message).to.equal("Boot sequence failed")
      expect((e as { details: Error[] }).details).to.be.an("array").of.length(2)
      expect((e as { details: Error[]}).details[0].message).to.equal("C")
      expect((e as { details: Error[]}).details[1].message).to.equal("E")
      expect(sequence).to.deep.equal(["A", "B", "C", "a", "E", "D", "d", "b"])
    }
  })
  it("The app can be started / ended", async () => {
    const sequence: string[] = []
    const r = returnAfter(sequence)

    const app = new Applife({
      a: { up: r(0, "A") },
      b: { needs: "a", up: r(0, "B"), down: r(0, "b") },
      c: { after: "b", down: r(0, "c") },
    })
    await app.start()
      .then(() => app.stop())
    expect(sequence).to.deep.equal(["A", "B", "b", "c"])
  })
  it("The app can be run", async () => {
    const sequence: string[] = []
    const r = returnAfter(sequence)

    const app = new Applife({
      a: { up: r(0, "A") },
      b: { needs: "a", up: r(0, "B"), down: r(0, "b") },
      c: { after: "b", down: r(0, "c") }
    })
    await app.run()
    expect(sequence).to.deep.equal(["A", "B", "b", "c"])
  })
  it("The app intercepts shutdowns and gracefully terminates")
})