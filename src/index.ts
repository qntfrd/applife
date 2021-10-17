
type Action<T, K> = (data: T) => Promise<K>

type DependencyGraph<T extends {[ key: string ]: unknown}> = {
  [name: string]: {
    needs?: keyof T | Array<keyof T>,
    up?: Action<T, T[string]>,
    down?: Action<T, T[string]>,
    after?: keyof T | Array<keyof T>,
  }
}
export default class Applife<T extends {[ key: string ]: unknown }> {
  private loaded: Partial<Record<keyof T, T[string]>> = {}
  private up = new Map<keyof T, Promise<T[string]>>()
  private down = new Map<keyof T, Promise<T[string]>>()
  private errors = new Map<keyof T, Error>()

  constructor(private dependencies: DependencyGraph<T>) {}

  private async downDependency(dependencyName: keyof DependencyGraph<T>): Promise<void> {
    const dep = this.dependencies[dependencyName]
    if (dep.after) {
      const after: Array<keyof T> = Array.isArray(dep.after) ? [...dep.after] : [dep.after]
      await Promise.all(after.map((d: keyof T) => this.downDependency(d as any)))
    }
    if (dep.down) {
      // dependency was not started => skip
      if (!this.up.has(dependencyName)) return Promise.resolve()
      else {
        // make sure the dependency was started or errored
        try {
          await this.up.get(dependencyName)
        } catch {
          return Promise.resolve()
        }
      }

      if (!this.down.has(dependencyName))
        this.down.set(dependencyName, dep.down(this.loaded as T))
      await this.down.get(dependencyName)
    }
  }

  private async upDependency(dependencyName: keyof DependencyGraph<T>): Promise<T[string] | undefined> {
    const dep = this.dependencies[dependencyName]
    if (dep.needs) {
      const needs: Array<keyof T> = Array.isArray(dep.needs) ? [...dep.needs] : [dep.needs]
      await Promise.all(needs.map((d: keyof T) => this.upDependency(d as any)))
    }
    if (dep.up) {
      if (this.errors.size > 0) return Promise.resolve(undefined);

      if (!this.up.has(dependencyName))
        this.up.set(dependencyName, dep.up(this.loaded as T))
      try {
        this.loaded[dependencyName as keyof T] = await this.up.get(dependencyName)
      }
      catch (e) {
        this.errors.set(dependencyName as keyof T, e as Error)
        await this.stop()
      }
    }
    return Promise.resolve(undefined)
  }

  async stop(): Promise<void> {
    await Promise.all(Object.keys(this.dependencies).map(dep => this.downDependency(dep)))
  }

  async load(): Promise<T> {
    await Promise.all(Object.keys(this.dependencies).map(dep => this.upDependency(dep)))
    if (this.errors.size > 0) {
      const e = new Error("Boot sequence failed")
      ;(e as { details: Error[] } & Error).details = Array.from(this.errors.values())
      throw e
    }
    return this.loaded as T
  }
}
