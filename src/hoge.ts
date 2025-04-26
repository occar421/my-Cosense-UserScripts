import { getPage } from "@cosense/std/rest";

const hoge: Hoge = 3;

type Hoge = number;

console.log(hoge);

const result = await getPage("la-ekstera-cerbo", "2025/04/26");
if (result.ok) {
  const page = result.val;
  console.log("Page title:", page.title);
  console.log("Page content:", page.lines.map((line) => line.text));
  console.log("Page descriptions:", page.descriptions.join("\n"));
}
