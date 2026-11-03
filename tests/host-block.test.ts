import { build } from "esbuild";
import MarkdownIt, { type MarkdownIt as MarkdownParser } from "markdown-it";
import { beforeAll, describe, expect, it } from "vitest";
import { markdownExtensions, MERMAID_BLOCK } from "../shared/markdown/extensions.js";
import {
  codeBlockLanguage,
  codeBlockMarkdown,
  hostCodeBlockMarkdown,
} from "../shared/markdown/host-block.js";
import { MAX_MATH_EXPRESSION } from "../shared/limits.js";

interface BlockNode {
  type: string;
  content: string;
  sourceInfo?: string;
  children: BlockNode[];
}

// Exercise the dependency's real AST fields, including sourceInfo rather than info.
let parse: (
  source: string,
  render: (nodes: BlockNode[]) => BlockNode[],
  md: MarkdownParser,
) => BlockNode[];
beforeAll(async () => {
  const bundle = await build({
    entryPoints: ["node_modules/react-native-markdown-display/src/lib/parser.js"],
    bundle: true,
    platform: "node",
    format: "esm",
    write: false,
  });
  parse = (
    await import(
      `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString("base64")}`
    )
  ).default;
});

function blocks(source: string): BlockNode[] {
  const found: BlockNode[] = [];
  function visit(nodes: BlockNode[]): void {
    for (const node of nodes) {
      if (["fence", "code_block", MERMAID_BLOCK].includes(node.type)) found.push(node);
      visit(node.children);
    }
  }
  visit(parse(source, (nodes) => nodes, new MarkdownIt().use(markdownExtensions)));
  return found;
}

function expectStandaloneBlock(node: BlockNode): void {
  const reparsed = new MarkdownIt().parse(codeBlockMarkdown(node), {});
  expect(reparsed).toHaveLength(1);
  expect(reparsed[0].type).toBe("fence");
  expect(reparsed[0].content).toBe(node.content);
  expect(reparsed[0].info).toBe(node.sourceInfo ?? "");
}

describe("standalone host code blocks", () => {
  it("keeps the actual AST language and the rest of the info string", () => {
    const [node] = blocks('```typescript title="hello.ts"\nconst x = 1;\n```');
    expect(node.sourceInfo).toBe('typescript title="hello.ts"');
    expect(codeBlockLanguage(node)).toBe("typescript");
    expectStandaloneBlock(node);
  });

  it.each([
    '> ```mermaid\n> flowchart LR\n>   A["hello"] --> B\n> ```',
    '- Diagram:\n\n  ```mermaid\n  flowchart LR\n    A["hello"] --> B\n  ```',
    '> - Diagram:\n>\n>   ```mermaid\n>   flowchart LR\n>     A["hello"] --> B\n>   ```',
  ])("removes container markers through the real parser: %s", (source) => {
    const [node] = blocks(source);
    expect(node.type).toBe(MERMAID_BLOCK);
    expect(node.content).toBe('flowchart LR\n  A["hello"] --> B\n');
    expectStandaloneBlock(node);
  });

  it("keeps indented code inside a list as one unlabeled block", () => {
    const [node] = blocks("- Example:\n\n      const x = 1;\n        nested();\n");
    expect(node.type).toBe("code_block");
    expect(node.content).toBe("const x = 1;\n  nested();\n");
    expectStandaloneBlock(node);
  });

  it("keeps backtick and tilde runs inside code instead of ending the fence", () => {
    const [node] = blocks("~~~~~~~~markdown\n``````\n# Still code\n~~~~~~~\n`inline`\n~~~~~~~~");
    expectStandaloneBlock(node);
    expect(codeBlockMarkdown(node)).toMatch(/^`{7}markdown\n/);
  });

  it("uses a safe tilde fence when the info string contains backticks", () => {
    const [node] = blocks('~~~~~~text title="`sample`"\n~~~~~\n```\n~~~~~~');
    expect(node.sourceInfo).toBe('text title="`sample`"');
    expectStandaloneBlock(node);
    expect(codeBlockMarkdown(node)).toMatch(/^~{6}text /);
  });

  it.each(["```js\n```", "~~~\n~~~", "```python\nprint('streaming')\n"])(
    "keeps empty and still-open parsed blocks: %s",
    (source) => {
      const [node] = blocks(source);
      expectStandaloneBlock(node);
    },
  );

  it("does not turn Markdown or math inside code into separate nodes", () => {
    const [node] = blocks("```text\n$x$\n\n> quoted\n\n| a | b |\n| - | - |\n```");
    expectStandaloneBlock(node);
    expect(blocks(codeBlockMarkdown(node))).toHaveLength(1);
  });

  it("retains the language and info string of a promoted diagram", () => {
    const [node] = blocks('~~~MERMAID title="Workflow"\nflowchart LR\nA --> B\n~~~');
    expect(node.type).toBe(MERMAID_BLOCK);
    expect(node.sourceInfo).toBe('MERMAID title="Workflow"');
    expectStandaloneBlock(node);
  });
});

describe("host code delegation", () => {
  it.each([
    "```typescript\nconst x = 1;\n```",
    "```python\nprint('streaming')\n",
    "    indented();\n",
  ])("delegates ordinary code only when its enhancement is off: %s", (source) => {
    const [node] = blocks(source);
    expect(hostCodeBlockMarkdown(node, false)).toBe(codeBlockMarkdown(node));
    expect(hostCodeBlockMarkdown(node, true)).toBeUndefined();
  });

  it.each(["math", "mermaid"])(
    "keeps rejected %s fences as source, never as rebuilt host fences",
    (language) => {
      const sources = [
        `\`\`\`${language}\nx`,
        `\`\`\`${language}\nx\n\`\`\` trailing`,
        `~~~${language.toUpperCase()} title\nx`,
      ];
      for (const source of sources) {
        const [node] = blocks(source);
        expect(node.type).toBe("fence");
        expect(hostCodeBlockMarkdown(node, false)).toBeUndefined();
        expect(hostCodeBlockMarkdown(node, true)).toBeUndefined();
      }
    },
  );

  it("keeps oversized math as source while delegating long diagrams beside formulas", () => {
    const [math] = blocks(`\`\`\`math\n${"x".repeat(MAX_MATH_EXPRESSION + 1)}\n\`\`\``);
    expect(math.type).toBe("fence");
    expect(hostCodeBlockMarkdown(math, false)).toBeUndefined();
    const [diagram] = blocks(
      `Formula $x$.\n\n\`\`\`mermaid\nflowchart LR\nA --> B\n%% ${"x".repeat(32 * 1024)}\n\`\`\``,
    );
    expect(diagram.type).toBe(MERMAID_BLOCK);
    expectStandaloneBlock(diagram);
  });

  it("does not pass an empty Mermaid fence to the host diagram engine", () => {
    const [node] = blocks("```mermaid\n\n```");
    expect(node.type).toBe("fence");
    expect(hostCodeBlockMarkdown(node, false)).toBeUndefined();
  });
});
