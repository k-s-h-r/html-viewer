/** FSA 非対応時のフォールバック: HTML と同階層の `./ファイル名` */
export function relativeMediaPath(file: File): string {
  const base = file.name.replace(/\\/g, "/").split("/").pop() ?? "file"
  return `./${base}`
}
