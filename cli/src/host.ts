/** Capabilities supplied by an execution host; no ambient filesystem or process. */
export interface CliHost {
  /** Browser profile overrides the installed CLI's legacy trial notice. */
  keylessNotice?: string;
  /**
   * Commands this host refuses, and leaves out of root help. The browser
   * runtime lists `api` and `status`: its server proxy holds another
   * organization's key, whose identity and quotas they would expose.
   */
  unavailableCommands?: readonly string[];
  utf8ByteLength(text: string): number;
  readFile(path: string): string;
  writeCache(path: string, contents: string): void;
  exists(path: string): boolean;
  resolve(...parts: string[]): string;
  dirname(path: string): string;
  join(...parts: string[]): string;
  homedir(): string;
  sha256(text: string): string;
  version: { version: string; sdkVersion: string; node: string };
}
