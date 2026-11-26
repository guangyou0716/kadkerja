package dev.kadkerja.photo;

import dev.kadkerja.staff.FieldException;
import java.awt.Color;
import java.awt.Graphics2D;
import java.awt.RenderingHints;
import java.awt.image.BufferedImage;
import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.util.Iterator;
import java.util.Locale;
import javax.imageio.IIOImage;
import javax.imageio.ImageIO;
import javax.imageio.ImageReadParam;
import javax.imageio.ImageReader;
import javax.imageio.ImageWriteParam;
import javax.imageio.ImageWriter;
import javax.imageio.stream.ImageInputStream;
import javax.imageio.stream.MemoryCacheImageOutputStream;
import org.springframework.http.HttpStatus;

/**
 * Checks an uploaded photo and turns it into the JPEG that is stored. The file's name and declared
 * type are never trusted: the bytes must start like a JPEG or PNG and decode as one. The size in
 * pixels is read from the header before decoding, so a small file that claims to be a huge image
 * is refused without using the memory, and a big photo is decoded at a fraction of its size (every
 * n-th pixel), so one upload never needs more than about 40 MB. The stored copy is re-encoded (camera metadata such as GPS
 * position is not copied) and at most {@link #MAX_SIDE} px on its long side.
 */
public final class PhotoImages {
  public static final int MAX_SIDE = 1600;
  /** Larger than any phone camera; protects the decoder. */
  static final int MAX_INPUT_SIDE = 12_000;

  static final long MAX_INPUT_PIXELS = 50_000_000L;

  private PhotoImages() {}

  public record Jpeg(byte[] bytes, int width, int height) {}

  private static FieldException bad(String message) {
    return new FieldException(HttpStatus.BAD_REQUEST, "file", message);
  }

  static boolean looksLikeJpegOrPng(byte[] b) {
    boolean jpeg = b.length > 3 && (b[0] & 0xff) == 0xff && (b[1] & 0xff) == 0xd8 && (b[2] & 0xff) == 0xff;
    boolean png =
        b.length > 8
            && (b[0] & 0xff) == 0x89
            && b[1] == 'P'
            && b[2] == 'N'
            && b[3] == 'G'
            && b[4] == 0x0d
            && b[5] == 0x0a
            && b[6] == 0x1a
            && b[7] == 0x0a;
    return jpeg || png;
  }

  /**
   * Read every n-th pixel of a big photo: enough to leave at least {@link #MAX_SIDE} px on the long
   * side (so the final shrink still has detail to work with), but less than twice that.
   */
  static int subsampling(int w, int h) {
    return Math.max(1, Math.max(w, h) / MAX_SIDE);
  }

  public static Jpeg toStoredJpeg(byte[] upload) {
    if (!looksLikeJpegOrPng(upload)) {
      throw bad("use a JPEG or PNG photo");
    }
    BufferedImage image;
    try (ImageInputStream in = ImageIO.createImageInputStream(new ByteArrayInputStream(upload))) {
      if (in == null) {
        throw bad("this file could not be read as a photo");
      }
      Iterator<ImageReader> readers = ImageIO.getImageReaders(in);
      if (!readers.hasNext()) {
        throw bad("this file could not be read as a photo");
      }
      ImageReader reader = readers.next();
      try {
        String format = reader.getFormatName().toLowerCase(Locale.ROOT);
        if (!format.equals("jpeg") && !format.equals("png")) {
          throw bad("use a JPEG or PNG photo");
        }
        reader.setInput(in, true, true);
        int w = reader.getWidth(0);
        int h = reader.getHeight(0);
        if (w < 1 || h < 1 || w > MAX_INPUT_SIDE || h > MAX_INPUT_SIDE || (long) w * h > MAX_INPUT_PIXELS) {
          throw bad("this photo is too large in pixels (at most " + MAX_INPUT_SIDE + " px a side)");
        }
        ImageReadParam param = reader.getDefaultReadParam();
        int step = subsampling(w, h);
        param.setSourceSubsampling(step, step, 0, 0);
        image = reader.read(0, param);
      } finally {
        reader.dispose();
      }
    } catch (IOException | RuntimeException e) {
      if (e instanceof FieldException fe) {
        throw fe;
      }
      throw bad("this file could not be read as a photo");
    }
    return encode(image);
  }

  private static Jpeg encode(BufferedImage source) {
    double scale = Math.min(1.0, (double) MAX_SIDE / Math.max(source.getWidth(), source.getHeight()));
    int w = Math.max(1, (int) Math.round(source.getWidth() * scale));
    int h = Math.max(1, (int) Math.round(source.getHeight() * scale));
    BufferedImage rgb = new BufferedImage(w, h, BufferedImage.TYPE_INT_RGB);
    Graphics2D g = rgb.createGraphics();
    try {
      // Transparent PNG areas become white, not black.
      g.setColor(Color.WHITE);
      g.fillRect(0, 0, w, h);
      g.setRenderingHint(RenderingHints.KEY_INTERPOLATION, RenderingHints.VALUE_INTERPOLATION_BILINEAR);
      g.setRenderingHint(RenderingHints.KEY_RENDERING, RenderingHints.VALUE_RENDER_QUALITY);
      g.drawImage(source, 0, 0, w, h, null);
    } finally {
      g.dispose();
    }
    ImageWriter writer = ImageIO.getImageWritersByFormatName("jpeg").next();
    ByteArrayOutputStream out = new ByteArrayOutputStream();
    try (MemoryCacheImageOutputStream stream = new MemoryCacheImageOutputStream(out)) {
      writer.setOutput(stream);
      ImageWriteParam param = writer.getDefaultWriteParam();
      param.setCompressionMode(ImageWriteParam.MODE_EXPLICIT);
      param.setCompressionQuality(0.85f);
      writer.write(null, new IIOImage(rgb, null, null), param);
    } catch (IOException e) {
      throw new IllegalStateException("JPEG encoding failed", e);
    } finally {
      writer.dispose();
    }
    return new Jpeg(out.toByteArray(), w, h);
  }
}
