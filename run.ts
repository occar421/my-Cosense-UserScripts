import { join } from "jsr:@std/path";
import { exists } from "jsr:@std/fs/exists";
import { serveFile } from "jsr:@std/http/file-server";
import * as esbuild from "npm:esbuild@0.20.2";
import { denoPlugins } from "jsr:@luca/esbuild-deno-loader@^0.11.1";

Deno.serve(async (request) => {
  const url = new URL(request.url);
  const filePath = join(import.meta.dirname ?? "", url.pathname);

  if (!await exists(filePath, { isFile: true })) {
    return new Response("Not Found", { status: 404 });
  }

  if (!url.pathname.endsWith(".ts")) {
    return serveFile(request, filePath);
  }

  const result = await esbuild.build({
    plugins: [...denoPlugins()],
    entryPoints: ["./hoge.ts"],
    bundle: true,
    format: "esm",
    write: false,
  });

  const bundledFile = result.outputFiles?.[0].text ?? "";

  return new Response(bundledFile, {
    headers: {
      "content-type": "application/javascript; charset=UTF-8",
      "Access-Control-Allow-Credentials": "true",
      "Access-Control-Allow-Origin": "https://scrapbox.io",
    },
  });
});
