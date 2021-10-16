
type Action<T, K> = (data: T) => Promise<K>

type DependencyGraph<T extends {[ key: string ]: unknown}> = {
  [name: string]: {
    needs?: keyof T | Array<keyof T>,
    up?: Action<T, T[string]>
  }
}
export default class Applife<T extends {[ key: string ]: unknown }> {
  private loaded: Partial<Record<keyof T, T[string]>> = {}
  private up = new Map<keyof T, Promise<T[string]>>()

  constructor(private dependencies: DependencyGraph<T>) {}

  private async upDependency(dependencyName: keyof DependencyGraph<T>): Promise<T[string] | undefined> {
    const dep = this.dependencies[dependencyName]
    if (dep.needs) {
      if (Array.isArray(dep.needs))
        await Promise.all((dep.needs as Array<keyof T>).map((d: keyof T) => this.upDependency(d as any)))
      else
        await this.upDependency(dep.needs as string)
    }
    if (dep.up) {
      if (!this.up.has(dependencyName))
        this.up.set(dependencyName, dep.up(this.loaded as T))
      this.loaded[dependencyName as keyof T] = await this.up.get(dependencyName)
    }
    return Promise.resolve(undefined)
  }

  async load(): Promise<T> {
    await Promise.all(Object.keys(this.dependencies).map(dep => this.upDependency(dep)))
    return this.loaded as T
  }
}
