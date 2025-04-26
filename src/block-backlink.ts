import { getPage } from "@cosense/std/rest";
import type { BaseLine, Page } from "@cosense/types/rest";
import { scrapbox } from "@cosense/types/userscript";

interface ChunkLine {
  type: "base" | "follow" | "omitted";
  line?: BaseLine;
  innerIndents: number;
}

interface Chunk {
  blockId: string;
  lines: ChunkLine[];
  indents: number;
}

interface TextSegment {
  type: "plain" | "link" | "icon";
  text: string;
  external?: boolean;
}

scrapbox.on("page:changed", process);
process(); // on load

function process(): void {
  document.querySelector(".block-backlinks")?.remove();
  const projectName = scrapbox.Project.name;
  const titleLc = scrapbox.Project.pages.find(
    (p) => p.id === scrapbox.Page.id,
  )?.titleLc;

  if (typeof titleLc === "undefined") {
    return;
  }

  const backlinkPages = scrapbox.Project.pages.filter(
    (p) => p.exists && p.linksLc?.includes(titleLc),
  );

  const $relPageList = document.querySelector("section.related-page-list");
  if (!$relPageList) {
    return;
  }

  const $links = document.createElement("details");
  $links.classList.add("block-backlinks");
  $links.insertAdjacentHTML(
    "afterbegin",
    `<summary><span class="title">Block Backlinks (${backlinkPages.length} pages)</span></summary>`,
  );
  const $content = document.createElement("div");
  $content.classList.add("content");
  $links.appendChild($content);

  $links.addEventListener("toggle", async () => {
    if ($links.open && !$content.hasAttribute("data-fetch")) {
      $content.setAttribute("data-fetch", "loading");

      const $viewList = document.createElement("ul");
      $viewList.classList.add("list");
      $content.appendChild($viewList);

      const promises = backlinkPages
        .map((p) => p.titleLc)
        .map((t) =>
          getPage(projectName, t).then((result) => {
            if (result.ok) {
              const p = result.val;

              const $item = document.createElement("li");
              $item.classList.add("item");
              // @ts-ignore
              $item.style.order = String(-p.created); // desc order by created time

              $item.insertAdjacentHTML(
                "afterbegin",
                `<div><span class="page-title">${p.title}</span></div>`,
              );

              const chunks = pageToChunks(p, titleLc);

              for (const c of chunks) {
                const $chunkArea = document.createElement("div");
                $chunkArea.classList.add("chunk");
                const $chunkAnchor = document.createElement("a");
                $chunkAnchor.setAttribute("rel", "route");
                $chunkAnchor.setAttribute(
                  "href",
                  `/${projectName}/${encodeURIComponent(p.title)}#${c.blockId}`,
                );

                const $chunkContent = document.createElement("div");

                for (const l of c.lines) {
                  const $line = document.createElement("div");
                  $line.classList.add("line");

                  const $text = document.createElement("span");
                  $line.appendChild($text);
                  $text.classList.add("text");
                  $text.setAttribute(
                    "data-indents",
                    String((c.indents > 0 ? 1 : 0) + l.innerIndents),
                  );
                  if (l.type === "omitted") {
                    $text.classList.add("omitted");
                    $text.append(" ");
                  } else if (l.line) {
                    const text = l.line.text.trimStart();
                    const segments = parseTextToSegment(text);

                    for (const s of segments) {
                      const $segment = document.createElement("span");

                      switch (s.type) {
                        case "plain":
                          $segment.append(s.text);
                          break;
                        case "link":
                          $segment.append(s.text);
                          $segment.classList.add("link");
                          if (s.external) {
                            $segment.classList.add("external");
                          }
                          break;
                        case "icon": {
                          const $img = document.createElement("img");
                          const iconRef = s.text.slice(0, -5); // remove last ".icon"
                          $img.classList.add("inline-icon");
                          $img.setAttribute(
                            "src",
                            `/api/pages/${projectName}/${iconRef}/icon`,
                          );
                          $segment.appendChild($img);
                          break;
                        }
                      }

                      $text.appendChild($segment);
                    }
                  }

                  $chunkContent.appendChild($line);
                }

                $chunkAnchor.appendChild($chunkContent);
                $chunkArea.appendChild($chunkAnchor);
                $item.appendChild($chunkArea);
              }

              $viewList.appendChild($item);
            }
          }),
        );

      await Promise.allSettled(promises);

      $content.setAttribute("data-fetch", "finished");
    }
  });

  $relPageList.before($links);
}

