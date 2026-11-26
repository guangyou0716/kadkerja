package dev.kadkerja.staff;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayDeque;
import java.util.Deque;
import java.util.concurrent.ConcurrentHashMap;
import org.springframework.stereotype.Component;

/**
 * Slows down password guessing: after 5 failed sign-ins for one username from one address, or
 * 20 from one address for any usernames, sign-in from there is refused for 15 minutes (even
 * with the right password). In memory, one server.
 */
@Component
public class LoginThrottle {
  static final int PER_USER = 5;
  static final int PER_ADDRESS = 20;
  static final Duration WINDOW = Duration.ofMinutes(15);
  private static final int MAX_KEYS = 10_000;

  private final Clock clock;
  private final ConcurrentHashMap<String, Deque<Instant>> failures = new ConcurrentHashMap<>();

  public LoginThrottle(Clock clock) {
    this.clock = clock;
  }

  private static String userKey(String username, String address) {
    return "u:" + username + "|" + address;
  }

  private static String addressKey(String address) {
    return "a:" + address;
  }

  public boolean blocked(String username, String address) {
    return recent(userKey(username, address)) >= PER_USER
        || recent(addressKey(address)) >= PER_ADDRESS;
  }

  public void failed(String username, String address) {
    if (failures.size() > MAX_KEYS) {
      failures.keySet().removeIf(k -> recent(k) == 0);
    }
    Instant now = clock.instant();
    for (String key : new String[] {userKey(username, address), addressKey(address)}) {
      failures.compute(
          key,
          (k, q) -> {
            Deque<Instant> d = q == null ? new ArrayDeque<>() : q;
            d.addLast(now);
            return d;
          });
    }
  }

  /** A good sign-in clears that user's failures from that address (not the address total). */
  public void succeeded(String username, String address) {
    failures.remove(userKey(username, address));
  }

  private int recent(String key) {
    Instant cutoff = clock.instant().minus(WINDOW);
    Deque<Instant> d =
        failures.computeIfPresent(
            key,
            (k, q) -> {
              while (!q.isEmpty() && !q.peekFirst().isAfter(cutoff)) {
                q.pollFirst();
              }
              return q.isEmpty() ? null : q;
            });
    return d == null ? 0 : d.size();
  }
}
