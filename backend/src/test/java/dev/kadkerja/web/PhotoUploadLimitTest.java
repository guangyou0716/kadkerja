package dev.kadkerja.web;

import static org.assertj.core.api.Assertions.assertThat;

import dev.kadkerja.staff.Role;
import dev.kadkerja.staff.StaffUser;
import dev.kadkerja.staff.StaffUserRepository;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.crypto.password.PasswordEncoder;

/**
 * The upload limit is enforced by the real web server (MockMvc skips it), so this test signs in
 * over HTTP and sends a photo that is too big.
 */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
class PhotoUploadLimitTest {
  @LocalServerPort int port;
  @Autowired StaffUserRepository users;
  @Autowired PasswordEncoder encoder;
  @Autowired JdbcTemplate jdbc;

  /** A tiny cookie jar (java.net's CookieManager does not keep cookies for "localhost"). */
  private final java.util.Map<String, String> cookies = new java.util.LinkedHashMap<>();
  private final HttpClient http = HttpClient.newHttpClient();

  private <T> HttpResponse<T> send(HttpRequest.Builder b, HttpResponse.BodyHandler<T> handler) throws Exception {
    if (!cookies.isEmpty()) {
      b.header(
          "Cookie",
          String.join("; ", cookies.entrySet().stream().map(e -> e.getKey() + "=" + e.getValue()).toList()));
    }
    HttpResponse<T> res = http.send(b.build(), handler);
    for (String c : res.headers().allValues("set-cookie")) {
      String pair = c.split(";", 2)[0];
      int eq = pair.indexOf('=');
      String value = pair.substring(eq + 1);
      if (value.isEmpty()) {
        cookies.remove(pair.substring(0, eq));
      } else {
        cookies.put(pair.substring(0, eq), value);
      }
    }
    return res;
  }

  private URI url(String path) {
    return URI.create("http://localhost:" + port + path);
  }

  private String xsrf() {
    return cookies.get("XSRF-TOKEN");
  }

  private HttpResponse<String> json(String method, String path, String body) throws Exception {
    return send(
        HttpRequest.newBuilder(url(path))
            .method(method, HttpRequest.BodyPublishers.ofString(body))
            .header("Content-Type", "application/json")
            .header("X-XSRF-TOKEN", xsrf()),
        HttpResponse.BodyHandlers.ofString());
  }

  @Test
  void aPhotoOverFourMegabytesIsRefusedWith413() throws Exception {
    if (users.findByUsername("limit-advisor").isEmpty()) {
      users.save(new StaffUser("limit-advisor", "Limit Advisor", encoder.encode("correct horse battery"), Role.ADVISOR));
    }
    send(HttpRequest.newBuilder(url("/api/auth/csrf")), HttpResponse.BodyHandlers.ofString());
    assertThat(json("POST", "/api/auth/login", "{\"username\":\"limit-advisor\",\"password\":\"correct horse battery\"}").statusCode())
        .isEqualTo(200);
    // Signing in replaces the CSRF token (as the web app does, ask for the new one).
    send(HttpRequest.newBuilder(url("/api/auth/csrf")), HttpResponse.BodyHandlers.ofString());
    HttpResponse<String> job =
        json(
            "POST",
            "/api/jobs",
            "{\"customerName\":\"Test Owner\",\"phone\":\"012-0000009\",\"plate\":\"BIG 1\",\"make\":\"Perodua\","
                + "\"model\":\"Bezza\",\"complaint\":\"Dent\"}");
    assertThat(job.statusCode()).isEqualTo(201);
    String id = job.body().replaceAll("^\\{\"id\":(\\d+).*$", "$1");

    byte[] big = new byte[4 * 1024 * 1024 + 100];
    big[0] = (byte) 0xff;
    big[1] = (byte) 0xd8;
    big[2] = (byte) 0xff;
    String boundary = "----kadkerja-test";
    List<byte[]> parts = new ArrayList<>();
    parts.add(("--" + boundary + "\r\nContent-Disposition: form-data; name=\"stage\"\r\n\r\nBEFORE\r\n").getBytes(StandardCharsets.UTF_8));
    parts.add(
        ("--" + boundary + "\r\nContent-Disposition: form-data; name=\"file\"; filename=\"big.jpg\"\r\n"
                + "Content-Type: image/jpeg\r\n\r\n")
            .getBytes(StandardCharsets.UTF_8));
    parts.add(big);
    parts.add(("\r\n--" + boundary + "--\r\n").getBytes(StandardCharsets.UTF_8));
    HttpResponse<String> res =
        send(
            HttpRequest.newBuilder(url("/api/jobs/" + id + "/photos"))
                .POST(HttpRequest.BodyPublishers.ofByteArrays(parts))
                .header("Content-Type", "multipart/form-data; boundary=" + boundary)
                .header("X-XSRF-TOKEN", xsrf()),
            HttpResponse.BodyHandlers.ofString());
    assertThat(res.statusCode()).isEqualTo(413);
    assertThat(res.body()).contains("this photo is too big (at most 4 MB)");
    assertThat(jdbc.queryForObject("select count(*) from job_photo where job_card_id = ?", Integer.class, Long.parseLong(id)))
        .isZero();
  }
}