export function pageToChunks(page: Page, titleLc: string): Chunk[] {
  const upperCaseHashTag = `#${titleLc.toUpperCase()}`;
  const upperCaseLink = `[${titleLc.toUpperCase()}`; // omit closing bracket because [a] and [a#b] are both valid links;

  const matchIndices = page.lines
    .map((l, i): [BaseLine, number] => [l, i])
    .filter(
      (x) =>
        x[0].text.toUpperCase().indexOf(upperCaseHashTag) > -1 ||
        x[0].text.toUpperCase().indexOf(upperCaseLink) > -1,
    )
    .map((x) => x[1]);

  return matchIndices.map((mi) => {
    const baseLine = page.lines[mi];
    const baseIndents = baseLine.text.length - baseLine.text.trimStart().length;
    const chunkLines: ChunkLine[] = [
      {
        type: "base",
        line: baseLine,
        innerIndents: 0,
      },
    ];
    for (let i = mi + 1; i < page.lines.length; i++) {
      const line = page.lines[i];
      const lineIndents = line.text.length - line.text.trimStart().length;
      if (lineIndents <= baseIndents) {
        break;
      }

      // 深すぎる場合は省略
      if (lineIndents > baseIndents + 2) {
        if (chunkLines.slice(-1)[0].type !== "omitted") {
          chunkLines.push({
            type: "omitted",
            innerIndents: lineIndents - baseIndents,
          });
        }
      } else {
        chunkLines.push({
          type: "follow",
          line,
          innerIndents: lineIndents - baseIndents,
        });
      }
    }
    return { blockId: baseLine.id, lines: chunkLines, indents: baseIndents };
  });
}

export function parseTextToSegment(_text: string): TextSegment[] {
  let text = _text;
  if (text.startsWith(">")) {
    text = text.slice(1);
  }

  // [bracket notations]
  let index = 0;
  let segments: TextSegment[] = [];
  for (const m of text.matchAll(/(\[(.+?)])/g)) {
    segments.push({ type: "plain", text: text.slice(index, m.index || 0) });

    const linkText = m[2];
    const externalLinkMatch = linkText.match(/^(.*?\S.*?)\s+https?:\/\/\S+?$/);
    const decorationMatch = linkText.match(/^[\/\-*]\s(.+)/);
    if (externalLinkMatch) {
      segments.push({
        type: "link",
        external: true,
        text: externalLinkMatch[1],
      });
    } else if (decorationMatch) {
      segments.push({ type: "plain", text: decorationMatch[1] });
    } else if (linkText.endsWith(".icon")) {
      segments.push({ type: "icon", text: linkText });
    } else {
      segments.push({ type: "link", text: linkText });
    }

    index = (m.index || 0) + m[1].length;
  }
  segments.push({ type: "plain", text: text.slice(index) });

  // url link
  segments = segments.flatMap((s) => {
    if (s.type === "plain") {
      const text = s.text;

      let index = 0;
      const segments: TextSegment[] = [];
      for (const m of text.matchAll(/(^|\s)(https?:\/\/\S+)(\s|$)/g)) {
        segments.push({ type: "plain", text: text.slice(index, m.index || 0) });
        segments.push({ type: "link", external: true, text: m[2] });

        index = (m.index || 0) + m[2].length;
      }
      segments.push({ type: "plain", text: text.slice(index) });
      return segments;
    }

    return s;
  });

  // #hashtag
  segments = segments.flatMap((s) => {
    if (s.type === "plain") {
      const text = s.text;

      let index = 0;
      const segments: TextSegment[] = [];
      for (const m of text.matchAll(/(#.+?)(\s|$)/g)) {
        segments.push({ type: "plain", text: text.slice(index, m.index || 0) });
        segments.push({ type: "link", text: m[1] });

        index = (m.index || 0) + m[1].length;
      }
      segments.push({ type: "plain", text: text.slice(index) });
      return segments;
    }

    return s;
  });

  return segments.filter((s) => s.text.length > 0);
}
