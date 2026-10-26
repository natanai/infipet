export type ParsedNode = { id: string; parent: number; children: number[] };

/** Iterative parser: deep source trees never recurse through the JS stack. */
export function parseNewick(text: string): ParsedNode[] {
  const nodes: ParsedNode[] = [];
  const stack: number[] = [];
  let lastClosed = -1;
  let token = "";
  let quoted = false;
  const flush = () => {
    const id = token.trim().replace(/:.*$/, "");
    token = "";
    if (!id) return;
    if (lastClosed >= 0) {
      nodes[lastClosed].id = id;
      lastClosed = -1;
    } else {
      const parent = stack.length ? stack[stack.length - 1] : -1;
      const index = nodes.length;
      nodes.push({ id, parent, children: [] });
      if (parent >= 0) nodes[parent].children.push(index);
    }
  };
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === "'") {
      if (quoted && text[i + 1] === "'") { token += "'"; i++; }
      else quoted = !quoted;
    } else if (quoted) token += c;
    else if (c === "(") {
      if (token.trim()) throw new Error("Unexpected label before subtree");
      const parent = stack.length ? stack[stack.length - 1] : -1;
      const index = nodes.length;
      nodes.push({ id: "", parent, children: [] });
      if (parent >= 0) nodes[parent].children.push(index);
      stack.push(index);
      lastClosed = -1;
    } else if (c === "," || c === ")" || c === ";") {
      flush();
      if (c === ")") {
        const closed = stack.pop();
        if (closed === undefined) throw new Error("Unbalanced Newick");
        lastClosed = closed;
      } else lastClosed = -1;
    } else token += c;
  }
  flush();
  if (quoted || stack.length) throw new Error("Unterminated Newick");
  if (!nodes.length || nodes.some((n) => !n.id)) throw new Error("Every source node must have a stable label");
  const ids = new Set(nodes.map((n) => n.id));
  if (ids.size !== nodes.length) throw new Error("Duplicate source node label");
  if (nodes.filter((n) => n.parent < 0).length !== 1) throw new Error("Expected one root");
  return nodes;
}

export function extractSubtree(text: string, rootId: string): string {
  const match = new RegExp(`(?:\\)|,|\\()${rootId}(?=[,);])`).exec(text);
  if (!match) throw new Error(`Source tree lacks ${rootId}`);
  const labelAt = match.index + 1;
  if (text[labelAt - 1] !== ")") return `${rootId};\n`;
  let depth = 1;
  for (let i = labelAt - 2; i >= 0; i--) {
    if (text[i] === ")") depth++;
    if (text[i] === "(") {
      depth--;
      if (depth === 0) return `${text.slice(i, labelAt + rootId.length)};\n`;
    }
  }
  throw new Error("Unbalanced source subtree");
}

