import { marked, type Token } from "marked";

/** Build DOM from a small Markdown vocabulary. Raw HTML and remote image loading are inert. */
function render(tokens: Token[]): DocumentFragment {
  const fragment = document.createDocumentFragment();
  for (const token of tokens) {
    const t = token as Token & { text?: string; tokens?: Token[] };
    const node = (tag: string) => {
      const el = document.createElement(tag);
      el.append(
        t.tokens ? render(t.tokens) : document.createTextNode(t.text ?? ""),
      );
      return el;
    };
    switch (t.type) {
      case "space":
        break;
      case "paragraph":
        fragment.append(node("p"));
        break;
      case "text":
        fragment.append(
          t.tokens ? render(t.tokens) : document.createTextNode(t.text ?? ""),
        );
        break;
      case "heading":
        fragment.append(node(`h${Math.min(6, (t as any).depth + 2)}`));
        break;
      case "strong":
        fragment.append(node("strong"));
        break;
      case "em":
        fragment.append(node("em"));
        break;
      case "del":
        fragment.append(node("del"));
        break;
      case "codespan":
        fragment.append(node("code"));
        break;
      case "br":
        fragment.append(document.createElement("br"));
        break;
      case "hr":
        fragment.append(document.createElement("hr"));
        break;
      case "blockquote":
        fragment.append(node("blockquote"));
        break;
      case "code": {
        const block = document.createElement("div");
        block.className = "ae-code-block";
        const header = document.createElement("div");
        header.className = "ae-code-header";
        const language = document.createElement("span");
        language.textContent = (t as any).lang || "代码";
        const copy = document.createElement("button");
        copy.type = "button";
        copy.textContent = "复制代码";
        copy.addEventListener("click", async () => {
          try {
            await navigator.clipboard.writeText(
              block.querySelector("pre")?.textContent ?? "",
            );
            copy.textContent = "已复制";
          } catch {
            copy.textContent = "复制失败，请选择代码";
          }
        });
        const pre = document.createElement("pre");
        pre.append(node("code"));
        header.append(language, copy);
        block.append(header, pre);
        fragment.append(block);
        break;
      }
      case "list": {
        const list = document.createElement((t as any).ordered ? "ol" : "ul");
        if (list instanceof HTMLOListElement && (t as any).start)
          list.start = (t as any).start;
        for (const item of (t as any).items) {
          const li = document.createElement("li");
          li.append(render(item.tokens));
          list.append(li);
        }
        fragment.append(list);
        break;
      }
      case "link": {
        try {
          const url = new URL((t as any).href, location.href);
          if (!/^https?:$/.test(url.protocol) || url.username || url.password)
            throw Error();
          const link = node("a") as HTMLAnchorElement;
          link.href = url.href;
          link.target = "_blank";
          link.rel = "noopener noreferrer";
          fragment.append(link);
        } catch {
          fragment.append(node("span"));
        }
        break;
      }
      case "table": {
        const table = document.createElement("table");
        for (const [index, row] of [
          (t as any).header,
          ...(t as any).rows,
        ].entries()) {
          const tr = document.createElement("tr");
          for (const cell of row) {
            const td = document.createElement(index ? "td" : "th");
            td.append(render(cell.tokens));
            tr.append(td);
          }
          table.append(tr);
        }
        const scroll = document.createElement("div");
        scroll.className = "ae-table-scroll";
        scroll.append(table);
        fragment.append(scroll);
        break;
      }
      default:
        fragment.append(document.createTextNode(t.text ?? t.raw));
    }
  }
  return fragment;
}

export function renderMarkdown(value: string): DocumentFragment {
  return render(marked.lexer(value));
}

const rendered = new WeakMap<
  HTMLElement,
  {
    links: string;
    blocks: { key: string; nodes: Node[] }[];
  }
>();

/** Reconcile trusted rendered nodes, keeping existing code controls, scroll and text selections. */
export function updateMarkdown(target: HTMLElement, value: string) {
  const patch = (parent: Node, next: Node, offset = 0, trim = true) => {
    const desired = [...next.childNodes];
    for (let i = 0; i < desired.length; i++) {
      const fresh = desired[i]!,
        existing = parent.childNodes[i + offset];
      if (
        !existing ||
        existing.nodeType !== fresh.nodeType ||
        existing.nodeName !== fresh.nodeName
      ) {
        if (existing) parent.replaceChild(fresh, existing);
        else parent.appendChild(fresh);
      } else if (existing instanceof Text && fresh instanceof Text) {
        if (fresh.data.startsWith(existing.data))
          existing.appendData(fresh.data.slice(existing.length));
        else if (existing.data !== fresh.data) existing.data = fresh.data;
      } else if (existing instanceof Element && fresh instanceof Element) {
        for (const attr of [...existing.attributes])
          if (!fresh.hasAttribute(attr.name))
            existing.removeAttribute(attr.name);
        for (const attr of [...fresh.attributes])
          if (existing.getAttribute(attr.name) !== attr.value)
            existing.setAttribute(attr.name, attr.value);
        patch(existing, fresh);
      }
    }
    while (trim && parent.childNodes.length > desired.length)
      parent.removeChild(parent.lastChild!);
  };
  const tokens = marked.lexer(value);
  // Later reference definitions can change links in an earlier paragraph.
  // Re-lex the document, but construct/patch DOM only for changed blocks.
  const links = JSON.stringify(tokens.links);
  const previous = rendered.get(target);
  const blocks: { key: string; nodes: Node[] }[] = [];
  let offset = 0;
  for (const [index, token] of tokens.entries()) {
    const key = token.type + "\0" + token.raw;
    const prior = previous?.blocks[index];
    if (
      previous?.links === links &&
      prior?.key === key &&
      prior.nodes.every((node, i) => target.childNodes[offset + i] === node)
    ) {
      blocks.push(prior);
      offset += prior.nodes.length;
      continue;
    }
    const content = render([token]);
    const count = content.childNodes.length;
    patch(target, content, offset, false);
    blocks.push({
      key,
      nodes: [...target.childNodes].slice(offset, offset + count),
    });
    offset += count;
  }
  while (target.childNodes.length > offset) target.lastChild!.remove();
  rendered.set(target, { links, blocks });
}
