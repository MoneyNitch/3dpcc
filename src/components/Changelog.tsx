import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { Element, Root } from "hast";

function rehypeReleaseCards() {
  return (tree: Root) => {
    const children: Root["children"] = [];
    let release: Element | undefined;
    for (const node of tree.children) {
      if (node.type === "doctype") {
        children.push(node);
        continue;
      }
      if (node.type === "element" && node.tagName === "h2") {
        release = {
          type: "element",
          tagName: "article",
          children: [],
          properties: {
            className: ["rounded-xl", "border", "border-slate-200", "bg-white", "p-4", "shadow-sm", "sm:p-5", "dark:border-slate-700", "dark:bg-slate-900/50"],
            "data-changelog-release": true,
          },
        };
        children.push(release);
      }
      if (release) release.children.push(node);
      else children.push(node);
    }
    tree.children = children;
  };
}

const remarkPlugins = [remarkGfm];
const rehypePlugins = [rehypeReleaseCards];

export function Changelog({ text }: { text: string }) {
  return (
    <div className="mt-3 max-h-[36rem] space-y-4 overflow-y-auto break-words text-sm leading-relaxed text-slate-700 dark:text-slate-200 [&_p]:my-2 [&_ul]:my-2 [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:my-2 [&_ol]:list-decimal [&_ol]:pl-5 [&_li]:my-1 [&_blockquote]:border-l-2 [&_blockquote]:border-slate-300 [&_blockquote]:pl-4 [&_hr]:my-4 [&_hr]:border-slate-300 [&_pre]:my-3 [&_pre]:overflow-x-auto [&_pre]:rounded-lg [&_pre]:bg-slate-100 [&_pre]:p-3 dark:[&_pre]:bg-slate-800 [&_code]:rounded [&_code]:bg-slate-100 [&_code]:px-1 [&_code]:font-mono [&_code]:text-xs dark:[&_code]:bg-slate-800">
      <Markdown remarkPlugins={remarkPlugins} rehypePlugins={rehypePlugins} skipHtml components={{
        h1: ({ children }) => <h4 className="text-lg font-semibold text-slate-800 dark:text-slate-100">{children}</h4>,
        h2: ({ children }) => <h4 className="mb-4 border-b border-slate-200 pb-3 text-base font-semibold text-orange-700 dark:border-slate-700 dark:text-orange-300">{children}</h4>,
        h3: ({ children }) => <h5 className="mb-2 mt-4 font-semibold text-slate-800 dark:text-slate-100">{children}</h5>,
        h4: ({ children }) => <h6 className="mb-2 mt-3 font-semibold">{children}</h6>,
        h5: ({ children }) => <h6 className="mb-2 mt-3 font-semibold">{children}</h6>,
        h6: ({ children }) => <h6 className="mb-2 mt-3 font-semibold">{children}</h6>,
        a: ({ href, children }) => href && /^https?:\/\//i.test(href)
          ? <a href={href} target="_blank" rel="noopener noreferrer" referrerPolicy="no-referrer"
            className="text-orange-700 underline underline-offset-2 dark:text-orange-300">{children}</a>
          : <span>{children}</span>,
        // Remote images must not contact third-party servers merely by opening Settings.
        img: ({ alt }) => <span className="italic">{alt}</span>,
        table: ({ children }) => <div className="my-3 overflow-x-auto"><table className="w-full border-collapse text-left">{children}</table></div>,
        th: ({ children }) => <th className="border border-slate-300 bg-slate-100 px-3 py-2 font-semibold dark:border-slate-600 dark:bg-slate-800">{children}</th>,
        td: ({ children }) => <td className="border border-slate-300 px-3 py-2 dark:border-slate-600">{children}</td>,
      }}>{text}</Markdown>
    </div>
  );
}
