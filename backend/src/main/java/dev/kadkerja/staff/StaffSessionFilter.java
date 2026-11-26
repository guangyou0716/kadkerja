package dev.kadkerja.staff;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import jakarta.servlet.http.HttpSession;
import java.io.IOException;
import org.springframework.security.authentication.AnonymousAuthenticationToken;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.filter.OncePerRequestFilter;

/**
 * Ends a signed-in session whose account has since been deactivated or given a new password (or
 * deleted): the session forgets who it was, so staff pages answer 401 and the app shows the
 * sign-in form. The customer link keeps working in the same browser.
 */
public class StaffSessionFilter extends OncePerRequestFilter {
  /** Session attribute: the account's session_epoch at sign-in. */
  public static final String EPOCH = "kadkerja.staff-epoch";

  private final StaffUserRepository users;

  public StaffSessionFilter(StaffUserRepository users) {
    this.users = users;
  }

  @Override
  protected void doFilterInternal(
      HttpServletRequest req, HttpServletResponse res, FilterChain chain)
      throws ServletException, IOException {
    HttpSession session = req.getSession(false);
    if (session != null && session.getAttribute(EPOCH) instanceof Integer epoch) {
      Authentication a = SecurityContextHolder.getContext().getAuthentication();
      if (a != null && !(a instanceof AnonymousAuthenticationToken)) {
        boolean current =
            users
                .findByUsername(a.getName())
                .filter(u -> u.isActive() && u.getSessionEpoch() == epoch)
                .isPresent();
        if (!current) {
          session.invalidate();
          SecurityContextHolder.clearContext();
        }
      }
    }
    chain.doFilter(req, res);
  }
}
