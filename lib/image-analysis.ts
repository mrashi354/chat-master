/** Lightweight, offline image summary used as chat context when no vision model is configured. */

function colorName(r: number, g: number, b: number): string {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const delta = max - min;
  const light = (max + min) / 2;
  if (delta < 18) {
    if (light < 35) return "black/dark grey";
    if (light > 220) return "white/light grey";
    return "grey";
  }
  let hue = 0;
  if (max === r) hue = ((g - b) / delta) % 6;
  else if (max === g) hue = (b - r) / delta + 2;
  else hue = (r - g) / delta + 4;
  hue = (hue * 60 + 360) % 360;
  if (hue < 15 || hue >= 345) return "red";
  if (hue < 45) return "orange/brown";
  if (hue < 70) return "yellow";
  if (hue < 160) return "green";
  if (hue < 200) return "cyan";
  if (hue < 255) return "blue";
  if (hue < 290) return "purple";
  return "pink/magenta";
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Image load nahi ho payi"));
    image.src = url;
  });
}

/**
 * Reads basic visual signals (size, composition, dominant colors, brightness)
 * so the assistant has real context instead of saying "I cannot see images".
 */
export async function analyzeImage(url: string): Promise<string | undefined> {
  if (typeof window === "undefined") return undefined;
  try {
    const image = await loadImage(url);
    const canvas = document.createElement("canvas");
    canvas.width = 40;
    canvas.height = 40;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) return undefined;
    ctx.drawImage(image, 0, 0, 40, 40);
    const pixels = ctx.getImageData(0, 0, 40, 40).data;

    let r = 0;
    let g = 0;
    let b = 0;
    let light = 0;
    let dark = 0;
    const count = pixels.length / 4;
    for (let i = 0; i < pixels.length; i += 4) {
      r += pixels[i];
      g += pixels[i + 1];
      b += pixels[i + 2];
      const luminance = 0.2126 * pixels[i] + 0.7152 * pixels[i + 1] + 0.0722 * pixels[i + 2];
      if (luminance > 190) light += 1;
      else if (luminance < 65) dark += 1;
    }
    r = Math.round(r / count);
    g = Math.round(g / count);
    b = Math.round(b / count);
    const brightness = Math.round((0.2126 * r + 0.7152 * g + 0.0722 * b) / 2.55);
    const ratio = image.naturalWidth / Math.max(1, image.naturalHeight);
    const orientation = ratio > 1.15 ? "landscape" : ratio < 0.85 ? "portrait" : "square";

    return (
      `Programmatic visual summary of the attached image (coarse, not a full description): ` +
      `${image.naturalWidth}×${image.naturalHeight}px ${orientation}, dominant colour ${colorName(r, g, b)} ` +
      `(average rgb(${r},${g},${b})), brightness ${brightness}%, ` +
      `${Math.round((light / count) * 100)}% bright and ${Math.round((dark / count) * 100)}% dark regions. ` +
      `If the user asks for edits such as adding text or a caption, guide them to the Image Studio.`
    );
  } catch {
    return undefined;
  }
}
