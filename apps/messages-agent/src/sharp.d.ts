declare module "sharp" {
  interface SharpPipeline {
    resize(options: { width: number; height: number; fit: "fill" }): SharpPipeline;
    jpeg(options: { quality: number; chromaSubsampling: "4:4:4" | "4:2:0" }): SharpPipeline;
    toBuffer(): Promise<Buffer>;
  }

  export default function sharp(
    input: Buffer,
    options?: { density?: number; limitInputPixels?: boolean },
  ): SharpPipeline;
}
