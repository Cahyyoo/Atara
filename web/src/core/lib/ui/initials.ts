/** Up to two capitals from a name, for an avatar: "Lab Admin" -> "LA". */
export function initialsOf(name: string): string {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0]?.toUpperCase() ?? "")
    .join("");
}
