package dev.kadkerja.photo;

import java.time.Instant;

/** A photo without its bytes (what the job card lists). */
public record PhotoInfo(
    long id,
    String publicKey,
    PhotoStage stage,
    int width,
    int height,
    int sizeBytes,
    String caption,
    Instant at,
    String by) {}
