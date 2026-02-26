/**
 * Screenshot utility — capture canvas or DOM element as PNG.
 */

/** Capture a canvas element as PNG and trigger download */
export function downloadCanvasPNG(
  canvas: HTMLCanvasElement,
  filename: string = "antsim-screenshot.png"
): void {
  const dataUrl = canvas.toDataURL("image/png");
  const a = document.createElement("a");
  a.href = dataUrl;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

/** Find the R3F canvas element in the DOM */
export function findR3FCanvas(): HTMLCanvasElement | null {
  return document.querySelector("canvas");
}

/** Capture the 3D viewport and download as PNG */
export function downloadViewportScreenshot(
  filename: string = "antsim-3d.png"
): void {
  const canvas = findR3FCanvas();
  if (!canvas) {
    console.warn("No canvas element found for screenshot");
    return;
  }
  downloadCanvasPNG(canvas, filename);
}

/** Export an SVG element as SVG file */
export function downloadSVG(
  svgElement: SVGSVGElement,
  filename: string = "antsim-chart.svg"
): void {
  const serializer = new XMLSerializer();
  const svgString = serializer.serializeToString(svgElement);
  const blob = new Blob([svgString], { type: "image/svg+xml;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
