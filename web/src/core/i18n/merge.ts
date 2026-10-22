/**
 * Merges message catalogues key by key, so a module can add its own sections
 * under a shared namespace (`help.sections.dataSource`) without repeating the
 * rest of it. Later catalogues win on a clash, which the split never makes.
 */
export type MessageTree = { [key: string]: string | MessageTree };

export function mergeMessages(...trees: MessageTree[]): MessageTree {
  const out: MessageTree = {};
  for (const tree of trees) {
    for (const [key, value] of Object.entries(tree)) {
      const existing = out[key];
      out[key] =
        typeof value === "object" && typeof existing === "object" ? mergeMessages(existing, value) : value;
    }
  }
  return out;
}
