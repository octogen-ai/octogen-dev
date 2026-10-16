/** Session-only POSIX paths. No disk, mounts, symlinks or ambient .env discovery. */
export function resolvePath(...parts: string[]): string {
  const stack: string[] = [];
  for (const part of parts) {
    if (part.startsWith("/")) stack.length = 0;
    for (const word of part.split("/")) {
      if (word === "..") stack.pop();
      else if (word && word !== ".") stack.push(word);
    }
  }
  return `/${stack.join("/")}`;
}
export class VirtualFiles {
  private readonly entries = new Map<string, string>();
  static readonly maxBytes = 8 * 1024 * 1024;
  constructor(files: Record<string, string> = {}) {
    for (const [path, text] of Object.entries(files)) this.write(path, text);
  }
  read(path: string): string {
    const text = this.entries.get(resolvePath(path));
    if (text === undefined)
      throw new Error(`No such virtual file: ${resolvePath(path)}`);
    return text;
  }
  write(path: string, text: string): void {
    const key = resolvePath(path);
    const encoder = new TextEncoder();
    let size = encoder.encode(text).byteLength;
    for (const [name, value] of this.entries)
      if (name !== key) size += encoder.encode(value).byteLength;
    if (size > VirtualFiles.maxBytes)
      throw new Error("Virtual filesystem exceeds 8 MiB");
    this.entries.set(key, text);
  }
  exists(path: string): boolean {
    return this.entries.has(resolvePath(path));
  }
  snapshot(): Record<string, string> {
    return Object.fromEntries(this.entries);
  }
  reset(): void {
    this.entries.clear();
  }
}
