package dev.kadkerja.photo;

import java.awt.Color;
import java.awt.Graphics2D;
import java.awt.image.BufferedImage;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.UncheckedIOException;
import java.nio.charset.StandardCharsets;
import javax.imageio.ImageIO;

/** Made-up images drawn in code (no real photos in the repository). */
public final class TestImages {
  private TestImages() {}

  public static byte[] png(int w, int h) {
    return write(drawn(w, h, BufferedImage.TYPE_INT_ARGB), "png");
  }

  public static byte[] jpeg(int w, int h) {
    return write(drawn(w, h, BufferedImage.TYPE_INT_RGB), "jpeg");
  }

  /** A JPEG with an extra APP1 "Exif" block holding [marker], like a phone's GPS position. */
  public static byte[] jpegWithMetadata(int w, int h, String marker) {
    byte[] plain = jpeg(w, h);
    byte[] payload = ("Exif\0\0" + marker).getBytes(StandardCharsets.ISO_8859_1);
    int len = payload.length + 2;
    ByteArrayOutputStream out = new ByteArrayOutputStream();
    out.write(plain, 0, 2); // SOI
    out.write(0xff);
    out.write(0xe1);
    out.write(len >> 8);
    out.write(len & 0xff);
    out.write(payload, 0, payload.length);
    out.write(plain, 2, plain.length - 2);
    return out.toByteArray();
  }

  public static BufferedImage read(byte[] bytes) {
    try {
      return ImageIO.read(new java.io.ByteArrayInputStream(bytes));
    } catch (IOException e) {
      throw new UncheckedIOException(e);
    }
  }

  private static BufferedImage drawn(int w, int h, int type) {
    BufferedImage img = new BufferedImage(w, h, type);
    Graphics2D g = img.createGraphics();
    g.setColor(new Color(15, 118, 110));
    g.fillRect(0, 0, w / 2, h);
    g.setColor(Color.ORANGE);
    g.fillRect(w / 2, 0, w - w / 2, h);
    g.dispose();
    return img;
  }

  private static byte[] write(BufferedImage img, String format) {
    try {
      ByteArrayOutputStream out = new ByteArrayOutputStream();
      if (!ImageIO.write(img, format, out)) {
        throw new IllegalStateException("no writer for " + format);
      }
      return out.toByteArray();
    } catch (IOException e) {
      throw new UncheckedIOException(e);
    }
  }
}
