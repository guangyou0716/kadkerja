package dev.kadkerja.web;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.time.Clock;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.AtomicInteger;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

/**
 * For the public customer links only: a per-client limit per minute (reads and answers counted
 * separately) and headers that keep the token out of caches, referrers and search engines.
 *
 * <p>The client is the connection's remote address. Behind a reverse proxy, configure Spring's
 * forwarded-header support so this is the real client and not the proxy. In memory, one
 * instance: enough for one small workshop server.
 */
@Component
public class PublicRateLimit extends OncePerRequestFilter {
  static final String PREFIX = "/api/public/";
  private static final int MAX_CLIENTS = 10_000;

  private final Clock clock;
  private final int readsPerMinute;
  private final int answersPerMinute;
  private final ConcurrentHashMap<String, Window> windows = new ConcurrentHashMap<>();

  public PublicRateLimit(
      Clock clock,
      @Value("${kadkerja.public.reads-per-minute:60}") int readsPerMinute,
      @Value("${kadkerja.public.answers-per-minute:10}") int answersPerMinute) {
    this.clock = clock;
    this.readsPerMinute = readsPerMinute;
    this.answersPerMinute = answersPerMinute;
  }

  private record Window(long minute, AtomicInteger count) {}

  @Override
  protected boolean shouldNotFilter(HttpServletRequest request) {
    return !request.getRequestURI().startsWith(PREFIX);
  }

  @Override
  protected void doFilterInternal(
      HttpServletRequest request, HttpServletResponse response, FilterChain chain)
      throws ServletException, IOException {
    response.setHeader("Cache-Control", "no-store");
    response.setHeader("Referrer-Policy", "no-referrer");
    response.setHeader("X-Robots-Tag", "noindex");
    boolean write = !"GET".equals(request.getMethod()) && !"HEAD".equals(request.getMethod());
    int limit = write ? answersPerMinute : readsPerMinute;
    String key = (write ? "w:" : "r:") + request.getRemoteAddr();
    if (!allow(key, limit)) {
      long secondsLeft = 60 - (clock.millis() / 1000) % 60;
      response.setStatus(429);
      response.setHeader("Retry-After", Long.toString(secondsLeft));
      response.setContentType("application/problem+json");
      response
          .getWriter()
          .write(
              "{\"type\":\"about:blank\",\"title\":\"Too many requests\",\"status\":429,"
                  + "\"detail\":\"Too many requests from your connection. Wait a minute and try again.\"}");
      return;
    }
    chain.doFilter(request, response);
  }

  boolean allow(String key, int limit) {
    long minute = clock.millis() / 60_000;
    if (windows.size() > MAX_CLIENTS) {
      windows.values().removeIf(w -> w.minute() < minute);
    }
    Window w =
        windows.compute(
            key,
            (k, old) -> old == null || old.minute() != minute ? new Window(minute, new AtomicInteger()) : old);
    return w.count().incrementAndGet() <= limit;
  }
}
