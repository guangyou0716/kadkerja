package dev.kadkerja.photo;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import dev.kadkerja.staff.FieldException;
import java.awt.image.BufferedImage;
import java.nio.charset.StandardCharsets;
import java.util.Arrays;
import org.junit.jupiter.api.Test;

class PhotoImagesTest {
  private static boolean isJpeg(byte[] b) {
    return (b[0] & 0xff) == 0xff && (b[1] & 0xff) == 0xd8;
  }

  @Test
  void aLargePhotoIsStoredAsAJpegOfAtMost1600PxKeepingItsShape() {
    var stored = PhotoImages.toStoredJpeg(TestImages.png(3200, 1200));
    assertThat(isJpeg(stored.bytes())).isTrue();
    assertThat(stored.width()).isEqualTo(1600);
    assertThat(stored.height()).isEqualTo(600);
    BufferedImage back = TestImages.read(stored.bytes());
    assertThat(back.getWidth()).isEqualTo(1600);
    assertThat(back.getHeight()).isEqualTo(600);
  }

  @Test
  void aBigPhotoIsDecodedAtAFractionOfItsSizeAndStillEndsAt1600Px() {
    assertThat(PhotoImages.subsampling(1600, 1200)).isEqualTo(1);
    assertThat(PhotoImages.subsampling(3199, 2000)).isEqualTo(1);
    assertThat(PhotoImages.subsampling(3200, 2400)).isEqualTo(2);
    assertThat(PhotoImages.subsampling(6000, 8000)).isEqualTo(5);
    assertThat(PhotoImages.subsampling(12_000, 4000)).isEqualTo(7);
    var stored = PhotoImages.toStoredJpeg(TestImages.png(4801, 1200));
    assertThat(stored.width()).isEqualTo(1600);
    assertThat(stored.height()).isEqualTo(400);
  }

  @Test
  void aSmallPhotoKeepsItsSize() {
    var stored = PhotoImages.toStoredJpeg(TestImages.jpeg(640, 480));
    assertThat(stored.width()).isEqualTo(640);
    assertThat(stored.height()).isEqualTo(480);
  }

  @Test
  void cameraMetadataIsNotCopied() {
    byte[] upload = TestImages.jpegWithMetadata(400, 300, "GPS 5.3541N 100.3329E TEST-MARKER");
    assertThat(new String(upload, StandardCharsets.ISO_8859_1)).contains("TEST-MARKER");
    var stored = PhotoImages.toStoredJpeg(upload);
    assertThat(new String(stored.bytes(), StandardCharsets.ISO_8859_1)).doesNotContain("TEST-MARKER").doesNotContain("Exif");
  }

  @Test
  void transparentAreasBecomeWhite() {
    var img = new BufferedImage(10, 10, BufferedImage.TYPE_INT_ARGB);
    var out = new java.io.ByteArrayOutputStream();
    try {
      javax.imageio.ImageIO.write(img, "png", out);
    } catch (java.io.IOException e) {
      throw new AssertionError(e);
    }
    var stored = PhotoImages.toStoredJpeg(out.toByteArray());
    int rgb = TestImages.read(stored.bytes()).getRGB(5, 5) & 0xffffff;
    assertThat(rgb).isGreaterThan(0xf0f0f0);
  }

  @Test
  void onlyRealJpegOrPngBytesAreAccepted() {
    byte[] gif = {'G', 'I', 'F', '8', '9', 'a', 1, 0, 1, 0, 0, 0, 0};
    byte[] html = "<html><script>alert(1)</script></html>".getBytes(StandardCharsets.UTF_8);
    byte[] jpegMagicOnly = {(byte) 0xff, (byte) 0xd8, (byte) 0xff, (byte) 0xe0, 0, 16, 'J', 'F', 'I', 'F'};
    byte[] png = TestImages.png(50, 50);
    byte[] truncatedPng = Arrays.copyOf(png, 40);
    for (byte[] bad : new byte[][] {gif, html, jpegMagicOnly, truncatedPng, new byte[0]}) {
      assertThatThrownBy(() -> PhotoImages.toStoredJpeg(bad))
          .isInstanceOf(FieldException.class)
          .satisfies(e -> assertThat(((FieldException) e).field()).isEqualTo("file"));
    }
  }

  @Test
  void aPhotoTooLargeInPixelsIsRefusedBeforeDecoding() {
    // 12,001 x 1 px: a tiny file whose header asks for more than any phone camera makes.
    assertThatThrownBy(() -> PhotoImages.toStoredJpeg(TestImages.png(PhotoImages.MAX_INPUT_SIDE + 1, 1)))
        .isInstanceOf(FieldException.class)
        .hasMessageContaining("too large in pixels");
    assertThat(PhotoImages.toStoredJpeg(TestImages.png(PhotoImages.MAX_INPUT_SIDE, 1)).width()).isEqualTo(1600);
  }
}
