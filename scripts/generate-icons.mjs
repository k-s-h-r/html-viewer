import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import png2icons from "png2icons";
import sharp from "sharp";

const rootDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const sourceSvg = path.join(rootDir, "assets", "icon-html-viewer.svg");
const outputDir = path.join(rootDir, "assets", "icon");
const outputBase = path.join(outputDir, "icon");

await mkdir(outputDir, { recursive: true });

const png1024 = await sharp(sourceSvg, { density: 300 })
  .resize(1024, 1024, { fit: "contain", background: { r: 255, g: 255, b: 255, alpha: 1 } })
  .png()
  .toBuffer();

const png512 = await sharp(png1024).resize(512, 512).png().toBuffer();

await writeFile(`${outputBase}.png`, png512);

const icns = png2icons.createICNS(png1024, png2icons.BILINEAR, 0);
if (!icns) {
  throw new Error("Failed to generate .icns from assets/icon-html-viewer.svg");
}
await writeFile(`${outputBase}.icns`, icns);

const ico = png2icons.createICO(png1024, png2icons.BILINEAR, 0, false, true);
if (!ico) {
  throw new Error("Failed to generate .ico from assets/icon-html-viewer.svg");
}
await writeFile(`${outputBase}.ico`, ico);

console.log(`Generated ${outputBase}.{png,icns,ico} from assets/icon-html-viewer.svg`);
