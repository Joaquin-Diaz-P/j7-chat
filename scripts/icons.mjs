import sharp from "sharp";
for (const scale of [1, 2]) {
  const size = 18 * scale;
  const pixels = await sharp("assets/icon.svg")
    .resize(size, size)
    .ensureAlpha()
    .raw()
    .toBuffer();
  const alpha = Buffer.alloc(size * size);
  for (let i = 0; i < alpha.length; i++) {
    const offset = i * 4;
    const luminance =
      (pixels[offset] + pixels[offset + 1] + pixels[offset + 2]) / 3;
    alpha[i] = luminance < 200 ? pixels[offset + 3] : 0;
  }
  await sharp({
    create: { width: size, height: size, channels: 3, background: "#000" },
  })
    .joinChannel(alpha, { raw: { width: size, height: size, channels: 1 } })
    .png()
    .toFile(`assets/iconTemplate${scale === 2 ? "@2x" : ""}.png`);
}
