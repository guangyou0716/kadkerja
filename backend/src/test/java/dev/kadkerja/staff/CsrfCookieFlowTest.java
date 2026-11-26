package dev.kadkerja.staff;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.jayway.jsonpath.JsonPath;
import jakarta.servlet.http.Cookie;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.mock.web.MockHttpSession;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;

/**
 * The browser's way, step by step, with no test shortcuts for CSRF: get the token cookie, sign
 * in sending it back as a header, get a fresh token for the session, make a change. Own Spring
 * context (the property below) so no other test's CSRF test helpers are in play.
 */
@SpringBootTest(properties = "kadkerja.test-context=csrf-cookie-flow")
@AutoConfigureMockMvc
class CsrfCookieFlowTest {
  @Autowired MockMvc mvc;
  @Autowired JdbcTemplate jdbc;
  @Autowired StaffUserRepository users;
  @Autowired PasswordEncoder encoder;

  private record Token(Cookie cookie, String value) {}

  private Token token(MockHttpSession s) throws Exception {
    var req = get("/api/auth/csrf");
    if (s != null) {
      req = req.session(s);
    }
    MvcResult r = mvc.perform(req).andExpect(status().isOk()).andReturn();
    Cookie c = r.getResponse().getCookie("XSRF-TOKEN");
    assertThat(c).isNotNull();
    assertThat(c.isHttpOnly()).isFalse(); // the web app has to read it
    String v = JsonPath.read(r.getResponse().getContentAsString(), "$.token");
    assertThat(c.getValue()).isEqualTo(v);
    assertThat(JsonPath.<String>read(r.getResponse().getContentAsString(), "$.headerName")).isEqualTo("X-XSRF-TOKEN");
    return new Token(c, v);
  }

  @Test
  void signInAndChangeWithTheCookieToken() throws Exception {
    for (String table :
        new String[] {"status_event", "quote_line", "job_card", "vehicle", "customer", "staff_user"}) {
      jdbc.update("delete from " + table);
    }
    users.save(new StaffUser("advisor", "Test Advisor", encoder.encode("correct horse battery"), Role.ADVISOR));

    Token t1 = token(null);
    MvcResult login =
        mvc.perform(
                post("/api/auth/login")
                    .cookie(t1.cookie())
                    .header("X-XSRF-TOKEN", t1.value())
                    .contentType(MediaType.APPLICATION_JSON)
                    .content("{\"username\":\"advisor\",\"password\":\"correct horse battery\"}"))
            .andExpect(status().isOk())
            .andReturn();
    // Signing in clears the old token cookie; the app fetches a new one.
    Cookie cleared = login.getResponse().getCookie("XSRF-TOKEN");
    assertThat(cleared).isNotNull();
    assertThat(cleared.getMaxAge()).isZero();
    MockHttpSession s = (MockHttpSession) login.getRequest().getSession(false);

    Token t2 = token(s);
    assertThat(t2.value()).isNotEqualTo(t1.value());
    mvc.perform(
            post("/api/jobs")
                .session(s)
                .cookie(t2.cookie())
                .header("X-XSRF-TOKEN", t2.value())
                .contentType(MediaType.APPLICATION_JSON)
                .content(
                    """
                    {"customerName":"Test Owner","phone":"012-0000009","plate":"CSRF 1","make":"Perodua",
                     "model":"Bezza","complaint":"Noise"}
                    """))
        .andExpect(status().isCreated());
    // Header missing while the cookie is there: refused.
    mvc.perform(post("/api/auth/logout").session(s).cookie(t2.cookie())).andExpect(status().isForbidden());
  }
}
